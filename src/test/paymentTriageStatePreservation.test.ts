import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "neon/migrations/20261101_payment_triage_state_preservation.sql"), "utf8");
describe("Neon protocol payment transition", () => {
  it("preserves completed triage when initial protocol payment is confirmed later", () => {
    expect(sql).toContain("_triage_status='concluido'");
    expect(sql).toContain("THEN 'pagamento_confirmado'::public.process_status");
    expect(sql).toContain("WHEN _guide_kind='protocolo' THEN coalesce(_triage_status,'recebido')");
    expect(sql).toContain("'Pronto para Despacho'");
  });
  it("keeps financial security and provider verification, not automatic fake settlement", () => {
    expect(sql).toContain("public.has_process_access");
    expect(sql).toContain("Pagamento bancario vinculado: confirmacao manual bloqueada.");
    expect(sql).toContain("UPDATE public.payment_guides");
    expect(sql).toContain("paid_at=now()");
  });
});
