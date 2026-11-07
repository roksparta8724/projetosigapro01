import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {acceptance,REQUIRED} from "./qa-commercial-acceptance.mjs";
const sha="a".repeat(40),body=Buffer.from("Sanitized evidence: synthetic validation sample, no user data.");
const hash=createHash("sha256").update(body).digest("hex");
const approved=()=>REQUIRED.map(id=>({id,status:"approved",sha,reviewer:"Analista QA",
  verifiedAt:"2026-11-07T16:00:00Z",file:id+".evidence",sha256:hash}));
const check=(items,read=()=>body)=>acceptance({version:1,environment:"qa",checks:items},sha,read);
test("current project must not pass without ten real approval proofs",()=>{
  const result=check(REQUIRED.map(id=>({id,status:"pending"})));
  assert.equal(result.ready,false);assert.equal(result.required,10);
  assert.ok(result.failures.includes("NOT_APPROVED:bank_settlement"));
  assert.ok(result.failures.includes("NOT_APPROVED:neon_r2_recovery"));
});
test("approval requires matching exact SHA and verified evidence bytes",()=>{
  assert.equal(check(approved()).ready,true);
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
