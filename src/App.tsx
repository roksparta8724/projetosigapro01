import { useEffect, useState } from "react";
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
import { AcessoPage } from "@/pages/saas/AcessoPage";
import { LandingPage } from "@/pages/saas/LandingPage";
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
import { RecuperarSenhaPage } from "@/pages/saas/RecuperarSenhaPage";
import { CriarContaPage } from "@/pages/saas/CriarContaPage";
import { ClientePortalPage } from "@/pages/saas/ClientePortalPage";
import { AppErrorBoundary } from "@/components/platform/AppErrorBoundary";
import { ScrollToTop } from "@/components/platform/ScrollToTop";
import { TenantNotFoundPage } from "@/pages/saas/TenantNotFoundPage";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingFallback } from "@/components/platform/LoadingFallback";

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
                    <ScrollToTop />
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
  const [loadingPhase, setLoadingPhase] = useState<"initial" | "preparing" | "timeout">("initial");

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

  if (shouldHoldForBootstrap) {
    if (loadingPhase === "timeout") {
      return (
        <LoadingFallback
          title="Tempo de carregamento excedido"
          description="Não conseguimos concluir a inicialização agora. Verifique sua conexão e tente novamente."
          onRetry={() => window.location.reload()}
        />
      );
    }

    const holdBranding = bootstrap.municipalityBundle?.branding ?? null;
    const holdLogo = holdBranding?.headerLogoUrl || holdBranding?.logoUrl || "";
    const holdName = bootstrap.municipalityBundle?.municipality?.name || "SIGAPRO";
    const stageLabel =
      loadingPhase === "preparing" ? "Preparando seus dados..." : "Carregando ambiente...";

    return (
      <div className="min-h-screen bg-slate-100 sig-fade-enter sig-fade-enter-active">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              {holdLogo ? (
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                  <img src={holdLogo} alt={holdName} className="h-full w-full object-contain" />
                </div>
              ) : (
                <Skeleton className="h-10 w-10 rounded-2xl" />
              )}
              <div className="hidden flex-col gap-2 sm:flex">
                <Skeleton className="h-3 w-28 rounded-full" />
                <Skeleton className="h-2.5 w-44 rounded-full" />
              </div>
            </div>

            <div className="hidden w-full max-w-[360px] sm:block">
              <Skeleton className="h-9 w-full rounded-2xl" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 sm:px-6">
          <div className="mb-6 rounded-[28px] border border-slate-200 bg-white/80 px-6 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.10)]">
            <div className="flex items-center gap-4">
              {holdLogo ? (
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                  <img src={holdLogo} alt={holdName} className="h-full w-full object-contain" />
                </div>
              ) : (
                <Skeleton className="h-12 w-12 rounded-2xl" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-36 rounded-full" />
                <Skeleton className="h-4 w-2/3 rounded-full" />
              </div>
              <Skeleton className="hidden h-9 w-36 rounded-full sm:block" />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
            <div className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8 shadow-[0_32px_80px_rgba(15,23,42,0.12)]">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <span className="text-sm font-semibold tracking-[0.2em]">SIG</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Bootstrap institucional
                    </p>
                    <h1 className="text-lg font-semibold text-slate-900">{stageLabel}</h1>
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  <Skeleton className="h-4 w-2/3 rounded-full" />
                  <Skeleton className="h-4 w-1/2 rounded-full" />
                  <Skeleton className="h-4 w-3/4 rounded-full" />
                </div>

                <div className="mt-8 grid gap-3 md:grid-cols-3">
                  <Skeleton className="h-20 rounded-2xl" />
                  <Skeleton className="h-20 rounded-2xl" />
                  <Skeleton className="h-20 rounded-2xl" />
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <Skeleton className="h-3 w-40 rounded-full" />
                  <Skeleton className="h-3 w-24 rounded-full" />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.14)]">
                <div className="space-y-3">
                  <Skeleton className="h-3 w-28 rounded-full" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                </div>
                <div className="mt-6 space-y-2">
                  <Skeleton className="h-3 w-3/4 rounded-full" />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AQUI ESTÁ A CORREÇÃO PRINCIPAL:
  // usa o bootstrap como fonte de verdade para tenant not found.
  if (bootstrap.stage === "tenant_not_found") {
    return <TenantNotFoundPage />;
  }

  if (bootstrap.stage === "bootstrap_error") {
    return (
      <LoadingFallback
        title="Falha ao iniciar o ambiente"
        description={bootstrap.error || "Não foi possível concluir a inicialização do sistema."}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="sig-fade-enter sig-fade-enter-active">
      <Routes>
        <Route path="/" element={<Navigate to="/acesso" replace />} />
        <Route path="/cliente/:tenantSlug" element={<ClientePortalPage />} />
        <Route path="/acesso" element={<AcessoPage />} />
        <Route path="/criar-conta" element={<CriarContaPage />} />
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
        <Route path="/apresentacao" element={<LandingPage />} />
        <Route path="/inicio" element={<Navigate to="/acesso" replace />} />

        <Route
          path="/dashboard"
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