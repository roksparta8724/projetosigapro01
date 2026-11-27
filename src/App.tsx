import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
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




import { AppErrorBoundary } from "@/components/platform/AppErrorBoundary";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";
import { SeamlessRefreshGate } from "@/components/platform/SeamlessRefreshGate";
import { TenantNotFoundPage } from "@/pages/saas/TenantNotFoundPage";
import { captureOwnerPreviewAccess } from "@/lib/ownerInvitation";
import { shouldShowPublicLanding } from "@/lib/tenant";



























import { URBAN_LEGISLATION_VIEW_ROLES } from "@/lib/urbanLegislationAccess";


import { NotFoundPage } from "@/pages/saas/NotFoundPage";






// Páginas de acesso/marketing não pertencem ao caminho crítico de um F5
// em Prefeitura, Dashboard ou Mesa Técnica. Mantê-las no bundle inicial
// atrasava o primeiro quadro do módulo real em cada recarga completa.
const AcessoPage = lazy(() => import("@/pages/saas/AcessoPage").then((module) => ({ default: module.AcessoPage })));
const LandingPage = lazy(() => import("@/pages/saas/LandingPage").then((module) => ({ default: module.LandingPage })));
const RecuperarSenhaPage = lazy(() => import("@/pages/saas/RecuperarSenhaPage").then((module) => ({ default: module.RecuperarSenhaPage })));
const CriarContaPage = lazy(() => import("@/pages/saas/CriarContaPage").then((module) => ({ default: module.CriarContaPage })));
const PublicPlansPage = lazy(() => import("@/pages/saas/PublicPlansPage").then((module) => ({ default: module.PublicPlansPage })));
const PublicSignatureVerificationPage = lazy(() => import("@/pages/saas/PublicSignatureVerificationPage").then((module) => ({ default: module.PublicSignatureVerificationPage })));

function preloadCurrentPublicRoute(pathname: string): Promise<unknown> | null {
  if (pathname === "/" || pathname === "/inicio" || pathname === "/apresentacao") return import("@/pages/saas/LandingPage");
  if (pathname === "/acesso") return import("@/pages/saas/AcessoPage");
  if (pathname === "/criar-conta") return import("@/pages/saas/CriarContaPage");
  if (pathname === "/recuperar-senha") return import("@/pages/saas/RecuperarSenhaPage");
  if (pathname === "/planos-publicos") return import("@/pages/saas/PublicPlansPage");
  if (pathname === "/verificar-assinatura" || pathname.startsWith("/v/")) return import("@/pages/saas/PublicSignatureVerificationPage");
  return null;
}

// Keep the institutional frame code-split out of the anonymous landing/login;
// when authenticated it stays mounted across all ordinary SIGAPRO modules.
const PersistentPortalFrameLayout = lazy(() =>
  import("@/components/platform/PortalFrame").then((module) => ({
    default: module.PersistentPortalFrameLayout,
  })),
);

// Lazy import isolates heavy analytics, PDFs and operational pages from /acesso.
// Component identity stays stable: never define lazy routes inside AppRoutes.
const MasterAdminPage = lazy(() => import("@/pages/saas/MasterAdminPage").then((module) => ({ default: module.MasterAdminPage })));
const PlatformStaffCreationPage = lazy(() => import("@/pages/saas/PlatformStaffCreationPage").then((module) => ({ default: module.PlatformStaffCreationPage })));
const TenantAdminPage = lazy(() => import("@/pages/saas/TenantAdminPage").then((module) => ({ default: module.TenantAdminPage })));
const MunicipalItPage = lazy(() => import("@/pages/saas/MunicipalItPage").then(module=>({default:module.MunicipalItPage})));
const MunicipalStaffCreationPage = lazy(() => import("@/pages/saas/MunicipalStaffCreationPage").then((module) => ({ default: module.MunicipalStaffCreationPage })));
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

