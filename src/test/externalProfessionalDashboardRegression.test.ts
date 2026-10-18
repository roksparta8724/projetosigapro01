import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleProcessesByScope,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
const externalDashboard = read("src/pages/saas/ExternalPortalPage.tsx");
const portal = read("src/components/platform/PortalFrame.tsx");

const professional = {
  id: "profile-professional",
  name: "Profissional Externo",
  role: "profissional_externo",
  accessLevel: 1,
  tenantId: "municipality-a",
  municipalityId: "municipality-a",
  title: "Profissional Externo",
  email: "professional@example.test",
  accountStatus: "active",
  userType: "Externo",
  department: "Profissional Externo",
} satisfies SessionUser;

const ownProcess = {
  id: "process-own",
  tenantId: "municipality-a",
  municipalityId: "municipality-a",
  createdBy: "profile-professional",
  createdByProfileId: "profile-professional",
  createdByEmail: "professional@example.test",
  professionalProfileId: "profile-professional",
  professionalEmail: "professional@example.test",
} as unknown as ProcessRecord;

const otherProcess = {
  id: "process-other",
  tenantId: "municipality-a",
  municipalityId: "municipality-a",
  createdBy: "someone-else",
  createdByProfileId: "someone-else",
  createdByEmail: "other@example.test",
  professionalProfileId: "someone-else",
  professionalEmail: "other@example.test",
} as unknown as ProcessRecord;

describe("external professional dashboard", () => {
  it("uses permanent professional ownership instead of the property owner's CPF/CNPJ", () => {
    expect(
      getVisibleProcessesByScope(
        professional,
        "stale-ui-scope",
        [ownProcess, otherProcess],
      ).map((process) => process.id),
    ).toEqual(["process-own"]);

    expect(dashboard).toContain("getVisibleProcessesByScope");
    expect(dashboard).toContain("isExternalProfessionalRole");
    expect(dashboard).toContain("professionalProcesses");
    expect(dashboard).toContain("Protocolos vinculados ao seu perfil profissional.");
  });

  it("routes the Dashboard menu of a professional to the dedicated external dashboard", () => {
    expect(portal).toContain('if (item.to === "/dashboard")');
    expect(portal).toContain('to: "/externo", label: "Dashboard"');
    expect(portal).toContain('children: (item.children ?? []).filter((child) => child.to !== "/externo")');
  });

  it("counts only requirements and payment guides actually released to the professional", () => {
    expect(externalDashboard).toContain('item.visibility !== "interno"');
    expect(externalDashboard).toContain("getExternallyVisibleProcessPaymentGuides");
    expect(externalDashboard).toContain("const pendingPayments = pendingGuides.length");
    expect(externalDashboard).not.toContain('process.payment?.status === "pendente"');
  });
});
