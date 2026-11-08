import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import {
  PROCESS_INLINE_MAX_BYTES, PROCESS_UPLOAD_CHUNK_BYTES,
  uploadLargeProcessAttachment,
} from "@/integrations/r2/processChunkUpload";

const tenant = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const profile = "2244ccaa-1111-4111-8111-123456abcdef";
const fileId = "3234ccaa-1111-4111-8111-123456abcdef";
const objectKey = "municipalities/" + tenant + "/protocols/" + profile + "/" + fileId + "-projeto.pdf";
const auth = async () => ({Authorization:"Bearer QA_SESSION_ONLY_IN_REQUEST_HEADERS"});

function fakePdf(size:number) {
  const bytes = new Uint8Array(size);
  bytes.set([37,80,68,70,45,49,46,55]); // %PDF-1.7
  const buffer = (a:Uint8Array) => a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength) as ArrayBuffer;
  return {
    size,name:"projeto.pdf",type:"application/pdf",
    arrayBuffer: async()=>buffer(bytes),
    slice: (start:number,end:number)=>({arrayBuffer:async()=>buffer(bytes.subarray(start,end))}),
    sourceBytes:bytes,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SIGAPRO QA — upload real do navegador em partes sem chave R2", () => {
  it("envia 2MiB + restante, verifica SHA-256 e finaliza apenas depois dos chunks",async()=>{
    vi.stubGlobal("crypto",webcrypto);
    const pdf = fakePdf(PROCESS_INLINE_MAX_BYTES+1);
    const calls:Array<{url:string,body:Record<string,unknown>,options:RequestInit}> = [];
    const fetchSpy = vi.fn(async (url:string, options:RequestInit) => {
      const body = JSON.parse(String(options.body)) as Record<string,unknown>;
      calls.push({url,body,options});
      return {ok:true,status:200,json:async()=>({
        ok:true,...(body.action==="finalize"?{objectKey}:{}),
      })};
    });
    vi.stubGlobal("fetch",fetchSpy);
    const result = await uploadLargeProcessAttachment({
      bucket:"process-documents",objectKey,file:pdf as unknown as File,
    },auth);
    expect(result).toEqual({bucket:"process-documents",objectKey,publicUrl:""});
    expect(calls.map(c=>c.body.action)).toEqual(["chunk","chunk","finalize"]);
    for(const call of calls) {
      expect(call.url).toBe("/api/r2-process-proxy-upload");
      expect(call.options.credentials).toBe("same-origin");
      expect((call.options.headers as Record<string,string>).Authorization)
        .toBe("Bearer QA_SESSION_ONLY_IN_REQUEST_HEADERS");
      expect(call.url).not.toContain("QA_SESSION_ONLY");
      expect(call.body.objectKey).toBe(objectKey);
    }
    expect(calls[0].body.chunkIndex).toBe(0);
    expect(calls[1].body.chunkIndex).toBe(1);
    expect(Buffer.from(String(calls[0].body.base64),"base64").byteLength)
      .toBe(PROCESS_UPLOAD_CHUNK_BYTES);
    expect(Buffer.from(String(calls[1].body.base64),"base64").byteLength)
      .toBe(pdf.size-PROCESS_UPLOAD_CHUNK_BYTES);
    expect(calls[2].body.fileSha256)
      .toBe(createHash("sha256").update(pdf.sourceBytes).digest("hex"));
  });

  it("quando o envio falha, solicita exclusão somente do staging privado",async()=>{
    vi.stubGlobal("crypto",webcrypto);
    const pdf=fakePdf(PROCESS_INLINE_MAX_BYTES+1);
    const commands:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (_url:string,options:RequestInit)=>{
      const body=JSON.parse(String(options.body)) as Record<string,unknown>;
      commands.push(String(body.action));
      if(body.action==="chunk") return {ok:false,status:503,
        json:async()=>({error:"R2 indisponível"})};
      return {ok:true,status:200,json:async()=>({ok:true})};
    }));
    await expect(uploadLargeProcessAttachment({
      bucket:"process-documents",objectKey,file:pdf as unknown as File,
    },auth)).rejects.toThrow("R2 indisponível");
    expect(commands).toEqual(["chunk","abort"]);
  });

  it("documentos acima do limite são recusados antes de criar qualquer cobrança",async()=>{
    const authSpy=vi.fn(auth);
    const file=fakePdf(1);
    const tooLarge={...file,size:40*1024*1024+1};
    await expect(uploadLargeProcessAttachment({
      bucket:"process-documents",objectKey,file:tooLarge as unknown as File,
    },authSpy)).rejects.toThrow("acima de 40 MB");
    expect(authSpy).not.toHaveBeenCalled();
  });
});