// Eagerly request only the current private route chunk, in parallel with the
// authenticated bootstrap. No protected React component is mounted by preload.
// It prevents a second lazy download gap after the session has been resolved.
function preloadCurrentInternalRoute(pathname: string): Promise<unknown> | null {
  if (pathname.startsWith("/dashboard")) return import("@/pages/saas/DashboardHomePage");
  if (pathname.startsWith("/master/planos")) return import("@/pages/saas/MasterPlansPage");
  if (pathname.startsWith("/master/equipe/novo")) return import("@/pages/saas/PlatformStaffCreationPage");
  if (pathname.startsWith("/master")) return import("@/pages/saas/MasterAdminPage");
  // The filmed screen /prefeitura/arrecadacao must prefetch its real chunk, not TenantAdminPage.
  if (pathname.startsWith("/prefeitura/arrecadacao")) return import("@/pages/saas/CollectionSettingsPage");
  if (pathname.startsWith("/prefeitura/analise")) return import("@/pages/saas/AnalystDeskPage");
  if (pathname.startsWith("/prefeitura/protocolos/novo")) return import("@/pages/saas/ProtocolarProjetoPage");
  if (pathname.startsWith("/prefeitura/protocolos")) return import("@/pages/saas/ProtocolDeskPage");
  if (pathname.startsWith("/prefeitura/financeiro/protocolos")) return import("@/pages/saas/FinanceProtocolsPage");
  if (pathname.startsWith("/prefeitura/financeiro/iptu")) return import("@/pages/saas/IptuDeskPage");
  if (pathname.startsWith("/prefeitura/financeiro")) return import("@/pages/saas/FinanceDeskPage");
  if (pathname.startsWith("/prefeitura/ti")) return import("@/pages/saas/MunicipalItPage");
  if (pathname.startsWith("/prefeitura/usuarios/novo")) return import("@/pages/saas/MunicipalStaffCreationPage");
  if (pathname.startsWith("/prefeitura/organograma")) return import("@/pages/saas/MunicipalOrganizationPage");
  if (pathname.startsWith("/prefeitura/processos")) return import("@/pages/saas/MunicipalProcessRegistryPage");
  if (pathname.startsWith("/prefeitura")) return import("@/pages/saas/TenantAdminPage");
  if (/\/processos\/[^/]+\/documentos\/[^/]+\/visualizar$/.test(pathname)) return import("@/pages/saas/DocumentViewerPage");
  if (/\/processos\/[^/]+\/documentos\/[^/]+\/analisar$/.test(pathname)) return import("@/pages/saas/DocumentAnalysisPage");
  if (pathname.startsWith("/processos/")) return import("@/pages/saas/ProcessDetailPage");
  if (pathname === "/externo/controle/em-andamento" || pathname === "/externo/controle/rascunhos") return import("@/pages/saas/ExternalDraftsPage");
  if (pathname.startsWith("/externo/controle")) return import("@/pages/saas/ExternalProcessControlPage");
  if (pathname === "/externo/protocolar" || pathname === "/externo/habite-se") return import("@/pages/saas/ProtocolarProjetoPage");
  if (pathname.startsWith("/externo/pagamentos")) return import("@/pages/saas/ExternalPaymentsPage");
  if (pathname.startsWith("/externo/historico")) return import("@/pages/saas/ExternalHistoryPage");
  if (pathname.startsWith("/externo/mensagens")) return import("@/pages/saas/ExternalMessagesPage");
  if (pathname.startsWith("/externo")) return import("@/pages/saas/ExternalPortalPage");
  if (pathname === "/proprietario") return import("@/pages/saas/OwnerPortalPage");
  if (pathname === "/assistente-ia") return import("@/pages/saas/AiAssistantPage");
  if (pathname === "/legislacao/zoneamento") return import("@/pages/saas/ZoningPage");
  if (pathname === "/legislacao") return import("@/pages/saas/LegislationPage");
  if (pathname === "/cadastro-gestao/legislacao" || pathname === "/legislacao/gestao") return import("@/pages/saas/ConfiguracoesPage");
  if (pathname.startsWith("/configuracoes")) return import("@/pages/saas/ConfiguracoesPage");
  if (pathname.startsWith("/perfil")) return import("@/pages/saas/PerfilPage");
  if (pathname.startsWith("/notificacoes")) return import("@/pages/saas/NotificationsPage");
  if (pathname.startsWith("/historico")) return import("@/pages/saas/MovementHistoryPage");
  if (pathname.startsWith("/buscar")) return import("@/pages/saas/GlobalSearchPage");
  return null;
}

/**
 * First real paint on a full document navigation:
 * Page chunks were prefetched but the shared institutional layout was NOT.
 * That layout was downloaded only when React reached the lazy protected route,
 * producing a second serialized idle interval with a pale empty root.
 * Fetch only the public JavaScript module, never user/process data. The
 * original PermissionRoute and session checks remain solely authoritative.
 */
