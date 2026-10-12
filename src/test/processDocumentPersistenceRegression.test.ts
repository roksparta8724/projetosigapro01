import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protocolPage = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolarProjetoPage.tsx"), "utf8");
const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
const fileDropZone = readFileSync(resolve(process.cwd(), "src/components/platform/FileDropZone.tsx"), "utf8");
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
    expect(protocolPage).toContain("Alguns anexos pertencem a um rascunho antigo");
    expect(protocolPage).toContain("Selecione esses arquivos uma única vez");
    expect(protocolPage).toContain("documentsWithoutStorage");
    expect(protocolPage).toContain("syncResult.synced");
    expect(protocolPage).toContain("appendProcessDocuments");
  });

  it("keeps upload cards visually stable while files persist", () => {
    expect(protocolPage).toContain("filesRef.current");
    expect(protocolPage).toContain("uploadBusyRef.current");
    expect(protocolPage).toContain("previewUrl: item.previewUrl || uploaded.publicUrl");
    expect(protocolPage).not.toContain("previewUrl: uploaded.publicUrl || item.previewUrl");
    expect(protocolPage).toContain("hasPendingDocumentUpload && !uploadingLabels");
    expect(fileDropZone).toContain('data-upload-zone');
    expect(fileDropZone).toContain('min-h-[18px]');
    expect(fileDropZone).toContain('h-56');
    expect(fileDropZone).toContain('sm:h-72');
    expect(fileDropZone).toContain('URL.createObjectURL(file)');
    expect(fileDropZone).toContain('transition-colors');
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
    expect(recoveryApi).toContain("principalIds");
    expect(recoveryApi).toContain("auth.profileId");
    expect(recoveryApi).toContain("auth.userId");
    expect(recoveryApi).toContain("municipalities/${auth.municipalityId}/protocols/${principalId}/");
    expect(recoveryApi).not.toContain("body.userId");
    expect(recoveryApi).not.toContain("body.municipalityId");
    expect(recoveryApi).toContain("created_by_profile_id,created_at");
    expect(recoveryApi).toContain("processCreatedAt > since");
    expect(r2Client).toContain("listRecoverableProcessFiles");
    expect(processDetail).toContain("Buscar uploads anteriores");
    expect(processDetail).toContain("handleRecoverStoredDocument");
    expect(processDetail).toContain("Esta área é somente para análise. Os arquivos exibidos abaixo foram anexados pelo profissional responsável.");
    expect(processDetail).toContain('const canUploadProcessDocuments = session.role === "profissional_externo"');
  });

  it("preserves R2 files when process metadata persistence fails", () => {
    expect(protocolPage).toContain("Uploads preservados no R2 para recuperação segura");
    expect(protocolPage).not.toContain("deleteFileFromStorage({ bucket: \"process-documents\"");
    expect(protocolPage).toContain("poderão ser recuperados sem novo upload");
  });
});
