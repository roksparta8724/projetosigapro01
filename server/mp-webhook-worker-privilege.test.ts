import { describe, expect, it, vi } from "vitest";
import {
  assertMpWorkerLeastPrivilege,
  MP_WORKER_PRIVILEGE_AUDIT_SQL,
  workerHasLeastPrivilege,
  MP_WORKER_ROLE,
  type MpWorkerPrivilegeEvidence,
} from "./mp-webhook-worker-privilege";
import { readFileSync } from "node:fs";

const compliant: MpWorkerPrivilegeEvidence = {
  role_name: MP_WORKER_ROLE,
  bypass_rls: false,
  superuser: false,
  admin_membership: false,
  profiles_update: false,
  document_delete: false,
  sensitive_table_access: false,
  sensitive_column_access: false,
  direct_financial_write: false,
};

describe("SIGAPRO bancos — worker financeiro sem permissões administrativas", () => {
  it("recusa configuração real observada na QA: BYPASSRLS e herança neon_superuser", () => {
    expect(workerHasLeastPrivilege({ ...compliant, bypass_rls: true, admin_membership: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, bypass_rls: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, admin_membership: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, superuser: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, role_name: "neondb_owner" })).toBe(false);
  });

  it("recusa leitura de perfis/documentos, permissões de coluna e escrita direta no financeiro", () => {
    expect(workerHasLeastPrivilege({ ...compliant, profiles_update: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, document_delete: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, sensitive_table_access: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, sensitive_column_access: true })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, direct_financial_write: true })).toBe(false);
    expect(workerHasLeastPrivilege(null)).toBe(false);
    expect(workerHasLeastPrivilege(compliant)).toBe(true);
  });

  it("nega respostas parciais ou indeterminadas mesmo com nome correto", () => {
    const partial = { ...compliant, sensitive_column_access: undefined };
    expect(workerHasLeastPrivilege(partial)).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, direct_financial_write: null })).toBe(false);
    expect(workerHasLeastPrivilege({ ...compliant, bypass_rls: "false" })).toBe(false);
  });

  it("audita relações e colunas da própria conexão antes de acessar dados bancários", () => {
    for (const item of [
      "current_user", "rolbypassrls", "neon_superuser",
      "pg_read_all_data", "pg_write_all_data",
      "has_table_privilege", "has_any_column_privilege",
      "public.profiles", "public.process_documents", "public.processes",
      "public.payment_guides", "public.process_audit_entries",
      "public.municipalities",
    ]) {
      expect(MP_WORKER_PRIVILEGE_AUDIT_SQL).toContain(item);
    }
    const server = readFileSync("server/mp-prod-webhook.ts", "utf8");
    expect(server).toContain('import {assertMpWorkerLeastPrivilege}');
    expect(server.indexOf("await assertMpWorkerLeastPrivilege(client);"))
      .toBeGreaterThan(server.indexOf("await client.connect();"));
    expect(server.indexOf("await assertMpWorkerLeastPrivilege(client);"))
      .toBeLessThan(server.indexOf("return await fn(client);"));
  });

  it("verifica resultado único e nega falhas/erros de catálogo, sem fallback a owner", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [compliant] }) };
    await expect(assertMpWorkerLeastPrivilege(db)).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(MP_WORKER_PRIVILEGE_AUDIT_SQL, []);

    db.query.mockResolvedValue({ rows: [{ ...compliant, sensitive_table_access: true }] });
    await expect(assertMpWorkerLeastPrivilege(db)).rejects.toThrow("MP_WORKER_EXCESSIVE_PRIVILEGES");

    db.query.mockResolvedValue({ rows: [] });
    await expect(assertMpWorkerLeastPrivilege(db)).rejects.toThrow("MP_WORKER_EXCESSIVE_PRIVILEGES");

    db.query.mockResolvedValue({ rows: [compliant, compliant] });
    await expect(assertMpWorkerLeastPrivilege(db)).rejects.toThrow("MP_WORKER_EXCESSIVE_PRIVILEGES");

    db.query.mockRejectedValue(new Error("permission denied"));
    await expect(assertMpWorkerLeastPrivilege(db)).rejects.toThrow("permission denied");
  });
});
