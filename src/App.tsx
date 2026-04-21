import { useEffect, useState } from "react";
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
import { AppLoadingState } from "@/components/platform/AppLoadingState";
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
import { GlobalSearchPage } from "@/pages/saas/GlobalSearchPage";
import { NotFoundPage } from "@/pages/saas/NotFoundPage";
import { ClientePortalPage } from "@/pages/saas/ClientePortalPage";

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
  const [loadingPhase, setLoadingPhase] = useState<"initial" | "preparing" | "timeout">("initial");
  const [hasDisplayedReadyState, setHasDisplayedReadyState] = useState(false);
  const canShowPublicLanding = shouldShowPublicLanding(bootstrap.resolution);

  const shouldHoldForBootstrap =
    bootstrap.stage === "detecting_host" ||
    bootstrap.stage === "resolving_tenant" ||
    bootstrap.stage === "tenant_resolved" ||
    bootstrap.stage === "bootstrapping_auth" ||
    bootstrap.stage === "bootstrapping_profile";

  useEffect(() => {
    if (!shouldHoldForBootstrap) {
      setLoadingPhase("initial");
      return;
    }

    setLoadingPhase("initial");
    const preparingTimer = window.setTimeout(() => setLoadingPhase("preparing"), 1500);
    const timeoutTimer = window.setTimeout(() => setLoadingPhase("timeout"), 3000);

    return () => {
      window.clearTimeout(preparingTimer);
      window.clearTimeout(timeoutTimer);
    };
  }, [shouldHoldForBootstrap]);

  useEffect(() => {
    if (bootstrap.isReady) {
      setHasDisplayedReadyState(true);
    }
  }, [bootstrap.isReady]);

  const holdBranding = bootstrap.municipalityBundle?.branding ?? null;
  const holdLogo = holdBranding?.headerLogoUrl || holdBranding?.logoUrl || "";
  const holdName = bootstrap.municipalityBundle?.municipality?.name || "SIGAPRO";
  const isSystemBrandingRoute =
    location.pathname === "/" ||
    location.pathname === "/apresentacao" ||
    location.pathname === "/acesso" ||
    location.pathname === "/criar-conta" ||
    location.pathname === "/recuperar-senha";
  const loadingBrandName = isSystemBrandingRoute ? null : holdName;
  const loadingBrandLogo = isSystemBrandingRoute ? null : holdLogo;
  const stageLabel =
    loadingPhase === "preparing" ? "Preparando seus dados..." : "Carregando ambiente...";
  const showBlockingBootstrap = shouldHoldForBootstrap && !hasDisplayedReadyState;
  const showOverlayBootstrap = shouldHoldForBootstrap && hasDisplayedReadyState;

  if (showBlockingBootstrap) {
    if (loadingPhase === "timeout") {
      return (
        <LoadingFallback
          title="Tempo de carregamento excedido"
          description="Nao conseguimos concluir a inicializacao agora. Verifique sua conexao e tente novamente."
          onRetry={() => window.location.reload()}
        />
      );
    }

    return (
      <AppLoadingState
        title={stageLabel}
        description="Preparando o ambiente institucional com mais estabilidade visual."
        municipalityName={loadingBrandName}
        logoUrl={loadingBrandLogo}
      />
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
      {showOverlayBootstrap ? (
        <AppLoadingState
          variant="overlay"
          title={stageLabel}
          description="Atualizando contexto e permissoes sem interromper a navegacao."
          municipalityName={loadingBrandName}
          logoUrl={loadingBrandLogo}
        />
      ) : null}
      <Routes>
        <Route
          path="/"
          element={canShowPublicLanding ? <LandingPage /> : <Navigate to="/acesso" replace />}
        />
        <Route path="/cliente/:tenantSlug" element={<ClientePortalPage />} />
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
