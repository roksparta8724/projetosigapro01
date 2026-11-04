import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read=(p:string)=>readFileSync(p,"utf8");
function contrast(fg:string,bg:string) {
 const l=(s:string)=>{const v=[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));return v[0]*.2126+v[1]*.7152+v[2]*.0722};
 const a=l(fg),b=l(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
describe("Master Plans premium readability and bounded cards",()=>{
 const page=read("src/pages/saas/MasterPlansPage.tsx");
 const css=read("src/index.css");const scoped=css.slice(css.lastIndexOf("/* SIGAPRO Master commercial layout"));
 it("protects white preview content against global light-card rules",()=>{
  expect(page).toContain('data-master-commercial-preview-hero="true"');
  expect(page).toContain('data-master-preview-monogram="true"');
  expect(scoped).toContain("color: #f1f7ff !important");
  expect(contrast("#f1f7ff","#123653")).toBeGreaterThan(7);
  expect(contrast("#f1f7ff","#0d615e")).toBeGreaterThan(6);
 });
 it("keeps text and controls within plan cards",()=>{
  expect(page).toContain('className="sig-master-plans-page min-w-0"');
  expect(page).toContain('data-master-plan-card="true"');
  expect(page).toContain('data-master-plan-price-box="true"');
  expect(page).toContain('data-master-plan-limits="true"');
  expect(page).toContain('data-master-commercial-plan-card="true"');
  expect(page).toContain('aria-pressed={selectedPlanIds.includes(plan.id)}');
  expect(page).toContain('[overflow-wrap:anywhere]');
  expect(scoped).toContain("overflow-wrap: anywhere");
 });
 it("uses legible inverse color pairs and does not change pricing logic",()=>{
  expect(scoped).toContain("#12263c");
  expect(scoped).toContain("#e4edf8");
  expect(contrast("#e4edf8","#12263c")).toBeGreaterThan(7);
  expect(page).toContain("await upsertPlan");
  expect(page).toContain("await saveClientPlanAssignment");
  expect(page).toContain("await saveRemoteCommercialMaterial");
 });
});
