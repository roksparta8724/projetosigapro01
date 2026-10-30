import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {inspectBankFile} from "./bankFileInspector";
function cnab240(bank:string,type:string,segment=""){
 const arr=Array.from({length:240},()=> " ");
 for(let i=0;i<3;i++)arr[i]=bank[i];
 arr[7]=type;if(segment)arr[13]=segment;
 return arr.join("");
}
const cnab400=(type:string)=>type+" ".repeat(399);
const transaction=(id:string,amount="10.00",date="20261029")=>
 "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>"+date+"<TRNAMT>"+amount+"<FITID>"+id+"</STMTTRN>";
const ofx=(entries:string[])=>"OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKTRANLIST>"+
 entries.join("")+"</BANKTRANLIST></OFX>";
describe("SIGAPRO bank file recognition - never settlement",()=>{
 it("reads CNAB240 with bank matching and correct segment counts",()=>{
  const raw=[cnab240("033","0"),cnab240("033","1"),cnab240("033","3","T"),cnab240("033","3","U"),cnab240("033","5"),cnab240("033","9")].join("\r\n");
  expect(inspectBankFile(raw,"033")).toMatchObject({format:"cnab240",bankCode:"033",records:6,details:2,incomingCredits:null,automaticSettlementAllowed:false,verifiedByBank:false});
  expect(inspectBankFile(raw,"341").warnings.join(" ")).toMatch(/não corresponde/);
 });
 it("rejects inconsistent CNAB240 bank and header, warns unmatched segment pairs",()=>{
  expect(()=>inspectBankFile([cnab240("033","0"),cnab240("341","9")].join("\n"))).toThrow(/divergentes/);
  expect(()=>inspectBankFile([cnab240("033","3","T"),cnab240("033","9")].join("\n"))).toThrow(/cabeçalho/);
  const x=inspectBankFile([cnab240("033","0"),cnab240("033","3","T"),cnab240("033","9")].join("\n"));
  expect(x.warnings.join(" ")).toMatch(/Segmentos T e U/);
 });
 it("reads CNAB400 structurally without guessing bank-specific fields",()=>{
  expect(inspectBankFile([cnab400("0"),cnab400("1"),cnab400("9")].join("\n"))).toMatchObject({format:"cnab400",bankCode:null,records:3,details:1,automaticSettlementAllowed:false});
 });
 it("reads OFX and flags duplicate FITID and malformed dates",()=>{
  const x=inspectBankFile(ofx([transaction("ID1"),transaction("ID1"),transaction("ID2","-3.00"),transaction("ID3","10.00","20260230")]));
  expect(x).toMatchObject({format:"ofx",records:4,incomingCredits:2,duplicateIdentifiers:1,automaticSettlementAllowed:false});
  expect(x.warnings.join(" ")).toMatch(/FITID repetido/);
  expect(x.warnings.join(" ")).toMatch(/sem data/);
 });
 it("rejects unknown, binary, oversized and mixed-format input",()=>{
  expect(()=>inspectBankFile("arquivo não reconhecido")).toThrow(/Formato não reconhecido/);
  expect(()=>inspectBankFile("\u0000x")).toThrow(/binário/);
  expect(()=>inspectBankFile("x".repeat(2_000_001))).toThrow(/2 MB/);
  expect(()=>inspectBankFile(cnab240("033","0")+"\n"+cnab400("9"))).toThrow(/Formato não reconhecido/);
 });
 it("keeps browser local: no statements uploaded or bank credit mutations",()=>{
  const cmp=readFileSync("src/components/platform/MunicipalBankFileInspector.tsx","utf8");
  const bank=readFileSync("src/components/platform/MunicipalBankDetailsSettings.tsx","utf8");
  expect(cmp).toContain("await file.text()");
  expect(cmp).not.toContain("fetch(");
  expect(cmp).not.toContain("uploadFileToStorage");
  expect(bank).toContain("<MunicipalBankFileInspector");
 });
});
