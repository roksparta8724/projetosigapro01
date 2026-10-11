import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthGatewayProvider } from "@/hooks/useAuthGateway";
import { AppBootstrapProvider, useAppBootstrap } from "@/hooks/useAppBootstrap";
import { PlatformSessionProvider } from "@/hooks/usePlatformSession";
import { PlatformDataProvider } from "@/hooks/usePlatformData";
import { MunicipalityProvider } from "@/hooks/useMunicipality";
import { TenantProvider } from "@/hooks/useTenant";
import { PermissionRoute } from "@/components/platform/PermissionRoute";
import { PlanModuleRoute } from "@/components/platform/PlanModuleRoute";
import { AcessoPage } from "@/pages/saas/AcessoPage";
import { LandingPage } from "@/pages/saas/LandingPage";
import { RecuperarSenhaPage } from "@/pages/saas/RecuperarSenhaPage";
import { CriarContaPage } from "@/pages/saas/CriarContaPage";
import { AppErrorBoundary } from "@/components/platform/AppErrorBoundary";
import { TenantNotFoundPage } from "@/pages/saas/TenantNotFoundPage";
import { shouldShowPublicLanding } from "@/lib/tenant";
import { MasterAdminPage } from "@/pages/saas/MasterAdminPage";
import { TenantAdminPage } from "@/pages/saas/TenantAdminPage";
import { DashboardHomePage } from "@/pages/saas/DashboardHomePage";
import { AnalystDeskPage } from "@/pages/saas/AnalystDeskPage";
import { FinanceDeskPage } from "@/pages/saas/FinanceDeskPage";
import { FinanceProtocolsPage } from "@/pages/saas/FinanceProtocolsPage";
import { ProtocolDeskPage } from "@/pages/saas/ProtocolDeskPage";
import { IptuDeskPage } from "@/pages/saas/IptuDeskPage";
import { ExternalPortalPage } from "@/pages/saas/ExternalPortalPage";
import { ExternalProcessControlPage } from "@/pages/saas/ExternalProcessControlPage";
import { ExternalPaymentsPage } from "@/pages/saas/ExternalPaymentsPage";
import { ExternalHistoryPage } from "@/pages/saas/ExternalHistoryPage";
import { ExternalMessagesPage } from "@/pages/saas/ExternalMessagesPage";
import { OwnerPortalPage } from "@/pages/saas/OwnerPortalPage";
import { ProtocolarProjetoPage } from "@/pages/saas/ProtocolarProjetoPage";
import { ProcessDetailPage } from "@/pages/saas/ProcessDetailPage";
import { DocumentAnalysisPage } from "@/pages/saas/DocumentAnalysisPage";
import { PerfilPage } from "@/pages/saas/PerfilPage";
import { ConfiguracoesPage } from "@/pages/saas/ConfiguracoesPage";
import { NotificationsPage } from "@/pages/saas/NotificationsPage";
import { MovementHistoryPage } from "@/pages/saas/MovementHistoryPage";
import { LegislationPage } from "@/pages/saas/LegislationPage";
import { ZoningPage } from "@/pages/saas/ZoningPage";
import { GlobalSearchPage } from "@/pages/saas/GlobalSearchPage";
import { NotFoundPage } from "@/pages/saas/NotFoundPage";
import { ClientePortalPage } from "@/pages/saas/ClientePortalPage";
import { MasterPlansPage } from "@/pages/saas/MasterPlansPage";
import { PublicPlansPage } from "@/pages/saas/PublicPlansPage";
import { AiAssistantPage } from "@/pages/saas/AiAssistantPage";

const App = () => {
  return (
    <AppBootstrapProvider>
      <AuthGatewayProvider>
        <PlatformDataProvider>
          <PlatformSessionProvider>
            <TenantProvider>
              <MunicipalityProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <AppErrorBoundary>
                      <AppRoutes />
                    </AppErrorBoundary>
                  </BrowserRouter>
                </TooltipProvider>
              </MunicipalityProvider>
            </TenantProvider>
          </PlatformSessionProvider>
        </PlatformDataProvider>
      </AuthGatewayProvider>
    </AppBootstrapProvider>
  );
};

export default App;

