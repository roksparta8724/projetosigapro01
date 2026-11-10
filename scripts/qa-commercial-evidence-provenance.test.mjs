import {test} from "node:test";
import assert from "node:assert/strict";
import {QA_BRANCH,validateEvidenceRunProvenance,verifyRunViaGitHub}
  from "./qa-commercial-evidence-provenance.mjs";

const releaseSha="b".repeat(40);
const repo="roksparta8724/projetosigapro01";
const runId="42843945208";
const valid=()=>({
  id:Number(runId),head_sha:releaseSha,head_branch:QA_BRANCH,
  status:"completed",conclusion:"success",event:"workflow_dispatch",
  repository:{full_name:repo},head_repository:{full_name:repo},
});
const opts={releaseSha,repository:repo,runId};

test("reject artifact from a different SHA, branch, repository, fork, or trigger",()=>{
  assert.equal(validateEvidenceRunProvenance(valid(),opts).ok,true);
  const mutate=[
    {head_sha:"a".repeat(40)},
    {head_branch:"main"},
    {status:"in_progress"},
    {conclusion:"failure"},
    {event:"pull_request"},
    {event:"pull_request_target"},
    {id:999},
    {repository:{full_name:"attacker/another"}},
    {head_repository:{full_name:"fork/another"}},
  ];
  for(const m of mutate){
    assert.equal(validateEvidenceRunProvenance({...valid(),...m},opts).ok,false,
      "Expected to deny "+JSON.stringify(m));
  }
});
test("fails closed for malformed IDs and repository names",()=>{
  for(const runId of ["0","-1","abc","1?x=1","0".repeat(20)])
    assert.equal(validateEvidenceRunProvenance(valid(),{...opts,runId}).ok,false);
  assert.equal(validateEvidenceRunProvenance(valid(),{...opts,repository:"https://evil.com"}).ok,false);
  assert.equal(validateEvidenceRunProvenance(valid(),{...opts,releaseSha:"bad"}).ok,false);
  assert.equal(validateEvidenceRunProvenance(null,opts).ok,false);
});
test("live check only requests a fixed GitHub Actions endpoint with scoped token",async()=>{
  const calls=[];
  const fetcher=async (url,init)=>{
    calls.push({url,init});
    return {ok:true,json:async()=>valid()};
  };
  const result=await verifyRunViaGitHub({...opts,token:"not-a-real-token"},fetcher);
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,`https://api.github.com/repos/${repo}/actions/runs/${runId}`);
  assert.equal(calls[0].init.redirect,"error");
  assert.equal(calls[0].init.headers.Authorization,"Bearer not-a-real-token");
});
test("network failure, unauthorized response and missing token never become approvals",async()=>{
  await assert.rejects(()=>verifyRunViaGitHub({...opts,token:""}),/CONFIGURATION/);
  await assert.rejects(()=>verifyRunViaGitHub({...opts,token:"x"},
    async()=>({ok:false,status:403})),/NOT_VERIFIABLE/);
  await assert.rejects(()=>verifyRunViaGitHub({...opts,token:"x"},
    async()=>({ok:true,json:async()=>({...valid(),head_sha:"c".repeat(40)})})),
    /PROVENANCE_REJECTED/);
});
