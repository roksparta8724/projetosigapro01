import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261127_payment_charge_persistence_and_payable_guard_v1.sql","utf8");
describe("Cobrança bancária: autorização e persistência coerentes",()=>{
 it("restringe estado pendente nas quatro rotinas sem remover a assinatura do provedor",()=>{
  expect(sql.match(/'aguardando_pagamento'/g)).toHaveLength(4);
  expect(sql).toContain("extensions.hmac");
  expect(sql).toContain("FOR UPDATE");
  expect(sql.match(/provider_charge_saved_at=coalesce\(provider_charge_saved_at,clock_timestamp\(\)\)/g)).toHaveLength(2);
 });
});