const AppRoutes = () => {
  const bootstrap = useAppBootstrap();
  const canShowPublicLanding = shouldShowPublicLanding(bootstrap.resolution);
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const isPublicEntryPath =
    pathname === "/" ||
    pathname === "/inicio" ||
    pathname === "/apresentacao" ||
    pathname === "/acesso" ||
    pathname === "/criar-conta" ||
    pathname === "/recuperar-senha" ||
    pathname.startsWith("/cliente/");
  const canPromoteBootstrapScreen =
    bootstrap.isReady &&
    !bootstrap.loading &&
    !bootstrap.authUserId &&
    !bootstrap.profile?.userId;

  // Blindagem: o AppShell interno nunca pode ser substituido por tela full-screen de bootstrap.
  if (isPublicEntryPath && canPromoteBootstrapScreen && bootstrap.stage === "tenant_not_found") {
    return <TenantNotFoundPage />;
  }

  // Nunca renderizar fallback full-screen no root: as rotas reais permanecem montadas no refresh.
  return (
      <Routes>
        <Route
          path="/"
          element={canShowPublicLanding ? <LandingPage /> : <Navigate to="/acesso" replace />}
        />
        <Route path="/cliente/:tenantSlug" element={<ClientePortalPage />} />
        <Route path="/planos-publicos" element={<PublicPlansPage />} />
        <Route path="/acesso" element={<AcessoPage />} />
        <Route path="/criar-conta" element={<CriarContaPage />} />
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
        <Route
          path="/apresentacao"
          element={canShowPublicLanding ? <LandingPage /> : <Navigate to="/acesso" replace />}
        />
        <Route path="/inicio" element={<Navigate to="/" replace />} />

        <Route
          path="/dashboard"
          element={
            <PermissionRoute permission="manage_own_profile">
              <DashboardHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/dashboard/processos"
          element={
            <PermissionRoute permission="manage_own_profile">
              <DashboardHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/dashboard/financeiro"
          element={
            <PermissionRoute permission="manage_own_profile">
              <DashboardHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/dashboard/usuarios"
          element={
            <PermissionRoute permission="manage_own_profile">
              <DashboardHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/dashboard/operacional"
          element={
            <PermissionRoute permission="manage_own_profile">
              <DashboardHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/master"
          element={
            <PermissionRoute permission="view_master_dashboard">
              <MasterAdminPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/master/planos"
          element={
            <PermissionRoute permission="manage_commercial_plans">
              <MasterPlansPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura"
          element={
            <PermissionRoute permission="manage_tenant_users">
              <TenantAdminPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/analise"
          element={
            <PermissionRoute permission="review_processes">
              <PlanModuleRoute module="Analise tecnica">
                <AnalystDeskPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/protocolos"
          element={
            <PermissionRoute permission="manage_protocols">
              <PlanModuleRoute module="Protocolo digital">
                <ProtocolDeskPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/protocolos/novo"
          element={
            <PermissionRoute permission="manage_protocols">
              <PlanModuleRoute module="Protocolo digital">
                <ProtocolarProjetoPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/financeiro"
          element={
            <PermissionRoute permission="manage_financial">
              <PlanModuleRoute module="Financeiro">
                <FinanceDeskPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/financeiro/protocolos"
          element={
            <PermissionRoute permission="manage_financial">
              <PlanModuleRoute module="Financeiro">
                <FinanceProtocolsPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/financeiro/iptu"
          element={
            <PermissionRoute permission="manage_fiscal_financial">
              <PlanModuleRoute module="Financeiro">
                <IptuDeskPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/notificacoes"
          element={
            <PermissionRoute permission="manage_own_profile">
              <NotificationsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/buscar"
          element={
            <PermissionRoute permission="manage_own_profile">
              <GlobalSearchPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/assistente-ia"
          element={
            <PermissionRoute permission="manage_own_profile">
              <AiAssistantPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/historico"
          element={
            <PermissionRoute permission="manage_own_profile">
              <MovementHistoryPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/legislacao"
          element={
            <PermissionRoute permission="manage_own_profile">
              <LegislationPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/legislacao/zoneamento"
          element={
            <PermissionRoute permission="manage_own_profile">
              <ZoningPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/externo"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ExternalPortalPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/proprietario"
          element={
            <PermissionRoute permission="view_own_processes">
              <OwnerPortalPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/protocolar"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ProtocolarProjetoPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/controle"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ExternalProcessControlPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/pagamentos"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ExternalPaymentsPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/historico"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ExternalHistoryPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/mensagens"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ExternalMessagesPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/perfil"
          element={
            <PermissionRoute permission="manage_own_profile">
              <PerfilPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <PermissionRoute permission="manage_own_profile">
              <PlanModuleRoute module="Configurações">
                <ConfiguracoesPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/processos/:processId/documentos/:documentId/analisar"
          element={
            <PermissionRoute permission="view_own_processes">
              <PlanModuleRoute module="Analise tecnica">
                <DocumentAnalysisPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/processos/:processId"
          element={
            <PermissionRoute permission="view_own_processes">
              <ProcessDetailPage />
            </PermissionRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
  );
};
