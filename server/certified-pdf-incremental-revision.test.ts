import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {jsPDF} from "jspdf";
import {prepareFirstPermitCertificateRevision} from "./certified-pdf-incremental-revision";
import {embedUnverifiedPkcs7,assertEmbeddedCmsBytes} from "./certified-pdf-byte-range";
const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
function fixture(){const p=new jsPDF({compress:true});p.text("SIGAPRO QA - SEM VALIDADE",15,20);p.text("Documento ficticio de ensaio",15,30);p.addPage();p.text("Segunda pagina preservada",15,20);return Buffer.from(p.output("arraybuffer"));}
describe("Trusted PDF first incremental certificate revision",()=>{
 it("preserves every original byte and creates xref, root, widget, CAdES slot and exact range",()=>{
  const original=fixture(),p=prepareFirstPermitCertificateRevision({originalBytes:original,expectedOriginalSha256:sha(original),slot:"diretoria",capacityBytes:4096});
  expect(p.bytes.subarray(0,original.length)).toEqual(original);
  const suffix=p.bytes.subarray(original.length).toString("latin1");
  expect(suffix).toContain("/ETSI.CAdES.detached");expect(suffix).toContain("/AcroForm");expect(suffix).toContain("/Annots");
  const newXref=Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(suffix)![1]);
  expect(p.bytes.subarray(newXref,newXref+4).toString()).toBe("xref");
  expect(suffix).toContain("/Prev "+/startxref\s+(\d+)\s+%%EOF\s*$/.exec(original.toString("latin1"))![1]);
  const cms=Buffer.alloc(32,0x30),final=embedUnverifiedPkcs7(p.bytes,p.range,p.preparedPdfSha256,p.byteRangeSha256,cms);
  expect(final.bytes.subarray(0,original.length)).toEqual(original);
  expect(assertEmbeddedCmsBytes({preparedBytes:p.bytes,signedBytes:final.bytes,range:p.range,preparedSha256:p.preparedPdfSha256,byteRangeSha256:p.byteRangeSha256,cmsDer:cms})).toMatchObject({embeddedCmsVerified:true,pdfPolicyVerified:false,issuanceAuthorized:false});
 });
 it("rejects altered inputs and already prepared or unsupported revisions",()=>{
  const original=fixture(),input={originalBytes:original,expectedOriginalSha256:sha(original),slot:"diretoria" as const};
  expect(()=>prepareFirstPermitCertificateRevision({...input,expectedOriginalSha256:"0".repeat(64)})).toThrow("PDF_ORIGINAL_HASH_MISMATCH");
  const p=prepareFirstPermitCertificateRevision(input);
  expect(()=>prepareFirstPermitCertificateRevision({...input,originalBytes:p.bytes,expectedOriginalSha256:sha(p.bytes)})).toThrow();
  const damaged=Buffer.from(original.toString("latin1").replace(/startxref\s+\d+/,"startxref\n123"),"latin1");
  expect(()=>prepareFirstPermitCertificateRevision({...input,originalBytes:damaged,expectedOriginalSha256:sha(damaged)})).toThrow();
  expect(()=>prepareFirstPermitCertificateRevision({...input,capacityBytes:1})).toThrow();
 });
});
