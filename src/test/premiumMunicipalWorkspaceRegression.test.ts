import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("premium municipal workspace regression", () => {
  const organization = read("src/components/platform/MunicipalOrganizationChart.tsx");
  const organizationPage = read("src/pages/saas/MunicipalOrganizationPage.tsx");
  const tenantAdmin = read("src/pages/saas/TenantAdminPage.tsx");
  const shell = read("src/components/platform/PortalFrame.tsx");
  const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
  const analyst = read("src/pages/saas/AnalystDeskPage.tsx");
  const finance = read("src/pages/saas/FinanceDeskPage.tsx");
  const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
  const main = read("src/main.tsx");
  const internalTabs = read("src/components/platform/InternalTabs.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const documentViewer = read("src/pages/saas/DocumentViewerPage.tsx");
  const documentAnalysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
  const fileDropZone = read("src/components/platform/FileDropZone.tsx");
  const institutionalLogo = read("src/components/platform/InstitutionalLogo.tsx");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const planModuleRoute = read("src/components/platform/PlanModuleRoute.tsx");
  const platformData = read("src/hooks/usePlatformData.tsx");
  const platform = read("src/lib/platform.ts");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const organizationResolver = read("src/lib/municipalOrganization.ts");
  const organizationHook = read("src/hooks/useMunicipalOrganization.ts");
  const planEntitlements = read("src/hooks/usePlanEntitlements.ts");
  const viteConfig = read("vite.config.ts");
  const hierarchyMigration = read("neon/migrations/20261014041000_municipal_organization_hierarchy.sql");
  const publicOrganizationMigration = read("neon/migrations/20261014042000_public_municipal_organization.sql");
  const r2Client = read("src/integrations/r2/client.ts");

  it("renders the organogram from the real parent-child hierarchy", () => {
    expect(organization).toContain("item.parentDepartmentId === department.id");
    expect(organization).toContain("!item.parentDepartmentId || !activeIds.has(item.parentDepartmentId)");
    expect(organization).toContain("unidade superior cadastrada no banco");
    expect(organization).toContain("{department.name}");
    expect(organization).toContain("getMunicipalDepartmentAcronym");
    expect(organization).toContain("Vínculo circular detectado");
    expect(organization).not.toContain("Estrutura institucional por siglas.");
  });

  it("prevents invalid self/descendant parent selections in organogram editing", () => {
    expect(tenantAdmin).toContain("getDescendantDepartmentIds");
    expect(tenantAdmin).toContain("forbiddenParentDepartmentIds");
    expect(tenantAdmin).toContain("availableParentDepartments");
    expect(tenantAdmin).toContain("Departamentos e setores ficam visualmente dentro da unidade superior cadastrada");
  });

  it("uses the authenticated municipality first for municipal employees", () => {
    expect(organizationPage).toContain(
      "session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null",
    );
    expect(tenantAdmin).toContain(
      "session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null",
    );
  });

  it("never labels internal municipal users by external professional type", () => {
    expect(shell).toContain("const externalSessionRole");
    expect(shell).toContain("session.profileLabel?.trim() || session.title?.trim() || roleLabels[session.role]");
    expect(shell).toContain("const itemIsExternal");
    expect(shell).toContain("item.profileLabel?.trim() || item.title?.trim() || roleLabels[item.role]");
  });

  it("treats real municipal department assignment as an internal role", () => {
    expect(backend).toContain("const isExternalStoredRole");
    expect(backend).toContain("const isExternalDepartment");
    expect(backend).toContain("isExternalStoredRole && isExternalDepartment");
    expect(backend).toContain("/(urbanismo|obras|engenharia|planejamento|licenciamento|aprovacao)/");
    expect(backend).toContain("/(finance|financa|fazenda|tesour|arrecad|tribut)/");
    expect(backend).toContain("/(fiscaliz|postura)/");
    expect(backend).toContain('return "setor_intersetorial"');
  });

  it("requires and persists municipal department when linking internal staff", () => {
    expect(tenantAdmin).toContain("Departamento no organograma *");
    expect(tenantAdmin).toContain("Selecione o departamento do funcionário no organograma");
    expect(tenantAdmin).toContain("resolveMunicipalRoleFromDepartment");
    expect(tenantAdmin).toContain("departmentId: selectedDepartment?.id ?? null");
    expect(platform).toContain("departmentId?: string | null");
    expect(platform).toContain("profileLabel?: string");
    expect(platformData).toContain("assignRemoteProfileDepartment");
    expect(platformData).not.toContain("department: saved.title");
    expect(backend).toContain("profileLabel: input.profileLabel ??");
  });

  it("places Protocol under Administration in the administrative sidebar", () => {
    expect(shell).toContain("const protocolAdministrativeItem");
    expect(shell).toContain('item.to === "/prefeitura/protocolos"');
    expect(shell).toContain("...(protocolAdministrativeItem ? [protocolAdministrativeItem] : [])");
    expect(shell).toContain('item.to !== "/prefeitura/protocolos"');
  });

  it("uses one shared municipal organogram across the global shell", () => {
    expect(shell).toContain('secretaria: "Administração", diretoria: "Protocolo"');
    expect(shell).toContain('secretaria: "Urbanismo e Obras", diretoria: "Análise Urbanística"');
    expect(shell).toContain('secretaria: "Financeiro", diretoria: "Financeiro"');
    expect(shell).toContain("useMunicipalOrganization");
    expect(shell).not.toContain("listRemoteMunicipalDepartments");
    expect(shell).toContain("resolveMunicipalUnitIdentity");
    expect(shell).toContain("Organograma municipal");
    expect(shell).toContain("Vínculo institucional confirmado no organograma");
    expect(shell).toContain("Estrutura institucional da Prefeitura");
    expect(shell).toContain("portalOrganizationIdentity.codePath");
    expect(shell).toContain("const institutionFooterUnit");
    expect(shell).toContain("{institutionFooterUnit}");
  });

  it("keeps the official platform loader free from missing department normalizers", () => {
    expect(backend).toContain('import { normalizeMunicipalUnit } from "@/lib/municipalOrganization";');
    expect(backend).toContain("normalizeMunicipalUnit(department.name)");
    expect(backend).not.toContain("normalizeDepartmentIdentity(");
  });

  it("renders the municipal organogram context globally across internal pages", () => {
    expect(shell).toContain("useMunicipalOrganization()");
    expect(shell).toContain("showPortalOrganizationContext");
    expect(shell).toContain("Organograma municipal");
    expect(shell).toContain("portalOrganizationIdentity.codePath");
    expect(shell).toContain("portalOrganizationIdentity.breadcrumb");
  });

  it("shows every real process guide with paid and open financial status", () => {
    expect(processDetail).toContain("Guias de pagamento do processo");
    expect(processDetail).toContain("paidPaymentGuides");
    expect(processDetail).toContain("openPaymentGuides");
    expect(processDetail).toContain("Paga / compensada");
    expect(processDetail).toContain("Em aberto");
    expect(processDetail).toContain("paidAt");
    expect(backend).toContain("paidAt: guide.paid_at");
  });

  it("shows organogram codes and hierarchy on process dispatches", () => {
    expect(organizationResolver).toContain("resolveMunicipalUnitIdentity");
    expect(organizationResolver).toContain("codePath");
    expect(organizationResolver).toContain("breadcrumb");
    expect(processDetail).toContain("currentOrganizationIdentity.codePath");
    expect(processDetail).toContain("protocolOrganizationIdentity.codePath");
    expect(processDetail).toContain("analysisOrganizationIdentity.codePath");
    expect(processDetail).toContain("destinationIdentity.codePath");
    expect(processDetail).toContain("originIdentity.codePath");
    expect(processDetail).toContain("Organograma municipal sincronizado");
    expect(processDetail).toContain("Selecionar unidade de destino");
  });

  it("loads the organogram through profile-first RPCs for internal and external viewers", () => {
    expect(backend).toContain('db.rpc("list_internal_municipal_departments_v1"');
    expect(backend).toContain('db.rpc("list_public_municipal_departments_v1"');
    expect(backend).not.toContain('db.rpc("list_municipal_departments_v2"');
  });

  it("shows the organogram unit code on every internal staff profile and account identity", () => {
    expect(platform).toContain("departmentId?: string | null");
    expect(platform).toContain("departmentCode?: string");
    expect(backend).toContain("departmentCode: departmentRecord?.code ??");
    expect(tenantAdmin).toContain("const departmentCode");
    expect(tenantAdmin).toContain('departmentCode || "SEM LOTAÇÃO"');
    expect(tenantAdmin).toContain("{session.departmentCode}");
    expect(shell).toContain("item.departmentCode?.trim()");
    expect(shell).toContain("{session.departmentCode}");
  });

  it("shows the municipal organogram globally across internal and external portal pages", () => {
    expect(shell).toContain("useMunicipalOrganization()");
    expect(shell).toContain("const showPortalOrganizationContext");
    expect(shell).toContain("Boolean(activeInstitutionId)");
    expect(shell).toContain("Organograma municipal");
    expect(shell).toContain("Estrutura pública sincronizada");
    expect(shell).toContain("portalOrganizationIdentity.codePath");
  });

  it("uses separate profile-first RPCs for internal and sanitized external organogram access", () => {
    expect(backend).toContain("export async function listRemotePublicMunicipalDepartments");
    expect(backend).toContain('db.rpc("list_internal_municipal_departments_v1"');
    expect(backend).toContain('db.rpc("list_public_municipal_departments_v1"');
    expect(backend).not.toContain('db.rpc("list_municipal_departments_v1"');
  });

  it("never leaves localhost indefinitely on municipal access validation when backend env is missing", () => {
    expect(planModuleRoute).toContain("hasBackendEnv");
    expect(planModuleRoute).toContain("Ambiente local incompleto");
    expect(planModuleRoute).toContain("Conexão oficial do SIGAPRO não configurada neste localhost");
    expect(planModuleRoute.indexOf("if (!hasBackendEnv)")).toBeLessThan(
      planModuleRoute.indexOf("if (entitlements.isResolving)"),
    );
  });

  it("keeps operational desks on premium card surfaces", () => {
    expect(protocol).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.055)]");
    expect(protocol).toContain("rounded-[22px]");
    expect(analyst).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.055)]");
    expect(finance).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.055)]");
  });

  it("never fabricates municipal PIX or barcode data in finance subpages", () => {
    expect(financeProtocols).not.toContain("function buildBarcodeValue");
    expect(financeProtocols).not.toContain(".padEnd(44");
    expect(financeProtocols).not.toContain("const pixPayload");
    expect(financeProtocols).not.toContain("PIX copia e cola");
    expect(financeProtocols).toContain('linhaDigitavel: ""');
    expect(financeProtocols).toContain('codigoBarras: ""');
    expect(financeProtocols).toContain("Chave PIX institucional cadastrada");
    expect(financeProtocols).toContain("Nenhum PIX oficial foi configurado");
  });

  it("keeps F5 native and preserves tabs in the URL without scroll traps", () => {
    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("window.scrollTo");
    expect(main).not.toContain("persistVisualSnapshot");
    expect(main).not.toContain("requestAnimationFrame(waitForStableFrame)");
    expect(internalTabs).toContain("preventScrollReset: true");
    expect(internalTabs).toContain('urlParam = "secao"');
  });

  it("keeps document uploads stable and opens documents in dedicated browser tabs", () => {
    expect(fileDropZone).not.toContain("animate-pulse");
    expect(fileDropZone).not.toContain("animate-bounce");
    expect(fileDropZone).toContain("transition-colors duration-150");
    expect(processDetail).toContain('window.open(viewerUrl, "_blank", "noopener,noreferrer")');
    expect(processDetail).toContain('window.open(analysisUrl, "_blank", "noopener,noreferrer")');
  });

  it("reads existing R2 documents from the official signed API on localhost without copying secrets", () => {
    expect(r2Client).toContain('const officialReadApiBase = "https://sigapromunicipal.com.br"');
    expect(r2Client).toContain("function buildReadApiUrl");
    expect(r2Client).toContain('buildReadApiUrl("/api/r2-sign-get")');
    expect(r2Client).toContain('buildReadApiUrl("/api/r2-list-user-files")');
    expect(r2Client).toContain('fetch(buildApiUrl("/api/r2-upload")');
    expect(r2Client).toContain('fetch(buildApiUrl("/api/r2-delete")');
  });

  it("never traps plan validation forever when the official store returns a terminal error", () => {
    expect(planEntitlements).toContain("const planDataPending");
    expect(planEntitlements).toContain("!dataReadyForCurrentUser &&");
    expect(planEntitlements).toContain("!dataError");
    expect(planEntitlements).toContain("const resolutionFailed");
    expect(planModuleRoute).toContain("entitlements.resolutionFailed");
    expect(planModuleRoute).toContain("A página não ficará mais presa em validação");
    expect(planModuleRoute).toContain("Tentar novamente");
  });

  it("keeps local R2 validation scoped to R2 routes only", () => {
    expect(viteConfig).toContain("const isR2ApiRoute");
    expect(viteConfig).toContain('"/api/r2-sign-get"');
    expect(viteConfig).toContain("if (!isR2ApiRoute)");
    expect(viteConfig).toContain("next();");
    expect(viteConfig.indexOf("if (!isR2ApiRoute)")).toBeLessThan(viteConfig.indexOf("assertEnv();"));
  });

  it("uses full organogram internally and a minimal tenant-safe organogram externally", () => {
    expect(organizationHook).toContain('type OrganizationAccessMode = "full" | "public"');
    expect(organizationHook).toContain("listRemoteMunicipalDepartments");
    expect(organizationHook).toContain("listRemotePublicMunicipalDepartments");
    expect(organizationHook).toContain('mode === "full"');
    expect(backend).toContain("listRemotePublicMunicipalDepartments");
    expect(hierarchyMigration).toContain("public.current_profile_id()");
    expect(hierarchyMigration).toContain("p.role::text not in");
    expect(publicOrganizationMigration).toContain("list_public_municipal_departments_v1");
    expect(publicOrganizationMigration).not.toContain("description text");
    expect(publicOrganizationMigration).not.toContain("email text");
    expect(publicOrganizationMigration).not.toContain("phone text");
    expect(publicOrganizationMigration).toContain("public.has_process_access");
  });

  it("keeps organogram identity visible in focused document workspaces through the shared loader", () => {
    expect(documentViewer).toContain("useMunicipalOrganization");
    expect(documentViewer).not.toContain("listRemoteMunicipalDepartments");
    expect(documentViewer).toContain("resolveMunicipalUnitIdentity");
    expect(documentViewer).toContain("organizationIdentity.codePath");
    expect(documentAnalysis).toContain("useMunicipalOrganization");
    expect(documentAnalysis).not.toContain("listRemoteMunicipalDepartments");
    expect(documentAnalysis).toContain("resolveMunicipalUnitIdentity");
    expect(documentAnalysis).toContain("organizationIdentity.codePath");
  });

  it("keeps institutional logos fully contained instead of stretching or cropping", () => {
    expect(institutionalLogo).toContain("object-contain object-center");
    expect(institutionalLogo).not.toContain("object-cover");
  });
});
