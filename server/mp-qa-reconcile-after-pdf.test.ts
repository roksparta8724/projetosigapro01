import {describe,expect,it,vi} from "vitest";
import {reconcilePreviouslySignedQa} from "./mp-qa-webhook";

const municipalityId="11111111-1111-4111-8111-111111111111";
const orderId="ORD_QA_SIGNED_12345";
const paymentId="PAY_QA_SIGNED_12345";
const signed={request_id:"REQUEST_SIGNED_98765",
 notification_id:"NOTIFICATION_QA_54321",payload_sha256:"a".repeat(64)};
const observation={fetched:true,status:"processed",statusDetail:"accredited",
 reference:"DAM-PRE-QA-SIGNED-TEST",currency:"BRL",amount:1,
 paidAmount:1,paymentId,
 transactionStatus:"processed",transactionStatusDetail:"accredited",
 transactionAmount:1,transactionPaidAmount:1,accredited:true};
const sample={municipalityId,orderId,paymentId};

describe("Bank-signature-verified QA reconciliation after immutable DAM archive",()=>{
  it("never fetches or settles without a prior signed bank event",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[{receipt:null}]})};
    const fetchOrder=vi.fn().mockResolvedValue(observation);
    const result=await reconcilePreviouslySignedQa(db,{...sample,fetchOrder});
    expect(result).toMatchObject({code:"SIGNED_BANK_EVENT_REQUIRED",http:409,settled:false});
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("mp_qa_webhook_signed_receipt_v1");
  });
  it("rejects a mismatched payment ID before any finance mutation",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[{receipt:signed}]})};
    const result=await reconcilePreviouslySignedQa(db,{
      ...sample,fetchOrder:async()=>({...observation,paymentId:"PAY_QA_OTHER_12345"}),
    });
    expect(result).toMatchObject({code:"BANK_PAYMENT_MISMATCH",http:409,settled:false});
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it("refuses unavailable GET and never trusts a frontend paid status",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[{receipt:signed}]})};
    const result=await reconcilePreviouslySignedQa(db,{
      ...sample,fetchOrder:async()=>({...observation,fetched:false}),
    });
    expect(result).toMatchObject({code:"BANK_FETCH_UNAVAILABLE",http:503,settled:false});
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it("reuses only signed receipt metadata plus newly verified provider facts",async()=>{
    const receipt={receipt_id:"33333333-3333-4333-8333-333333333333",status:"verified_manual_review"};
    const db={query:vi.fn()
      .mockResolvedValueOnce({rows:[{receipt:signed}]})
      .mockResolvedValueOnce({rows:[{receipt}]})
      .mockResolvedValueOnce({rows:[{result:{status:"settled_qa",matched:true}}]})};
    const result=await reconcilePreviouslySignedQa(db,{...sample,fetchOrder:async()=>observation});
    expect(result).toMatchObject({code:"settled_qa",http:200,settled:true});
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[1][0]).toContain("mp_qa_webhook_ingest_v1");
    expect(db.query.mock.calls[1][1].slice(0,5))
      .toEqual([municipalityId,orderId,signed.request_id,signed.notification_id,signed.payload_sha256]);
    expect(db.query.mock.calls[2][0]).toContain("mp_qa_webhook_settle_v1");
    expect(db.query.mock.calls[2][1][3]).toBe(paymentId);
  });
  it("will not claim settlement if immutable PDF evidence is still unavailable",async()=>{
    const receipt={receipt_id:"33333333-3333-4333-8333-333333333333",status:"verified_manual_review"};
    const db={query:vi.fn()
      .mockResolvedValueOnce({rows:[{receipt:signed}]})
      .mockResolvedValueOnce({rows:[{receipt}]})
      .mockResolvedValueOnce({rows:[{result:{status:"awaiting_original_pdf",matched:true}}]})};
    const result=await reconcilePreviouslySignedQa(db,{...sample,fetchOrder:async()=>observation});
    expect(result).toMatchObject({code:"awaiting_original_pdf",http:503,settled:false});
  });
});
