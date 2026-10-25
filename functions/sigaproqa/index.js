import { createHash, createHmac } from "node:crypto";

// QA-only Neon Function. The branch supplies AWS_* storage credentials
// directly; none are transferred to Vercel or exposed to the browser.
const ENDPOINT = "https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech";
const BUCKET = "sigapro-qa-urban-documents";
const REGION = "us-east-2";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
function contentType(key) {
  const ext=key.split(".").at(-1)?.toLowerCase();
  if(ext==="pdf")return "application/pdf";
  if(ext==="png")return "image/png";
  if(ext==="jpg"||ext==="jpeg")return "image/jpeg";
  if(ext==="webp")return "image/webp";
  return "";
}
function validMagic(mime,bytes) {
  if(mime==="application/pdf")return bytes.length>=5 &&
    new TextDecoder().decode(bytes.subarray(0,5))==="%PDF-";
  if(mime==="image/png")return bytes.length>=8 &&
    [137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);
  if(mime==="image/jpeg")return bytes.length>=3 &&
    bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==="image/webp")return bytes.length>=12 &&
    new TextDecoder().decode(bytes.subarray(0,4))==="RIFF" &&
    new TextDecoder().decode(bytes.subarray(8,12))==="WEBP";
  return false;
}
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PROCESS_KEY = new RegExp("^municipalities/("+UUID+")/processes/("+UUID+")/[a-zA-Z0-9_./() -]+\\.(?:pdf|png|jpe?g|webp)$", "i");
const OWNER_KEY = new RegExp("^municipalities/("+UUID+")/(?:protocols|habite-se)/([a-zA-Z0-9_-]+)/[a-zA-Z0-9_.() -]+\\.(?:pdf|png|jpe?g|webp)$", "i");
const LAW_KEY = new RegExp("^municipalities/("+UUID+")/legislation(?:[-/])[a-zA-Z0-9_./() -]+\\.pdf$", "i");
const ORIGINS = new Set([
  // Stable branch alias plus the original QA acceptance deployment.
  "https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app",
  "https://projetosigapro01-dfv7zlx7v-roksparta8724s-projects.vercel.app",
]);
// Every new immutable Vercel preview receives a 9-character deployment ID.
// Only SIGAPRO deployments under the actual project-owning team are allowed:
// an arbitrary *.vercel.app hostname must never pass QA CORS.
const QA_DEPLOYMENT_ORIGIN =
  /^https:\/\/projetosigapro01-[a-z0-9]{9}-roksparta8724s-projects\.vercel\.app$/;
function approvedQaOrigin(origin) {
  return ORIGINS.has(origin)||QA_DEPLOYMENT_ORIGIN.test(origin);
}

