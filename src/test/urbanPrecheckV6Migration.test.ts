import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261104_precheck_v6_only_auth.sql","utf8");
describe("Neon urban precheck entrypoint security",()=>{
 it("revokes legacy v4/v5 direct writes but keeps v6 callable and history intact",()=>{
  expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.save_urban_precheck_run_v4");
  expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.save_urban_precheck_run_v5");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.save_urban_precheck_run_v6");
  expect(sql).not.toContain("DELETE FROM");
  expect(sql).not.toContain("TRUNCATE");
 });
});
