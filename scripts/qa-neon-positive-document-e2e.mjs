/**
 * Explicitly opted-in POSITIVE test against the isolated Neon QA Function.
 * Does not use production storage, process records, payment data or credentials.
 * Requires a real, user-authorized QA JWT passed as an ENV variable; never logs
 * secrets and never sends one to a CI log. The run creates and removes only
 * two uniquely named synthetic objects in this caller's QA protocol prefix.
 *
 * SIGAPRO_QA_DOCUMENT_E2E_OPT_IN=QA_ONLY_WITH_CLEANUP
 * SIGAPRO_QA_JWT=<valid QA session token>
 * SIGAPRO_QA_TENANT_ID=<QA municipality UUID>
 * Optional: SIGAPRO_QA_OTHER_JWT=<different authenticated QA session>
 *
 * Exercises the same owner-folder layout as the real SIGAPRO protocol UI:
 * municipalities/{tenant}/protocols/{authenticated_profile_id}/...
 * WARNING: a successful owner-prefix roundtrip does not validate the
 * separately scoped process linkage or signed browser login.
 */
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const QA_DOCUMENT_ENDPOINT=
  "https://br-solitary-sound-b4xlbvs6-sigaproqa.compute.c-6.us-east-2.aws.neon.tech";
export const QA_DOCUMENT_ORIGIN=
  "https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";
export const QA_DOCUMENT_CONTEXT_RPC=
  "https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1/rpc/get_current_profile_context";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRINCIPAL=/^[A-Za-z0-9_-]{1,128}$/;

function tokenSubject(token) {
  if(typeof token!=="string"||token.split(".").length!==3)
    throw new Error("Uma sessão JWT de homologação é necessária.");
  try {
    const value=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString("utf8"));
    if(typeof value.sub==="string"&&PRINCIPAL.test(value.sub))return value.sub;
  }catch{/* The guard below remains fatal. */}
  throw new Error("O token QA não contém um identificador de conta válido.");
}

export function validateQaDocumentE2eConfig(env) {
  if(env.SIGAPRO_QA_DOCUMENT_E2E_OPT_IN!=="QA_ONLY_WITH_CLEANUP")
    throw new Error("Teste positivo não autorizado: falta a opção explícita QA_ONLY_WITH_CLEANUP.");
  const tenant=String(env.SIGAPRO_QA_TENANT_ID||"");
  if(!UUID.test(tenant))throw new Error("Município QA inválido.");
  const token=String(env.SIGAPRO_QA_JWT||"");
  const subject=tokenSubject(token);
  const other=String(env.SIGAPRO_QA_OTHER_JWT||"");
  const otherSubject=other?tokenSubject(other):"";
  if(otherSubject&&subject===otherSubject)
    throw new Error("O segundo perfil QA deve representar outro usuário.");
  return {tenant,token,subject,other,otherSubject};
}

