export const QA_NATIVE_BASE="https://br-solitary-sound-b4xlbvs6-sigaproqa.compute.c-6.us-east-2.aws.neon.tech";
export const QA_NATIVE_MAX_PDF_BYTES=25*1024*1024;
const types:Record<string,string>={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"};
export function qaNativeMimeForKey(key:string) {
 return types[key.split(".").at(-1)?.toLowerCase()||""]||"";
}
export function validateNativeDocument(file:Pick<File,"name"|"size"|"type">,key?:string) {
 if(!Number.isSafeInteger(file.size)||file.size<=0)throw new Error("Arquivo vazio ou inválido.");
 if(file.size>QA_NATIVE_MAX_PDF_BYTES)throw new Error("O limite de documentos na homologação é 25 MB.");
 const mime=qaNativeMimeForKey(file.name);
 if(!mime||(file.type&&file.type.toLowerCase()!==mime))
   throw new Error("O envio direto aceita somente PDF, PNG, JPG e WebP com formato correspondente.");
 if(key&&qaNativeMimeForKey(key)!==mime)
   throw new Error("O formato do arquivo não corresponde ao caminho do documento.");
 return mime;
}
export function resolveQaNativeUrl(isolated:boolean,value:string|undefined) {
 return isolated && String(value||"").trim().replace(/\/+$/,"")===QA_NATIVE_BASE ? QA_NATIVE_BASE:"";
}
export function validateNativePdf(file:Pick<File,"name"|"size"|"type">) {
 const mime=validateNativeDocument(file);
 if(mime!=="application/pdf")throw new Error("O envio direto da homologação aceita somente PDF.");
}
function target(base:string,action:"upload"|"read"|"object",key:string) {
 if(base!==QA_NATIVE_BASE)throw new Error("Destino isolado de QA inválido.");
 return base+"/"+action+"?objectKey="+encodeURIComponent(key);
}
function bearer(headers:Record<string,string>) {
 const value=headers.Authorization||headers.authorization||"";
 if(!/^Bearer\s+\S+$/i.test(value))throw new Error("Faça login novamente para acessar o documento.");
 return value;
}
async function failure(r:Response,label:string) {
 const body=await r.json().catch(()=>null) as {code?:string}|null;
 if(r.status===401)return "Sua sessão expirou. Faça login novamente.";
 if(r.status===403)return "Seu perfil não tem permissão para este documento.";
 if(r.status===413)return "O PDF excede 25 MB.";
 return label+" ("+String(body?.code||r.status)+").";
}
export async function uploadQaNative(input:{
 base:string;objectKey:string;file:File;bucket:string;headers:Record<string,string>
}) {
 const mime=validateNativeDocument(input.file,input.objectKey);
 const auth=bearer(input.headers);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
 try{
  const r=await fetch(target(input.base,"upload",input.objectKey),{
   method:"POST",headers:{Authorization:auth,"Content-Type":mime},body:input.file,
   signal:controller.signal
  });
  if(!r.ok)throw new Error(await failure(r,"Falha no upload isolado"));
  const p=await r.json() as {ok?:boolean;objectKey?:string;storageProvider?:string};
  if(p.ok!==true||p.objectKey!==input.objectKey||p.storageProvider!=="neon_qa_function")
    throw new Error("O armazenamento não confirmou o documento solicitado.");
  return {bucket:input.bucket,objectKey:input.objectKey,publicUrl:""};
 }catch(e){
  if(e instanceof Error&&e.name==="AbortError")throw new Error("Tempo limite no envio do documento.");
  throw e;
 }finally{clearTimeout(timer);}
}
export async function readQaNative(base:string,key:string,headers:Record<string,string>) {
 const r=await fetch(target(base,"read",key),{method:"GET",headers:{Authorization:bearer(headers)},cache:"no-store"});
 if(!r.ok)throw new Error(await failure(r,"Falha ao abrir documento"));
 const blob=await r.blob();
 const mime=qaNativeMimeForKey(key);
 if(!mime||!blob.size||blob.size>QA_NATIVE_MAX_PDF_BYTES||blob.type!==mime)
   throw new Error("A resposta não contém um documento válido.");
 return URL.createObjectURL(blob);
}
export async function deleteQaNative(base:string,key:string,headers:Record<string,string>) {
 const r=await fetch(target(base,"object",key),{method:"DELETE",headers:{Authorization:bearer(headers)}});
 if(!r.ok)throw new Error(await failure(r,"Falha ao excluir documento"));
 const p=await r.json() as {ok?:boolean;objectKey?:string};
 if(p.ok!==true||p.objectKey!==key)throw new Error("Exclusão não confirmada pelo armazenamento.");
 return {ok:true,bucket:"process-documents",objectKey:key};
}
