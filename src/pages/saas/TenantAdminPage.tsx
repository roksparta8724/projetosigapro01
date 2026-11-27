import { municipalAdminSection, MUNICIPAL_ADMIN_SECTIONS } from "@/lib/municipalAdminNavigation";
import { findMunicipalUnitNameConflict, suggestDistinctMunicipalUnitName } from "@/lib/municipalUnitName";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ClipboardList, Clock3, ChevronDown, Network, PencilLine, Plus, Search, ShieldAlert, ShieldCheck, Undo2, UserCog, UserRoundCog, UserX, Users2, Wallet } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { MunicipalOrganizationChart } from "@/components/platform/MunicipalOrganizationChart";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { DEFAULT_AVATAR_EDITOR_DIAMETER } from "@/lib/avatarCropGeometry";
import { resolveProfileAvatarDisplayUrl } from "@/lib/profileAvatarDisplay";
import {
  buildProcessPath, accessLevelLabels, getProcessPaymentGuides, matchesOperationalScope, roleLabels, roleSuggestedTitles, statusLabel, statusTone, type AccountStatus, type ProcessRecord, type SessionUser, type UserRole } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { PlanCapacityCard } from "@/components/platform/PlanCapacityCard";
import { usePlanCapacityLive } from "@/hooks/usePlanCapacityLive";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";
import {hasPrematureAnalysisStage,isAdministrativelyClosed,isVerifiedTechnicalAnalysis} from "@/lib/processOperationalIntegrity";
import { CompactUserRegistry } from "@/components/platform/CompactUserRegistry";
import { MunicipalStaffAssignmentsEditor } from "@/components/platform/MunicipalStaffAssignmentsEditor";
import {MunicipalIdentityPrefix} from "@/components/platform/MunicipalIdentityPrefix";
import {useMunicipalIdentityBadges} from "@/hooks/useMunicipalAuthority";
import {MunicipalAuthorityDesignationsEditor} from "@/components/platform/MunicipalAuthorityDesignationsEditor";
import {authorityUnitPresets} from "@/lib/municipalAuthorityDesignations";
import { adjunctUnitTemplates, suggestMunicipalUnitCode, municipalUnitEditorType, changeMunicipalUnitEditorType } from "@/lib/municipalUnitCodes";
import { isSwitchableMunicipalStaffRole } from "@/lib/municipalStaffAssignments";
import { PremiumProcessRegistry as CompactProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import { MunicipalOverviewSubnav } from "@/components/platform/MunicipalOverviewSubnav";
import { isMunicipalOverviewSubpagePath, municipalOverviewSubpageFromPath } from "@/lib/municipalOverviewSubpages";
import { buildPlanCapacityMetrics } from "@/lib/planUsageDashboard";

import {
  assignRemoteProfileDepartment,
  listRemoteInternalMunicipalDepartments,
  listRemoteMunicipalUserRegistry,
  upsertRemoteMunicipalDepartment,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import { getMunicipalityLogoOpenUrl } from "@/integrations/r2/client";

const tenantRoles: UserRole[] = ["prefeitura_admin", "prefeitura_supervisor", "analista", "financeiro", "setor_intersetorial", "fiscal", "profissional_externo", "property_owner", "proprietario_consulta"];

const municipalProfilePresets = [
  { key: "secretario_municipal", label: "Secretário Municipal", role: "prefeitura_supervisor" as UserRole, accessLevel: "3" },
  { key: "diretor_municipal", label: "Diretor Municipal", role: "prefeitura_supervisor" as UserRole, accessLevel: "2" },
  { key: "chefe_divisao", label: "Chefe de Divisão", role: "prefeitura_supervisor" as UserRole, accessLevel: "2" },
  { key: "assistente_administrativo", label: "Assistente Administrativo", role: "setor_intersetorial" as UserRole, accessLevel: "1" },
  { key: "auxiliar_administrativo", label: "Auxiliar Administrativo", role: "setor_intersetorial" as UserRole, accessLevel: "1" },
] as const;

const urbanismPositionOptions = [
  "Técnico em Edificações",
  "Fiscal de Obras",
  "Cadista",
  "Topógrafo",
  "Arquiteto",
  "Engenheiro Civil",
  "Engenheiro",
] as const;

function getMunicipalProfileSelectValue(role: UserRole, profileLabel?: string) {
  const normalizedLabel = (profileLabel || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  const preset = municipalProfilePresets.find((item) => {
    const candidate = item.label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    return normalizedLabel === candidate;
  });
  return preset?.key ?? role;
}

function applyMunicipalProfileSelection<
  T extends { role: UserRole; profileLabel?: string; accessLevel: string; title?: string },
>(
  value: string,
  current: T,
) {
  const preset = municipalProfilePresets.find((item) => item.key === value);
  if (preset) {
    return {
      ...current,
      role: preset.role,
      profileLabel: preset.label,
      title: preset.label,
      accessLevel: preset.accessLevel,
    };
  }
  const role = value as UserRole;
  const suggestedTitle = roleSuggestedTitles[role] || "";
  return {
    ...current,
    role,
    profileLabel: "",
    title:
      "title" in current &&
      (!current.title?.trim() ||
        Object.values(roleSuggestedTitles).includes(current.title as string))
        ? suggestedTitle
        : current.title,
  };
}

function getMunicipalProfileLabel(user: SessionUser) {
  const isExternal =
    user.role === "profissional_externo" ||
    user.role === "property_owner" ||
    user.role === "proprietario_consulta";

  if (isExternal) {
    return user.profileLabel?.trim() || user.title?.trim() || roleLabels[user.role];
  }

  const municipalPresetLabel = municipalProfilePresets.find(
    (item) =>
      item.role === user.role &&
      item.label.localeCompare(user.profileLabel?.trim() || "", "pt-BR", {
        sensitivity: "accent",
      }) === 0,
  )?.label;

  return municipalPresetLabel || roleLabels[user.role];
}

function sameMunicipalLabel(left?: string | null, right?: string | null) {
  const normalize = (value?: string | null) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("pt-BR");
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && a === b);
}

function getUserDepartmentLabel(user: SessionUser) {
  const department = user.department?.trim();
  if (department) return department;

  if (
    user.role === "profissional_externo" ||
    user.role === "property_owner" ||
    user.role === "proprietario_consulta"
  ) {
    return "Acesso Externo";
  }

  return "Não informado";
}

function normalizeDepartmentIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveMunicipalRoleFromDepartment(
  departmentName: string,
  currentRole: UserRole,
): UserRole {
  if (!departmentName.trim()) return currentRole;

  if (
    currentRole === "master_admin" ||
    currentRole === "master_ops" ||
    currentRole === "prefeitura_admin" ||
    currentRole === "prefeitura_supervisor"
  ) {
    return currentRole;
  }

  const normalized = normalizeDepartmentIdentity(departmentName);

  if (/urbanismo|obras|engenharia|planejamento|licenciamento|aprovacao/.test(normalized)) {
    return "analista";
  }

  if (/finance|financa|fazenda|tesour|arrecad|tribut/.test(normalized)) {
    return "financeiro";
  }

  if (/fiscaliz|postura/.test(normalized)) {
    return "fiscal";
  }

  if (/administracao|administrativo|protocolo|triagem|recepcao|expediente|atendimento/.test(normalized)) {
    return "setor_intersetorial";
  }

  // Qualquer unidade cadastrada no organograma é vínculo funcional com a Prefeitura.
  return "setor_intersetorial";
}

function applyMunicipalDepartmentSelection<
  T extends {
    role: UserRole;
    profileLabel?: string;
    accessLevel: string;
    department: string;
  },
>(
  departmentName: string,
  current: T,
) {
  if (!departmentName) {
    return { ...current, department: "" };
  }

  const nextRole = resolveMunicipalRoleFromDepartment(departmentName, current.role);
  return {
    ...current,
    department: departmentName,
    role: nextRole,
    profileLabel: nextRole === "prefeitura_supervisor" ? current.profileLabel : "",
    accessLevel:
      nextRole === "prefeitura_admin"
        ? "3"
        : nextRole === "prefeitura_supervisor"
          ? (current.accessLevel === "3" ? "3" : "2")
          : current.accessLevel || "1",
  };
}
type UserSegment = "todos" | "externos" | "analistas" | "fiscal" | "financeiro" | "administradores" | "outros";
type WorkspaceView = "visao-geral" | "fila" | "usuarios" | "organograma" | "historico";

type MunicipalActivityItem = {
  processId: string;
  protocol: string;
  title: string;
  detail: string;
  actor: string;
  at: string;
  status: ProcessRecord["status"];
};

function municipalActivityTitle(title: string) {
  const label = title.trim();
  const eventLabels: Record<string, string> = {
    triagem_automatica: "Triagem automática",
    processo_oficializado: "Processo oficializado",
    status_change: "Alteração de situação",
    processo_atualizado: "Processo atualizado",
    documento_anexado: "Documento anexado",
  };
  return eventLabels[label.toLowerCase()] ??
    (label.includes("_") ? label.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase()) : label);
}

function MunicipalActivityCard({ item, onOpenProcess }: {
  item: MunicipalActivityItem;
  onOpenProcess: () => void;
}) {
  return (
    <details data-municipal-activity-card="true"
      className="group min-w-0 max-w-full overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm [overflow-wrap:anywhere] open:border-sky-200">
      <summary className="cursor-pointer list-none px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-950">{item.protocol}</span>
          <Badge variant="outline" className={`${statusTone(item.status)} max-w-full whitespace-normal break-words`}>
            {statusLabel(item.status)}
          </Badge>
          <time className="ml-auto text-[11px] tabular-nums text-slate-500">{item.at}</time>
        </div>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800"
            title={item.title}>{municipalActivityTitle(item.title)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-700 underline-offset-4 group-hover:underline">
            <span className="group-open:hidden">Ver detalhes</span>
            <span className="hidden group-open:inline">Ocultar detalhes</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </span>
        </div>
      </summary>
      <div className="min-w-0 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
          {item.detail || "Sem descrição adicional registrada."}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
          <span className="min-w-0 break-words">Registrado por: {item.actor || "Sistema SIGAPRO"}</span>
          <button type="button" onClick={onOpenProcess}
            className="font-semibold text-sky-700 underline underline-offset-4 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
            Consultar processo
          </button>
        </div>
      </div>
    </details>
  );
}

function getStatusTone(status: AccountStatus) {
  if (status === "blocked") return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
  if (status === "inactive") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}
function getStatusLabel(status: AccountStatus) {
  if (status === "blocked") return "Bloqueado";
  if (status === "inactive") return "Inativo";
  return "Ativo";
}
function matchesSegment(user: SessionUser, segment: UserSegment) {
  if (segment === "externos") return user.role === "profissional_externo" || user.role === "proprietario_consulta" || user.role === "property_owner";
  if (segment === "analistas") return user.role === "analista" || user.role === "prefeitura_supervisor";
  if (segment === "fiscal") return user.role === "fiscal";
  if (segment === "financeiro") return user.role === "financeiro";
  if (segment === "administradores") return user.role === "prefeitura_admin" || user.role === "master_admin" || user.role === "master_ops";
  if (segment === "outros") return user.role === "setor_intersetorial";
  return true;
}
function getPriorityTone(process: ProcessRecord) {
  if (process.sla.breached) return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
  if (process.sla.hoursRemaining <= 12) return "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function resolveMunicipalCoatOfArmsPreview(reference?: string | null) {
  const raw = String(reference || "").trim();
  if (!raw) return "";
  if (raw.startsWith("r2:")) {
    return getMunicipalityLogoOpenUrl(raw.slice(3).trim().replace(/^\/+/, ""));
  }
  return raw;
}

export function TenantAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const overviewSubpage = municipalOverviewSubpageFromPath(location.pathname);
  const isNestedOverview = isMunicipalOverviewSubpagePath(location.pathname);
  const { session } = usePlatformSession();
  const { isAuthenticated, authResolved, authenticatedUserId, authenticatedProfileId } = useAuthGateway();
  const authorizedAvatarViewerId = isAuthenticated && authResolved
    ? (authenticatedUserId || authenticatedProfileId) : null;
  const planEntitlements = usePlanEntitlements();
  const { municipality, scopeId, name: municipalityName } = useMunicipality();
  const { sessionUsers, institutions, updateTenantUser, setUserAccountStatus, deleteUserAccount, processes, getUserProfile, getInstitutionSettings, refreshRemoteStore, remoteSyncedForCurrentUser, dataError: platformDataError, loading: platformDataLoading } = usePlatformData();
  // The authenticated municipality wins over a stale branding/selected tenant.
  const effectiveScopeId = session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null;
  const planMunicipalityId = session.municipalityId ?? session.tenantId ?? null;
  const planCapacity = usePlanCapacityLive(planMunicipalityId, {
    enabled: Boolean(planMunicipalityId && authorizedAvatarViewerId) && session.role === "prefeitura_admin",
    scopeKey: authorizedAvatarViewerId || "",
    intervalMs: 8000,
  });
  const workspaceView:WorkspaceView=municipalAdminSection(location.pathname,location.search)??"fila";
  const [municipalRegistryRefresh, setMunicipalRegistryRefresh] = useState(0);
  const [municipalRegistry, setMunicipalRegistry] = useState<{
    identity: string; municipalityId: string; loaded: boolean;
    users: SessionUser[]; error: string | null;
  }>({ identity: "", municipalityId: "", loaded: false, users: [], error: null });
  const municipalRegistryConfirmed =
    municipalRegistry.loaded && municipalRegistry.identity === session.id &&
    municipalRegistry.municipalityId === effectiveScopeId;

  // Read the signed-in municipality roster independently from the general
  // bootstrap, which may continue even if a non-critical profile SELECT failed.
  useEffect(() => {
    if (workspaceView !== "usuarios" || !effectiveScopeId || !session.id ||
        session.id === "unknown" ||
        !["prefeitura_admin", "prefeitura_supervisor"].includes(session.role)) return;
    let active = true;
    setMunicipalRegistry({
      identity: session.id, municipalityId: effectiveScopeId,
      loaded: false, users: [], error: null,
    });
    void listRemoteMunicipalUserRegistry()
      .then((result) => {
        if (!active) return;
        if (!result || result.municipalityId !== effectiveScopeId) {
          throw new Error("A Prefeitura autenticada não corresponde aos cadastros retornados pelo banco.");
        }
        setMunicipalRegistry({
          identity: session.id, municipalityId: effectiveScopeId,
          loaded: true, users: result.users, error: null,
        });
      })
      .catch((error) => {
        if (!active) return;
        setMunicipalRegistry({
          identity: session.id, municipalityId: effectiveScopeId, loaded: false,
          users: [],
          error: error instanceof Error ? error.message : "A lista de servidores não pôde ser confirmada.",
        });
      });
    return () => { active = false; };
  }, [effectiveScopeId, session.id, session.role, workspaceView, municipalRegistryRefresh]);

  const activeInstitution = municipality ?? institutions.find((item) => item.id === effectiveScopeId) ?? null;
  const tenantUsers = useMemo(() => {
    if (municipalRegistryConfirmed) return municipalRegistry.users;
    return sessionUsers.filter((user) => matchesOperationalScope(effectiveScopeId, user));
  }, [effectiveScopeId, sessionUsers, municipalRegistryConfirmed, municipalRegistry.users]);
  const tenantProcesses = useMemo(() => processes.filter((process) => matchesOperationalScope(effectiveScopeId, process)), [effectiveScopeId, processes]);
  const internalTenantUsers = useMemo(
    () =>
      tenantUsers.filter(
        (user) => !["profissional_externo", "proprietario_consulta", "property_owner"].includes(user.role),
      ),
    [tenantUsers],
  );
  const currentUnit = municipality?.secretariatName || session.department || session.title || "Administração da Prefeitura";
  const tenantSettings = getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const coatOfArmsPreviewUrl = resolveMunicipalCoatOfArmsPreview(tenantSettings?.brasaoUrl);
  const hasPendingGuide = (process: ProcessRecord) =>
    getProcessPaymentGuides(process, tenantSettings).some((guide) => guide.status === "pendente");
  const availablePositionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            currentUnit,
            "Secretário",
            "Diretor",
            "Chefe de Divisão",
            "Assistente Administrativo",
            "Auxiliar Administrativo",
            ...urbanismPositionOptions,
            ...tenantUsers.flatMap((user) => [user.title, user.department]),
            ...tenantRoles.map((role) => roleSuggestedTitles[role]),
          ].filter((value): value is string => Boolean(value?.trim())),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-BR")),
    [currentUnit, tenantUsers],
  );

  const [statusMessage, setStatusMessage] = useState("");
  const [orgError,setOrgError]=useState(false);
  const [editStatusMessage, setEditStatusMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [queueSearch] = useState("");
  const [overviewProcessStatus, setOverviewProcessStatus] = useState<"todos" | "andamento" | "pendentes" | "concluidos">("todos");
  const [overviewProcessSearch, setOverviewProcessSearch] = useState("");
  const [overviewActivityPage, setOverviewActivityPage] = useState(1);
  const [overviewPendingSearch, setOverviewPendingSearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [segment, setSegment] = useState<UserSegment>("todos");
  const [userPage, setUserPage] = useState(1);

  // A direct link, browser back/forward, or copied URL must always display the
  // requested overview subpage instead of a previously selected operational tab.
  useEffect(() => {
    if (location.pathname.startsWith("/prefeitura/visao-geral/") && !isNestedOverview) {
      navigate("/prefeitura", { replace: true });
      return;
    }
  }, [isNestedOverview, location.pathname, navigate]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | AccountStatus>("todos");
  const [roleFilter, setRoleFilter] = useState<"todos" | UserRole>("todos");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "analista" as UserRole, profileLabel: "", title: "", accessLevel: "1", department: "", userType: "" });
  const [departments, setDepartments] = useState<MunicipalDepartmentRecord[]>([]);
  const [orgBusy, setOrgBusy] = useState(false);
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [orgForm, setOrgForm] = useState({
    code: "",
    name: "",
    unitType: "departamento",
    parentDepartmentId: "",
    description: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    let active = true;
    if (!effectiveScopeId) {
      setDepartments([]);
      return () => { active = false; };
    }
    void listRemoteInternalMunicipalDepartments(effectiveScopeId)
      .then((rows) => {
        if (active) setDepartments(rows);
      })
      .catch((error) => {
        if (active) setStatusMessage(error instanceof Error ? error.message : "Não foi possível carregar o organograma.");
      });
    return () => { active = false; };
  }, [effectiveScopeId]);

  const activeDepartments = useMemo(
    () => departments.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")),
    [departments],
  );

  useEffect(() => {
    setUserPage(1);
  }, [search, segment, statusFilter, roleFilter, effectiveScopeId]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tenantUsers.filter((user) => {
      if (!matchesSegment(user, segment)) return false;
      if (statusFilter !== "todos" && user.accountStatus !== statusFilter) return false;
      if (roleFilter !== "todos" && user.role !== roleFilter) return false;
      if (!term) return true;
      return [user.name, user.email, user.title, user.department, user.userType].filter(Boolean).some((value) => value?.toLowerCase().includes(term));
    });
  }, [roleFilter, search, segment, statusFilter, tenantUsers]);

  const visibleIdentityIds=useMemo(()=>session.role==="prefeitura_admin"&&workspaceView==="usuarios"?paginateMunicipalItems(filteredUsers,userPage,20).items.map(user=>user.id):[],[filteredUsers,userPage,session.role,workspaceView]);
  const identityBadges=useMunicipalIdentityBadges(effectiveScopeId||"",session.id,visibleIdentityIds,String(municipalRegistryRefresh));
  const metrics = useMemo(() => ({ protocolsInProgress: tenantProcesses.filter((process) => !isAdministrativelyClosed(process)).length, inAnalysis: tenantProcesses.filter(isVerifiedTechnicalAnalysis).length, pendingPayments: tenantProcesses.filter((process) => hasPendingGuide(process)).length, approved: tenantProcesses.filter((process) => process.status === "deferido").length }), [tenantProcesses, tenantSettings]);
  const inconsistentTriageCount = useMemo(() =>
    tenantProcesses.filter(hasPrematureAnalysisStage).length, [tenantProcesses]);
  const criticalAlerts = useMemo(() => tenantProcesses.filter((process) =>
    !isAdministrativelyClosed(process) &&
    (process.sla.breached || process.sla.hoursRemaining <= 12)
  ), [tenantProcesses]);
  const pendingSectorItems = useMemo(() => [{ label: "Triagem", value: tenantProcesses.filter((process) => process.triage.status !== "concluido").length, helper: "Entradas aguardando conferência documental" }, { label: "Análise", value: tenantProcesses.filter(isVerifiedTechnicalAnalysis).length, helper: "Processos em parecer técnico" }, { label: "Financeiro", value: tenantProcesses.filter((process) => hasPendingGuide(process)).length, helper: "Processos com guia emitida ainda sem compensação" }], [tenantProcesses, tenantSettings]);
  const recentActivity = useMemo(() => tenantProcesses.flatMap((process) => process.timeline.slice(0, 2).map((entry) => ({ processId: process.id, protocol: process.protocol, title: entry.title, detail: entry.detail, actor: entry.actor, at: entry.at, status: process.status }))).sort((a, b) => {
    const aTime = Date.parse(a.at);
    const bTime = Date.parse(b.at);
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  }), [tenantProcesses]);
  const recentApprovals = useMemo(() => tenantProcesses.filter((process) => process.status === "deferido").slice(0, 5), [tenantProcesses]);
  const orderedAllProcesses = useMemo(() => [...tenantProcesses].sort((a, b) => {
    const aClosed = isAdministrativelyClosed(a);
    const bClosed = isAdministrativelyClosed(b);
    if (aClosed !== bClosed) return Number(aClosed) - Number(bClosed);
    const aPriority = a.sla.breached ? 2 : a.sla.hoursRemaining <= 12 ? 1 : 0;
    const bPriority = b.sla.breached ? 2 : b.sla.hoursRemaining <= 12 ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return a.sla.hoursRemaining - b.sla.hoursRemaining;
  }), [tenantProcesses]);
  const mainQueue = useMemo(() => orderedAllProcesses.filter((process) =>
    !isAdministrativelyClosed(process)
  ), [orderedAllProcesses]);
  const actionRequired = useMemo(() => orderedAllProcesses.filter((process) =>
    !isAdministrativelyClosed(process) &&
    (process.requirements.some((item) => item.status === "aberta" || item.status === "respondida") ||
      process.sla.breached || process.sla.hoursRemaining <= 12 || hasPendingGuide(process))
  ), [orderedAllProcesses, tenantSettings]);
  const filteredQueue = useMemo(() => {
    const term = queueSearch.trim().toLocaleLowerCase("pt-BR");
    return term ? mainQueue.filter((process) =>
      [process.protocol, process.title, process.ownerName, process.technicalLead, process.address]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term))) : mainQueue;
  }, [mainQueue, queueSearch]);
  const overviewProcesses = useMemo(() => orderedAllProcesses.filter((process) => {
    const term = overviewProcessSearch.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch = !term || [process.protocol, process.title, process.ownerName, process.technicalLead, process.address]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
    if (!matchesSearch) return false;
    const completed = isAdministrativelyClosed(process);
    if (overviewProcessStatus === "concluidos") return completed;
    if (overviewProcessStatus === "andamento") return !completed;
    if (overviewProcessStatus === "pendentes") return !completed && (
      process.sla.breached || process.sla.hoursRemaining <= 12 ||
      ["exigencia", "pendencia_documental", "pagamento_pendente"].includes(process.status) ||
      process.requirements.some((item) => item.status === "aberta" || item.status === "respondida") ||
      hasPendingGuide(process)
    );
    return true;
  }), [orderedAllProcesses, overviewProcessSearch, overviewProcessStatus, tenantSettings]);
  const overviewPendingProcesses = useMemo(() => {
    const term = overviewPendingSearch.trim().toLocaleLowerCase("pt-BR");
    return term ? actionRequired.filter((process) =>
      [process.protocol, process.title, process.ownerName, process.technicalLead, process.address]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term))
    ) : actionRequired;
  }, [actionRequired, overviewPendingSearch]);
  const overviewActivityPageData = paginateMunicipalItems(recentActivity, overviewActivityPage, 15);
  const planSnapshot = planCapacity.rows[0];
  const planUsersMetric = planSnapshot ? buildPlanCapacityMetrics(planSnapshot).find((item) => item.key === "users") : null;
  const historyPageData = paginateMunicipalItems(recentActivity, historyPage, 20);
  useEffect(() => {
    setOverviewActivityPage(1);
    setOverviewPendingSearch("");
    setOverviewProcessStatus("todos");
    setOverviewProcessSearch("");
  }, [effectiveScopeId]);
  const openMunicipalProcess = (processId: string) => {
    const found = tenantProcesses.find((process) => process.id === processId);
    if (found) navigate(buildProcessPath(found));
  };
  const dispatchRows = useMemo(() => tenantProcesses.flatMap((process) => process.dispatches.map((dispatch) => ({ id: `${process.id}-${dispatch.id}`, processId: process.id, protocol: process.protocol, title: process.title, from: dispatch.from, to: dispatch.to, subject: dispatch.subject, dueDate: dispatch.dueDate, status: dispatch.status, priority: dispatch.priority ?? "media", assignedTo: dispatch.assignedTo || "", currentFolder: process.processControl?.currentFolder || dispatch.to || process.sla.currentStage }))), [tenantProcesses]);
  const receivedForCurrentUnit = useMemo(() => dispatchRows.filter((item) => item.to.toLowerCase().includes(currentUnit.toLowerCase()) || currentUnit.toLowerCase().includes(item.to.toLowerCase()) || item.currentFolder.toLowerCase().includes(currentUnit.toLowerCase())), [currentUnit, dispatchRows]);
  const generatedByCurrentUnit = useMemo(() => dispatchRows.filter((item) => item.from.toLowerCase().includes(currentUnit.toLowerCase()) || currentUnit.toLowerCase().includes(item.from.toLowerCase())), [currentUnit, dispatchRows]);
  const assignedMunicipal = useMemo(() => dispatchRows.filter((item) => item.assignedTo).slice(0, 6), [dispatchRows]);
  const criticalDispatches = useMemo(() => dispatchRows.filter((item) => item.priority === "critica" || item.priority === "alta" || item.status === "aguardando").slice(0, 5), [dispatchRows]);
  const restrictedTransitCount = useMemo(() => tenantProcesses.filter((process) => (process.processControl?.externalTransitView ?? "completo") === "restrito").length, [tenantProcesses]);
  const unitSummary = useMemo(() => [
    { label: "Recebidos", value: receivedForCurrentUnit.length, helper: "Caixa atual da Prefeitura" },
    { label: "Gerados", value: generatedByCurrentUnit.length, helper: "Despachos emitidos pela unidade" },
    { label: "Restritos", value: restrictedTransitCount, helper: "Fluxos ocultos ao acesso externo" },
  ], [generatedByCurrentUnit.length, receivedForCurrentUnit.length, restrictedTransitCount]);
  const startEdit = (user: SessionUser) => { setEditStatusMessage(""); setEditingUserId(user.id); setEditForm({ name: user.name, email: user.email, role: user.role, profileLabel: user.profileLabel || "", title: user.title, accessLevel: String(user.accessLevel), department: user.department || "", userType: user.userType || (["profissional_externo", "proprietario_consulta", "property_owner"].includes(user.role) ? "Externo" : "Interno") }); };
  const runUserCommand = async (userId: string, command: () => Promise<SessionUser | null>, success: (user: SessionUser) => string) => {
    if (savingUserId) return false;
    setSavingUserId(userId);
    setStatusMessage("Salvando acesso no banco...");
    try {
      const updated = await command();
      if (!updated) throw new Error("Usuário não encontrado no banco.");
      setMunicipalRegistryRefresh((current) => current + 1);
      setStatusMessage(success(updated));
      return true;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar o acesso.");
      return false;
    } finally {
      setSavingUserId(null);
    }
  };
  const handleSaveEdit = async (userId: string) => {
    const normalizedName = editForm.name.trim();
    const normalizedTitle = editForm.title.trim();
    const selectedDepartment = activeDepartments.find((item) => item.name === editForm.department) ?? null;

    setEditStatusMessage("");

    if (!normalizedName) {
      setEditStatusMessage("Informe o nome do funcionário antes de salvar.");
      return;
    }
    if (!normalizedTitle) {
      setEditStatusMessage("Informe o cargo, função ou profissão do funcionário.");
      return;
    }
    if (!["profissional_externo", "proprietario_consulta", "property_owner"].includes(editForm.role) && !editForm.department.trim()) {
      setEditStatusMessage("Selecione o departamento do funcionário. O acesso interno é limitado ao departamento escolhido.");
      return;
    }
    if (savingUserId) return;

    setSavingUserId(userId);
    setEditStatusMessage("Salvando alterações...");

    try {
      const resolvedRole = editForm.department.trim()
        ? resolveMunicipalRoleFromDepartment(editForm.department, editForm.role)
        : editForm.role;

      const updated = await updateTenantUser(userId, {
        name: normalizedName,
        role: resolvedRole,
        profileLabel: ["profissional_externo","prefeitura_supervisor"].includes(resolvedRole) ? editForm.profileLabel : "",
        title: normalizedTitle,
        department: selectedDepartment?.name ?? editForm.department.trim(),
        userType: resolvedRole === "profissional_externo" ? "Profissional externo" : "Funcionário da Prefeitura",
        accessLevel: Number(editForm.accessLevel) as 1 | 2 | 3,
      });

      if (!updated) {
        throw new Error("Usuário não encontrado no banco.");
      }

      const persistedTitle = (updated.title || "").trim();
      if (persistedTitle.localeCompare(normalizedTitle, "pt-BR", { sensitivity: "accent" }) !== 0) {
        throw new Error(
          `O banco não confirmou o cargo "${normalizedTitle}". Valor retornado: "${persistedTitle || "vazio"}".`,
        );
      }

      const persistedProfileLabel = (updated.profileLabel || "").trim();
      const requestedProfileLabel = editForm.profileLabel.trim();
      if (
        requestedProfileLabel &&
        persistedProfileLabel.localeCompare(requestedProfileLabel, "pt-BR", { sensitivity: "accent" }) !== 0
      ) {
        throw new Error(
          `O banco não confirmou o perfil "${requestedProfileLabel}". Valor retornado: "${persistedProfileLabel || "vazio"}".`,
        );
      }

      if (effectiveScopeId) {
        await assignRemoteProfileDepartment({
          municipalityId: effectiveScopeId,
          profileId: userId,
          departmentId: selectedDepartment?.id ?? null,
        });
      }

      await refreshRemoteStore();
      setMunicipalRegistryRefresh((current) => current + 1);
      setEditStatusMessage("Alterações salvas no banco e confirmadas com sucesso.");
    } catch (error) {
      setEditStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    } finally {
      setSavingUserId(null);
    }
  };

  const suggestedOrgCode = suggestMunicipalUnitCode(orgForm.name, orgForm.unitType, departments, editingDepartmentId);
  const orgNameConflict = findMunicipalUnitNameConflict(orgForm.name,departments,editingDepartmentId);
  const distinctOrgName = orgNameConflict ? suggestDistinctMunicipalUnitName(orgForm.name,orgForm.unitType,departments,editingDepartmentId,orgForm.parentDepartmentId,orgForm.code) : "";
  const handleCreateDepartment = async (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveScopeId || !orgForm.name.trim() || orgBusy) return;
    setOrgError(false);
    if(orgNameConflict){setOrgError(true);setStatusMessage("O nome já pertence a outra unidade. Escolha um nome distinto.");return;}
    if (
      !editingDepartmentId &&
      planEntitlements.maxDepartments != null &&
      activeDepartments.length >= planEntitlements.maxDepartments
    ) {
      setOrgError(true);setStatusMessage(
        `Limite do plano atingido: ${activeDepartments.length}/${planEntitlements.maxDepartments} unidades no organograma.`,
      );
      return;
    }
    setOrgBusy(true);
    setStatusMessage("Salvando unidade no organograma...");
    try {
      await upsertRemoteMunicipalDepartment({
        municipalityId: effectiveScopeId,
        departmentId: editingDepartmentId,
        code: orgForm.code.trim().toUpperCase(),
        name: orgForm.name.trim(),
        unitType: orgForm.unitType,
        parentDepartmentId: orgForm.parentDepartmentId || null,
        description: orgForm.description.trim(),
        email: orgForm.email.trim(),
        phone: orgForm.phone.trim(),
        sortOrder: editingDepartmentId ? departments.find(d=>d.id===editingDepartmentId)?.sortOrder ?? 100 : Math.max(0,...departments.map(d=>d.sortOrder))+10,
      });
      const rows = await listRemoteInternalMunicipalDepartments(effectiveScopeId);
      setDepartments(rows);
      setOrgForm({ code: "", name: "", unitType: "departamento", parentDepartmentId: "", description: "", email: "", phone: "" });
      setEditingDepartmentId(null);
      setStatusMessage(editingDepartmentId ? "Unidade atualizada no organograma da Prefeitura." : "Unidade adicionada ao organograma da Prefeitura.");
    } catch (error) {
      setOrgError(true);setStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar a unidade.");
    } finally {
      setOrgBusy(false);
    }
  };
  const handleEditDepartment = (department: MunicipalDepartmentRecord) => {
    setOrgError(false);
    setEditingDepartmentId(department.id);
    setOrgForm({
      code: department.code || "",
      name: department.name,
      unitType: department.unitType || "departamento",
      parentDepartmentId: department.parentDepartmentId || "",
      description: department.description || "",
      email: department.email || "",
      phone: department.phone || "",
    });
    setStatusMessage(`Editando ${department.code || department.name}.`);
  };

  const handleCancelDepartmentEdit = () => {
    setOrgError(false);
    setEditingDepartmentId(null);
    setOrgForm({ code: "", name: "", unitType: "departamento", parentDepartmentId: "", description: "", email: "", phone: "" });
    setStatusMessage("");
  };

  const handleDeactivateDepartment = async () => {
    if (!effectiveScopeId || !editingDepartmentId || orgBusy) return;
    const current = activeDepartments.find((item) => item.id === editingDepartmentId);
    if (!current) return;
    if (!window.confirm(`Deseja desativar a unidade ${current.code || current.name}?`)) return;

    setOrgBusy(true);
    try {
      await upsertRemoteMunicipalDepartment({
        municipalityId: effectiveScopeId,
        departmentId: current.id,
        code: current.code,
        name: current.name,
        unitType: current.unitType,
        parentDepartmentId: current.parentDepartmentId,
        description: current.description,
        email: current.email,
        phone: current.phone,
        sortOrder: current.sortOrder,
        isActive: false,
      });
      const rows = await listRemoteInternalMunicipalDepartments(effectiveScopeId);
      setDepartments(rows);
      handleCancelDepartmentEdit();
      setStatusMessage("Unidade desativada do organograma.");
    } catch (error) {
      setOrgError(true);setStatusMessage(error instanceof Error ? error.message : "Não foi possível desativar a unidade.");
    } finally {
      setOrgBusy(false);
    }
  };

  const canManageAccount = (user: SessionUser) =>
    user.id !== session.id &&
    user.role !== "master_admin" &&
    user.role !== "master_ops";
  const handleBlockToggle = (user: SessionUser) => {
    if (!canManageAccount(user)) { setStatusMessage("A conta Master não pode ser alterada pela administração municipal."); return; }
    if (user.accountStatus === "blocked") {
      if (!window.confirm(`Deseja desbloquear ${user.name}?`)) return;
      void runUserCommand(user.id, () => setUserAccountStatus({ userId: user.id, status: "active", actor: session.id }), (updated) => `Conta de ${updated.name} desbloqueada.`);
      return;
    }
    const reason = window.prompt(`Informe o motivo do bloqueio de ${user.name}:`, user.blockReason || "Bloqueio administrativo");
    if (reason === null) return;
    void runUserCommand(user.id, () => setUserAccountStatus({ userId: user.id, status: "blocked", actor: session.id, reason }), (updated) => `Conta de ${updated.name} bloqueada.`);
  };
  const handleDeactivate = (user: SessionUser) => {
    if (!canManageAccount(user)) { setStatusMessage("A conta Master não pode ser alterada pela administração municipal."); return; }
    if (!window.confirm(`Deseja desativar a conta de ${user.name}? Esta ação pode ser revertida depois.`)) return;
    const reason = window.prompt("Informe a justificativa da desativação:", user.blockReason || "Conta desativada administrativamente");
    if (reason === null) return;
    void runUserCommand(user.id, () => deleteUserAccount({ userId: user.id, actor: session.id, reason }), (updated) => `Conta de ${updated.name} marcada como inativa.`);
  };

  // Single premium process table, not one expanding card per process.
  // Authoritative process data and the sector's permissions remain unchanged.
  const renderQueueTable = (items: ProcessRecord[]) => (
    <CompactProcessRegistry embedded operatorName={session.name} operator={session}
      processes={items}
      showArchiveAction={false}
      canDispatchProcess={() => false}
      emptyMessage="Nenhum processo corresponde aos filtros."
    />
  );

  const renderUserCard = (user: SessionUser) => {
    const profile = getUserProfile(user.id, user.email);
    const isEditing = editingUserId === user.id;
    const departmentLabel = getUserDepartmentLabel(user);
    const roleVisual =
      user.role === "financeiro"
        ? {
            rail: "bg-emerald-500",
            badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
            icon: "border-emerald-200 bg-emerald-50 text-emerald-700",
          }
        : user.role === "analista" || user.role === "prefeitura_supervisor"
          ? {
              rail: "bg-sky-500",
              badge: "border-sky-200 bg-sky-50 text-sky-800",
              icon: "border-sky-200 bg-sky-50 text-sky-700",
            }
          : user.role === "fiscal"
            ? {
                rail: "bg-amber-400",
                badge: "border-amber-200 bg-amber-50 text-amber-800",
                icon: "border-amber-200 bg-amber-50 text-amber-700",
              }
            : user.role === "prefeitura_admin"
              ? {
                  rail: "bg-violet-500",
                  badge: "border-violet-200 bg-violet-50 text-violet-800",
                  icon: "border-violet-200 bg-violet-50 text-violet-700",
                }
              : {
                  rail: "bg-slate-400",
                  badge: "border-slate-200 bg-slate-50 text-slate-700",
                  icon: "border-slate-200 bg-slate-50 text-slate-700",
                };

    return (
      <article
        key={user.id}
        data-municipal-user-card="true"
        data-user-role={user.role}
        className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.055)]"
      >
        <div className={`absolute inset-y-0 left-0 w-1.5 ${roleVisual.rail}`} aria-hidden="true" />

        <div
          data-municipal-user-header="true"
          className="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#f2f6fa_100%)] px-5 py-5 pl-6 md:px-6 md:pl-7"
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div
                data-municipal-user-avatar-frame="true"
                className={`rounded-[18px] border p-1.5 shadow-sm ${roleVisual.icon}`}
              >
                <UserAvatar
                  authenticatedOwnerId={authorizedAvatarViewerId}
                  name={user.name}
                  imageUrl={resolveProfileAvatarDisplayUrl(profile)}
                  crop={profile ? {
                    scale: profile.avatarScale ?? 1,
                    offsetX: profile.avatarOffsetX ?? 0,
                    offsetY: profile.avatarOffsetY ?? 0,
                    editorSize: DEFAULT_AVATAR_EDITOR_DIAMETER,
                  } : undefined}
                  size="lg"
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <MunicipalIdentityPrefix badge={identityBadges.get(user.id)}/>
                  <p className="sig-fit-title text-lg font-black leading-7 tracking-[-0.015em] text-slate-950">
                    {user.name}
                  </p>
                  <Badge className={`rounded-full border ${getStatusTone(user.accountStatus)}`}>
                    {getStatusLabel(user.accountStatus)}
                  </Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    data-municipal-user-role-badge="true"
                    className={`rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${roleVisual.badge}`}
                  >
                    {getMunicipalProfileLabel(user)}
                  </span>
                  {!sameMunicipalLabel(getMunicipalProfileLabel(user), user.title) ? (
                    <span className="text-sm font-semibold text-slate-700">
                      {user.title || "Cargo não informado"}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 sig-fit-copy text-sm text-slate-500" title={user.email}>
                  {user.email}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:max-w-[45%] xl:justify-end">
              <Badge variant="outline" className="rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
                {accessLevelLabels[user.accessLevel]}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-300 bg-white px-3 py-1 text-slate-600">
                {user.userType || "Usuário"}
              </Badge>
            </div>
          </div>
        </div>

        <div
          data-municipal-user-body="true"
          className="space-y-5 px-5 py-5 pl-6 md:px-6 md:pl-7"
        >
          {isEditing ? (
            <div
              data-municipal-user-editor="true"
              className="grid gap-3 rounded-[22px] border border-sky-200 bg-sky-50/40 p-4 lg:grid-cols-2 2xl:grid-cols-3"
            >
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-mail de acesso</Label>
                <Input value={editForm.email} readOnly className="bg-white" />
              </div>
              <div className="space-y-2">
                <Label>Cargo / função / profissão</Label>
                <Input
                  list="tenant-position-options"
                  value={editForm.title}
                  onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex.: Chefe de Divisão de Urbanismo"
                />
                <datalist id="tenant-position-options">
                  {availablePositionOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
                <p className="text-xs leading-5 text-slate-500">
                  Campo livre: pode digitar qualquer cargo existente na Prefeitura ou escolher uma sugestão.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Departamento no organograma</Label>
                <Select
                  value={editForm.department || "__none"}
                  onValueChange={(value) =>
                    setEditForm((current) =>
                      applyMunicipalDepartmentSelection(
                        value === "__none" ? "" : value,
                        current,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem departamento</SelectItem>
                    {activeDepartments.map((department) => (
                      <SelectItem key={department.id} value={department.name}>{department.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select
                  value={getMunicipalProfileSelectValue(editForm.role, editForm.profileLabel)}
                  onValueChange={(value) => setEditForm((current) => applyMunicipalProfileSelection(value, current))}
                >
                  <SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                  <SelectContent>
                    {tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}
                    {municipalProfilePresets.map((profile) => (
                      <SelectItem key={profile.key} value={profile.key}>{profile.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nível de acesso</Label>
                <Select value={editForm.accessLevel} onValueChange={(value) => setEditForm((current) => ({ ...current, accessLevel: value }))}>
                  <SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Nível 1 - Operacional</SelectItem>
                    <SelectItem value="2">Nível 2 - Coordenação</SelectItem>
                    <SelectItem value="3">Nível 3 - Gestão total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 lg:col-span-2 2xl:col-span-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button type="button" disabled={savingUserId === user.id} className="sig-force-dark-action h-11 w-full rounded-2xl bg-slate-950 !text-white hover:bg-slate-900 sm:w-auto" onClick={() => void handleSaveEdit(user.id)}>
                    {savingUserId === user.id ? "Salvando..." : "Salvar alterações"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 w-full rounded-2xl bg-white sm:w-auto" onClick={() => { setEditStatusMessage(""); setEditingUserId(null); }}>
                    Cancelar
                  </Button>
                </div>
                {editStatusMessage ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                    {editStatusMessage}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {session.role === "prefeitura_admin" && effectiveScopeId && user.id!==session.id &&
            (isSwitchableMunicipalStaffRole(user.role)||user.role==="prefeitura_supervisor"||user.role==="prefeitura_admin") ? (
              <MunicipalAuthorityDesignationsEditor key={"authority-"+user.id} municipalityId={effectiveScopeId} profileId={user.id} departments={activeDepartments} supervisor={user.role==="prefeitura_supervisor"} onOrganogram={()=>{navigate("/prefeitura?secao=organograma",{preventScrollReset:true});window.scrollTo({top:0,behavior:"instant"});}}/>
            ) : null}
          {session.role === "prefeitura_admin" && effectiveScopeId &&
            isSwitchableMunicipalStaffRole(user.role) ? (
              <MunicipalStaffAssignmentsEditor
                key={user.id}
                profileId={user.id}
                municipalityId={effectiveScopeId}
                currentDepartment={user.department || ""}
                departments={activeDepartments}
                identityBadge={identityBadges.get(user.id)}
                onChanged={refreshRemoteStore}
              />
            ) : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(250px,0.9fr)_minmax(0,1.5fr)]">
            <div
              data-municipal-user-lotation="true"
              className={`min-w-0 rounded-[20px] border p-4 shadow-[0_4px_16px_rgba(15,23,42,0.035)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 ${roleVisual.badge}`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-current" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-current">
                  Lotação institucional
                </p>
              </div>
              <p className="mt-3 text-base font-bold leading-6 text-slate-950 dark:text-white">{departmentLabel}</p>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-700 dark:text-slate-200">
                {user.title || getMunicipalProfileLabel(user)}
              </p>
            </div>

            <div
              data-municipal-user-security="true"
              className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-4 text-slate-950 shadow-[0_4px_16px_rgba(15,23,42,0.035)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-800 dark:text-sky-300" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-700 dark:text-slate-200">
                  Acesso e segurança
                </p>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-600 dark:text-slate-300">Criado em</p>
                  <p className="mt-1 text-xs font-semibold text-slate-950 dark:text-white">{user.createdAt || "Não informado"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-600 dark:text-slate-300">Último acesso</p>
                  <p className="mt-1 text-xs font-semibold text-slate-950 dark:text-white">{user.lastAccessAt || "Não registrado"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-600 dark:text-slate-300">Situação administrativa</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-950 dark:text-white">
                    {user.blockReason || "Sem restrição administrativa"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            data-municipal-user-actions="true"
            className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:flex-wrap"
          >
            {canManageAccount(user) ? (
              <>
                <Button type="button" disabled={savingUserId === user.id} variant="outline" className="h-10 w-full rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-50 sm:w-auto" onClick={() => startEdit(user)}>
                  <PencilLine className="mr-2 h-4 w-4 text-sky-700" />
                  Editar cadastro
                </Button>
                <Button type="button" disabled={savingUserId === user.id} variant="outline" className="h-10 w-full rounded-xl border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 sm:w-auto" onClick={() => handleBlockToggle(user)}>
                  {user.accountStatus === "blocked"
                    ? <><Undo2 className="mr-2 h-4 w-4" />Desbloquear</>
                    : <><ShieldAlert className="mr-2 h-4 w-4" />Bloquear acesso</>}
                </Button>
                <Button type="button" disabled={savingUserId === user.id} variant="outline" className="h-10 w-full rounded-xl border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 sm:w-auto" onClick={() => handleDeactivate(user)}>
                  <UserX className="mr-2 h-4 w-4" />
                  Desativar conta
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                A conta Master é protegida e não pode ser alterada pela administração municipal.
              </p>
            )}
          </div>
        </div>
      </article>
    );
  };

  const executiveCards = [
    { label: "Processos ativos", value: `${metrics.protocolsInProgress}`, description: "Processos municipais em andamento", icon: ClipboardList, tone: "blue" as const },
    { label: "Exigem atenção", value: `${actionRequired.length}`, description: "Prazos, exigências e guias em aberto", icon: Clock3, tone: "amber" as const },
    { label: "Usuários", value: `${tenantUsers.length}`, description: "Equipe vinculada à Prefeitura", icon: Users2, tone: "emerald" as const },
    { label: "Pendências financeiras", value: `${metrics.pendingPayments}`, description: "Processos com guia emitida pendente", icon: Wallet, tone: "rose" as const },
  ];


  return (
    <PortalFrame eyebrow="Administração da Prefeitura"
      title={municipalityName || activeInstitution?.name || "Administração da Prefeitura"}
      hideSectionHeader={workspaceView === "usuarios"}>
      <PageShell>
        <section data-municipal-admin-nav="true" className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true"/>
            <span>Administração municipal</span><span aria-hidden="true">/</span>
            <span className="font-semibold text-foreground" aria-current="location">{MUNICIPAL_ADMIN_SECTIONS.find(section=>section.value===workspaceView)?.label}</span>
          </div>
          <InternalTabs
            className="border-slate-200/90 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
            value={workspaceView}
            onChange={(value) => {
              const target=MUNICIPAL_ADMIN_SECTIONS.find(section=>section.value===value);
              if(target)navigate(target.to,{preventScrollReset:true});
            }}
            persistInUrl={false}
            items={MUNICIPAL_ADMIN_SECTIONS.map(({value,label,helper})=>({value,label,helper}))}
          />
        </section>

        {workspaceView === "visao-geral" ? (
          <MunicipalOverviewSubnav active={overviewSubpage} counts={{
            processos: tenantProcesses.length,
            pendencias: actionRequired.length,
            atividades: recentActivity.length,
          }} />
        ) : null}

        {statusMessage ? (
          <div role={workspaceView==="organograma"&&orgError?"alert":"status"} className={"rounded-2xl border p-4 text-sm leading-6 "+(workspaceView==="organograma"&&orgError?"border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100":"border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100")}>
            {statusMessage}
          </div>
        ) : null}

        {workspaceView === "visao-geral" && overviewSubpage === "resumo" ? (
          <div data-sigapro-municipal-stats="premium-v4" className="min-w-0 space-y-2">
        <PageStatsRow className="xl:grid-cols-4">
          {executiveCards.map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={item.value}
              description={item.description}
              icon={item.icon}
              tone={item.tone}
            />
          ))}
        </PageStatsRow>

        {session.role === "prefeitura_admin" ? (
          <details data-sigapro-plan-overview="compact"
            className="group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.045)] dark:border-slate-700 dark:bg-slate-900">
            <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:px-5 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">Consumo do plano da Prefeitura</p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {planSnapshot?.planName || (planCapacity.loaded ? "Plano não vinculado" : "Consultando contrato")}
                  {planUsersMetric ? ` · ${planUsersMetric.usedLabel} de ${planUsersMetric.limitLabel} cadastros` : ""}
                  {planUsersMetric?.percentage !== null && planUsersMetric?.percentage !== undefined
                    ? ` · ${Math.max(0, 100 - planUsersMetric.percentage).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% disponível`
                    : ""}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
                <span className="group-open:hidden">Ver limites</span>
                <span className="hidden group-open:inline">Ocultar limites</span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">
              {planCapacity.error ? <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{planCapacity.error}</p> : null}
              {planSnapshot ? (
                <PlanCapacityCard row={planSnapshot} municipalityName={municipalityName || activeInstitution?.name} />
              ) : <p className="text-sm text-slate-600">Consultando o contrato no SIGAPRO...</p>}
            </div>
          </details>
        ) : null}
          </div>
        ) : null}

        {workspaceView === "visao-geral" && overviewSubpage === "resumo" ? (
          <div data-sigapro-overview-summary="premium-v4" className="flex min-w-0 flex-col gap-3">
            <section data-sigapro-summary-board="dark" data-premium-blue-surface="true" className="min-w-0 overflow-hidden rounded-[20px] border border-sky-600/35 bg-[#0a263d] p-4 text-white shadow-[0_14px_32px_rgba(6,32,55,0.16)] sm:p-5">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
                <div className="min-w-0">
                  <p data-summary-muted="true" className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">Painel executivo • Prefeitura</p>
                  <h2 data-summary-title="true" className="mt-1 text-lg font-bold text-white">Prioridades da operação municipal</h2>
                  <p data-summary-muted="true" className="mt-1 text-xs text-slate-200">Visão sintética dos processos oficiais, sem duplicar toda a fila.</p>
                </div>
                <Button type="button" size="sm" variant="outline"
                  className="sig-premium-light-control h-9 rounded-xl border-sky-200 bg-white px-3 font-semibold !text-[#123650] hover:bg-sky-50"
                  onClick={() => navigate("/prefeitura/visao-geral/processos")}>
                  Ver processos
                </Button>
              </header>
              <div data-sigapro-overview-quickfacts="true" className="mt-3 grid min-w-0 gap-2 sm:grid-cols-3">
                {[
                  { label: "Em análise", value: metrics.inAnalysis },
                  { label: "Guias pendentes", value: metrics.pendingPayments },
                  { label: "Concluídos", value: metrics.approved },
                ].map((item) => (
                  <div key={item.label} data-summary-dark-card="true"
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-sky-300/20 bg-white/[0.065] px-3 py-2.5">
                    <span data-summary-muted="true" className="truncate text-xs text-slate-200" title={item.label}>{item.label}</span>
                    <span data-summary-value="true" className="shrink-0 text-lg font-extrabold tabular-nums text-white">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.9fr)]">
                <section data-summary-dark-card="true" className="min-w-0 rounded-2xl border border-sky-200/20 bg-white/[0.05] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 data-summary-title="true" className="text-sm font-bold text-white">Processos que precisam de atenção</h3>
                    <span data-summary-muted="true" className="text-xs text-slate-200">Até 3 prioridades</span>
                  </div>
                  <div className="space-y-2">
                    {mainQueue.length === 0 ? (
                      <p data-summary-muted="true" className="rounded-xl border border-white/10 px-3 py-3 text-sm text-slate-200">
                        Nenhum processo operacional encontrado.
                      </p>
                    ) : mainQueue.slice(0, 3).map((process) => (
                      <div key={process.id} data-summary-process-row="true"
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#123b56] px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p data-summary-label="true" className="truncate text-xs font-bold text-sky-100" title={process.protocol}>{process.protocol}</p>
                          <p data-summary-title="true" className="mt-1 truncate text-sm font-semibold text-white" title={process.title}>{process.title}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className={getPriorityTone(process)}>
                            {process.sla.breached ? "Vencido" : process.sla.hoursRemaining <= 12 ? "Urgente" : "No prazo"}
                          </Badge>
                          <Button type="button" size="sm" variant="outline"
                            className="sig-premium-light-control h-8 rounded-lg border-white/25 bg-white !text-[#123650] hover:bg-sky-50"
                            onClick={() => openMunicipalProcess(process.id)}>Abrir</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section data-summary-dark-card="true" className="min-w-0 rounded-2xl border border-sky-200/20 bg-white/[0.05] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 data-summary-title="true" className="text-sm font-bold text-white">Pendências críticas</h3>
                    <Button type="button" size="sm" variant="outline"
                      className="h-8 rounded-lg border-white/20 bg-white/10 !text-white hover:bg-white/20"
                      onClick={() => navigate("/prefeitura/visao-geral/pendencias")}>Ver todas</Button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2.5">
                    <span data-summary-label="true" className="text-sm font-semibold text-amber-100">SLA crítico</span>
                    <strong data-summary-value="true" className="text-lg tabular-nums text-white">{criticalAlerts.length}</strong>
                  </div>
                  {inconsistentTriageCount > 0 ? (
                    <p data-municipal-triage-divergence="true" className="mt-2 rounded-lg border border-amber-200/30 bg-amber-300/10 p-2 text-xs text-amber-100">
                      {inconsistentTriageCount} registro(s) com triagem divergente. A correção exige atuação autorizada.
                    </p>
                  ) : null}
                  <div className="mt-2 space-y-1.5">
                    {actionRequired.length === 0 ? (
                      <p data-summary-muted="true" className="text-xs text-slate-200">Sem outras prioridades críticas.</p>
                    ) : actionRequired.slice(0, 2).map((process) => (
                      <div key={process.id} className="flex min-w-0 items-center justify-between gap-2 border-t border-white/10 py-1.5">
                        <span data-summary-label="true" className="truncate text-xs text-slate-100" title={process.protocol}>{process.protocol}</span>
                        <span data-summary-muted="true" className="shrink-0 text-[11px] text-amber-100">
                          {process.sla.breached ? "Vencido" : process.sla.hoursRemaining <= 12 ? "Crítico" : "Atenção"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>

            <div data-sigapro-summary-secondary="true" className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)]">
              <section data-summary-light-card="true" className="min-w-0 rounded-[18px] border border-[#c6d8e6] bg-[#edf4fa] p-4 shadow-sm">
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 data-summary-light-title="true" className="text-sm font-bold text-[#123650]">Atividade institucional recente</h3>
                    <p data-summary-light-muted="true" className="mt-0.5 text-xs text-[#50677a]">Três movimentos; amplie apenas se precisar dos detalhes.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg border-sky-300 bg-white !text-[#123650]"
                    onClick={() => navigate("/prefeitura/visao-geral/atividades")}>Ver histórico</Button>
                </header>
                <div className="space-y-2">
                  {recentActivity.length === 0 ? (
                    <p data-summary-light-muted="true" className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">Nenhuma atividade registrada.</p>
                  ) : recentActivity.slice(0, 3).map((item, index) => (
                    <MunicipalActivityCard key={item.processId + "-" + index} item={item}
                      onOpenProcess={() => openMunicipalProcess(item.processId)} />
                  ))}
                </div>
              </section>
              <section data-summary-light-card="true" className="min-w-0 rounded-[18px] border border-[#c6d8e6] bg-[#e5eff7] p-4 shadow-sm">
                <div className="mb-3">
                  <h3 data-summary-light-title="true" className="text-sm font-bold text-[#123650]">Fluxo institucional</h3>
                  <p data-summary-light-muted="true" className="mt-0.5 text-xs text-[#50677a]">Unidades, encaminhamentos e equipe.</p>
                </div>
                <div data-sigapro-overview-unit-summary="compact" className="divide-y divide-[#c5d5e1] rounded-xl border border-[#c5d5e1] bg-white/55">
                  {unitSummary.map((item) => (
                    <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p data-summary-light-title="true" className="truncate text-xs font-semibold text-[#123650]" title={item.label}>{item.label}</p>
                        <p data-summary-light-muted="true" className="truncate text-[11px] text-[#52687a]" title={item.helper}>{item.helper}</p>
                      </div>
                      <strong data-summary-light-title="true" className="shrink-0 text-base tabular-nums text-[#123650]">{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-[#34536b]">
                  <p className="truncate" title={currentUnit}><strong>Unidade:</strong> {currentUnit}</p>
                  <p className="truncate" title={pendingSectorItems.map((item) => item.label).join(" • ")}>
                    <strong>Setores:</strong> {pendingSectorItems.map((item) => item.label + ": " + item.value).join(" • ")}
                  </p>
                  <p><strong>Fluxo:</strong> {receivedForCurrentUnit.length} recebidos · {generatedByCurrentUnit.length} gerados · {assignedMunicipal.length} atribuídos</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-9 w-full justify-center rounded-lg border-sky-300 bg-white !text-[#123650]"
                    onClick={() => navigate("/configuracoes?secao=branding")}>
                    {coatOfArmsPreviewUrl ? "Identidade visual • brasão salvo" : "Identidade visual"}
                  </Button>
                </div>
              </section>
            </div>
          </div>
        ) : null}



        {workspaceView === "visao-geral" && overviewSubpage === "processos" ? (
          <section
            data-sigapro-overview-processes="premium-v5"
            aria-label="Consulta dos processos municipais"
            className="min-w-0 rounded-[20px] border border-[#bfd4e4] bg-[#ecf4fa] p-3 shadow-[0_9px_28px_rgba(8,45,73,0.085)] sm:p-4"
          >
            <header data-premium-blue-surface="true" className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[#386f8d] bg-[linear-gradient(115deg,#0b344f,#104e6b)] px-3.5 py-3 text-white">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#bfe7fa]">Consulta oficial • Prefeitura</p>
                <h2 data-processes-header-title="true" className="mt-0.5 text-[17px] font-bold leading-tight text-white">Processos municipais</h2>
                <p className="mt-1 text-xs text-sky-100">Pesquisa e situação atual sem painéis intermediários.</p>
              </div>
              <Button type="button" size="sm" variant="outline"
                className="sig-premium-light-control h-9 shrink-0 rounded-lg border-sky-200 bg-white px-3 font-semibold !text-[#123650] hover:bg-sky-50"
                onClick={() => navigate("/prefeitura/processos")}>
                Abrir gestão de processos
              </Button>
            </header>

            <div data-processes-toolbar="true" className="mb-3 flex min-w-0 flex-col gap-2.5 rounded-xl border border-[#c9dce9] bg-[#f6fafe] p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                <p className="text-[13px] font-semibold text-[#193b54]">{overviewProcesses.length.toLocaleString("pt-BR")} processos encontrados</p>
                <span className="text-[11px] text-[#516c7f]">25 por página · abra o número para consultar</span>
              </div>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#59758c]" />
                <Input aria-label="Pesquisar processos da Visão Geral"
                  value={overviewProcessSearch} onChange={(event) => setOverviewProcessSearch(event.target.value)}
                  placeholder="Número, assunto, interessado ou responsável"
                  className="h-10 min-w-0 rounded-lg border-[#bcd2e1] bg-white pl-10 text-[#14344a]" />
              </div>
              <div role="group" aria-label="Filtrar situação dos processos" className="flex min-w-0 flex-wrap gap-1.5">
                {([
                  ["todos", "Todos"],
                  ["andamento", "Em andamento"],
                  ["pendentes", "Com pendências"],
                  ["concluidos", "Concluídos"],
                ] as const).map(([key, label]) => (
                  <Button key={key} type="button" size="sm" variant="outline"
                    aria-pressed={overviewProcessStatus === key}
                    onClick={() => setOverviewProcessStatus(key)}
                    className={overviewProcessStatus === key
                      ? "h-8 rounded-lg border-sky-800 bg-sky-900 px-3 !text-white hover:bg-sky-800"
                      : "h-8 rounded-lg border-[#c1d3df] bg-white px-3 text-[#1e435b] hover:bg-sky-50"}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div data-processes-list="true" className="min-w-0">
              <CompactProcessRegistry embedded hideSearchInput operatorName={session.name} operator={session}
                key={overviewProcessStatus + ":" + overviewProcessSearch + ":" + (effectiveScopeId || "")}
                processes={overviewProcesses}
                showArchiveAction={false}
                canDispatchProcess={() => false}
                emptyMessage="Não há processos para os filtros selecionados."
              />
            </div>
          </section>
        ) : null}

        {workspaceView === "visao-geral" && overviewSubpage === "pendencias" ? (
          <PageMainContent className="min-w-0 gap-4">
            <TableCard title="Pendências e prazos"
              description="Processos que exigem atenção por prazo, documentação, exigência técnica ou guia pendente. Consulta separada do resumo executivo."
              icon={AlertTriangle}>
              <div className="min-w-0 space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "Exigem atenção", value: actionRequired.length },
                    { label: "SLA crítico", value: criticalAlerts.length },
                    { label: "Guias pendentes", value: metrics.pendingPayments },
                  ].map((item) => (
                    <div key={item.label} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="truncate text-sm font-medium text-slate-700" title={item.label}>{item.label}</span>
                      <span className="shrink-0 text-xl font-bold tabular-nums text-slate-950">{item.value.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input aria-label="Pesquisar pendências municipais"
                    value={overviewPendingSearch}
                    onChange={(event) => setOverviewPendingSearch(event.target.value)}
                    placeholder="Pesquisar número, interessado ou assunto"
                    className="h-11 min-w-0 rounded-xl border-slate-300 bg-white pl-10 text-slate-900" />
                </div>
                <p className="text-xs text-slate-600" aria-live="polite">
                  {overviewPendingProcesses.length.toLocaleString("pt-BR")} processo(s) encontrados · 25 por página
                </p>
                <CompactProcessRegistry embedded hideSearchInput operatorName={session.name} operator={session}
                  key={overviewPendingSearch + ":" + (effectiveScopeId || "")}
                  processes={overviewPendingProcesses}
                  showArchiveAction={false}
                  canDispatchProcess={() => false}
                  emptyMessage="Nenhuma pendência encontrada para esta Prefeitura."
                />
              </div>
            </TableCard>
          </PageMainContent>
        ) : null}

        {workspaceView === "visao-geral" && overviewSubpage === "atividades" ? (
          <PageMainContent className="min-w-0 gap-4">
            <TableCard title="Movimentações e atividades"
              description="Histórico municipal em ordem cronológica, exibindo apenas 15 eventos por página. Abra uma linha para ver o conteúdo completo."
              icon={Clock3}>
              <div className="min-w-0 space-y-4">
                {overviewActivityPageData.total === 0 ? (
                  <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    Não há movimentações registradas para esta Prefeitura.
                  </p>
                ) : (
                  <>
                    <div data-sigapro-overview-activities="compact"
                      className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {overviewActivityPageData.items.map((item, index) => {
                        const timestamp = Date.parse(item.at);
                        const displayedAt = Number.isFinite(timestamp)
                          ? new Date(timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                          : "Data não informada";
                        return (
                          <details key={item.processId + ":" + (overviewActivityPageData.start + index)}
                            data-sigapro-overview-activity-row="true"
                            className="group min-w-0 open:bg-sky-50/40">
                            <summary className="flex min-w-0 cursor-pointer list-none flex-col gap-2 px-4 py-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-600 sm:flex-row sm:items-center [&::-webkit-details-marker]:hidden">
                              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                                <span className="shrink-0 text-xs font-semibold text-sky-900">{item.protocol}</span>
                                <span className="min-w-0 truncate text-sm font-medium text-slate-900" title={item.title}>
                                  {municipalActivityTitle(item.title)}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                                <time className="text-xs tabular-nums text-slate-600">{displayedAt}</time>
                                <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-600 transition-transform group-open:rotate-180" />
                              </div>
                            </summary>
                            <div className="min-w-0 space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.detail || "Sem descrição adicional."}</p>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-xs text-slate-600">Registrado por: {item.actor || "SIGAPRO"}</span>
                                <Button type="button" size="sm" variant="outline"
                                  className="rounded-lg border-slate-300 bg-white text-sky-900"
                                  onClick={() => openMunicipalProcess(item.processId)}>Consultar processo</Button>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                    <nav aria-label="Paginação de atividades da Visão Geral"
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                      <span aria-live="polite" className="text-xs text-slate-600">
                        Eventos {overviewActivityPageData.start + 1}–{overviewActivityPageData.end} de {overviewActivityPageData.total.toLocaleString("pt-BR")}
                        {" · "}Página {overviewActivityPageData.page} de {overviewActivityPageData.totalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline"
                          disabled={overviewActivityPageData.page <= 1}
                          onClick={() => setOverviewActivityPage(overviewActivityPageData.page - 1)}
                          className="rounded-lg border-slate-300 bg-white text-slate-900">Anterior</Button>
                        <Button type="button" size="sm" variant="outline"
                          disabled={overviewActivityPageData.page >= overviewActivityPageData.totalPages}
                          onClick={() => setOverviewActivityPage(overviewActivityPageData.page + 1)}
                          className="rounded-lg border-slate-300 bg-white text-slate-900">Próxima</Button>
                      </div>
                    </nav>
                  </>
                )}
              </div>
            </TableCard>
          </PageMainContent>
        ) : null}

        {workspaceView === "fila" ? (
          <div data-sigapro-queue-workspace="premium" className="min-w-0 w-full">
            <div data-municipal-queue-paged="true" className="min-w-0">
              {renderQueueTable(filteredQueue)}
            </div>
          </div>
        ) : null}

        {workspaceView === "usuarios" ? (
          <PageMainContent className="min-w-0 w-full max-w-full gap-3">
            <section data-municipal-users-pane="premium-v7"
              className="min-w-0 w-full max-w-full !h-auto !min-h-0 !self-start overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(12,41,65,0.10)] dark:border-slate-700 dark:bg-slate-900">
              <header data-municipal-users-toolbar="compact-v7"
                className="flex min-w-0 flex-wrap items-center justify-between gap-2.5 bg-[#10364f] px-3 py-2.5 text-white sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/20 bg-white/10">
                    <Users2 aria-hidden="true" className="h-4.5 w-4.5 text-sky-100" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold leading-5 text-white">Gestão de usuários</h2>
                    <p className="mt-0.5 text-[11px] leading-4 text-sky-100">Servidores, perfis e lotações da Prefeitura</p>
                  </div>
                </div>
                <Button type="button" variant="outline"
                  onClick={() => {
                    navigate("/prefeitura/usuarios/novo");
                  }}
                  className="sig-dark-action-btn h-9 min-h-9 rounded-[11px] border-white/25 bg-white/10 px-3 text-white hover:border-white/40 hover:bg-white/20 hover:text-white">
                  <Plus className="mr-1.5 h-4 w-4 text-sky-100" />
                  Criar servidor
                </Button>
              </header>
              <div data-municipal-users-content="true" className="min-w-0 w-full space-y-3 p-3 sm:p-4">
            {(!municipalRegistryConfirmed) ? (
              <div role={platformDataError || municipalRegistry.error ? "alert" : "status"} data-municipal-users-sync={platformDataError || municipalRegistry.error ? "error" : "pending"}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300/75 bg-sky-50 px-3 py-2 text-xs text-slate-900 dark:border-sky-600 dark:bg-sky-950/45 dark:text-white">
                <div className="min-w-0">
                  <p className="font-bold">{platformDataError || municipalRegistry.error ? "Não foi possível confirmar a lista oficial de usuários" : "Validando os usuários vinculados à Prefeitura..."}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">{municipalRegistry.error || platformDataError || (platformDataLoading || !municipalRegistryConfirmed ? "Conferindo a lista protegida de usuários no banco oficial." : "Os números serão confirmados após sincronização; o cache não define o cadastro oficial.")}</p>
                </div>
                <Button type="button" variant="outline" className="rounded-xl border-slate-300 bg-white text-slate-900"
                  onClick={() => { setMunicipalRegistryRefresh((current) => current + 1); void refreshRemoteStore().catch(() => undefined); }}>Tentar sincronizar</Button>
              </div>
            ) : null}
              <div data-municipal-users-list-first="premium-v6" className="min-w-0 space-y-3">
                <div data-municipal-users-summary="compact-v6"
                  className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[#2f6384] bg-[#123d5b] px-3.5 py-2.5 text-xs text-white shadow-[0_4px_14px_rgba(9,37,64,0.12)]"
                  aria-label="Resumo do cadastro municipal">
                  <span className="text-sky-100">Vínculos municipais <strong className="ml-1 font-semibold tabular-nums text-white">{municipalRegistryConfirmed ? tenantUsers.length : "—"}</strong></span>
                  <span className="text-sky-100">Equipe interna <strong className="ml-1 font-semibold tabular-nums text-white">{municipalRegistryConfirmed ? internalTenantUsers.length : "—"}</strong></span>
                  <span className="text-sky-100">Administradores <strong className="ml-1 font-semibold tabular-nums text-white">{municipalRegistryConfirmed ? tenantUsers.filter((user) => user.role === "prefeitura_admin").length : "—"}</strong></span>
                  <span className="text-sky-100">Bloqueados <strong className="ml-1 font-semibold tabular-nums text-white">{municipalRegistryConfirmed ? tenantUsers.filter((user) => user.accountStatus === "blocked").length : "—"}</strong></span>
                </div>
                <Tabs value={segment} onValueChange={(value) => setSegment(value as UserSegment)}><TabsList className="flex h-auto min-w-0 flex-wrap justify-start gap-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800"><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="administradores">Administradores</TabsTrigger><TabsTrigger value="analistas">Analistas</TabsTrigger><TabsTrigger value="financeiro">Financeiro</TabsTrigger><TabsTrigger value="fiscal">Fiscal</TabsTrigger><TabsTrigger value="externos">Externos</TabsTrigger><TabsTrigger value="outros">Outros</TabsTrigger></TabsList></Tabs><div className="grid gap-3 xl:grid-cols-[minmax(0,1.58fr)_minmax(220px,0.74fr)_minmax(220px,0.74fr)] 2xl:grid-cols-[minmax(0,1.72fr)_minmax(236px,0.78fr)_minmax(236px,0.78fr)] xl:items-center"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, setor ou categoria" className="h-11 rounded-2xl pl-10.5" /></div><Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "todos" | AccountStatus)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="blocked">Bloqueado</SelectItem><SelectItem value="inactive">Inativo</SelectItem></SelectContent></Select><Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "todos" | UserRole)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Perfil" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os perfis</SelectItem>{tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent></Select></div>
                <CompactUserRegistry users={filteredUsers} page={userPage}
                  onPageChange={setUserPage}
                  filterKey={[segment, statusFilter, roleFilter, search, effectiveScopeId || ""].join(":")}
                  getAvatarProfile={(user) => getUserProfile(user.id, user.email) ?? null}
                  identityBadges={identityBadges}
                  renderDetails={renderUserCard}
                  label="Usuários da Prefeitura" />
              </div>
              </div>
            </section>
          </PageMainContent>
        ) : null}


        {workspaceView === "organograma" ? (
          <PageMainGrid className="xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.82fr)] xl:items-start">
            <PageMainContent>
              <TableCard
                title="Organograma municipal"
                description="Lista hierárquica de secretarias, diretorias e unidades. Pesquise, expanda ou recolha cada nível."
                icon={Network}
              >
                <MunicipalOrganizationChart
                  departments={activeDepartments}
                  emptyMessage="Nenhuma unidade cadastrada. Crie a primeira estrutura ao lado para disponibilizar o organograma institucional."
                  onEdit={session.role==="prefeitura_admin"?handleEditDepartment:undefined}
                  onAddChild={session.role==="prefeitura_admin" ? (id)=>{setEditingDepartmentId(null);setOrgForm({code:"",name:"",unitType:"departamento",parentDepartmentId:id,description:"",email:"",phone:""});document.getElementById("municipal-org-editor")?.scrollIntoView({block:"nearest",behavior:"smooth"});} : undefined}
                />
              </TableCard>
            </PageMainContent>
            <PageSideContent>
              <SectionCard
                title={editingDepartmentId ? "Ajustar unidade" : "Montar organograma"}
                description={editingDepartmentId ? "Altere sigla, nome, nível, unidade superior e dados institucionais." : "Crie a estrutura conforme a realidade de cada Prefeitura. O quadro interno exibe somente as siglas das unidades."}
                icon={Plus}
                contentClassName="space-y-4"
              >
                <form id="municipal-org-editor" className="space-y-4" onSubmit={handleCreateDepartment}>
                  {!editingDepartmentId && session.role==="prefeitura_admin" ? <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-800 dark:bg-sky-950/30"><Label>Modelos de secretarias e diretorias</Label><Select value="__custom" onValueChange={value=>{const preset=authorityUnitPresets.find(p=>p.code===value);if(preset)setOrgForm(current=>({...current,...preset,parentDepartmentId:""}));}}><SelectTrigger className="h-11 rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__custom">Escolher modelo ou criar unidade própria</SelectItem>{authorityUnitPresets.map(p=><SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-slate-600 dark:text-slate-300">Ajuste o nome e a unidade superior antes de salvar. Deixe a sigla vazia para geração automática.</p></div>:null}
                  {!editingDepartmentId && session.role==="prefeitura_admin" ? <div className="flex flex-wrap gap-2">{adjunctUnitTemplates.map(template=><Button key={template.unitType} type="button" variant="outline" size="sm" className="rounded-xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" onClick={()=>setOrgForm(current=>({...current,name:template.name,unitType:template.unitType,code:""}))}>{template.label}</Button>)}</div>:null}
                  <div className="space-y-2">
                    <Label>Sigla {orgForm.code.trim()?"(manual)":"(automática)"}</Label>
                    <Input value={orgForm.code} onChange={(event) => setOrgForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder={suggestedOrgCode || "Automática"} maxLength={8} />
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{orgForm.code.trim()?"Sigla atual preservada.":suggestedOrgCode?"Prévia: "+suggestedOrgCode+" · confirmada ao salvar.":"A sigla será gerada pelo nome e tipo."}</p>{orgForm.code.trim()?<Button type="button" variant="outline" size="sm" disabled={orgBusy} className="h-8 rounded-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" onClick={()=>setOrgForm(current=>({...current,code:""}))}>Gerar sigla automática</Button>:null}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome da unidade</Label>
                    <Input value={orgForm.name} aria-invalid={Boolean(orgNameConflict)} onChange={(event) => {setOrgForm((current) => ({ ...current, name: event.target.value }));setOrgError(false);setStatusMessage("");}} placeholder="Ex.: Protocolo, Financeiro, Obras" />
                    {orgNameConflict?<div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p>Nome em uso: {orgNameConflict.code || "Sem sigla"} — {orgNameConflict.name} ({orgNameConflict.isActive?"ativa":"inativa"}).</p>{distinctOrgName?<Button type="button" size="sm" variant="outline" className="h-auto min-h-8 max-w-full whitespace-normal text-left dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100" onClick={()=>{setOrgForm(current=>({...current,name:distinctOrgName}));setOrgError(false);setStatusMessage("");}}>Usar {distinctOrgName}</Button>:null}</div>:null}
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={municipalUnitEditorType(orgForm.name,orgForm.unitType)} onValueChange={(value) => setOrgForm(current=>({...current,...changeMunicipalUnitEditorType(current.name,current.unitType,value,departments.find(d=>d.id===current.parentDepartmentId)?.name),code:""}))}>
                      <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="secretaria">Secretaria titular</SelectItem>
                        <SelectItem value="secretaria_adjunta">Secretaria adjunta</SelectItem>
                        <SelectItem value="diretoria">Diretoria titular</SelectItem>
                        <SelectItem value="diretoria_adjunta">Diretoria adjunta</SelectItem>
                        <SelectItem value="departamento">Departamento</SelectItem>
                        <SelectItem value="setor">Setor</SelectItem>
                        <SelectItem value="coordenadoria">Coordenadoria</SelectItem>
                        <SelectItem value="divisao">Divisão</SelectItem>
                        <SelectItem value="unidade">Outra unidade institucional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade superior</Label>
                    <Select value={orgForm.parentDepartmentId || "__root"} onValueChange={(value) => setOrgForm((current) => ({ ...current, parentDepartmentId: value === "__root" ? "" : value }))}>
                      <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__root">Nível principal</SelectItem>
                        {activeDepartments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input value={orgForm.description} onChange={(event) => setOrgForm((current) => ({ ...current, description: event.target.value }))} placeholder="Responsabilidade da unidade" />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail institucional</Label>
                    <Input type="email" value={orgForm.email} onChange={(event) => setOrgForm((current) => ({ ...current, email: event.target.value }))} placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={orgForm.phone} onChange={(event) => setOrgForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Opcional" />
                  </div>
                  <Button type="submit" disabled={orgBusy || !orgForm.name.trim() || Boolean(orgNameConflict)} className="sig-force-dark-action h-12 w-full rounded-2xl bg-slate-950 !text-white hover:bg-slate-900">
                    {orgBusy ? "Salvando..." : editingDepartmentId ? "Salvar alterações" : "Adicionar ao organograma"}
                  </Button>
                  {editingDepartmentId ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" className="rounded-2xl" onClick={handleCancelDepartmentEdit}>
                        Cancelar
                      </Button>
                      <Button type="button" variant="outline" className="rounded-2xl border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void handleDeactivateDepartment()}>
                        Desativar
                      </Button>
                    </div>
                  ) : null}
                </form>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {workspaceView === "historico" ? (
          <PageMainGrid className="xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,0.8fr)]">
            <PageMainContent>
              <TableCard title="Movimentações registradas" description="Consulta paginada. Clique no evento para ler os detalhes e acessar o processo." icon={Clock3}>
                <div className="space-y-2">
                  {historyPageData.total === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">Nenhuma movimentação encontrada.</p>
                  ) : (
                    <>
                      <div data-municipal-history-paged="true" className="space-y-2">
                        {historyPageData.items.map((item, index) => (
                          <MunicipalActivityCard key={`${item.processId}-${historyPageData.start + index}`}
                            item={item} onOpenProcess={() => openMunicipalProcess(item.processId)} />
                        ))}
                      </div>
                      <nav aria-label="Paginação eventos" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
  <span className="text-xs text-slate-600">Exibindo {historyPageData.start + 1}–{historyPageData.end} de {historyPageData.total} eventos · Página {historyPageData.page} de {historyPageData.totalPages}</span>
  <div className="flex gap-2">
    <Button type="button" size="sm" variant="outline" disabled={historyPageData.page <= 1} onClick={() => setHistoryPage(historyPageData.page - 1)}>Anterior</Button>
    <Button type="button" size="sm" variant="outline" disabled={historyPageData.page >= historyPageData.totalPages} onClick={() => setHistoryPage(historyPageData.page + 1)}>Próxima</Button>
  </div>
</nav>
                    </>
                  )}
                </div>
              </TableCard>
            </PageMainContent>
            <PageSideContent>
              <SectionCard title="Aprovações recentes" description="Deferimentos concluídos na Prefeitura." icon={CheckCircle2} contentClassName="space-y-3">
                {recentApprovals.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Nenhum deferimento recente.</p>
                ) : recentApprovals.map((process) => (
                  <button key={process.id} type="button" onClick={() => navigate(buildProcessPath(process))}
                    className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-sky-300">
                    <span className="block text-sm font-semibold text-slate-950">{process.protocol}</span>
                    <span className="mt-1 block truncate text-sm text-slate-700">{process.title}</span>
                    <span className="mt-1 block text-xs font-semibold text-sky-700">Consultar processo</span>
                  </button>
                ))}
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
