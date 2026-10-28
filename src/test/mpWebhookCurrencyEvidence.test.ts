import {afterEach,describe,expect,it,vi} from "vitest";
import {fetchMunicipalMpOrder} from "../../server/mp-webhook-tenant";

const id="ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const base={
 id,type:"online",external_reference:"DAM-PRE-QA-TEST",
 country_code:"BRA",total_amount:"1.00",total_paid_amount:"1.00",
 status:"processed",status_detail:"accredited",
 transactions:{payments:[{
  id:"PAY01JQ4S4KY8HWQ6NA5PXB65B3D3",amount:"1.00",paid_amount:"1.00",
  status:"processed",status_detail:"accredited",
  payment_method:{id:"pix",type:"bank_transfer"}
 }],refunds:[],chargebacks:[]}
};
async function check(obj:unknown){
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(obj),
  {status:200,headers:{"Content-Type":"application/json"}})));
 return fetchMunicipalMpOrder(id,"qa-test-token-never-sent");
}
afterEach(()=>vi.unstubAllGlobals());
describe("Mercado Pago PIX: trusted BRL evidence in an Orders response",()=>{
 it("accepts omitted currency only for a bank-confirmed BRA PIX",async()=>{
  const r=await check(base);
  expect(r).toMatchObject({fetched:true,currency:"BRL",accredited:true,
    amount:1,paidAmount:1,transactionAmount:1,transactionPaidAmount:1});
 });
 it("never infers BRL for cards",async()=>{
  const r=await check({...base,transactions:{...base.transactions,payments:[{
    ...base.transactions.payments[0],payment_method:{id:"visa",type:"credit_card"}}]}});
  expect(r.currency).toBe("");expect(r.accredited).toBe(false);
 });
 it("never infers BRL for another country",async()=>{
  const r=await check({...base,country_code:"USA"});
  expect(r.currency).toBe("");expect(r.accredited).toBe(false);
 });
 it("never overrides explicit USD or conflicting currency fields",async()=>{
  const a=await check({...base,currency:"USD"});
  expect(a.currency).toBe("USD");expect(a.accredited).toBe(false);
  const b=await check({...base,currency:"USD",currency_id:"BRL"});
  expect(b.currency).toBe("");expect(b.accredited).toBe(false);
 });
 it("never credits partial or refunded amounts",async()=>{
  const a=await check({...base,total_paid_amount:"0.99"});
  expect(a.accredited).toBe(false);
  const b=await check({...base,transactions:{...base.transactions,refunds:[{id:"REF"}]}});
  expect(b.accredited).toBe(false);
 });
});
