import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import { AcessoPage } from "@/pages/saas/AcessoPage";
import { LandingPage } from "@/pages/saas/LandingPage";
import { RecuperarSenhaPage } from "@/pages/saas/RecuperarSenhaPage";
import { CriarContaPage } from "@/pages/saas/CriarContaPage";
import { AppErrorBoundary } from "@/components/platform/AppErrorBoundary";
import { TenantNotFoundPage } from "@/pages/saas/TenantNotFoundPage";
import { LoadingFallback } from "@/components/platform/LoadingFallback";
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
  const location = useLocation();
  const canShowPublicLanding = shouldShowPublicLanding(bootstrap.resolution);
  const isPublicRoute =
    location.pathname === "/" ||
    location.pathname === "/apresentacao" ||
    location.pathname === "/planos-publicos" ||
    location.pathname === "/acesso" ||
    location.pathname === "/criar-conta" ||
    location.pathname === "/recuperar-senha";

  if (!bootstrap.isReady && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-[#091322] text-slate-100">
        <div className="h-[92px] border-b border-white/6 bg-[linear-gradient(180deg,rgba(10,20,34,0.98)_0%,rgba(11,24,40,0.96)_100%)] backdrop-blur-xl" />
        <div className="flex min-h-[calc(100vh-92px)]">
          <aside className="hidden w-[278px] border-r border-white/6 bg-[linear-gradient(180deg,rgba(8,18,31,0.98)_0%,rgba(9,20,34,1)_100%)] lg:block" />
          <main className="flex-1 bg-[linear-gradient(180deg,#edf3f9_0%,#e7eef7_100%)] px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5 2xl:px-8">
            <div className="h-full min-h-[calc(100vh-132px)] rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(248,250,252,0.98)_100%)] shadow-[0_20px_44px_rgba(15,23,42,0.08)]" />
          </main>
        </div>
      </div>
    );
  }

  if (bootstrap.stage === "tenant_not_found") {
    return <TenantNotFoundPage />;
  }

  if (bootstrap.stage === "bootstrap_error") {
    return (
      <LoadingFallback
        title="Falha ao iniciar o ambiente"
        description={bootstrap.error || "Nao foi possivel concluir a inicializacao do sistema."}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="sig-fade-enter sig-fade-enter-active">
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
              <AnalystDeskPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/protocolos"
          element={
            <PermissionRoute permission="manage_tenant_users">
              <ProtocolDeskPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/protocolos/novo"
          element={
            <PermissionRoute permission="manage_tenant_users">
              <ProtocolarProjetoPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/financeiro"
          element={
            <PermissionRoute permission="manage_financial">
              <FinanceDeskPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/financeiro/protocolos"
          element={
            <PermissionRoute permission="manage_financial">
              <FinanceProtocolsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/financeiro/iptu"
          element={
            <PermissionRoute permission="manage_financial">
              <IptuDeskPage />
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
              <ExternalPortalPage />
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
              <ProtocolarProjetoPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/controle"
          element={
            <PermissionRoute permission="submit_processes">
              <ExternalProcessControlPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/pagamentos"
          element={
            <PermissionRoute permission="submit_processes">
              <ExternalPaymentsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/historico"
          element={
            <PermissionRoute permission="submit_processes">
              <ExternalHistoryPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/mensagens"
          element={
            <PermissionRoute permission="submit_processes">
              <ExternalMessagesPage />
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
              <ConfiguracoesPage />
            </PermissionRoute>
          }
        />
        <Route path="/processos/:processId" element={<ProcessDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
};
