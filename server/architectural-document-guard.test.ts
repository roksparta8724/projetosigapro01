import { describe, expect, it } from "vitest";
import { isEligibleArchitecturalDocument, type ArchitecturalDocumentRow } from "./architectural-document-guard";
import { readFileSync } from "node:fs";

const tenant = "11111111-1111-4111-8111-111111111111";
const foreignTenant = "22222222-2222-4222-8222-222222222222";
const processId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const valid: ArchitecturalDocumentRow = {
  id: documentId, process_id: processId, municipality_id: tenant, tenant_id: tenant,
  title: "Projeto Arquitetônico", file_name: "Implantacao.pdf",
  file_path: `municipalities/${tenant}/processes/${processId}/documentos/implantacao.pdf`,
  mime_type: "application/pdf", version: 2, is_valid: true, invalidated_at: null,
};

const check = (overrides: Partial<ArchitecturalDocumentRow>) =>
  isEligibleArchitecturalDocument({ ...valid, ...overrides }, tenant, processId, documentId);

describe("SIGAPRO AI — isolamento do PDF antes de R2 ou IA externa", () => {
  it("aceita apenas documento arquitetônico vigente do município e processo corretos", () => {
    expect(check({})).toBe(true);
    expect(check({ tenant_id: undefined })).toBe(true);
    expect(check({ tenant_id: null })).toBe(true);
    expect(check({ title: "Projeto Arquitetonico — Implantação" })).toBe(true);
  });
  it("recusa tenant_id divergente mesmo quando municipality_id e o caminho parecem corretos", () => {
    expect(check({ tenant_id: foreignTenant })).toBe(false);
    expect(check({ municipality_id: foreignTenant })).toBe(false);
    expect(check({ id: foreignTenant })).toBe(false);
    expect(check({ process_id: foreignTenant })).toBe(false);
    expect(isEligibleArchitecturalDocument(valid, foreignTenant, processId, documentId)).toBe(false);
  });
  it("recusa arquivo fora do R2 municipal, traversal e documento invalidado", () => {
    expect(check({ file_path: `municipalities/${foreignTenant}/projeto.pdf` })).toBe(false);
    expect(check({ file_path: `municipalities/${tenant}/../outro/projeto.pdf` })).toBe(false);
    expect(check({ file_path: `municipalities/${tenant}/projetos\\outro.pdf` })).toBe(false);
    expect(check({ file_path: `municipalities/${tenant}//outro.pdf` })).toBe(false);
    expect(check({ file_path: `municipalities/${tenant}/arquivo.png` })).toBe(false);
    expect(check({ mime_type: "image/png" })).toBe(false);
    expect(check({ file_name: "arquivo.jpg" })).toBe(false);
    expect(check({ is_valid: false })).toBe(false);
    expect(check({ invalidated_at: "2026-11-07T00:00:00Z" })).toBe(false);
    expect(check({ title: "Projeto estrutural" })).toBe(false);
    expect(check({ version: 0 })).toBe(false);
    expect(check({ version: Number.NaN })).toBe(false);
  });
  it("exige RPC técnico e impede que body de JSON pré-parseado contorne o limite", () => {
    const source = readFileSync("server/ai-project-extract.ts", "utf8");
    const start = source.indexOf("async function verifiedDocument");
    const end = source.indexOf("async function pdfBytes", start);
    expect(source.slice(start, end)).toContain("isEligibleArchitecturalDocument(doc,tenant,processId,documentId)");
    expect(source.slice(start, end)).toContain('authorize_technical_document_signing_v1');
    expect(source).toContain('Buffer.byteLength(JSON.stringify(parsed),"utf8")>2048');
  });
});
