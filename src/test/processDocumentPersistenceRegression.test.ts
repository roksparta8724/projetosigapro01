import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protocolPage = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolarProjetoPage.tsx"), "utf8");
const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
const dataHook = readFileSync(resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8");
const r2Client = readFileSync(resolve(process.cwd(), "src/integrations/r2/client.ts"), "utf8");
const recoveryApi = readFileSync(resolve(process.cwd(), "api/r2-list-user-files.ts"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261011161000_sync_process_documents.sql"),
  "utf8",
);

describe("process document persistence regressions", () => {
  it("never completes a protocol with metadata-only browser files after F5", () => {
    expect(protocolPage).toContain("detachedUploads");
    expect(protocolPage).toContain("Reabra os arquivos antes de protocolar");
    expect(protocolPage).toContain("documentsWithoutStorage");
    expect(protocolPage).toContain("syncResult.synced");
    expect(protocolPage).toContain("appendProcessDocuments");
  });

  it("requires a real R2 file path and idempotently links it in the official process", () => {
    expect(migration).toContain("create or replace function public.sync_process_documents");
    expect(migration).toContain("nao possui arquivo persistido no armazenamento oficial");
    expect(migration).toContain("d.file_path=_file_path");
    expect(migration).toContain("'Documentos sincronizados'");
    expect(migration).toContain("select public.sync_process_documents(_process_id,_documents)");
    expect(dataHook).toContain("synced: number");
    expect(dataHook).toContain("return result");
  });

  it("can recover authenticated orphan R2 uploads without exposing another user's prefix", () => {
    expect(recoveryApi).toContain("current_profile_id");
    expect(recoveryApi).toContain("municipalities/${auth.municipalityId}/protocols/${auth.userId}/");
    expect(recoveryApi).not.toContain("body.userId");
    expect(recoveryApi).not.toContain("body.municipalityId");
    expect(r2Client).toContain("listRecoverableProcessFiles");
    expect(processDetail).toContain("Buscar uploads anteriores");
    expect(processDetail).toContain("handleRecoverStoredDocument");
    expect(processDetail).toContain("Somente arquivos confirmados no armazenamento oficial e no banco contam como enviados.");
  });
});
