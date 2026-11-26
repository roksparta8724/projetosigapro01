import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzzzzzzzzz_prod_bank_receipt_preservation_v1.sql","utf8");
describe("Arrecadação: preservação de crédito e revisão de estorno",()=>{
 it("preserva recebimento com evidência de liquidação e verifica hash e guia",()=>{
  expect(sql).toContain("ON CONFLICT(municipality_id,order_id,request_id) DO NOTHING");
  expect(sql).toContain("r.payload_sha256 IS DISTINCT FROM _payload_sha256");
  expect(sql).toContain("IF NOT credited_receipt THEN");
  expect(sql).toContain("e.receipt_id=r.id");
 });
 it("exige guia pendente e impede baixa de cancelada, sem enfraquecer a prova bancária",()=>{
  expect(sql).toContain("guide_not_payable_manual_review");
  expect(sql).toContain("lower(coalesce(status,'')) IN ('pendente','pending','aguardando_pagamento')");
  expect(sql).toContain("_amount=_transaction_paid_amount");
  expect(sql).toContain("awaiting_original_pdf");
 });
 it("encaminha observação pós-crédito à revisão interna sem alterar a guia",()=>{
  expect(sql).toContain("credited_bank_review_required");
  expect(sql).toContain("a.detail LIKE review_marker||'%'");
  expect(sql).toContain("Revisão de recebimento bancário");
  expect(sql).toContain("Guia e comprovante preservados.',false");
 });
});
