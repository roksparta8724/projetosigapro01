#!/usr/bin/env node
/**
 * Commercial evidence must originate from a successful first-party QA workflow
 * attached to the exact SHA being evaluated. It must not come from an
 * unrelated artifact, pull-request merge ref, or fork.
 */
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

export const QA_BRANCH="fix/qa-triagem-analise-pagamento-20261101";
const SHA=/^[0-9a-f]{40}$/;
const RUN=/^[1-9][0-9]{0,15}$/;
const REPO=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function validateEvidenceRunProvenance(run,opts={}) {
  const sha=String(opts.releaseSha??"").trim();
  const repo=String(opts.repository??"").trim();
  const id=String(opts.runId??"").trim();
  const actualRepo=String(run?.repository?.full_name??"");
  const headRepo=String(run?.head_repository?.full_name??"");
  const evidenceSha=String(run?.head_sha??"");
  const verified=
    SHA.test(sha)&&REPO.test(repo)&&RUN.test(id)&&
    String(run?.id??"")===id&&
    actualRepo===repo&&headRepo===repo&&
    String(run?.head_branch??"")===QA_BRANCH&&
    evidenceSha===sha&&
    (run?.event==="workflow_dispatch"||run?.event==="push")&&
    run?.status==="completed"&&run?.conclusion==="success";
  return {ok:verified,code:verified?"QA_EVIDENCE_RUN_VERIFIED":"QA_EVIDENCE_PROVENANCE_REJECTED"};
}

export async function verifyRunViaGitHub({releaseSha,repository,runId,token},fetcher=fetch) {
  if (!SHA.test(String(releaseSha)) || !REPO.test(String(repository)) ||
      !RUN.test(String(runId)) || !token) {
    throw new Error("PRIVATE_QA_PROVENANCE_CONFIGURATION_REQUIRED");
  }
  const res=await fetcher(
    `https://api.github.com/repos/${repository}/actions/runs/${runId}`,{
      method:"GET",redirect:"error",
      headers:{
        "Accept":"application/vnd.github+json",
        "Authorization":`Bearer ${token}`,
        "X-GitHub-Api-Version":"2022-11-28",
      },
    },
  );
  if(!res.ok) throw new Error("QA_EVIDENCE_RUN_NOT_VERIFIABLE");
  const run=await res.json();
  const verified=validateEvidenceRunProvenance(run,{releaseSha,repository,runId});
  if(!verified.ok) throw new Error(verified.code);
  return verified;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=await verifyRunViaGitHub({
      releaseSha:process.env.SIGAPRO_QA_RELEASE_SHA,
      repository:process.env.GITHUB_REPOSITORY,
      runId:process.env.EVIDENCE_RUN_ID,
      token:process.env.GITHUB_TOKEN,
    });
    console.log("SIGAPRO_QA_EVIDENCE_PROVENANCE "+result.code);
  }catch(error){
    console.error("SIGAPRO_QA_EVIDENCE_PROVENANCE BLOCKED:"+
      (error instanceof Error?error.message:"UNKNOWN"));
    process.exitCode=2;
  }
}
