import {afterEach,describe,expect,it,vi} from "vitest";
import {fetchMunicipalMpOrder,persistQaOrderEvent} from "../../server/mp-webhook-tenant";

const id="ORD01QA20261028VALID000000000001";
const payment="PAY01QA20261028VALID0000000001";
const base={id,external_reference:"DAM-QA-20261028",currency:"BRL",country_code:"BRA",
 total_amount:"1.00",total_paid_amount:"1.00",status:"processed",status_detail:"accredited",
 transactions:{payments:[{id:payment,amount:"1.00",paid_amount:"1.00",
  status:"processed",status_detail:"accredited",payment_method:{id:"pix",type:"bank_transfer"}}],chargebacks:[]}};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
async function observe(changes:Record<string,unknown>={}){
 vi.stubGlobal("AbortSignal",{timeout:()=>new AbortController().signal});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({...base,...changes}),
  {status:200,headers:{"Content-Type":"application/json"}})));
 return fetchMunicipalMpOrder(id,"mock-server-only");
}
describe("QA bank accredited Orders evidence",()=>{
 it("requires order+transaction accredited and exact paid amount",async()=>{
  const x=await observe();
  expect(x.accredited).toBe(true);
  expect(x.paymentId).toBe(payment);
  expect(x.paidAmount).toBe(1);
  expect(x.transactionPaidAmount).toBe(1);
 });
 it.each([
  {status:"action_required",status_detail:"waiting_payment"},
  {status:"processed",status_detail:"partially_refunded"},
  {status:"refunded",status_detail:"refunded"},
  {status:"charged_back",status_detail:"settled"},
  {total_paid_amount:"0.00"},
  {total_paid_amount:"0.50"},
  {total_paid_amount:"1e0"},
  {total_paid_amount:null},
  {currency:"USD"},
  {country_code:"MEX"},
  {transactions:{payments:[]}},
  {transactions:{payments:[{id:payment,amount:"1.00",paid_amount:"1.00",
   status:"processing",status_detail:"in_process"}]}},
  {transactions:{payments:[{id:payment,amount:"1.00",paid_amount:"1.00",
   status:"processed",status_detail:"partially_refunded"}]}},
  {transactions:{payments:[{id:payment,amount:"1.00",paid_amount:"0.50",
   status:"processed",status_detail:"accredited"}]}},
  {transactions:{payments:[{id:payment,amount:"1.00",paid_amount:"1.00",
   status:"processed",status_detail:"accredited"}],chargebacks:[{id:"CB01"}]}},
 ])("refuses uncredited, mismatched, disputed or incomplete provider evidence: %j",async change=>{
  expect((await observe(change)).accredited).toBe(false);
 });
 it("does not invoke settlement SQL without accredited proof",async()=>{
  const observation=await observe({status:"action_required",status_detail:"waiting_payment"});
  const client={query:vi.fn().mockResolvedValue({rows:[{receipt:{receipt_id:"11111111-1111-4111-8111-111111111111",
   status:"verified_manual_review",matched:true,attempts:1}}]})};
  const result=await persistQaOrderEvent(client as never,{municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
   orderId:id,requestId:"req_qa_001",notificationId:"notif_1",payloadHash:"a".repeat(64),observation});
  expect(result.status).toBe("verified_manual_review");
  expect(client.query).toHaveBeenCalledOnce();
 });
 it("invokes restricted QA settlement only for credited bank evidence and a matched receipt",async()=>{
  const observation=await observe();
  const client={query:vi.fn().mockResolvedValueOnce({rows:[{receipt:{receipt_id:"11111111-1111-4111-8111-111111111111",
   status:"verified_manual_review",matched:true,attempts:1}}]})
   .mockResolvedValueOnce({rows:[{result:{status:"awaiting_original_pdf",matched:true}}]})};
  const result=await persistQaOrderEvent(client as never,{municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
   orderId:id,requestId:"req_qa_002",notificationId:"notif_2",payloadHash:"b".repeat(64),observation});
  expect(client.query).toHaveBeenCalledTimes(2);
  expect(client.query.mock.calls[1][0]).toContain("mp_qa_webhook_settle_v1");
  expect(client.query.mock.calls[1][1]).toEqual([
   "11111111-1111-4111-8111-111111111111",
   "49dac0b6-6352-4744-9aab-9ff91c59d970",id,payment,1,"accredited","processed","accredited",1,1]);
  expect(result.status).toBe("awaiting_original_pdf");
 });
});
