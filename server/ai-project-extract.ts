import type { IncomingMessage, ServerResponse } from "node:http";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getR2EndpointCandidates } from "./r2-runtime.js";
import { callDataApiRpc, getDataApiUrl, readBearer, readEnv, resolveMunicipalDocumentTarget } from "./municipal-storage.js";
import { extractVisualPdf, resolveVisualPdfProvider } from "./architectural-pdf-provider.js";

export const maxDuration = 60;
type Req = IncomingMessage & { method?: string; body?: unknown };
type Res = ServerResponse;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
/**
 * Production PDF reading stays disabled until its own explicit, server-side
 * release flag is set after the real-project and legal/financial QA gates.
 * The preview remains available to authorized analysts for homologation.
 */
function productionPdfAiOptIn():boolean {
  return process.env.VERCEL_ENV==="production" &&
    readEnv("SIGAPRO_PDF_AI_PROD_ENABLED").trim().toLowerCase()==="true";
}
type DocumentRow = {id:string;process_id:string;municipality_id:string;tenant_id?:string;
  title:string;file_name:string;file_path:string;mime_type:string;file_size_bytes?:string|number;
  version:number;is_valid:boolean;invalidated_at:string|null;};

function json(res:Res,status:number,body:unknown){
  res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.end(JSON.stringify(body));
}
function sameOrigin(req:Req){
  if(!req.headers.origin)return true;
  try{const url=new URL(String(req.headers.origin));const host=String(req.headers.host||"");
    return url.host.toLowerCase()===host.toLowerCase() &&
      (url.protocol==="https:"||(url.protocol==="http:"&&/^localhost(?::|$)/.test(host)));
  }catch{return false;}
}
async function readBody(req:Req):Promise<Record<string,unknown>>{
  if(req.body&&typeof req.body==="object"&&!Array.isArray(req.body))
    return req.body as Record<string,unknown>;
  const chunks:Buffer[]=[];let count=0;
  for await(const chunk of req){count+=chunk.length;
    if(count>2048)throw new Error("BODY_LIMIT");chunks.push(Buffer.from(chunk));}
  const value:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_BODY");
  return value as Record<string,unknown>;
}
async function verifiedDocument(req:Req,tenant:string,processId:string,documentId:string){
  const query=new URLSearchParams({
    id:"eq."+documentId,
    select:"id,process_id,municipality_id,tenant_id,title,file_name,file_path,mime_type,file_size_bytes,version,is_valid,invalidated_at",
    limit:"1",
  });
  const res=await fetch(getDataApiUrl()+"/process_documents?"+query.toString(),{
    headers:{Authorization:"Bearer "+readBearer(req),Accept:"application/json"},
    cache:"no-store",redirect:"error",
  });
  if(!res.ok)return null;
  const data:unknown=await res.json();
  const doc=Array.isArray(data)?data[0] as DocumentRow|undefined:undefined;
  if(!doc||doc.id!==documentId||doc.process_id!==processId||
    doc.is_valid!==true||doc.invalidated_at!==null||
    doc.municipality_id!==tenant||!doc.file_path?.startsWith("municipalities/"+tenant+"/")||
    doc.file_path.includes("..")||doc.file_path.includes("\\")||
    !/\.pdf$/i.test(doc.file_path)||!/\.pdf$/i.test(doc.file_name||"")||
    (doc.mime_type&&doc.mime_type!=="application/pdf")||
    !/projeto arquitetonico/.test((doc.title||"").normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase()))return null;
  const declared=Number(doc.file_size_bytes||0);
  if(!Number.isFinite(declared)||declared<0||declared>MAX_PDF_BYTES)throw new Error("PDF_LIMIT");
  const allowed=await callDataApiRpc<boolean>(req,"authorize_technical_document_signing_v1",{
    _document_id:documentId,
  });
  return allowed.ok&&allowed.payload===true?doc:null;
}
async function pdfBytes(req:Req,tenant:string,key:string):Promise<Uint8Array>{
  const bucket=readEnv("R2_BUCKET_DOCUMENTOS")||"sigapro-documentos";
  const owned=await resolveMunicipalDocumentTarget(req,tenant,bucket,key);
  const sources:{client:S3Client;bucket:string;key:string}[]=owned
    ?[{client:owned.client,bucket:owned.bucket,key:owned.objectKey}]
    :getR2EndpointCandidates().map(endpoint=>({
       client:new S3Client({region:"auto",endpoint,credentials:{
         accessKeyId:readEnv("R2_ACCESS_KEY_ID"),secretAccessKey:readEnv("R2_SECRET_ACCESS_KEY"),
       }}),bucket,key,
     }));
  try{
    for(const s of sources){
      try{
        const head=await s.client.send(new HeadObjectCommand({Bucket:s.bucket,Key:s.key}));
        if(!head.ContentLength||head.ContentLength>MAX_PDF_BYTES)throw new Error("PDF_LIMIT");
        const pdf=await s.client.send(new GetObjectCommand({Bucket:s.bucket,Key:s.key}));
        const bytes=await pdf.Body?.transformToByteArray();
        if(!bytes||bytes.length<100||bytes.length>MAX_PDF_BYTES||
          Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")throw new Error("PDF_INVALID");
        return bytes;
      }catch(e){
        if(e instanceof Error&&["PDF_LIMIT","PDF_INVALID"].includes(e.message))throw e;
        if(owned)throw e;
      }
    }
    throw new Error("STORAGE_UNAVAILABLE");
  }finally{for(const s of sources)s.client.destroy();}
}
export default async function handler(req:Req,res:Res){
  if(req.method==="GET"){
    if(!sameOrigin(req))return json(res,403,{error:"Origem não autorizada."});
    if(!readBearer(req))return json(res,401,{error:"Entre na sua conta SIGAPRO."});
    if(process.env.VERCEL_ENV!=="preview" && !productionPdfAiOptIn())return json(res,200,{
      enabled:false,message:"Leitura de projetos desativada neste ambiente. Em produção depende de homologação e habilitação expressa."
    });
    const auth=await callDataApiRpc<Record<string,unknown>>(req,"get_current_profile_context",{});
    const user=auth.payload;
    if(!auth.ok||!user||user.account_status!=="active"||user.deleted_at||
      user.is_master===true||!UUID.test(String(user.municipality_id||""))||
      !["analista","prefeitura_supervisor"].includes(String(user.role||""))||
      (user.tenant_id&&user.tenant_id!==user.municipality_id))
      return json(res,403,{error:"Consulta reservada ao analista municipal."});
    const available=resolveVisualPdfProvider(readEnv);
    return json(res,200,{
      enabled:available.enabled, maxPdfMb:8,
      provider:available.enabled?available.provider.kind:"none",
      message:available.message,
    });
  }
  if(req.method!=="POST")return json(res,405,{error:"Método não permitido."});
  if(!sameOrigin(req))return json(res,403,{error:"Origem não autorizada."});
  if(process.env.VERCEL_ENV!=="preview" && !productionPdfAiOptIn())return json(res,403,{
    code:"AI_ENV_DISABLED",error:"Leitura de projetos desativada neste ambiente até habilitação expressa."
  });
  if(!readBearer(req))return json(res,401,{error:"É necessário entrar no SIGAPRO."});
  let body:Record<string,unknown>;
  try{body=await readBody(req);}
  catch{return json(res,400,{error:"Dados do processo inválidos."});}
  const {processId,documentId}=body;
  if(typeof processId!=="string"||!UUID.test(processId)||
    typeof documentId!=="string"||!UUID.test(documentId)||body.confirmedTransfer!==true)
    return json(res,400,{error:"Selecione o projeto e confirme o envio para leitura assistida."});
  try{
    const auth=await callDataApiRpc<Record<string,unknown>>(req,"get_current_profile_context",{});
    const user=auth.payload;
    if(!auth.ok||!user||user.account_status!=="active"||user.deleted_at||
      user.is_master===true||!UUID.test(String(user.municipality_id||""))||
      !["analista","prefeitura_supervisor"].includes(String(user.role||""))||
      (user.tenant_id&&user.tenant_id!==user.municipality_id))
      return json(res,403,{error:"Leitura reservada ao analista municipal autenticado."});
    const tenant=String(user.municipality_id);
    const doc=await verifiedDocument(req,tenant,processId,documentId);
    if(!doc)return json(res,403,{
      error:"O projeto não está liberado para análise técnica neste município."
    });
    const available=resolveVisualPdfProvider(readEnv);
    if(!available.enabled)return json(res,503,{
      code:"SIGAPRO_PDF_AI_NOT_CONFIGURED",error:available.message,
    });
    const pdf=await pdfBytes(req,tenant,doc.file_path);
    const extracted=await extractVisualPdf(pdf,doc.file_name,available.provider);
    // A revised/invalidated PDF must NEVER yield accepted observations.
    // Recheck ownership and immutable object version after AI inference.
    const sameDocument=await verifiedDocument(req,tenant,processId,documentId);
    if(!sameDocument||sameDocument.file_path!==doc.file_path||
      sameDocument.version!==doc.version)throw new Error("AI_DOCUMENT_REVISED");
    return json(res,200,{...extracted,processId:doc.process_id,
      documentId:doc.id,documentVersion:doc.version,fileName:doc.file_name,
      legalConformity:"not_evaluated",humanReviewRequired:true,
      aiProvider:available.provider.kind,
      pdfSharedWithConfiguredAiProvider:true});
  }catch(e){
    const code=e instanceof Error?e.message:"";
    if(code==="PDF_LIMIT")return json(res,413,{code,error:"PDF acima de 8 MB. Separe as pranchas."});
    if(code==="PDF_INVALID")return json(res,422,{code,error:"O PDF está incompleto ou inválido."});
    if(code==="AI_RATE_LIMIT")return json(res,429,{code,error:"Limite do provedor de IA atingido."});
    if(code==="AI_PROVIDER_CREDENTIALS")return json(res,503,{code,
      error:"A autenticação do provedor visual está inválida ou não foi autorizada."});
    if(code==="AI_DOCUMENT_REVISED")return json(res,409,{code,
      error:"O projeto foi substituído ou invalidado durante a leitura. Confira a versão atual e tente novamente."});
    if(code==="AI_INCOMPLETE"||code==="AI_INVALID_JSON"||code==="AI_EMPTY")
      return json(res,502,{code:"AI_READING_INCOMPLETE",
        error:"A leitura visual não foi concluída com segurança. Nenhuma medida foi gravada."});
    return json(res,503,{code:"PROJECT_AI_UNAVAILABLE",
      error:"Não foi possível ler a planta. Nenhuma medida foi gravada."});
  }
}
