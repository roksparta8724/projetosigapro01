import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolDeskPage.tsx"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "neon/migrations/20261102_archived_document_history_protocol_guard.sql"), "utf8",
);

describe("SIGAPRO QA04: end-to-end triage with a revised architectural PDF", () => {
  it("shows municipal admin a read-only register, not protocol actions", () => {
    expect(source).toContain('data-municipal-admin-readonly="true"');
    expect(source).toContain('if (session.role === "prefeitura_admin") {');
    expect(source).not.toContain('session.role === "prefeitura_admin" && protocolQueueProcesses.some');
    expect(source).toContain("matchesOperationalScope(effectiveScopeId, item)");
    expect(source).toContain('currentFolder.includes("protocolo")');
  });
  it("shows automatic status without requiring manual triage actions", () => {
    expect(source).toContain('data-automatic-triage="true"');
    expect(source).toContain("Correção solicitada automaticamente");
    expect(source).toContain("Conferência automática em andamento");
    expect(source).toContain("isReadyForProtocolDispatch(process)");
    expect(source).not.toContain('onClick={() => void handleTriageStatus(process, "concluido")}');
  });
  it("does not block a V2 document because the V1 is kept as inactive history", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.set_process_triage");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_process_dispatch");
    expect(migration).toContain("coalesce(d.is_valid,true)=true");
    expect(migration).toContain("coalesce(doc.is_valid,true)=true");
    expect(migration).not.toContain("OR coalesce(d.is_valid,true)=false");
    expect(migration).not.toContain("or coalesce(doc.is_valid,true)=false");
  });
});
