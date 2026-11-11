import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { municipalCollectionApiRequest } from "@/lib/municipalCollectionApi";

type Readiness = {
  kind: "sigapro.municipal.commercial-readiness.v1";
  municipalityId: string;
  checkedAt: string;
  financialProvider: {provider:string; environment:string; activeAndTestedForProduction:boolean};
  municipalCollection: {mode:string;environment:string;active:boolean;integrationType:string;controlledImportActive:boolean};
  bankAuthenticatedOriginalsProduction:number;
  officialLegalEvidenceCount:number;
  activatedNonFixtureUrbanRules:number;
  historicalAnalystSignatures:number;
  historicalDirectorSignatures:number;
  independentR2ByteAuditVerified:false;
  newAuthenticatedEndToEndVerified:false;
  officialMunicipalAcceptanceVerified:false;
  commercialReleaseCertified:false;
};

/**
 * Read-only pilot launch evidence, scoped by the SAME municipal JWT used
 * for payment setup. Never returns secrets or grants settlement permissions.
 * "green" historical metadata can never certify legal/commercial readiness.
 */
export function MunicipalCommercialReadiness({municipalityId}:{
  municipalityId:string;
}) {
  const requestGeneration=useRef(0);
  const [readiness,setReadiness]=useState<Readiness|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const check=useCallback(async()=>{
    const generation=++requestGeneration.current;
    setReadiness(null);setError("");setPending(true);
    try {
      const response=await municipalCollectionApiRequest<Readiness>(
        "collection-configuration",municipalityId,"commercial_readiness"
      );
      if(response.kind!=="sigapro.municipal.commercial-readiness.v1" ||
        response.municipalityId!==municipalityId ||
        response.commercialReleaseCertified!==false)
        throw new Error("A resposta não confirmou o isolamento e os critérios de aceite.");
      if(generation===requestGeneration.current)setReadiness(response);
    } catch(e){
      if(generation===requestGeneration.current)setError(
        e instanceof Error?e.message:"Não foi possível conferir as evidências da Prefeitura."
      );
    }finally{
      if(generation===requestGeneration.current)setPending(false);
    }
  },[municipalityId]);
  useEffect(()=>{
    void check();
    return ()=>{requestGeneration.current+=1;};
  },[check]);
  const bank=readiness?.financialProvider.activeAndTestedForProduction===true;
  const municipalImport=readiness?.municipalCollection.controlledImportActive===true;
  const payment=Number(readiness?.bankAuthenticatedOriginalsProduction||0)>0;
  const legal=Number(readiness?.officialLegalEvidenceCount||0)>0 &&
    Number(readiness?.activatedNonFixtureUrbanRules||0)>0;
  const signed=Number(readiness?.historicalAnalystSignatures||0)>0 &&
    Number(readiness?.historicalDirectorSignatures||0)>0;
  const milestones=[
    {label:municipalImport?"Importação controlada da Prefeitura":"Conta arrecadadora de produção",
      found:bank||municipalImport,
      detail:municipalImport
        ?"Sistema municipal oficial em produção, com importação controlada. Não há emissão ou baixa automática no SIGAPRO."
        :bank?"Credencial municipal ativa e último teste técnico aprovado."
        :"Cadastre e teste a conta bancária da Prefeitura em produção ou habilite importação controlada de guias oficiais."},
    {label:municipalImport?"Guia oficial e conferência da Tesouraria":"Cobrança autenticada e DAM registrada",
      found:payment&&!municipalImport,
      detail:municipalImport
        ?"Importe o PDF realmente emitido pelo sistema municipal e confira a baixa com a Tesouraria; não existe webhook bancário automático nesta modalidade."
        :payment?"Há metadados de pagamento bancário autenticado e de PDF original; falta auditoria independente dos bytes."
        :"Comprove uma cobrança piloto com confirmação do banco e PDF imutável no R2."},
    {label:"Legislação e parâmetros municipais",found:legal,
      detail:legal?"Há evidências conferidas e regras ativas não fictícias; exige aceite da autoridade.":"A Prefeitura deve cadastrar as normas oficiais com artigo, página, vigência e zoneamento."},
    {label:"Histórico de assinaturas por perfil",found:signed,
      detail:signed?"Constam registros anteriores de analista e diretoria; não substituem nova assinatura do piloto.":"Exercite assinatura do analista e da diretoria no mesmo processo piloto."},
  ];
  return <section data-commercial-readiness="true"
    className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
          <ShieldAlert className="h-5 w-5 text-sky-700" /> Prontidão comercial da Prefeitura
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
          Consulta diretamente o Neon da Prefeitura selecionada. Os resultados são evidências de
          preparação, não autorização para arrecadar ou emitir alvará sem conferência institucional.
        </p>
      </div>
      <button type="button" onClick={()=>void check()} disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${pending?"animate-spin":""}`}/>
        Atualizar comprovações
      </button>
    </div>
    {pending?<p className="mt-4 text-sm text-slate-600" role="status">Consultando evidências da Prefeitura...</p>:null}
    {error?<p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
      role="alert">{error} Nenhuma autorização comercial foi concedida.</p>:null}
    {readiness?<div className="mt-5 space-y-3">
      <div data-commercial-release-status="not-certified"
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
        Liberação comercial não certificada — requer prova bancária, legal, documental e funcional.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {milestones.map(item=><div key={item.label}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-2">
            {item.found?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/>:
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"/>}
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-950">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">{item.detail}</p>
            </div>
          </div>
        </div>)}
      </div>
      <p className="text-xs leading-5 text-slate-600">
        Pagamentos com comprovação bancária e metadados do original: {readiness.bankAuthenticatedOriginalsProduction}.
        Evidências legais conferidas: {readiness.officialLegalEvidenceCount}.
        Regras municipais não fictícias ativadas: {readiness.activatedNonFixtureUrbanRules}.
        Registros históricos de assinaturas (analista/diretoria): {readiness.historicalAnalystSignatures}/{readiness.historicalDirectorSignatures}.
      </p>
      <p className="text-xs leading-5 text-slate-700">
        <strong>Provas independentes necessárias:</strong> recuperar o PDF pelo R2 e conferir seu
        SHA-256; testar uma jornada nova com sessões autorizadas e assinaturas; obter o aceite
        formal da Prefeitura. Nenhuma dessas provas é criada por este painel.
      </p>
      <Link to="/cadastro-gestao/legislacao" className="inline-flex text-sm font-semibold text-sky-800 underline underline-offset-2">
        Abrir cadastro de Legislações
      </Link>
    </div>:null}
  </section>;
}
