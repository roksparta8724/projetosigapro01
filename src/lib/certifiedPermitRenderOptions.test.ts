import {describe,it,expect} from "vitest";
import {jsPDF} from "jspdf";
import {applyPermitRenderMetadata,markUnsignedCertificateDraft} from "./certifiedPermitRenderOptions";
const opts={createdAt:"2026-11-27T12:30:00.000Z",fileId:"a".repeat(32)};
function render(){const p=new jsPDF({compress:false});applyPermitRenderMetadata(p,opts);p.text("QA",10,20);p.addPage();p.text("CONTINUACAO",10,20);markUnsignedCertificateDraft(p);return p.output();}
describe("Deterministic certified permit draft metadata",()=>{
 it("fixes date and file ID, marks every page, and renders identical bytes",()=>{
  const a=render();expect(render()).toBe(a);expect(a).toContain("D:20261127123000+00'00'");expect(a).toContain("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");expect(a.match(/MINUTA PARA ASSINATURA CERTIFICADA/g)).toHaveLength(2);
 });
 it("refuses mutable or remotely fetched branding",()=>{
  const p=new jsPDF();expect(()=>applyPermitRenderMetadata(p,{...opts,logoDataUrl:"https://example.invalid/logo.png"})).toThrow();
  expect(()=>applyPermitRenderMetadata(p,{...opts,createdAt:"now"})).toThrow();
 });
});
