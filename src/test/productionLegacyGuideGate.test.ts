import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
describe("production historical payment-guide fail-closed readiness gate",()=>{
 const sql=readFileSync("scripts/production-legacy-guide-inventory.sql","utf8");
 const raw=sql.replace(/--[^\n]*$/gm,"");
 it("is strictly read only, preserving every paid guide and immutable original",()=>{
   expect(raw).toMatch(/FROM public\.payment_guides g/);
   expect(raw).toMatch(/FROM public\.process_documents d/);
   expect(raw).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|CALL|EXECUTE|DO)\b/i);
 });
 it("recognizes payment status even when the paid flag contradicts it",()=>{
   expect(sql).toContain("COALESCE(g.paid,false)");
   expect(sql).toContain("'confirmed'");
   expect(sql).toContain("status_settled_but_paid_flag_false");
   expect(sql).toContain("settled_missing_process_or_tenant");
 });
 it("does not accept merely any process attachment as a valid historical bank original",()=>{
   expect(sql).toContain("d.file_name ILIKE '%'||g.guide_number||'%'");
   expect(sql).toContain("d.title ILIKE '%'||g.guide_number||'%'");
   expect(sql).toContain("application/pdf");
   expect(sql).toContain("settled_without_matched_original");
 });
 it("requires exact server-side archival functions before considering a release",()=>{
   expect(sql).toContain("original_read_available");
   expect(sql).toContain("original_freeze_available");
   expect(sql).toContain("original_attach_available");
   expect(sql).toContain("RELEASE_RECONCILIATION_REQUIRED");
 });
});
