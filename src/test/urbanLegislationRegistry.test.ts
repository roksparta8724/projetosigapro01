import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAW_KINDS, LAW_SCOPES, validateLawRegistryInput,
  type LawRegistryInput } from "@/integrations/backend/urbanLegislationRegistryClient";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const tenant = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const valid: LawRegistryInput = {
  documentKind: "lei_complementar", documentNumber: "379", documentYear: 2009,
  title: "Lei Complementar de Parcelamento",
  legalScope: "aprovacao_ordinaria",
  officialSourceUrl: "https://camara.example/lei.pdf",
  publicationDate: "2009-11-24", effectiveFrom: "",
  relatedDocumentId: "", relationType: "",
  storageKey: "municipalities/" + tenant + "/legislation-registry/" +
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222-lei.pdf",
  fileName: "lei.pdf", fileSizeBytes: 12000, sha256: "a".repeat(64),
};
describe("SIGAPRO — municipal legislation registry", () => {
  it("supports future municipalities, varied legal documents and separate workflows", () => {
    expect(LAW_KINDS.some((x) => x.value === "decreto")).toBe(true);
    expect(LAW_KINDS.some((x) => x.value === "projeto_de_lei")).toBe(true);
    expect(LAW_SCOPES.some((x) => x.value === "direito_real_laje")).toBe(true);
    expect(LAW_SCOPES.some((x) => x.value === "aprovacao_ordinaria")).toBe(true);
  });
  it("rejects foreign-municipality PDF links, invalid hashes and invalid relation links", () => {
    expect(validateLawRegistryInput(tenant, valid)).toBeNull();
    expect(validateLawRegistryInput("00000000-0000-4000-8000-000000000000", valid)).not.toBeNull();
    expect(validateLawRegistryInput(tenant, { ...valid, sha256: "abc" })).not.toBeNull();
    expect(validateLawRegistryInput(tenant, { ...valid, relationType: "altera" })).not.toBeNull();
    expect(validateLawRegistryInput(tenant, { ...valid, officialSourceUrl: "javascript:alert(1)" })).not.toBeNull();
  });
  it("stores revisions immutably with same-tenant law relationships and immutable history", () => {
    const sql = read("neon/migrations/20261103_urban_legislation_registry_v1.sql");
    expect(sql).toContain("urban_legislation_documents_v1");
    expect(sql).toContain("UNIQUE(municipality_id,document_kind,document_number,document_year,revision)");
    expect(sql).toContain("urban_legal_document_same_tenant_relation_v1");
    expect(sql).toContain("ready_for_ai boolean NOT NULL DEFAULT false CHECK(ready_for_ai=false)");
    expect(sql).toContain("created_by_profile_id");
    expect(sql).toContain("set_urban_legislation_archive_v1");
    expect(sql).not.toContain("DELETE FROM public.urban_legislation_documents_v1");
  });
  it("protects the write role in Neon and the pre-signed PDF uploader", () => {
    const sql = read("neon/migrations/20261103_urban_legislation_registry_writer_permission_v1.sql");
    const server = read("server/api/r2-legal-sign-put.ts");
    const client = read("src/integrations/r2/client.ts");
    expect(sql).toContain("can_manage_urban_legislation_registry_v1");
    expect(sql).toContain("current_role_code()='prefeitura_supervisor'");
    const restrictive = read("neon/migrations/20261104_urban_legislation_admin_only_v1.sql");
    expect(restrictive).toContain("can_manage_urban_legislation_registry_v1");
    expect(restrictive).toContain("public.is_internal_municipality_role()");
    expect(restrictive).toContain("prefeitura_admin");
    expect(server).toContain("can_manage_urban_legislation_registry_v1");
    expect(server).toContain("authorize(req, input.municipalityId, input.fileSize)");
    expect(client).toContain("legislation-registry");
    expect(client).toContain("isDirectLegalPdfUpload");
    expect(read("neon/migrations/20261104_urban_legislation_prefeitura_admin_writer_v2.sql")).toContain("prefeitura_admin");
  });
  it("shows the individual register only on the dedicated management subpage", () => {
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    const page = read("src/pages/saas/LegislationPage.tsx");
    const editor = read("src/components/platform/UrbanLegislationRegistryPanel.tsx");
    expect(settings).not.toContain("<UrbanLegislationRegistryPanel municipalityId={municipalityId} />");
    const app = read("src/App.tsx");
    const config = read("src/pages/saas/ConfiguracoesPage.tsx");
    expect(page).not.toContain("<UrbanLegislationRegistryPanel municipalityId={effectiveScopeId} />");
    expect(page).not.toContain('to="/cadastro-gestao/legislacao"');
    expect(app).toContain("<ConfiguracoesPage legislationWorkspace />");
    expect(app).toContain('path="/cadastro-gestao/legislacao"');
    expect(config).toContain("if (legislationWorkspace) {");
    expect(config).toContain("<UrbanLegislationRegistryPanel municipalityId={selectedTenantId} />");
    expect(editor).toContain('folder: "legislation-registry"');
    expect(editor).toContain("await computePdfSha256(file)");
    expect(editor).toContain("await uploadFileToStorage(");
    expect(editor).toContain("await registerLaw(");
  });
});