// Some browser-like test runtimes provide AbortSignal without its timeout helper.
function requestTimeout(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer.unref === "function") timer.unref();
  return controller.signal;
}
const sha = data => createHash("sha256").update(data).digest("hex");
const mac = (key,data) => createHmac("sha256",key).update(data).digest();
function s3Env() {
  const e = process.env;
  if (e.AWS_ENDPOINT_URL_S3 !== ENDPOINT || !e.AWS_ACCESS_KEY_ID ||
      !e.AWS_SECRET_ACCESS_KEY) throw new Error("QA_STORAGE_UNAVAILABLE");
  return e;
}
function s3Request(method,key,bytes,query="") {
  const e=s3Env();
  const url=new URL(ENDPOINT);
  const path="/"+BUCKET+(key?"/"+key.split("/").map(encodeURIComponent).join("/"):"");
  url.pathname=path;
  if(query)url.search="?"+query;
  const datetime=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");
  const day=datetime.slice(0,8);
  const payloadHash=sha(bytes||new Uint8Array());
  const headers={"x-amz-date":datetime,"x-amz-content-sha256":payloadHash};
  if(e.AWS_SESSION_TOKEN) headers["x-amz-security-token"]=e.AWS_SESSION_TOKEN;
  const signedKeys=["host",...Object.keys(headers)].sort();
  const all={"host":url.host,...headers};
  const canonical=signedKeys.map(k=>k+":"+all[k]+"\n").join("");
  const canonicalRequest=[method,path,query,canonical,signedKeys.join(";"),payloadHash].join("\n");
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
    body:JSON.stringify(args),signal:requestTimeout(12000),
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
async function authorize(token,scope,write,readProcessId="") {
 const membership=await rpc(token,"has_tenant_access",{target_tenant:scope.tenant});
 if(membership!==true)return false;
 if(scope.type==="owner"){
  const [subject,profile]=await Promise.all([rpc(token,"current_auth_subject"),rpc(token,"current_profile_id")]);
  if(scope.principal&&(scope.principal===subject||scope.principal===profile))
    return true;
  // A process-authorized municipal analyst may READ the original applicant
  // only within the explicitly requested municipality-bound process.
  // Other users never gain write/delete to the applicant's personal folder.
  if(write||!readProcessId||!ID.test(readProcessId))return false;
  if(await rpc(token,"qa_storage_process_tenant_access_v1",{
    _process_id:readProcessId,_tenant_id:scope.tenant
  })!==true)return false;
  const allowed=await rpc(token,"qa_storage_recovery_principals_v1",{
    _process_id:readProcessId,_tenant_id:scope.tenant
  });
  if(!Array.isArray(allowed)||allowed.length>10||
     !allowed.includes(scope.principal))return false;
  // One applicant can submit objects to multiple unrelated protocols.
  // Creator identity and municipality alone are not proof of provenance.
  const linked=await rpc(token,"qa_storage_process_file_keys_v1",{
    _process_id:readProcessId,_tenant_id:scope.tenant
  });
  return Array.isArray(linked)&&linked.length<=1000&&
    linked.every(key=>typeof key==="string"&&key.length<=850)&&
    linked.includes(scope.key);
 }
 if(scope.type==="process"){
  // Bind the object key municipality to the process municipality in one authorized QA RPC.
  if(await rpc(token,"qa_storage_process_tenant_access_v1",{_process_id:scope.process,_tenant_id:scope.tenant})!==true)return false;
  return !write||await rpc(token,"can_write_process_analysis",{_process_id:scope.process})===true;
 }
 if(scope.type==="law"){
  return !write||await rpc(token,"is_urban_regulation_admin_v1",{_municipality_id:scope.tenant})===true;
 }
 return false;
}
const ID = new RegExp("^"+UUID+"$","i");
const OWN_PRINCIPAL = /^[A-Za-z0-9_-]{1,128}$/;
const xmlValue = (xml, tag) => {
  const match=xml.match(new RegExp("<"+tag+">([\\s\\S]*?)<\\/"+tag+">","i"));
  return match?.[1]||"";
};
function xmlUnescape(raw) {
  return raw.replace(/&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-f]+|[0-9]+));/gi, entity=>{
    const values={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};
    const normalized=entity.toLowerCase();
    if(values[normalized])return values[normalized];
    const h=normalized.startsWith("&#x");
    const cp=parseInt(normalized.slice(h?3:2,-1),h?16:10);
    return Number.isInteger(cp)&&cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):"";
  });
}
function decodeListedKey(raw) {
  const value=xmlUnescape(raw);
  try{return decodeURIComponent(value);}catch{return "";}
}
// SigV4 requires RFC 3986 canonical query encoding (not form URL encoding).
// In particular, spaces must be %20, never '+', and '~' must remain literal.
function canonicalS3Query(pairs) {
  const escape=value=>encodeURIComponent(value).replace(/[!'()*]/g,char=>
    "%"+char.charCodeAt(0).toString(16).toUpperCase());
  return pairs.map(([key,value])=>[escape(String(key)),escape(String(value))])
    .sort((a,b)=>a[0]===b[0]?(a[1]<b[1]?-1:a[1]>b[1]?1:0):(a[0]<b[0]?-1:1))
    .map(([key,value])=>key+"="+value).join("&");
}
function assertCompleteS3Listing(xml) {
  // S3 ListObjectsV2 is authoritative only when its framing, item records
  // and explicit IsTruncated flag are present. Never call a partial page
  // a successful recovery of all available documents.
  const root=/<ListBucketResult(?:\s[^>]*)?>/.test(xml) &&
    /<\/ListBucketResult>\s*$/.test(xml);
  const flag=xmlValue(xml,"IsTruncated").trim();
  const opens=(xml.match(/<Contents>/g)||[]).length;
  const closes=(xml.match(/<\/Contents>/g)||[]).length;
  if(!root||(flag!=="true"&&flag!=="false")||opens!==closes)
    throw new Error("QA_STORAGE_INVALID_LIST");
  for(const entry of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const raw=entry[1],rawKey=xmlValue(raw,"Key");
    const key=decodeListedKey(rawKey);
    const size=xmlValue(raw,"Size"),when=xmlValue(raw,"LastModified");
    if(!rawKey||!key||!/^[0-9]+$/.test(size)||
       !Number.isSafeInteger(Number(size))||!Number.isFinite(Date.parse(when)))
      throw new Error("QA_STORAGE_INVALID_LIST");
  }
  return flag==="true";
}
function listEntries(xml,prefix,since) {
  const found=[];
  for(const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const value=match[1];
    const key=decodeListedKey(xmlValue(value,"Key"));
    const size=Number(xmlValue(value,"Size"));
    const when=Date.parse(xmlValue(value,"LastModified"));
    if(!key.startsWith(prefix)||!validKey(key)||!Number.isSafeInteger(size)||
       size<0||!Number.isFinite(when)||when<since)continue;
    found.push({objectKey:key,fileName:key.split("/").at(-1)||"arquivo",
      size,lastModified:new Date(when).toISOString()});
  }
  return found;
}
async function requestJsonBody(request) {
  if(!request.body)return {};
  const reader=request.body.getReader(),chunks=[];
  let length=0;
  while(true) {
    const part=await reader.read();
    if(part.done)break;
    length+=part.value.byteLength;
    if(length>2048){await reader.cancel();return null;}
    chunks.push(part.value);
  }
  const input=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){input.set(chunk,offset);offset+=chunk.byteLength;}
  try {
    const data=JSON.parse(new TextDecoder().decode(input)||"{}");
    return data&&typeof data==="object"&&!Array.isArray(data)?data:null;
  }catch{return null;}
}
async function recoverQaFiles(request,token,origin) {
  const input=await requestJsonBody(request);
  if(!input)return respond({code:"INVALID_RECOVERY_REQUEST"},400,origin);
  const processId=typeof input.processId==="string"?input.processId.trim():"";
  if(processId&&!ID.test(processId))return respond({code:"INVALID_PROCESS"},400,origin);
  const [context,subject,profile]=await Promise.all([
    rpc(token,"get_current_profile_context"),rpc(token,"current_auth_subject"),
    rpc(token,"current_profile_id")
  ]);
  const tenant=typeof context?.tenant_id==="string"?context.tenant_id:
    typeof context?.municipality_id==="string"?context.municipality_id:"";
  if(!ID.test(tenant))return respond({code:"ACCESS_DENIED"},403,origin);
  const authorized=await rpc(token,"has_tenant_access",{target_tenant:tenant});
  if(authorized!==true)return respond({code:"ACCESS_DENIED"},403,origin);
  if(processId&&await rpc(token,"qa_storage_process_tenant_access_v1",
    {_process_id:processId,_tenant_id:tenant})!==true)
    return respond({code:"ACCESS_DENIED"},403,origin);
  let processLinkedKeys=null;
  let principals=[...new Set([subject,profile,context?.profile_id].filter(
    value=>typeof value==="string"&&OWN_PRINCIPAL.test(value)))];
  if(!principals.length)return respond({code:"ACCESS_DENIED"},403,origin);
  if(processId) {
    // Original owner folders can contain other protocols' private files.
    // Only an exact recorded document key or the process-specific folder
    // establishes provenance. Missing RPC => deny before reading storage.
    const verified=await rpc(token,"qa_storage_process_file_keys_v1",{
      _process_id:processId,_tenant_id:tenant
    });
    if(!Array.isArray(verified)||verified.length>1000||
       !verified.every(key=>typeof key==="string"&&key.length<=850))
      return respond({code:"ACCESS_DENIED"},403,origin);
    processLinkedKeys=new Set(verified);
    // Municipal analysts must search the *original applicant's* catalogued
    // protocol uploads, not only their own account's folders. The QA RPC
    // derives creator identities from that exact authorized municipality-
    // bound process; never trust IDs supplied by the browser.
    const creators=await rpc(token,"qa_storage_recovery_principals_v1",{
      _process_id:processId,_tenant_id:tenant
    });
    if(!Array.isArray(creators)||creators.length>10||
       !creators.every(value=>typeof value==="string"&&OWN_PRINCIPAL.test(value)))
      return respond({code:"ACCESS_DENIED"},403,origin);
    principals=[...new Set(creators)];
  }
  // A process-scoped recovery is a historical search: old applications
  // must not disappear after the last seven days. The ordinary personal
  // inbox still defaults to a bounded recent interval.
  const since=input.since===undefined
    ? (processId?0:Date.now()-7*86400_000)
    : typeof input.since==="string"?Date.parse(input.since):NaN;
  if(!Number.isFinite(since)||since<0)
    return respond({code:"INVALID_RECOVERY_DATE"},400,origin);
  const prefixes=["protocols","habite-se"].flatMap(folder=>
    principals.map(principal=>"municipalities/"+tenant+"/"+folder+"/"+principal+"/"));
  // The request's process has already passed the municipality-bound RPC.
  // Recover its analysis/vistoria files too, not only owner protocol drafts.
  if(processId)prefixes.push("municipalities/"+tenant+"/processes/"+processId+"/");
  const groups=await Promise.all(prefixes.map(async prefix=>{
    const entries=[],tokens=new Set();
    let next="";
    // Do not quietly omit documents beyond S3's first lexicographic page.
    // Bound the work so an untrusted or malformed continuation cannot cause
    // endless storage calls. An oversized list fails explicitly instead.
    for(let page=0;page<12;page++){
      const parameters=[
        ...(next?[["continuation-token",next]]:[]),
        ["encoding-type","url"],["list-type","2"],["max-keys","250"],["prefix",prefix]
      ];
      const query=canonicalS3Query(parameters);
      const signed=s3Request("GET","",undefined,query);
      const r=await fetch(signed.url,{method:"GET",headers:signed.headers,
        redirect:"manual",signal:requestTimeout(45000)});
      if(!r.ok)throw new Error("QA_STORAGE_UNAVAILABLE");
      const xml=await r.text();
      if(xml.length>2*1024*1024||!xml.includes("<ListBucketResult"))
        throw new Error("QA_STORAGE_INVALID_LIST");
      const isTruncated=assertCompleteS3Listing(xml);
      entries.push(...listEntries(xml,prefix,since));
      if(!isTruncated)return entries;
      next=xmlUnescape(xmlValue(xml,"NextContinuationToken"));
      if(!next||next.length>1024||tokens.has(next))
        throw new Error("QA_STORAGE_INVALID_CONTINUATION");
      tokens.add(next);
    }
    throw new Error("QA_STORAGE_LIST_PAGE_LIMIT");
  }));
  const seen=new Set(),files=groups.flat().filter(entry=>
    !processId || entry.objectKey.startsWith("municipalities/"+tenant+"/processes/"+processId+"/") ||
      processLinkedKeys?.has(entry.objectKey)
  ).sort((a,b)=>
    Date.parse(b.lastModified)-Date.parse(a.lastModified)).filter(x=>{
      if(seen.has(x.objectKey))return false;
      seen.add(x.objectKey);return true;
    });
  // Never silently truncate a municipality's documents: a user can narrow
  // the date interval and retry rather than mistake 250 rows for all files.
  if(files.length>250)return respond({code:"QA_RECOVERY_RESULT_LIMIT",
    limit:250},409,origin);
  return respond({files,storageProvider:"neon_qa_function"},200,origin);
}
export default {
 async fetch(request) {
  const origin=request.headers.get("Origin")||"";
  const approved=approvedQaOrigin(origin)?origin:"";
  const path=new URL(request.url);
  if(request.method==="OPTIONS") {
   return approved?new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":approved,
     "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
     "Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Max-Age":"300",
     "Cache-Control":"no-store","Vary":"Origin"}}):respond({code:"ORIGIN_FORBIDDEN"},403);
  }
  if(origin&&!approved)return respond({code:"ORIGIN_FORBIDDEN"},403);
  if(!["/upload","/read","/object","/list-user-files"].includes(path.pathname))return respond({code:"NOT_FOUND"},404,approved);
  const token=(request.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return respond({code:"AUTH_REQUIRED"},401,approved);
  if(path.pathname==="/list-user-files") {
    if(request.method!=="POST")return respond({code:"METHOD_NOT_ALLOWED"},405,approved);
    try{return await recoverQaFiles(request,token,approved);}
    catch{return respond({code:"QA_STORAGE_UNAVAILABLE"},503,approved);}
  }
  const scope=validKey(path.searchParams.get("objectKey"));
  if(!scope)return respond({code:"INVALID_OBJECT_KEY"},400,approved);
  const mime=contentType(scope.key);
  const write=request.method==="POST"||request.method==="DELETE";
  if((path.pathname==="/upload"&&request.method!=="POST")||
     (path.pathname==="/read"&&request.method!=="GET")||
     (path.pathname==="/object"&&request.method!=="DELETE"))
     return respond({code:"METHOD_NOT_ALLOWED"},405,approved);
  try {
   const requestedProcess=path.pathname==="/read"
     ? path.searchParams.get("processId")||"":"";
   if(requestedProcess&&!ID.test(requestedProcess))
     return respond({code:"INVALID_PROCESS"},400,approved);
   if(!await authorize(token,scope,write,requestedProcess))
     return respond({code:"ACCESS_DENIED"},403,approved);
   // A process's catalog record and its path-derived legacy file_hash are
   // not independently trustworthy evidence of the original file bytes.
   let verifiedBytesSha="";
   if(path.pathname==="/read"&&scope.type==="owner"&&requestedProcess){
     const [subject,profile]=await Promise.all([
       rpc(token,"current_auth_subject"),rpc(token,"current_profile_id")
     ]);
     if(scope.principal!==subject&&scope.principal!==profile){
       const evidence=await rpc(token,"qa_storage_verified_file_sha_v1",{
         _process_id:requestedProcess,_tenant_id:scope.tenant,_object_key:scope.key
       });
       if(typeof evidence!=="string"||!/^[a-f0-9]{64}$/.test(evidence))
         return respond({code:"QA_PROVENANCE_NOT_VERIFIED"},403,approved);
       verifiedBytesSha=evidence;
     }
   }
   let bytes;
   if(write&&request.method==="POST"){
    if(request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase()!==mime)
      return respond({code:"UNSUPPORTED_MEDIA_TYPE"},415,approved);
    // Browsers may omit Content-Length on streamed HTTP/2 uploads. Cap the
    // streamed bytes ourselves rather than requiring a browser-forbidden header.
    const rawLength=request.headers.get("Content-Length");
    const declared=rawLength===null?null:Number(rawLength);
    if(declared!==null&&(!Number.isSafeInteger(declared)||declared<1))
      return respond({code:"INVALID_CONTENT_LENGTH"},400,approved);
    if(declared!==null&&declared>MAX_FILE_BYTES)
      return respond({code:"FILE_TOO_LARGE"},413,approved);
    if(!request.body)return respond({code:"EMPTY_PDF"},400,approved);
    const chunks=[],reader=request.body.getReader();
    let total=0,tooLarge=false;
    while(true){
      const part=await reader.read();
      if(part.done)break;
      total+=part.value.byteLength;
      if(total>MAX_FILE_BYTES){tooLarge=true;await reader.cancel();break;}
      chunks.push(part.value);
    }
    if(tooLarge)return respond({code:"FILE_TOO_LARGE"},413,approved);
    if(total<3||(declared!==null&&declared!==total))
      return respond({code:"INVALID_FILE"},400,approved);
    bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    if(!validMagic(mime,bytes))
      return respond({code:mime==="application/pdf"?"INVALID_PDF":"INVALID_IMAGE"},400,approved);
   }
   const method=request.method==="POST"?"PUT":request.method;
   const signed=s3Request(method,scope.key,bytes);
   const remote=await fetch(signed.url,{
     method,headers:{...signed.headers,...(bytes?{"Content-Type":mime}:{})},
     body:bytes,signal:requestTimeout(45000),redirect:"manual",
   });
   if(!remote.ok)return respond({code:remote.status===404?"NOT_FOUND":"QA_STORAGE_ERROR"},remote.status===404?404:503,approved);
   if(method==="GET"){
      const h={"Content-Type":mime,"Content-Disposition":"inline","X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Vary":"Origin"};
      if(approved)h["Access-Control-Allow-Origin"]=approved;
      if(verifiedBytesSha){
        const raw=await remote.arrayBuffer();
        if(raw.byteLength<1||raw.byteLength>MAX_FILE_BYTES||
           sha(new Uint8Array(raw))!==verifiedBytesSha)
          return respond({code:"QA_STORAGE_INTEGRITY_MISMATCH"},409,approved);
        return new Response(raw,{status:200,headers:h});
      }
      return new Response(remote.body,{status:200,headers:h});
   }
   return respond({ok:true,objectKey:scope.key,bucket:"process-documents",storageProvider:"neon_qa_function"},200,approved);
  } catch {
   return respond({code:"QA_STORAGE_UNAVAILABLE"},503,approved);
  }
 }
};
