import {backendClient} from "@/integrations/backend/databaseClient";
import {getProcessArtifactSignatureRequest} from "./artifactClient";

export type SandboxSelection={processId:string;artifactType:"construction_permit"|"habite_se_permit";signerSlot:"diretoria"|"secretaria"};
type Start={authorizationUrl:string;ticket:string;state:string;expiresAt:number;environment:"sandbox";issuanceAuthorized:false};
type Proof={manifestRecorded:true;archiveVerified:true;issuanceAuthorized:false;pdfPolicyVerified:false;sha256:string;environment:"sandbox"};
const hash=/^[a-f0-9]{64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateSandboxStart(value:unknown,now=Date.now()):Start{
 const v=value as Start;
 if(!v||v.environment!=="sandbox"||v.issuanceAuthorized!==false||typeof v.ticket!=="string"||v.ticket.length>4096||
 typeof v.state!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(v.state)||!Number.isSafeInteger(v.expiresAt)||v.expiresAt<=now||v.expiresAt>now+300000)throw Error("Sessão de homologação não confirmada.");
 const url=new URL(v.authorizationUrl);
 if(url.origin!=="https://cas.staging.iti.br"||url.pathname!=="/oauth2.0/authorize"||url.searchParams.get("state")!==v.state||url.username||url.password||url.hash||url.searchParams.get("scope")!=="sign icp_brasil")throw Error("Endereço de autorização não confirmado.");
 return v;
}
export function validateSandboxProof(value:unknown):Proof{
 const v=value as Proof;
 if(!v||v.environment!=="sandbox"||v.manifestRecorded!==true||v.archiveVerified!==true||v.issuanceAuthorized!==false||v.pdfPolicyVerified!==false||typeof v.sha256!=="string"||!hash.test(v.sha256))throw Error("O servidor não confirmou o arquivo de homologação.");
 return {manifestRecorded:true,archiveVerified:true,issuanceAuthorized:false,pdfPolicyVerified:false,sha256:v.sha256,environment:"sandbox"};
}
async function post(body:Record<string,unknown>,signal:AbortSignal){
 const s=await backendClient.auth.getSession();
 const session=s?.data?.session;const token=session?.access_token||session?.accessToken||session?.token||"";
 if(!token)throw Error("Sua sessão expirou. Entre novamente.");
 const response=await fetch("/api/certified-icp-sandbox",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(body),cache:"no-store",signal});
 if(response.status===404||response.status===503)throw Error("A integração de homologação ainda não está configurada.");
 const data=await response.json().catch(()=>null);
 if(!response.ok||data?.ok!==true)throw Error("Não foi possível confirmar a operação de homologação. Confira a configuração e a solicitação de assinatura.");
 return data;
}
function callback(popup:Window,start:Start,signal:AbortSignal){
 return new Promise<string>((resolve,reject)=>{
  let finished=false;
  const clean=()=>{window.removeEventListener("message",onMessage);signal.removeEventListener("abort",onAbort);window.clearTimeout(timeout);window.clearInterval(poll);};
  const fail=(message:string)=>{if(finished)return;finished=true;clean();reject(Error(message));};
  const onAbort=()=>fail("Homologação cancelada.");
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==popup||event.data?.type!=="sigapro-icp-sandbox-callback"||event.data?.state!==start.state)return;
   if(event.data.denied||typeof event.data.code!=="string"||!event.data.code||event.data.code.length>8192){fail("Autorização não concedida.");return;}
   if(finished)return;finished=true;clean();resolve(event.data.code);
  };
  let closedChecks=0;
  const timeout=window.setTimeout(()=>fail("Sessão de homologação expirada."),Math.max(0,start.expiresAt-Date.now()));
  const poll=window.setInterval(()=>{if(popup.closed){if(++closedChecks>=3)fail("Janela de autorização fechada.");}else closedChecks=0;},400);
  window.addEventListener("message",onMessage);signal.addEventListener("abort",onAbort,{once:true});
  if(signal.aborted){onAbort();return;}
  try{popup.location.replace(start.authorizationUrl);}catch{fail("Não foi possível abrir o autorizador.");}
 });
}
/** This signs a non-official evidence PDF only. No local status or signature
 * record is changed. OAuth code and ticket stay in memory, never in storage. */
export async function runCertifiedSandbox(selection:SandboxSelection,popup:Window,signal:AbortSignal){
 try{
  const key=selection.artifactType==="construction_permit"?"construction-permit":"habite-se-permit";
  const [context,request]=await Promise.all([
   backendClient.rpc("get_process_artifact_signature_context_v1",{_process_id:selection.processId,_signer_slot:selection.signerSlot}),
   getProcessArtifactSignatureRequest(selection.processId,key,selection.signerSlot)
  ]);
  const c=context.data as {municipality_id?:string;profile_id?:string;process_id?:string;signer_slot?:string}|null;
  if(context.error||!c||!uuid.test(c.municipality_id||"")||!uuid.test(c.profile_id||"")||c.process_id!==selection.processId||c.signer_slot!==selection.signerSlot||request.request?.status!=="pending"||!uuid.test(request.request.id))throw Error("Solicitação pendente ou competência municipal não confirmada.");
  const start=validateSandboxStart(await post({action:"start",...selection,municipalityId:c.municipality_id,profileId:c.profile_id,requestId:request.request.id},signal));
  const code=await callback(popup,start,signal);
  return validateSandboxProof(await post({action:"complete",ticket:start.ticket,state:start.state,code},signal));
 }finally{if(!popup.closed)popup.close();}
}
