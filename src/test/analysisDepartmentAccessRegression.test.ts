import { describe, expect, it } from "vitest";
import {
  canAccessMunicipalArea,
  canAccessProcess,
  isProcessOwnedBySessionDepartment,
  resolveSessionOperationalArea,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const legacyAnalyst: SessionUser = {
  id: "analyst-profile",
  name: "Analista Urbanístico",
  role: "analista",
  accessLevel: 2,
  tenantId: "municipality-1",
  municipalityId: "municipality-1",
  title: "Analista Técnico",
  email: "analista@prefeitura.test",
  accountStatus: "active",
  userType: "Interno",
  department: "",
};

const privateIssProcess = {
  id: "process-analysis",
  tenantId: "municipality-1",
  municipalityId: "municipality-1",
  status: "pagamento_pendente",
  triage: { status: "concluido" },
  analysis: {
    assignedTo: "Analista Urbanístico",
    assignedProfileId: "analyst-profile",
    startedAt: "2026-10-13T16:16:22.289Z",
  },
  processControl: {
    currentFolder: "Financeiro",
  },
  dispatches: [],
  messages: [],
  payment: {
    guideNumber: "",
    amount: 0,
    status: "pendente",
    dueDate: "",
    guides: [
      {
        kind: "iss_obra",
        code: "DAM-ISS-2026-00002",
        amount: 300,
        status: "pendente",
        dueDate: "2026-10-30",
        issuedAt: "2026-10-13T18:57:16.399Z",
      },
    ],
  },
} as ProcessRecord;

describe("Analysis department document access", () => {
  it("keeps legacy analyst accounts in the Analysis operational area even without department_id", () => {
    expect(resolveSessionOperationalArea(legacyAnalyst)).toBe("analise");
    expect(canAccessMunicipalArea(legacyAnalyst, "analise")).toBe(true);
  });

  it("keeps a private ISS process operationally owned by Analysis until manual release", () => {
    expect(isProcessOwnedBySessionDepartment(legacyAnalyst, privateIssProcess)).toBe(true);
    expect(canAccessProcess(legacyAnalyst, privateIssProcess, "municipality-1")).toBe(true);
  });

  it("never treats municipal administration as the operational Analysis owner", () => {
    const admin: SessionUser = {
      ...legacyAnalyst,
      id: "admin-profile",
      role: "prefeitura_admin",
      accessLevel: 3,
      title: "Administrador da Prefeitura",
    };

    expect(isProcessOwnedBySessionDepartment(admin, privateIssProcess)).toBe(false);
  });
});
