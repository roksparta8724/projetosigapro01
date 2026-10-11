import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatOfficialProcessLabel, formatOfficialProcessNumber, formatOfficialProcessTitle, getChecklistTemplate } from "@/lib/platform";

const presentationPages = [
  "src/pages/saas/ProtocolDeskPage.tsx",
  "src/pages/saas/AnalystDeskPage.tsx",
  "src/pages/saas/ExternalProcessControlPage.tsx",
  "src/pages/saas/DashboardHomePage.tsx",
  "src/pages/saas/ProcessDetailPage.tsx",
  "src/pages/saas/FinanceProtocolsPage.tsx",
  "src/pages/saas/GlobalSearchPage.tsx",
  "src/pages/saas/MovementHistoryPage.tsx",
  "src/pages/saas/NotificationsPage.tsx",
  "src/pages/saas/ExternalHistoryPage.tsx",
  "src/pages/saas/ExternalPaymentsPage.tsx",
  "src/pages/saas/OwnerPortalPage.tsx",
  "src/pages/saas/FinanceDeskPage.tsx",
  "src/pages/saas/IptuDeskPage.tsx",
];

describe("premium process presentation", () => {
  it("converts legacy audit identifiers into neutral official numbering", () => {
    expect(formatOfficialProcessNumber("AUDIT-CLP-20261009-001"))
      .toBe("Processo nº 000001/2026");
    expect(formatOfficialProcessNumber("AUDIT-CLP-2026-12"))
      .toBe("Processo nº 000012/2026");
    expect(formatOfficialProcessLabel({ protocol: "AUDIT-CLP-20261009-001", type: "licenciamento" }))
      .toBe("Processo de Licenciamento Urbanístico nº 000001/2026");
  });

  it("provides a required-document checklist for licensing records", () => {
    const checklist = getChecklistTemplate("licenciamento");
    expect(checklist).toBeTruthy();
    expect(checklist?.items.filter((item) => item.required).length).toBeGreaterThan(0);
  });

  it("converts technical audit titles into professional service names", () => {
    expect(formatOfficialProcessTitle({ title: "AUDIT fluxo CLP", type: "licenciamento" }))
      .toBe("Licenciamento Urbanístico");
    expect(formatOfficialProcessTitle({ title: "AUDIT teste", type: "regularizacao" }))
      .toBe("Regularização Urbanística");
  });

  it("uses the centralized presentation helpers across operational screens", () => {
    for (const page of presentationPages) {
      const source = readFileSync(resolve(process.cwd(), page), "utf8");
      expect(source, page).toContain("formatOfficialProcessNumber");
    }
  });
});
