import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeMunicipalCollectionAdapter } from "../../server/municipal-collection-adapters";

const file = (path: string) => readFileSync(path, "utf8");
describe("SIGAPRO GOVBR/AR read-only onboarding — tenant isolation and no payment authority", () => {
  it("provides only query and never bank settlement", () => {
    expect(describeMunicipalCollectionAdapter("govbr_ar")).toMatchObject({
      connectorInstalled: true, credentialVerified: false,
      bankSettlementEnabled: false, operations: ["query"],
    });
  });
  it("never trusts browser-supplied credentials, tenant ID or API target during probe", () => {
    const api = file("api/collection-configuration.ts");
    const first = api.indexOf('if (action === "govbr_read_preview")');
    const last = api.indexOf('if (action === "bank_get")');
    expect(first).toBeGreaterThan(-1);
    expect(last).toBeGreaterThan(first);
    const probe = api.slice(first, last);
    expect(probe).toContain('"get_municipal_collection_secret_admin_v1"');
    expect(probe).toContain("config.municipality_id !== municipalityId");
    expect(probe).toContain('config.supplier_code !== "govbr_ar"');
    expect(probe).toContain('config.integration_type !== "automatic"');
    expect(probe).toContain("decryptPaymentAccessToken(config.secret_ciphertext)");
    expect(probe).toContain('adapter.execute("query"');
    expect(probe).not.toContain("input.secret");
    expect(probe).not.toContain("input.apiBaseUrl");
    expect(probe).not.toContain("input.readPath");
    expect(probe).not.toContain("mark_municipal_collection_validation");
    expect(probe).not.toContain("confirm_process_payment_guide");
    expect(probe).not.toContain("UPDATE ");
  });
  it("keeps financial activation blocked in SQL, even if GET succeeds", () => {
    const sql = file("neon/migrations/20261022_collection_activation_bank_guard.sql");
    expect(sql).toContain("automatic");
    expect(sql).toContain("municipal_system");
    const api=file("api/collection-configuration.ts");
    expect(api).toContain("GOVBR/AR possui apenas consulta GET de diagnóstico");
    expect(api).not.toContain('adapter.execute("payment"');
    expect(api).not.toContain('adapter.execute("issue"');
  });
  it("never treats vendor GET as authorization for a municipal financial operation", () => {
    const ui = file("src/components/platform/MunicipalCollectionSettings.tsx");
    expect(ui).toContain('data-govbr-readonly-connector="true"');
    expect(ui).toContain('"govbr_read_preview"');
    expect(ui).toContain("govbrReadPath: current.public_parameters?.govbrAr?.readPath");
    expect(ui).toContain("govbrAr:{authMode:form.govbrAuthMode,readPath:form.govbrReadPath}");
    expect(ui).toContain('form.supplierCode==="govbr_ar" ? "Preparar consulta GET da API');
    expect(ui).toContain("automaticSettlementAvailable !== false");
    expect(ui).not.toContain("localStorage.setItem");
  });
});
