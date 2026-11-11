/**
 * Read-only, exact-file QA R2 proof. NO profile queries, no signers, no
 * storage mutation and no arbitrary object key supplied by the requester.
 * Public result holds ONLY booleans, known QA synthetic measurements, count,
 * and short SHA fingerprint; never PDF contents or private credentials.
 *
 * For a different document use the normal analyst-authenticated endpoint.
 */
import type {IncomingMessage,ServerResponse} from "node:http";
import {createHash} from "node:crypto";
import {GetObjectCommand,HeadObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {getR2EndpointCandidates} from "./r2-runtime.js";
import {extractNativeArchitecturalPdf} from "./native-architectural-pdf.js";
import {auditArchitecturalPdfPages} from "../src/lib/architecturalPdfPageAudit.js";
import {benchmarkQa04ArchitecturalReadings} from "../src/lib/architecturalPdfReadings.js";

const REF="fix/qa-triagem-analise-pagamento-20261101";
const DOCUMENT_KEY="municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/qa-arquitetura/d5434b4e-e1f5-46fd-a95c-dedc9631d9d2/04697e67-66a4-469f-ae41-ac21dcbc6126-SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf";
const DECLARED_BYTES=16575;
const MAX_BYTES=1024*1024;
const normalize=(key:string)=>String(process.env[key]||"").replace(/^['"]|['"]$/g,"").trim();
const reply=(res:ServerResponse,status:number,payload:unknown)=>{
  res.statusCode=status;
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.end(JSON.stringify(payload));
};
export const qaR2ProofEnabled=(env:NodeJS.ProcessEnv=process.env)=>
  env.VERCEL_ENV==="preview" &&
  env.VERCEL_GIT_COMMIT_REF===REF &&
  env.VITE_SIGAPRO_NEON_ISOLATED==="true";
export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(!qaR2ProofEnabled())return reply(res,404,{status:"disabled"});
  if(req.method!=="GET")return reply(res,405,{status:"method_not_allowed"});
  // A fixed synthetic file and read-only probe; never accept a caller-selected
  // process, municipality, object, provider, secret or URL.
  const bucket=normalize("R2_BUCKET_DOCUMENTOS")||"sigapro-documentos";
  const endpoints=getR2EndpointCandidates();
  const accessKeyId=normalize("R2_ACCESS_KEY_ID");
  const secretAccessKey=normalize("R2_SECRET_ACCESS_KEY");
  if(!endpoints.length||!accessKeyId||!secretAccessKey)
    return reply(res,503,{status:"credentials_unavailable",r2BytesVerified:false,aiLocalReadVerified:false});
  let sawObject=false;
  let wrongBytes=false;
  for(const endpoint of endpoints){
    const client=new S3Client({region:"auto",endpoint,credentials:{accessKeyId,secretAccessKey},
      maxAttempts:1,requestHandler:undefined});
    try{
      const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:DOCUMENT_KEY}));
      const size=Number(head.ContentLength||0);
      if(!size||size>MAX_BYTES||size!==DECLARED_BYTES){
        wrongBytes=true;
        break;
      }
      sawObject=true;
      const obj=await client.send(new GetObjectCommand({Bucket:bucket,Key:DOCUMENT_KEY}));
      const bytes=await obj.Body?.transformToByteArray();
      if(!bytes||bytes.length!==size||Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-"){
        wrongBytes=true; break;
      }
      const sha256=createHash("sha256").update(bytes).digest("hex");
      const storedHash=String(head.Metadata?.sha256||"").toLowerCase();
      if(storedHash && storedHash!==sha256){wrongBytes=true;break;}
      const reading=auditArchitecturalPdfPages(bytes,extractNativeArchitecturalPdf(bytes));
      const comparison=benchmarkQa04ArchitecturalReadings(reading.readings);
      const passed=comparison.total===3&&comparison.passed===3&&
        reading.pageAudit.count===3&&reading.pageAudit.countVerified===true&&
        reading.hasSitePlan===true&&reading.automaticallyApproved===false&&
        reading.source==="pdf_text_local";
      return reply(res,passed?200:422,{
        status:passed?"verified":"reading_mismatch",
        document:"QA04_PLANTA_V2_FICTICIA",
        r2BytesVerified:true,pdfSha256Prefix:sha256.slice(0,12),
        r2ObjectMetadataHashMatches:storedHash?true:"not_provided",
        aiLocalReadVerified:passed,readMode:"native_text",externalProviderCalls:0,
        pagesRead:reading.textCoverage?.pagesRead||0,
        expectedPages:3,setbacksPassed:comparison.passed,setbacksExpected:3,
        values:comparison.cases.map(x=>({metric:x.metric,expected:x.expected,read:x.readValue,page:x.readPage,verified:x.verified})),
        humanReviewRequired:true,legalConformity:"not_evaluated",
        processUpdated:false,
      });
    }catch(e){
      // Try another configured R2 endpoint only. Do not return raw S3 errors.
      if(e instanceof Error && e.name==="AccessDenied"){
        break;
      }
    }finally{client.destroy();}
  }
  return reply(res,503,{
    status:wrongBytes?"r2_pdf_integrity_failure":sawObject?"r2_read_failure":"r2_object_unavailable",
    r2BytesVerified:false,aiLocalReadVerified:false,
    processUpdated:false,
  });
}
