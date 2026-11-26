import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzzzzzz_process_requirement_mutation_guard_v1.sql","utf8");
const probe=readFileSync("neon/qa/rollback_workflow_probe_20261111.sql","utf8");
describe("Comunique-se: autorização, concorrência e teste transacional",()=>{
 it("preserva os guards de processo e exige competência na análise",()=>{
  expect(sql.match(/public\.can_write_process_analysis\(_process_id\)/g)).toHaveLength(3);
  expect(sql.match(/Reabra formalmente/g)).toHaveLength(3);
  expect(sql).toContain("Exigência interna não admite resposta externa");
  expect(sql).toContain("for update;");
 });
 it("o ensaio usa hash de bytes fictícios, reanálise, resposta, fechamento e recusa entre municípios",()=>{
  for(const term of ["sha256(_fixture_bytes)","reopen-document-review","requirement-finance-denied","requirement-foreign-tenant-denied","comunique-se-cycle","rollbackVerified"])expect(probe).toContain(term);
  expect(probe).toContain("'realR2UploadTested',false");
 });
});
