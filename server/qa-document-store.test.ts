import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => process.env.SIGAPRO_QA_TEST_HOME || original.homedir() };
});
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./municipal-storage", () => ({
  callDataApiRpc: rpc,
  getDataApiUrl: () => "https://ep-test-document.apirest.example.com/qa/rest/v1",
  readEnv: (k: string) => String(process.env[k] || ""),
}));
import { handleQaDocumentRequest } from "./qa-document-store";
const tenant = "11111111-1111-4111-8111-111111111111";
const objectKey = `municipalities/${tenant}/protocols/test-user/22222222-2222-4222-8222-222222222222-test.pdf`;

let home = "";
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(),"sigapro-qa-doc-test-"));
  vi.stubEnv("SIGAPRO_QA_TEST_HOME",home);
  vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","true");
  vi.stubEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES","true");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
  vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY","a".repeat(96));
  rpc.mockReset().mockResolvedValue({ ok:true,payload:true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home,{recursive:true,force:true});
});

async function request(url: string, method: string, body?: unknown, token = true) {
  const json = body == null ? "" : JSON.stringify(body);
  const req = Object.assign(Readable.from(json ? [Buffer.from(json)] : []), {
    method,url,headers: token ? { authorization:"Bearer qa-neon-user" } : {},
  });
  const headers: Record<string,string|number> = {};
  let output: Buffer = Buffer.alloc(0);
  const res = {
    statusCode:200,
    setHeader(k:string,v:string|number) {headers[k.toLowerCase()]=v; },
    end(data?: Buffer|string) {output=Buffer.isBuffer(data)?data:Buffer.from(String(data||""));},
  };
  const handled = await handleQaDocumentRequest(req as never,res as never);
  const text = output.toString("utf8");
  let jsonOutput: Record<string,unknown> | null = null;
  try {jsonOutput=JSON.parse(text);} catch {/* binary */}
  return {handled,status:res.statusCode,headers,bytes:output,data:jsonOutput};
}

describe("localhost 8081 isolated pre-protocol attachments", () => {
  it("refuses requests without a tenant-scoped authenticated session", async () => {
    const input={bucket:"process-documents",objectKey,base64:Buffer.from("%PDF-1.4\n").toString("base64")};
    const result=await request("/api/r2-upload","POST",input,false);
    expect(result.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses cross-municipality document storage", async () => {
    rpc.mockResolvedValue({ok:true,payload:false});
    const input={bucket:"process-documents",objectKey,base64:Buffer.from("%PDF-1.4\n").toString("base64")};
    expect((await request("/api/r2-upload","POST",input)).status).toBe(403);
    expect(rpc).toHaveBeenCalledWith(expect.anything(),"has_tenant_access",{target_tenant:tenant});
  });

  it("stores a PDF only on the QA computer, signs its read, and rejects forged links", async () => {
    const bytes=Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >>\nendobj\n%%EOF");
    const upload=await request("/api/r2-upload","POST",{bucket:"process-documents",objectKey,base64:bytes.toString("base64")});
    expect(upload.status).toBe(200);
    expect(upload.data?.qaLocalOnly).toBe(true);
    expect(upload.data?.publicUrl).toBe("");
    const signed=await request("/api/r2-sign-get","POST",{bucket:"process-documents",objectKey});
    expect(signed.status).toBe(200);
    const signedUrl=new URL(String(signed.data?.signedUrl));
    expect(signedUrl.origin).toBe("http://localhost:8081");
    const open=await request(signedUrl.pathname+signedUrl.search,"GET",undefined,false);
    expect(open.status).toBe(200);
    expect(open.bytes.equals(bytes)).toBe(true);
    expect(open.headers["content-type"]).toBe("application/pdf");
    signedUrl.searchParams.set("sig","0".repeat(64));
    expect((await request(signedUrl.pathname+signedUrl.search,"GET",undefined,false)).status).toBe(403);
    expect((await request("/api/r2-upload","POST",{bucket:"process-documents",objectKey,base64:bytes.toString("base64")})).status).not.toBe(200);
  });

  it("assina o PDF na mesma porta do QA quando o piloto ocupa o 8080", async () => {
    vi.stubEnv("SIGAPRO_LOCAL_QA_PORT", "8080");
    const bytes = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >>\nendobj\n%%EOF");
    const upload = await request("/api/r2-upload", "POST", {
      bucket: "process-documents", objectKey, base64: bytes.toString("base64"),
    });
    expect(upload.status).toBe(200);
    const signed = await request("/api/r2-sign-get", "POST", {
      bucket: "process-documents", objectKey,
    });
    expect(signed.status).toBe(200);
    const url = new URL(String(signed.data?.signedUrl));
    expect(url.origin).toBe("http://localhost:8080");
    const opened = await request(url.pathname + url.search, "GET", undefined, false);
    expect(opened.status).toBe(200);
    expect(opened.bytes.equals(bytes)).toBe(true);
  });

  it("rejects path traversal, other buckets, and invalid PDF content", async () => {
    expect((await request("/api/r2-upload","POST",{
      bucket:"process-documents",objectKey:`municipalities/${tenant}/../escape/file.pdf`,base64:"eA==",
    })).status).toBe(400);
    expect((await request("/api/r2-upload","POST",{
      bucket:"institutional-branding",objectKey,base64:"eA==",
    })).status).toBe(400);
    expect((await request("/api/r2-upload","POST",{
      bucket:"process-documents",objectKey,base64:Buffer.from("not-a-pdf").toString("base64"),
    })).status).toBe(400);
  });

  it("never responds to isolated document requests when QA launch flag is absent", async () => {
    vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","");
    expect((await request("/api/r2-upload","POST",{},false)).handled).toBe(false);
  });
});
