import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMunicipalMpOrder } from "../../server/mp-webhook-tenant";

const orderId = "ORD01QA20261028VALID000000000001";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fetchOrder(order: Record<string, unknown>) {
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({
    id: orderId, external_reference:"DAM-PRE-QA-20261028-PIXHMLG2",
    total_amount:"1.00",status:"processed",...order,
  }),{status:200,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",mock);
  const result=await fetchMunicipalMpOrder(orderId,"synthetic-server-test-token");
  expect(mock).toHaveBeenCalledOnce();
  const [url,options]=mock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.mercadopago.com/v1/orders/"+orderId);
  expect(options.method).toBe("GET");
  return result;
}

describe("Mercado Pago Orders webhook currency parsing in isolated QA",()=>{
  it("uses the documented currency field and preserves BRL manual reconciliation evidence",async()=>{
    expect(await fetchOrder({currency:"BRL"})).toEqual({
      fetched:true,status:"processed",reference:"DAM-PRE-QA-20261028-PIXHMLG2",
      currency:"BRL",amount:1,
    });
  });
  it("supports old currency_id when the newer currency property is absent",async()=>{
    expect((await fetchOrder({currency_id:"BRL"})).currency).toBe("BRL");
  });
  it("refuses conflicting currencies rather than incorrectly matching a charge",async()=>{
    expect((await fetchOrder({currency:"USD",currency_id:"BRL"})).currency).toBe("");
  });
  it("does not infer BRL from country, amount or an absent currency field",async()=>{
    expect((await fetchOrder({country_code:"BRA"})).currency).toBe("");
  });
  it("propagates a genuinely non-BRL currency for SQL rejection",async()=>{
    expect((await fetchOrder({currency:"USD"})).currency).toBe("USD");
  });
  it("blocks a provider response with a different order ID",async()=>{
    const result=await fetchOrder({id:"ORDOTHER123"});
    expect(result).toMatchObject({fetched:false,status:"provider_order_mismatch",currency:"",amount:null});
  });
});
