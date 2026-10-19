import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const protocolPage = read("src/pages/saas/ProtocolarProjetoPage.tsx");
const platformImpl = read("src/integrations/backend/platformImpl.ts");
const migration = read(
  "neon/migrations/20261018_preprotocol_draft_state_and_guide_immutability.sql",
);

describe("pre-protocol draft state protection", () => {
  it("keeps previously uploaded documents visible across equivalent checklist labels", () => {
    expect(protocolPage).toContain("getFilesForDocumentLabel");
    expect(protocolPage).toContain("replaceFilesForDocumentLabel");
    expect(protocolPage).toContain(
      "getFilesForDocumentLabel(files, item.label).length === 0",
    );
    expect(protocolPage).toContain("files={itemFiles}");
  });

  it("merges remote draft state instead of replacing saved form data", () => {
    expect(migration).toContain("_existing_payload");
    expect(migration).toContain("_merged_draft_form");
    expect(migration).toContain("_merged_payload");
    expect(migration).toContain("_incoming_payload");
    expect(migration).toContain("_incoming_draft_form");
    expect(migration).toContain("value <> '\"\"'::jsonb");
    expect(migration).toContain(
      "Só toca nos documentos quando o cliente enviou explicitamente o snapshot",
    );
    expect(migration).not.toContain(
      "delete from public.process_documents\n  where process_id=_process.id\n    and source='profissional';",
    );
  });

  it("uses process_documents as the authoritative attachment source when reopening", () => {
    expect(migration).toContain("Sempre reconstrói anexos a partir da tabela oficial");
    expect(migration).toContain("from public.process_documents d");
    expect(migration).toContain("'documents',_documents");
    expect(migration).toContain("'fileSizeBytes',d.file_size_bytes");
  });

  it("keeps a protocol guide identity immutable after issue", () => {
    expect(migration).toContain("protect_protocol_guide_identity_v1");
    expect(migration).toContain("new.guide_number is distinct from old.guide_number");
    expect(migration).toContain("new.amount is distinct from old.amount");
    expect(migration).toContain("new.due_date is distinct from old.due_date");
    expect(migration).toContain("new.created_at is distinct from old.created_at");
    expect(migration).not.toContain(
      "area_m2=coalesce(nullif(_merged_payload->>'area','')::numeric,area_m2),\n      updated_at=clock_timestamp()",
    );
    expect(platformImpl).toContain("issuedAt: guide.created_at ?? undefined");
    expect(platformImpl).not.toContain(
      "issuedAt: guide.last_reissued_at ?? guide.created_at",
    );
    expect(protocolPage).toContain("remoteProcess.guide_created_at");
  });

  it("creates a new protocol guide only after the current one expires", () => {
    expect(migration).toContain(
      "Nova guia so pode ser gerada apos o vencimento",
    );
    expect(migration).toContain("insert into public.payment_guides");
    expect(migration).toContain("previous_guide");
    expect(migration).toContain("new_guide");
    expect(migration).toContain("_base_number||'-R'||_next_revision::text");
  });
});
