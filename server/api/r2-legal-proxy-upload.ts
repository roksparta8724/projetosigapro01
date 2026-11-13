import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
 AbortMultipartUploadCommand, CompleteMultipartUploadCommand,
 CreateMultipartUploadCommand, DeleteObjectsCommand, GetObjectCommand,
 HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from "@aws-sdk/client-s3";
import { callDataApiRpc, readBearer, resolveMunicipalDocumentTarget } from "../municipal-storage.js";
import { resolveR2Endpoint } from "../r2-runtime.js";
import { validateLegalUploadInput, MAX_OFFICIAL_LEGAL_PDF_BYTES } from "./r2-legal-sign-put.js";

type Req = IncomingMessage & {body?:unknown;method?:string};
type Res = ServerResponse;
const CHUNK_BYTES=2*1024*1024, MIN_S3_PART=5*1024*1024;
const MAX_CHUNKS=Math.ceil(MAX_OFFICIAL_LEGAL_PDF_BYTES/CHUNK_BYTES);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/i;
export const LEGAL_PROXY_CHUNK_BYTES=CHUNK_BYTES;
function env(k:string){return String(process.env[k]||"").trim().replace(/^['"]|['"]$/g,"");}
function json(res:Res,status:number,value:unknown){
 res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 res.end(JSON.stringify(value));
}
function sameOrigin(req:Req){
 const origin=req.headers.origin;
 if(!origin)return true;
 try {
  const url=new URL(origin), host=String(req.headers.host||"").toLowerCase();
  return url.host.toLowerCase()===host&&(url.protocol==="https:"||
   (url.protocol==="http:"&&/^localhost(?::|$)/.test(host)));
 }catch{return false;}
}
async function readBody(req:Req){
 if(req.body!==undefined)return req.body;
 const parts:Buffer[]=[];let n=0;
 for await(const data of req){
  const b=Buffer.from(data);n+=b.length;
  if(n>3*1024*1024+200000)throw Error("REQUEST_TOO_LARGE");
  parts.push(b);
 }
 return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}
type Upload = {
 action:"chunk"|"finalize";objectKey:string;municipalityId:string;actorId:string;
 fileSize:number;uploadId:string;count:number;index:number|null;
 chunkHash:string|null;fileHash:string|null;base64:string|null;
};
export function validateLegalChunkRequest(raw:unknown):Upload|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const b=raw as Record<string,unknown>;
 if(b.action!=="chunk"&&b.action!=="finalize")return null;
 const valid=validateLegalUploadInput({
  action:"verify",bucket:b.bucket,objectKey:b.objectKey,
  fileSize:b.fileSize,contentType:b.contentType,
 });
 if(!valid||typeof b.uploadId!=="string"||!UUID.test(b.uploadId))return null;
 const match=/^municipalities\/[^/]+\/legislation-[^/]+\/([^/]+)\//i.exec(valid.objectKey);
 if(!match||!UUID.test(match[1]))return null;
 const count=Math.ceil(valid.fileSize/CHUNK_BYTES);
 if(!count||count>MAX_CHUNKS)return null;
 if(b.action==="chunk"){
  if(!Number.isInteger(b.chunkIndex)||Number(b.chunkIndex)<0||
   Number(b.chunkIndex)>=count||typeof b.base64!=="string"||
   b.base64.length>Math.ceil(CHUNK_BYTES/3)*4+12||
   !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)||
   typeof b.chunkSha256!=="string"||!HEX.test(b.chunkSha256))return null;
 }else if(typeof b.fileSha256!=="string"||!HEX.test(b.fileSha256))return null;
 return {
  action:b.action,objectKey:valid.objectKey,municipalityId:valid.municipalityId,
  actorId:match[1].toLowerCase(),fileSize:valid.fileSize,uploadId:b.uploadId,
  count,index:b.action==="chunk"?Number(b.chunkIndex):null,
  chunkHash:typeof b.chunkSha256==="string"?b.chunkSha256.toLowerCase():null,
  fileHash:typeof b.fileSha256==="string"?b.fileSha256.toLowerCase():null,
  base64:typeof b.base64==="string"?b.base64:null,
 };
}
function stageKey(a:Upload,i:number){
 // A private prefix ensures that unverified chunks never appear as official PDFs.
 return "municipalities/"+a.municipalityId+"/private-legal-staging/"+a.actorId+
  "/"+a.uploadId+"/"+String(i).padStart(4,"0");
}
function httpStatus(error:unknown){
 return (error as { $metadata?: {httpStatusCode?:number} }|null)?.$metadata?.httpStatusCode||0;
}
export default async function handler(req:Req,res:Res){
 if(req.method!=="POST")return json(res,405,{error:"Método não permitido."});
 if(!sameOrigin(req))return json(res,403,{error:"Origem não autorizada."});
 if(!readBearer(req))return json(res,401,{error:"Sessão necessária para cadastrar legislação."});
 let v:Upload|null=null;
 try {v=validateLegalChunkRequest(await readBody(req));}
 catch{return json(res,400,{error:"Envio do documento em partes inválido."});}
 if(!v)return json(res,400,{error:"PDF, município, tamanho ou hash inválido."});
 const a=v;
 // Every request uses the authenticated profile and municipal authorization from Neon.
 const [profile,grant,quota]=await Promise.all([
  callDataApiRpc<unknown>(req,"current_profile_id",{}),
  callDataApiRpc<unknown>(req,"can_manage_urban_legislation_registry_v1",{_municipality_id:a.municipalityId}),
  callDataApiRpc<unknown>(req,"assert_municipality_entitlement_v1",{
   _municipality_id:a.municipalityId,_capability:"storage_bytes",_increment:a.fileSize,
  }),
 ]);
 if(!profile.ok||String(profile.payload||"").toLowerCase()!==a.actorId||
  !grant.ok||(grant.payload!==true&&grant.payload!=="true"))
  return json(res,403,{code:"LEGAL_UPLOAD_UNAUTHORIZED",
   error:"Somente o Admin autenticado desta Prefeitura pode enviar este documento."});
 if(!quota.ok)return json(res,409,{code:"LEGAL_UPLOAD_QUOTA",
  error:quota.error||"Plano municipal não autorizou este armazenamento."});
 const documentsBucket=env("R2_BUCKET_DOCUMENTOS")||"sigapro-documentos";
 try {
  const target=await resolveMunicipalDocumentTarget(req,a.municipalityId,documentsBucket,a.objectKey);
  const bucket=target?.bucket||documentsBucket;
  const endpoint=resolveR2Endpoint();
  if(!target&&(!endpoint||!env("R2_ACCESS_KEY_ID")||!env("R2_SECRET_ACCESS_KEY")))
   return json(res,503,{error:"Conexão com o armazenamento institucional indisponível."});
  const client=target?.client||new S3Client({region:"auto",endpoint,credentials:{
   accessKeyId:env("R2_ACCESS_KEY_ID"),secretAccessKey:env("R2_SECRET_ACCESS_KEY"),
  }});
  const staging=await resolveMunicipalDocumentTarget(req,a.municipalityId,documentsBucket,stageKey(a,0));
  if(Boolean(staging)!==Boolean(target)||(staging&&target&&staging.bucket!==target.bucket))
   return json(res,503,{error:"Configuração de armazenamento municipal inconsistente."});
  const prefix=staging?staging.objectKey.slice(0,-stageKey(a,0).length):"";
  const stage=(i:number)=>prefix+stageKey(a,i);
  const official=target?.objectKey||a.objectKey;
  if(a.action==="chunk"){
   const index=a.index!, bytes=Buffer.from(a.base64!,"base64");
   const expected=index===a.count-1?a.fileSize-(a.count-1)*CHUNK_BYTES:CHUNK_BYTES;
   if(bytes.length!==expected||createHash("sha256").update(bytes).digest("hex")!==a.chunkHash||
    (index===0&&bytes.subarray(0,5).toString("ascii")!=="%PDF-"))
    return json(res,400,{error:"A parte recebida não corresponde ao PDF original."});
   try{
    await client.send(new PutObjectCommand({Bucket:bucket,Key:stage(index),
     Body:bytes,ContentType:"application/octet-stream",Metadata:{sha256:a.chunkHash!},
     IfNoneMatch:"*"}));
   }catch(e){
    if(httpStatus(e)!==412)throw e;
    const existing=await client.send(new HeadObjectCommand({Bucket:bucket,Key:stage(index)}));
    if(existing.ContentLength!==bytes.length||existing.Metadata?.sha256!==a.chunkHash)
     return json(res,409,{error:"Parte enviada anteriormente possui conteúdo diferente."});
   }
   return json(res,200,{ok:true,index,action:"chunk"});
  }
  try{
   const existing=await client.send(new HeadObjectCommand({Bucket:bucket,Key:official}));
   if(existing.ContentLength===a.fileSize&&existing.ContentType==="application/pdf"&&
    existing.Metadata?.sha256===a.fileHash)
    return json(res,200,{ok:true,objectKey:a.objectKey,resumed:true});
   return json(res,409,{error:"Esta revisão já contém outro PDF. O SIGAPRO não sobrescreve arquivos oficiais."});
  }catch(e){if(httpStatus(e)!==404)throw e;}
  const created=await client.send(new CreateMultipartUploadCommand({
   Bucket:bucket,Key:official,ContentType:"application/pdf",Metadata:{sha256:a.fileHash!},
  }));
  if(!created.UploadId)throw Error("MULTIPART_UPLOAD_ID_MISSING");
  let success=false;
  const assembledHash=createHash("sha256"),uploaded:{PartNumber:number;ETag:string}[]=[];
  let partial:Buffer[]=[],partialBytes=0,total=0;
  try {
   for(let i=0;i<a.count;i++){
    const data=await client.send(new GetObjectCommand({Bucket:bucket,Key:stage(i)}));
    if(!data.Body)throw Error("MISSING_CHUNK");
    const bytes=Buffer.from(await data.Body.transformToByteArray());
    const expected=i===a.count-1?a.fileSize-(a.count-1)*CHUNK_BYTES:CHUNK_BYTES;
    if(bytes.length!==expected||
     data.Metadata?.sha256!==createHash("sha256").update(bytes).digest("hex")||
     (i===0&&bytes.subarray(0,5).toString("ascii")!=="%PDF-"))
     throw Error("CORRUPTED_CHUNK");
    assembledHash.update(bytes);total+=bytes.length;partial.push(bytes);partialBytes+=bytes.length;
    if(partialBytes>=MIN_S3_PART||i===a.count-1){
     const number=uploaded.length+1;
     const part=await client.send(new UploadPartCommand({
      Bucket:bucket,Key:official,UploadId:created.UploadId,PartNumber:number,
      Body:Buffer.concat(partial,partialBytes),
     }));
     if(!part.ETag)throw Error("MISSING_PART_ETAG");
     uploaded.push({PartNumber:number,ETag:part.ETag});partial=[];partialBytes=0;
    }
   }
   if(total!==a.fileSize||assembledHash.digest("hex")!==a.fileHash)throw Error("BAD_FILE_SHA256");
   await client.send(new CompleteMultipartUploadCommand({
    Bucket:bucket,Key:official,UploadId:created.UploadId,
    MultipartUpload:{Parts:uploaded},
   }));
   success=true;
  }finally{
   if(!success)await client.send(new AbortMultipartUploadCommand({
    Bucket:bucket,Key:official,UploadId:created.UploadId,
   })).catch(()=>undefined);
  }
  const verified=await client.send(new HeadObjectCommand({Bucket:bucket,Key:official}));
  if(verified.ContentLength!==a.fileSize||verified.ContentType!=="application/pdf"||
   verified.Metadata?.sha256!==a.fileHash)
   return json(res,502,{error:"O armazenamento não confirmou a integridade do PDF."});
  await client.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{
   Objects:Array.from({length:a.count},(_,i)=>({Key:stage(i)})),Quiet:true,
  }})).catch(()=>undefined);
  return json(res,200,{ok:true,objectKey:a.objectKey,publicUrl:""});
 }catch(error){
  const code=httpStatus(error);
  return json(res,code===404||code===412?409:502,{
   code:"LEGAL_UPLOAD_STORAGE_FAILED",
   error:code===404?"Faltam partes do PDF; reenvie o documento. O arquivo anterior foi preservado.":
    "O armazenamento não concluiu o PDF em partes. A versão anterior foi preservada.",
  });
 }
}
