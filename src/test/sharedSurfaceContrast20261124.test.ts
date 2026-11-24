import {readFileSync} from "node:fs";
import postcss from "postcss";
import {describe,expect,it} from "vitest";
const css=readFileSync("src/styles/sigapro-shared-surface-contrast-20261124.css","utf8");
const main=readFileSync("src/main.tsx","utf8");
const layout=readFileSync("src/components/platform/PageLayout.tsx","utf8");
const page=readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
function luminance(hex:string){const values=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;}
function ratio(a:string,b:string){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+0.05)/(values[1]+0.05);}
describe("Shared premium contrast contract",()=>{
 it("parses and loads after existing global surfaces",()=>{
  expect(()=>postcss.parse(css)).not.toThrow();
  expect(main.indexOf("sigapro-shared-surface-contrast-20261124.css")).toBeGreaterThan(main.indexOf("sigapro-adaptive-registries-20261124.css"));
 });
 it("keeps the shared nav state and explicit empty action",()=>{
  expect(layout).toContain('data-shared-nav-contract="v1"');
  expect(page).toContain('data-premium-empty-state="municipality"');
  expect(page).toContain('data-shared-action="primary"');
  expect(page).toContain("Escolher Prefeitura");
  expect(css).toContain("-webkit-text-fill-color:#ffffff!important");
 });
 it("keeps declared foreground/background pairs at least 4.5:1",()=>{
  for(const [fg,bg] of [["#ffffff","#12567e"],["#e2f3ff","#12567e"],["#ffffff","#124766"],["#ffffff","#195c80"],["#ffffff","#475569"],["#173650","#ffffff"],["#496379","#e4f1fa"],["#f4f9ff","#1e405a"],["#c7dceb","#2b526c"]]){
   expect(ratio(fg,bg)).toBeGreaterThanOrEqual(4.5);
  }
 });
 it("does not apply to custom maintenance actions or document paper",()=>{
  expect(css).toContain(":not([data-maintenance-action])");
  expect(css).toContain("[data-print-document] *");
  expect(css).toContain("[data-sigapro-ai-review-shortcut]");
 });
});

it("keeps the Master form command readable in both themes and every state",()=>{
 const header=page.slice(page.indexOf('<section ref={formRef}'),page.indexOf('<form id="master-municipality-form"'));
 expect(header).toContain('data-master-form-command="save"');
 expect(header).toContain('data-master-command-label="true"');
 expect(header).not.toContain('!text-[#0e3048]');
 expect(css).toContain('button[data-master-form-command="save"]:disabled');
 expect(css).toContain('button[data-master-form-command="save"]:hover:not(:disabled)');
 expect(ratio("#ffffff","#124766")).toBeGreaterThanOrEqual(4.5);
 expect(ratio("#ffffff","#475569")).toBeGreaterThanOrEqual(4.5);
 expect(ratio("#153b58","#f4f9fd")).toBeGreaterThanOrEqual(4.5);
});
it("prevents legacy light card text rules from repainting control labels",()=>{
 const base=readFileSync("src/index.css","utf8");
 const i=base.indexOf("/* Light utility surfaces:");
 const block=base.slice(i,base.indexOf("\n}",base.indexOf("\n}",i)+2)+2);
 expect(block).not.toContain('div,section,article,li,aside,button');
 expect(block).toContain('[data-ui="button"] *');
 expect(block).toContain('[data-nav-active] *');
 expect(block).toContain('[data-ui="badge"] *');
});
