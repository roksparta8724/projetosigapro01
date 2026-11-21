import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("neon/migrations/20261022_qa_external_sandbox_boleto.sql", "utf8");
const functionBody = sql.split("CREATE OR REPLACE FUNCTION public.qa_persist_payment_guide_provider_charge_v1(")[1]
  ?.split("REVOKE ALL ON FUNCTION")[0] || "";

describe("Neon QA bank persistence SQL — barcode collision regression", () => {
  it("contains a dedicated isolated QA persistence routine", () => {
    expect(functionBody).toContain("UPDATE public.payment_guides SET");
    expect(functionBody).toContain("v_provider_barcode");
    expect(functionBody).toContain("v_provider_digitable_line");
    expect(functionBody).toContain("v_guide.ticket_url");
    expect(functionBody).toContain("provider_environment='test'");
  });

  it("never shadows the payment_guides.barcode column with a PL/pgSQL variable", () => {
    expect(functionBody).not.toMatch(/\bDECLARE[^]*?\bbarcode\s+text\s*;/i);
    expect(functionBody).not.toContain("barcode=coalesce(barcode,");
    expect(functionBody).not.toContain("digitable_line=coalesce(digit_line,");
    expect(functionBody).not.toContain("g.ticket_url");
    expect(functionBody).toContain("barcode=coalesce(v_provider_barcode,v_guide.barcode)");
  });

  it("never updates paid status or redirects the municipal payment beneficiary", () => {
    expect(functionBody).not.toMatch(/\bpaid\s*=\s*true/i);
    expect(functionBody).not.toMatch(/\bstatus\s*=\s*'compensada'/i);
    expect(functionBody).toContain("bank_authenticated_at=NULL");
    expect(functionBody).toContain("WHERE id=v_guide.id");
  });
});