function isWorkspaceBootPath(pathname: string): boolean {
  if (/\/processos\/[^/]+\/documentos\/[^/]+\/(visualizar|analisar)$/.test(pathname)) return false;
  return /^\/(dashboard(?:\/|$)|prefeitura(?:\/|$)|master(?:\/|$)|processos(?:\/|$)|externo(?:\/|$)|proprietario(?:\/|$)|perfil(?:\/|$)|configuracoes(?:\/|$)|notificacoes(?:\/|$)|historico(?:\/|$)|buscar(?:\/|$)|legislacoes(?:\/|$)|zoneamento(?:\/|$)|legislacao(?:\/|$)|cadastro-gestao(?:\/|$)|assistente-ia(?:\/|$))/.test(pathname);
}

if (typeof window !== "undefined") {
  captureOwnerPreviewAccess();
  // Import the REAL persistent frame and REAL route in parallel; no fake shell,
  // DOM snapshot, cached protected state or change to routing/authorization.
  const initialPath = window.location.pathname;
  if (isWorkspaceBootPath(initialPath)) {
    void import("@/components/platform/PortalFrame").catch(() => undefined);
    void preloadCurrentInternalRoute(initialPath)?.catch(() => undefined);
  } else if (/\/processos\/[^/]+\/documentos\/[^/]+\/(visualizar|analisar)$/.test(initialPath)) {
    // Standalone document route: warm only its own code, not the portal frame.
    void preloadCurrentInternalRoute(initialPath)?.catch(() => undefined);
  } else {
    void preloadCurrentPublicRoute(initialPath)?.catch(() => undefined);
  }
}

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
                      <SeamlessRefreshGate />
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
  const canShowPublicLanding = shouldShowPublicLanding(bootstrap.resolution);
  const pathname = location.pathname;

  useLayoutEffect(() => {
    document.documentElement.style.zoom = "1";
    document.body.style.zoom = "1";
    document.documentElement.dataset.pageZoom = "100";
  }, []);

  useEffect(() => {
    // Navigation-prefetch avoids a blank Suspense window while switching to a lazy module.
    // Only JavaScript chunks are requested; no protected data or auth decision is cached.
    const prefetchLink = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== window.location.origin) return;
      void preloadCurrentInternalRoute(anchor.pathname)?.catch(() => undefined);
    };
    document.addEventListener("pointerover", prefetchLink, { passive: true });
    document.addEventListener("pointerdown", prefetchLink, { passive: true });
    document.addEventListener("focusin", prefetchLink);
    // Topbar buttons navigate programmatically, without a corresponding <a> href.
    // Warm utility route chunks after the first paint, never protected data.
    const warmUtilityRoutes = window.setTimeout(() => {
      void Promise.allSettled([
        import("@/pages/saas/NotificationsPage"),
        import("@/pages/saas/MovementHistoryPage"),
        import("@/pages/saas/GlobalSearchPage"),
      ]);
    }, 1800);
    return () => {
      window.clearTimeout(warmUtilityRoutes);
      document.removeEventListener("pointerover", prefetchLink);
      document.removeEventListener("pointerdown", prefetchLink);
      document.removeEventListener("focusin", prefetchLink);
    };
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
    <Suspense fallback={<SecureRoutePending surface="route" title="Abrindo módulo do SIGAPRO" detail="Aguardando validação da página solicitada." />}>
      <Routes>
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

        {/* One institutional layout remains mounted across dashboards, departments,
            process lists, profile, history and exterior portal pages.
            Existing PermissionRoute and PlanModuleRoute checks stay on EACH route. */}
        <Route element={<PersistentPortalFrameLayout />}>
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
          path="/master/equipe/novo"
          element={
            <PermissionRoute permission="view_master_dashboard">
              <PlatformStaffCreationPage />
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
          path="/prefeitura/usuarios/novo"
          element={
            <PermissionRoute permission="manage_tenant_users">
              <PlanModuleRoute module="Configurações">
                <MunicipalStaffCreationPage />
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
        <Route path="/prefeitura/ti" element={<PermissionRoute permission="manage_own_profile" allowedRoles={["prefeitura_admin","prefeitura_supervisor","analista","financeiro","fiscal","setor_intersetorial"]}><MunicipalItPage /></PermissionRoute>} />
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
          path="/processos/:processId"
          element={
            <PermissionRoute permission="view_own_processes">
              <ProcessDetailPage />
            </PermissionRoute>
          }
        />
        </Route>
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
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};
