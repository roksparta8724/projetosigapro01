import { afterEach,describe,expect,it,vi } from "vitest";
import payment from "../../api/mercadopago";
import connection from "../../api/payment-connection";
import collection from "../../api/collection-configuration";

const response=()=>({
  statusCode:200,
  headers:{} as Record<string,string>,
  body:"",
  setHeader(key:string,value:string){this.headers[key]=value;},
  end(value?:string){this.body=value||"";},
});
afterEach(()=>vi.unstubAllEnvs());
const isolate=(flag="false")=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED",flag);
};
describe("SIGAPRO QA never invokes inherited bank or municipal collection providers",()=>{
  it.each(["health","guide-boleto","guide-status","payment-connection"])(
    "rejects Mercado Pago action %s on QA branch with missing isolation flag",async action=>{
      isolate();
      const res=response();
      await payment({method:action==="health"?"GET":"POST",url:"/api/mercadopago?action="+action} as never,res as never);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).code).toBe("QA_PAYMENT_PROVIDER_DISABLED");
      expect(res.headers["Cache-Control"]).toBe("no-store");
    }
  );
  it("blocks direct payment connection alias before any configuration access",async()=>{
    isolate();
    const res=response();
    await connection({method:"POST",url:"/api/payment-connection"} as never,res as never);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("QA_PAYMENT_PROVIDER_DISABLED");
  });
  it.each(["get","bank_get","bank_save","save","validate","activate","attach"])(
    "blocks municipal collection %s when Neon QA isolation is missing, before any Data API call",async action=>{
      isolate();
      const res=response();
      await collection({
        method:"POST",url:"/api/collection-configuration",
        body:{action,municipalityId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
      } as never,res as never);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).code).toBe("QA_COLLECTION_ISOLATION_REQUIRED");
      expect(res.headers["Cache-Control"]).toBe("no-store");
    }
  );
  it("also refuses inherited providers whenever isolated flag is explicitly true",async()=>{
    isolate("true");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","another-preview");
    const res=response();
    await payment({method:"GET",url:"/api/mercadopago?action=health"} as never,res as never);
    expect(res.statusCode).toBe(503);
  });
  it("does not change official production routing for unsupported actions",async()=>{
    vi.stubEnv("VERCEL_ENV","production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
    const res=response();
    await payment({method:"GET",url:"/api/mercadopago?action=unknown"} as never,res as never);
    expect(res.statusCode).toBe(404);
    const col=response();
    await collection({method:"GET",url:"/api/collection-configuration"} as never,col as never);
    expect(col.statusCode).toBe(405);
  });
});
