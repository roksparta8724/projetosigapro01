import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = () => readFileSync("docs/QA_P0_FINANCE_HARDENING_REVIEW.sql","utf8");

describe("SIGAPRO QA — correção financeira preparada, NÃO aplicada em banco", () => {
  it("não expõe a oficialização SECURITY DEFINER diretamente ao authenticated nem PUBLIC", () => {
    const source = read();
    expect(source).toContain("REVOKE EXECUTE ON FUNCTION public.officialize_preprotocol_v1(uuid,uuid)");
    expect(source).toContain("FROM PUBLIC, authenticated");
    expect(source).toContain("BEGIN;");
    expect(source).toContain("COMMIT;");
    expect(source).not.toMatch(/\bDROP\s+(TABLE|DATABASE|FUNCTION)\b/i);
    expect(source).not.toMatch(/\b(ALTER ROLE|TRUNCATE)\b/i);
  });

  it("remove a Prefeitura Admin/Master do caminho de baixa manual no script", () => {
    const source = read();
    expect(source).toContain("_role_code='setor_intersetorial'");
    expect(source).toContain("profile_operational_area(_profile_id)='protocolos'");
    expect(source).toContain("_role_code='financeiro'");
    expect(source).toContain("profile_operational_area(_profile_id)='financeiro'");
    expect(source).toContain("and _area='protocolos'");
    expect(source).not.toContain("OR _role_code='prefeitura_admin'");
    expect(source).not.toContain("public.is_master()\n      OR _role_code='prefeitura_admin'");
  });

  it("não permite confirmação manual de pré-protocolo ligado a banco", () => {
    const source = read();
    expect(source).toContain("_guide.bank_reference");
    expect(source).toContain("_guide.payment_provider");
    expect(source).toContain("lower(btrim(_guide.payment_provider)) NOT IN ('manual','municipal_system')");
    expect(source).not.toContain("'bank_direct','municipal_system'");
    // A guia pode ter sido registrada parcialmente pelo provedor.
    // Qualquer sinal de cobrança externa deve impedir a baixa manual.
    for (const bankEvidence of [
      "_guide.bank_payment_id",
      "_guide.bank_status",
      "_guide.bank_status_detail",
      "_guide.bank_authenticated_at",
      "_guide.provider_charge_saved_at",
      "_guide.ticket_url",
      "_guide.barcode",
      "_guide.digitable_line",
      "_guide.provider_environment",
    ]) {
      expect(source.split(bankEvidence).length).toBeGreaterThanOrEqual(3);
    }
    expect(source).toContain("aguarde a conciliacao autenticada");
    expect(source).toContain("REVIEW ONLY");
    // The SQL belongs to docs for explicit review, not live migrations.
    expect(source).toContain("not under the migration runner");
  });
});
