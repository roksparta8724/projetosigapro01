import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {municipalMpWebhookUrl,QA_MP_WEBHOOK_ORIGIN,OFFICIAL_MP_WEBHOOK_ORIGIN} from "../lib/municipalMpWebhookUrl";
const admin=readFileSync("src/components/platform/MunicipalPaymentSettings.tsx","utf8");
const page=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
const id="49dac0b6-6352-4744-9aab-9ff91c59d970";
describe("Municipal Orders webhook configuration and safe post-archive reconciliation",()=>{
 it("uses an unchanging QA alias and per-prefeitura routing ID",()=>{
   const u=new URL(municipalMpWebhookUrl(id,"test"));
   expect(u.origin).toBe(QA_MP_WEBHOOK_ORIGIN);
   expect(u.pathname).toBe("/api/mercadopago-webhook");
   expect(u.searchParams.get("municipality_id")).toBe(id);
 });
 it("uses official domain for production callbacks, never QA host",()=>{
   const u=new URL(municipalMpWebhookUrl(id,"production"));
   expect(u.origin).toBe(OFFICIAL_MP_WEBHOOK_ORIGIN);
   expect(u.searchParams.get("municipality_id")).toBe(id);
 });
 it("refuses malformed tenant ID",()=>{
   expect(municipalMpWebhookUrl("production","test")).toBe("");
   expect(municipalMpWebhookUrl("00000000-0000-0000-0000-000000000000","test")).toBe("");
 });
 it("offers setup instructions but does not expose HMAC or token",()=>{
   expect(admin).toContain('data-municipal-webhook-setup="true"');
   expect(admin).toContain("Order (Mercado Pago)");
   expect(admin).toContain("municipalMpWebhookUrl(municipalityId,form.environment)");
   expect(admin).toContain("navigator.clipboard.writeText(webhookUrl)");
 });
 it("reconciles only the same existing guide after original archive",()=>{
   const code=page.split("const previouslyArchived=Boolean(confirmedOriginal?.original_pdf_key)")[1].split("return;")[0];
   expect(code).toContain("await archiveAndOpenGuide");
   expect(code).toContain("reconcileQaPixAfterPdf");
   expect(code).toContain("paid.original_pdf_key===archived.original_pdf_key");
   expect(code).not.toContain('action:"issue"');
   expect(code).not.toContain("ensureMercadoPagoGuideCharge");
 });
});