function minimalPdf() {
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let data="%PDF-1.4\n",offsets=[0];
  for(let i=0;i<objects.length;i++) {
    offsets.push(Buffer.byteLength(data));
    data+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xref=Buffer.byteLength(data);
  data+="xref\n0 5\n0000000000 65535 f \n";
  for(const offset of offsets.slice(1))
    data+=String(offset).padStart(10,"0")+" 00000 n \n";
  data+="trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n"+
    xref+"\n%%EOF\n";
  return Buffer.from(data);
}

// Tiny valid 1-by-1 JPEG generated for this QA-only script.
const JPEG_BASE64=
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6VooooA//2Q==";

const sha256=x=>createHash("sha256").update(x).digest("hex");
const uri=(action,key)=>QA_DOCUMENT_ENDPOINT+"/"+action+
  "?objectKey="+encodeURIComponent(key);

export async function runQaDocumentE2e(env=process.env,request=fetch,report=console.log) {
  const {tenant,token,subject,other}=validateQaDocumentE2eConfig(env);
  const unique=randomUUID();
  // Populate only after the authenticated Data API resolves the real QA
  // profile_id. SIGAPRO's actual uploadFileToStorage uses session.id (profile),
  // not the JWT subject, for municipality/protocols/{profile}/ keys.
  const documents=[];
  const uploaded=[],cleanupErrors=[];
  const send=async(action,method,jwt,body,contentType,key="")=>
    request(action==="list-user-files"?QA_DOCUMENT_ENDPOINT+"/list-user-files":uri(action,key),{
      method,headers:{
        "Authorization":"Bearer "+jwt,
        "Origin":QA_DOCUMENT_ORIGIN,
        ...(contentType?{"Content-Type":contentType}:{}),
      },...(body===undefined?{}:{body}),
      // Node's timeout signal is present in real QA execution. Browser-like
      // unit-test environments can omit it while using an injected fake fetch.
      redirect:"manual",
      ...(typeof AbortSignal.timeout==="function"?{signal:AbortSignal.timeout(30000)}:{}),
      cache:"no-store",
    });
  const status=async(response,expected,label)=>{
    if(response.status!==expected)throw new Error(label+
      ": expected HTTP "+expected+", received "+response.status);
    return response;
  };
  // Check the REAL authenticated municipality from the isolated Data API.
  // A second subject is insufficient to prove that two municipalities differ.
  // Fail before a single synthetic PUT if either account belongs to the wrong
  // QA municipality, or if the second is merely another user of the first.
  const currentQaTenant=async(jwt)=>{
    const result=await request(QA_DOCUMENT_CONTEXT_RPC,{
      method:"POST",headers:{Authorization:"Bearer "+jwt,
        Origin:QA_DOCUMENT_ORIGIN,"Content-Type":"application/json"},
      body:"{}",redirect:"manual",
      ...(typeof AbortSignal.timeout==="function"?{signal:AbortSignal.timeout(30000)}:{}),
      cache:"no-store",
    });
    await status(result,200,"Authenticated QA municipality");
    const context=await result.json();
    const resolved=typeof context?.tenant_id==="string"?context.tenant_id:
      typeof context?.municipality_id==="string"?context.municipality_id:"";
    if(!UUID.test(resolved))throw new Error("The QA session has no valid municipal affiliation.");
    const profile=typeof context?.profile_id==="string"?context.profile_id:"";
    if(!UUID.test(profile))throw new Error("The QA session has no valid municipal profile ID.");
    return {tenant:resolved.toLowerCase(),profile:profile.toLowerCase()};
  };
  let primaryError;
  try {
    const owner=await currentQaTenant(token);
    if(owner.tenant!==tenant.toLowerCase())
      throw new Error("Primary QA user does not belong to the specified test municipality.");
    if(other){
      const secondary=await currentQaTenant(other);
      if(secondary.tenant===owner.tenant)
        throw new Error("The second QA user must belong to a different verified municipality.");
    }
    const prefix="municipalities/"+owner.tenant+"/protocols/"+owner.profile+"/";
    documents.push(
      {key:prefix+"qa-e2e-"+unique+".pdf",data:minimalPdf(),mime:"application/pdf"},
      {key:prefix+"qa-e2e-"+unique+".jpg",data:Buffer.from(JPEG_BASE64,"base64"),mime:"image/jpeg"},
    );
    for(const doc of documents) {
      // A request can time out *after* Neon has already committed the PUT.
      // Register this unique synthetic key BEFORE sending; cleanup will
      // attempt a DELETE even if the transport or acknowledgment fails.
      uploaded.push(doc);
      const upload=await send("upload","POST",token,doc.data,doc.mime,doc.key);
      await status(upload,200,"Private QA upload");
      const payload=await upload.json();
      if(payload.ok!==true||payload.objectKey!==doc.key||
         payload.storageProvider!=="neon_qa_function")
        throw new Error("Upload acknowledgment did not match the isolated Neon QA object.");
      const read=await send("read","GET",token,undefined,undefined,doc.key);
      await status(read,200,"Private QA download");
      const result=Buffer.from(await read.arrayBuffer());
      if(result.byteLength!==doc.data.byteLength||sha256(result)!==sha256(doc.data)||
         read.headers.get("Content-Type")!==doc.mime)
        throw new Error("Uploaded document did not match its private QA download.");
      report("PASS: QA "+(doc.mime==="application/pdf"?"PDF":"JPEG")+" upload, private read and SHA-256 integrity");
      if(other)await status(await send("read","GET",other,undefined,undefined,doc.key),403,
        "Different QA user must not read the original owner's document");
    }
    const since=new Date(Date.now()-60*60*1000).toISOString();
    const list=await send("list-user-files","POST",token,JSON.stringify({since}),"application/json");
    await status(list,200,"Authorized private QA recovery list");
    const found=await list.json();
    if(found.storageProvider!=="neon_qa_function"||
       !Array.isArray(found.files)||
       !documents.every(doc=>found.files.some(file=>file.objectKey===doc.key&&file.size===doc.data.length)))
      throw new Error("The QA recovery list does not contain all uploaded synthetic documents.");
    report("PASS: QA authorized document recovery list");
    if(other)report("PASS: authenticated user from another verified QA municipality denied access to private files");
    else report("SKIPPED: cross-municipality signed-session verification; second QA account unavailable");
  }catch(error) {
    primaryError=error;
  }finally {
    // Strict cleanup: even if a PUT timed out after persisting, delete all
    // synthetic keys whose upload was attempted. Never touch other keys.
    for(const doc of uploaded){
      try {
        const deleted=await send("object","DELETE",token,undefined,undefined,doc.key);
        await status(deleted,200,"QA synthetic object cleanup");
        const payload=await deleted.json();
        if(payload.ok!==true||payload.objectKey!==doc.key)
          throw new Error("QA deletion was not confirmed");
        const check=await send("read","GET",token,undefined,undefined,doc.key);
        await status(check,404,"QA cleanup verification");
      }catch(error){cleanupErrors.push(error);}
    }
  }
  if(cleanupErrors.length)
    throw new Error("QA cleanup could not be verified for "+cleanupErrors.length+
      " synthetic item(s); investigate the isolated QA bucket manually.");
  if(primaryError)throw primaryError;
  report("PASS: QA cleanup verified; no synthetic object was left behind");
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runQaDocumentE2e().catch(error=>{
    console.error("QA document acceptance failed: "+
      (error instanceof Error?error.message:"unknown error"));
    process.exitCode=1;
  });
}
