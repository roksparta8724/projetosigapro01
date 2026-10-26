import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Production release candidates must exclude QA-only migrations",()=>{
 it("runs the read-only inventory and keeps pending release blockers explicit",()=>{
   const out=execFileSync(process.execPath,["scripts/production-release-preflight.mjs"],{encoding:"utf8"});
   expect(out).toContain("FINANCIAL MIGRATIONS VALID FOR REVIEW ONLY");
   expect(out).toContain("QA-only migrations excluded");
   expect(out).toContain("RELEASE BLOCKED");
 });
 it("keeps separate catalog evidence and forbids using database name as branch identity",()=>{
   const sql=readFileSync("scripts/production-schema-catalog.sql","utf8");
   const script=readFileSync("scripts/production-release-preflight.mjs","utf8");
   expect(sql).toContain("NEVER use current_database() as branch proof");
   expect(sql).toContain("original_pdf_key");
   expect(script).toContain("Database name is NOT a Neon branch identity");
 });
 it("does not treat QA-only or urban migrations as production-approved",()=>{
   const doc=readFileSync("docs/production-release-gate.md","utf8");
   expect(doc).toContain("NÃO LIBERADO PARA PRODUÇÃO");
   expect(doc).toContain("Não executar toda a pasta de migrações");
   expect(doc).toContain("SOMENTE com autorização expressa");
 });
});
