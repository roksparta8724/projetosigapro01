import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const source=readFileSync("src/components/GuiaRecolhimentoOficial.tsx","utf8");
const renderer=readFileSync("src/lib/guidePdf.ts","utf8");
describe("premium DAM A4: enforce cards, readable fields and safe original capture",()=>{
 it("gives the table explicit widths so its tax description cannot steal value columns",()=>{
   expect(source).toContain("<colgroup>");
   expect(source).toContain("[5, 19, 9, 5, 5, 12, 11, 10, 12, 12]");
   expect(source).toContain("overflow-wrap: anywhere");
 });
 it("wraps long guide numbers and receipt names inside their own cells",()=>{
   expect(source).toContain(".dam-mini-value {\n      white-space: normal;");
   expect(source).toContain(".dam-receipt-right .dam-receipt-row-value");
   expect(source).toContain(".dam-summary-row {\n      grid-template-columns: minmax(0,1.6fr)");
   expect(source).toContain(".dam-receipt-header {\n      height: 24mm");
 });
 it("keeps the original PDF and SHA immutable and refuses truncated card captures",()=>{
   expect(renderer).toContain("element.scrollWidth > element.clientWidth + tolerance");
   expect(renderer).toContain("element.scrollHeight > element.clientHeight + tolerance");
   expect(renderer).toContain("Nenhum original foi arquivado");
   expect(source).toContain("dam-barcode-unavailable");
 });
});
