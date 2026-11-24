import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronLeft, ChevronRight, CircleAlert, Landmark, Plus, Search, ShieldCheck, Users2 } from "lucide-react";
import { CompactUserRegistry } from "@/components/platform/CompactUserRegistry";
import { PlatformStaffCreator } from "@/components/platform/PlatformStaffCreator";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { roleLabels, type AccountStatus, type Institution, type SessionUser, type UserProfile, type UserRole } from "@/lib/platform";
import "@/styles/master-user-governance.css";

type Group = "todos" | "internos" | "externos" | "administradores";
const PLATFORM_SCOPE = "__sigapro_platform__";
const REVIEW_SCOPE = "__sigapro_unlinked__";
const EXTERNAL_ROLES = new Set<UserRole>(["profissional_externo", "proprietario_consulta"]);
const MASTER_ROLES = new Set<UserRole>(["master_admin", "master_ops"]);
const ADMIN_ROLES = new Set<UserRole>(["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor"]);
const DIRECTORY_PAGE_SIZE = 15;

/** The platform's technical tenant is not a municipality or a municipal client. */
export function isSigaproPlatformInstitution(item: Pick<Institution, "subdomain" | "name">): boolean {
  return item.subdomain?.trim().toLowerCase() === "sigapro-plataforma"
    || item.name.trim().toLowerCase() === "sigapro plataforma";
}

type Props = {
  institutions: readonly Institution[];
  users: readonly SessionUser[];
  renderDetails: (user: SessionUser) => ReactNode;
  getAvatarProfile?: (user: SessionUser) => UserProfile | null;
  onManageMunicipality: (id: string) => void;
  onPlatformStaffCreated: () => Promise<unknown>;
};

export function resolveMasterUserMunicipalityScope(
  user: Pick<SessionUser, "role" | "municipalityId" | "tenantId">,
  knownIds: ReadonlySet<string>,
): string {
  // A platform administrator is never silently listed as municipal staff.
  if (MASTER_ROLES.has(user.role)) return PLATFORM_SCOPE;
  const municipalityId = String(user.municipalityId ?? "").trim();
  const tenantId = String(user.tenantId ?? "").trim();
  const municipalityKnown = Boolean(municipalityId && knownIds.has(municipalityId));
  const tenantKnown = Boolean(tenantId && knownIds.has(tenantId));
  // Conflicting known institutional scopes require review, never a guess.
  if (municipalityKnown && tenantKnown && municipalityId !== tenantId) return REVIEW_SCOPE;
  if (municipalityKnown) return municipalityId;
  if (tenantKnown) return tenantId;
  return REVIEW_SCOPE;
}

