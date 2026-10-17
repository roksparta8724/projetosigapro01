import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ClipboardList, Clock3, FileText, Network, PencilLine, Plus, Search, ShieldAlert, ShieldCheck, Undo2, UserCog, UserRoundCog, UserX, Users2, Wallet } from "lucide-react";
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
import { MunicipalOrganizationChart } from "@/components/platform/MunicipalOrganizationChart";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { accessLevelLabels, getProcessPaymentGuides, matchesOperationalScope, roleLabels, roleSuggestedTitles, statusLabel, statusTone, type AccountStatus, type ProcessRecord, type SessionUser, type UserRole } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import {
  assignRemoteProfileDepartment,
  listRemoteMunicipalDepartments,
  upsertRemoteMunicipalDepartment,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";

const tenantRoles: UserRole[] = ["prefeitura_admin", "prefeitura_supervisor", "analista", "financeiro", "setor_intersetorial", "fiscal", "profissional_externo", "property_owner", "proprietario_consulta"];

const municipalProfilePresets = [
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

function applyMunicipalProfileSelection(
  value: string,
  current: { role: UserRole; profileLabel: string; accessLevel: string },
) {
  const preset = municipalProfilePresets.find((item) => item.key === value);
  if (preset) {
    return {
      ...current,
      role: preset.role,
      profileLabel: preset.label,
      accessLevel: preset.accessLevel,
    };
  }
  const role = value as UserRole;
  return {
    ...current,
    role,
    profileLabel: "",
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

function applyMunicipalDepartmentSelection(
  departmentName: string,
  current: {
    role: UserRole;
    profileLabel: string;
    accessLevel: string;
    department: string;
  },
) {
  if (!departmentName) {
    return { ...current, department: "" };
  }

  const nextRole = resolveMunicipalRoleFromDepartment(departmentName, current.role);
  return {
    ...current,
    department: departmentName,
    role: nextRole,
    profileLabel: "",
    accessLevel:
      nextRole === "prefeitura_admin"
        ? "3"
        : nextRole === "prefeitura_supervisor"
          ? "2"
          : current.accessLevel || "1",
  };
}
type UserSegment = "todos" | "externos" | "analistas" | "fiscal" | "financeiro" | "administradores" | "outros";
type WorkspaceView = "visao-geral" | "fila" | "usuarios" | "organograma" | "historico";

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
  const planEntitlements = usePlanEntitlements();
  const { municipality, scopeId, name: municipalityName } = useMunicipality();
  const { sessionUsers, institutions, createTenantUser, updateTenantUser, setUserAccountStatus, deleteUserAccount, processes, getUserProfile, getInstitutionSettings, refreshRemoteStore } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const activeInstitution = municipality ?? institutions.find((item) => item.id === effectiveScopeId) ?? null;
  const tenantUsers = useMemo(() => sessionUsers.filter((user) => matchesOperationalScope(effectiveScopeId, user)), [effectiveScopeId, sessionUsers]);
  const tenantProcesses = useMemo(() => processes.filter((process) => matchesOperationalScope(effectiveScopeId, process)), [effectiveScopeId, processes]);
  const internalTenantUsers = useMemo(
    () =>
      tenantUsers.filter(
        (user) => !["profissional_externo", "proprietario_consulta"].includes(user.role),
      ),
    [tenantUsers],
  );
  const currentUnit = activeInstitution?.secretariaResponsavel || session.department || session.title || "Administração da Prefeitura";
  const tenantSettings = getInstitutionSettings(effectiveScopeId ?? session.tenantId);
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
  const [editStatusMessage, setEditStatusMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("visao-geral");
  const [segment, setSegment] = useState<UserSegment>("todos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | AccountStatus>("todos");
  const [roleFilter, setRoleFilter] = useState<"todos" | UserRole>("todos");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", role: "analista" as UserRole, title: roleSuggestedTitles.analista, accessLevel: "1", temporaryPassword: "", confirmPassword: "" });
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
    void listRemoteMunicipalDepartments(effectiveScopeId)
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

  const metrics = useMemo(() => ({ protocolsInProgress: tenantProcesses.filter((process) => !["deferido", "indeferido", "arquivado"].includes(process.status)).length, inAnalysis: tenantProcesses.filter((process) => ["analise_tecnica", "reapresentacao", "exigencia"].includes(process.status)).length, pendingPayments: tenantProcesses.filter((process) => hasPendingGuide(process)).length, approved: tenantProcesses.filter((process) => process.status === "deferido").length }), [tenantProcesses, tenantSettings]);
  const criticalAlerts = useMemo(() => tenantProcesses.filter((process) => process.sla.breached || process.sla.hoursRemaining <= 12), [tenantProcesses]);
  const pendingSectorItems = useMemo(() => [{ label: "Triagem", value: tenantProcesses.filter((process) => process.triage.status !== "concluido").length, helper: "Entradas aguardando conferência documental" }, { label: "Análise", value: tenantProcesses.filter((process) => process.status === "analise_tecnica").length, helper: "Processos em parecer técnico" }, { label: "Financeiro", value: tenantProcesses.filter((process) => hasPendingGuide(process)).length, helper: "Processos com guia emitida ainda sem compensação" }], [tenantProcesses, tenantSettings]);
  const actionRequired = useMemo(() => tenantProcesses.filter((process) => process.requirements.some((item) => item.status === "aberta" || item.status === "respondida") || process.sla.breached || hasPendingGuide(process)).slice(0, 6), [tenantProcesses, tenantSettings]);
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
  const startEdit = (user: SessionUser) => { setEditStatusMessage(""); setEditingUserId(user.id); setEditForm({ name: user.name, email: user.email, role: user.role, profileLabel: user.profileLabel || "", title: user.title, accessLevel: String(user.accessLevel), department: user.department || "", userType: user.userType || (user.role === "profissional_externo" || user.role === "proprietario_consulta" ? "Externo" : "Interno") }); };
  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveScopeId) return;

    const normalizedName = form.fullName.trim();
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedTitle = form.title.trim();

    if (!normalizedName || !normalizedEmail || !normalizedTitle) {
      setStatusMessage("Preencha nome, e-mail e cargo/setor para cadastrar o usuário.");
      return;
    }

    const temporaryPassword = form.temporaryPassword.trim();
    if (temporaryPassword || form.confirmPassword) {
      if (temporaryPassword.length < 8) {
        setStatusMessage("A senha provisória deve ter pelo menos 8 caracteres.");
        return;
      }
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(temporaryPassword)) {
        setStatusMessage("A senha provisória precisa ter maiúscula, minúscula, número e caractere especial.");
        return;
      }
      if (temporaryPassword !== form.confirmPassword) {
        setStatusMessage("A confirmação da senha provisória não confere.");
        return;
      }
    }

    if (
      planEntitlements.maxUsers != null &&
      internalTenantUsers.length >= planEntitlements.maxUsers
    ) {
      setStatusMessage(
        `Limite do plano atingido: ${internalTenantUsers.length}/${planEntitlements.maxUsers} usuários internos. Faça upgrade do plano antes de vincular outra conta.`,
      );
      return;
    }

    if (savingUserId) return;
    setSavingUserId("new");
    setStatusMessage("Confirmando vínculo no banco...");
    try {
      const user = await createTenantUser({
        tenantId: effectiveScopeId,
        fullName: normalizedName,
        email: normalizedEmail,
        role: form.role,
        title: normalizedTitle,
        accessLevel: Number(form.accessLevel) as 1 | 2 | 3,
        temporaryPassword: temporaryPassword || undefined,
      });
      setStatusMessage(`Conta ${user.name} cadastrada na Prefeitura ${municipalityName || activeInstitution?.name || "selecionada"} com ${accessLevelLabels[user.accessLevel]}.`);
      setForm({ fullName: "", email: "", role: "analista", title: roleSuggestedTitles.analista, accessLevel: "1", temporaryPassword: "", confirmPassword: "" });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível vincular a conta.");
    } finally {
      setSavingUserId(null);
    }
  };
  const runUserCommand = async (userId: string, command: () => Promise<SessionUser | null>, success: (user: SessionUser) => string) => {
    if (savingUserId) return false;
    setSavingUserId(userId);
    setStatusMessage("Salvando acesso no banco...");
    try {
      const updated = await command();
      if (!updated) throw new Error("Usuário não encontrado no banco.");
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
    if (editForm.role !== "profissional_externo" && !editForm.department.trim()) {
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
        profileLabel: resolvedRole === "profissional_externo" ? editForm.profileLabel : "",
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
      setEditStatusMessage("Alterações salvas no banco e confirmadas com sucesso.");
    } catch (error) {
      setEditStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleCreateDepartment = async (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveScopeId || !orgForm.name.trim() || orgBusy) return;
    if (
      !editingDepartmentId &&
      planEntitlements.maxDepartments != null &&
      activeDepartments.length >= planEntitlements.maxDepartments
    ) {
      setStatusMessage(
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
        sortOrder: activeDepartments.length * 10 + 10,
      });
      const rows = await listRemoteMunicipalDepartments(effectiveScopeId);
      setDepartments(rows);
      setOrgForm({ code: "", name: "", unitType: "departamento", parentDepartmentId: "", description: "", email: "", phone: "" });
      setEditingDepartmentId(null);
      setStatusMessage(editingDepartmentId ? "Unidade atualizada no organograma da Prefeitura." : "Unidade adicionada ao organograma da Prefeitura.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível salvar a unidade.");
    } finally {
      setOrgBusy(false);
    }
  };
  const handleEditDepartment = (department: MunicipalDepartmentRecord) => {
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
      const rows = await listRemoteMunicipalDepartments(effectiveScopeId);
      setDepartments(rows);
      handleCancelDepartmentEdit();
      setStatusMessage("Unidade desativada do organograma.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível desativar a unidade.");
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

  const renderQueueCard = (process: ProcessRecord) => {
    const pendingRequirements = process.requirements.filter(
      (item) => item.status === "aberta" || item.status === "respondida",
    );
    const financialGuides = getProcessPaymentGuides(process, tenantSettings);
    const pendingGuides = financialGuides.filter((guide) => guide.status === "pendente");
    const protocolGuide = financialGuides.find((guide) => guide.kind === "protocolo");
    const slaLabel = process.sla.breached
      ? "Vencido"
      : process.sla.hoursRemaining <= 12
        ? "Crítico"
        : "No prazo";

    return (
      <article
        key={process.id}
        className="group relative min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)] transition hover:border-slate-300 hover:shadow-[0_12px_30px_rgba(15,23,42,0.075)]"
      >
        <div
          className={`absolute inset-y-0 left-0 w-1 ${
            process.sla.breached
              ? "bg-rose-500"
              : process.sla.hoursRemaining <= 12
                ? "bg-amber-400"
                : "bg-sky-500"
          }`}
          aria-hidden="true"
        />

        <div className="grid min-w-0 gap-4 px-4 py-4 pl-5 lg:grid-cols-[minmax(260px,1.55fr)_minmax(150px,0.72fr)_minmax(140px,0.68fr)_minmax(115px,0.52fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p
                className="max-w-full truncate text-sm font-black tracking-[-0.01em] text-slate-950"
                title={process.protocol}
              >
                {process.protocol}
              </p>
              <Badge variant="outline" className={statusTone(process.status)}>
                {statusLabel(process.status)}
              </Badge>
              <Badge className={`shrink-0 rounded-full border text-[10px] ${getPriorityTone(process)}`}>
                SLA {slaLabel}
              </Badge>
            </div>
            <p
              className="mt-1.5 truncate text-sm font-semibold text-slate-800"
              title={process.title}
            >
              {process.title}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="truncate" title={process.ownerName}>
                {process.ownerName || "Responsável não informado"}
              </span>
              <span className="truncate" title={process.property.iptu}>
                IPTU {process.property.iptu || "não informado"}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
              Etapa atual
            </p>
            <p
              className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-700"
              title={process.sla.currentStage}
            >
              {process.sla.currentStage || "Não informada"}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
              Responsável
            </p>
            <p
              className="mt-1 truncate text-xs font-semibold text-slate-700"
              title={process.technicalLead}
            >
              {process.technicalLead || "Não atribuído"}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-400" title={process.sla.dueDate}>
              Prazo: {process.sla.dueDate || "não informado"}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
              Pendências
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                {pendingRequirements.length} exig.
              </span>
              <span className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                {pendingGuides.length} guia(s)
              </span>
            </div>
            <p
              className="mt-1 truncate text-[10px] text-slate-400"
              title={protocolGuide?.code || ""}
            >
              {protocolGuide?.code ? `Inicial ${protocolGuide.code}` : "Sem guia inicial"}
            </p>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
              onClick={() => navigate(`/processos/${process.id}`)}
            >
              Abrir processo
            </Button>
          </div>
        </div>
      </article>
    );
  };

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
                  name={user.name}
                  imageUrl={profile?.avatarUrl}
                  size="lg"
                  crop={profile ? {
                    scale: profile.avatarScale ?? 1,
                    offsetX: profile.avatarOffsetX ?? 0,
                    offsetY: profile.avatarOffsetY ?? 0,
                    editorSize: 320,
                  } : undefined}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
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
                  <span className="text-sm font-semibold text-slate-700">
                    {user.title || "Cargo não informado"}
                  </span>
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

          <div className="grid gap-4 xl:grid-cols-[minmax(250px,0.9fr)_minmax(0,1.5fr)]">
            <div
              data-municipal-user-lotation="true"
              className={`rounded-[20px] border p-4 ${roleVisual.badge}`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.13em]">
                  Lotação institucional
                </p>
              </div>
              <p className="mt-3 text-base font-black leading-6">{departmentLabel}</p>
              <p className="mt-1 text-xs leading-5 opacity-80">
                {user.title || getMunicipalProfileLabel(user)}
              </p>
            </div>

            <div
              data-municipal-user-security="true"
              className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  Acesso e segurança
                </p>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Criado em</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{user.createdAt || "Não informado"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Último acesso</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{user.lastAccessAt || "Não registrado"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Situação administrativa</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
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
    { label: "Fila operacional", value: `${mainQueue.length}`, description: "Itens priorizados para coordenação", icon: Clock3, tone: "amber" as const },
    { label: "Usuários", value: `${tenantUsers.length}`, description: "Equipe vinculada à Prefeitura", icon: Users2, tone: "emerald" as const },
    { label: "Pendências financeiras", value: `${metrics.pendingPayments}`, description: "Processos com guia emitida pendente", icon: Wallet, tone: "rose" as const },
  ];

  return (
    <PortalFrame eyebrow="Administração da Prefeitura" title={municipalityName || activeInstitution?.name || "Administração da Prefeitura"}>
      <PageShell>
        <section className="sig-dark-panel overflow-hidden rounded-[30px] border border-slate-200/90 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.06),transparent_22%),linear-gradient(135deg,#fcfdff_0%,#f7fafc_56%,#eef4f8_100%)] shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div>
            <div className="p-5 md:p-6 lg:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Administração da Prefeitura</p>
                  <h1 className="mt-2 max-w-[36ch] text-2xl font-semibold leading-tight text-slate-950">
                    {municipalityName || activeInstitution?.name || "Administração da Prefeitura"}
                  </h1>
                  <p className="mt-2 max-w-[64ch] text-sm leading-6 text-slate-500">
                    Centro institucional da operação municipal, com governança de usuários, processos e prioridades da Prefeitura.
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
            { value: "organograma", label: "Organograma", helper: "Estrutura e lotação" },
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

        {workspaceView === "fila" ? <TableCard title="Fila operacional" description="Área dedicada à operação da Prefeitura, com prioridade, responsável, prazo e etapa atual." icon={ClipboardList}><div className="space-y-4"><div className="grid gap-3 xl:grid-cols-[1.2fr_0.7fr_0.7fr]"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Prefeitura operando com {mainQueue.length} item(ns) priorizados na fila principal.</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">SLA crítico: {criticalAlerts.length} item(ns).</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Pendências financeiras: {metrics.pendingPayments}.</div></div>{mainQueue.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhum protocolo operacional encontrado para esta Prefeitura.</div> : mainQueue.map((process) => renderQueueCard(process))}</div></TableCard> : null}

        {workspaceView === "usuarios" ? <PageMainGrid className="xl:grid-cols-[minmax(0,2.08fr)_minmax(300px,0.82fr)] 2xl:grid-cols-[minmax(0,2.22fr)_minmax(360px,0.86fr)] xl:items-start"><PageMainContent className="gap-5"><PageStatsRow className="lg:grid-cols-3 xl:grid-cols-3 xl:gap-4.5 2xl:gap-5 [&>*]:min-w-0 [&>*]:min-h-[152px]"><StatCard label="Equipe" value={String(tenantUsers.length)} description="Usuários vinculados à Prefeitura" icon={Users2} tone="blue" /><StatCard label="Administradores" value={String(tenantUsers.filter((user) => user.role === "prefeitura_admin").length)} description="Perfis de gestão ativos" icon={ShieldCheck} tone="emerald" /><StatCard label="Bloqueados" value={String(tenantUsers.filter((user) => user.accountStatus === "blocked").length)} description="Contas com restrição" icon={ShieldAlert} tone="rose" /></PageStatsRow><TableCard title="Gestão de usuários" description="Equipe interna, papéis, níveis de acesso e administração da Prefeitura." icon={Users2} className="shadow-[0_14px_32px_rgba(15,23,42,0.06)]"><div className="space-y-4.5"><Tabs value={segment} onValueChange={(value) => setSegment(value as UserSegment)}><TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl bg-slate-100 p-1.5"><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="administradores">Administradores</TabsTrigger><TabsTrigger value="analistas">Analistas</TabsTrigger><TabsTrigger value="financeiro">Financeiro</TabsTrigger><TabsTrigger value="fiscal">Fiscal</TabsTrigger><TabsTrigger value="externos">Externos</TabsTrigger><TabsTrigger value="outros">Outros</TabsTrigger></TabsList></Tabs><div className="grid gap-3 xl:grid-cols-[minmax(0,1.58fr)_minmax(220px,0.74fr)_minmax(220px,0.74fr)] 2xl:grid-cols-[minmax(0,1.72fr)_minmax(236px,0.78fr)_minmax(236px,0.78fr)] xl:items-center"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, setor ou categoria" className="h-11 rounded-2xl pl-10.5" /></div><Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "todos" | AccountStatus)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="blocked">Bloqueado</SelectItem><SelectItem value="inactive">Inativo</SelectItem></SelectContent></Select><Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "todos" | UserRole)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Perfil" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os perfis</SelectItem>{tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 2xl:gap-4.5">{filteredUsers.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhum usuário encontrado para os filtros atuais.</div> : filteredUsers.map((user) => renderUserCard(user))}</div></div></TableCard></PageMainContent><PageSideContent className="gap-5"><SectionCard title="Cadastrar usuário" description="O administrador desta Prefeitura pode criar ou vincular contas somente neste subdomínio. Contas Master ficam protegidas." className="xl:sticky xl:top-5 shadow-[0_14px_32px_rgba(15,23,42,0.06)]" contentClassName="space-y-4" actions={<Button type="button" variant="outline" className="sig-dark-action-btn rounded-full text-slate-50" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4 text-sky-200" />Voltar</Button>}><form className="space-y-4" onSubmit={handleCreateUser}><div className="space-y-2"><Label>Prefeitura vinculada</Label><div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">{municipalityName || activeInstitution?.name || "Prefeitura atual"}</div></div><div className="space-y-2"><Label>Nome completo</Label><Input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></div><div className="space-y-2"><Label>E-mail</Label><Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div><div className="space-y-2"><Label>Perfil</Label><Select value={getMunicipalProfileSelectValue(form.role, form.title)} onValueChange={(value) => setForm((current) => applyMunicipalProfileSelection(value, current))}><SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Selecione o perfil" /></SelectTrigger><SelectContent>{tenantRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}{municipalProfilePresets.map((profile) => <SelectItem key={profile.key} value={profile.key}>{profile.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Cargo / função / profissão</Label><Input list="tenant-position-options" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Chefe de Divisão de Urbanismo" /><datalist id="tenant-position-options">{availablePositionOptions.map((option) => <option key={option} value={option} />)}</datalist><p className="text-xs leading-5 text-slate-500">Digite livremente qualquer cargo da Prefeitura ou escolha uma sugestão já cadastrada.</p></div><div className="space-y-2"><Label>Nível de acesso</Label><Select value={form.accessLevel} onValueChange={(value) => setForm((current) => ({ ...current, accessLevel: value }))}><SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Nível 1 - Operacional</SelectItem><SelectItem value="2">Nível 2 - Coordenação</SelectItem><SelectItem value="3">Nível 3 - Gestão total</SelectItem></SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Senha provisória</Label><Input type="password" autoComplete="new-password" value={form.temporaryPassword} onChange={(event) => setForm((current) => ({ ...current, temporaryPassword: event.target.value }))} placeholder="Obrigatória se a conta for nova" /></div><div className="space-y-2"><Label>Confirmar senha</Label><Input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Repita a senha provisória" /></div></div><p className="text-xs leading-5 text-slate-500">Se o e-mail já possuir conta no SIGAPRO, a senha pode ficar em branco. Para uma conta nova, informe uma senha provisória forte; o usuário poderá alterá-la depois.</p><Button type="submit" disabled={Boolean(savingUserId)} className="sig-force-dark-action h-12 w-full rounded-2xl bg-slate-950 !text-white hover:bg-slate-900">{savingUserId === "new" ? "Cadastrando usuário..." : "Cadastrar / vincular conta"}</Button></form></SectionCard></PageSideContent></PageMainGrid> : null}


        {workspaceView === "organograma" ? (
          <PageMainGrid className="xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.82fr)] xl:items-start">
            <PageMainContent>
              <TableCard
                title="Organograma municipal"
                description="Estrutura institucional da Prefeitura exibida por siglas, sem nomes de usuários, no padrão de navegação administrativa."
                icon={Network}
              >
                <MunicipalOrganizationChart
                  departments={activeDepartments}
                  emptyMessage="Nenhuma unidade cadastrada. Crie a primeira estrutura ao lado para disponibilizar o organograma institucional."
                  onEdit={handleEditDepartment}
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
                <form className="space-y-4" onSubmit={handleCreateDepartment}>
                  <div className="space-y-2">
                    <Label>Sigla</Label>
                    <Input value={orgForm.code} onChange={(event) => setOrgForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Ex.: PROT, FIN, ANU" maxLength={8} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome da unidade</Label>
                    <Input value={orgForm.name} onChange={(event) => setOrgForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Protocolo, Financeiro, Obras" />
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
                  <Button type="submit" disabled={orgBusy || !orgForm.name.trim()} className="sig-force-dark-action h-12 w-full rounded-2xl bg-slate-950 !text-white hover:bg-slate-900">
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

        {workspaceView === "historico" ? <PageMainGrid className="xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,0.8fr)]"><PageMainContent><TableCard title="Movimentações recentes" description="Trilha curta de trâmites, pareceres e ações da operação municipal." icon={Clock3}><div className="space-y-3">{recentActivity.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhuma movimentação recente encontrada.</div> : recentActivity.map((item, index) => <div key={`${item.processId}-${index}`} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-950">{item.protocol}</p><Badge variant="outline" className={statusTone(item.status)}>{statusLabel(item.status)}</Badge></div><p className="mt-1 text-sm font-medium text-slate-800">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.detail}</p></div><div className="text-sm text-slate-500"><p>{item.actor}</p><p>{item.at}</p></div></div></div>)}</div></TableCard></PageMainContent><PageSideContent><SectionCard title="Aprovações recentes" description="Deferimentos já concluídos e liberados pela operação municipal." icon={CheckCircle2} contentClassName="space-y-3">{recentApprovals.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">Nenhum deferimento recente encontrado.</div> : recentApprovals.map((process) => <div key={process.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-950">{process.protocol}</p><p className="mt-1 text-sm text-slate-800">{process.title}</p><p className="mt-1 text-sm text-slate-500">{process.ownerName}</p></div>)}</SectionCard></PageSideContent></PageMainGrid> : null}
      </PageShell>
    </PortalFrame>
  );
}
