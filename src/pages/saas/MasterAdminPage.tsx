import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Copy, CreditCard, Landmark, Network, PencilLine, Plus, Settings2, ShieldAlert, ShieldPlus, Trash2, Undo2, UserX, Users2, Workflow, Zap } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveMasterWorkspaceScope, masterWorkspaceSearch, resolveMasterFormMode } from "@/lib/masterWorkspaceScope";
import { MunicipalMaintenancePanel } from "@/components/platform/MunicipalMaintenancePanel";
import { AlertCard } from "@/components/platform/AlertCard";
import { MetricCard } from "@/components/platform/MetricCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageHero } from "@/components/platform/PageHero";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { MasterUserGovernance, isSigaproPlatformInstitution } from "@/components/platform/MasterUserGovernance";
import "@/styles/sigapro-master-workspace-premium-20261124.css";
import { CompactPortfolioRegistry } from "@/components/platform/CompactPortfolioRegistry";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";
import { readMunicipalContractQuote, reconcileInstitutionCommercialPlans, summarizeMasterCommercialContracts } from "@/lib/masterCommercialContract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlanCapacityCard } from "@/components/platform/PlanCapacityCard";
import { usePlanCapacityLive } from "@/hooks/usePlanCapacityLive";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { backendClient, hasBackendEnv } from "@/integrations/backend/databaseClient";
import { loadMunicipalityCatalog } from "@/integrations/backend/municipality";
import {
  assignRemoteProfileDepartment,
  linkExistingUserToMunicipalityAdmin,
  listRemoteMunicipalDepartments,
  saveRemoteInstitutionSettings,
  upsertRemoteInstitution,
  upsertRemoteMunicipalDepartment,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import { buildTenantFromMunicipalityBundle } from "@/lib/municipality";
import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import { resolveProfileAvatarDisplayUrl } from "@/lib/profileAvatarDisplay";
import { accessLevelLabels, roleLabels, roleSuggestedTitles, type AccountStatus, type Institution, type InstitutionAdminContact, type SessionUser, type UserRole } from "@/lib/platform";

type SignatureMode = "eletronica" | "manual" | "icp_brasil";
type WorkspaceView = "visao-geral" | "carteira" | "cadastro" | "organograma" | "usuarios";
type AdminContactDraft = { id: string; email: string; fullName: string; title: string; accessLevel: 2 | 3 };
const normalizeAdminContactsFromDrafts = (drafts: AdminContactDraft[]): InstitutionAdminContact[] =>
  drafts
    .map((draft) => ({
      email: draft.email.trim().toLowerCase(),
      fullName: draft.fullName.trim(),
      title: draft.title.trim() || roleSuggestedTitles.prefeitura_admin,
      accessLevel: (draft.accessLevel >= 3 ? 3 : 2) as 2 | 3,
    }))
    .filter((draft) => draft.email || draft.fullName);

const emptyTenantForm = { name: "", city: "", state: "", status: "implantacao" as Institution["status"], plan: "", subdomain: "", primaryColor: "#0f3557", accentColor: "#178f78", contractNumber: "", contractStart: "", contractEnd: "", monthlyFee: 0, setupFee: 0, signatureMode: "eletronica" as SignatureMode, clientDeliveryLink: "", secretariat: "", directorate: "", directorPhone: "", directorEmail: "", cnpj: "", phone: "", email: "", site: "", address: "" };
const createAdminDraft = (): AdminContactDraft => ({ id: `admin-${crypto.randomUUID()}`, email: "", fullName: "", title: roleSuggestedTitles.prefeitura_admin, accessLevel: 3 });
const normalizeSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const normalizeSubdomainInput = (value: string) => {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  const withoutProtocol = raw.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const firstLabel = withoutPath.split(".")[0] ?? "";
  return normalizeSlug(firstLabel);
};
const buildTenantLink = (subdomain: string, customDomain?: string) =>
  buildMunicipalityPortalUrl({ subdomain: normalizeSlug(subdomain), customDomain });
const getStatusTone = (status: AccountStatus) => status === "blocked" ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400" : status === "inactive" ? "border-slate-300 bg-slate-100 text-slate-600" : "border-emerald-200 bg-emerald-50 text-emerald-700";
const getStatusLabel = (status: AccountStatus) => status === "blocked" ? "Bloqueado" : status === "inactive" ? "Inativo" : "Ativo";
const getInstitutionBadgeTone = (status: Institution["status"]) => status === "suspenso" ? "border-red-200 bg-red-50 text-red-600 dark:text-red-400" : status === "implantacao" ? "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400" : "border-green-200 bg-green-50 text-green-600 dark:text-green-400";
const getInstitutionStatusLabel = (status: Institution["status"]) => status === "suspenso" ? "Suspensa" : status === "implantacao" ? "Implantação" : "Ativa";
const withTimeout = async <T,>(promise: Promise<T>, ms = 20000) => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error("Tempo limite ao salvar. Verifique a conexão com o banco oficial."));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
};
const explainMasterSaveError = (error: unknown): string => {
  if (error && typeof error === "object") {
    const value = error as { message?: string; details?: string; hint?: string };
    const parts = [value.message, value.details, value.hint].filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    if (parts.length) return parts.join(" · ");
  }
  return error instanceof Error ? error.message : "O banco nao confirmou a operacao.";
};
const withRetry = async <T,>(handler: () => Promise<T>, attempts = 3, baseDelay = 800) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await handler();
    } catch (error) {
      lastError = error;
      if (!/timeout|tempo limite|network|fetch failed|connection reset|ECONNRESET/i.test(explainMasterSaveError(error))) break;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * (attempt + 1)));
      }
    }
  }
  throw lastError;
};
const LEGACY_PENDING_SYNC_STORAGE_KEY = "sigapro:pending-tenant-sync";
const ensureBackendAvailable = async () => {
  if (!backendClient) throw new Error("Banco oficial indisponível.");
  const { error } = await withTimeout<{error?: {message?:string} | null}>(
    backendClient.from("municipalities").select("id").limit(1),
    8000,
  );
  if (error) {
    throw new Error(error.message || "Falha ao conectar no banco oficial.");
  }
};