export function MasterUserGovernance({ institutions, users, renderDetails, getAvatarProfile, onManageMunicipality, onPlatformStaffCreated }: Props) {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const canCreatePlatformOperator = session.role === "master_admin";
  const [selectedScope, setSelectedScope] = useState("");
  const [municipalityStatus, setMunicipalityStatus] = useState("todos");
  const [municipalityPlan, setMunicipalityPlan] = useState("todos");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [municipalityQuery, setMunicipalityQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [group, setGroup] = useState<Group>("todos");
  const [status, setStatus] = useState<"todos" | AccountStatus>("todos");
  const [role, setRole] = useState<"todos" | UserRole>("todos");
  const [page, setPage] = useState(1);

  const municipalities = useMemo(
    () => institutions.filter((item) => !isSigaproPlatformInstitution(item))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id)),
    [institutions],
  );
  const knownIds = useMemo(() => new Set(municipalities.map((item) => item.id)), [municipalities]);
  const byScope = useMemo(() => {
    const map = new Map<string, SessionUser[]>();
    for (const municipality of municipalities) map.set(municipality.id, []);
    map.set(PLATFORM_SCOPE, []);
    map.set(REVIEW_SCOPE, []);
    for (const user of users) {
      const scope = resolveMasterUserMunicipalityScope(user, knownIds);
      map.get(scope)?.push(user);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
    }
    return map;
  }, [knownIds, municipalities, users]);

  const activeScope = selectedScope && byScope.has(selectedScope)
    ? selectedScope
    : municipalities[0]?.id ?? PLATFORM_SCOPE;
  const selectedMunicipality = municipalities.find((item) => item.id === activeScope);
  const scopedUsers = byScope.get(activeScope) ?? [];
  const selectedLabel = selectedMunicipality?.name
    ?? (activeScope === PLATFORM_SCOPE ? "Equipe da plataforma SIGAPRO" : "Contas para revisão");
  const scopeDescription = selectedMunicipality
    ? [selectedMunicipality.city, selectedMunicipality.state].filter(Boolean).join(" / ") + " · " + (selectedMunicipality.plan || "Plano não definido")
    : activeScope === PLATFORM_SCOPE
      ? "Administradores e operadores da plataforma; não são usuários de uma prefeitura"
      : "Identidade municipal ausente ou divergente; nenhuma prefeitura foi presumida";
  const municipalityPlanOptions = useMemo(
    () => [...new Set(municipalities.map((item) => item.plan?.trim()).filter((value): value is string => Boolean(value)))]
      .sort((a,b) => a.localeCompare(b,"pt-BR")),
    [municipalities],
  );
  const filteredMunicipalities = useMemo(() => municipalities.filter((item) => {
    const q = municipalityQuery.trim().toLocaleLowerCase("pt-BR");
    const matchesName = !q || [item.name, item.city, item.state, item.subdomain, item.id]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(q));
    return matchesName && (municipalityStatus === "todos" || item.status === municipalityStatus)
      && (municipalityPlan === "todos" || item.plan === municipalityPlan);
  }), [municipalities, municipalityQuery, municipalityStatus, municipalityPlan]);
  const directoryTotalPages = Math.max(1, Math.ceil(filteredMunicipalities.length / DIRECTORY_PAGE_SIZE));
  const safeDirectoryPage = Math.min(directoryPage, directoryTotalPages);
  const directoryStart = (safeDirectoryPage - 1) * DIRECTORY_PAGE_SIZE;
  const directoryItems = filteredMunicipalities.slice(directoryStart, directoryStart + DIRECTORY_PAGE_SIZE);
  const visibleUsers = scopedUsers.filter((user) => {
    if (status !== "todos" && user.accountStatus !== status) return false;
    if (role !== "todos" && user.role !== role) return false;
    if (group === "administradores" && !ADMIN_ROLES.has(user.role)) return false;
    if (group === "externos" && !EXTERNAL_ROLES.has(user.role)) return false;
    if (group === "internos" && EXTERNAL_ROLES.has(user.role)) return false;
    const q = userQuery.trim().toLocaleLowerCase("pt-BR");
    return !q || [user.name, user.email, user.department, user.title, user.userType]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(q));
  });
  const countAdmins = scopedUsers.filter((user) => ADMIN_ROLES.has(user.role)).length;
  const countActive = scopedUsers.filter((user) => user.accountStatus === "active").length;
  const countBlocked = scopedUsers.filter((user) => user.accountStatus === "blocked").length;

  const changeScope = (next: string) => {
    setSelectedScope(next);
    setPage(1);
    setUserQuery("");
    setGroup("todos");
    setStatus("todos");
    setRole("todos");
  };

  return (
    <section className="sig-master-governance min-w-0 space-y-5" data-master-user-governance="true" aria-label="Governança de usuários por prefeitura">
      <header className="sig-master-governance-hero flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-[22px] border px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="sig-master-governance-hero-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border"><Landmark className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Administração geral · Cadastro e Gestão</p>
            <h2 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">Diretório institucional SIGAPRO</h2>
            <p className="mt-1 max-w-[75ch] text-sm leading-6">Prefeituras, administradores municipais e equipe própria da plataforma em escopos independentes, com filtros e paginação.</p>
          </div>
        </div>
        <span className="sig-master-scope-counter max-w-full rounded-full border px-3 py-2 text-xs font-semibold">{municipalities.length.toLocaleString("pt-BR")} prefeituras · {users.length.toLocaleString("pt-BR")} contas</span>
      </header>

      <nav className="grid min-w-0 gap-2.5 sm:grid-cols-3" aria-label="Divisões do cadastro SIGAPRO" data-master-governance-sections="true">
        <button type="button" onClick={() => changeScope(municipalities[0]?.id ?? PLATFORM_SCOPE)}
          aria-current={selectedMunicipality ? "page" : undefined}
          className="sig-master-governance-section min-w-0 rounded-2xl border px-4 py-3 text-left"
          data-master-section="municipalities" data-active={Boolean(selectedMunicipality)}>
          <span className="flex items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4 shrink-0" />Prefeituras</span>
          <span className="mt-1 block text-xs leading-5">{municipalities.length.toLocaleString("pt-BR")} cadastros municipais e seus acessos</span>
        </button>
        <button type="button" onClick={() => changeScope(PLATFORM_SCOPE)}
          aria-current={activeScope === PLATFORM_SCOPE ? "page" : undefined}
          className="sig-master-governance-section min-w-0 rounded-2xl border px-4 py-3 text-left"
          data-master-section="platform" data-active={activeScope === PLATFORM_SCOPE}>
          <span className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 shrink-0" />Equipe SIGAPRO</span>
          <span className="mt-1 block text-xs leading-5">Administradores e operadores da plataforma</span>
        </button>
        <button type="button" onClick={() => changeScope(REVIEW_SCOPE)}
          aria-current={activeScope === REVIEW_SCOPE ? "page" : undefined}
          className="sig-master-governance-section min-w-0 rounded-2xl border px-4 py-3 text-left"
          data-master-section="review" data-active={activeScope === REVIEW_SCOPE}>
          <span className="flex items-center gap-2 text-sm font-bold"><CircleAlert className="h-4 w-4 shrink-0" />Vínculos para revisão</span>
          <span className="mt-1 block text-xs leading-5">Contas sem Prefeitura confirmada</span>
        </button>
      </nav>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-master-governance-metrics="true">
        {[
          { name: "Prefeituras", value: municipalities.length, detail: "Carteira institucional" },
          { name: "Usuários municipais", value: users.length - (byScope.get(PLATFORM_SCOPE)?.length ?? 0) - (byScope.get(REVIEW_SCOPE)?.length ?? 0), detail: "Contas com vínculo identificado" },
          { name: "Equipe SIGAPRO", value: byScope.get(PLATFORM_SCOPE)?.length ?? 0, detail: "Acessos da plataforma" },
          { name: "Vínculos para revisão", value: byScope.get(REVIEW_SCOPE)?.length ?? 0, detail: "Sem associação municipal segura" },
        ].map((metric) => (
          <div key={metric.name} className="sig-master-governance-metric min-w-0 rounded-[18px] border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">{metric.name}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{metric.value.toLocaleString("pt-BR")}</p>
            <p className="mt-1 text-xs leading-5">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(280px,0.86fr)_minmax(0,2.14fr)]">
        <aside className="sig-master-governance-panel min-w-0 rounded-[22px] border p-4" aria-label="Diretório de prefeituras">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold">Prefeituras cadastradas</h3>
            <span className="text-xs font-medium tabular-nums">{filteredMunicipalities.length.toLocaleString("pt-BR")} / {municipalities.length.toLocaleString("pt-BR")}</span>
          </div>
          <label className="relative block">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <span className="sr-only">Buscar prefeitura</span>
            <Input aria-label="Buscar prefeitura" value={municipalityQuery}
              onChange={(event) => { setMunicipalityQuery(event.target.value); setDirectoryPage(1); }}
              placeholder="Buscar prefeitura ou cidade"
              className="sig-master-governance-search h-10 rounded-xl pl-9 text-sm" />
          </label>
          <div className="mt-2 grid min-w-0 grid-cols-2 gap-2" data-master-directory-filters="true">
            <Select value={municipalityStatus} onValueChange={(value) => { setMunicipalityStatus(value); setDirectoryPage(1); }}>
              <SelectTrigger aria-label="Filtrar prefeituras por situação" className="sig-master-governance-search h-10 min-w-0 w-full rounded-xl text-xs">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as situações</SelectItem>
                <SelectItem value="ativo">Ativas</SelectItem>
                <SelectItem value="implantacao">Implantação</SelectItem>
                <SelectItem value="suspenso">Suspensas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={municipalityPlan} onValueChange={(value) => { setMunicipalityPlan(value); setDirectoryPage(1); }}>
              <SelectTrigger aria-label="Filtrar prefeituras por plano" className="sig-master-governance-search h-10 min-w-0 w-full rounded-xl text-xs">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os planos</SelectItem>
                {municipalityPlanOptions.map((plan) => <SelectItem key={plan} value={plan}>{plan}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 grid min-w-0 gap-2" data-master-municipality-directory="true">
            {filteredMunicipalities.length === 0 ? <p className="py-6 text-center text-xs">Nenhuma prefeitura corresponde à busca.</p> : null}
            {directoryItems.map((municipality) => {
              const assignedUsers = byScope.get(municipality.id) ?? [];
              const admins = assignedUsers.filter((user) => user.role === "prefeitura_admin").length;
              const active = activeScope === municipality.id;
              return (
                <button key={municipality.id} type="button" onClick={() => changeScope(municipality.id)}
                  aria-pressed={active} data-master-municipality-option="true"
                  className="sig-master-governance-option flex w-full min-w-0 items-center gap-3 rounded-[14px] border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
                  <span className="sig-master-governance-option-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Building2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13px] font-semibold leading-5" title={municipality.name}>{municipality.name}</span>
                    <span className="mt-0.5 block break-words text-[11px] leading-4" title={municipality.city + " / " + municipality.state}>
                      {municipality.city || "Cidade não informada"} / {municipality.state || "UF"} · {assignedUsers.length} usuários
                    </span>
                    <span className="mt-1 block text-[10px] font-medium">{admins} administrador(es) · {municipality.status === "ativo" ? "Ativa" : municipality.status === "suspenso" ? "Suspensa" : "Implantação"}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </button>
              );
            })}
          </div>
          <nav className="sig-master-governance-directory-pagination mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-3"
            aria-label="Paginação do diretório de prefeituras" data-master-directory-pagination="true">
            <span className="text-xs leading-5" aria-live="polite">
              {filteredMunicipalities.length === 0 ? "Nenhum município" :
                `${directoryStart + 1}–${Math.min(directoryStart + DIRECTORY_PAGE_SIZE, filteredMunicipalities.length)} de ${filteredMunicipalities.length.toLocaleString("pt-BR")}`}
              {" · "}Página {safeDirectoryPage} de {directoryTotalPages}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <button type="button" aria-label="Página anterior de prefeituras" disabled={safeDirectoryPage === 1}
                onClick={() => setDirectoryPage(Math.max(1, safeDirectoryPage - 1))}
                className="sig-master-governance-page-btn inline-flex h-9 w-9 items-center justify-center rounded-xl border">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Próxima página de prefeituras" disabled={safeDirectoryPage >= directoryTotalPages}
                onClick={() => setDirectoryPage(Math.min(directoryTotalPages, safeDirectoryPage + 1))}
                className="sig-master-governance-page-btn inline-flex h-9 w-9 items-center justify-center rounded-xl border">
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
          </nav>
          <div className="mt-4 space-y-2 border-t pt-4" data-master-special-scopes="true">
            <button type="button" onClick={() => changeScope(PLATFORM_SCOPE)} aria-pressed={activeScope === PLATFORM_SCOPE}
              data-master-platform-option="true" className="sig-master-governance-option flex w-full items-center gap-3 rounded-[14px] border p-3 text-left">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold">Equipe SIGAPRO</span><span className="block text-[11px]">{byScope.get(PLATFORM_SCOPE)?.length ?? 0} contas da plataforma</span></span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
            <button type="button" onClick={() => changeScope(REVIEW_SCOPE)} aria-pressed={activeScope === REVIEW_SCOPE}
              data-master-review-option="true" className="sig-master-governance-option flex w-full items-center gap-3 rounded-[14px] border p-3 text-left">
              <CircleAlert className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold">Vínculos para revisar</span><span className="block text-[11px]">{byScope.get(REVIEW_SCOPE)?.length ?? 0} contas não atribuídas</span></span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </aside>

        <div className="sig-master-governance-panel min-w-0 rounded-[22px] border p-4 sm:p-5" data-master-selected-municipality={activeScope}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.10em]">{selectedMunicipality ? "Gestão municipal" : "Gestão da plataforma"}</p>
              <h3 className="mt-1 break-words text-lg font-bold leading-snug">{selectedLabel}</h3>
              <p className="mt-1 text-xs leading-5">{scopeDescription}</p>
            </div>
            {selectedMunicipality ? (
              <button type="button" onClick={() => onManageMunicipality(selectedMunicipality.id)}
                className="sig-master-governance-action inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold">
                Gerenciar Prefeitura <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            ) : activeScope === PLATFORM_SCOPE && canCreatePlatformOperator ? (
              <button type="button" onClick={() => navigate("/master/equipe/novo")}
                data-master-platform-create="true"
                className="sig-master-governance-action inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold">
                <Plus className="h-4 w-4 shrink-0" /> Novo acesso SIGAPRO
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-master-selected-summary="true">
            {[
              ["Total", scopedUsers.length], ["Ativos", countActive],
              [activeScope === PLATFORM_SCOPE ? "Admin. gerais" : "Administradores",
                activeScope === PLATFORM_SCOPE ? scopedUsers.filter((user) => user.role === "master_admin").length : countAdmins],
              [activeScope === PLATFORM_SCOPE ? "Operadores" : "Bloqueados",
                activeScope === PLATFORM_SCOPE ? scopedUsers.filter((user) => user.role === "master_ops").length : countBlocked],
            ].map(([label, count]) => (
              <div key={label} className="sig-master-governance-stat rounded-xl border px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em]">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{Number(count).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
          {activeScope === PLATFORM_SCOPE ? (
            <div className="min-w-0 space-y-3" data-master-platform-team="true">
              <p className="sig-master-governance-role-note rounded-xl border px-4 py-3 text-xs leading-5">
                <strong>Administrador Geral</strong>: acesso proprietário e protegido. <strong>Operação Geral</strong>:
                acesso administrativo para colaboradores SIGAPRO, cadastrado exclusivamente pelo Administrador Geral.
                Nenhuma dessas contas é um servidor municipal.
              </p>
              {canCreatePlatformOperator ? <PlatformStaffCreator onCreated={onPlatformStaffCreated} /> : null}
            </div>
          ) : null}
          {activeScope === REVIEW_SCOPE ? (
            <div role="status" className="sig-master-governance-alert mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Confira a prefeitura de origem no cadastro de cada usuário. Nenhuma conta deste grupo é automaticamente vinculada a uma instituição.
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Users2 className="h-4 w-4" /><h4 className="text-sm font-bold">Contas desta unidade</h4></div>
              <span className="text-xs">{visibleUsers.length} de {scopedUsers.length} registros</span>
            </div>
            <Tabs value={group} onValueChange={(value) => { setGroup(value as Group); setPage(1); }}>
              <TabsList className="sig-master-governance-tabs flex h-auto max-w-full flex-wrap justify-start gap-1.5 rounded-xl p-1">
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="internos">Internos</TabsTrigger>
                <TabsTrigger value="externos">Externos</TabsTrigger>
                <TabsTrigger value="administradores">Administradores</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(150px,1fr)_minmax(160px,1fr)]">
              <label className="relative block">
                <span className="sr-only">Buscar usuário da prefeitura selecionada</span>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input aria-label="Buscar usuário da prefeitura selecionada" value={userQuery} onChange={(event) => { setUserQuery(event.target.value); setPage(1); }}
                  placeholder="Nome, e-mail, cargo ou setor" className="sig-master-governance-search h-10 rounded-xl pl-9" />
              </label>
              <Select value={status} onValueChange={(value) => { setStatus(value as "todos" | AccountStatus); setPage(1); }}>
                <SelectTrigger aria-label="Filtrar situação do usuário" className="sig-master-governance-search h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="active">Ativos</SelectItem><SelectItem value="blocked">Bloqueados</SelectItem><SelectItem value="inactive">Inativos</SelectItem></SelectContent>
              </Select>
              <Select value={role} onValueChange={(value) => { setRole(value as "todos" | UserRole); setPage(1); }}>
                <SelectTrigger aria-label="Filtrar perfil de acesso" className="sig-master-governance-search h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os perfis</SelectItem>{Object.entries(roleLabels).map(([code, label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <CompactUserRegistry users={visibleUsers} page={page} onPageChange={setPage} pageSize={12}
              getAvatarProfile={getAvatarProfile}
              filterKey={[activeScope, userQuery, status, role, group].join("|")}
              renderDetails={renderDetails}
              label={"Usuários vinculados a " + selectedLabel} />
          </div>
        </div>
      </div>
    </section>
  );
}
