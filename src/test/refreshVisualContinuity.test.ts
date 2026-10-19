import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5, logout and topbar visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "src/hooks/useAuthGateway.tsx"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const bootstrap = readFileSync(resolve(process.cwd(), "src/hooks/useAppBootstrap.tsx"), "utf8");
  const platformData = readFileSync(resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8");
  const planEntitlements = readFileSync(resolve(process.cwd(), "src/hooks/usePlanEntitlements.ts"), "utf8");
  const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
  const analystDesk = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
  const urbanChecklist = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
  const habiteInspection = readFileSync(resolve(process.cwd(), "src/components/platform/HabiteSeInspectionPanel.tsx"), "utf8");
  const habitePermit = readFileSync(resolve(process.cwd(), "src/components/platform/HabiteSePermitPanel.tsx"), "utf8");
  const stableStatusMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261019025000_habite_se_completion_via_stable_status_rpc.sql"), "utf8");
  const assigneeIntegrityMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261019035500_fix_analysis_assignee_profile_integrity.sql"), "utf8");
  const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("has no refresh shell, DOM clone, preboot screen or frozen snapshot", () => {
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("snapshot.html");
    expect(html).not.toContain("snapshot.svg");
    expect(html).not.toContain("sigapro-snapshot-page");
    expect(html).not.toContain("data-sigapro-document-preboot");
    expect(main).not.toContain("buildRefreshVisualSnapshot");
    expect(main).not.toContain("collectSnapshotCss");
    expect(main).not.toContain("sigapro-app-stable");
  });

  it("never paints an empty root during F5", () => {
    expect(html).not.toContain("@view-transition");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("sigapro-soft-refresh");
    expect(html).toContain('type="module"');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).toContain('blocking="render"');
    expect(html).toContain('fetchpriority="high"');
    expect(main).toContain('import { flushSync } from "react-dom"');
    expect(main).toContain("flushSync(() =>");
    expect(main).toContain("root.render(<App />)");
  });

  it("locks background and zoom before first paint and never clears zoom on teardown", () => {
    expect(html).toContain('window.localStorage.getItem("sigapro.last-page-background.v2")');
    expect(html).toContain('window.localStorage.getItem("sigapro-layout-theme.v2")');
    expect(html).toContain('window.localStorage.getItem("sigapro.effective-theme.v2")');
    expect(html).toContain('document.documentElement.style.setProperty("--sig-initial-bg", initialBackground)');
    expect(html).toContain("document.documentElement.style.zoom = initialAppZoom");
    expect(html).toContain('document.documentElement.setAttribute(');
    expect(html).toContain('"data-page-zoom"');
    expect(html).toContain("initialAppZoom");
  });

  it("seeds refresh continuity before React renders so Habite-se never disappears on F5", () => {
    expect(main).toMatch(/persistRefreshContinuity\(\);\s*bootApplication\(\);/);
    expect(main.indexOf("persistRefreshContinuity();")).toBeGreaterThan(-1);
    expect(main.lastIndexOf("persistRefreshContinuity();")).toBeLessThan(
      main.lastIndexOf("bootApplication();") + 1,
    );
  });

  it("treats same-user warm store as visually ready during F5 revalidation", () => {
    expect(platformData).toContain('source: "warm" as const');
    expect(platformData).toContain("contextUserId: warmStore.userId");
    expect(platformData).toContain('source === "warm"');
    expect(planEntitlements).toContain("hasStableCachedSession");
    expect(planEntitlements).toContain("hasStablePlanContext");
    expect(planEntitlements).toContain("explicitIdentityMismatch");
  });

  it("does not show the blocking official-data outage banner when current-user data is already usable", () => {
    expect(portal).toContain("dataReadyForCurrentUser");
    expect(portal).toContain("showBlockingOfficialDataError");
    expect(portal).toContain("dataError &&");
    expect(portal).toContain("!loading &&");
    expect(portal).toContain("!dataReadyForCurrentUser &&");
    expect(portal).toContain("{showBlockingOfficialDataError ? (");
  });

  it("keeps the last verified process model available during a hard refresh", () => {
    expect(processDetail).toContain("sigapro.process-view.v1:");
    expect(processDetail).toContain("readCachedProcessVisual");
    expect(processDetail).toContain("writeCachedProcessVisual");
    expect(processDetail).toContain("const baseProcess = liveProcess ?? cachedProcessVisual");
    expect(processDetail).toContain("const process = useMemo(() =>");
  });

  it("keeps the Habite-se tab mounted while process permissions revalidate on F5", () => {
    expect(processDetail).toContain("const stableProtocolTrackingOnly");
    expect(processDetail).toContain("dataReadyForCurrentUser && !platformDataLoading");
    expect(processDetail).toContain("stableProtocolTrackingOnly && preferredTab");
    expect(processDetail).toContain("stableProtocolTrackingOnly && requested");
    expect(processDetail).toContain("if (!stableProtocolTrackingOnly) return");
    expect(processDetail).toMatch(/dataReadyForCurrentUser\s*&&\s*session\.id !== "unknown"/);
  });

  it("keeps the current Analysis tab visible while the same session revalidates", () => {
    expect(processDetail).toContain("requestedTabForContinuity");
    expect(processDetail).toContain("analysisTabVisible");
    expect(processDetail).toContain('requestedTabForContinuity === "analise"');
    expect(processDetail).toContain("planEntitlements.isResolving");
  });

  it("persists the effective municipal theme so refresh cannot flash another palette", () => {
    expect(portal).toContain("readEffectiveThemeCache");
    expect(portal).toContain('"sigapro.effective-theme.v2"');
    expect(portal).toContain("stableMunicipalityTheme");
    expect(portal).toContain("municipalityLoading ? effectiveThemeCache?.background");
  });

  it("never paints mobile and desktop topbar logos together during F5", () => {
    expect(portal).toContain("isDesktopTopbarViewport");
    expect(portal).toContain('window.matchMedia("(min-width: 1024px)")');
    expect(portal).toContain('data-topbar-brand-viewport="mobile"');
    expect(portal).toContain('data-topbar-viewport="desktop"');
    expect(portal).toContain('display: isDesktopTopbarViewport ? "none" : undefined');
    expect(portal).toContain('display: isDesktopTopbarViewport ? undefined : "none"');
  });

  it("compensates the 85 percent app zoom so the footer logo cannot jump into the initial viewport", () => {
    expect(portal).toContain('data-refresh-layout-stable={focusMode ? "false" : "true"}');
    expect(portal).toContain('minHeight: "117.6470588235vh"');
  });

  it("hydrates analysis checklist synchronously before first paint", () => {
    expect(urbanChecklist).toContain("readInitialChecklistState(key, process, session)");
    expect(urbanChecklist).toContain("useState<AnalysisChecklistState>(() =>");
    expect(urbanChecklist).not.toContain("useState<AnalysisChecklistState>(() => makeInitialState(process, session))");
  });

  it("never dereferences documents or requirement types before the process model exists", () => {
    expect(processDetail).toContain('const canAttachToRequirement = (item: ProcessRecord["requirements"][number])');
    expect(processDetail).toContain('const recoverableDocumentsFingerprint = (process?.documents ?? [])');
    expect(processDetail).not.toContain('const recoverableDocumentsFingerprint = process.documents');
  });

  it("rehydrates an archived detail route by protocol or UUID instead of querying protocol text as a UUID", () => {
    expect(processDetail).toContain("refreshRemoteStore(processId ?? null)");
    expect(processDetail).toContain('query.eq("protocol_number", routeKey)');
    expect(processDetail).toContain('query.eq("id", resolvedProcessId)');
    expect(processDetail).toContain("baseProcess?.id");
  });

  it("prevents analysis ownership from pointing to non-analyst profiles", () => {
    expect(assigneeIntegrityMigration).toContain("role='analista'");
    expect(assigneeIntegrityMigration).toContain("trg_guard_process_analysis_assignee");
    expect(assigneeIntegrityMigration).toContain("new.analysis_assigned_to :=");
  });

  it("renders the same canonical analyst name whenever the assigned profile id is the same", () => {
    expect(analystDesk).toContain("resolveAssignedAnalystName");
    expect(analystDesk).toContain("sessionUsers.find((user) => user.id === profileId)");
    expect(analystDesk).toContain("const currentAnalyst = resolveAssignedAnalystName(process)");
  });

  it("keeps concluded processes visible and archives only per profile", () => {
    expect(processDetail).toContain('status: "deferido"');
    expect(analystDesk).toContain('"concluidos"');
    expect(analystDesk).toContain('"profile_process_archives"');
    expect(analystDesk).toContain("Arquivar da minha lista");
    expect(analystDesk).toContain("Processos concluídos");
  });

  it("keeps the Acompanhamento tab synchronized with the official final state", () => {
    expect(processDetail).toContain('data-process-live-state={process.status}');
    expect(processDetail).toContain('isFinalProcessStatus ? "Concluído" : "Em andamento"');
    expect(processDetail).toContain('data-process-final-milestone="true"');
    expect(processDetail).toContain("Processo concluído");
    expect(processDetail).toContain("intervalMs: 1800");
  });

  it("marks every Habite-se workflow step done after final process status", () => {
    expect(processDetail).toContain('state: isFinalProcessStatus');
    expect(processDetail).toContain('? "done"');
    expect(processDetail).toMatch(/isHabiteSeProcess\s*\? "Concluído"/);
  });

  it("keeps the current process live even when it leaves the active store after archive", () => {
    expect(processDetail).toContain('.from("processes")');
    expect(processDetail).toContain('"id,status,current_department,current_queue,sla_stage,process_checkpoint,archived_at,updated_at"');
    expect(processDetail).toContain("setDirectProcessState");
    expect(processDetail).toContain("setCachedProcessVisual");
    expect(processDetail).toContain("window.setInterval(() => void syncExactProcess(), 1500)");
  });

  it("treats repeated status commands as idempotent instead of surfacing P0001", () => {
    expect(stableStatusMigration).toContain("'already_current',true");
    expect(stableStatusMigration).not.toContain("raise exception 'Processo ja esta neste status'");
  });

  it("hydrates Habite-se inspection from a visual cache before the first paint", () => {
    expect(habiteInspection).toContain("readInspectionVisualCache(process.id, session.id)");
    expect(habiteInspection).toContain("initialVisual?.inspection ?? null");
    expect(habiteInspection).toContain("initialVisual?.checklist ?? emptyChecklist()");
    expect(habiteInspection).toContain("Boolean(initialVisual)");
    expect(habiteInspection).toContain("writeInspectionVisualCache");
  });

  it("hydrates the Habite-se permit from a visual cache before async revalidation", () => {
    expect(habitePermit).toContain("readPermitVisualCache(process.id, session.id)");
    expect(habitePermit).toContain("initialVisual?.permit ?? null");
    expect(habitePermit).toContain("mergeAutomaticPermitForm(process, null, initialVisual?.form)");
    expect(habitePermit).toContain("initialVisual?.signatureState");
    expect(habitePermit).toContain("writePermitVisualCache");
  });

  it("persists process tab authorization per user and process across F5", () => {
    expect(processDetail).toContain("sigapro.process-tab-access.v1");
    expect(processDetail).toContain("readCachedProcessTabAccess");
    expect(processDetail).toContain("writeCachedProcessTabAccess");
    expect(processDetail).toContain("analysisTabVisible");
  });

  it("prevents localhost project crossing and transform waterfalls", () => {
    expect(viteConfig).toContain('host: "localhost"');
    expect(viteConfig).toContain('dns.setDefaultResultOrder("verbatim")');
    expect(viteConfig).toContain("strictPort: true");
    expect(viteConfig).toContain('"/api/dev-source"');
    expect(viteConfig).toContain("[SIGAPRO][DEV SOURCE]");
    expect(viteConfig).toContain("warmup:");
    expect(viteConfig).toContain('"./src/pages/saas/ProcessDetailPage.tsx"');
  });

  it("loads critical process styles before the first React paint", () => {
    expect(html).toContain('href="/src/components/platform/ProcessIdentityPanel.css"');
    expect(html).toContain('href="/src/components/platform/AnalysisReadinessPanel.css"');
  });

  it("clears the local identity before navigation/network so account switching stays isolated", () => {
    const handleIndex = portal.indexOf('const handleSignOut = async');
    const handleBlock = portal.slice(handleIndex, handleIndex + 1000);
    expect(handleBlock).toContain("const signOutTask = signOut();");
    expect(handleBlock.indexOf("navigate(destination, { replace: true });")).toBeGreaterThan(
      handleBlock.indexOf("const signOutTask = signOut();"),
    );
    expect(handleBlock).toContain("await signOutTask;");
    expect(bootstrap).toContain("setAuthUserId(null);");
    expect(bootstrap).toContain("setAuthResolved(true);");
    expect(bootstrap).toContain("setLoading(false);");
    expect(bootstrap).toContain("manualSignInRef.current || explicitSignOutRef.current");
    expect(auth).not.toContain('window.location.replace("/acesso")');
    expect(portal).not.toContain("window.location.replace(destination)");
  });

  it("hard-anchors marker and theme panels below their own topbar buttons at 85 percent zoom", () => {
    expect(portal).toContain('sig-topbar-local-popper sig-marker-anchor relative');
    expect(portal).toContain('sig-topbar-local-popper sig-theme-anchor relative');
    expect(portal).toContain("portal={false}");
    expect(css).toContain("SIGAPRO TOPBAR LOCAL ANCHOR 2026-10-14");
    expect(css).toContain(".sig-topbar-local-popper [data-radix-popper-content-wrapper]");
    expect(css).toContain(".sig-topbar-local-popper .sig-marker-panel");
    expect(css).toContain(".sig-topbar-local-popper .sig-theme-panel");
    expect(css).toContain("left: 50% !important");
    expect(css).toContain("transform: translateX(-50%) !important");
  });
});
