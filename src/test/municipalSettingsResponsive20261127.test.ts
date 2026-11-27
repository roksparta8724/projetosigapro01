import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(name:string)=>readFileSync("src/components/platform/"+name+".tsx","utf8");
describe("Responsive settings surfaces",()=>{
 it("uses explicit dark backgrounds and contrasting text in municipal storage",()=>{
  const s=read("MunicipalStorageSettings");
  expect(s).toContain("dark:bg-slate-900");expect(s).toContain("dark:bg-slate-950");
  expect(s).toContain("dark:bg-amber-950");expect(s).toContain("dark:text-slate-100");
  expect(s).toContain("grid-cols-1");expect(s).toContain("whitespace-normal");expect(s).toContain("min-h-11");
 });
 it("keeps the updated certification and readiness actions touch-sized and responsive",()=>{
  for(const name of ["ExternalCertificateSigningOptions","MunicipalCommercialReadiness","MunicipalPermitSignaturePolicy","MunicipalItiSandboxSetup"]){
   const s=read(name);expect(s).toContain("min-h-11");expect(s).toContain("sm:w-auto");expect(s).toContain("dark:");expect(s).toContain("min-w-0");
  }
 });
});
