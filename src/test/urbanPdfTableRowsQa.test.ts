import { describe,it,expect } from "vitest";
import { discoverUrbanPdfRows, readUrbanTableRow } from "@/lib/urbanPdfTableRows";
import type {UrbanPdfSourceLayer,PdfTextRun} from "@/lib/urbanPdfTextLayer";
const p=(text:string,x:number,y:number,width:number,height=11):PdfTextRun=>({
 text,x,y,width,height,page:36,
});
const headers:PdfTextRun[]=[
 p("MÍNIMO",160.2,137.5,25.7),p("BÁSICO",198.6,138,26.2),
 p("MÁXIMO",239.4,138,28.1),p("OCUPAÇÃO",277.8,132,40.5),
 p("PERMEABILIDADE",326.7,137.5,63.2),
 p("LOTE",409.4,123.3,17.9),p("TESTADA",449.7,133.7,32.8),
 p("GABARITO",504.9,129.8,36.7),p("FRENTE",560.5,138.2,23.8),
 p("FUNDOS",594.1,137.6,25.2),p("LATERAL",630.6,137.8,27.6),
 // Physical PDF page 36 contains another 'lateral)' in Obs. (recuo lateral),
 // at x=675..694. This was misidentified as a second LATERAL header.
 p("lateral)",675.5,145.0,19.0,8),
];
const data:PdfTextRun[]=[
 p("comercial",108.4,185.1,36.6),p("ZONA",36.4,192.6,22.2,10.3),
 p("ZM-B(e)",60.9,192.6,29.4,10.3),
 p("0,05",165.5,185.4,15.1),p("0,5",206.3,185.9,10.8),
 p("1",251.2,185.4,4.1),p("50",294.1,185.4,8.5),
 p("70",354.1,184.7,8.9),p("3000",409.8,183.5,17.6),
 p("30",461.7,185.4,8.9),p("largura",497.7,175.1,26.5),
 p("da",527,175.1,8.7),p("via",538.5,175.1,10.7),
 p("da",500.1,185.2,8.9),p("testada+",511.6,185.2,34.7),
 p("recuo",512.6,193.6,21.2,12.6),
 p("10",568,184.9,8.8),p("8",604.2,185.4,4),
 p("5",642.6,185.4,4.1),
 p("residencial",106.1,212.7,41.3),
 p("0,02",165.5,212.3,15.1),p("0,1",206.3,213.2,9.8),
 p("0,6",248.1,213.2,10.2),p("30",293.7,213.2,8.4),
 p("80",353.6,212.7,8.9),p("3000",409.8,212.1,17.1),
 p("30",461.7,213.2,8.4),p("2",497.7,212,4.4),
 p("pavimentos",504.5,212.1,43.8),
 p("10",568,212.7,8.8),p("8",604.2,212.7,4),p("4",642.2,213.2,4.1),
 // Another commercial line of the same printed zone: NEVER merge by category.
 p("comercial",108.4,236.6,36.6),
];
const fixture=(runs:PdfTextRun[]=headers.concat(data)):UrbanPdfSourceLayer=>({
 page:36,totalPages:110,runCount:runs.length,
 textLength:runs.reduce((v,r)=>v+r.text.length,0),textStatus:"text_available",
 runs,zoneMatches:[],usageMatches:[],warnings:[],
});
describe("SIGAPRO QA — true line- and header-based PDF table extraction",()=>{
 it("finds separate commercial rows and obliges an explicit row selection",()=>{
  const rows=discoverUrbanPdfRows(fixture());
  expect(rows.filter(r=>r.zone==="ZM-B(e)"&&r.usage==="comercial")).toHaveLength(2);
  const blank=readUrbanTableRow(fixture(),"");
  expect(blank.recognized).toBe(0);
  expect(blank.status).toBe("select_row");
 });
 it("does not confuse the PDF margin note '(recuo lateral)' with the LATERAL header",()=>{
  const layer=fixture();
  const rows=discoverUrbanPdfRows(layer);
  expect(rows.length).toBeGreaterThan(0);
  const result=readUrbanTableRow(layer,rows[0].id);
  expect(result.recognized).toBe(13);
  expect(result.cells.find(c=>c.key==="recuo_lateral")?.value).toBe("5");
 });
 it("recognizes all 13 cells from physical PDF word positions without AI",()=>{
  const layer=fixture(),row=discoverUrbanPdfRows(layer)[0];
  const read=readUrbanTableRow(layer,row.id);
  expect(read.status).toBe("read");
  expect(read.recognized).toBe(13);
  const val=(k:string)=>read.cells.find(c=>c.key===k)?.value;
  expect(val("zona")).toBe("ZM-B(e)");
  expect(val("uso")).toBe("comercial");
  expect(val("ca_minimo")).toBe("0,05");
  expect(val("ca_basico")).toBe("0,5");
  expect(val("ca_maximo")).toBe("1");
  expect(val("ocupacao_maxima")).toBe("50");
  expect(val("permeabilidade_minima")).toBe("70");
  expect(val("lote_minimo")).toBe("3000");
  expect(val("testada_minima")).toBe("30");
  expect(val("gabarito")).toBe("largura da via da testada+ recuo");
  expect(val("recuo_frontal")).toBe("10");
  expect(val("recuo_fundos")).toBe("8");
  expect(val("recuo_lateral")).toBe("5");
  expect(read.cells.every(c=>c.evidence.length>0)).toBe(true);
 });
 it("never substitutes the next residential line or the same-zone commercial line",()=>{
  const layer=fixture(),row=discoverUrbanPdfRows(layer)[0];
  const read=readUrbanTableRow(layer,row.id);
  expect(read.cells.find(c=>c.key==="ca_minimo")?.value).toBe("0,05");
  expect(read.cells.find(c=>c.key==="ca_minimo")?.value).not.toBe("0,02");
 });
 it("accepts PDF.js runs that combine ZONA heading and code without accepting an arbitrary zone",()=>{
  const merged=fixture(headers.concat(data.filter(r=>!["ZONA","ZM-B(e)"].includes(r.text)),
    p("ZONA ZM-B(e)",36.4,192.6,53.9,10.3)));
  const row=discoverUrbanPdfRows(merged)[0];
  expect(row.zone).toBe("ZM-B(e)");
  expect(readUrbanTableRow(merged,row.id).cells.find(x=>x.key==="zona")?.value).toBe("ZM-B(e)");
 });
 it("rejects missing headers and ambiguous numbers instead of inventing indices",()=>{
  const missingHeader=fixture(headers.filter(r=>r.text!=="TESTADA").concat(data));
  expect(discoverUrbanPdfRows(missingHeader)).toHaveLength(0);
  const ambiguous=fixture(headers.concat(data,p("0,08",170,186,16)));
  const first=discoverUrbanPdfRows(ambiguous)[0];
  const result=readUrbanTableRow(ambiguous,first.id);
  expect(result.recognized).toBe(12);
  expect(result.cells.find(c=>c.key==="ca_minimo")?.status).toBe("ambiguous");
  expect(result.cells.find(c=>c.key==="ca_minimo")?.value).toBeNull();
 });
});