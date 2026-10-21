import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMunicipalCollectionAdapter } from "../../server/municipal-collection-adapters";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("neon/migrations/20261021_municipal_collection_configuration.sql");
const page = read("src/components/platform/MunicipalCollectionSettings.tsx");
const api = read("api/collection-configuration.ts");
const app = read("src/App.tsx");
const nav = read("src/components/platform/PortalFrame.tsx");
const activeMigration = read("neon/migrations/20261021_municipal_collection_effective_mode.sql");
const secureImportMigration = read("neon/migrations/20261021_municipal_collection_guarded_import.sql");
const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
const bridge = read("src/components/platform/GovbrArGuideBridge.tsx");
const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
const effectiveHook = read("src/hooks/useEffectiveCollectionMode.ts");

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
  it("isolates active mode from drafts and keeps guide intake behind municipal activation", () => {
    expect(activeMigration).toContain("status = 'active'");
    expect(activeMigration).toContain("get_active_municipal_collection_configuration_v1");
    expect(api).toContain('action === "effective"');
    expect(effectiveHook).toContain('configuration.mode === "municipal_system"');
    expect(effectiveHook).toContain('configuration.integration_type === "controlled_import"');
    expect(protocol).toContain("{canImportMunicipalGuide ? <SectionCard");
    expect(processDetail).toContain("canImportMunicipalGuide &&");
  });
  it("rejects cross-municipality municipal-guide uploads on the server", () => {
    expect(api).toContain('action === "attach"');
    expect(api).toContain("append_municipal_collection_guide_document_v1");
    expect(secureImportMigration).toContain("coalesce(_process.municipality_id,_process.tenant_id)<>_municipality_id");
    expect(secureImportMigration).toContain("_mode.mode <> 'municipal_system'");
    expect(secureImportMigration).toContain("_mode.integration_type <> 'controlled_import'");
    expect(secureImportMigration).toContain("Guia ja importada neste processo");
    expect(secureImportMigration).not.toContain("update public.payment_guides");
    expect(bridge).toContain("onAppend(document, normalizedReference, guideKind)");
  });
  it("maintains real municipal banking data on the SIGAPRO PDF without manufacturing barcodes", () => {
    expect(processDetail).toContain("bankMunicipalName: tenantSettings?.bankName");
    expect(processDetail).toContain("bankAgency: [tenantSettings?.bankAgency");
    expect(processDetail).toContain("bankAccount: [tenantSettings?.bankAccount");
    expect(guide).toContain('data-dam-municipal-bank="true"');
    expect(guide).toContain("guia.bankMunicipalName");
  });

});
