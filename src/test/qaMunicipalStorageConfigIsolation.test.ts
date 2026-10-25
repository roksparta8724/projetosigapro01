import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/storage-connection";

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string,string>,
    body: "",
    setHeader(key:string,value:string){this.headers[key]=value;},
    end(body?:string){this.body=body||"";},
  };
}
afterEach(()=>vi.unstubAllEnvs());

describe("SIGAPRO isolated QA municipal storage configuration",()=>{
  it.each(["get","save","test","activate","disable"])(
    "prevents %s from accessing inherited production storage credentials",async action=>{
      vi.stubEnv("VERCEL_ENV","preview");
      vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
      vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","false");
      const out=response();
      await handler({
        method:"POST",url:"/api/storage-connection",
        body:{action,municipalityId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
      } as never,out as never);
      expect(out.statusCode).toBe(503);
      expect(JSON.parse(out.body).code).toBe("QA_MUNICIPAL_STORAGE_CONFIGURATION_DISABLED");
    }
  );
  it("preserves the read-only health endpoint in QA",async()=>{
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","false");
    const out=response();
    await handler({method:"GET",url:"/api/storage-connection?action=health"} as never,out as never);
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(out.body).ok).toBe(true);
  });
  it("does not change production method checks",async()=>{
    vi.stubEnv("VERCEL_ENV","production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
    const out=response();
    await handler({method:"DELETE",url:"/api/storage-connection"} as never,out as never);
    expect(out.statusCode).toBe(405);
  });
});
