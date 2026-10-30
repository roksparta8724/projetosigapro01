import type { IncomingMessage, ServerResponse } from "node:http";
import { readEnv } from "./municipal-storage.js";
import { resolveCloudflareAiConfig } from "./cloudflare-ai-provider.js";
import { classifyCloudflareVisionFailure } from "./urban-matrix-vision.js";

type Req = IncomingMessage & {method?:string};
type Res = ServerResponse;
export const VISION_MODEL="@cf/meta/llama-3.2-11b-vision-instruct";
export const LICENSE_CONFIRMATION="ACEITO OS TERMOS DO LLAMA 3.2";
export const VISION_LICENSE_ACTION="urban-vision-license-accept";

export function validateCloudflareVisionLicenseRequest(body: unknown) {
  if(!body || typeof body!=="object" || Array.isArray(body)) return false;
  const b=body as Record<string,unknown>;
  return Object.keys(b).length===4 && ["action","accepted","confirmation","model"].every(k=>Object.prototype.hasOwnProperty.call(b,k)) &&
    b.action===VISION_LICENSE_ACTION &&
    b.accepted===true &&
    b.model===VISION_MODEL &&
    b.confirmation===LICENSE_CONFIRMATION;
}

export function canAuthorizeCloudflareAccount(identity: Record<string,unknown>) {
  // The backend has authenticated the JWT and supplied the authoritative master flag.
  // A municipal admin may use OCR but must never accept global account terms.
  return identity.is_master===true && identity.account_status==="active" &&
    !identity.deleted_at && typeof identity.profile_id==="string" &&
    identity.profile_id.length>0;
}
function reply(res:Res,status:number,body:unknown) {
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.end(JSON.stringify(body));
}

/** Account-wide Meta license acceptance, performed ONLY after a separate
 * explicit master confirmation. Never called on page load or OCR requests.
 * This never modifies the Neon urban regulations or tenant settings. */
export async function acceptCloudflareVisionLicense(
  _req:Req,res:Res,identity:Record<string,unknown>,body:unknown,
) {
  if(process.env.VERCEL_ENV!=="preview" ||
    readEnv("VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED")!=="true")
    return reply(res,403,{error:"Autorização disponível somente no Preview de homologação."});
  if(!canAuthorizeCloudflareAccount(identity))
    return reply(res,403,{error:"Somente o administrador Master autenticado pode aceitar termos de uma conta compartilhada."});
  if(!validateCloudflareVisionLicenseRequest(body))
    return reply(res,400,{error:"A aceitação exige revisão dos documentos, caixa de confirmação e declaração expressa do administrador Master."});
  if(readEnv("SIGAPRO_AI_PROVIDER")!=="cloudflare")
    return reply(res,503,{error:"O provedor Cloudflare não está selecionado para o ambiente QA."});

  const config=resolveCloudflareAiConfig({
    accountId:readEnv("SIGAPRO_CF_ACCOUNT_ID"),token:readEnv("SIGAPRO_CF_API_TOKEN"),
    model:readEnv("SIGAPRO_CF_MODEL"),
  });
  if(!config) return reply(res,503,{error:"Credenciais de IA visual não estão disponíveis no ambiente QA."});

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try {
    const url="https://api.cloudflare.com/client/v4/accounts/"+
      encodeURIComponent(readEnv("SIGAPRO_CF_ACCOUNT_ID"))+
      "/ai/run/"+VISION_MODEL;
    const response=await fetch(url,{
      method:"POST",redirect:"error",signal:controller.signal,
      headers:{"Authorization":"Bearer "+config.token,"Content-Type":"application/json"},
      body:JSON.stringify({prompt:"agree"}),
    });
    if(!response.ok) {
      const fail=classifyCloudflareVisionFailure(response.status,null);
      console.warn("[SIGAPRO][VisionLicense] Explicit master acceptance rejected",{
        status:response.status,code:fail.code,
      });
      return reply(res,fail.httpStatus,{code:fail.code,error:fail.error});
    }
    let payload:unknown=null;
    try{payload=await response.json();}catch{/* provider may respond with invalid JSON */}
    const accepted=Boolean(payload && typeof payload==="object" &&
      (payload as {success?:unknown}).success===true);
    if(!accepted) return reply(res,502,{
      code:"VISION_LICENSE_RESPONSE_UNVERIFIED",
      error:"Cloudflare respondeu à autorização, mas não confirmou o sucesso. Confira o painel da conta antes de tentar novamente.",
    });
    console.info("[SIGAPRO][VisionLicense] Cloudflare account license acceptance confirmed (QA master action)");
    return reply(res,200,{
      status:"accepted_by_provider",model:VISION_MODEL,
      message:"A Cloudflare confirmou a aceitação da licença do modelo visual. Agora faça um novo teste de OCR na Prefeitura.",
      urbanRulesChanged:false,tenantRulesActivated:false,
    });
  }catch{
    return reply(res,504,{
      code:"VISION_LICENSE_PROVIDER_TIMEOUT",
      error:"Não foi possível confirmar a resposta da Cloudflare. Antes de reenviar, verifique se os termos já foram aceitos no painel do provedor.",
    });
  }finally{clearTimeout(timer);}
}
