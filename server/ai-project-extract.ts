import type { IncomingMessage, ServerResponse } from "node:http";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getR2EndpointCandidates } from "./r2-runtime.js";
import { callDataApiRpc, getDataApiUrl, readBearer, readEnv, resolveMunicipalDocumentTarget } from "./municipal-storage.js";
import { extractVisualPdf, resolveVisualPdfProvider } from "./architectural-pdf-provider.js";
import { extractNativeArchitecturalPdf } from "./native-architectural-pdf.js";
import { inspectProcessTerritory } from "./urban-territorial-context.js";

export const maxDuration = 60;
type Req = IncomingMessage & { method?: string; body?: unknown };
type Res = ServerResponse;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const QA_ARCHITECTURAL_FILENAME="SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf";
/** Free external AI must never receive real municipal project documents. */
function isSyntheticQa04Pdf(doc:DocumentRow,bytes?:Uint8Array):boolean{
  if(doc.process_id!=="915e1c63-ebda-4cdd-8e95-34316d9e0089"||
    doc.file_name!==QA_ARCHITECTURAL_FILENAME)return false;
  if(!bytes)return true;
  // The deterministic jsPDF QA fixture includes both markers as plain text
  // when generated. If compressed/replaced, fail closed rather than guessing.
  const raw=Buffer.from(bytes).toString("latin1");
  return raw.includes("FICTICIO / QA") &&
    raw.includes("PROCESSO FICTICIO 000004/2026");
}
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
    // The fallback is an opt-in only for this QA preview and is text-only.
    // This check does not transmit the PDF, expose credentials or charge usage.
    const textAlternative=process.env.VERCEL_ENV==="preview"
      ?resolveVisualPdfProvider(readEnv,"cloudflare_text"):null;
    const advancedVisual=process.env.VERCEL_ENV==="preview"
      ?resolveVisualPdfProvider(readEnv,"openai_visual"):null;
    const freeVisual=process.env.VERCEL_ENV==="preview"
      ?resolveVisualPdfProvider(readEnv,"gemini_qa"):null;
    // Preview-only, read-only readiness check. It applies the EXACT same
    // municipal/document/technical-stage authorization as POST, without
    // fetching the PDF or sending anything to an AI provider.
    const url=new URL(req.url||"/","https://sigapro.internal");
    const processId=url.searchParams.get("processId")||"";
    const documentId=url.searchParams.get("documentId")||"";
    let documentReady:boolean|null=null;
    let geminiFixtureReady=false;
    let territorialContext=null;
    if(processId||documentId){
      if(!UUID.test(processId)||!UUID.test(documentId))return json(res,400,{
        error:"Identificação do processo ou do documento inválida.",
      });
      try{
        const doc=await verifiedDocument(req,
          String(user.municipality_id),processId,documentId);
        documentReady=Boolean(doc);
        if(doc)territorialContext=await inspectProcessTerritory(req,String(user.municipality_id),processId);
        geminiFixtureReady=Boolean(doc&&isSyntheticQa04Pdf(doc));
      }catch{
        // Do not reveal foreign-tenant metadata or storage credentials.
        documentReady=false;
      }
    }
    return json(res,200,{
      enabled:available.enabled, maxPdfMb:8,
      provider:available.enabled?available.provider.kind:"none",
      mode:available.enabled
        ?available.provider.kind==="cloudflare"?"text_only":"visual":"disabled",
      documentReady,
      documentMessage:documentReady===null
        ?"Selecione a versão atual da planta para verificar a liberação técnica."
        :documentReady
          ?"PDF vigente vinculado ao processo e liberado para leitura técnica."
          :"O documento ainda não está liberado para análise técnica. Confira a triagem, a versão válida e as permissões do analista.",
      message:available.enabled
        ?"SIGAPRO IA habilitado para o tipo de leitura configurado."
        :"O módulo SIGAPRO IA não está configurado neste ambiente.",
      providerConfiguredOnly:true,
      billingVerified:false,
      textAlternativeAvailable:textAlternative?.enabled===true,
      openaiVisualAlternativeAvailable:advancedVisual?.enabled===true,
      geminiQaFixture:geminiFixtureReady,
      geminiQaAvailable:geminiFixtureReady&&freeVisual?.enabled===true,
      nativeTextAvailable:process.env.VERCEL_ENV==="preview"&&documentReady===true,
      territorialContext,
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
  // Never auto-switch visual analysis to text when Anthropic returns an error.
  // The analyst must explicitly choose Cloudflare and re-confirm PDF transfer.
  const textRequested=body.readingMode==="cloudflare_text";
  const openaiVisualRequested=body.readingMode==="openai_visual";
  const geminiQaRequested=body.readingMode==="gemini_qa";
  const nativeTextRequested=body.readingMode==="native_text";
  if(body.readingMode!==undefined && !["visual","cloudflare_text","openai_visual","gemini_qa","native_text"].includes(String(body.readingMode)))
    return json(res,400,{error:"Modo de leitura não reconhecido."});
  if((textRequested||openaiVisualRequested||geminiQaRequested||nativeTextRequested) && process.env.VERCEL_ENV!=="preview")
    return json(res,403,{code:"AI_ENV_DISABLED",error:"Modalidades alternativas disponíveis somente em homologação."});
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
    if(geminiQaRequested&&!isSyntheticQa04Pdf(doc))return json(res,403,{
      code:"AI_QA_FICTITIOUS_ONLY",
      error:"O teste gratuito aceita exclusivamente o projeto fictício 04, nunca arquivos reais."
    });
    const available=resolveVisualPdfProvider(readEnv,
      textRequested?"cloudflare_text":
        openaiVisualRequested?"openai_visual":
        geminiQaRequested?"gemini_qa":undefined);
    if(!nativeTextRequested&&!available.enabled)return json(res,503,{
      code:"SIGAPRO_PDF_AI_NOT_CONFIGURED",
      error:"O módulo SIGAPRO IA selecionado não está disponível. Solicite ao administrador a verificação da integração.",
    });
    const territorialContext=await inspectProcessTerritory(req,tenant,processId);
    const pdf=await pdfBytes(req,tenant,doc.file_path);
    if(geminiQaRequested&&!isSyntheticQa04Pdf(doc,pdf))return json(res,403,{
      code:"AI_QA_FIXTURE_MISMATCH",
      error:"Este PDF não contém os marcadores do ensaio fictício 04. Nenhum arquivo foi transmitido."
    });
    // First-party layer handles selectable-vector PDFs without an external AI
    // request, credits, provider fallback, or a second long-running model call.
    const extracted=nativeTextRequested
      ?extractNativeArchitecturalPdf(pdf)
      :available.enabled
        ?await extractVisualPdf(pdf,doc.file_name,available.provider)
        :null;
    if(!extracted)throw new Error("AI_PROVIDER_MODEL_UNAVAILABLE");
    // A revised/invalidated PDF must NEVER yield accepted observations.
    // Recheck ownership and immutable object version after AI inference.
    const sameDocument=await verifiedDocument(req,tenant,processId,documentId);
    if(!sameDocument||sameDocument.file_path!==doc.file_path||
      sameDocument.version!==doc.version)throw new Error("AI_DOCUMENT_REVISED");
    return json(res,200,{...extracted,processId:doc.process_id,
      documentId:doc.id,documentVersion:doc.version,fileName:doc.file_name,
      legalConformity:"not_evaluated",humanReviewRequired:true,
      aiProvider:nativeTextRequested?"sigapro_local":available.enabled?available.provider.kind:"none",
      pdfSharedWithConfiguredAiProvider:!nativeTextRequested,
      territorialContext});
  }catch(e){
    const code=e instanceof Error?e.message:"";
    if(code==="PDF_LIMIT")return json(res,413,{code,error:"PDF acima de 8 MB. Separe as pranchas."});
    if(code==="PDF_INVALID")return json(res,422,{code,error:"O PDF está incompleto ou inválido."});
    if(code.startsWith("PDF_NATIVE_"))return json(res,422,{code,error:
      code==="PDF_NATIVE_UNSUPPORTED_ENCODING"||code==="PDF_NATIVE_COMPLEX"
        ?"O PDF usa uma codificação de texto não suportada pela leitura local. Use uma leitura visual autorizada ou exporte a planta com texto selecionável."
        :code==="PDF_NATIVE_PAGE_COUNT"
          ?"Não foi possível identificar as páginas do PDF. Confira a exportação original."
          :"O PDF está incompleto ou não pôde ser validado. Nenhum dado foi gravado."
    });
    if(code==="AI_RATE_LIMIT")return json(res,429,{code,
      error:"A cota gratuita ou o limite de requisições do serviço de leitura foi atingido. Nenhum dado foi gravado."});
    if(code==="AI_PROVIDER_BILLING")return json(res,402,{code,
      error:"A modalidade visual selecionada está sem créditos ou atingiu o limite de gastos da API contratada. Nenhuma medida foi aplicada. A Leitura Documental não comprova recuos geométricos."});
    if(code==="AI_PROVIDER_MODEL_UNAVAILABLE")return json(res,503,{code,
      error:"O modelo de leitura de PDF não está disponível para esta chave. Confira o identificador no servidor."});
    if(code==="AI_PROVIDER_CREDENTIALS")return json(res,503,{code,
      error:textRequested
        ?"A autenticação do módulo SIGAPRO IA · Leitura Documental está indisponível."
        :"A autenticação do provedor visual está inválida ou não foi autorizada."});
    if(code==="CLOUDFLARE_PDF_CONVERSION_TIMEOUT")return json(res,504,{code,
      error:"A conversão do PDF em texto excedeu o tempo permitido. O serviço externo não concluiu essa etapa; nenhuma medida foi registrada. Para recuos desenhados, utilize uma leitura visual habilitada."});
    if(code==="CLOUDFLARE_MODEL_TIMEOUT")return json(res,504,{code,
      error:"O PDF foi convertido, mas a interpretação textual excedeu o tempo permitido. Nenhuma medida foi registrada; tente novamente somente após conferir os limites do serviço."});
    if(code==="CLOUDFLARE_PDF_CONVERSION_REJECTED")return json(res,422,{code,
      error:"O serviço de conversão recusou o formato ou tamanho do PDF. Verifique esta versão do arquivo; nenhuma medida foi registrada."});
    if(code==="CLOUDFLARE_PDF_CONVERSION_UNAVAILABLE"||code==="CLOUDFLARE_PDF_CONVERSION_NETWORK")
      return json(res,503,{code,
        error:"O serviço de conversão de PDF está indisponível ou não respondeu. Nenhuma medida foi registrada. A leitura visual exige um prestador próprio habilitado."});
    if(code==="CLOUDFLARE_MODEL_UNAVAILABLE"||code==="CLOUDFLARE_MODEL_NETWORK")
      return json(res,503,{code,
        error:"A conversão do PDF foi realizada, mas o modelo de interpretação não respondeu. Nenhuma medida foi registrada."});
    if(code==="CLOUDFLARE_PDF_CONVERSION_FAILED")return json(res,422,{code,
      error:"O SIGAPRO IA · Leitura Documental não conseguiu converter esta versão do PDF em texto. Verifique o arquivo original; nenhuma medida foi aplicada."});
    if(code==="CLOUDFLARE_PDF_TEXT_EMPTY")return json(res,422,{code,
      error:"O SIGAPRO IA · Leitura Documental não encontrou texto utilizável neste PDF. Se as cotas estiverem somente desenhadas, será necessária leitura visual; nenhum valor foi inventado."});
    if(code==="CLOUDFLARE_PDF_TEXT_OVERSIZE")return json(res,413,{code,
      error:"O texto extraído ultrapassou o limite seguro. Divida as pranchas para revisão. Nenhuma medida foi gravada."});
    if(code==="CLOUDFLARE_MODEL_REQUEST_REJECTED")return json(res,502,{code,
      error:"O serviço de Leitura Documental rejeitou a solicitação do modelo. Não foi emitido diagnóstico nem registrada medida."});
    if(code==="CLOUDFLARE_MODEL_EMPTY"||code==="CLOUDFLARE_MODEL_INVALID_JSON")
      return json(res,502,{code,error:"A Leitura Documental não devolveu interpretação estruturada válida. Nenhuma medida foi gravada."});
    if(code==="AI_DOCUMENT_REVISED")return json(res,409,{code,
      error:"O projeto foi substituído ou invalidado durante a leitura. Confira a versão atual e tente novamente."});
    if(code==="AI_INCOMPLETE"||code==="AI_INVALID_JSON"||code==="AI_EMPTY")
      return json(res,502,{code:"AI_READING_INCOMPLETE",
        error:"A leitura visual não foi concluída com segurança. Nenhuma medida foi gravada."});
    return json(res,503,{code:"PROJECT_AI_UNAVAILABLE",
      error:textRequested
        ?"O módulo SIGAPRO IA · Leitura Documental está indisponível neste momento. Nenhuma medida foi gravada."
        :"Não foi possível ler a planta. Nenhuma medida foi gravada."});
  }
}
