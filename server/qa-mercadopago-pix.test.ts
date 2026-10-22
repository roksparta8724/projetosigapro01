import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPixPayload } from "../src/lib/pix";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), guide: vi.fn(), token: vi.fn(), dataUrl: vi.fn(),
}));
vi.mock("node:os", async importOriginal => {
  const actual=await importOriginal<typeof import("node:os")>();
  return {...actual,homedir:()=>process.env.SIGAPRO_QA_TEST_HOME||actual.homedir()};
});
vi.mock("./municipal-storage", () => ({
  readEnv:(key:string)=>String(process.env[key]||""),
  getDataApiUrl:()=> "https://ep-qa-safe.apirest.example.com/qa/rest/v1",
  callDataApiRpc:mocks.rpc,
}));
vi.mock("./guide-persistence",()=>({readStoredGuide:mocks.guide}));
vi.mock("./municipal-payment",()=>({resolveMercadoPagoMunicipalAccessToken:mocks.token}));
import { qaMercadoPagoPix } from "./qa-mercadopago-pix";
const municipalityId="11111111-1111-4111-8111-111111111111";
const guideCode="DAM-PRE-20261022-7791A2E9";
const request={headers:{authorization:"Bearer QA_TOKEN"}} as never;
let root="";
let qr="";
beforeEach(()=>{
  vi.clearAllMocks();
  root=mkdtempSync(join(tmpdir(),"sigapro-pix-"));
  vi.stubEnv("SIGAPRO_QA_TEST_HOME",root);
  vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","true");
  vi.stubEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES","true");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
  qr=buildPixPayload({
    key:"sandbox@example.test", merchantName:"MERCADO PAGO TESTE",
    merchantCity:"SAO PAULO",amount:35.24,txid:"QA-PIX-01",
  })!;
  mocks.rpc.mockResolvedValue({ok:true,payload:true});
  mocks.guide.mockResolvedValue({guide_number:guideCode,municipality_id:municipalityId,amount:35.24});
  mocks.token.mockResolvedValue({environment:"test",token:"APP_USR_SANDBOX_ONLY"});
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async ()=>new Response(JSON.stringify({
    id:"ORDER_QA_PIX_001",external_reference:guideCode+"-PIX-QA",total_amount:"35.24",status:"action_required",
    transactions:{payments:[{id:"PAY_QA_001",status:"action_required",payment_method:{
      id:"pix",type:"bank_transfer",qr_code:qr,
    }}]},
  }),{status:201})));
});
afterEach(()=>{
  rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();vi.unstubAllGlobals();
});
describe("isolated Mercado Pago PIX and existing boleto remain independent",()=>{
  it("creates a test-only PIX order once and reads the exact provider QR after restart",async()=>{
    const first=await qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"});
    expect(first).toMatchObject({ok:true,sandboxOnly:true,environment:"test",qrCode:qr,orderId:"ORDER_QA_PIX_001"});
    const [url,opts]=vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/v1/orders");
    expect(opts?.method).toBe("POST");
    const body=JSON.parse(String(opts?.body));
    expect(body).toMatchObject({
      type:"online",external_reference:guideCode+"-PIX-QA",total_amount:"35.24",
      payer:{email:"test@testuser.com",first_name:"APRO"},
      transactions:{payments:[{amount:"35.24",payment_method:{id:"pix",type:"bank_transfer"}}]},
    });
    const reloaded=await qaMercadoPagoPix(request,{municipalityId,guideCode,action:"get"});
    expect(reloaded.qrCode).toBe(qr);
    const duplicate=await qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"});
    expect(duplicate.orderId).toBe(first.orderId);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("blocks production provider credentials before any payment request",async()=>{
    mocks.token.mockResolvedValue({environment:"production",token:"APP_USR_PRODUCTION"});
    await expect(qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"}))
      .rejects.toThrow(/TESTE/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks cross-prefecture use and payment requests",async()=>{
    mocks.rpc.mockResolvedValue({ok:true,payload:false});
    await expect(qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"}))
      .rejects.toThrow(/autorização/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not issue outside localhost isolated QA",async()=>{
    vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","");
    await expect(qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"}))
      .rejects.toThrow(/isolado/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects provider orders with mismatched amount and prevents double POST",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>new Response(JSON.stringify({
      id:"ORDER_QA_PIX_002",external_reference:guideCode+"-PIX-QA",
      total_amount:"999.99",transactions:{payments:[]},
    }),{status:201})));
    await expect(qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"}))
      .rejects.toThrow(/não corresponde/);
    await expect(qaMercadoPagoPix(request,{municipalityId,guideCode,action:"issue"}))
      .rejects.toThrow(/bloqueada|incerto/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
