import { afterEach, describe, expect, it, vi } from "vitest";
import upload from "../../server/api/r2-upload";
import remove from "../../server/api/r2-delete";
import signGet from "../../server/api/r2-sign-get";
import list from "../../server/api/r2-list-user-files";
import masterLogo from "../../server/api/r2-master-logo-source";
import avatar from "../../server/api/profile-avatar-open";

afterEach(() => vi.unstubAllEnvs());

describe("SIGAPRO QA R2 direct serverless entrypoints", () => {
  it.each([["upload", upload], ["delete", remove]])("blocks %s before storage work", async (_name, handler) => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const res = {
      statusCode: 200,
      body: "",
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) { this.headers[k] = v; },
      end(value: string) { this.body = value; },
    };
    await handler({method: "POST",headers:{},url:"/api/r2"} as never,res as never);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("QA_R2_WRITE_DISABLED");
  });
  it.each([
    ["upload",upload,"QA_R2_WRITE_DISABLED"],
    ["delete",remove,"QA_R2_WRITE_DISABLED"],
    ["sign-get",signGet,"QA_R2_ACCESS_DISABLED"],
    ["list-user-files",list,"QA_R2_ACCESS_DISABLED"],
    ["master-logo-source",masterLogo,"QA_R2_ACCESS_DISABLED"],
    ["profile-avatar-open",avatar,"QA_R2_ACCESS_DISABLED"],
  ] as const)("blocks direct %s even when the isolated QA flag is missing",async(_name,handler,code)=>{
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","false");
    const res={
      statusCode:200,body:"",headers:{} as Record<string,string>,
      setHeader(k:string,v:string){this.headers[k]=v;},
      end(value:string){this.body=value;},
    };
    // Missing bearer and request body: a missing flag must fail immediately
    // instead of attempting to authenticate against production or touch R2.
    await handler({method:"POST",headers:{},url:"/api/r2"} as never,res as never);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe(code);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it.each([["upload",upload],["delete",remove]] as const)(
    "does not block official %s routing with an unrelated QA branch name",
    async(_name,handler)=>{
      vi.stubEnv("VERCEL_ENV","production");
      vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
      vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
      const res={
        statusCode:200,body:"",headers:{} as Record<string,string>,
        setHeader(k:string,v:string){this.headers[k]=v;},
        end(value:string){this.body=value;},
      };
      // Wrong HTTP method reaches ordinary production method validation.
      await handler({method:"GET",headers:{},url:"/api/r2"} as never,res as never);
      expect(res.statusCode).toBe(405);
    }
  );

});
