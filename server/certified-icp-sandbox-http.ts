import {randomBytes} from "node:crypto";
import {currentQaPreview} from "./qa-runtime-scope.js";
import {startSandboxFlow,finishSandboxFlow,recoverSandboxFlow} from "./certified-icp-sandbox-flow.js";
import {readBearer,type ApiReq} from "./municipal-storage.js";
type Res=import("http").ServerResponse;
function json(res:Res,status:number,body:unknown){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.end(JSON.stringify(body));}
async function readBody(req:ApiReq){
 if(req.body!==undefined){const raw=typeof req.body==="string"?req.body:JSON.stringify(req.body);if(raw.length>16000)throw Error("size");return JSON.parse(raw);}
 const parts:Buffer[]=[];let n=0;
 for await(const chunk of req){const b=Buffer.from(chunk);n+=b.length;if(n>16000)throw Error("size");parts.push(b);}
 return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export default async function handler(req:ApiReq,res:Res){
 res.setHeader("Cache-Control","no-store");res.setHeader("Cross-Origin-Opener-Policy","unsafe-none");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("X-Content-Type-Options","nosniff");
 if(!currentQaPreview(process.env)||process.env.SIGAPRO_QA_ICP_HTTP_ENABLED!=="true"){json(res,404,{ok:false});return;}
 let redirect:URL;try{redirect=new URL(process.env.SIGAPRO_QA_ICP_REDIRECT_URI||"");}catch{json(res,503,{ok:false,code:"ITI_SANDBOX_NOT_CONFIGURED"});return;}
 if(redirect.protocol!=="https:"||redirect.pathname!=="/api/certified-icp-sandbox"||redirect.host!==req.headers.host){json(res,403,{ok:false});return;}
 if(req.method==="GET"){
  // Provider returns code/state to a popup. Never include either value in the
  // response HTML or server logs. The authenticated opener must POST both.
  const nonce=randomBytes(18).toString("base64");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; frame-ancestors 'none'");
  res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Retorno de homologação SIGAPRO</title><body><p>Retorno de homologação. Volte à janela do SIGAPRO.</p><script nonce="'+nonce+'">const q=new URLSearchParams(location.search);const code=q.get("code"),state=q.get("state");history.replaceState(null,"",location.pathname);if(window.opener&&state){window.opener.postMessage({type:"sigapro-icp-sandbox-callback",code,state,denied:!code},location.origin);window.close();}</script></body></html>');return;
 }
 if(req.method!=="POST"){json(res,405,{ok:false});return;}
 if(req.headers.origin!==redirect.origin){json(res,403,{ok:false});return;}
 if(!readBearer(req)){json(res,401,{ok:false,code:"ITI_AUTHENTICATION_REQUIRED"});return;}
 try{
  const body=await readBody(req);
  if(!body||typeof body!=="object"||Array.isArray(body)){json(res,400,{ok:false,code:"ITI_REQUEST_INVALID"});return;}
  if(body.action==="start"){
   const result=await startSandboxFlow(req,{municipalityId:body.municipalityId,profileId:body.profileId,processId:body.processId,requestId:body.requestId,artifactType:body.artifactType,signerSlot:body.signerSlot});
   json(res,200,{ok:true,...result});return;
  }
  if(body.action==="status"&&typeof body.ticket==="string"&&typeof body.state==="string"&&body.code===undefined){
   const proof=await recoverSandboxFlow(req,{ticket:body.ticket,state:body.state});
   if(!proof){json(res,409,{ok:false,code:"ITI_MANIFEST_NOT_RECORDED"});return;}
   json(res,200,{ok:true,...proof});return;
  }
  if(body.action==="complete"&&typeof body.ticket==="string"&&typeof body.state==="string"&&typeof body.code==="string"){
   const result=await finishSandboxFlow(req,{ticket:body.ticket,state:body.state,code:body.code});
   json(res,200,{ok:true,...result});return;
  }
  json(res,400,{ok:false,code:"ITI_REQUEST_INVALID"});
 }catch{json(res,409,{ok:false,code:"ITI_SANDBOX_NOT_COMPLETED",message:"Não foi possível concluir a homologação da assinatura. Confira a configuração e inicie uma nova sessão."});}
}
