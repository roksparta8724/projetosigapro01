import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthGatewayProvider } from "@/hooks/useAuthGateway";
import { PlatformSessionProvider } from "@/hooks/usePlatformSession";
import { PlatformDataProvider } from "@/hooks/usePlatformData";
import { MunicipalityProvider } from "@/hooks/useMunicipality";
import { PermissionRoute } from "@/components/platform/PermissionRoute";
import { AcessoPage } from "@/pages/saas/AcessoPage";
import { LandingPage } from "@/pages/saas/LandingPage";
import { MasterAdminPage } from "@/pages/saas/MasterAdminPage";
import { TenantAdminPage } from "@/pages/saas/TenantAdminPage";
import { AnalystDeskPage } from "@/pages/saas/AnalystDeskPage";
import { FinanceDeskPage } from "@/pages/saas/FinanceDeskPage";
import { FinanceProtocolsPage } from "@/pages/saas/FinanceProtocolsPage";
import { ProtocolDeskPage } from "@/pages/saas/ProtocolDeskPage";
import { IptuDeskPage } from "@/pages/saas/IptuDeskPage";
import { ExternalPortalPage } from "@/pages/saas/ExternalPortalPage";
import { ProtocolarProjetoPage } from "@/pages/saas/ProtocolarProjetoPage";
import { ProcessDetailPage } from "@/pages/saas/ProcessDetailPage";
import { PerfilPage } from "@/pages/saas/PerfilPage";
import { ConfiguracoesPage } from "@/pages/saas/ConfiguracoesPage";
import { NotificationsPage } from "@/pages/saas/NotificationsPage";
import { MovementHistoryPage } from "@/pages/saas/MovementHistoryPage";
import { LegislationPage } from "@/pages/saas/LegislationPage";
import { NotFoundPage } from "@/pages/saas/NotFoundPage";
import { RecuperarSenhaPage } from "@/pages/saas/RecuperarSenhaPage";
import { CriarContaPage } from "@/pages/saas/CriarContaPage";
import { ClientePortalPage } from "@/pages/saas/ClientePortalPage";
import { AppErrorBoundary } from "@/components/platform/AppErrorBoundary";
import { ScrollToTop } from "@/components/platform/ScrollToTop";

const App = () => {
  return (
    <AuthGatewayProvider>
      <PlatformDataProvider>
        <PlatformSessionProvider>
          <MunicipalityProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ScrollToTop />
                <AppErrorBoundary>
                  <Routes>
                <Route path="/" element={<Navigate to="/acesso" replace />} />
                <Route path="/cliente/:tenantSlug" element={<ClientePortalPage />} />
                <Route path="/acesso" element={<AcessoPage />} />
                <Route path="/criar-conta" element={<CriarContaPage />} />
                <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
                <Route path="/apresentacao" element={<LandingPage />} />
                <Route path="/inicio" element={<Navigate to="/acesso" replace />} />
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
                  path="/externo/protocolar"
                  element={
                    <PermissionRoute permission="submit_processes">
                      <ProtocolarProjetoPage />
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
                </AppErrorBoundary>
              </BrowserRouter>
            </TooltipProvider>
          </MunicipalityProvider>
        </PlatformSessionProvider>
      </PlatformDataProvider>
    </AuthGatewayProvider>
  );
};

export default App;
