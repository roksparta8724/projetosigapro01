/** QA-only benchmark of a real three-page synthetic PDF, no R2 or money. */
import type {IncomingMessage,ServerResponse} from "node:http";
import {callDataApiRpc,readBearer} from "./municipal-storage.js";
import {createQa04ArchitecturalPdfBytes} from "../src/lib/qa04ArchitecturalFixture.js";
import {extractNativeArchitecturalPdf} from "./native-architectural-pdf.js";
import {benchmarkQa04ArchitecturalReadings} from "../src/lib/architecturalPdfReadings.js";
import {auditArchitecturalPdfPages} from "../src/lib/architecturalPdfPageAudit.js";
type Req=IncomingMessage&{method?:string;body?:unknown};
const QA="fix/qa-triagem-analise-pagamento-20261101";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const qaBenchmarkEnabled=(env:NodeJS.ProcessEnv=process.env)=>
 env.VERCEL_ENV==="preview"&&env.VERCEL_GIT_COMMIT_REF===QA;
function respond(res:ServerResponse,status:number,payload:Record<string,unknown>){
 res.statusCode=status;
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","private, no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.end(JSON.stringify(payload));
}
function sameOrigin(req:Req){
 if(!req.headers.origin)return true;
 const host=String(req.headers.host||"");
 try{const url=new URL(String(req.headers.origin));
  return url.host.toLowerCase()===host.toLowerCase()&&
    (url.protocol==="https:"||(url.protocol==="http:"&&/^localhost(?::|$)/.test(host)));
 }catch{return false;}
}
export default async function handle(req:Req,res:ServerResponse){
 if(!qaBenchmarkEnabled())return respond(res,404,{error:"Ensaio exclusivo de homologação."});
 if(req.method!=="POST")return respond(res,405,{error:"Método não permitido."});
 if(!sameOrigin(req))return respond(res,403,{error:"Origem não autorizada."});
 if(!readBearer(req))return respond(res,401,{error:"Sessão municipal necessária."});
 const checked=await callDataApiRpc<Record<string,unknown>>(req,"get_current_profile_context",{});
 const actor=checked.payload;
 if(!checked.ok||!actor||actor.account_status!=="active"||actor.deleted_at||
   actor.is_master===true||!UUID.test(String(actor.municipality_id||""))||
   !["analista","prefeitura_supervisor"].includes(String(actor.role||""))||
   (actor.tenant_id&&actor.tenant_id!==actor.municipality_id))
  return respond(res,403,{error:"Ensaio reservado ao analista municipal."});
 try{
  // Direct arraybuffer avoids File/FileReader differences in Node vs browsers;
  // the front-end fixture uses exactly these bytes for its File wrapper.
  const pdf=new Uint8Array(createQa04ArchitecturalPdfBytes());
  const reading=auditArchitecturalPdfPages(pdf,extractNativeArchitecturalPdf(pdf));
  const report=benchmarkQa04ArchitecturalReadings(reading.readings);
  const passed=report.passed===3&&report.total===3&&
    reading.textCoverage?.pagesRead===3&&reading.pageAudit.count===3&&
    reading.pageAudit.countVerified&&reading.hasSitePlan&&
    reading.source==="pdf_text_local"&&reading.automaticallyApproved===false;
  return respond(res,passed?200:503,{
   kind:"sigapro.qa04.synthetic-pdf.v1",
   status:passed?"passed":"needs_review",
   summary:{passed:report.passed,total:report.total,pagesRead:reading.textCoverage?.pagesRead||0},
   cases:report.cases,legalConformity:"not_evaluated",processUpdated:false,providerRequests:0,
   ...(passed?{}:{error:"Leitor não atingiu o resultado esperado. Nenhum dado foi alterado."}),
  });
 }catch{return respond(res,503,{code:"QA_LAB_FAILED",
  error:"Falha na leitura de teste; nenhum processo foi alterado."});}
}
