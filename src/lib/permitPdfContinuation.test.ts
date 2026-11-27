import {describe,it,expect} from "vitest";
import {jsPDF} from "jspdf";
import {appendPermitContinuations,permitSummaryLines} from "./permitPdfContinuation";
const context={municipality:"Prefeitura de teste",permitNumber:"ALV-QA-01",protocol:"PROTO-QA-01",documentTitle:"Documento de teste"};
describe("Preservação de condições e pareceres dos alvarás",()=>{
 it("retains short summaries without creating new pages",()=>{
  expect(permitSummaryLines(["curto"],4)).toEqual({lines:["curto"],overflow:false});
  const pdf=new jsPDF();appendPermitContinuations(pdf,{...context,sections:[]});
  expect(pdf.getNumberOfPages()).toBe(1);
 });
 it("replaces the last visible line with a continuation notice",()=>{
  const result=permitSummaryLines(["a","b","c","d","e"],4);
  expect(result.overflow).toBe(true);expect(result.lines).toHaveLength(4);expect(result.lines[3]).toMatch(/texto integral/i);
 });
 it("includes the last condition and every intermediate unique line, paginating safely",()=>{
  const pdf=new jsPDF({compress:false});
  const lines=Array.from({length:160},(_,i)=>"CONDICAO-"+String(i).padStart(3,"0")+"-FIM");
  appendPermitContinuations(pdf,{...context,sections:[{title:"Condicoes",body:lines.join("\n")}]});
  expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
  const output=pdf.output();
  for(const line of lines)expect(output).toContain(line);
  expect(output).toContain("ALV-QA-01");expect(output).toContain("PROTO-QA-01");
 });
});
