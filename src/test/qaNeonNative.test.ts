import {afterEach,describe,expect,it,vi} from "vitest";
import {QA_NATIVE_BASE,QA_NATIVE_MAX_PDF_BYTES,resolveQaNativeUrl,validateNativePdf,validateNativeDocument,uploadQaNative,readQaNative,deleteQaNative,listQaNativeFiles,shouldIsolateQaStorage} from "../integrations/r2/qaNeonNative";
const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/protocols/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/qa.pdf";
afterEach(()=>vi.unstubAllGlobals());
describe("SIGAPRO QA Neon binary PDF adapter",()=>{
 it("rejects a URL not on this isolated Neon branch",()=>{
  expect(resolveQaNativeUrl(false,QA_NATIVE_BASE)).toBe("");
  expect(resolveQaNativeUrl(true,"https://sigapromunicipal.com.br")).toBe("");
  expect(resolveQaNativeUrl(true,QA_NATIVE_BASE)).toBe(QA_NATIVE_BASE);
 });
 it("forces isolated document routing on the stable QA host without any isolation flag",()=>{
  const qa="projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";
  expect(shouldIsolateQaStorage(qa,false)).toBe(true);
  expect(shouldIsolateQaStorage(qa,true)).toBe(true);
  expect(shouldIsolateQaStorage("projetosigapro01-something.vercel.app",true)).toBe(true);
  expect(shouldIsolateQaStorage("localhost",false)).toBe(false);
  expect(shouldIsolateQaStorage("sigapromunicipal.com.br",true)).toBe(false);
  expect(shouldIsolateQaStorage("prefeitura.sigapromunicipal.com.br",true)).toBe(false);
 });
 it("accepts 3 MiB PDF, rejects 25 MiB + 1",()=>{
  expect(()=>validateNativePdf({name:"planta.pdf",size:3145728,type:"application/pdf"})).not.toThrow();
  expect(()=>validateNativePdf({name:"planta.pdf",size:QA_NATIVE_MAX_PDF_BYTES+1,type:"application/pdf"})).toThrow("25 MB");
 });
 it("sends raw bytes and JWT to the QA Function",async()=>{
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,objectKey:key,storageProvider:"neon_qa_function"}),{status:200}));
  vi.stubGlobal("fetch",fetchMock);
  const file=new File([new Uint8Array(3*1024*1024)],"qa.pdf",{type:"application/pdf"});
  const result=await uploadQaNative({base:QA_NATIVE_BASE,file,objectKey:key,bucket:"process-documents",headers:{Authorization:"Bearer fake-QA-token"}});
  expect(result.objectKey).toBe(key);
  const [url,opts]=fetchMock.mock.calls[0];
  expect(url).toContain(QA_NATIVE_BASE+"/upload?");
  expect(opts.body).toBe(file);
  expect(opts.headers.Authorization).toBe("Bearer fake-QA-token");
  expect(opts.headers["Content-Type"]).toBe("application/pdf");
 });
 it("uploads inspection JPEG to Neon QA without Vercel fallback",async()=>{
  const path="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/photo.jpg";
  const fake=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,objectKey:path,storageProvider:"neon_qa_function"}),{status:200}));
  vi.stubGlobal("fetch",fake);
  const image=new File([new Uint8Array([255,216,255,224])],"photo.jpg",{type:"image/jpeg"});
  const result=await uploadQaNative({base:QA_NATIVE_BASE,file:image,objectKey:path,bucket:"process-documents",headers:{Authorization:"Bearer synthetic"}});
  expect(result.objectKey).toBe(path);
  expect(fake).toHaveBeenCalledOnce();
  expect(fake.mock.calls[0][1].headers["Content-Type"]).toBe("image/jpeg");
  expect(fake.mock.calls[0][0]).toContain(QA_NATIVE_BASE+"/upload?");
 });
 it("rejects spoofed MIME and mismatching key before any fetch",()=>{
  expect(()=>validateNativeDocument({name:"photo.jpg",size:120,type:"application/pdf"})).toThrow("correspondente");
  expect(()=>validateNativeDocument({name:"photo.jpg",size:120,type:"image/jpeg"},"municipalities/x/photo.png")).toThrow("caminho");
 });
 it("queries only the isolated Neon QA function for recoverable files",async()=>{
  const url=QA_NATIVE_BASE+"/list-user-files";
  const files=[{objectKey:key,fileName:"qa.pdf",size:123,lastModified:"2026-10-24T00:00:00.000Z"}];
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({
    files,storageProvider:"neon_qa_function"
  }),{status:200}));
  vi.stubGlobal("fetch",request);
  const result=await listQaNativeFiles(QA_NATIVE_BASE,
    {Authorization:"Bearer synthetic"},{processId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"});
  expect(result).toEqual(files);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toBe(url);
  expect(JSON.parse(request.mock.calls[0][1].body).processId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
 });
 it("never lists recovery files without authorization or a confirmed Neon response",async()=>{
  const request=vi.fn();vi.stubGlobal("fetch",request);
  await expect(listQaNativeFiles(QA_NATIVE_BASE,{})).rejects.toThrow("login");
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(new Response(JSON.stringify({files:[]}),{status:200}));
  await expect(listQaNativeFiles(QA_NATIVE_BASE,{Authorization:"Bearer synthetic"})).rejects.toThrow("confirmada");
 });
 it("explains when recovery would omit more than 250 documents",async()=>{
  const request=vi.fn().mockResolvedValue(new Response(
    JSON.stringify({code:"QA_RECOVERY_RESULT_LIMIT",limit:250}),{status:409}));
  vi.stubGlobal("fetch",request);
  await expect(listQaNativeFiles(QA_NATIVE_BASE,{Authorization:"Bearer synthetic"}))
    .rejects.toThrow("mais de 250 anexos");
  expect(request).toHaveBeenCalledOnce();
 });
 it("requires login and never sends anonymous PDF",async()=>{
  const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
  const file=new File(["%PDF-1.7"],"qa.pdf",{type:"application/pdf"});
  await expect(uploadQaNative({base:QA_NATIVE_BASE,file,objectKey:key,bucket:"process-documents",headers:{}})).rejects.toThrow("login");
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it("denies cross-profile delete without any R2 fallback",async()=>{
  const fetchMock=vi.fn().mockResolvedValue(new Response('{"code":"ACCESS_DENIED"}',{status:403}));
  vi.stubGlobal("fetch",fetchMock);
  await expect(deleteQaNative(QA_NATIVE_BASE,key,{Authorization:"Bearer fake-QA-token"})).rejects.toThrow("não tem permissão");
  expect(fetchMock).toHaveBeenCalledTimes(1);
 });
 it("allows only valid process UUIDs in QA private owner reads",async()=>{
  const f=vi.fn().mockResolvedValue(new Response('{"code":"ACCESS_DENIED"}',{status:403}));
  vi.stubGlobal("fetch",f);
  await expect(readQaNative(QA_NATIVE_BASE,key,{Authorization:"Bearer fake"},
   "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).rejects.toThrow("não tem permissão");
  expect(f.mock.calls[0][0]).toContain("processId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  f.mockClear();
  await expect(readQaNative(QA_NATIVE_BASE,key,{Authorization:"Bearer fake"},"bad-process"))
   .rejects.toThrow("inválido");
  expect(f).not.toHaveBeenCalled();
 });

});
