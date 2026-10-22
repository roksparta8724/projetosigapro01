import { describe, expect, it } from "vitest";
import {
  canOperateInstitutionalHistoryProcess,
  canReadInstitutionalHistory,
  getInstitutionalHistoryProcesses,
  historicTimestamp,
} from "@/lib/institutionalHistoryAccess";
import type { ProcessRecord, SessionUser } from "@/lib/platform";

const session = (role: string, department = "Análise Urbanística", accountStatus = "active"): SessionUser => ({
  id: "staff-1",
  name: "Servidor Exemplo",
  role: role as SessionUser["role"],
  accountStatus: accountStatus as SessionUser["accountStatus"],
  accessLevel: 2,
  tenantId: "prefeitura-a",
  municipalityId: "prefeitura-a",
  title: department,
  department,
  email: "staff@example.test",
});

const process = (
  municipalityId: string,
  status: ProcessRecord["status"] = "analise_tecnica",
  currentFolder = "Análise Urbanística",
): ProcessRecord => ({
  id: "proc-1",
  tenantId: municipalityId,
  municipalityId,
  status,
  triage: { status: "concluido" },
  payment: { guides: [] },
  dispatches: [],
  processControl: { currentFolder },
} as unknown as ProcessRecord);

describe("institutional history access", () => {
  it.each([
    "master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor",
    "analista", "financeiro", "setor_intersetorial", "fiscal",
  ])("allows read-only institutional history for an active %s", (role) => {
    expect(canReadInstitutionalHistory(session(role))).toBe(true);
  });

  it.each(["profissional_externo", "property_owner", "proprietario_consulta", "future_unknown_role"])(
    "does not expose the internal desk to a %s", (role) => {
      expect(canReadInstitutionalHistory(session(role))).toBe(false);
      expect(getInstitutionalHistoryProcesses(session(role), "prefeitura-a", [process("prefeitura-a")])).toHaveLength(0);
    },
  );

  it("blocks inactive accounts regardless of their role", () => {
    expect(canReadInstitutionalHistory(session("analista", "Análise Urbanística", "blocked"))).toBe(false);
    expect(canReadInstitutionalHistory(session("master_admin", "Análise Urbanística", "inactive"))).toBe(false);
  });

  it("restricts even master/admin historical views to the selected municipality", () => {
    const items = [process("prefeitura-a"), { ...process("prefeitura-b"), id: "proc-2" }];
    expect(getInstitutionalHistoryProcesses(session("master_admin"), "prefeitura-a", items).map((p) => p.id)).toEqual(["proc-1"]);
    expect(getInstitutionalHistoryProcesses(session("prefeitura_admin"), "prefeitura-a", items).map((p) => p.id)).toEqual(["proc-1"]);
    expect(getInstitutionalHistoryProcesses(session("analista"), null, items)).toEqual([]);
  });

  it("keeps finalized and forwarded cases in read-only historical lookup", () => {
    const completed = process("prefeitura-a", "deferido", "Financeiro");
    expect(getInstitutionalHistoryProcesses(session("analista"), "prefeitura-a", [completed])).toHaveLength(1);
    expect(canOperateInstitutionalHistoryProcess(session("analista"), completed, "prefeitura-a")).toBe(false);
  });

  it("preserves different permissions for administrator and operational owner", () => {
    const underAnalysis = process("prefeitura-a");
    expect(canOperateInstitutionalHistoryProcess(session("prefeitura_admin"), underAnalysis, "prefeitura-a")).toBe(false);
    expect(canOperateInstitutionalHistoryProcess(session("analista"), underAnalysis, "prefeitura-a")).toBe(true);
    expect(canOperateInstitutionalHistoryProcess(session("financeiro", "Financeiro"), underAnalysis, "prefeitura-a")).toBe(false);
    expect(canOperateInstitutionalHistoryProcess(session("analista"), process("prefeitura-b"), "prefeitura-a")).toBe(false);
  });

  it("orders Brazilian date strings properly and rejects impossible dates", () => {
    expect(historicTimestamp("22/10/2026, 19:45:31")).toBeGreaterThan(historicTimestamp("21/10/2026, 20:05:00"));
    expect(historicTimestamp("2026-10-22T19:45:31Z")).toBeGreaterThan(0);
    expect(historicTimestamp("32/10/2026, 19:45:31")).toBe(0);
  });
});
