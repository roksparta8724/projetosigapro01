import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { verifyExistingDamOriginal } from "../../server/api/r2-upload";
import { assertStoredDamOriginal } from "../../server/dam-original-integrity";

const body = Buffer.from("%PDF-1.7\nSIGAPRO QA immutable DAM original", "utf8");
const sha = createHash("sha256").update(body).digest("hex");
const municipalityId="49dac0b6-6352-4744-9aab-9ff91c59d970";
const processId="2244ccaa-1111-4111-8111-123456abcdef";
const guideId="3234ccaa-1111-4111-8111-123456abcdef";
const key="municipalities/"+municipalityId+"/processes/"+processId+
  "/dam-originals/"+guideId+"/"+sha+".pdf";
const good = {bucket:"sigapro-documentos",objectKey:key,body,
  contentType:"application/pdf",metadata:{sha256:sha}};
function client(head:Record<string,unknown>|null,bytes=body) {
  const send=vi.fn(async (command:unknown)=>{
    if(command instanceof HeadObjectCommand){
      if(!head)throw Object.assign(new Error("Not found"),{$metadata:{httpStatusCode:404}});
      return head;
    }
    if(command instanceof GetObjectCommand) return { Body:Readable.from([bytes]) };
    throw new Error("Unexpected S3 operation");
  });
  return {send};
}

describe("SIGAPRO — comprovacao fisica do PDF DAM original",()=>{
  it("retry idempotente exige HEAD, GET, SHA256 REAL e tamanho do original",async()=>{
    const c=client({ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:sha}});
    expect(await verifyExistingDamOriginal(c as never,good)).toBe(true);
    expect(c.send).toHaveBeenCalledTimes(2);
    expect(c.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(c.send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
  });
  it("recusa cabecalho, tamanho, metadado, hash ou ausencia do objeto",async()=>{
    const corrupt=[
      {ContentLength:body.length+1,ContentType:"application/pdf",Metadata:{sha256:sha}},
      {ContentLength:body.length,ContentType:"image/jpeg",Metadata:{sha256:sha}},
      {ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:"f".repeat(64)}},
      {ContentLength:body.length,ContentType:"application/pdf",Metadata:{}},
      null,
    ];
    for(const head of corrupt){
      expect(await verifyExistingDamOriginal(client(head) as never,good)).toBe(false);
    }
  });
  it("nao confia em metadado legitimo com bytes ausentes ou adulterados",async()=>{
    const meta={ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:sha}};
    expect(await verifyExistingDamOriginal(
      client(meta,Buffer.from("%PDF-1.7\n" + "X".repeat(body.length-9))) as never,good,
    )).toBe(false);
    expect(await verifyExistingDamOriginal(client(meta,Buffer.from("not a PDF")) as never,good)).toBe(false);
    expect(await verifyExistingDamOriginal(client(meta,Buffer.alloc(0)) as never,good)).toBe(false);
  });
  it("nao permite trocar SHA, reutilizar outro arquivo ou exceder limite",async()=>{
    const meta={ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:sha}};
    expect(await verifyExistingDamOriginal(client(meta) as never,{...good,body:Buffer.from("fake")})).toBe(false);
    expect(await verifyExistingDamOriginal(client(meta) as never,{...good,metadata:{sha256:"a".repeat(64)}})).toBe(false);
    expect(await verifyExistingDamOriginal(client(meta) as never,
      {...good,objectKey:key.replace("/dam-originals/","/documents/")})).toBe(false);
  });
  it("permite prefixo BYOS restrito e impede desvio para outro objeto",async()=>{
    const meta={ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:sha}};
    await expect(assertStoredDamOriginal(client(meta) as never,{
      bucket:"municipal-private",objectKey:"private/city-a/"+key,logicalObjectKey:key,
      expectedSha256:sha,expectedBytes:body.length,
    })).resolves.toBeUndefined();
    await expect(assertStoredDamOriginal(client(meta) as never,{
      bucket:"municipal-private",objectKey:"private/other-guide.pdf",logicalObjectKey:key,
      expectedSha256:sha,expectedBytes:body.length,
    })).rejects.toThrow("DAM_ORIGINAL_INVALID_CONTRACT");
  });
  it("obriga GET real antes de responder upload bem-sucedido em R2 e BYOS",()=>{
    const source=readFileSync("server/api/r2-upload.ts","utf8");
    expect(source).toContain("await assertStoredDamOriginal(client, {");
    expect(source).toContain("await assertStoredDamOriginal(municipalTarget.client, {");
    expect(source).toContain("await verifyExistingDamOriginal(client, input)");
    expect(source).toContain('json(res, 409, { error: "Este PDF assinado ou original já existe');
  });
});
