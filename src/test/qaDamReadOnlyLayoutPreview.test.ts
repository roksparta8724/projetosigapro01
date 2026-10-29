import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const source=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
const start=source.indexOf("const previewQaA4Layout = async");
const end=source.indexOf("const openExternalGuide = async",start);
const handler=source.slice(start,end);
describe("QA A4 comparison never changes an immutable original or bank PIX",()=>{
 it("checks isolated QA, guide, process, tenant, and provider",()=>{
  expect(handler).toContain("!isolatedQaMode");
  expect(handler).toContain('!guide.code.startsWith("DAM-PRE-QA-")');
  expect(handler).toContain("original.municipality_id !== effectiveScopeId");
  expect(handler).toContain("original.process_id !== process.id");
  expect(handler).toContain('original.provider_environment !== "test"');
  expect(source).toContain('data-qa-a4-layout-preview="true"');
 });
 it("renders the persisted immutable snapshot read-only without issuing PIX",()=>{
  expect(handler).toContain("readGuideOriginal");
  expect(handler).toContain("renderGuideOriginalPdf(original.document_snapshot)");
  expect(handler).not.toContain("archiveAndOpenGuide(");
  expect(handler).not.toContain("requestQaPixCharge(");
  expect(handler).not.toContain("ensureMercadoPagoGuideCharge(");
  expect(handler).not.toContain("attach_payment_guide_original_v1");
  expect(handler).toContain("O PDF original arquivado não foi alterado");
 });
});