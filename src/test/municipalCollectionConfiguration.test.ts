import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMunicipalCollectionAdapter } from "../../server/municipal-collection-adapters";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("neon/migrations/20261021_municipal_collection_configuration.sql");
const page = read("src/components/platform/MunicipalCollectionSettings.tsx");
const api = read("api/collection-configuration.ts");
const app = read("src/App.tsx");
const nav = read("src/components/platform/PortalFrame.tsx");

describe("municipal collection configuration", () => {
  it("is disabled by default and snapshots only future inserts", () => {
    expect(migration).toContain("'status','not_configured'");
    expect(migration).toContain("before insert on public.payment_guides");
    expect(migration).not.toContain("after update on public.payment_guides");
    expect(migration).toContain("collection_configuration_version");
    expect(migration).toContain("unique(municipality_id,guide_id,operation,idempotency_key)");
    expect(migration).toContain("signature_verified boolean not null default false");
    expect(migration).toContain("next_poll_at timestamptz");
  });
  it("isolates configuration by municipality and never exposes ciphertext", () => {
    expect(migration).toContain("public.has_tenant_access(_municipality_id)");
    expect(migration).toContain("public.is_municipal_payment_admin(_municipality_id)");
    expect(migration).toContain("to_jsonb(c)-array['secret_ciphertext']");
    expect(api).toContain("encryptMunicipalCollectionSecret");
    expect(api).toContain('provider?.status !== "active"');
  });
  it("does not invent an adapter for an unconfigured supplier", () => {
    expect(getMunicipalCollectionAdapter("fornecedor-inexistente")).toBeNull();
    expect(api).toContain("Fornecedor ainda sem adaptador homologado");
  });
  it("exposes both premium modes, statuses and administrative navigation", () => {
    expect(page).toContain("Guia personalizada SIGAPRO");
    expect(page).toContain("Sistema próprio da Prefeitura");
    expect(page).toContain("Não configurado");
    expect(page).toContain("Em homologação");
    expect(page).toContain("Importação controlada");
    expect(app).toContain('/prefeitura/arrecadacao');
    expect(nav).toContain("Guias e Arrecadação");
  });
});
