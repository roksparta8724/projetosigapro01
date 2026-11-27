import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  issue:vi.fn(), sync:vi.fn(), check:vi.fn(), rpc:vi.fn(),
}));
vi.mock("../../server/mercadopago.js",()=>({
  createMercadoPagoGuideBoleto:mocks.issue,
  getMercadoPagoGuideBoletoStatus:mocks.sync,
  checkMercadoPagoConnection:mocks.check,
}));
vi.mock("../../server/municipal-storage.js",()=>({
  callDataApiRpc:mocks.rpc,
}));
import handler from "../../api/mercadopago";
const receipt={
  ok:true,environment:"test",externalReference:"GUIA-101",orderId:"ORDER01",
  amount:"1.00",paymentId:"PAY01",barcodeContent:"1".repeat(44),
  digitableLine:"1".repeat(47),
};
async function request(action:"guide-boleto"|"guide-status"){
  let body:Record<string,unknown>={};
  const req={method:"POST",url:"/api/mercadopago?action="+action,
    body:{municipalityId:"11111111-1111-4111-8111-111111111111",
      guideCode:"GUIA-101",orderId:"ORDER01",amount:1},
    headers:{authorization:"Bearer mock"},
  };
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((s:string)=>{
    body=JSON.parse(s) as Record<string,unknown>;
  })};
  await handler(req as never,res as never);
  return {code:res.statusCode,body};
}
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.issue.mockResolvedValue(receipt);
  mocks.sync.mockResolvedValue(receipt);
  mocks.rpc.mockRejectedValue(new Error("Legacy unscoped write must not execute"));
});
describe("municipality-safe Mercado Pago API",()=>{
  it("returns an issued, already persisted order without calling the old RPC",async()=>{
    const out=await request("guide-boleto");
    expect(out.code).toBe(201);
    expect(out.body).toMatchObject({ok:true,orderId:"ORDER01"});
    expect(mocks.issue).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a synced, already persisted order without calling the old RPC",async()=>{
    const out=await request("guide-status");
    expect(out.code).toBe(200);
    expect(out.body).toMatchObject({ok:true,orderId:"ORDER01"});
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not write or report success if provider helper refuses payment",async()=>{
    mocks.issue.mockResolvedValue({ok:false,error:"Not accredited",environment:"test"});
    const out=await request("guide-boleto");
    expect(out.code).toBe(400);
    expect(out.body.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
