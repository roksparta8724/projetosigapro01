import {afterEach,describe,expect,it,vi} from "vitest";
import {QA_NATIVE_BASE,QA_NATIVE_MAX_PDF_BYTES,resolveQaNativeUrl,validateNativePdf,uploadQaNative,deleteQaNative} from "../integrations/r2/qaNeonNative";
const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/protocols/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/qa.pdf";
afterEach(()=>vi.unstubAllGlobals());
describe("SIGAPRO QA Neon binary PDF adapter",()=>{
 it("rejects a URL not on this isolated Neon branch",()=>{
  expect(resolveQaNativeUrl(false,QA_NATIVE_BASE)).toBe("");
  expect(resolveQaNativeUrl(true,"https://sigapromunicipal.com.br")).toBe("");
  expect(resolveQaNativeUrl(true,QA_NATIVE_BASE)).toBe(QA_NATIVE_BASE);
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
});
