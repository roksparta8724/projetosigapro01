import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {GetObjectCommand,HeadObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {resolveVisualPdfProvider,extractVisualPdf} from "./architectural-pdf-provider";
import {getR2EndpointCandidates} from "./r2-runtime";
import {benchmarkQa04ArchitecturalReadings} from "../src/lib/architecturalPdfReadings";

// A single explicit, reviewable commit with [visual-qa-once] runs a REAL
// model call using only the QA04 artificial plan, already in the QA bucket.
// Not included in normal CI, no production or customer PDF, no fallback/retry,
// no expense on subsequent deployments. A mismatch FAILS the preview build.
const runOnce=process.env.VERCEL_ENV==="preview" &&
  process.env.VERCEL_GIT_COMMIT_REF==="fix/qa-triagem-analise-pagamento-20261101" &&
  process.env.VITE_SIGAPRO_NEON_ISOLATED==="true" &&
  String(process.env.VERCEL_GIT_COMMIT_MESSAGE||"").includes("[visual-qa-once]");
const FIXED_QA_PDF=
  "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/qa-arquitetura/"+
  "d5434b4e-e1f5-46fd-a95c-dedc9631d9d2/"+
  "04697e67-66a4-469f-ae41-ac21dcbc6126-SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf";

describe("One-shot real Anthropic PDF vision, synthetic QA fixture only",()=>{
  (runOnce?it:it.skip)("extracts and validates quoted, page-specific setbacks from stored R2 QA PDF",async()=>{
    const get=(key:string)=>String(process.env[key]||"").trim();
    const configured=resolveVisualPdfProvider(get);
    expect(configured.enabled).toBe(true);
    if(!configured.enabled)throw new Error("QA_VISUAL_PROVIDER_NOT_CONFIGURED");
    expect(configured.provider.kind).toBe("claude");
    const bucket=get("R2_BUCKET_DOCUMENTOS");
    const accessKeyId=get("R2_ACCESS_KEY_ID");
    const secretAccessKey=get("R2_SECRET_ACCESS_KEY");
    expect(bucket&&accessKeyId&&secretAccessKey).toBeTruthy();
    let pdf:Uint8Array|null=null;
    for(const endpoint of getR2EndpointCandidates()){
      const client=new S3Client({region:"auto",endpoint,maxAttempts:1,
        credentials:{accessKeyId,secretAccessKey}});
      try{
        const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:FIXED_QA_PDF}));
        expect(head.ContentLength).toBe(16575);
        const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:FIXED_QA_PDF}));
        const bytes=await object.Body?.transformToByteArray();
        if(bytes&&bytes.byteLength===16575&&
          Buffer.from(bytes.subarray(0,5)).toString("ascii")==="%PDF-"&&
          createHash("sha256").update(bytes).digest("hex").startsWith("5dff09d72383")){
          pdf=bytes;break;
        }
      }catch {/* Only fixed configured endpoints; no caller-selected URLs. */}
      finally{client.destroy();}
    }
    expect(pdf).not.toBeNull();
    if(!pdf)throw new Error("QA_VISUAL_FIXED_R2_PDF_MISSING");
    // One request through the production SIGAPRO PDF visual reader path.
    const parsed=await extractVisualPdf(pdf,"SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf",
      configured.provider);
    const comparison=benchmarkQa04ArchitecturalReadings(parsed.readings);
    console.log("SIGAPRO_QA_REAL_VISUAL_AI "+JSON.stringify({
      provider:"claude",source:parsed.source,
      measured:comparison.passed,expected:comparison.total,
      legallyApproved:false,customerPdf:false,
    }));
    expect(parsed.source).toBe("ai_pdf_visual");
    expect(parsed.automaticallyApproved).toBe(false);
    expect(comparison.total).toBe(3);
    expect(comparison.passed).toBe(3);
  },60000);
});
