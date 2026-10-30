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
const bankEditor = read("src/components/platform/MunicipalBankDetailsSettings.tsx");
const oldSettings = read("src/pages/saas/ConfiguracoesPage.tsx");
const bankMigration = read("neon/migrations/20261021_municipal_collection_bank_details.sql");
const activationGuard = read("neon/migrations/20261022_collection_activation_bank_guard.sql");
const credentialIsolation = read("neon/migrations/20261022_collection_provider_credential_isolation.sql");
const providerUi = read("src/components/platform/MunicipalPaymentSettings.tsx");


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

  it("uses one municipal administration page for banking, PIX, provider and modality", () => {
    expect(page).toContain("<MunicipalBankDetailsSettings municipalityId={municipalityId}");
    expect(page).toContain("<MunicipalPaymentSettings municipalityId={municipalityId}");
    expect(oldSettings).toContain('navigate("/prefeitura/arrecadacao", { replace: true })');
    expect(bankEditor).toContain("Salvar banco e PIX");
    expect(bankEditor).toContain("Número do convênio");
    expect(bankEditor).toContain("pixMerchantCity");
    expect(api).toContain('action === "bank_get"');
    expect(api).toContain('action === "bank_save"');
  });

  it("saves bank data as a scoped JSONB patch without updating other institutional settings", () => {
    expect(bankMigration).toContain("public.is_municipal_payment_admin(_municipality_id)");
    expect(bankMigration).toContain("public.can_read_municipal_collection_v1(_municipality_id)");
    expect(bankMigration).toContain("coalesce(general_settings,'{}'::jsonb) || p");
    expect(bankMigration).toContain("where municipality_id=_municipality_id");
    expect(bankMigration).toContain("jsonb_object_keys(_fields)");
    expect(bankMigration).not.toContain("update public.payment_guides");
    expect(bankMigration).not.toContain("update public.municipalities");
  });

  it("never reuses old municipality settings after switching account or Neon failures", () => {
    expect(page).toContain("requestGeneration.current");
    expect(page).toContain("generation !== requestGeneration.current");
    expect(page).toContain("setConfiguration(null)");
    expect(page).toContain("setActiveConfiguration(null)");
    expect(page).toContain("requestGeneration.current += 1");
  });

  it("enforces bank readiness in Neon even when called outside the UI", () => {
    expect(activationGuard).toContain("provider.environment <> target.environment");
    expect(activationGuard).toContain("target.integration_type='automatic'");
    expect(activationGuard).toContain("target.capabilities->>'payment'");
    expect(activationGuard).toContain("bank_beneficiary_document");
    expect(activationGuard).not.toContain("update public.payment_guides");
  });

  it("isolates credentials and test results per bank, environment and tenant", () => {
    expect(credentialIsolation).toContain("old_connection.provider=_provider");
    expect(credentialIsolation).toContain("old_connection.environment=_environment");
    expect(credentialIsolation).toContain("else null end");
    expect(credentialIsolation).toContain("last_tested_at=null,last_test_status=null");
    expect(credentialIsolation).toContain("connection.provider='bank_direct'");
    expect(credentialIsolation).toContain("connection.environment='production'");
    expect(credentialIsolation).not.toContain("update public.payment_guides");
    expect(providerUi).toContain("requestGeneration.current");
    expect(providerUi).toContain("connectionMatchesForm");
    expect(providerUi).toContain("data-municipal-provider-capabilities");
    expect(api).toContain("payment?.provider !== \"mercado_pago\"");
    expect(api).toContain("capabilities = { ...capabilities, query: false, payment: false");
  });

  it("rejects a production setup backed by sandbox credentials and missing municipal CNPJ", () => {
    expect(api).toContain('provider.environment !== config.environment');
    expect(api).toContain('provider.provider === "manual" && automated');
    expect(api).toContain('provider.provider === "bank_direct"');
    expect(api).toContain("get_municipal_collection_bank_details_v1");
    expect(api).toContain("bankBeneficiaryDocument");
    expect(api).toContain("Produção bloqueada:");
  });

  it("keeps failed provider-test diagnostics visible instead of clearing them", () => {
    const provider = read("src/components/platform/MunicipalPaymentSettings.tsx");
    const testBlock = provider.slice(provider.indexOf("const test = async"), provider.indexOf("const activate = async"));
    expect(testBlock).toContain("setMessage(municipalCollectionError(error))");
    expect(testBlock).not.toContain("void load()");
  });

});
