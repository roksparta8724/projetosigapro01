import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {acceptance,REQUIRED,evidenceConfiguration} from "./qa-commercial-acceptance.mjs";

const sha="a".repeat(40);
const body=Buffer.from("Sanitized evidence: synthetic validation sample, no user data.");
const hash=createHash("sha256").update(body).digest("hex");
const approved=()=>REQUIRED.map(id=>({id,status:"approved",sha,reviewer:"Analista QA",
  verifiedAt:"2026-11-07T16:00:00Z",file:id+".evidence",sha256:hash}));
const check=(items,read=()=>body,releaseSha=sha)=>
  acceptance({version:1,environment:"qa",releaseSha,checks:items},sha,read);

test("current project must not pass without ten real approval proofs",()=>{
  const result=check(REQUIRED.map(id=>({id,status:"pending"})));
  assert.equal(result.ready,false);assert.equal(result.required,10);
  assert.ok(result.failures.includes("NOT_APPROVED:bank_settlement"));
  assert.ok(result.failures.includes("NOT_APPROVED:neon_r2_recovery"));
});
test("private manifest can approve an immutable release without a circular Git commit",()=>{
  assert.equal(check(approved()).ready,true);
  assert.equal(check(approved(),()=>body,"b".repeat(40)).ready,false);
  const stale=approved();stale[0].sha="b".repeat(40);
  assert.equal(check(stale).ready,false);
  assert.equal(check(approved(),()=>Buffer.from("changed")).ready,false);
});
test("duplicate, missing, forged and traversing proofs never pass",()=>{
  const rows=approved();rows.pop();rows.push({...rows[0]});
  assert.equal(check(rows).ready,false);
  const forged=approved();forged[3].file="../bank-stolen.txt";
  assert.equal(check(forged).ready,false);
  forged[3].file="bank_settlement.evidence";forged[3].reviewer="";
  assert.equal(check(forged).ready,false);
});
test("enforce NEVER reads a tracked checklist as proof or infers a mutable CI SHA",()=>{
  assert.throws(
    ()=>evidenceConfiguration("--enforce",{GITHUB_SHA:sha}),
    /PRIVATE_EVIDENCE_AND_EXPLICIT_RELEASE_SHA_REQUIRED/,
  );
  assert.throws(
    ()=>evidenceConfiguration("--enforce",{SIGAPRO_QA_RELEASE_SHA:sha}),
    /PRIVATE_EVIDENCE_AND_EXPLICIT_RELEASE_SHA_REQUIRED/,
  );
  assert.throws(
    ()=>evidenceConfiguration("--enforce",{SIGAPRO_QA_RELEASE_SHA:"invalid",
      SIGAPRO_QA_EVIDENCE_DIR:"/tmp/private"}),
    /PRIVATE_EVIDENCE_AND_EXPLICIT_RELEASE_SHA_REQUIRED/,
  );
  const cfg=evidenceConfiguration("--enforce",{
    SIGAPRO_QA_RELEASE_SHA:sha,SIGAPRO_QA_EVIDENCE_DIR:"/tmp/private-qa-acceptance",
    GITHUB_SHA:"b".repeat(40),
  });
  assert.equal(cfg.sha,sha);
  assert.equal(cfg.manifestPath,"/tmp/private-qa-acceptance/manifest.json");
  assert.equal(cfg.root,"/tmp/private-qa-acceptance");
  const publicReport=evidenceConfiguration("--report",{GITHUB_SHA:sha});
  assert.equal(publicReport.sha,sha);
  assert.match(publicReport.manifestPath,/docs\/QA_COMMERCIAL_ACCEPTANCE\.json$/);
});
