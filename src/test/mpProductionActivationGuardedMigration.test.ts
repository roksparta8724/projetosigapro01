import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "neon/migrations/20261113_mp_production_activation_guarded_v1.sql"),
  "utf8",
);
const server = readFileSync(resolve(process.cwd(), "api/mercadopago.ts"), "utf8");
const validation = readFileSync(
  resolve(process.cwd(), "server/municipal-payment-credential-validation.ts"),
  "utf8",
);

describe("SIGAPRO — ativação bancária de produção condicionada e auditada", () => {
  it("mantém a autorização municipal por tenant e impede falta de cadastro", () => {
    expect(migration).toContain("public.is_municipal_payment_admin(_municipality_id)");
    expect(migration).toContain("where municipality_id = _municipality_id for update");
    expect(migration).toContain("Conexão municipal ainda não cadastrada");
    expect(migration).toContain("updated_by = public.current_profile_id()");
    expect(migration).toContain("get_municipal_payment_connection_v1(_municipality_id)");
  });

  it("não libera produção só porque uma credencial foi digitada", () => {
    expect(migration).toContain("credentials_ciphertext is null");
    expect(migration).toContain("credential_fingerprint is null");
    expect(migration).toContain("last_test_status is distinct from 'ok'");
    expect(migration).toContain("last_tested_at is null");
    expect(migration).toContain("webhook_secret_ciphertext is null");
    expect(migration).toContain("webhook_fingerprint is null");
    expect(migration).toContain("last_tested_at < now() - interval '24 hours'");
    expect(server).toContain("assertMunicipalCredentialActivation(prior)");
    expect(validation).toContain("connection.last_test_status !== \"ok\"");
    expect(migration).not.toContain("Cobrança real Mercado Pago bloqueada até homologação bancária");
  });

  it("nunca ativa banco arbitrário sem adaptador e não liquida guias existentes", () => {
    expect(migration).toContain("connection.provider = 'bank_direct'");
    expect(migration).toContain("integração e homologação específicas");
    expect(migration).not.toContain("update public.payment_guides");
    expect(migration).not.toContain("insert into public.payment_guides");
    expect(migration).not.toContain("update public.processes");
    expect(migration).not.toContain("insert into public.processes");
  });
});
