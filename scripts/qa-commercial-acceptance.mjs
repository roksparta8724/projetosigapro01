#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,basename} from "node:path";
import {fileURLToPath} from "node:url";
export const REQUIRED=Object.freeze([
  "tenant_isolation","ai_real_plan","pdf_original","bank_settlement",
  "bank_worker_privileges","neon_r2_recovery","master_dashboard",
  "city_dashboard","analyst_dashboard","external_dashboard",
]);
const HASH=/^[0-9a-f]{64}$/,SHA=/^[0-9a-f]{40}$/;
export function acceptance(manifest,sha,readArtifact){
  const failures=[];
  if(manifest?.version!==1||manifest?.environment!=="qa"||!SHA.test(sha||""))
    failures.push("INVALID_SCOPE_OR_SHA");
  const items=manifest?.checks;
  if(!Array.isArray(items)){failures.push("INVALID_CHECKS");return {ready:false,failures};}
  const seen=new Set();
  for(const item of items){
    if(!item||!REQUIRED.includes(item.id)){failures.push("UNKNOWN_CHECK");continue;}
    if(seen.has(item.id)){failures.push("DUPLICATE:"+item.id);continue;}
    seen.add(item.id);
    if(item.status!=="approved"){failures.push("NOT_APPROVED:"+item.id);continue;}
    if(item.sha!==sha||!SHA.test(item.sha||"")||
       typeof item.reviewer!=="string"||item.reviewer.trim().length<5||
       !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(item.verifiedAt||"")||
       !Number.isFinite(Date.parse(item.verifiedAt))||
       !HASH.test(item.sha256||"")||
       item.file!==item.id+".evidence"){
      failures.push("EVIDENCE_METADATA_INVALID:"+item.id);continue;
    }
    let artifact=null;
    try{artifact=readArtifact(item.file);}catch{}
    if(!artifact||artifact.byteLength<20||artifact.byteLength>2_000_000||
       createHash("sha256").update(artifact).digest("hex")!==item.sha256)
      failures.push("EVIDENCE_FILE_UNVERIFIED:"+item.id);
  }
  for(const id of REQUIRED)if(!seen.has(id))failures.push("MISSING:"+id);
  return {ready:failures.length===0,failures,approved:items.filter(x=>x?.status==="approved").length,required:REQUIRED.length};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const mode=process.argv[2]||"--report";
  if(mode!=="--report"&&mode!=="--enforce")process.exit(2);
  const manifest=JSON.parse(readFileSync("docs/QA_COMMERCIAL_ACCEPTANCE.json","utf8"));
  const sha=process.env.SIGAPRO_QA_RELEASE_SHA||process.env.GITHUB_SHA||"";
  const evidenceDir=resolve(process.env.SIGAPRO_QA_EVIDENCE_DIR||".qa-private-evidence");
  const report=acceptance(manifest,sha,file=>{
    if(basename(file)!==file)throw Error("PATH_REJECTED");
    return readFileSync(resolve(evidenceDir,file));
  });
  console.log("SIGAPRO_QA_COMMERCIAL_ACCEPTANCE "+JSON.stringify(report));
  if(mode==="--enforce"&&!report.ready)process.exitCode=2;
}
