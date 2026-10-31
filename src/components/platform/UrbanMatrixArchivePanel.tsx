import { useCallback, useEffect, useState } from "react";
import { backendClient } from "@/integrations/backend/databaseClient";
import type { BatchUrbanRow } from "@/lib/urbanBatchReview";

export type UrbanStoredDraft = {
  id:string; municipality_id:string; document_title:string; document_sha256:string;
  source_municipality:string; source_rows:BatchUrbanRow[]; reviewed_indexes:number[];
  version:number; status:"pending_legal_review"; created_at:string;
};
type Summary = {id:string;version:number;document_title:string;document_sha256:string;
  total_rows:number;reviewed_rows:number;status:string;created_at:string};
type Props = { municipalityId:string;qaWriteEnabled:boolean;canEdit:boolean;reloadToken:number;
  file:File|null;onRestore:(draft:UrbanStoredDraft)=>Promise<void> };
const readableDate=(date:string)=>{
  const d=new Date(date);
  return Number.isFinite(d.getTime())?d.toLocaleString("pt-BR"):"Data não disponível";
};
/** Independent of the JSON upload, so saved drafts never disappear when the screen reloads. */
export function UrbanMatrixArchivePanel({municipalityId,qaWriteEnabled,canEdit,reloadToken,file,onRestore}:Props){
  const [history,setHistory]=useState<Summary[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [opened,setOpened]=useState<UrbanStoredDraft|null>(null);
  const [busyId,setBusyId]=useState("");
  const [notice,setNotice]=useState("");
  const refresh=useCallback(async()=>{
    if(!qaWriteEnabled||!municipalityId||!backendClient)return;
    setLoading(true);setError("");
    try{
      const {data,error:rpcError}=await backendClient.rpc("list_urban_matrix_batch_staging_v1",{
        _municipality_id:municipalityId
      });
      if(rpcError||!Array.isArray(data))throw Error("Histórico temporariamente indisponível no Neon QA.");
      setHistory(data as Summary[]);
    }catch(e){setError(e instanceof Error?e.message:"Falha na consulta do acervo.");}
    finally{setLoading(false);}
  },[municipalityId,qaWriteEnabled]);
  useEffect(()=>{setOpened(null);setHistory([]);setNotice("");void refresh();},[refresh]);
  useEffect(()=>{if(reloadToken>0){setOpened(null);void refresh();}},[reloadToken,refresh]);
  const open=async(id:string)=>{
    if(!canEdit||!qaWriteEnabled||busyId)return;
    setBusyId(id);setNotice("");
    try{
      const {data,error:rpcError}=await backendClient.rpc("get_urban_matrix_batch_staging_v1",{
        _municipality_id:municipalityId,_batch_id:id
      });
      if(rpcError||!data||data.id!==id||data.municipality_id!==municipalityId||
        data.status!=="pending_legal_review"||!Array.isArray(data.source_rows)||
        !Array.isArray(data.reviewed_indexes))throw Error("Não foi possível recuperar este lote do acervo QA.");
      setOpened(data as UrbanStoredDraft);
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível abrir o lote.");}
    finally{setBusyId("");}
  };
  return <section data-urban-archive-panel="true" className="mt-4 overflow-hidden rounded-2xl border border-sky-300 bg-white text-slate-950 shadow-sm">
    <header data-urban-archive-header="true" className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 px-4 py-4 text-white">
      <div>
        <h5 className="text-base font-extrabold text-white">Rascunhos históricos já salvos no Neon QA</h5>
        <p className="mt-1 text-sm font-medium text-sky-100">Aparecem mesmo sem reenviar o PDF ou JSON. Apenas leitura; nenhuma norma é ativada.</p>
      </div>
      <button type="button" data-sigapro-contrast="dark" disabled={loading||!qaWriteEnabled}
        onClick={()=>void refresh()} className="min-h-10 rounded-lg border border-sky-400 bg-sky-800 px-4 py-2 text-sm font-bold text-white">
        {loading?"Atualizando…":"Atualizar lista"}
      </button>
    </header>
    <div className="p-4">
      {!qaWriteEnabled?<p role="status" className="text-sm font-bold text-amber-900">Histórico QA indisponível fora da homologação isolada.</p>:null}
      {error?<p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-950">{error} Nenhum rascunho deve ser recriado antes de conferir a conexão.</p>:null}
      {qaWriteEnabled && !loading && !error && history.length===0?<p data-urban-archive-empty="true" className="text-sm font-semibold text-slate-800">Nenhum lote histórico arquivado para esta prefeitura neste ambiente.</p>:null}
      {history.length>0?<div data-urban-archive-history="true" className="space-y-3">
        <p className="text-sm font-bold text-slate-900">{history.length} versão(ões) recuperada(s) para esta prefeitura</p>
        {history.map(item=><article data-urban-archive-entry="true" key={item.id}
          className="rounded-xl border border-sky-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h6 className="break-words text-sm font-extrabold text-slate-950">{item.document_title} · versão {item.version}</h6>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {item.total_rows} linhas · {item.reviewed_rows} declaradas conferidas · {readableDate(item.created_at)}
              </p>
              <p className="mt-1 text-xs font-bold text-amber-900">Pendente de revisão legal — não é norma vigente</p>
            </div>
            <button type="button" data-sigapro-contrast="dark" disabled={!canEdit||Boolean(busyId)}
              onClick={()=>void open(item.id)}
              className="min-h-10 rounded-lg border border-sky-900 bg-sky-900 px-4 py-2 text-sm font-extrabold text-white">
              {busyId===item.id?"Abrindo…":"Abrir rascunho"}
            </button>
          </div>
        </article>)}
      </div>:null}
      {notice?<p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-900">{notice}</p>:null}
      {opened?<div data-urban-archive-opened="true" className="mt-4 overflow-hidden rounded-xl border border-sky-300 bg-white p-4">
        <h6 className="text-base font-extrabold text-slate-950">Rascunho recuperado · versão {opened.version}</h6>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {opened.source_rows.length} linhas históricas. O original continua protegido pelo SHA-256; as conferências e exceções não se tornam regras ativas.
        </p>
        <p className="mt-2 text-sm font-semibold text-amber-900">
          {file?"Com o PDF original selecionado, você pode continuar no editor após conferência do hash.":"Para continuar a análise no editor, selecione o PDF original no campo acima. Não é preciso recriar ou salvar novamente o JSON."}
        </p>
        <button type="button" data-sigapro-contrast="dark" disabled={!file||Boolean(busyId)||!canEdit}
          onClick={()=>void onRestore(opened).catch(e=>setNotice(e instanceof Error?e.message:"Falha ao verificar PDF."))}
          className="mt-3 min-h-10 rounded-lg border border-sky-900 bg-sky-900 px-4 py-2 text-sm font-extrabold text-white">
          Continuar revisão do rascunho no editor
        </button>
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200" role="region" aria-label="Linhas do rascunho arquivado">
          <table className="w-full min-w-[600px] text-left text-sm text-slate-950">
            <thead className="sticky top-0 bg-slate-100 text-slate-950"><tr>
              <th className="p-2">Página</th><th className="p-2">Zona e uso</th><th className="p-2">Conferência</th>
            </tr></thead>
            <tbody>{opened.source_rows.map((row,i)=><tr key={i} className="border-t border-slate-200">
              <td className="p-2">{row.pagina_pdf}</td>
              <td className="p-2 font-semibold">{row.zona_conforme_tabela} · {row.uso_predominante_conforme_tabela}</td>
              <td className="p-2">{opened.reviewed_indexes.includes(i)?"Declarada conferida":"Revisão individual pendente"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>:null}
    </div>
  </section>;
}
