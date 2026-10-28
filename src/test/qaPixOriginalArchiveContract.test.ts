import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const root=process.cwd();
const ui=readFileSync(join(root,"src/pages/saas/ExternalPaymentsPage.tsx"),"utf8");
const original=readFileSync(join(root,"src/lib/guideOriginal.ts"),"utf8");
const sql=readFileSync(join(root,"neon/migrations/20261028_qa_pix_bind_to_guide_for_original_v1.sql"),"utf8");
describe("QA-only sandbox PIX immutable original contract",()=>{
 it("never archives browser-only order before the canonical Neon binding",()=>{
  const bind=ui.indexOf('"qa_mp_pix_bind_to_guide_v1"');
  const archive=ui.indexOf("await archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow)");
  expect(bind).toBeGreaterThan(0);
  expect(archive).toBeGreaterThan(bind);
  expect(ui).toContain('confirmedOriginal.pix_code !== sandboxPix!.qrCode');
  expect(ui).toContain('codigoBarras: isolatedQa && sandboxPixIssued && !sandboxIssued ? undefined');
  expect(ui).toContain('linhaDigitavel: isolatedQa && sandboxPixIssued && !sandboxIssued ? undefined');
  expect(original).toContain('pixPayload: isValidPixPayload(persistedPix) ? persistedPix : ""');
 });
 it("rejects existing paid guides and mismatched tenants, amount, order, and production connections",()=>{
  expect(sql).toContain("QA EXCLUSIVE");
  expect(sql).toContain("COALESCE(g.paid,false)");
  expect(sql).toContain("p.amount IS DISTINCT FROM g.amount");
  expect(sql).toContain("order_id=_order_id");
  expect(sql).toContain("c.environment='test'");
  expect(sql).toContain("g.collection_mode_snapshot IS DISTINCT FROM 'sigapro'");
  expect(sql).toContain("REVOKE ALL ON FUNCTION");
  // Mercado Pago may send br.gov.bcb.pix in lowercase. Keep canonical EMV
  // validation strict but case-insensitive so the provider QR is not rejected.
  expect(sql).toContain("COALESCE(p.qr_code,'') !~*");
  expect(sql).not.toContain("COALESCE(p.qr_code,'') !~ '");
  expect(sql).not.toMatch(/SET\s+paid\s*=|SET\s+status\s*=/i);
 });
 it("does not archive administrative previews or produce another provider POST",()=>{
  expect(ui).toContain("const previewOnly = isolatedQa && !sandboxIssued && !sandboxPixIssued;");
  expect(ui).toContain("!confirmedOriginal.bank_reference");
  expect(ui).toContain("await archiveAndOpenGuide(");
  expect(ui).not.toContain('fetch("https://api.mercadopago.com/v1/orders"');
 });
});
