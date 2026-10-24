import { createHash, createHmac } from "node:crypto";

// QA-only Neon Function. The branch supplies AWS_* storage credentials
// directly; none are transferred to Vercel or exposed to the browser.
const ENDPOINT = "https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech";
const BUCKET = "sigapro-qa-urban-documents";
const REGION = "us-east-2";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PROCESS_KEY = new RegExp("^municipalities/("+UUID+")/processes/("+UUID+")/[a-zA-Z0-9_./() -]+\\.pdf$", "i");
const OWNER_KEY = new RegExp("^municipalities/("+UUID+")/(?:protocols|habite-se)/([a-zA-Z0-9_-]+)/[a-zA-Z0-9_.() -]+\\.pdf$", "i");
const LAW_KEY = new RegExp("^municipalities/("+UUID+")/legislation(?:[-/])[a-zA-Z0-9_./() -]+\\.pdf$", "i");
const ORIGINS = new Set([
  "https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app",
  "https://projetosigapro01-dfv7zlx7v-roksparta8724s-projects.vercel.app",
]);

const sha = data => createHash("sha256").update(data).digest("hex");
const mac = (key,data) => createHmac("sha256",key).update(data).digest();
function s3Env() {
  const e = process.env;
  if (e.AWS_ENDPOINT_URL_S3 !== ENDPOINT || !e.AWS_ACCESS_KEY_ID ||
      !e.AWS_SECRET_ACCESS_KEY) throw new Error("QA_STORAGE_UNAVAILABLE");
  return e;
}
function s3Request(method,key,bytes) {
  const e=s3Env();
  const url=new URL(ENDPOINT);
  const path="/"+BUCKET+"/"+key.split("/").map(encodeURIComponent).join("/");
  url.pathname=path;
  const datetime=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");
  const day=datetime.slice(0,8);
  const payloadHash=sha(bytes||new Uint8Array());
  const headers={"x-amz-date":datetime,"x-amz-content-sha256":payloadHash};
  if(e.AWS_SESSION_TOKEN) headers["x-amz-security-token"]=e.AWS_SESSION_TOKEN;
  const signedKeys=["host",...Object.keys(headers)].sort();
  const all={"host":url.host,...headers};
  const canonical=signedKeys.map(k=>k+":"+all[k]+"\n").join("");
  const canonicalRequest=[method,path,"",canonical,signedKeys.join(";"),payloadHash].join("\n");
  const scope=day+"/"+REGION+"/s3/aws4_request";
  const stringToSign=["AWS4-HMAC-SHA256",datetime,scope,sha(canonicalRequest)].join("\n");
  const keySign=mac(mac(mac(mac("AWS4"+e.AWS_SECRET_ACCESS_KEY,day),REGION),"s3"),"aws4_request");
  const signature=createHmac("sha256",keySign).update(stringToSign).digest("hex");
  headers.Authorization="AWS4-HMAC-SHA256 Credential="+e.AWS_ACCESS_KEY_ID+"/"+scope+
    ", SignedHeaders="+signedKeys.join(";")+", Signature="+signature;
  return {url:url.toString(),headers};
}
function respond(data,status=200,origin="") {
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};
  if(origin) {headers["Access-Control-Allow-Origin"]=origin;headers["Access-Control-Allow-Headers"]="authorization,content-type";headers["Access-Control-Allow-Methods"]="GET,POST,DELETE,OPTIONS";}
  return new Response(JSON.stringify(data),{status,headers});
}
async function rpc(token,name,args={}) {
  const base=process.env.NEON_DATA_API_URL||"";
  if(base.replace(/\/+$/,"") !== "https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1") return null;
  const r=await fetch(base.replace(/\/+$/,"")+"/rpc/"+name,{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify(args),signal:AbortSignal.timeout(12000),
  });
  if(!r.ok)return null;
  return r.json().catch(()=>null);
}
function validKey(key) {
 if(typeof key!=="string"||key.length>850||key.includes("..")||key.includes("//")||
    key.includes("\\")||/[\r\n]/.test(key)||key.includes("/dam-originals/")) return null;
 let match=key.match(PROCESS_KEY);
 if(match)return {type:"process",tenant:match[1],process:match[2],key};
 match=key.match(OWNER_KEY);
 if(match)return {type:"owner",tenant:match[1],principal:match[2],key};
 match=key.match(LAW_KEY);
 return match?{type:"law",tenant:match[1],key}:null;
}
async function authorize(token,scope,write) {
 const membership=await rpc(token,"has_tenant_access",{target_tenant:scope.tenant});
 if(membership!==true)return false;
 if(scope.type==="owner"){
  const [subject,profile]=await Promise.all([rpc(token,"current_auth_subject"),rpc(token,"current_profile_id")]);
  return Boolean(scope.principal&&(scope.principal===subject||scope.principal===profile));
 }
 if(scope.type==="process"){
  if(await rpc(token,"has_process_access",{_process_id:scope.process})!==true)return false;
  return !write||await rpc(token,"can_write_process_analysis",{_process_id:scope.process})===true;
 }
 if(scope.type==="law"){
  return !write||await rpc(token,"is_urban_regulation_admin_v1",{_municipality_id:scope.tenant})===true;
 }
 return false;
}
export default {
 async fetch(request) {
  const origin=request.headers.get("Origin")||"";
  const approved=ORIGINS.has(origin)?origin:"";
  const path=new URL(request.url);
  if(request.method==="OPTIONS") {
   return approved?new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":approved,
     "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
     "Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Max-Age":"300",
     "Cache-Control":"no-store","Vary":"Origin"}}):respond({code:"ORIGIN_FORBIDDEN"},403);
  }
  if(origin&&!approved)return respond({code:"ORIGIN_FORBIDDEN"},403);
  if(!["/upload","/read","/object"].includes(path.pathname))return respond({code:"NOT_FOUND"},404,approved);
  const token=(request.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return respond({code:"AUTH_REQUIRED"},401,approved);
  const scope=validKey(path.searchParams.get("objectKey"));
  if(!scope)return respond({code:"INVALID_OBJECT_KEY"},400,approved);
  const write=request.method==="POST"||request.method==="DELETE";
  if((path.pathname==="/upload"&&request.method!=="POST")||
     (path.pathname==="/read"&&request.method!=="GET")||
     (path.pathname==="/object"&&request.method!=="DELETE"))
     return respond({code:"METHOD_NOT_ALLOWED"},405,approved);
  try {
   if(!await authorize(token,scope,write))return respond({code:"ACCESS_DENIED"},403,approved);
   let bytes;
   if(write&&request.method==="POST"){
    if(request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase()!=="application/pdf")
      return respond({code:"PDF_ONLY"},415,approved);
    // Browsers may omit Content-Length on streamed HTTP/2 uploads. Cap the
    // streamed bytes ourselves rather than requiring a browser-forbidden header.
    const rawLength=request.headers.get("Content-Length");
    const declared=rawLength===null?null:Number(rawLength);
    if(declared!==null&&(!Number.isSafeInteger(declared)||declared<1))
      return respond({code:"INVALID_CONTENT_LENGTH"},400,approved);
    if(declared!==null&&declared>MAX_PDF_BYTES)
      return respond({code:"FILE_TOO_LARGE"},413,approved);
    if(!request.body)return respond({code:"EMPTY_PDF"},400,approved);
    const chunks=[],reader=request.body.getReader();
    let total=0,tooLarge=false;
    while(true){
      const part=await reader.read();
      if(part.done)break;
      total+=part.value.byteLength;
      if(total>MAX_PDF_BYTES){tooLarge=true;await reader.cancel();break;}
      chunks.push(part.value);
    }
    if(tooLarge)return respond({code:"FILE_TOO_LARGE"},413,approved);
    if(total<5||(declared!==null&&declared!==total))
      return respond({code:"INVALID_PDF"},400,approved);
    bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    if(new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-")
      return respond({code:"INVALID_PDF"},400,approved);
   }
   const method=request.method==="POST"?"PUT":request.method;
   const signed=s3Request(method,scope.key,bytes);
   const remote=await fetch(signed.url,{
     method,headers:{...signed.headers,...(bytes?{"Content-Type":"application/pdf"}:{})},
     body:bytes,signal:AbortSignal.timeout(45000),redirect:"manual",
   });
   if(!remote.ok)return respond({code:remote.status===404?"NOT_FOUND":"QA_STORAGE_ERROR"},remote.status===404?404:503,approved);
   if(method==="GET"){
      const h={"Content-Type":"application/pdf","Content-Disposition":"inline","Cache-Control":"private, no-store","Vary":"Origin"};
      if(approved)h["Access-Control-Allow-Origin"]=approved;
      return new Response(remote.body,{status:200,headers:h});
   }
   return respond({ok:true,objectKey:scope.key,bucket:"process-documents",storageProvider:"neon_qa_function"},200,approved);
  } catch (error) {
   if (process.env.NODE_ENV === "test") console.error("SIGAPRO_QA_UNIT_ERROR",error instanceof Error ? error.name + ": " + error.message : String(error));
   return respond({code:"QA_STORAGE_UNAVAILABLE"},503,approved);
  }
 }
};
