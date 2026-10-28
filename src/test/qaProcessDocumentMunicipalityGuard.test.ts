import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("neon/migrations/20261028_qa_process_document_tenant_guard_v1.sql","utf8");
describe("QA municipality-bound document provenance",()=>{
 it("is QA exclusive and cannot alter guide payments, bank keys or original PDFs",()=>{
  expect(migration).toContain("QA EXCLUSIVE");
  expect(migration).toContain("br-solitary-sound-b4xlbvs6");
  expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\s+(?:public\.)?payment_guides\b/i);
  expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\s+(?:public\.)?processes\b/i);
  expect(migration).toContain("ON public.process_documents");
 });
 it("backfills only rows whose tenant equals process's municipality",()=>{
  expect(migration).toContain("d.municipality_id IS NULL");
  expect(migration).toContain("p.tenant_id = p.municipality_id");
  expect(migration).toContain("d.tenant_id = p.tenant_id");
  expect(migration).toContain("SET municipality_id = p.municipality_id");
 });
 it("enforces tenant binding at write time for legacy and modern callers",()=>{
  expect(migration).toContain("BEFORE INSERT OR UPDATE OF process_id,tenant_id,municipality_id");
  expect(migration).toContain("NEW.tenant_id IS DISTINCT FROM process_tenant");
  expect(migration).toContain("NEW.municipality_id IS DISTINCT FROM process_municipality");
  expect(migration).toContain("NEW.municipality_id := process_municipality");
  expect(migration).toContain("RAISE EXCEPTION");
 });
 it("fails closed if any legacy document remains incorrectly bound",()=>{
  expect(migration).toContain("IF EXISTS(");
  expect(migration).toContain("d.municipality_id IS DISTINCT FROM p.municipality_id");
  expect(migration).toContain("RAISE EXCEPTION 'QA documento: existe vinculo municipal inconsistente'");
 });
});
