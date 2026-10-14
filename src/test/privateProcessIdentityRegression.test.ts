import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("private process identity workflow", () => {
  const backend = read("src/integrations/backend/platformImpl.ts");
  const detail = read("src/pages/saas/ProcessDetailPage.tsx");
  const panel = read("src/components/platform/ProcessIdentityPanel.tsx");
  const migration = read("neon/migrations/20261014023000_private_process_identity.sql");

  it("creates new external processes through the transactional v3 RPC", () => {
    expect(backend).toContain('db.rpc("create_external_process_v3"');
    expect(migration).toContain("create or replace function public.create_external_process_v3");
    expect(migration).toContain("public.create_external_process_v2");
    expect(migration).toContain("public.save_process_private_identity_v1");
  });

  it("keeps full documents outside the generic process parties table", () => {
    expect(migration).toContain("create table if not exists public.process_party_private_data");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.process_party_private_data from authenticated");
    expect(migration).toContain("document_number text null");
    expect(migration).toContain("'***'||right(_owner_document,4)");
    expect(migration).toContain("'***'||right(_professional_document,4)");
  });

  it("requires process access before returning or changing private identity", () => {
    expect(migration).toContain("if not public.has_process_access(_process_id)");
    expect(migration).toContain("Sem acesso ao processo");
    expect(migration).toContain("Sem permissao para atualizar os dados cadastrais deste processo");
    expect(backend).toContain('db.rpc("get_process_private_identity_v1"');
    expect(backend).toContain('db.rpc("save_process_private_identity_v1"');
  });

  it("lets the responsible professional view and repair the data they submitted", () => {
    expect(detail).toContain("const isProfessionalProcessOwner");
    expect(detail).toContain("isProfessionalProcessOwner");
    expect(detail).toContain("Editar dados cadastrais");
    expect(detail).toContain("Seus dados e dados do proprietário");
    expect(detail).toContain("validateBrazilianTaxId(privateIdentityForm.professionalDocument)");
    expect(detail).toContain("validateBrazilianTaxId(privateIdentityForm.ownerDocument)");
    expect(detail).toContain("saveRemoteProcessPrivateIdentity");
  });

  it("uses the private snapshot before masked legacy values in the identity panel", () => {
    expect(panel).toContain("privateIdentity?.owner?.documentNumber");
    expect(panel).toContain("privateIdentity?.professional?.documentNumber");
    expect(panel).toContain("privateIdentity?.professional?.registrationNumber");
    expect(panel).toContain("privateIdentity?.professional?.professionalType");
  });
});
