import {beforeEach, describe, expect, it, vi} from "vitest";

const mock=vi.hoisted(()=>({
  ready:vi.fn(),bearer:vi.fn(),readGuide:vi.fn(),isSettled:vi.fn(),
  rpc:vi.fn(),withConnection:vi.fn(),readSecrets:vi.fn(),
  fetchOrder:vi.fn(),persist:vi.fn(),query:vi.fn()
}));
vi.mock("../../server/guide-persistence.js",()=>({readStoredGuide:mock.readGuide}));
vi.mock("../../server/guide-settlement.js",()=>({isPersistedGuideSettled:mock.isSettled}));
vi.mock("../../server/municipal-storage.js",()=>({
  readBearer:mock.bearer,callDataApiRpc:mock.rpc
}));
vi.mock("../../server/mp-webhook-tenant.js",()=>({
  qaWebhookConfigured:mock.ready,withWebhookConnection:mock.withConnection,
  readQaMunicipalPaymentSecret:mock.readSecrets,
  fetchMunicipalMpOrder:mock.fetchOrder,persistQaOrderEvent:mock.persist
}));
import handler from "../../server/qa-mercadopago-reconcile";

const municipality="49dac0b6-6352-4744-9aab-9ff91c59d970";
const other="c334d39c-3a77-464c-abd6-a3a539cceba1";
const processId="ced9ed52-9bf7-4b80-9b20-109e77153bc2";
const guideNumber="DAM-PRE-QA-20261028-EXAMPLE";
const orderId="ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const paymentId="PAY01JQ4S4KY8HWQ6NA5PXB65B3D3";
const original={
  municipality_id:municipality,process_id:processId,guide_number:guideNumber,
  bank_reference:orderId,bank_payment_id:paymentId,provider_environment:"test",
  payment_provider:"mercado_pago",collection_mode_snapshot:"sigapro",
  original_pdf_key:"municipalities/qa/processes/example/dam-originals/test.pdf",
  original_pdf_sha256:"c".repeat(64),document_snapshot:{guia:{numeroGuia:guideNumber}}
};
async function call(options:{method?:string,body?:unknown}={}){
  let sent:Record<string,unknown>={};
  const req={method:options.method??"POST",body:options.body??{
    municipalityId:municipality,guideCode:guideNumber
  }};
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((s:string)=>{sent=JSON.parse(s)})};
  await handler(req as never,res as never);
  return {code:res.statusCode,body:sent};
}
beforeEach(()=>{
  vi.resetAllMocks();
  mock.ready.mockReturnValue(true);
  mock.bearer.mockReturnValue("authenticated-qa-only");
  mock.readGuide.mockResolvedValue({...original});
  mock.isSettled.mockReturnValue(false);
  mock.rpc.mockResolvedValue({ok:true,payload:true});
  mock.withConnection.mockImplementation((cb:(db:object)=>Promise<unknown>)=>cb({query:mock.query}));
  mock.readSecrets.mockResolvedValue({accessToken:"fake-qa-provider-token"});
  mock.fetchOrder.mockResolvedValue({fetched:true,accredited:false,status:"action_required"});
  mock.query.mockResolvedValue({rows:[{receipt:{
    request_id:"request-id-verified",notification_id:"event-id",
    payload_sha256:"b".repeat(64)
  }}]});
  mock.persist.mockResolvedValue({status:"settled_qa",matched:true});
});
describe("QA post-original bank reconciliation endpoint: no new charges",()=>{
  it("rejects GET without bank access",async()=>{
    expect((await call({method:"GET"})).code).toBe(405);
    expect(mock.fetchOrder).not.toHaveBeenCalled();
  });
  it("is unavailable outside QA",async()=>{
    mock.ready.mockReturnValue(false);
    expect((await call()).code).toBe(404);
    expect(mock.readGuide).not.toHaveBeenCalled();
  });
  it("requires a logged-in bearer",async()=>{
    mock.bearer.mockReturnValue(null);
    expect((await call()).code).toBe(401);
    expect(mock.fetchOrder).not.toHaveBeenCalled();
  });
  it("requires a correctly scoped guide code and municipal UUID",async()=>{
    expect((await call({body:{municipalityId:"arbitrary",guideCode:guideNumber}})).code).toBe(400);
    expect(mock.readGuide).not.toHaveBeenCalled();
  });
  it("rejects another municipality's guide before contacting the provider",async()=>{
    mock.readGuide.mockResolvedValue({...original,municipality_id:other});
    expect((await call()).code).toBe(403);
    expect(mock.fetchOrder).not.toHaveBeenCalled();
  });
  it("rejects a guide tied to a different provider or environment",async()=>{
    mock.readGuide.mockResolvedValue({...original,payment_provider:"bank_direct"});
    expect((await call()).code).toBe(403);
    mock.readGuide.mockResolvedValue({...original,provider_environment:"production"});
    expect((await call()).code).toBe(403);
    expect(mock.fetchOrder).not.toHaveBeenCalled();
  });
  it("blocks reconciliation until immutable PDF and snapshot exist",async()=>{
    mock.readGuide.mockResolvedValue({...original,original_pdf_sha256:null});
    expect((await call()).code).toBe(409);
    expect(mock.fetchOrder).not.toHaveBeenCalled();
    expect(mock.persist).not.toHaveBeenCalled();
  });
  it("checks authorized document and bank order via scoped RPC",async()=>{
    mock.rpc.mockResolvedValue({ok:true,payload:false});
    expect((await call()).code).toBe(403);
    expect(mock.fetchOrder).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith(
      expect.anything(),"qa_authorize_guide_reconciliation_v1",
      {_municipality_id:municipality,_guide_code:guideNumber,_bank_reference:orderId}
    );
  });
  it("leaves status pending when provider reports action_required",async()=>{
    const result=await call();
    expect(result).toEqual({code:200,body:{ok:true,status:"awaiting_bank_credit",settled:false}});
    expect(mock.fetchOrder).toHaveBeenCalledWith(orderId,"fake-qa-provider-token");
    expect(mock.query).not.toHaveBeenCalled();
    expect(mock.persist).not.toHaveBeenCalled();
  });
  it("requires an already signed original webhook before settling accredited PIX",async()=>{
    mock.fetchOrder.mockResolvedValue({fetched:true,accredited:true,status:"processed"});
    mock.query.mockResolvedValue({rows:[{receipt:null}]});
    const result=await call();
    expect(result.code).toBe(409);
    expect(result.body.code).toBe("QA_SIGNED_WEBHOOK_REQUIRED");
    expect(mock.persist).not.toHaveBeenCalled();
  });
  it("settles the same verified order after signed receipt, never creating a new charge",async()=>{
    const credit={fetched:true,accredited:true,status:"processed",
      reference:guideNumber,currency:"BRL",amount:1,paidAmount:1,
      paymentId,transactionStatus:"processed"};
    mock.fetchOrder.mockResolvedValue(credit);
    const result=await call();
    expect(result).toEqual({code:200,body:{ok:true,status:"settled_qa",settled:true}});
    expect(mock.persist).toHaveBeenCalledWith(
      expect.anything(),{
        municipalityId:municipality,orderId,
        requestId:"request-id-verified",notificationId:"event-id",
        payloadHash:"b".repeat(64),observation:credit
      }
    );
    expect(mock.persist).toHaveBeenCalledTimes(1);
  });
  it("is safe if payment was settled earlier; no second bank call or write",async()=>{
    mock.isSettled.mockReturnValue(true);
    expect((await call()).body).toMatchObject({status:"already_settled_qa",settled:true});
    expect(mock.fetchOrder).not.toHaveBeenCalled();
    expect(mock.persist).not.toHaveBeenCalled();
  });
  it("never reports settlement when bank verification fails",async()=>{
    mock.fetchOrder.mockRejectedValue(new Error("provider unavailable"));
    expect((await call()).body).toMatchObject({ok:false,code:"QA_PROVIDER_UNAVAILABLE"});
    expect(mock.persist).not.toHaveBeenCalled();
  });
});
