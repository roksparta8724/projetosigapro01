import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const read=(p:string)=>readFileSync(p,"utf8");

describe("SIGAPRO QA: real R2 bytes -> Neon immutable SHA-256",()=>{
  it("uses the bytes as the cryptographic identity, not a key or filename",()=>{
    const data=Buffer.from("%PDF-1.4\nQA document bytes\n%%EOF\n");
    const path="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/protocols/QA.pdf";
    expect(createHash("sha256").update(data).digest("hex"))
      .not.toBe(createHash("sha256").update(path+"|QA.pdf").digest("hex"));
    const sql=read("neon/migrations/20261111_document_hash_true_bytes_guard_qa.sql");
    expect(sql).toContain("_provided_sha256 !~ '^[a-f0-9]{64}$'");
    expect(sql).toContain("file_hash,version,source");
    expect(sql).toContain("R2");
    expect(sql).not.toContain("digest(_file_path");
    expect(sql).not.toContain("coalesce(nullif(_doc->>'fileHash',''),encode");
  });
  it("server produces a hash of uploaded bytes and the client carries it into the process",()=>{
    const server=read("server/api/r2-upload.ts");
    const client=read("src/integrations/r2/client.ts");
    const storage=read("src/integrations/r2/storage.ts");
    const page=read("src/pages/saas/ProcessDetailPage.tsx");
    const remote=read("src/integrations/backend/platformImpl.ts");
    expect(server).toContain('createHash("sha256").update(buffer).digest("hex")');
    expect(server).toContain("sha256: receivedSha256");
    expect(client).toContain("sha256: payload.sha256");
    expect(storage).toContain("fileHash: uploaded.sha256");
    expect(page).toContain("fileHash: uploaded.fileHash");
    expect(remote).toContain("fileHash: document.fileHash");
  });
  it("forbids fabricated QA04 hashes and the 4-argument upgrade",()=>{
    const sql=read("neon/migrations/20261111_qa04_upgrade_sha_true_bytes_v1.sql");
    expect(sql).toContain("lower(_file_hash)");
    expect(sql).not.toContain("digest(_file_path");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.upgrade_qa04_architectural_plan_v2(uuid,text,text,bigint)");
  });
  it("recovers old uploads by authenticated R2 reading, not a string-derived digest",()=>{
    const api=read("server/api/r2-list-user-files.ts");
    const page=read("src/pages/saas/ProcessDetailPage.tsx");
    expect(api).toContain("new GetObjectCommand");
    expect(api).toContain('createHash("sha256").update(bytes).digest("hex")');
    expect(api).toContain("principalIds.some");
    expect(page).toContain("verifyRecoverableProcessFile");
    expect(page).toContain("fileHash: recovered.fileHash");
  });
});
