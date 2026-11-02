import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("Municipal administrator has read-only access to process records", () => {
  const protocol = file("src/pages/saas/ProtocolDeskPage.tsx");
  const detail = file("src/pages/saas/ProcessDetailPage.tsx");
  const sql = file("neon/migrations/20261102_municipal_admin_process_readonly_v1.sql");
  const fixture = file("src/lib/qa04ArchitecturalFixture.ts");
  it("shows all municipal processes for consultation without triage control", () => {
    expect(protocol).toContain('data-municipal-admin-readonly="true"');
    expect(protocol).toContain('if (!isProcessOwnedBySessionDepartment(session, item)) return false;');
    expect(protocol).not.toContain('session.role === "prefeitura_admin" && protocolQueueProcesses.some');
  });
  it("removes admin bypasses for dispatch, markers, and QA document import", () => {
    expect(detail).toContain('if (session.role === "prefeitura_admin") {');
    expect(detail).not.toContain('allowMunicipalAdmin: true');
    expect(detail).toContain('readOnly={session.role === "prefeitura_admin"}');
    expect(fixture).not.toContain('["prefeitura_admin", "master_admin"');
  });
  it("protects underlying process tables against direct and definer-RPC mutations", () => {
    expect(sql).toContain("public.current_role_code()");
    expect(sql).toContain("'prefeitura_admin', 'admin_municipality'");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(sql).toContain("process_audit_entries");
    expect(sql).toContain("payment_guides");
    expect(sql).toContain("process_documents");
  });
});
