import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {GetObjectCommand,HeadObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {resolveVisualPdfProvider,extractVisualPdf} from "./architectural-pdf-provider";
import {getR2EndpointCandidates} from "./r2-runtime";

// One-shot, synthetic QA PDF ONLY. Verifies the alternate Cloudflare
// PDF-to-text + Workers AI route without pretending that it inspects CAD
// geometry or can approve urbanistic requirements.
const enabled=process.env.VERCEL_ENV==="preview" &&
 process.env.VERCEL_GIT_COMMIT_REF==="fix/qa-triagem-analise-pagamento-20261101" &&
 process.env.VITE_SIGAPRO_NEON_ISOLATED==="true" &&
 process.env.SIGAPRO_QA_REAL_CF_TEXT_PROBE_ONCE==="true";
const key="municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/qa-arquitetura/"+
 "d5434b4e-e1f5-46fd-a95c-dedc9631d9d2/"+
 "04697e67-66a4-469f-ae41-ac21dcbc6126-SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf";

describe("Single real Cloudflare PDF text provider check (QA synthetic only)",()=>{
 (enabled?it:it.skip)("recovers real PDF bytes and makes a Cloudflare text request",async()=>{
   const get=(s:string)=>String(process.env[s]||"").trim();
   const candidate=resolveVisualPdfProvider(get,"cloudflare_text");
   expect(candidate.enabled).toBe(true);
   if(!candidate.enabled)throw Error("QA_CLOUDFLARE_TEXT_NOT_CONFIGURED");
   expect(candidate.provider.kind).toBe("cloudflare");
   const bucket=get("R2_BUCKET_DOCUMENTOS");
   const accessKeyId=get("R2_ACCESS_KEY_ID");
   const secretAccessKey=get("R2_SECRET_ACCESS_KEY");
   expect(bucket&&accessKeyId&&secretAccessKey).toBeTruthy();
   let pdf:Uint8Array|null=null;
   for(const endpoint of getR2EndpointCandidates()){
     const s3=new S3Client({region:"auto",endpoint,maxAttempts:1,
       credentials:{accessKeyId,secretAccessKey}});
     try{
       const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
       if(head.ContentLength!==16575)continue;
       const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
       const bytes=await object.Body?.transformToByteArray();
       if(bytes && bytes.byteLength===16575 &&
          Buffer.from(bytes.subarray(0,5)).toString("ascii")==="%PDF-" &&
          createHash("sha256").update(bytes).digest("hex").startsWith("5dff09d72383")){
         pdf=bytes;break;
       }
     }catch{/* Only predetermined endpoints, no user-selected URLs. */}
     finally{s3.destroy();}
   }
   expect(pdf).not.toBeNull();
   if(!pdf)throw Error("QA_CF_FIXED_R2_PDF_MISSING");
   // One explicit Cloudflare call, no fallback to Claude, no retries.
   const result=await extractVisualPdf(pdf,"SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf",
     candidate.provider);
   expect(result.source).toBe("ai_pdf_text");
   expect(result.automaticallyApproved).toBe(false);
   console.log("SIGAPRO_QA_CLOUDFLARE_REAL_TEXT "+JSON.stringify({
     provider:"cloudflare",source:result.source,
     documentType:result.documentType,
     quotedMeasurements:result.readings?.length??0,
     visualGeometryVerified:false,legallyApproved:false,
   }));
 },75000);
});
