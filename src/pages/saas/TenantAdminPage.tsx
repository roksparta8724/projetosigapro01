import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2, ClipboardList, Clock3, FileText, PencilLine, Search, ShieldAlert, ShieldCheck, Undo2, UserCog, UserRoundCog, UserX, Users2, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCard } from "@/components/platform/AlertCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { accessLevelLabels, matchesOperationalScope, roleLabels, roleSuggestedTitles, statusLabel, statusTone, type AccountStatus, type ProcessRecord, type SessionUser, type UserRole } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

const tenantRoles: UserRole[] = ["prefeitura_admin", "prefeitura_supervisor", "analista", "financeiro", "setor_intersetorial", "fiscal"];
type UserSegment = "todos" | "externos" | "analistas" | "fiscal" | "financeiro" | "administradores" | "outros";
type WorkspaceView = "visao-geral" | "fila" | "usuarios" | "solicitacoes" | "historico";

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
  if (segment === "externos") return user.role === "profissional_externo" || user.role === "proprietario_consulta";
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

export function TenantAdminPage() {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const { municipality, scopeId, name: municipalityName } = useMunicipality();
  const { sessionUsers, institutions, createTenantUser, updateTenantUser, setUserAccountStatus, deleteUserAccount, registrationRequests, approveRegistrationRequest, processes, getUserProfile } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const activeInstitution = municipality ?? institutions.find((item) => item.id === effectiveScopeId) ?? null;
  const tenantUsers = useMemo(() => sessionUsers.filter((user) => matchesOperationalScope(effectiveScopeId, user)), [effectiveScopeId, sessionUsers]);
  const tenantProcesses = useMemo(() => processes.filter((process) => matchesOperationalScope(effectiveScopeId, process)), [effectiveScopeId, processes]);
  const pendingRequests = useMemo(() => registrationRequests.filter((request) => request.status === "pendente" && matchesOperationalScope(effectiveScopeId, request)), [effectiveScopeId, registrationRequests]);
  const currentUnit = activeInstitution?.secretariaResponsavel || session.department || session.title || "Administração da Prefeitura";
  const availablePositionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            currentUnit,
            ...tenantUsers.flatMap((user) => [user.title, user.department]),
            ...tenantRoles.map((role) => roleSuggestedTitles[role]),
          ].filter((value): value is string => Boolean(value?.trim())),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-BR")),
    [currentUnit, tenantUsers],
  );

  const [statusMessage, setStatusMessage] = useState("");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("visao-geral");
  const [segment, setSegment] = useState<UserSegment>("todos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | AccountStatus>("todos");
  const [roleFilter, setRoleFilter] = useState<"todos" | UserRole>("todos");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", role: "analista" as UserRole, title: roleSuggestedTitles.analista, accessLevel: "1" });
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "analista" as UserRole, title: "", accessLevel: "1", department: "", userType: "" });

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

  const metrics = useMemo(() => ({ protocolsInProgress: tenantProcesses.filter((process) => !["deferido", "indeferido", "arquivado"].includes(process.status)).length, inAnalysis: tenantProcesses.filter((process) => ["analise_tecnica", "reapresentacao", "exigencia"].includes(process.status)).length, pendingPayments: tenantProcesses.filter((process) => process.payment.status === "pendente").length, approved: tenantProcesses.filter((process) => process.status === "deferido").length }), [tenantProcesses]);
  const criticalAlerts = useMemo(() => tenantProcesses.filter((process) => process.sla.breached || process.sla.hoursRemaining <= 12), [tenantProcesses]);
  const pendingSectorItems = useMemo(() => [{ label: "Triagem", value: tenantProcesses.filter((process) => process.triage.status !== "concluido").length, helper: "Entradas aguardando conferência documental" }, { label: "Análise", value: tenantProcesses.filter((process) => process.status === "analise_tecnica").length, helper: "Processos em parecer técnico" }, { label: "Financeiro", value: tenantProcesses.filter((process) => process.payment.status === "pendente").length, helper: "Guias ainda sem compensação" }], [tenantProcesses]);
  const actionRequired = useMemo(() => tenantProcesses.filter((process) => process.requirements.some((item) => item.status === "aberta" || item.status === "respondida") || process.sla.breached || process.payment.status === "pendente").slice(0, 6), [tenantProcesses]);
  const recentActivity = useMemo(() => tenantProcesses.flatMap((process) => process.timeline.slice(0, 2).map((entry) => ({ processId: process.id, protocol: process.protocol, title: entry.title, detail: entry.detail, actor: entry.actor, at: entry.at, status: process.status }))).slice(0, 8), [tenantProcesses]);
  const recentApprovals = useMemo(() => tenantProcesses.filter((process) => process.status === "deferido").slice(0, 5), [tenantProcesses]);
  const mainQueue = useMemo(() => [...tenantProcesses].sort((a, b) => { const aPriority = a.sla.breached ? 2 : a.sla.hoursRemaining <= 12 ? 1 : 0; const bPriority = b.sla.breached ? 2 : b.sla.hoursRemaining <= 12 ? 1 : 0; if (aPriority !== bPriority) return bPriority - aPriority; return a.sla.hoursRemaining - b.sla.hoursRemaining; }).slice(0, 8), [tenantProcesses]);
  const productivity = useMemo(() => tenantUsers.filter((user) => ["analista", "prefeitura_admin", "prefeitura_supervisor", "fiscal", "financeiro"].includes(user.role)).map((user) => ({ name: user.name, role: roleLabels[user.role], total: tenantProcesses.filter((process) => process.technicalLead === user.name).length, pendencias: tenantProcesses.filter((process) => process.technicalLead === user.name && process.requirements.some((item) => item.status !== "atendida" && item.status !== "cancelada")).length })).filter((item) => item.total > 0 || item.pendencias > 0).slice(0, 6), [tenantProcesses, tenantUsers]);
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
  const startEdit = (user: SessionUser) => { setEditingUserId(user.id); setEditForm({ name: user.name, email: user.email, role: user.role, title: user.title, accessLevel: String(user.accessLevel), department: user.department || user.title, userType: user.userType || (user.role === "profissional_externo" || user.role === "proprietario_consulta" ? "Externo" : "Interno") }); };
  const handleCreateUser = (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveScopeId) return;

    const normalizedName = form.fullName.trim();
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedTitle = form.title.trim();

    if (!normalizedName || !normalizedEmail || !normalizedTitle) {
      setStatusMessage("Preencha nome, e-mail e cargo/setor para criar o usuário interno.");
      return;
    }

    const user = createTenantUser({
      tenantId: effectiveScopeId,
      fullName: normalizedName,
      email: normalizedEmail,
      role: form.role,
      title: normalizedTitle,
      accessLevel: Number(form.accessLevel) as 1 | 2 | 3,
    });

    setStatusMessage(
      `Usuário ${user.name} criado e vinculado à Prefeitura ${municipalityName || activeInstitution?.name || "selecionada"} com ${accessLevelLabels[user.accessLevel]}. Senha inicial: Acesso@2026`,
    );
    setForm({ fullName: "", email: "", role: "analista", title: roleSuggestedTitles.analista, accessLevel: "1" });
  };
  const handleSaveEdit = (userId: string) => { const updated = updateTenantUser(userId, { name: editForm.name.trim(), email: editForm.email.trim().toLowerCase(), role: editForm.role, title: editForm.title.trim(), accessLevel: Number(editForm.accessLevel) as 1 | 2 | 3, department: editForm.department.trim(), userType: editForm.userType.trim() }); if (!updated) return; setStatusMessage(`Dados de ${updated.name} atualizados com sucesso.`); setEditingUserId(null); };
  const handleBlockToggle = (user: SessionUser) => { if (user.id === session.id) { setStatusMessage("Não é permitido bloquear a própria conta administrativa em uso."); return; } if (user.accountStatus === "blocked") { if (!window.confirm(`Deseja desbloquear ${user.name}?`)) return; const updated = setUserAccountStatus({ userId: user.id, status: "active", actor: session.id }); if (updated) setStatusMessage(`Conta de ${updated.name} desbloqueada com sucesso.`); return; } const reason = window.prompt(`Informe o motivo do bloqueio de ${user.name}:`, user.blockReason || "Bloqueio administrativo"); if (reason === null) return; const updated = setUserAccountStatus({ userId: user.id, status: "blocked", actor: session.id, reason }); if (updated) setStatusMessage(`Conta de ${updated.name} bloqueada com sucesso.`); };
  const handleDeactivate = (user: SessionUser) => { if (user.id === session.id) { setStatusMessage("Não é permitido desativar a própria conta administrativa em uso."); return; } if (!window.confirm(`Deseja desativar a conta de ${user.name}? Esta ação pode ser revertida depois.`)) return; const reason = window.prompt("Informe a justificativa da desativação:", user.blockReason || "Conta desativada administrativamente"); if (reason === null) return; const updated = deleteUserAccount({ userId: user.id, actor: session.id, reason }); if (updated) setStatusMessage(`Conta de ${updated.name} marcada como inativa.`); };

  const renderQueueCard = (process: ProcessRecord) => {
    const pendingRequirements = process.requirements.filter((item) => item.status === "aberta" || item.status === "respondida");
    return <div key={process.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="sig-fit-title text-lg font-semibold leading-7 text-slate-950" title={process.protocol}>{process.protocol}</p><Badge variant="outline" className={statusTone(process.status)}>{statusLabel(process.status)}</Badge><Badge className={`rounded-full border ${getPriorityTone(process)}`}>{process.sla.breached ? "SLA vencido" : process.sla.hoursRemaining <= 12 ? "SLA crítico" : "No prazo"}</Badge></div><p className="mt-2 line-clamp-2 text-base leading-6 text-slate-900" title={process.title}>{process.title}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><p className="sig-fit-copy text-sm leading-6 text-slate-500" title={process.ownerName}>Responsável externo: {process.ownerName}</p><p className="sig-fit-copy text-sm leading-6 text-slate-500" title={`IPTU ${process.property.iptu}`}>Cadastro imobiliário: {process.property.iptu}</p></div><p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={process.address}>{process.address}</p></div><div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Setor atual:</span> <span className="sig-fit-title block leading-6" title={process.sla.currentStage}>{process.sla.currentStage}</span></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Responsável:</span> <span className="sig-fit-title block leading-6" title={process.technicalLead}>{process.technicalLead}</span></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Prazo:</span> <span className="sig-fit-title block leading-6" title={process.sla.dueDate}>{process.sla.dueDate}</span></div></div></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Triagem</p><p className="mt-2 text-lg font-semibold text-slate-950">{process.triage.status === "concluido" ? "Concluída" : "Em aberto"}</p><p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={process.triage.assignedTo || "Sem responsável"}>{process.triage.assignedTo || "Sem responsável"}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Pendências</p><p className="mt-2 text-lg font-semibold text-slate-950">{pendingRequirements.length}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500" title={pendingRequirements[0]?.title || "Sem exigências abertas"}>{pendingRequirements[0]?.title || "Sem exigências abertas"}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Financeiro</p><p className="mt-2 text-lg font-semibold text-slate-950">{process.payment.status === "compensada" ? "Compensado" : "Pendente"}</p><p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={`Guia ${process.payment.guideNumber}`}>Guia {process.payment.guideNumber}</p></div></div></div>;
  };

  const renderUserCard = (user: SessionUser) => {
    const profile = getUserProfile(user.id, user.email);
    const isEditing = editingUserId === user.id;

    return (
      <div key={user.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <UserAvatar name={user.name} imageUrl={profile?.avatarUrl} size="lg" />
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="sig-fit-title text-lg font-semibold leading-7 text-slate-950">{user.name}</p>
                  <Badge className={`rounded-full border ${getStatusTone(user.accountStatus)}`}>{getStatusLabel(user.accountStatus)}</Badge>
                </div>
                <p className="sig-fit-copy text-sm leading-6 text-slate-600">{user.title || user.department || "Setor não informado"}</p>
                <p className="sig-fit-copy text-sm leading-6 text-slate-500" title={user.email}>{user.email}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:max-w-[42%] xl:justify-end">
              <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">{roleLabels[user.role]}</Badge>
              <Badge variant="outline" className="rounded-full border-slate-300 px-3 py-1 text-slate-700">{accessLevelLabels[user.accessLevel]}</Badge>
              <Badge variant="outline" className="rounded-full border-slate-300 px-3 py-1 text-slate-600">{user.userType || "Usuário"}</Badge>
            </div>
          </div>

          {isEditing ? (
            <div className="grid gap-3 border-t border-slate-200 pt-5 lg:grid-cols-2 2xl:grid-cols-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Setor / cargo</Label>
                <Input value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={editForm.role} onValueChange={(value) => setEditForm((current) => ({ ...current, role: value as UserRole }))}>
                  <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nível de acesso</Label>
                <Select value={editForm.accessLevel} onValueChange={(value) => setEditForm((current) => ({ ...current, accessLevel: value }))}>
                  <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Nível 1 - Operacional</SelectItem><SelectItem value="2">Nível 2 - Coordenação</SelectItem><SelectItem value="3">Nível 3 - Gestão total</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input value={editForm.userType} onChange={(event) => setEditForm((current) => ({ ...current, userType: event.target.value }))} />
              </div>
              <div className="space-y-2 lg:col-span-2 2xl:col-span-3">
                <Label>Departamento</Label>
                <Input value={editForm.department} onChange={(event) => setEditForm((current) => ({ ...current, department: event.target.value }))} />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-2 2xl:col-span-3 sm:flex-row sm:flex-wrap">
                <Button type="button" className="h-11 w-full rounded-2xl bg-slate-950 hover:bg-slate-900 sm:w-auto" onClick={() => handleSaveEdit(user.id)}>Salvar alterações</Button>
                <Button type="button" variant="outline" className="h-11 w-full rounded-2xl sm:w-auto" onClick={() => setEditingUserId(null)}>Cancelar</Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-6 text-slate-600">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Departamento</span>
              <span className="mt-2 block font-medium text-slate-800">{user.department || user.title || "Não informado"}</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-6 text-slate-600">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Criado em</span>
              <span className="mt-2 block font-medium text-slate-800">{user.createdAt || "Não informado"}</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-6 text-slate-600">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Último acesso</span>
              <span className="mt-2 block font-medium text-slate-800">{user.lastAccessAt || "Não registrado"}</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-6 text-slate-600">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Justificativa</span>
              <span className="mt-2 block font-medium text-slate-800">{user.blockReason || "Sem restrição administrativa"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => startEdit(user)}><PencilLine className="mr-2 h-4 w-4 text-sky-200" />Editar</Button>
            <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => handleBlockToggle(user)}>{user.accountStatus === "blocked" ? <><Undo2 className="mr-2 h-4 w-4 text-sky-200" />Desbloquear</> : <><ShieldAlert className="mr-2 h-4 w-4 text-sky-200" />Bloquear</>}</Button>
            <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 hover:text-slate-50 sm:w-auto" onClick={() => handleDeactivate(user)}><UserX className="mr-2 h-4 w-4 text-rose-300" />Desativar conta</Button>
          </div>
        </div>
      </div>
    );
  };
  const executiveCards = [
    { label: "Visão geral", value: `${metrics.protocolsInProgress}`, description: "Processos municipais em andamento", icon: ClipboardList, tone: "blue" as const },
    { label: "Fila operacional", value: `${mainQueue.length}`, description: "Itens priorizados para coordenação", icon: Clock3, tone: "amber" as const },
    { label: "Usuários", value: `${tenantUsers.length}`, description: "Equipe vinculada à Prefeitura", icon: Users2, tone: "emerald" as const },
    { label: "Solicitações", value: `${pendingRequests.length}`, description: "Pedidos aguardando validação", icon: BadgeCheck, tone: "rose" as const },
  ];

  return (
    <PortalFrame eyebrow="Administração da Prefeitura" title={municipalityName || activeInstitution?.name || "Administração da Prefeitura"}>
      <PageShell>
        <section className="sig-dark-panel overflow-hidden rounded-[30px] border border-slate-200/90 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.06),transparent_22%),linear-gradient(135deg,#fcfdff_0%,#f7fafc_56%,#eef4f8_100%)] shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="grid gap-0 lg:grid-cols-[132px_minmax(0,1fr)]">
            <div className="flex items-center justify-center p-5 lg:p-6">
              <div className="flex h-[104px] w-[104px] items-center justify-center rounded-[26px] border border-slate-200 bg-white/95 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
                <span className="text-[1.9rem] font-semibold text-slate-700">
                  {(municipalityName || activeInstitution?.name || "P").charAt(0)}
                </span>
              </div>
            </div>
            <div className="p-5 md:p-6 lg:pl-2">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Administração da Prefeitura</p>
                  <h1 className="mt-2 max-w-[22ch] text-2xl font-semibold leading-tight text-slate-950">
                    {municipalityName || activeInstitution?.name || "Administração da Prefeitura"}
                  </h1>
                  <p className="mt-2 max-w-[64ch] text-sm leading-6 text-slate-500">
                    Centro institucional da operação municipal, com governança de usuários, solicitações e prioridades da Prefeitura.
                  </p>
                </div>
                <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                  <UserAvatar name={session.name} imageUrl={getUserProfile(session.id, session.email)?.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="sig-fit-title text-sm font-semibold text-slate-900">{session.name}</p>
                    <p className="sig-fit-copy text-xs text-slate-500">{session.title || "Responsável institucional"}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Secretaria</p>
                  <p className="mt-2 sig-fit-title text-sm font-semibold text-slate-900">{currentUnit}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">SLA crítico</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {criticalAlerts.length > 0 ? `${criticalAlerts.length} item(ns) com urgência` : "Sem urgência crítica"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Fluxo restrito</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{restrictedTransitCount} processo(s) com trâmite interno restrito</p>
                </div>
              </div>
            </div>
          </div>
        </section>

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

        <InternalTabs
          className="border-slate-200/90 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
          value={workspaceView}
          onChange={(value) => setWorkspaceView(value as WorkspaceView)}
          items={[
            { value: "visao-geral", label: "Visão geral", helper: "Resumo executivo" },
            { value: "fila", label: "Fila operacional", helper: "Protocolos e prioridades" },
            { value: "usuarios", label: "Usuários", helper: "Equipe e acessos" },
            { value: "solicitacoes", label: "Solicitações", helper: "Pedidos pendentes" },
            { value: "historico", label: "Histórico", helper: "Atividades recentes" },
          ]}
        />

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
            {statusMessage}
          </div>
        ) : null}

        {workspaceView === "visao-geral" ? (
          <PageMainGrid className="xl:grid-cols-[minmax(0,1.72fr)_minmax(320px,0.88fr)]">
            <PageMainContent>
              <SectionCard
                title="Centro operacional da Prefeitura"
                description="Resumo executivo da operação municipal, com leitura da fila principal e prioridades da coordenação."
                icon={ClipboardList}
                className="shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
                contentClassName="space-y-5"
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Em análise</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{metrics.inAnalysis}</p>
                    <p className="mt-1 text-sm text-slate-500">Parecer técnico e reapresentação.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Financeiro</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{metrics.pendingPayments}</p>
                    <p className="mt-1 text-sm text-slate-500">Guias ainda sem compensação.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Aprovados</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{metrics.approved}</p>
                    <p className="mt-1 text-sm text-slate-500">Processos já concluídos.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {mainQueue.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhum protocolo operacional encontrado para esta Prefeitura.
                    </div>
                  ) : (
                    mainQueue.slice(0, 3).map((process) => renderQueueCard(process))
                  )}
                </div>
              </SectionCard>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.9fr)]">
                <TableCard
                  title="Atividade institucional recente"
                  description="Leitura curta das últimas movimentações relevantes da operação municipal."
                  icon={Clock3}
                >
                  <div className="space-y-3">
                    {recentActivity.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                        Nenhuma movimentação recente encontrada.
                      </div>
                    ) : (
                      recentActivity.slice(0, 5).map((item, index) => (
                        <div key={`${item.processId}-${index}`} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-950">{item.protocol}</p>
                                <Badge variant="outline" className={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                              </div>
                              <p className="mt-1 text-sm font-medium text-slate-800">{item.title}</p>
                              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.detail}</p>
                            </div>
                            <div className="text-sm text-slate-500">
                              <p>{item.actor}</p>
                              <p>{item.at}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TableCard>

                <SectionCard
                  title="Fluxo institucional"
                  description="Leitura curta da circulação atual entre unidade, despacho e acesso externo."
                  icon={FileText}
                  className="shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
                  contentClassName="space-y-3"
                >
                  {unitSummary.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{item.value}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.helper}</p>
                    </div>
                  ))}
                </SectionCard>
              </div>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Pendências críticas" description="Alertas e gargalos que exigem decisão imediata." icon={AlertTriangle}>
                <div className="space-y-4">
                  <AlertCard
                    title="SLA crítico"
                    description={
                      criticalAlerts.length > 0
                        ? `${criticalAlerts.length} protocolo(s) com prazo vencido ou a menos de 12 horas.`
                        : "Nenhum SLA crítico no momento."
                    }
                    tone={criticalAlerts.length > 0 ? "danger" : "success"}
                  />
                  {actionRequired.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      Nenhuma prioridade crítica adicional encontrada.
                    </div>
                  ) : (
                    actionRequired.slice(0, 3).map((process) => (
                      <div key={process.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="sig-fit-title text-sm font-semibold text-slate-950">{process.protocol}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{process.title}</p>
                          </div>
                          <Badge variant="outline" className={getPriorityTone(process)}>
                            {process.sla.breached ? "Vencido" : process.sla.hoursRemaining <= 12 ? "Crítico" : "No prazo"}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Ações rápidas" description="Atalhos para os próximos blocos operacionais." icon={CheckCircle2}>
                <div className="space-y-3">
                  <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full justify-start rounded-2xl text-slate-50" onClick={() => setWorkspaceView("fila")}>
                    <ClipboardList className="mr-2 h-4 w-4 text-sky-200" />
                    Abrir fila operacional
                  </Button>
                  <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full justify-start rounded-2xl text-slate-50" onClick={() => setWorkspaceView("usuarios")}>
                    <Users2 className="mr-2 h-4 w-4 text-sky-200" />
                    Gerenciar usuários
                  </Button>
                  <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full justify-start rounded-2xl text-slate-50" onClick={() => setWorkspaceView("solicitacoes")}>
                    <BadgeCheck className="mr-2 h-4 w-4 text-sky-200" />
                    Revisar solicitações
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title="Resumo institucional" description="Situação curta da unidade municipal." icon={ShieldCheck}>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Recepção por setor</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {pendingSectorItems.map((item) => `${item.label}: ${item.value}`).join(" • ")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Unidade atual</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{currentUnit}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Distribuição atual</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {receivedForCurrentUnit.length} recebidos • {generatedByCurrentUnit.length} gerados • {assignedMunicipal.length} atribuídos
                    </p>
                  </div>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {workspaceView === "fila" ? <TableCard title="Fila operacional" description="Área dedicada à operação da Prefeitura, com prioridade, responsável, prazo e etapa atual." icon={ClipboardList}><div className="space-y-4"><div className="grid gap-3 lg:grid-cols-[1.2fr,0.7fr,0.7fr]"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Prefeitura operando com {mainQueue.length} item(ns) priorizados na fila principal.</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">SLA crítico: {criticalAlerts.length} item(ns).</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Pendências financeiras: {metrics.pendingPayments}.</div></div>{mainQueue.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhum protocolo operacional encontrado para esta Prefeitura.</div> : mainQueue.map((process) => renderQueueCard(process))}</div></TableCard> : null}

        {workspaceView === "usuarios" ? <PageMainGrid className="xl:grid-cols-[minmax(0,1.72fr)_minmax(360px,0.92fr)] 2xl:grid-cols-[minmax(0,1.8fr)_minmax(390px,0.94fr)] xl:items-start"><PageMainContent className="gap-6"><PageStatsRow className="lg:grid-cols-3 xl:grid-cols-3 xl:gap-5 2xl:gap-6 [&>*]:min-w-0 [&>*]:min-h-[170px]"><StatCard label="Equipe" value={String(tenantUsers.length)} description="Usuários vinculados à Prefeitura" icon={Users2} tone="blue" /><StatCard label="Administradores" value={String(tenantUsers.filter((user) => user.role === "prefeitura_admin").length)} description="Perfis de gestão ativos" icon={ShieldCheck} tone="emerald" /><StatCard label="Bloqueados" value={String(tenantUsers.filter((user) => user.accountStatus === "blocked").length)} description="Contas com restrição" icon={ShieldAlert} tone="rose" /></PageStatsRow><TableCard title="Gestão de usuários" description="Equipe interna, papéis, níveis de acesso e administração da Prefeitura." icon={Users2} className="shadow-[0_14px_32px_rgba(15,23,42,0.06)]"><div className="space-y-5"><Tabs value={segment} onValueChange={(value) => setSegment(value as UserSegment)}><TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl bg-slate-100 p-1.5"><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="administradores">Administradores</TabsTrigger><TabsTrigger value="analistas">Analistas</TabsTrigger><TabsTrigger value="financeiro">Financeiro</TabsTrigger><TabsTrigger value="fiscal">Fiscal</TabsTrigger><TabsTrigger value="externos">Externos</TabsTrigger><TabsTrigger value="outros">Outros</TabsTrigger></TabsList></Tabs><div className="grid gap-3 xl:grid-cols-[minmax(0,1.28fr)_minmax(220px,0.72fr)_minmax(220px,0.72fr)] 2xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.78fr)_minmax(240px,0.78fr)] xl:items-center"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, setor ou categoria" className="h-11 rounded-2xl pl-10.5" /></div><Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "todos" | AccountStatus)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="blocked">Bloqueado</SelectItem><SelectItem value="inactive">Inativo</SelectItem></SelectContent></Select><Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "todos" | UserRole)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Perfil" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os perfis</SelectItem>{tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 2xl:gap-5">{filteredUsers.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhum usuário encontrado para os filtros atuais.</div> : filteredUsers.map((user) => renderUserCard(user))}</div></div></TableCard></PageMainContent><PageSideContent className="gap-6"><SectionCard title="Novo usuário interno" description="Crie acessos da Prefeitura com perfil, cargo existente e vínculo automático ao órgão atual." className="xl:sticky xl:top-5 shadow-[0_14px_32px_rgba(15,23,42,0.06)]" contentClassName="space-y-4" actions={<Button type="button" variant="outline" className="sig-dark-action-btn rounded-full text-slate-50" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4 text-sky-200" />Voltar</Button>}><form className="space-y-4" onSubmit={handleCreateUser}><div className="space-y-2"><Label>Prefeitura vinculada</Label><div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">{municipalityName || activeInstitution?.name || "Prefeitura atual"}</div></div><div className="space-y-2"><Label>Nome completo</Label><Input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></div><div className="space-y-2"><Label>E-mail</Label><Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div><div className="space-y-2"><Label>Perfil</Label><Select value={form.role} onValueChange={(value) => setForm((current) => ({ ...current, role: value as UserRole, title: roleSuggestedTitles[value as UserRole] }))}><SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent>{tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Cargo ou setor</Label><Input list="tenant-position-options" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Selecione ou digite um cargo existente" /><datalist id="tenant-position-options">{availablePositionOptions.map((option) => <option key={option} value={option} />)}</datalist><p className="text-xs leading-5 text-slate-500">Os cargos existentes desta Prefeitura aparecem como sugestão para manter o padrão institucional.</p></div><div className="space-y-2"><Label>Nível de acesso</Label><Select value={form.accessLevel} onValueChange={(value) => setForm((current) => ({ ...current, accessLevel: value }))}><SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Nível 1 - Operacional</SelectItem><SelectItem value="2">Nível 2 - Coordenação</SelectItem><SelectItem value="3">Nível 3 - Gestão total</SelectItem></SelectContent></Select></div><Button type="submit" className="h-12 w-full rounded-2xl bg-slate-950 hover:bg-slate-900">Cadastrar usuário</Button></form></SectionCard></PageSideContent></PageMainGrid> : null}

        {workspaceView === "solicitacoes" ? <PageMainGrid className="xl:grid-cols-[minmax(0,1.52fr)_minmax(320px,0.88fr)]"><PageMainContent><SectionCard title="Solicitações pendentes" description="Pedidos externos, acessos e itens aguardando análise institucional da Prefeitura." icon={BadgeCheck} contentClassName="space-y-3">{pendingRequests.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">Nenhuma solicitação pendente no momento.</div> : pendingRequests.map((request) => <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex min-w-0 items-start gap-3"><UserAvatar name={request.fullName} imageUrl={request.avatarUrl} size="md" /><div className="min-w-0"><p className="sig-fit-title text-base font-semibold text-slate-950">{request.fullName}</p><p className="text-sm leading-6 text-slate-600">{roleLabels[request.role]} • {request.title || request.professionalType || "Sem função informada"}</p><p className="mt-1 sig-fit-copy text-sm text-slate-500" title={request.email}>{request.email}</p></div></div><p className="mt-2 text-sm text-slate-500">Solicitado em {request.createdAt}</p><Button type="button" className="mt-4 h-10 rounded-full bg-slate-950 px-5 hover:bg-slate-900" onClick={() => { const user = approveRegistrationRequest(request.id); if (user) setStatusMessage(`Solicitação aprovada para ${user.name}. Senha inicial: Acesso@2026`); }}>Aprovar acesso</Button></div>)}</SectionCard></PageMainContent><PageSideContent><SectionCard title="Coordenação por equipe" description="Carga atual e pendências por responsável técnico." icon={ShieldCheck} contentClassName="space-y-3">{productivity.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">Ainda não há produtividade consolidada para esta Prefeitura.</div> : productivity.map((item) => <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="sig-fit-title text-base font-semibold text-slate-950">{item.name}</p><p className="text-sm text-slate-500">{item.role}</p><div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3">Fila: {item.total}</div><div className="rounded-xl bg-slate-50 p-3">Pendências: {item.pendencias}</div></div></div>)}</SectionCard></PageSideContent></PageMainGrid> : null}

        {workspaceView === "historico" ? <PageMainGrid className="xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.82fr)]"><PageMainContent><TableCard title="Movimentações recentes" description="Trilha curta de trâmites, pareceres e ações da operação municipal." icon={Clock3}><div className="space-y-3">{recentActivity.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhuma movimentação recente encontrada.</div> : recentActivity.map((item, index) => <div key={`${item.processId}-${index}`} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-950">{item.protocol}</p><Badge variant="outline" className={statusTone(item.status)}>{statusLabel(item.status)}</Badge></div><p className="mt-1 text-sm font-medium text-slate-800">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.detail}</p></div><div className="text-sm text-slate-500"><p>{item.actor}</p><p>{item.at}</p></div></div></div>)}</div></TableCard></PageMainContent><PageSideContent><SectionCard title="Aprovações recentes" description="Deferimentos já concluídos e liberados pela operação municipal." icon={CheckCircle2} contentClassName="space-y-3">{recentApprovals.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">Nenhum deferimento recente encontrado.</div> : recentApprovals.map((process) => <div key={process.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-950">{process.protocol}</p><p className="mt-1 text-sm text-slate-800">{process.title}</p><p className="mt-1 text-sm text-slate-500">{process.ownerName}</p></div>)}</SectionCard></PageSideContent></PageMainGrid> : null}
      </PageShell>
    </PortalFrame>
  );
}
