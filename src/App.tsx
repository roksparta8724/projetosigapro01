import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useDeferredValue, useLayoutEffect } from "react";
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
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";
import { TenantNotFoundPage } from "@/pages/saas/TenantNotFoundPage";
import { shouldShowPublicLanding } from "@/lib/tenant";



























import { URBAN_LEGISLATION_VIEW_ROLES } from "@/lib/urbanLegislationAccess";


import { NotFoundPage } from "@/pages/saas/NotFoundPage";


import { PublicPlansPage } from "@/pages/saas/PublicPlansPage";
import { PublicSignatureVerificationPage } from "@/pages/saas/PublicSignatureVerificationPage";


// Lazy import isolates heavy analytics, PDFs and operational pages from /acesso.
// Component identity stays stable: never define lazy routes inside AppRoutes.
const MasterAdminPage = lazy(() => import("@/pages/saas/MasterAdminPage").then((module) => ({ default: module.MasterAdminPage })));
const TenantAdminPage = lazy(() => import("@/pages/saas/TenantAdminPage").then((module) => ({ default: module.TenantAdminPage })));
const CollectionSettingsPage = lazy(() => import("@/pages/saas/CollectionSettingsPage").then((module) => ({ default: module.CollectionSettingsPage })));
const MunicipalOrganizationPage = lazy(() => import("@/pages/saas/MunicipalOrganizationPage").then((module) => ({ default: module.MunicipalOrganizationPage })));
const MunicipalProcessRegistryPage = lazy(() => import("@/pages/saas/MunicipalProcessRegistryPage").then((module) => ({ default: module.MunicipalProcessRegistryPage })));
const DashboardHomePage = lazy(() => import("@/pages/saas/DashboardHomePage").then((module) => ({ default: module.DashboardHomePage })));
const AnalystDeskPage = lazy(() => import("@/pages/saas/AnalystDeskPage").then((module) => ({ default: module.AnalystDeskPage })));
const FinanceDeskPage = lazy(() => import("@/pages/saas/FinanceDeskPage").then((module) => ({ default: module.FinanceDeskPage })));
const FinanceProtocolsPage = lazy(() => import("@/pages/saas/FinanceProtocolsPage").then((module) => ({ default: module.FinanceProtocolsPage })));
const ProtocolDeskPage = lazy(() => import("@/pages/saas/ProtocolDeskPage").then((module) => ({ default: module.ProtocolDeskPage })));
const IptuDeskPage = lazy(() => import("@/pages/saas/IptuDeskPage").then((module) => ({ default: module.IptuDeskPage })));
const ExternalPortalPage = lazy(() => import("@/pages/saas/ExternalPortalPage").then((module) => ({ default: module.ExternalPortalPage })));
const ExternalProcessControlPage = lazy(() => import("@/pages/saas/ExternalProcessControlPage").then((module) => ({ default: module.ExternalProcessControlPage })));
const ExternalDraftsPage = lazy(() => import("@/pages/saas/ExternalDraftsPage").then((module) => ({ default: module.ExternalDraftsPage })));
const ExternalPaymentsPage = lazy(() => import("@/pages/saas/ExternalPaymentsPage").then((module) => ({ default: module.ExternalPaymentsPage })));
const ExternalHistoryPage = lazy(() => import("@/pages/saas/ExternalHistoryPage").then((module) => ({ default: module.ExternalHistoryPage })));
const ExternalMessagesPage = lazy(() => import("@/pages/saas/ExternalMessagesPage").then((module) => ({ default: module.ExternalMessagesPage })));
const OwnerPortalPage = lazy(() => import("@/pages/saas/OwnerPortalPage").then((module) => ({ default: module.OwnerPortalPage })));
const ProtocolarProjetoPage = lazy(() => import("@/pages/saas/ProtocolarProjetoPage").then((module) => ({ default: module.ProtocolarProjetoPage })));
const ProcessDetailPage = lazy(() => import("@/pages/saas/ProcessDetailPage").then((module) => ({ default: module.ProcessDetailPage })));
const DocumentAnalysisPage = lazy(() => import("@/pages/saas/DocumentAnalysisPage").then((module) => ({ default: module.DocumentAnalysisPage })));
const DocumentViewerPage = lazy(() => import("@/pages/saas/DocumentViewerPage").then((module) => ({ default: module.DocumentViewerPage })));
const PerfilPage = lazy(() => import("@/pages/saas/PerfilPage").then((module) => ({ default: module.PerfilPage })));
const ConfiguracoesPage = lazy(() => import("@/pages/saas/ConfiguracoesPage").then((module) => ({ default: module.ConfiguracoesPage })));
const NotificationsPage = lazy(() => import("@/pages/saas/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const MovementHistoryPage = lazy(() => import("@/pages/saas/MovementHistoryPage").then((module) => ({ default: module.MovementHistoryPage })));
const LegislationPage = lazy(() => import("@/pages/saas/LegislationPage").then((module) => ({ default: module.LegislationPage })));
const ZoningPage = lazy(() => import("@/pages/saas/ZoningPage").then((module) => ({ default: module.ZoningPage })));
const GlobalSearchPage = lazy(() => import("@/pages/saas/GlobalSearchPage").then((module) => ({ default: module.GlobalSearchPage })));
const ClientePortalPage = lazy(() => import("@/pages/saas/ClientePortalPage").then((module) => ({ default: module.ClientePortalPage })));
const MasterPlansPage = lazy(() => import("@/pages/saas/MasterPlansPage").then((module) => ({ default: module.MasterPlansPage })));
const AiAssistantPage = lazy(() => import("@/pages/saas/AiAssistantPage").then((module) => ({ default: module.AiAssistantPage })));

const App = () => {
  return (
    <AppErrorBoundary>
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
    </AppErrorBoundary>
  );
};

export default App;

const AppRoutes = () => {
  const bootstrap = useAppBootstrap();
  const location = useLocation();
  // Preserve the previous authorized page while a lazy module is downloaded.
  // A module load must not replace the entire municipal shell with a separate screen.
  const deferredLocation = useDeferredValue(location);
  const canShowPublicLanding = shouldShowPublicLanding(bootstrap.resolution);
  const pathname = location.pathname;

  useLayoutEffect(() => {
    document.documentElement.style.zoom = "1";
    document.body.style.zoom = "1";
    document.documentElement.dataset.pageZoom = "100";
  }, []);
  const isPublicEntryPath =
    pathname === "/" ||
    pathname === "/inicio" ||
    pathname === "/apresentacao" ||
    pathname === "/acesso" ||
    pathname === "/criar-conta" ||
    pathname === "/recuperar-senha" ||
    pathname.startsWith("/cliente/") ||
    pathname.startsWith("/v/") ||
    pathname === "/verificar-assinatura";
  // Public access/logout pages always switch immediately: never keep restricted
  // content mounted while the user returns to the login screen.
  const displayedLocation = isPublicEntryPath ? location : deferredLocation;
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
    <Suspense fallback={<SecureRoutePending surface="route" title="Abrindo módulo do SIGAPRO" detail="Preparando o módulo solicitado." />}>
      <Routes location={displayedLocation}>
        <Route
          path="/"
          element={canShowPublicLanding ? <LandingPage /> : <Navigate to="/acesso" replace />}
        />
        <Route path="/cliente/:tenantSlug" element={<ClientePortalPage />} />
        <Route path="/planos-publicos" element={<PublicPlansPage />} />
        <Route path="/verificar-assinatura" element={<PublicSignatureVerificationPage />} />
        <Route path="/v/:codigo" element={<PublicSignatureVerificationPage />} />
        <Route path="/acesso" element={<AcessoPage />} />
        <Route path="/criar-conta" element={<CriarContaPage />} />
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
        <Route
          path="/apresentacao"
          element={canShowPublicLanding ? <LandingPage /> : <Navigate to="/acesso" replace />}
        />
        <Route path="/inicio" element={<Navigate to="/" replace />} />

        {/* One persistent dashboard route prevents chart/plan remounting on tab changes.
            Contractual gates still protect restricted tab bodies in DashboardHomePage. */}
        <Route
          path="/dashboard/*"
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
              <PlanModuleRoute module="Configurações">
                <TenantAdminPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/visao-geral/:subpage"
          element={
            <PermissionRoute permission="manage_tenant_users">
              <PlanModuleRoute module="Configurações">
                <TenantAdminPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/prefeitura/organograma"
          element={
            <PermissionRoute permission="manage_own_profile">
              <MunicipalOrganizationPage />
            </PermissionRoute>
          }
        />
        <Route path="/prefeitura/arrecadacao" element={<PermissionRoute permission="view_collection_settings"><PlanModuleRoute module="Configurações"><CollectionSettingsPage /></PlanModuleRoute></PermissionRoute>} />
        <Route
          path="/prefeitura/processos"
          element={
            <PermissionRoute permission="manage_own_profile">
              <MunicipalProcessRegistryPage />
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
          path="/cadastro-gestao/legislacao"
          element={
            <PermissionRoute permission="manage_own_profile" allowedRoles={URBAN_LEGISLATION_VIEW_ROLES}>
              <ConfiguracoesPage legislationWorkspace />
            </PermissionRoute>
          }
        />
        <Route
          path="/legislacao/gestao"
          element={
            <PermissionRoute permission="manage_own_profile" allowedRoles={URBAN_LEGISLATION_VIEW_ROLES}>
              <Navigate to="/cadastro-gestao/legislacao" replace />
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
              <PlanModuleRoute module="Acesso externo">
                <OwnerPortalPage />
              </PlanModuleRoute>
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
          path="/externo/habite-se"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ProtocolarProjetoPage mode="habite-se" />
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
          path="/externo/controle/em-andamento"
          element={
            <PermissionRoute permission="submit_processes">
              <PlanModuleRoute module="Acesso externo">
                <ExternalDraftsPage />
              </PlanModuleRoute>
            </PermissionRoute>
          }
        />
        <Route
          path="/externo/controle/rascunhos"
          element={<Navigate to="/externo/controle/em-andamento" replace />}
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
          path="/processos/:processId/documentos/:documentId/visualizar"
          element={
            <PermissionRoute permission="view_own_processes">
              <DocumentViewerPage />
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
    </Suspense>
  );
};
