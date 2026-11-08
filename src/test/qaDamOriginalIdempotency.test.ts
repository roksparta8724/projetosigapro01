import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { verifyExistingDamOriginal } from "../../server/api/r2-upload";

const body = Buffer.from("%PDF-1.7\\nSIGAPRO QA immutable DAM original", "utf8");
const sha = createHash("sha256").update(body).digest("hex");
const good = {
  bucket:"sigapro-documentos",
  objectKey:"municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/processes/2244ccaa-1111-4111-8111-123456abcdef/dam-originals/3234ccaa-1111-4111-8111-123456abcdef/"+sha+".pdf",
  body,contentType:"application/pdf",
  metadata:{sha256:sha},
};
function client(head:Record<string,unknown>|null) {
  const send=vi.fn(async()=>{
    if(!head)throw Object.assign(new Error("Not found"),{$metadata:{httpStatusCode:404}});
    return head;
  });
  return {send};
}

describe("SIGAPRO QA — PDF DAM imutável e retry idempotente",()=>{
  it("reconhece retry apenas quando SHA, tamanho e tipo do original coincidem",async()=>{
    const c=client({ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:sha}});
    expect(await verifyExistingDamOriginal(c as never,good)).toBe(true);
    expect(c.send).toHaveBeenCalledOnce();
  });
  it("nunca informa sucesso quando objeto existente possui tamanho, hash ou MIME diferente",async()=>{
    const corrupt=[
      {ContentLength:body.length+1,ContentType:"application/pdf",Metadata:{sha256:sha}},
      {ContentLength:body.length,ContentType:"image/jpeg",Metadata:{sha256:sha}},
      {ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:"f".repeat(64)}},
      {ContentLength:body.length,ContentType:"application/pdf",Metadata:{}},
      null,
    ];
    for(const state of corrupt)expect(await verifyExistingDamOriginal(client(state) as never,good)).toBe(false);
  });
  it("não permite metadado forjado, mudança de bytes ou reaproveitamento para outro documento",async()=>{
    const existing=client({ContentLength:body.length,ContentType:"application/pdf",Metadata:{sha256:sha}});
    expect(await verifyExistingDamOriginal(existing as never,{...good,body:Buffer.from("fake")})).toBe(false);
    expect(await verifyExistingDamOriginal(existing,{...good,metadata:{sha256:"a".repeat(64)}})).toBe(false);
    expect(await verifyExistingDamOriginal(existing,{...good,objectKey:good.objectKey.replace("/dam-originals/","/process-documents/")})).toBe(false);
  });
  it("obriga verificação tanto em armazenamento municipal próprio quanto no R2 do SIGAPRO",()=>{
    const source=readFileSync("server/api/r2-upload.ts","utf8");
    expect(source).toContain("await verifyExistingDamOriginal(client, input)");
    expect(source).toContain("await verifyExistingDamOriginal(municipalTarget.client, {");
    expect(source).toContain("new HeadObjectCommand");
    expect(source).toContain('json(res, 409, { error: "Este PDF assinado ou original já existe');
  });
});
