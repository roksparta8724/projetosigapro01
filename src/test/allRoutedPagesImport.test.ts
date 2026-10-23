import { describe, expect, it } from "vitest";

const routedPages = [
  ["AcessoPage", () => import("@/pages/saas/AcessoPage")],
  ["LandingPage", () => import("@/pages/saas/LandingPage")],
  ["RecuperarSenhaPage", () => import("@/pages/saas/RecuperarSenhaPage")],
  ["CriarContaPage", () => import("@/pages/saas/CriarContaPage")],
  ["TenantNotFoundPage", () => import("@/pages/saas/TenantNotFoundPage")],
  ["TenantAdminPage", () => import("@/pages/saas/TenantAdminPage")],
  ["DashboardHomePage", () => import("@/pages/saas/DashboardHomePage")],
  ["AnalystDeskPage", () => import("@/pages/saas/AnalystDeskPage")],
  ["FinanceDeskPage", () => import("@/pages/saas/FinanceDeskPage")],
  ["FinanceProtocolsPage", () => import("@/pages/saas/FinanceProtocolsPage")],
  ["ProtocolDeskPage", () => import("@/pages/saas/ProtocolDeskPage")],
  ["IptuDeskPage", () => import("@/pages/saas/IptuDeskPage")],
  ["ExternalPortalPage", () => import("@/pages/saas/ExternalPortalPage")],
  ["ExternalProcessControlPage", () => import("@/pages/saas/ExternalProcessControlPage")],
  ["ExternalPaymentsPage", () => import("@/pages/saas/ExternalPaymentsPage")],
  ["ExternalHistoryPage", () => import("@/pages/saas/ExternalHistoryPage")],
  ["ExternalMessagesPage", () => import("@/pages/saas/ExternalMessagesPage")],
  ["OwnerPortalPage", () => import("@/pages/saas/OwnerPortalPage")],
  ["ProtocolarProjetoPage", () => import("@/pages/saas/ProtocolarProjetoPage")],
  ["ProcessDetailPage", () => import("@/pages/saas/ProcessDetailPage")],
  ["PerfilPage", () => import("@/pages/saas/PerfilPage")],
  ["ConfiguracoesPage", () => import("@/pages/saas/ConfiguracoesPage")],
  ["NotificationsPage", () => import("@/pages/saas/NotificationsPage")],
  ["MovementHistoryPage", () => import("@/pages/saas/MovementHistoryPage")],
  ["LegislationPage", () => import("@/pages/saas/LegislationPage")],
  ["ZoningPage", () => import("@/pages/saas/ZoningPage")],
  ["GlobalSearchPage", () => import("@/pages/saas/GlobalSearchPage")],
  ["NotFoundPage", () => import("@/pages/saas/NotFoundPage")],
  ["ClientePortalPage", () => import("@/pages/saas/ClientePortalPage")],
  ["MasterPlansPage", () => import("@/pages/saas/MasterPlansPage")],
  ["PublicPlansPage", () => import("@/pages/saas/PublicPlansPage")],
  ["PublicSignatureVerificationPage", () => import("@/pages/saas/PublicSignatureVerificationPage")],
  ["AiAssistantPage", () => import("@/pages/saas/AiAssistantPage")],
] as const;

describe("all routed page modules", () => {
  // MasterAdminPage imports the entire master console. On Windows, cold Vite
  // transformation under a full parallel test run can exceed 20 seconds.
  // Give only this particularly heavy route a higher ceiling, without hiding
  // failures in other pages or suppressing runtime initialization errors.
  it("MasterAdminPage imports without module/runtime initialization errors", async () => {
    const module = await import("@/pages/saas/MasterAdminPage");
    expect(module).toHaveProperty("MasterAdminPage");
    expect(typeof module.MasterAdminPage).toBe("function");
  }, 60_000);

  it.each(routedPages)("%s imports without module/runtime initialization errors", async (exportName, load) => {
    const module = await load();
    expect(module).toHaveProperty(exportName);
    expect(typeof module[exportName as keyof typeof module]).toBe("function");
  }, 20_000);
});
