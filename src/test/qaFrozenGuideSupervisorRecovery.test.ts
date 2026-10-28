import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261028_qa_preprotocol_dam_staff_pdf_access_v1.sql","utf8");
const api=readFileSync("api/qa-mercadopago-pix.ts","utf8");
describe("QA frozen PIX original accessible only to authorized municipal staff",()=>{
 it("permits scoped municipal supervisor/admin/finance, but not broad preprotocol access",()=>{
  for(const rule of ["prefeitura_admin","prefeitura_supervisor","financeiro",
   "pr.officialized_at IS NULL","pr.status='pagamento_pendente'",
   "_guide.guide_kind IS DISTINCT FROM 'protocolo'",
   "_guide.provider_environment IS DISTINCT FROM 'test'",
   "_guide.guide_number NOT LIKE 'DAM-PRE-QA-%'",
   "pr.tenant_id=_guide.municipality_id","public.has_tenant_access"])
   expect(sql).toContain(rule);
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.qa_pending_dam_municipal_staff_access_v1");
 });
 it("applies exact guide authorization consistently to upload, read, PIX and reconciliation",()=>{
  for(const name of ["assert_dam_document_archiver_v2",
   "authorize_payment_guide_original_read_v1",
   "qa_mp_pix_read_existing_v1","qa_authorize_guide_reconciliation_v1"])
    expect(sql).toContain(name);
  expect(sql.match(/public\.qa_pending_dam_municipal_staff_access_v1\(g\)/g)?.length).toBeGreaterThanOrEqual(3);
  expect(sql).not.toMatch(/\bUPDATE\s+public\.payment_guides\b/i);
 });
 it("opens the frozen original without invoking a payment writer",()=>{
  expect(api).toContain('if(action==="get"&&(guide.document_snapshot||guide.original_pdf_key))');
  expect(api).toContain("QA_FROZEN_PIX_INTEGRITY_MISMATCH");
  expect(api).toContain("return send(res,200,{...render(reservation),statusStale:true})");
  expect(api.indexOf('if(action==="get"&&(guide.document_snapshot||guide.original_pdf_key))'))
   .toBeLessThan(api.indexOf('const saved=await rpc<Reservation>(req,"qa_mp_pix_save_v2"'));
 });
});
