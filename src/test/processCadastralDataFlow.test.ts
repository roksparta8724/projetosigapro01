import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const protocol = read("src/pages/saas/ProtocolarProjetoPage.tsx");
const draft = read("src/lib/protocolDraft.ts");
const platform = read("src/lib/platform.ts");
const backend = read("src/integrations/backend/platformImpl.ts");
const identity = read("src/components/platform/ProcessIdentityPanel.tsx");
const migration = read(
  "neon/migrations/20261018_process_cadastral_identity_building_type.sql",
);

describe("process cadastral data flow", () => {
  it("collects owner fiscal ID, identity document and contact as distinct fields", () => {
    expect(protocol).toContain("CPF ou CNPJ do proprietário *");
    expect(protocol).toContain("RG / RNE / documento de identidade");
    expect(protocol).toContain("Telefone do proprietário");
    expect(protocol).toContain("E-mail do proprietário");
    expect(draft).toContain("proprietarioRg: string");
    expect(draft).toContain("proprietarioTelefone: string");
    expect(draft).toContain("proprietarioEmail: string");
  });

  it("keeps building typology distinct from usage and work nature", () => {
    expect(protocol).toContain("Tipo da edificação");
    expect(protocol).toContain("buildingTypeCatalog");
    expect(draft).toContain("tipoEdificacao: string");
    expect(platform).toContain("buildingType?: string");
    expect(backend).toContain("buildingType: input.property.buildingType || null");
  });

  it("persists protected owner identity data instead of relying on masked document text", () => {
    expect(backend).toContain("list_visible_process_party_private_data_v1");
    expect(backend).toContain("ownerPrivate?.document_number");
    expect(backend).toContain("ownerPrivate?.identity_document_number");
    expect(migration).toContain("identity_document_number");
    expect(migration).toContain("process_party_private_data");
    expect(migration).toContain("public.has_process_access(d.process_id)");
  });

  it("shows real cadastral fields instead of a synthetic document-status card", () => {
    expect(identity).toContain('label="CPF / CNPJ"');
    expect(identity).toContain('label="RG / documento de identidade"');
    expect(identity).toContain('label="Tipo da edificação"');
    expect(identity).not.toContain('label="Situação do documento"');
  });
});