export function MasterAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, authResolved, authenticatedUserId, authenticatedProfileId } = useAuthGateway();
  const authorizedAvatarViewerId = isAuthenticated && authResolved
    ? (authenticatedUserId || authenticatedProfileId) : null;
  const {
    institutions,
    sessionUsers,
    metrics,
    plans,
    planAssignments,
    upsertInstitution,
    saveInstitutionSettings,
    setInstitutionStatus,
    updateTenantUser,
    setUserAccountStatus,
    deleteUserAccount,
    getInstitutionSettings,
    getInstitutionPlanAssignment,
    saveClientPlanAssignment,
    getUserProfile,
    refreshRemoteStore,
  } = usePlatformData();
  const planCapacity = usePlanCapacityLive(null, { enabled: Boolean(authorizedAvatarViewerId), scopeKey: authorizedAvatarViewerId || "", intervalMs: 8000 });
  const [remoteInstitutions, setRemoteInstitutions] = useState<Institution[]>([]);
  const explicitTenantId = new URLSearchParams(location.search).get("municipio") || "";
  const isCreatingNewInstitution = resolveMasterFormMode(location.search) === "novo";
  const requestedSection = new URLSearchParams(location.search).get("secao");
  const workspaceView: WorkspaceView = ["visao-geral","carteira","cadastro","organograma","usuarios"].includes(requestedSection || "") ? requestedSection as WorkspaceView : "carteira";
  const [visitedRegistries, setVisitedRegistries] = useState({ carteira: workspaceView === "carteira", usuarios: workspaceView === "usuarios" });
  useEffect(() => {
    if (workspaceView === "carteira" || workspaceView === "usuarios") {
      setVisitedRegistries(previous => previous[workspaceView] ? previous : { ...previous, [workspaceView]: true });
    }
  }, [workspaceView]);
  const [form, setForm] = useState(emptyTenantForm);
  const [admins, setAdmins] = useState<AdminContactDraft[]>([createAdminDraft()]);
  const [statusMessage, setStatusMessage] = useState("");
  const [tenantActionMessage, setTenantActionMessage] = useState<Record<string, string>>({});
  const [tenantActionBusyId, setTenantActionBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPlanOnly, setSavingPlanOnly] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [masterDepartments, setMasterDepartments] = useState<MunicipalDepartmentRecord[]>([]);
  const [departmentScopeId, setDepartmentScopeId] = useState("");
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: "",
    unitType: "departamento",
    parentDepartmentId: "",
    description: "",
    email: "",
    phone: "",
  });
  const [assignmentUserId, setAssignmentUserId] = useState("");
  const [assignmentUserSearch, setAssignmentUserSearch] = useState("");
  const [contractCapacityPage, setContractCapacityPage] = useState(1);
  const [assignmentDepartmentId, setAssignmentDepartmentId] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const hydratedEditTenantRef = useRef<string | null>(null);
  const formIdentityRef = useRef("novo");

  useEffect(() => {
    // Remove rascunhos operacionais do fluxo antigo. Prefeituras agora só existem
    // após confirmação do banco oficial.
    window.localStorage.removeItem(LEGACY_PENDING_SYNC_STORAGE_KEY);
  }, []);

  useEffect(() => { let active = true; if (!hasBackendEnv) { setRemoteInstitutions([]); return; } void loadMunicipalityCatalog().then((catalog) => { if (!active) return; const mapped = catalog.map((bundle) => { const fallback = institutions.find((item) => item.id === bundle.municipality?.id) ?? null; return buildTenantFromMunicipalityBundle(bundle.municipality, bundle.branding, bundle.settings, fallback); }).filter((item): item is Institution => Boolean(item)); setRemoteInstitutions(mapped); }).catch(() => { /* Keep the last confirmed catalog on transient refresh failure. */ }); return () => { active = false; }; }, [institutions]);



  const institutionCatalog = useMemo(() => {
    const merged = new Map<string, Institution>();

    institutions.forEach((institution) => {
      merged.set(institution.id, institution);
    });

    remoteInstitutions.forEach((institution) => {
      merged.set(institution.id, institution);
    });

    return reconcileInstitutionCommercialPlans({
      institutions: Array.from(merged.values())
        .filter((item) => !isSigaproPlatformInstitution(item))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
      plans,
      assignments: planAssignments,
      snapshots: planCapacity.loaded && !planCapacity.error ? planCapacity.rows : [],
    });
  }, [institutions, remoteInstitutions, plans, planAssignments, planCapacity.error, planCapacity.loaded, planCapacity.rows]);
  const municipalIds = useMemo(() => new Set(institutionCatalog.map((item) => item.id)), [institutionCatalog]);
  const visibleCapacityRows = useMemo(() =>
    planCapacity.rows.filter((row) => municipalIds.has(row.municipalityId)),
    [planCapacity.rows, municipalIds],
  );
  const capacityPageData = paginateMunicipalItems(visibleCapacityRows, contractCapacityPage, 2);
  const selectedTenantId = resolveMasterWorkspaceScope(explicitTenantId, institutionCatalog);
  const activeTenant = institutionCatalog.find((item) => item.id === selectedTenantId) ?? null;
  useEffect(() => {
    let active = true;
    setDepartmentScopeId("");
    setMasterDepartments([]);
    setAssignmentUserId("");
    setAssignmentDepartmentId("");
    setAssignmentUserSearch("");
    setOrgForm({ name: "", unitType: "departamento", parentDepartmentId: "", description: "", email: "", phone: "" });
    if (!selectedTenantId) {
      return () => { active = false; };
    }
    void listRemoteMunicipalDepartments(selectedTenantId)
      .then((rows) => {
        if (active) { setMasterDepartments(rows); setDepartmentScopeId(selectedTenantId); }
      })
      .catch((error) => {
        if (active) setStatusMessage(error instanceof Error ? error.message : "Não foi possível carregar o organograma da Prefeitura.");
      });
    return () => { active = false; };
  }, [selectedTenantId]);
  const activeQuote = readMunicipalContractQuote({
    municipalityId: selectedTenantId,
    plans,
    assignments: planAssignments,
    snapshots: planCapacity.loaded && !planCapacity.error ? planCapacity.rows : [],
  });
  const activeCommercialPlans = useMemo(
    () => plans.filter((plan) => plan.isActive && plan.isVisibleInMaster),
    [plans],
  );
  const activeTenantUsers = useMemo(
    () => sessionUsers.filter((user) => user.tenantId === selectedTenantId || user.municipalityId === selectedTenantId),
    [selectedTenantId, sessionUsers],
  );
  const matchingAssignmentUsers = useMemo(() => {
    const term = assignmentUserSearch.trim().toLocaleLowerCase("pt-BR");
    const choices = activeTenantUsers
      .filter((user) => !term || [user.name, user.email, user.title, user.department]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term)))
      .slice(0, 50);
    const selected = activeTenantUsers.find((user) => user.id === assignmentUserId);
    return selected && !choices.some((user) => user.id === selected.id)
      ? [selected, ...choices]
      : choices;
  }, [activeTenantUsers, assignmentUserId, assignmentUserSearch]);

  const activeMasterDepartments = useMemo(
    () => departmentScopeId === selectedTenantId ? masterDepartments.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")) : [],
    [masterDepartments, departmentScopeId, selectedTenantId],
  );
  const rootMasterDepartments = useMemo(
    () => activeMasterDepartments.filter((item) => !item.parentDepartmentId),
    [activeMasterDepartments],
  );
  const knownAdministrativeUsers = useMemo(() => sessionUsers.filter((user) => ["prefeitura_admin", "master_admin", "master_ops", "prefeitura_supervisor"].includes(user.role)), [sessionUsers]);
  const availableKnownUsers = useMemo(() => {
    const map = new Map<string, SessionUser>();
    sessionUsers.forEach((user) => {
      const normalizedEmail = user.email.trim().toLowerCase();
      if (!normalizedEmail || map.has(normalizedEmail)) return;
      map.set(normalizedEmail, user);
    });
    return [...map.values()];
  }, [sessionUsers]);
  const activeUsersCount = useMemo(() => sessionUsers.filter((user) => user.accountStatus === "active").length, [sessionUsers]);
  // A recorrência vem do plano efetivamente contratado e do preço personalizado,
  // não de um campo legado de mensalidade que pode permanecer em zero após upgrade.
  const commercialSummary = useMemo(
    () => summarizeMasterCommercialContracts({ institutions: institutionCatalog, plans, assignments: planAssignments }),
    [institutionCatalog, plans, planAssignments],
  );
  const monthlyRevenue = commercialSummary.monthlyContractValue;
  const activePlansCount = commercialSummary.activePlansCount;
  const activeInstitutionCount = useMemo(() => institutionCatalog.filter((tenant) => tenant.status === "ativo").length, [institutionCatalog]);
  const overviewInstitutions = useMemo(() => institutionCatalog.filter((tenant) => tenant.status === "ativo").slice(0, 3), [institutionCatalog]);
  const recentActivity = useMemo(() => [...sessionUsers].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5), [sessionUsers]);


  useLayoutEffect(() => {
    // The URL alone determines edit vs new. Never paint an old form when the route
    // changes scope, including browser back/forward or a direct URL.
    if (workspaceView !== "cadastro") return;
    const formIdentity = isCreatingNewInstitution ? "novo" : "editar:" + explicitTenantId;
    if (formIdentityRef.current !== formIdentity) {
      formIdentityRef.current = formIdentity;
      hydratedEditTenantRef.current = null;
      setForm({ ...emptyTenantForm });
      setAdmins([createAdminDraft()]);
    }
    // Live refresh must never clear an already hydrated edit or a new draft.
    if (isCreatingNewInstitution || workspaceView !== "cadastro") return;
    if (!activeTenant || hydratedEditTenantRef.current === activeTenant.id) return;
    hydratedEditTenantRef.current = activeTenant.id;
    const settings = getInstitutionSettings(activeTenant.id);
    const prefeituraAdmins = knownAdministrativeUsers.filter((user) => (user.tenantId === activeTenant.id || user.municipalityId === activeTenant.id) && user.role === "prefeitura_admin");
    setForm({ name: activeTenant.name, city: activeTenant.city, state: activeTenant.state, status: activeTenant.status, plan: activeTenant.plan, subdomain: activeTenant.subdomain, primaryColor: activeTenant.theme.primary, accentColor: activeTenant.theme.accent, contractNumber: settings?.contractNumber ?? "", contractStart: activeQuote.startsAt || settings?.contractStart || "", contractEnd: activeQuote.endsAt || settings?.contractEnd || "", monthlyFee: activeQuote.price ?? settings?.monthlyFee ?? 0, setupFee: settings?.setupFee ?? 0, signatureMode: settings?.signatureMode ?? "eletronica", clientDeliveryLink: settings?.clientDeliveryLink ?? settings?.linkPortalCliente ?? buildTenantLink(activeTenant.subdomain, settings?.site), secretariat: settings?.secretariaResponsavel ?? "", directorate: settings?.diretoriaResponsavel ?? "", directorPhone: settings?.diretoriaTelefone ?? "", directorEmail: settings?.diretoriaEmail ?? "", cnpj: settings?.cnpj ?? "", phone: settings?.telefone ?? "", email: settings?.email ?? "", site: settings?.site ?? "", address: settings?.endereco ?? "" });
    setAdmins(
      prefeituraAdmins.length > 0
        ? prefeituraAdmins.map((user) => ({ id: `admin-${user.id}`, email: user.email, fullName: user.name, title: user.title, accessLevel: user.accessLevel >= 3 ? 3 : 2 }))
        : (settings?.adminContacts?.length ?? 0) > 0
          ? settings!.adminContacts!.map((admin) => ({ id: `admin-contact-${admin.email}`, email: admin.email, fullName: admin.fullName, title: admin.title, accessLevel: admin.accessLevel >= 3 ? 3 : 2 }))
          : [createAdminDraft()],
    );
  }, [activeTenant, getInstitutionSettings, isCreatingNewInstitution, workspaceView, explicitTenantId, knownAdministrativeUsers, activeQuote.plan?.id, activeQuote.price, activeQuote.startsAt, activeQuote.endsAt]);

  const platformAlerts = useMemo(() => {
    const suspendedCount = institutionCatalog.filter((tenant) => tenant.status === "suspenso").length;
    const withoutAdmin = institutionCatalog.filter((tenant) => {
      const hasLinkedAdmin = knownAdministrativeUsers.some((user) => (user.tenantId === tenant.id || user.municipalityId === tenant.id) && user.role === "prefeitura_admin");
      const savedContacts = getInstitutionSettings(tenant.id)?.adminContacts ?? [];
      return !hasLinkedAdmin && savedContacts.length === 0;
    }).length;
    return [
      { id: "suspended", title: "Contas suspensas", description: suspendedCount > 0 ? `${suspendedCount} prefeitura${suspendedCount > 1 ? "s" : ""} com status suspenso.` : "Nenhuma Prefeitura suspensa no momento.", tone: suspendedCount > 0 ? ("danger" as const) : ("success" as const) },
      { id: "without-admin", title: "Gestão sem administrador", description: withoutAdmin > 0 ? `${withoutAdmin} prefeitura${withoutAdmin > 1 ? "s" : ""} sem administrador principal vinculado.` : "Todas as prefeituras possuem gestor principal.", tone: withoutAdmin > 0 ? ("warning" as const) : ("success" as const) },
      { id: "environment", title: "Ambiente da plataforma", description: hasBackendEnv ? "Banco SIGAPRO conectado e persistência ativa." : "Backend oficial indisponível; ambiente local de homologação ativo.", tone: hasBackendEnv ? ("success" as const) : ("default" as const) },
    ];
  }, [getInstitutionSettings, institutionCatalog, knownAdministrativeUsers]);

  const handleSetForm = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [field]: value }));

  const handleMasterCreateDepartment = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeTenant || !selectedTenantId || departmentScopeId !== selectedTenantId || !orgForm.name.trim() || orgBusy) return;
    if (orgForm.parentDepartmentId && !activeMasterDepartments.some((item) => item.id === orgForm.parentDepartmentId)) {
      setStatusMessage("A unidade superior não pertence à Prefeitura selecionada.");
      return;
    }
    setOrgBusy(true);
    setStatusMessage("Salvando unidade na Prefeitura selecionada...");
    try {
      await upsertRemoteMunicipalDepartment({
        municipalityId: selectedTenantId,
        name: orgForm.name.trim(),
        unitType: orgForm.unitType,
        parentDepartmentId: orgForm.parentDepartmentId || null,
        description: orgForm.description.trim(),
        email: orgForm.email.trim(),
        phone: orgForm.phone.trim(),
        sortOrder: activeMasterDepartments.length * 10 + 10,
      });
      const rows = await listRemoteMunicipalDepartments(selectedTenantId);
      setMasterDepartments(rows);
      setOrgForm({ name: "", unitType: "departamento", parentDepartmentId: "", description: "", email: "", phone: "" });
      setStatusMessage(`Organograma de ${activeTenant?.name || "Prefeitura"} atualizado.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar a unidade.");
    } finally {
      setOrgBusy(false);
    }
  };

  const handleMasterAssignDepartment = async () => {
    if (!activeTenant || !selectedTenantId || departmentScopeId !== selectedTenantId || !assignmentUserId || orgBusy) return;
    if (!activeTenantUsers.some((user) => user.id === assignmentUserId) || (assignmentDepartmentId && !activeMasterDepartments.some((item) => item.id === assignmentDepartmentId))) {
      setStatusMessage("Selecione um usuário e uma unidade da Prefeitura atual.");
      return;
    }
    setOrgBusy(true);
    setStatusMessage("Atualizando lotação do usuário...");
    try {
      await assignRemoteProfileDepartment({
        municipalityId: selectedTenantId,
        profileId: assignmentUserId,
        departmentId: assignmentDepartmentId || null,
      });
      const department = activeMasterDepartments.find((item) => item.id === assignmentDepartmentId);
      await updateTenantUser(assignmentUserId, { department: department?.name ?? "" });
      setStatusMessage("Lotação atualizada no organograma da Prefeitura.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível alterar a lotação.");
    } finally {
      setOrgBusy(false);
    }
  };

  const handleSelectTenant = (tenantId: string) => {
    if (saving || savingPlanOnly || orgBusy || !municipalIds.has(tenantId)) return;
    hydratedEditTenantRef.current = null;
    setStatusMessage("");
    navigate({ pathname: location.pathname, search: masterWorkspaceSearch(location.search, "cadastro", tenantId, "editar") }, { replace: true, preventScrollReset: true });
  };
  const addAdminRow = () => setAdmins((current) => [...current, createAdminDraft()]);
  const updateAdminRow = <K extends keyof AdminContactDraft>(id: string, field: K, value: AdminContactDraft[K]) => setAdmins((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  const removeAdminRow = (id: string) => setAdmins((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  const applyKnownAdminEmail = (draftId: string, email: string) => {
    const known = availableKnownUsers.find((user) => user.email.trim().toLowerCase() === email.trim().toLowerCase());
    if (!known) return;
    updateAdminRow(draftId, "email", known.email);
    updateAdminRow(draftId, "fullName", known.name);
    updateAdminRow(draftId, "title", known.title || roleSuggestedTitles.prefeitura_admin);
    updateAdminRow(draftId, "accessLevel", known.accessLevel >= 3 ? 3 : 2);
  };
  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const handleCopyLink = async (subdomain: string, customDomain?: string, tenantId?: string) => {
    const link = buildTenantLink(subdomain, customDomain);
    const feedbackKey = tenantId || selectedTenantId || subdomain || "global";
    if (!link) {
      const message = "Defina um subdomínio para copiar o portal do cliente.";
      setStatusMessage(message);
      setTenantActionMessage((current) => ({ ...current, [feedbackKey]: message }));
      return;
    }

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = link;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }

    const message = copied ? "Link copiado para a área de transferência." : `Portal: ${link}`;
    setStatusMessage(message);
    setTenantActionMessage((current) => ({ ...current, [feedbackKey]: message }));
  };
  const runUserCommand = async (userId: string, command: () => Promise<SessionUser | null>, success: (user: SessionUser) => string) => {
    if (savingUserId) return;
    setSavingUserId(userId);
    setStatusMessage("Salvando acesso no banco...");
    try {
      const updated = await command();
      if (!updated) throw new Error("Usuário não encontrado no banco.");
      setStatusMessage(success(updated));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar o acesso.");
    } finally {
      setSavingUserId(null);
    }
  };
  const isProtectedMaster = (user: SessionUser) => user.role === "master_admin" || user.role === "master_ops";
  const handleMasterStatusToggle = (user: SessionUser) => {
    if (isProtectedMaster(user)) { setStatusMessage("Contas Master não são alteradas nesta tela."); return; }
    if (user.accountStatus === "blocked") {
      if (!window.confirm(`Deseja desbloquear ${user.name}?`)) return;
      void runUserCommand(user.id, () => setUserAccountStatus({ userId: user.id, status: "active", actor: "master" }), (updated) => `Conta de ${updated.name} reativada.`);
      return;
    }
    const reason = window.prompt(`Informe o motivo do bloqueio de ${user.name}:`, user.blockReason || "Bloqueio administrativo");
    if (reason === null) return;
    void runUserCommand(user.id, () => setUserAccountStatus({ userId: user.id, status: "blocked", actor: "master", reason }), (updated) => `Conta de ${updated.name} bloqueada.`);
  };
  const handleMasterDelete = (user: SessionUser) => {
    if (isProtectedMaster(user)) { setStatusMessage("Contas Master não são alteradas nesta tela."); return; }
    if (!window.confirm(`Deseja desativar a conta de ${user.name}?`)) return;
    const reason = window.prompt("Informe a justificativa da desativação:", user.blockReason || "Conta desativada administrativamente");
    if (reason === null) return;
    void runUserCommand(user.id, () => deleteUserAccount({ userId: user.id, actor: "master", reason }), (updated) => `Conta de ${updated.name} marcada como inativa.`);
  };
  const handleMasterEdit = (user: SessionUser) => {
    if (isProtectedMaster(user)) { setStatusMessage("Contas Master não são alteradas nesta tela."); return; }
    const nextName = window.prompt("Nome do usuário:", user.name);
    if (nextName === null) return;
    const nextTitle = window.prompt("Cargo / título:", user.title || roleSuggestedTitles[user.role]);
    if (nextTitle === null) return;
    const editableRoles = Object.keys(roleLabels).filter((role) => role !== "master_admin" && role !== "master_ops");
    const nextRole = window.prompt(`Perfil (${editableRoles.join(", ")}):`, user.role) as UserRole | null;
    if (nextRole === null) return;
    if (!editableRoles.includes(nextRole)) { setStatusMessage("Perfil informado é inválido."); return; }
    const nextAccessRaw = window.prompt("Nível de acesso (1, 2 ou 3):", String(nextRole === "prefeitura_admin" ? 3 : user.accessLevel));
    if (nextAccessRaw === null) return;
    const nextAccess = Number(nextAccessRaw);
    if (![1, 2, 3].includes(nextAccess)) { setStatusMessage("Nível de acesso inválido."); return; }
    void runUserCommand(user.id, () => updateTenantUser(user.id, { name: nextName.trim(), title: nextTitle.trim(), role: nextRole, accessLevel: nextAccess as 1 | 2 | 3 }), (updated) => `Dados de ${updated.name} atualizados no banco.`);
  };

  // O plano pode ser atualizado sem regravar logos, Prefeitura ou administradores.
  const handleSavePlanOnly = async () => {
    if (saving || savingPlanOnly) return;
    if (isCreatingNewInstitution || !selectedTenantId) {
      setStatusMessage("Salve a Prefeitura antes de alterar o contrato.");
      return;
    }
    if (!activeTenant || hydratedEditTenantRef.current !== selectedTenantId) {
      setStatusMessage("A Prefeitura selecionada ainda não está disponível. Confira a conta na carteira antes de atualizar o plano.");
      return;
    }
    const selectedPlan = activeCommercialPlans.find((item) => item.id === form.plan || item.name === form.plan);
    if (!selectedPlan) { setStatusMessage("Selecione um plano comercial ativo."); return; }
    const existing = getInstitutionPlanAssignment(selectedTenantId);
    const customPrice = Number(form.monthlyFee || 0) > 0 &&
      Number(form.monthlyFee) !== Number(selectedPlan.price)
        ? Number(form.monthlyFee) : null;
    setSavingPlanOnly(true);
    setStatusMessage("Atualizando o plano no banco oficial...");
    try {
      if (!backendClient) throw new Error("Banco oficial indisponivel.");
      await withTimeout(saveClientPlanAssignment({
        id: existing?.id,
        municipalityId: selectedTenantId,
        planId: selectedPlan.id,
        contractStatus: form.status === "suspenso" ? "suspenso" : form.status === "implantacao" ? "trial" : "ativo",
        startsAt: form.contractStart || existing?.startsAt || new Date().toISOString().slice(0, 10),
        endsAt: form.contractEnd || existing?.endsAt || "",
        billingCycle: selectedPlan.billingCycle,
        billingNotes: form.contractNumber
          ? "Contrato " + form.contractNumber
          : existing?.billingNotes || "Plano atualizado pelo Master.",
        customPrice,
        isCustom: selectedPlan.isCustom || customPrice !== null,
      }), 22000);
      const { data: confirmed, error } = await backendClient
        .from("client_plan_assignments").select("id,plan_id,municipality_id")
        .eq("municipality_id", selectedTenantId).maybeSingle();
      if (error) throw new Error(explainMasterSaveError(error));
      if (!confirmed || confirmed.plan_id !== selectedPlan.id || confirmed.municipality_id !== selectedTenantId) {
        throw new Error("O contrato ainda nao foi confirmado pela leitura oficial do banco.");
      }
      try {
        await refreshRemoteStore();
        setStatusMessage("Plano " + selectedPlan.name + " confirmado no banco para a Prefeitura. Confira os valores personalizados antes de salvar outros dados.");
      } catch {
        setStatusMessage("Plano " + selectedPlan.name + " confirmado no banco. Atualize a pagina para sincronizar a listagem.");
      }
    } catch (error) {
      setStatusMessage("Falha ao atualizar o plano: " + explainMasterSaveError(error));
    } finally {
      setSavingPlanOnly(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || savingPlanOnly) return;
    if (!isCreatingNewInstitution && (!activeTenant || hydratedEditTenantRef.current !== selectedTenantId)) {
      setStatusMessage("A Prefeitura selecionada ainda não está disponível. Nenhuma alteração foi gravada. Confira a conta na carteira.");
      return;
    }
    setSaving(true);
    setStatusMessage("");
    let saveStage = "Dados da Prefeitura";
    let municipalityConfirmed = false;
    let planConfirmed = false;
    const normalizedSubdomain = normalizeSubdomainInput(form.subdomain || form.city || form.name);
    // Never sell a qualified ICP-Brasil signature as operational merely
    // because a value exists in tenant_settings. A verified provider, PDF
    // cryptographic signature and chain validation are still required.
    if (form.signatureMode === "icp_brasil") {
      setStatusMessage("ICP-Brasil exige credenciamento, integração e homologação de assinatura qualificada. Selecione Assinatura Eletrônica ou Manual para a operação atual.");
      setSaving(false);
      return;
    }
    if (!form.name.trim()) {
      setStatusMessage("Informe o nome institucional antes de salvar.");
      setSaving(false);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!normalizedSubdomain) {
      setStatusMessage("Informe um subdomínio válido (apenas o nome, sem .sigapromunicipal.com.br).");
      setSaving(false);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!form.city.trim() || !form.state.trim()) {
      setStatusMessage("Informe cidade e UF antes de salvar a Prefeitura.");
      setSaving(false);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const selectedPlan = activeCommercialPlans.find(
      (plan) => plan.id === form.plan || plan.name === form.plan,
    );
    if (!selectedPlan) {
      setStatusMessage("Selecione um plano comercial ativo antes de salvar a Prefeitura.");
      setSaving(false);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const normalizedAdminContacts = normalizeAdminContactsFromDrafts(admins);
    const incompleteAdmin = normalizedAdminContacts.find((admin) => !admin.email || !admin.fullName);
    if (incompleteAdmin) {
      setStatusMessage("Preencha nome e e-mail dos administradores informados antes de salvar.");
      setSaving(false);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const duplicateAdminEmails = normalizedAdminContacts.reduce<string[]>((duplicates, admin, index, items) => {
      if (items.findIndex((candidate) => candidate.email === admin.email) !== index && !duplicates.includes(admin.email)) {
        duplicates.push(admin.email);
      }
      return duplicates;
    }, []);
    if (duplicateAdminEmails.length > 0) {
      setStatusMessage(`Existem e-mails repetidos na administração: ${duplicateAdminEmails.join(", ")}.`);
      setSaving(false);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    try {
      const currentSettings = !isCreatingNewInstitution && activeTenant ? getInstitutionSettings(activeTenant.id) : undefined;
      const slug = normalizedSubdomain;
      let linkedAdminCount = 0;
      const unresolvedAdminEmails: string[] = [];

      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível. A Prefeitura não foi salva.");
      }

      await ensureBackendAvailable();
      saveStage = "Gravacao institucional";
      const remoteInstitution = await withRetry(() =>
        withTimeout(
          upsertRemoteInstitution({
            institutionId: isCreatingNewInstitution ? undefined : selectedTenantId || undefined,
            name: form.name,
            city: form.city,
            state: form.state,
            status: form.status,
            subdomain: slug,
            cnpj: form.cnpj,
            primaryColor: form.primaryColor,
            accentColor: form.accentColor,
            secretariat: form.secretariat,
          }),
        ),
      );

      const savedTenantId = remoteInstitution.id;
      municipalityConfirmed = true;
      saveStage = "Contrato comercial";

      const previousPlanAssignment = getInstitutionPlanAssignment(savedTenantId);
      await withRetry(() =>
        withTimeout(
          saveClientPlanAssignment({
            id: previousPlanAssignment?.id,
            municipalityId: savedTenantId,
            planId: selectedPlan.id,
            contractStatus:
              form.status === "suspenso"
                ? "suspenso"
                : form.status === "implantacao"
                  ? "trial"
                  : "ativo",
            startsAt: form.contractStart || new Date().toISOString().slice(0, 10),
            endsAt: form.contractEnd || "",
            billingCycle: selectedPlan.billingCycle,
            billingNotes: form.contractNumber
              ? `Contrato ${form.contractNumber}`
              : "Plano vinculado pelo cadastro Master.",
            customPrice:
              Number(form.monthlyFee || 0) > 0 && Number(form.monthlyFee) !== Number(selectedPlan.price)
                ? Number(form.monthlyFee)
                : null,
            isCustom:
              selectedPlan.isCustom ||
              (Number(form.monthlyFee || 0) > 0 && Number(form.monthlyFee) !== Number(selectedPlan.price)),
          }),
        ),
      );

      planConfirmed = true;
      saveStage = "Configuracoes institucionais";
      const nextSettings = { tenantId: savedTenantId, cnpj: form.cnpj || currentSettings?.cnpj || "", endereco: form.address || currentSettings?.endereco || "", telefone: form.phone || currentSettings?.telefone || "", email: form.email || currentSettings?.email || "", site: form.site || currentSettings?.site || "", secretariaResponsavel: form.secretariat || currentSettings?.secretariaResponsavel || "", secretariaTelefone: currentSettings?.secretariaTelefone || currentSettings?.telefone || "", secretariaEmail: currentSettings?.secretariaEmail || currentSettings?.email || "", footerContactSource: currentSettings?.footerContactSource || "diretoria", diretoriaResponsavel: form.directorate || currentSettings?.diretoriaResponsavel || "", diretoriaTelefone: form.directorPhone || currentSettings?.diretoriaTelefone || "", diretoriaEmail: form.directorEmail || currentSettings?.diretoriaEmail || "", horarioAtendimento: currentSettings?.horarioAtendimento || "", brasaoUrl: currentSettings?.brasaoUrl || "", bandeiraUrl: currentSettings?.bandeiraUrl || "", logoUrl: currentSettings?.logoUrl || "", imagemHeroUrl: currentSettings?.imagemHeroUrl || "", resumoPlanoDiretor: currentSettings?.resumoPlanoDiretor || "", resumoUsoSolo: currentSettings?.resumoUsoSolo || "", leisComplementares: currentSettings?.leisComplementares || "", linkPortalCliente: buildTenantLink(slug, form.site || currentSettings?.site), protocoloPrefixo: currentSettings?.protocoloPrefixo || "PM", guiaPrefixo: currentSettings?.guiaPrefixo || "DAM", chavePix: currentSettings?.chavePix || "", beneficiarioArrecadacao: currentSettings?.beneficiarioArrecadacao || form.name, taxaProtocolo: currentSettings?.taxaProtocolo ?? 35.24, taxaIssPorMetroQuadrado: currentSettings?.taxaIssPorMetroQuadrado ?? 0, issRateProfiles: currentSettings?.issRateProfiles, issStageEnabled: currentSettings?.issStageEnabled ?? true, taxaAprovacaoFinal: currentSettings?.taxaAprovacaoFinal ?? 0, approvalRateProfiles: currentSettings?.approvalRateProfiles, finalApprovalFeeEnabled: currentSettings?.finalApprovalFeeEnabled ?? true, registroProfissionalObrigatorio: currentSettings?.registroProfissionalObrigatorio ?? true, contractNumber: form.contractNumber || currentSettings?.contractNumber || "", contractStart: form.contractStart || currentSettings?.contractStart || "", contractEnd: form.contractEnd || currentSettings?.contractEnd || "", monthlyFee: Number(form.monthlyFee || 0), setupFee: Number(form.setupFee || 0), signatureMode: form.signatureMode, clientDeliveryLink: form.clientDeliveryLink || buildTenantLink(slug, form.site || currentSettings?.site), logoScale: currentSettings?.logoScale ?? 1, logoOffsetX: currentSettings?.logoOffsetX ?? 0, logoOffsetY: currentSettings?.logoOffsetY ?? 0, headerLogoScale: currentSettings?.headerLogoScale ?? currentSettings?.logoScale ?? 1, headerLogoOffsetX: currentSettings?.headerLogoOffsetX ?? currentSettings?.logoOffsetX ?? 0, headerLogoOffsetY: currentSettings?.headerLogoOffsetY ?? currentSettings?.logoOffsetY ?? 0, footerLogoScale: currentSettings?.footerLogoScale ?? currentSettings?.logoScale ?? 1, footerLogoOffsetX: currentSettings?.footerLogoOffsetX ?? currentSettings?.logoOffsetX ?? 0, footerLogoOffsetY: currentSettings?.footerLogoOffsetY ?? currentSettings?.logoOffsetY ?? 0, logoAlt: currentSettings?.logoAlt || `Logo institucional de ${form.name}`, logoUpdatedAt: currentSettings?.logoUpdatedAt || "", logoUpdatedBy: currentSettings?.logoUpdatedBy || "", logoFrameMode: currentSettings?.logoFrameMode || "soft-square", logoFitMode: currentSettings?.logoFitMode || "contain", headerLogoFrameMode: currentSettings?.headerLogoFrameMode || currentSettings?.logoFrameMode || "soft-square", headerLogoFitMode: currentSettings?.headerLogoFitMode || currentSettings?.logoFitMode || "contain", footerLogoFrameMode: currentSettings?.footerLogoFrameMode || currentSettings?.logoFrameMode || "soft-square", footerLogoFitMode: currentSettings?.footerLogoFitMode || currentSettings?.logoFitMode || "contain", planoDiretorArquivoNome: currentSettings?.planoDiretorArquivoNome || "", planoDiretorArquivoUrl: currentSettings?.planoDiretorArquivoUrl || "", usoSoloArquivoNome: currentSettings?.usoSoloArquivoNome || "", usoSoloArquivoUrl: currentSettings?.usoSoloArquivoUrl || "", leisArquivoNome: currentSettings?.leisArquivoNome || "", leisArquivoUrl: currentSettings?.leisArquivoUrl || "", adminContacts: normalizedAdminContacts };
      await withRetry(() => withTimeout(saveRemoteInstitutionSettings(nextSettings)));

      saveStage = "Administradores da Prefeitura";
      const adminWarnings: string[] = [];
      for (const admin of normalizedAdminContacts) {
        const known = availableKnownUsers.find((user) => user.email.trim().toLowerCase() === admin.email);
        if (known && ["master_admin", "master_ops"].includes(known.role)) {
          adminWarnings.push(admin.email + ": conta Master protegida; nao foi convertida em administrador municipal.");
          continue;
        }
        try {
          const linked = await withRetry(() => withTimeout(linkExistingUserToMunicipalityAdmin({
            email: admin.email, municipalityId: savedTenantId,
            fullName: admin.fullName, title: admin.title, accessLevel: admin.accessLevel,
          })));
          if (linked.linked) linkedAdminCount += 1;
          else if (linked.reason === "not_found") unresolvedAdminEmails.push(admin.email);
        } catch (adminError) {
          adminWarnings.push(admin.email + ": " + explainMasterSaveError(adminError));
        }
      }

      const savedTenant = upsertInstitution({
        institutionId: savedTenantId,
        name: form.name,
        city: form.city,
        state: form.state,
        status: form.status,
        plan: selectedPlan.name,
        subdomain: slug,
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
      }, { remoteConfirmed: true });
      await saveInstitutionSettings(nextSettings, { skipRemoteSync: true });
        navigate({ pathname: location.pathname, search: masterWorkspaceSearch(location.search, "cadastro", savedTenant.id, "editar") }, { replace: true, preventScrollReset: true });

      if (adminWarnings.length > 0) {
        setStatusMessage("Prefeitura e contrato confirmados. Contatos a revisar: " + adminWarnings.join(" | "));
      } else if (normalizedAdminContacts.length === 0) {
        setStatusMessage("Prefeitura e contrato salvos no banco oficial. A operação comercial depende da validação da implantação.");
      } else if (unresolvedAdminEmails.length > 0) {
        setStatusMessage(
          `Prefeitura salva no banco oficial. ${linkedAdminCount} administrador(es) foram vinculados e os contatos ${unresolvedAdminEmails.join(", ")} aguardam conta existente no sistema para vínculo automático.`,
        );
      } else {
        setStatusMessage(`Prefeitura salva no banco oficial e ${linkedAdminCount} administrador(es) foram vinculados ao município.`);
      }
    } catch (error) {
      const partial = planConfirmed
        ? "Prefeitura e plano salvos, mas a etapa seguinte falhou."
        : municipalityConfirmed
          ? "Prefeitura salva, mas o contrato nao foi confirmado."
          : "A Prefeitura nao foi confirmada no banco.";
      setStatusMessage(partial + " Etapa: " + saveStage + ". " + explainMasterSaveError(error));
      formRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
      console.error("Falha ao salvar prefeitura", { stage: saveStage, error });
    } finally { setSaving(false); }
  };

  const resetForNewInstitution = () => {
    if (saving || savingPlanOnly || orgBusy) return;
    hydratedEditTenantRef.current = null;
    formIdentityRef.current = "novo";
    setForm({ ...emptyTenantForm });
    navigate({ pathname: location.pathname, search: masterWorkspaceSearch(location.search, "cadastro", selectedTenantId, "novo") }, { replace: true, preventScrollReset: true });
    setAdmins([createAdminDraft()]);
    setStatusMessage("");
  };

  const openMasterSection = (section: WorkspaceView, scopeId = selectedTenantId) => {
    if (saving || savingPlanOnly || orgBusy) return;
    navigate({ pathname: location.pathname, search: masterWorkspaceSearch(location.search, section, scopeId, isCreatingNewInstitution ? "novo" : "editar") }, { replace: true, preventScrollReset: true });
  };

  const renderInstitutionCard = (tenant: Institution) => {
    const settings = getInstitutionSettings(tenant.id);
    const contractQuote = readMunicipalContractQuote({
      municipalityId: tenant.id,
      plans,
      assignments: planAssignments,
      snapshots: planCapacity.loaded && !planCapacity.error ? planCapacity.rows : [],
    });
    const tenantAdmins = knownAdministrativeUsers.filter((user) => (user.tenantId === tenant.id || user.municipalityId === tenant.id) && user.role === "prefeitura_admin");
    const savedAdminContacts = settings?.adminContacts ?? [];
    const portalLink = settings?.clientDeliveryLink || settings?.linkPortalCliente || buildTenantLink(tenant.subdomain, settings?.site) || "Não definido";
    return (
      <div key={tenant.id} data-master-institution-card="true" className="min-w-0 max-w-full rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="sig-fit-title text-lg font-semibold text-slate-950" title={tenant.name}>
                {tenant.name}
              </p>
              <Badge className={`rounded-full border ${getInstitutionBadgeTone(tenant.status)}`}>
                {getInstitutionStatusLabel(tenant.status)}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                {tenant.plan}
              </Badge>
            </div>
            <p
              className="mt-1 sig-fit-copy text-sm text-slate-500"
              title={`${tenant.city}/${tenant.state} • ${settings?.secretariaResponsavel || "Secretaria não definida"}`}
            >
              {tenant.city}/{tenant.state} • {settings?.secretariaResponsavel || "Secretaria não definida"}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap">
            <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 lg:w-auto" onClick={() => handleSelectTenant(tenant.id)}>
              Gerenciar
            </Button>
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl lg:w-auto" disabled={saving || savingPlanOnly || orgBusy} onClick={() => openMasterSection("organograma", tenant.id)}>
              <Network className="h-4 w-4" /> Organograma
            </Button>
            <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 lg:w-auto" onClick={() => handleCopyLink(tenant.subdomain, settings?.site, tenant.id)}>
              <Copy className="mr-2 h-4 w-4 text-sky-200" />
              Copiar link
            </Button>
            <Button
              type="button"
              variant="outline"
              className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 lg:w-auto"
              disabled={tenantActionBusyId === tenant.id}
              onClick={() => {
                void (async () => {
                  const nextStatus = tenant.status === "suspenso" ? "ativo" : "suspenso";
                  const loadingMessage = nextStatus === "ativo" ? "Reativando Prefeitura..." : "Suspendendo Prefeitura...";
                  setTenantActionBusyId(tenant.id);
                  setStatusMessage(loadingMessage);
                  setTenantActionMessage((current) => ({ ...current, [tenant.id]: loadingMessage }));
                  try {
                    await setInstitutionStatus(tenant.id, nextStatus);
                    const successMessage =
                      nextStatus === "ativo"
                        ? `${tenant.name} reativada com sucesso.`
                        : `${tenant.name} suspensa com sucesso.`;
                    setStatusMessage(successMessage);
                    setTenantActionMessage((current) => ({ ...current, [tenant.id]: successMessage }));
                  } catch (error) {
                    const message =
                      error instanceof Error
                        ? error.message
                        : "Não foi possível alterar o status da Prefeitura.";
                    setStatusMessage(message);
                    setTenantActionMessage((current) => ({ ...current, [tenant.id]: message }));
                  } finally {
                    setTenantActionBusyId(null);
                  }
                })();
              }}
            >
              {tenantActionBusyId === tenant.id ? (
                "Salvando..."
              ) : tenant.status === "suspenso" ? (
                <>
                  <Undo2 className="mr-2 h-4 w-4 text-sky-200" />
                  Ativar
                </>
              ) : (
                <>
                  <ShieldAlert className="mr-2 h-4 w-4 text-sky-200" />
                  Suspender
                </>
              )}
            </Button>

          </div>
        </div>

        {tenantActionMessage[tenant.id] ? (
          <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
            {tenantActionMessage[tenant.id]}
          </div>
        ) : null}

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1.2fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Usuários ativos</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{tenant.users}</p>
            <p className="mt-1 text-sm text-slate-500">Base vinculada à conta municipal.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Valor do plano {contractQuote.billingCycle ? `(${contractQuote.billingCycle})` : ""}</p>
            <p className="mt-2 sig-fit-title text-lg font-semibold text-slate-950"
              title={contractQuote.price === null ? "Contrato sem preço definido" : formatCurrency(contractQuote.price)}>
              {contractQuote.price === null ? "Sob contrato" : formatCurrency(contractQuote.price)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {contractQuote.endsAt || settings?.contractEnd
                ? `Contrato até ${contractQuote.endsAt || settings?.contractEnd}`
                : "Sem vencimento contratual informado"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Portal institucional</p>
            <p className="mt-2 truncate text-sm font-medium leading-6 text-slate-900" title={portalLink}>
              {portalLink}
            </p>
            <p className="mt-1 text-sm text-slate-500">Acesso oficial da Prefeitura e da equipe responsável.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {tenantAdmins.length > 0 ? (
            tenantAdmins.slice(0, 3).map((admin) => {
              const profile = getUserProfile(admin.id, admin.email);
              return (
                <div key={admin.id} className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2">
                  <UserAvatar authenticatedOwnerId={authorizedAvatarViewerId} name={admin.name} imageUrl={resolveProfileAvatarDisplayUrl(profile)} crop={profile ? { scale: profile.avatarScale ?? 1, offsetX: profile.avatarOffsetX ?? 0, offsetY: profile.avatarOffsetY ?? 0, editorSize: 320 } : undefined} size="sm" />
                  <div className="min-w-0">
                    <p className="sig-fit-title text-sm font-semibold text-slate-900" title={admin.name}>
                      {admin.name}
                    </p>
                    <p className="sig-fit-copy text-xs text-slate-500" title={admin.email}>
                      {admin.email}
                    </p>
                  </div>
                </div>
              );
            })
          ) : savedAdminContacts.length > 0 ? (
            savedAdminContacts.slice(0, 3).map((admin) => (
              <div key={`${tenant.id}-${admin.email}`} className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2">
                <UserAvatar authenticatedOwnerId={authorizedAvatarViewerId} name={admin.fullName || admin.email} size="sm" />
                <div className="min-w-0">
                  <p className="sig-fit-title text-sm font-semibold text-slate-900" title={admin.fullName || admin.email}>
                    {admin.fullName || admin.email}
                  </p>
                  <p className="sig-fit-copy text-xs text-slate-500" title={admin.email}>
                    {admin.email}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <Badge className="rounded-full border border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400 hover:bg-amber-50">
              Sem administrador principal
            </Badge>
          )}
        </div>
        <MunicipalMaintenancePanel key={tenant.id} institution={tenant} onChanged={async () => { await refreshRemoteStore(); window.dispatchEvent(new Event("sigapro:data-changed")); }} />
      </div>
    );
  };

  const renderUserCard = (user: SessionUser) => {
    const profile = getUserProfile(user.id, user.email);
    return <div key={user.id} data-master-user-card="true" className="min-w-0 max-w-full rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex min-w-0 items-start gap-3"><UserAvatar authenticatedOwnerId={authorizedAvatarViewerId} name={user.name} imageUrl={resolveProfileAvatarDisplayUrl(profile)} crop={profile ? { scale: profile.avatarScale ?? 1, offsetX: profile.avatarOffsetX ?? 0, offsetY: profile.avatarOffsetY ?? 0, editorSize: 320 } : undefined} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="sig-fit-title text-lg font-semibold text-slate-950">{user.name}</p><Badge className={`rounded-full border ${getStatusTone(user.accountStatus)}`}>{getStatusLabel(user.accountStatus)}</Badge></div><p className="text-sm text-slate-600">{user.title || user.department || "Sem cargo definido"}</p><p className="mt-1 sig-fit-copy text-sm text-slate-500" title={user.email}>{user.email}</p></div></div><div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end"><Badge className="rounded-full bg-slate-950 text-white hover:bg-slate-950">{roleLabels[user.role]}</Badge><Badge variant="outline" className="rounded-full border-slate-300 text-slate-700">{accessLevelLabels[user.accessLevel]}</Badge></div></div><div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Setor:</span> {user.department || user.title || "Não informado"}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Tipo:</span> {user.userType || "Usuário"}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Criado em:</span> {user.createdAt || "Não informado"}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Último acesso:</span> {user.lastAccessAt || "Não registrado"}</div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => handleMasterEdit(user)}><PencilLine className="mr-2 h-4 w-4 text-sky-200" />Editar</Button><Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => handleMasterStatusToggle(user)}>{user.accountStatus === "blocked" ? <><Undo2 className="mr-2 h-4 w-4 text-sky-200" />Desbloquear</> : <><ShieldAlert className="mr-2 h-4 w-4 text-sky-200" />Bloquear</>}</Button><Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 hover:text-slate-50 sm:w-auto" onClick={() => handleMasterDelete(user)}><UserX className="mr-2 h-4 w-4 text-rose-300" />Desativar</Button></div></div>;
  };
  return (
    <PortalFrame eyebrow="Administrador Geral" title="Console executivo da plataforma">
      <PageShell className={workspaceView === "visao-geral" ? "sig-module-summary-active sig-master-admin-workspace" : "sig-master-admin-workspace"}>
        <PageHero
          eyebrow="Governança SaaS"
          title="Carteira institucional do SIGAPRO"
          description="Acompanhe base ativa, risco operacional e saúde comercial em uma visão única de governança."
          icon={ShieldPlus}
          actions={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="sig-dark-action-btn rounded-full text-slate-50" onClick={() => navigate("/master/planos")}>
                <CreditCard className="mr-2 h-4 w-4 text-sky-200" />
                Planos e níveis
              </Button>
              <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" disabled={saving || savingPlanOnly || orgBusy} onClick={resetForNewInstitution}>
                <Plus className="mr-2 h-4 w-4" />
                Nova prefeitura
              </Button>
            </div>
          }
        />
        <InternalTabs value={workspaceView} disabled={saving || savingPlanOnly || orgBusy} reselectValue={!isCreatingNewInstitution ? "cadastro" : undefined} onChange={(value) => {
          if (saving || savingPlanOnly) return;
          if (value === "cadastro" && (!isCreatingNewInstitution || formIdentityRef.current !== "novo")) resetForNewInstitution();
          else openMasterSection(value as WorkspaceView);
        }} urlParam="secao" persistInUrl={false} items={[{ value: "visao-geral", label: "Visão geral", helper: "Resumo executivo" }, { value: "carteira", label: "Carteira", helper: "Prefeituras e contratos" }, { value: "cadastro", label: "Nova Prefeitura", helper: "Formulário limpo" }, { value: "organograma", label: "Organograma", helper: "Estrutura da Prefeitura" }, { value: "usuarios", label: "Acessos e equipe", helper: "Prefeituras e equipe SIGAPRO" }]} />

        {workspaceView === "visao-geral" || workspaceView === "carteira" ? (
          <div data-master-contract-capacity="true" className={workspaceView === "carteira" ? "order-[80] min-w-0" : "contents"}>
          <SectionCard title="Capacidade e cadastros por Prefeitura"
            description="Consumo por município: plano, usuários internos, processos, departamentos e documentos. Dados atualizados pelo núcleo SIGAPRO.">
            {planCapacity.error ? <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{planCapacity.error}</p> : null}
            {!planCapacity.loaded ? (
              <p className="text-sm text-slate-600">Carregando consumo dos contratos...</p>
            ) : visibleCapacityRows.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhuma prefeitura encontrada na consulta de planos.</p>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-2">
                {(workspaceView === "visao-geral" ? visibleCapacityRows.slice(0, 2) : capacityPageData.items).map((row) => (
                  <PlanCapacityCard key={row.municipalityId} row={row}
                    municipalityName={institutionCatalog.find((item) => item.id === row.municipalityId)?.name ?? "Prefeitura"} />
                ))}
                {workspaceView === "carteira" && visibleCapacityRows.length > 2 ? (
                  <nav aria-label="Paginação de contratos municipais"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 2xl:col-span-2">
                    <span>Contratos {capacityPageData.start + 1}–{capacityPageData.end} de {capacityPageData.total} · Página {capacityPageData.page} de {capacityPageData.totalPages}</span>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="border-slate-300 bg-white"
                        disabled={capacityPageData.page <= 1} onClick={() => setContractCapacityPage(capacityPageData.page - 1)}>Anterior</Button>
                      <Button type="button" size="sm" variant="outline" className="border-slate-300 bg-white"
                        disabled={capacityPageData.page >= capacityPageData.totalPages} onClick={() => setContractCapacityPage(capacityPageData.page + 1)}>Próxima</Button>
                    </div>
                  </nav>
                ) : null}
                {workspaceView === "visao-geral" && visibleCapacityRows.length > 2 ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 2xl:col-span-2">
                    <span>Exibindo 2 de {visibleCapacityRows.length} prefeituras. Os demais contratos continuam disponíveis na Carteira.</span>
                    <Button type="button" variant="outline" className="shrink-0 rounded-xl border-sky-300 bg-white text-sky-900"
                      onClick={() => openMasterSection("carteira")}>Ver todas</Button>
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>
          </div>
        ) : null}

        {workspaceView === "visao-geral" ? <><PageStatsRow className="xl:grid-cols-4"><MetricCard title="Prefeituras ativas" value={String(activeInstitutionCount)} helper="Carteira em operação" icon={Landmark} tone="blue" /><MetricCard title="Usuários ativos" value={String(activeUsersCount)} helper="Contas habilitadas" icon={Users2} tone="emerald" /><MetricCard title="Planos ativos" value={String(activePlansCount)} helper="Recorrência mensal" icon={CreditCard} tone="amber" /><MetricCard title="Receita contratada/mês" value={formatCurrency(monthlyRevenue)} helper="Recorrência prevista, não arrecadação" icon={Zap} tone="rose" valueTitle={monthlyRevenue.toString()} /></PageStatsRow><PageMainGrid><PageMainContent><TableCard title="Carteira institucional" description="Prefeituras prioritárias e leitura comercial da operação." icon={Building2}><div className="space-y-4">{overviewInstitutions.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhuma Prefeitura ativa cadastrada ainda. Use o cadastro para abrir a primeira conta institucional.</div> : null}{overviewInstitutions.map((tenant) => (
  <div key={tenant.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-950" title={tenant.name}>{tenant.name}</p>
      <p className="mt-0.5 truncate text-xs text-slate-600">
        {tenant.city || "Município"}{tenant.state ? " / " + tenant.state : ""} · Plano: {tenant.plan || "A definir"}
      </p>
    </div>
    <Button type="button" variant="outline" className="shrink-0 rounded-xl border-slate-300 bg-white text-slate-800"
      onClick={() => openMasterSection("carteira", tenant.id)}>
      Abrir carteira
    </Button>
  </div>
))}</div></TableCard></PageMainContent><PageSideContent><SectionCard title="Painel master" description="Alertas, atividade curta e leitura comercial."><div className="space-y-4"><div className="space-y-3">{platformAlerts.slice(0, 3).map((alert) => <AlertCard key={alert.id} title={alert.title} description={alert.description} tone={alert.tone} />)}</div><div className="grid gap-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Base total</p><p className="mt-2 text-lg font-semibold text-slate-950">{institutionCatalog.length}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Ticket mensal contratado</p><p className="mt-2 text-lg font-semibold text-slate-950">{activePlansCount > 0 ? formatCurrency(monthlyRevenue / activePlansCount) : formatCurrency(0)}</p></div></div><div className="space-y-3">{recentActivity.slice(0, 3).map((user) => { const profile = getUserProfile(user.id, user.email); return <div key={user.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3"><UserAvatar authenticatedOwnerId={authorizedAvatarViewerId} name={user.name} imageUrl={resolveProfileAvatarDisplayUrl(profile)} crop={profile ? { scale: profile.avatarScale ?? 1, offsetX: profile.avatarOffsetX ?? 0, offsetY: profile.avatarOffsetY ?? 0, editorSize: 320 } : undefined} size="sm" /><div className="min-w-0"><p className="sig-fit-title text-sm font-semibold text-slate-950">{user.name}</p><p className="sig-fit-copy text-xs text-slate-500">{roleLabels[user.role]}</p></div></div>; })}</div></div></SectionCard></PageSideContent></PageMainGrid></> : null}

        {workspaceView === "carteira" || visitedRegistries.carteira ? (
          <div data-master-preserved-panel="carteira" hidden={workspaceView !== "carteira"} style={workspaceView !== "carteira" ? { display: "none" } : undefined}>
          <section data-master-portfolio-surface="true"
            className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(9,39,64,0.07)] sm:p-6 dark:border-slate-700 dark:bg-slate-900">
            <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-800 dark:text-sky-200">Master · Diretório institucional</p>
                <h2 className="mt-1 break-words text-xl font-bold tracking-tight text-slate-950 dark:text-white">Prefeituras e contratos</h2>
                <p className="mt-1 max-w-[72ch] text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Pesquise e consulte uma Prefeitura de cada vez. A equipe própria SIGAPRO fica separada dos servidores municipais.
                </p>
              </div>
              <Button type="button" className="h-10 w-full rounded-xl bg-[#123b58] !text-white hover:bg-[#1b587c] sm:w-auto"
                disabled={saving || savingPlanOnly || orgBusy} onClick={resetForNewInstitution}><Plus className="mr-2 h-4 w-4" />Nova Prefeitura</Button>
            </header>
            <div className="mt-5 min-w-0">
              {institutionCatalog.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Nenhuma Prefeitura cadastrada. Use Nova Prefeitura para criar a primeira instituição.
                </p>
              ) : null}
              <CompactPortfolioRegistry institutions={institutionCatalog} renderDetails={renderInstitutionCard} />
            </div>
            <footer className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="min-w-0 flex-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Limites e consumos estão na Visão geral; colaboradores e administradores estão em Acessos e equipe.
              </p>
              <Button type="button" variant="outline"
                className="h-10 w-full rounded-xl border-slate-300 bg-white text-slate-800 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                onClick={() => openMasterSection("usuarios")}>Acessos e equipe <Users2 className="ml-2 h-4 w-4" /></Button>
            </footer>
          </section>
          </div>
        ) : null}

        {workspaceView === "cadastro" ? (
          <section ref={formRef} data-master-prefeitura-form="premium-standalone"
            className="min-w-0 overflow-hidden rounded-[24px] border border-[#bed3e5] bg-[#f8fbfe] shadow-[0_18px_45px_rgba(15,40,67,0.12)] dark:border-slate-700 dark:bg-slate-900">
            <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(110deg,#0e3048,#14516b)] px-5 py-6 text-white sm:px-7">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200">Master / Cadastro e gestão / Prefeitura</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{isCreatingNewInstitution ? "Nova Prefeitura · Cadastro limpo" : "Editar Prefeitura e contrato"}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-100">{isCreatingNewInstitution ? "Novo cadastro independente, sem dados de outras prefeituras." : "Edição exclusiva da Prefeitura selecionada na Carteira."}</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button type="button" variant="outline" data-master-form-command="back" onClick={() => openMasterSection("carteira")}
                  disabled={saving || savingPlanOnly} className="h-auto min-h-11 flex-1 rounded-xl px-4 sm:flex-none">
                  <ArrowLeft className="mr-2 h-4 w-4" />Voltar à carteira
                </Button>
                <Button type="submit" form="master-municipality-form" data-shared-action="primary" data-master-form-command="save" disabled={saving || savingPlanOnly}
                  className="h-auto min-h-11 flex-1 rounded-xl px-4 sm:flex-none">
                  <span data-master-command-label="true">{saving ? "Salvando..." : isCreatingNewInstitution ? "Criar Prefeitura" : "Salvar alterações"}</span>
                </Button>
              </div>
            </header>
            <form id="master-municipality-form" className="sig-premium-admin-form min-w-0 space-y-6 px-5 py-6 sm:px-7 sm:py-8" onSubmit={handleSave}>
              {!isCreatingNewInstitution && !activeTenant ? <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold !text-amber-950">Prefeitura selecionada indisponível. A gravação está bloqueada até a conta retornar ou ser selecionada novamente na carteira.</p> : null}
                    {statusMessage ? (
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                          statusMessage.toLowerCase().includes("sucesso")
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                      >
                        {statusMessage}
                      </div>
                    ) : null}
                  <div data-master-prefeitura-overview="compact" data-master-form-mode={isCreatingNewInstitution ? "create" : "edit"} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#d4e1eb] bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span><strong>Prefeitura:</strong> {isCreatingNewInstitution ? "Nova conta" : activeTenant?.name || "Selecione uma conta"}</span>
                    <span><strong>Plano:</strong> {form.plan || "A definir"}</span>
                    <span><strong>Contrato:</strong> {form.contractEnd || "Sem vencimento"}</span>
                  </div>
                  <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
                    <h3 className="text-base font-bold text-[#153b55] dark:text-white">01 · Dados institucionais e plano</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Identificação, nível contratado e dados de acesso municipal.</p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
                    <div className="space-y-2 xl:col-span-6">
                      <Label>Nome institucional</Label>
                      <Input value={form.name} onChange={(event) => handleSetForm("name", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-4">
                      <Label>Cidade</Label>
                      <Input value={form.city} onChange={(event) => handleSetForm("city", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-2">
                      <Label>UF</Label>
                      <Input value={form.state} onChange={(event) => handleSetForm("state", event.target.value)} className="sig-admin-input" />
                    </div>
                  </div>
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
                      <div className="space-y-2 xl:col-span-3">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={(value) => handleSetForm("status", value as Institution["status"])}>
                          <SelectTrigger className="sig-admin-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativo">Ativa</SelectItem>
                            <SelectItem value="implantacao">Implantação</SelectItem>
                            <SelectItem value="suspenso">Suspensa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    <div className="space-y-2 xl:col-span-9">
                      <Label>Plano contratado</Label>
                      <Select
                        value={activeCommercialPlans.find((plan) => plan.id === form.plan || plan.name === form.plan)?.id ?? ""}
                        onValueChange={(value) => {
                          const plan = activeCommercialPlans.find((item) => item.id === value);
                          if (!plan) return;
                          setForm((current) => {
                            const previous = activeCommercialPlans.find((item) => item.id === current.plan || item.name === current.plan);
                            const defaultPrice = !current.monthlyFee || Number(current.monthlyFee) === Number(previous?.price ?? 0);
                            return { ...current, plan: plan.name, monthlyFee: defaultPrice ? Number(plan.price) : current.monthlyFee };
                          });
                          setStatusMessage("");
                        }}
                      >
                        <SelectTrigger className="sig-admin-input">
                          <SelectValue placeholder="Selecione o plano comercial" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeCommercialPlans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} • {plan.price > 0 ? formatCurrency(plan.price) : "Sob consulta"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!isCreatingNewInstitution ? (<div data-master-plan-inline-save="dedicated" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
                         <p className="min-w-0 flex-1 text-xs leading-5 text-[#234760] dark:text-sky-100">
                           Atualize somente o contrato, sem regravar a Prefeitura ou seus administradores.
                         </p>
                         <Button type="button" data-shared-action="primary" data-master-form-command="save" onClick={() => void handleSavePlanOnly()}
                           disabled={saving || savingPlanOnly || isCreatingNewInstitution || !selectedTenantId || !activeTenant}
                           className="h-10 w-full rounded-xl bg-[#0d3853] px-5 !text-white hover:bg-[#195775] sm:w-auto">
                           {savingPlanOnly ? "Atualizando..." : "Atualizar plano"}
                         </Button>
                       </div>) : null}
                    </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Subdomínio</Label>
                        <div className="sig-dark-panel rounded-[22px] border border-slate-200 p-[3px] shadow-sm">
                          <Textarea
                            value={form.subdomain}
                            onChange={(event) => handleSetForm("subdomain", normalizeSubdomainInput(event.target.value))}
                            title={form.subdomain}
                            spellCheck={false}
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="sig-admin-input sig-admin-input-wrap resize-none border-0 bg-transparent text-[13px] font-medium leading-5 tracking-[-0.01em] text-slate-900 shadow-none"
                          />
                        </div>
                        <p className="text-xs text-slate-500">Use apenas o subdomínio, sem .sigapromunicipal.com.br.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Link de entrega</Label>
                        <div className="sig-dark-panel rounded-[22px] border border-slate-200 p-[3px] shadow-sm">
                          <Textarea
                            value={form.clientDeliveryLink}
                            onChange={(event) => handleSetForm("clientDeliveryLink", event.target.value)}
                            title={form.clientDeliveryLink}
                            spellCheck={false}
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="sig-admin-input sig-admin-input-wrap sig-admin-input-url resize-none border-0 bg-transparent text-[13px] font-medium leading-5 tracking-[-0.015em] text-slate-900 shadow-none"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
                      <div className="space-y-2 xl:col-span-6">
                        <Label>Mensalidade</Label>
                        <Input type="number" step="0.01" value={form.monthlyFee} onChange={(event) => handleSetForm("monthlyFee", Number(event.target.value))} className="sig-admin-input" />
                      </div>
                      <div className="space-y-2 xl:col-span-6">
                        <Label>Taxa de implantação</Label>
                        <Input type="number" step="0.01" value={form.setupFee} onChange={(event) => handleSetForm("setupFee", Number(event.target.value))} className="sig-admin-input" />
                      </div>
                    </div>
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
                    <div className="space-y-2 xl:col-span-4">
                      <Label>Contrato</Label>
                      <Input value={form.contractNumber} onChange={(event) => handleSetForm("contractNumber", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-2">
                      <Label>Início</Label>
                      <Input type="date" value={form.contractStart} onChange={(event) => handleSetForm("contractStart", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-2">
                      <Label>Fim</Label>
                      <Input type="date" value={form.contractEnd} onChange={(event) => handleSetForm("contractEnd", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-4">
                      <Label>Assinatura</Label>
                      <Select value={form.signatureMode} onValueChange={(value) => handleSetForm("signatureMode", value as SignatureMode)}>
                          <SelectTrigger className="sig-admin-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="eletronica">Eletrônica</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="icp_brasil" disabled>ICP-Brasil · requer provedor credenciado</SelectItem>
                          </SelectContent>
                        </Select>
                        <p role="note" data-icp-brazil-pending="true"
                          className="mt-2 text-xs leading-5 text-slate-700">
                          Assinaturas eletrônicas já funcionam conforme o perfil autorizado.
                          ICP-Brasil é opcional, mas só poderá ser ativada após integrar e
                          homologar um prestador que gere e valide assinaturas qualificadas
                          com certificado, cadeia de confiança e PDF original verificável.
                          A escolha cadastral não emite certificado ICP.
                        </p>
                      </div>
                    </div>
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
                    <div className="space-y-2 xl:col-span-4">
                      <Label>CNPJ</Label>
                      <Input value={form.cnpj} onChange={(event) => handleSetForm("cnpj", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-4">
                      <Label>Telefone</Label>
                      <Input value={form.phone} onChange={(event) => handleSetForm("phone", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-4">
                      <Label>E-mail oficial</Label>
                      <Input value={form.email} onChange={(event) => handleSetForm("email", event.target.value)} className="sig-admin-input" />
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
                    <div className="space-y-2 xl:col-span-7">
                      <Label>Site</Label>
                      <Input value={form.site} onChange={(event) => handleSetForm("site", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-5">
                      <Label>Secretaria principal</Label>
                      <Input value={form.secretariat} onChange={(event) => handleSetForm("secretariat", event.target.value)} className="sig-admin-input" />
                    </div>
                  </div>
                    <div className="space-y-2">
                      <Label>Endereço</Label>
                      <Input value={form.address} onChange={(event) => handleSetForm("address", event.target.value)} className="sig-admin-input" />
                    </div>
                  <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-12">
                    <div className="space-y-2 xl:col-span-5">
                      <Label>Diretoria</Label>
                      <Input value={form.directorate} onChange={(event) => handleSetForm("directorate", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-3">
                      <Label>Telefone da diretoria</Label>
                      <Input value={form.directorPhone} onChange={(event) => handleSetForm("directorPhone", event.target.value)} className="sig-admin-input" />
                    </div>
                    <div className="space-y-2 xl:col-span-4">
                      <Label>E-mail da diretoria</Label>
                      <Input value={form.directorEmail} onChange={(event) => handleSetForm("directorEmail", event.target.value)} className="sig-admin-input" />
                    </div>
                  </div>
                    <div className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
                      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-slate-950">Administradores da Prefeitura</p>
                          <p className="mt-1 text-sm text-slate-500">Equipe principal de implantação e operação.</p>
                        </div>
                        <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={addAdminRow}>
                          <Plus className="mr-2 h-4 w-4 text-sky-200" />
                          Adicionar
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {admins.map((admin) => (
                          <div key={admin.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-800/65 lg:grid-cols-12">
                            <div className="space-y-2 lg:col-span-4">
                              <Label>E-mail</Label>
                              <Input list={`admin-email-options-${admin.id}`} value={admin.email} onChange={(event) => updateAdminRow(admin.id, "email", event.target.value)} onBlur={(event) => applyKnownAdminEmail(admin.id, event.target.value)} className="sig-admin-input" />
                              <datalist id={`admin-email-options-${admin.id}`}>
                                {availableKnownUsers
                                  .filter((user) => !admin.email.trim() ||
                                    user.email.toLocaleLowerCase("pt-BR").includes(admin.email.trim().toLocaleLowerCase("pt-BR")))
                                  .slice(0, 25)
                                  .map((user) => (
                                  <option key={user.id} value={user.email} />
                                ))}
                              </datalist>
                            </div>
                            <div className="space-y-2 lg:col-span-3">
                              <Label>Nome</Label>
                              <Input value={admin.fullName} onChange={(event) => updateAdminRow(admin.id, "fullName", event.target.value)} className="sig-admin-input" />
                            </div>
                            <div className="space-y-2 lg:col-span-3">
                              <Label>Cargo</Label>
                              <Input value={admin.title} onChange={(event) => updateAdminRow(admin.id, "title", event.target.value)} className="sig-admin-input" />
                            </div>
                            <div className="space-y-2 lg:col-span-1">
                              <Label>Nível</Label>
                              <Select value={String(admin.accessLevel)} onValueChange={(value) => updateAdminRow(admin.id, "accessLevel", Number(value) as 2 | 3)}>
                                <SelectTrigger className="sig-admin-input">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="2">N2</SelectItem>
                                  <SelectItem value="3">N3</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end lg:col-span-1">
                              <Button type="button" variant="outline" className="sig-dark-action-btn h-12 w-full rounded-[18px] text-slate-50 hover:text-slate-50" onClick={() => removeAdminRow(admin.id)}>
                                <Trash2 className="h-4 w-4 text-rose-300" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <Button type="submit" data-shared-action="primary" data-master-form-command="save" className="h-11 w-full rounded-xl px-6 sm:w-auto" disabled={saving || savingPlanOnly}>
                        {saving ? "Salvando..." : isCreatingNewInstitution ? "Criar Prefeitura" : "Salvar alterações"}
                      </Button>
                      <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" disabled={saving || savingPlanOnly || orgBusy} onClick={resetForNewInstitution}>
                        {isCreatingNewInstitution ? "Limpar novo cadastro" : "Cadastrar outra Prefeitura"}
                      </Button>
                    </div>
            </form>
          </section>
        ) : null}

        {workspaceView === "organograma" ? (
          !activeTenant ? (
            <SectionCard title="Organograma municipal" description="Selecione uma Prefeitura na Carteira para administrar a estrutura interna." icon={Network}>
              <div data-premium-empty-state="municipality" className="flex min-w-0 flex-wrap items-center gap-4 rounded-2xl border p-4 sm:p-5">
                <div data-empty-icon="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"><Landmark className="h-5 w-5" aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <p data-empty-title="true" className="text-sm font-semibold">Nenhuma Prefeitura selecionada</p>
                  <p data-empty-copy="true" className="mt-1 text-sm leading-relaxed">Abra a Carteira e escolha a instituição que deseja administrar.</p>
                </div>
                <Button type="button" data-shared-action="primary" className="h-auto min-h-11 w-full rounded-xl sm:w-auto" onClick={() => openMasterSection("carteira")}>
                  Escolher Prefeitura
                </Button>
              </div>
            </SectionCard>
          ) : (
            <div data-master-organogram-layout="compact" className="min-w-0">
              <PageMainContent>
                <TableCard
                  title={`Organograma • ${activeTenant.name}`}
                  description="Estrutura exclusiva desta Prefeitura. O Master pode montar e ajustar a organização quando o cliente solicitar."
                  icon={Network}
                  actions={<Button type="button" variant="outline" disabled={orgBusy} onClick={() => openMasterSection("carteira")}>Trocar Prefeitura</Button>}
                >
                  <div className="space-y-5">
                    {departmentScopeId !== selectedTenantId ? (
                      <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm !text-slate-800">Organograma ainda não confirmado. As alterações estão bloqueadas até a consulta ser concluída.</p>
                    ) : activeMasterDepartments.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                        Esta Prefeitura ainda não possui organograma cadastrado.
                      </div>
                    ) : rootMasterDepartments.length === 0 ? (
                      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm !text-amber-950">Há unidades cadastradas, mas nenhuma unidade principal está disponível. Revise os vínculos da estrutura municipal.</p>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {rootMasterDepartments.map((department) => {
                          const children = activeMasterDepartments.filter((item) => item.parentDepartmentId === department.id);
                          const users = activeTenantUsers.filter((user) => user.department === department.name);
                          return (
                            <div key={department.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex items-start gap-3">
                                <div className="sig-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-sky-700">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{department.unitType}</p>
                                  <p className="mt-1 text-base font-semibold text-slate-950">{department.name}</p>
                                  <p className="mt-1 text-sm text-slate-500">{users.length} usuário(s) lotado(s)</p>
                                </div>
                              </div>
                              {children.length > 0 ? (
                                <div className="mt-4 space-y-2">
                                  {children.map((child) => (
                                    <div key={child.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                      <p className="text-sm font-semibold text-slate-900">{child.name}</p>
                                      <p className="mt-1 text-xs text-slate-500">{child.unitType}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TableCard>

                <SectionCard title="Lotação da equipe" description="O Master também pode posicionar usuários na estrutura interna quando estiver fazendo a implantação para o cliente." icon={Users2}>
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                    <div className="space-y-2">
                      <Label>Usuário</Label>
                      <Input value={assignmentUserSearch}
                        onChange={(event) => setAssignmentUserSearch(event.target.value)}
                        placeholder="Pesquisar nome ou e-mail do servidor"
                        aria-label="Pesquisar servidor para lotação"
                        className="h-10 rounded-xl bg-white" />
                      <p className="text-xs text-slate-500">{matchingAssignmentUsers.length} opção(ões) exibida(s) de {activeTenantUsers.length} usuários. Refine a pesquisa para localizar qualquer cadastro.</p>
                      <Select value={assignmentUserId || "__none"} onValueChange={(value) => setAssignmentUserId(value === "__none" ? "" : value)}>
                        <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Selecione</SelectItem>
                          {matchingAssignmentUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} • {user.email}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade</Label>
                      <Select value={assignmentDepartmentId || "__none"} onValueChange={(value) => setAssignmentDepartmentId(value === "__none" ? "" : value)}>
                        <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sem lotação</SelectItem>
                          {activeMasterDepartments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" disabled={!assignmentUserId || orgBusy || departmentScopeId !== selectedTenantId} className="h-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-900" onClick={() => void handleMasterAssignDepartment()}>
                      Salvar lotação
                    </Button>
                  </div>
                </SectionCard>
              </PageMainContent>

              <PageSideContent>
                <SectionCard
                  title="Montar estrutura"
                  description="As alterações ficam somente na Prefeitura selecionada."
                  icon={Plus}
                  contentClassName="space-y-4"
                >
                  <form data-master-organogram-form="true" className="grid min-w-0 gap-3" onSubmit={handleMasterCreateDepartment}>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Prefeitura</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{activeTenant.name}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Nome da unidade</Label>
                      <Input value={orgForm.name} onChange={(event) => setOrgForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Financeiro, Protocolo, Obras" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={orgForm.unitType} onValueChange={(value) => setOrgForm((current) => ({ ...current, unitType: value }))}>
                        <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="secretaria">Secretaria</SelectItem>
                          <SelectItem value="diretoria">Diretoria</SelectItem>
                          <SelectItem value="departamento">Departamento</SelectItem>
                          <SelectItem value="setor">Setor</SelectItem>
                          <SelectItem value="coordenadoria">Coordenadoria</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade superior</Label>
                      <Select value={orgForm.parentDepartmentId || "__root"} onValueChange={(value) => setOrgForm((current) => ({ ...current, parentDepartmentId: value === "__root" ? "" : value }))}>
                        <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__root">Nível principal</SelectItem>
                          {activeMasterDepartments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Input value={orgForm.description} onChange={(event) => setOrgForm((current) => ({ ...current, description: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail da unidade</Label>
                      <Input type="email" value={orgForm.email} onChange={(event) => setOrgForm((current) => ({ ...current, email: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={orgForm.phone} onChange={(event) => setOrgForm((current) => ({ ...current, phone: event.target.value }))} />
                    </div>
                    <Button type="submit" data-shared-action="primary" disabled={orgBusy || departmentScopeId !== selectedTenantId || !orgForm.name.trim()} className="h-11 w-full rounded-xl">
                      {orgBusy ? "Salvando..." : "Adicionar unidade"}
                    </Button>
                  </form>
                </SectionCard>
              </PageSideContent>
            </div>
          )
        ) : null}

        {workspaceView === "usuarios" || visitedRegistries.usuarios ? (
          <div data-master-preserved-panel="usuarios" hidden={workspaceView !== "usuarios"} style={workspaceView !== "usuarios" ? { display: "none" } : undefined}>
          <PageMainContent className="gap-6">
            <MasterUserGovernance
              institutions={institutionCatalog}
              users={sessionUsers}
              getAvatarProfile={(user) => getUserProfile(user.id, user.email) ?? null}
              renderDetails={renderUserCard}
              onManageMunicipality={handleSelectTenant}
              onPlatformStaffCreated={refreshRemoteStore}
            />
          </PageMainContent>
          </div>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
