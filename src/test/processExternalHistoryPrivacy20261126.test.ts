import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzzzzzzzz_process_external_history_privacy_v1.sql","utf8");
describe("Privacidade de histórico externo",()=>{
 it("aplica autorização e visibilidade nas quatro políticas de leitura",()=>{
  expect(sql.match(/ALTER POLICY /g)).toHaveLength(4);
  expect(sql.match(/public\.has_process_access\(process_id\)/g)).toHaveLength(4);
  expect(sql.match(/public\.is_internal_municipality_role\(\)/g)).toHaveLength(4);
  expect(sql.match(/visible_to_external IS TRUE/g)).toHaveLength(2);
  expect(sql.match(/visibility IN \('externo','misto'\)/g)).toHaveLength(2);
  expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
 });
});
