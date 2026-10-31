import {useEffect,useMemo,useState} from "react";
import {backendClient} from "@/integrations/backend/databaseClient";
import {examineBatchRows,checkedBatchIndexes,makeUrbanBatchStaging,
  type BatchUrbanPackage} from "@/lib/urbanBatchReview";

type Props={
 municipalityId:string;file:File;reviewPackage:BatchUrbanPackage;
 qaWriteEnabled:boolean;canEdit:boolean;onOpenRow:(index:number)=>void;
};
type SavedBatch={id:string;version:number;document_title:string;total_rows:number;
 reviewed_rows:number;status:string;created_at:string};
const MAX_PDF_BYTES=100*1024*1024;
async function checkLocalPdf(file:File,expectedHash:string){
 if(file.size<5||file.size>MAX_PDF_BYTES||!/\.pdf$/i.test(file.name))
  throw Error("PDF original ausente ou inválido.");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")throw Error("Assinatura do PDF inválida.");
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
  .map(b=>b.toString(16).padStart(2,"0")).join("");
 if(hash!==expectedHash)throw Error("O PDF não corresponde ao pacote JSON (SHA-256). Nenhuma linha foi salva.");
}
export function UrbanMatrixBatchReviewBoard({
 municipalityId,file,reviewPackage,qaWriteEnabled,canEdit,onOpenRow
}:Props){
 const [attested,setAttested]=useState(false);
 const [checked,setChecked]=useState<number[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [history,setHistory]=useState<SavedBatch[]>([]);
 const [historyChecked,setHistoryChecked]=useState(false);
 const [historyError,setHistoryError]=useState(false);
 useEffect(()=>{
  let live=true;
  setHistory([]);setHistoryChecked(false);setHistoryError(false);
  if(!qaWriteEnabled||!backendClient)return()=>{live=false;};
  void backendClient.rpc("list_urban_matrix_batch_staging_v1",{
    _municipality_id:municipalityId
  }).then(({data,error}:{data:unknown;error:unknown})=>{
    if(!live)return;
    setHistoryChecked(true);
    if(error||!Array.isArray(data)){setHistoryError(true);return;}
    setHistory(data as SavedBatch[]);
  }).catch(()=>{if(live){setHistoryChecked(true);setHistoryError(true);}});
  return()=>{live=false;};
 },[municipalityId,qaWriteEnabled]);
 const statuses=useMemo(()=>examineBatchRows(reviewPackage.quadro_I),[reviewPackage]);
 const eligible=useMemo(()=>statuses.filter(x=>x.bulkEligible),[statuses]);
 const pending=useMemo(()=>statuses.filter(x=>!x.bulkEligible),[statuses]);
 const reviewed=useMemo(()=>checkedBatchIndexes(checked,statuses),[checked,statuses]);
 const sameCount=reviewed.length===eligible.length&&eligible.length>0;
 const save=async()=>{
  if(busy||!canEdit||!qaWriteEnabled||!backendClient||!municipalityId){
   setNotice("Gravação disponível somente em homologação Neon QA autorizada.");return;
  }
  if(checked.length>0&&!attested){
   setNotice("Declare a revisão humana antes de confirmar linhas.");return;
  }
  if(!window.confirm("Arquivar as "+reviewPackage.quadro_I.length+
    " linhas no Neon QA como ACERVO HISTÓRICO PENDENTE DE VIGÊNCIA? "+
    reviewed.length+" linhas têm declaração de conferência. Nenhuma norma será ativada."))return;
  setBusy(true);setNotice("");
  try{
   await checkLocalPdf(file,reviewPackage.arquivo_sha256);
   const payload=makeUrbanBatchStaging(reviewPackage,reviewed);
   const saved=await backendClient.rpc("save_urban_matrix_batch_staging_v1",{
    _municipality_id:municipalityId,_document_title:file.name.slice(0,180),...payload
   });
   if(saved.error)throw Error("Falha no Neon QA: "+saved.error.message);
   const receipt=saved.data as {id?:string;version?:number;rows?:number;reviewed?:number}|null;
   if(!receipt?.id)throw Error("Banco não confirmou o lote. Verifique o histórico antes de repetir.");
   setNotice("Lote histórico QA versão "+receipt.version+": "+
    receipt.rows+" linhas arquivadas; "+receipt.reviewed+
    " declaradas conferidas. Vigência pendente; nenhuma regra ativa.");
   const opened=await backendClient.rpc("list_urban_matrix_batch_staging_v1",{
    _municipality_id:municipalityId
   });
   if(opened.error||!Array.isArray(opened.data))
    throw Error("Gravação confirmada, mas a reabertura do histórico falhou. Não envie novamente.");
   setHistory(opened.data as SavedBatch[]);
  }catch(e){setNotice(e instanceof Error?e.message:"Falha no arquivo em lote.");}
  finally{setBusy(false);}
 };
 return <section data-urban-batch-review="true"
   className="mt-5 overflow-hidden rounded-2xl border border-sky-300 bg-white text-slate-950 shadow-sm">
  <header data-urban-batch-header="true" className="border-b border-slate-700 bg-slate-950 p-4 text-white">
   <p className="text-xs font-extrabold uppercase tracking-widest text-sky-200">Quadro I · revisão em lote</p>
   <h5 className="mt-1 text-lg font-extrabold text-white">Matriz completa — {statuses.length} linhas</h5>
   <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">
    Confira a tabela como um conjunto, sem preencher 13 campos em cada linha.
    Dados da lei original; nenhuma vigência, exceção ou permissão é presumida.
    O Quadro II precisa de um pacote próprio.
   </p>
  </header>
  <div className="p-4">
   <div className="grid gap-2 sm:grid-cols-3">
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
     <span className="block text-xs font-bold text-sky-950">Linhas no pacote</span>
     <strong className="block text-2xl font-extrabold text-slate-950">{statuses.length}</strong>
    </div>
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
     <span className="block text-xs font-bold text-emerald-950">Linhas marcadas (declaração)</span>
     <strong className="block text-2xl font-extrabold text-emerald-950">{reviewed.length}</strong>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
     <span className="block text-xs font-bold text-amber-950">Análise individual</span>
     <strong className="block text-2xl font-extrabold text-amber-950">{statuses.length-eligible.length}</strong>
    </div>
   </div>
   <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-950">
    <input type="checkbox" aria-label="Conferi as linhas do lote no PDF" checked={attested}
      onChange={e=>{setAttested(e.target.checked);setChecked([]);}}
      className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
    Conferi pessoalmente os cabeçalhos, as linhas e os valores no PDF oficial.
    A seleção em lote não confirma a vigência nem dispensa revisão das exceções
    e alterações posteriores.
   </label>
   <div className="mt-3 flex flex-wrap gap-2" data-urban-batch-bulk-actions="true">
    <button type="button" data-urban-batch-check-eligible="true" data-sigapro-contrast="dark"
      disabled={!attested||!eligible.length||sameCount}
      onClick={()=>setChecked(eligible.map(x=>x.index))}
      className="min-h-11 rounded-lg border border-sky-900 bg-sky-900 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-600">
      {sameCount?"✓ Todas as elegíveis marcadas":"Marcar linhas sem pendências ("+eligible.length+")"}
    </button>
    <button type="button" data-urban-batch-uncheck="true"
      disabled={!checked.length} onClick={()=>setChecked([])}
      className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
      Desmarcar todas
    </button>
   </div>
   <p className="mt-2 text-xs font-semibold leading-5 text-amber-950">
    Linhas com leitura pendente, exceções, valores não numéricos ou zona/uso repetidos
    são excluídas da seleção em lote. Todas permanecem no arquivo histórico.
   </p>
   {pending.length>0?<section data-urban-batch-individual-review="true"
     className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-950">
     <h6 className="text-base font-extrabold text-amber-950">
       Conferência individual obrigatória — {pending.length} linhas
     </h6>
     <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
       Estas linhas ficam no acervo histórico, mas NÃO são aprovadas automaticamente.
       Compare cada dado com o PDF original, suas observações e alterações legislativas.
       A abertura abaixo não modifica a marcação nem grava regra vigente.
     </p>
     <div className="mt-3 grid gap-3 lg:grid-cols-2">
       {pending.map(row=>{
        const original=reviewPackage.quadro_I[row.index];
        return <article key={row.index} data-urban-batch-pending-index={row.index}
          className="min-w-0 rounded-lg border border-amber-200 bg-white p-3 text-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold text-slate-950">{row.zone} · {row.use}</p>
              <p className="text-xs font-semibold text-slate-700">Linha {row.index+1} · página {row.page} do PDF</p>
            </div>
            <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">
              Pendente
            </span>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-900">
            C.A. mínimo: {original.ca_minimo_original??"não verificado"} ·
            C.A. básico: {original.ca_basico_original} · máximo: {original.ca_maximo_original}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-800">
            Recuos de origem (m): frente {original.recuo_frontal_m}, fundos {original.recuo_fundos_m},
            lateral {String(original.recuo_lateral_m)}
          </p>
          {original.observacoes_especificas?<p className="mt-2 text-xs font-semibold leading-5 text-amber-950">
            Observação do documento: {original.observacoes_especificas}
          </p>:null}
          {original.pendencias_de_leitura?<p className="mt-2 text-xs font-extrabold leading-5 text-rose-900">
            Leitura não comprovada: {original.pendencias_de_leitura}
          </p>:null}
          <ul className="mt-2 list-inside list-disc text-xs font-semibold leading-5 text-slate-700">
            {row.issues.map((issue,i)=><li key={i}>{issue}</li>)}
          </ul>
          <button type="button" onClick={()=>onOpenRow(row.index)}
            className="mt-3 min-h-10 rounded-lg border border-sky-900 bg-sky-900 px-3 py-2 text-xs font-extrabold text-white">
            Abrir linha para conferir no PDF
          </button>
        </article>;
       })}
     </div>
   </section>:null}
   <div className="mt-4 max-h-[440px] overflow-auto rounded-xl border border-slate-200"
     role="region" aria-label="Tabela completa de zonas e usos do Quadro I">
    <table className="w-full min-w-[700px] border-collapse text-left text-sm">
     <thead className="sticky top-0 bg-slate-100 text-slate-950">
      <tr><th scope="col" className="p-3">Marcada</th><th scope="col" className="p-3">Página</th>
       <th scope="col" className="p-3">Zona / uso</th><th scope="col" className="p-3">Situação</th>
       <th scope="col" className="p-3">Detalhes</th></tr>
     </thead>
     <tbody>{statuses.map(row=><tr key={row.index} data-urban-batch-row={row.index}
       className="border-t border-slate-200 bg-white text-slate-950">
      <td className="p-3"><input type="checkbox"
       aria-label={"Conferi a linha "+(row.index+1)+" do lote"}
       disabled={!attested||!row.bulkEligible} checked={reviewed.includes(row.index)}
       onChange={e=>setChecked(previous=>e.target.checked?
        [...previous,row.index]:previous.filter(i=>i!==row.index))}
       className="h-4 w-4 accent-sky-800"/></td>
      <td className="p-3 font-bold">{row.page}</td>
      <td className="p-3 font-semibold">
       <span className="block font-extrabold">{row.zone}</span>{row.use}
      </td>
      <td className="p-3">
       {row.issues.length?<span className="text-xs font-bold text-amber-950" title={row.issues.join("; ")}>
        Análise individual: {row.issues[0]}
       </span>:reviewed.includes(row.index)?
       <span className="text-xs font-extrabold text-emerald-900">
        Marcada após declaração · vigência pendente
       </span>:
       <span className="text-xs font-semibold text-slate-700">Aguardando conferência</span>}
      </td>
      <td className="p-3"><button type="button" onClick={()=>onOpenRow(row.index)}
        className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-950">
        Abrir linha
      </button></td>
     </tr>)}</tbody>
    </table>
   </div>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
    <div>
     <p className="text-sm font-extrabold text-sky-950">Arquivar matriz histórica no Neon QA</p>
     <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-700">
      Guarda todas as {statuses.length} linhas de origem em uma versão separada por prefeitura.
      Não cria regra vigente, alvará, pagamento ou aprovação.
     </p>
    </div>
    <button type="button" data-urban-batch-stage-save="true" data-sigapro-contrast="dark"
      disabled={busy||!qaWriteEnabled}
      onClick={()=>void save()}
      className="min-h-11 rounded-lg border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-700">
      {busy?"Arquivando lote…":"Salvar lote histórico como rascunho QA"}
    </button>
   </div>
   {!qaWriteEnabled?<p role="alert" className="mt-2 text-sm font-bold text-amber-950">
    Gravação bloqueada fora do ambiente Preview ligado ao Neon QA isolado.
   </p>:null}
   {notice?<p data-urban-batch-message="true" role="status"
      className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950">{notice}</p>:null}
   {historyChecked && historyError?<p role="alert"
     className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950">
     Histórico de lotes QA indisponível. Não conclua que os dados foram perdidos;
     verifique a conexão antes de tentar gravar novamente.
   </p>:null}
   {historyChecked&&!historyError&&history.length===0?<p className="mt-3 text-xs font-semibold text-slate-700">
     Nenhum lote deste documento foi localizado no histórico da prefeitura neste ambiente QA.
   </p>:null}
   {history.length>0?<details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
     <summary className="cursor-pointer font-bold text-sky-950">Lotes arquivados nesta prefeitura</summary>
     {history.map(h=><p key={h.id} className="mt-2 text-xs font-semibold text-slate-800">
      Versão {h.version} · {h.total_rows} linhas · {h.reviewed_rows} conferidas · {h.status}
     </p>)}
    </details>:null}
  </div>
 </section>;
}
