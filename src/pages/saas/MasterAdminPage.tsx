import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Copy, CreditCard, Landmark, PencilLine, Plus, Search, Settings2, ShieldAlert, ShieldPlus, Trash2, Undo2, UserX, Users2, Workflow, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertCard } from "@/components/platform/AlertCard";
import { MetricCard } from "@/components/platform/MetricCard";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { PageHero } from "@/components/platform/PageHero";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformData } from "@/hooks/usePlatformData";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { loadMunicipalityCatalog } from "@/integrations/supabase/municipality";
import { saveRemoteInstitutionSettings, upsertRemoteInstitution } from "@/integrations/supabase/platform";
import { buildTenantFromMunicipalityBundle } from "@/lib/municipality";
import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import { accessLevelLabels, roleLabels, roleSuggestedTitles, type AccountStatus, type Institution, type SessionUser, type UserRole } from "@/lib/platform";

type SignatureMode = "eletronica" | "manual" | "icp_brasil";
type UserGroup = "todos" | "internos" | "externos" | "administradores";
type WorkspaceView = "visao-geral" | "carteira" | "cadastro" | "usuarios";
type AdminContactDraft = { id: string; email: string; fullName: string; title: string; accessLevel: 2 | 3 };
type PendingTenantSync = {
  institution: {
    id: string;
    name: string;
    city: string;
    state: string;
    status: Institution["status"];
    subdomain: string;
    cnpj: string;
    primaryColor: string;
    accentColor: string;
    secretariat: string;
  };
  settings: Record<string, unknown>;
  updatedAt: string;
};

const emptyTenantForm = { name: "", city: "", state: "SP", status: "implantacao" as Institution["status"], plan: "Plano institucional", subdomain: "", primaryColor: "#0f3557", accentColor: "#178f78", contractNumber: "", contractStart: "", contractEnd: "", monthlyFee: 0, setupFee: 0, signatureMode: "eletronica" as SignatureMode, clientDeliveryLink: "", secretariat: "", directorate: "", directorPhone: "", directorEmail: "", cnpj: "", phone: "", email: "", site: "", address: "" };
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
      reject(new Error("Tempo limite ao salvar. Verifique a conexão com o Supabase."));
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
const withRetry = async <T,>(handler: () => Promise<T>, attempts = 3, baseDelay = 800) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await handler();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * (attempt + 1)));
      }
    }
  }
  throw lastError;
};
const pendingSyncStorageKey = "sigapro:pending-tenant-sync";
const ensureSupabaseAvailable = async () => {
  if (!supabase) throw new Error("Supabase indisponível.");
  const { error } = await withTimeout(
    supabase.from("municipalities").select("id").limit(1),
    8000,
  );
  if (error) {
    throw new Error(error.message || "Falha ao conectar no Supabase.");
  }
};

export function MasterAdminPage() {
  const navigate = useNavigate();
  const { institutions, sessionUsers, metrics, upsertInstitution, saveInstitutionSettings, removeInstitution, setInstitutionStatus, createTenantUser, updateTenantUser, setUserAccountStatus, deleteUserAccount, getInstitutionSettings, getUserProfile } = usePlatformData();
  const [remoteInstitutions, setRemoteInstitutions] = useState<Institution[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(institutions[0]?.id ?? "");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("visao-geral");
  const [form, setForm] = useState(emptyTenantForm);
  const [admins, setAdmins] = useState<AdminContactDraft[]>([createAdminDraft()]);
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"todos" | AccountStatus>("todos");
  const [userRoleFilter, setUserRoleFilter] = useState<"todos" | UserRole>("todos");
  const [userGroup, setUserGroup] = useState<UserGroup>("todos");
  const formRef = useRef<HTMLDivElement | null>(null);
  const [pendingSync, setPendingSync] = useState<PendingTenantSync | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(pendingSyncStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PendingTenantSync;
      if (parsed?.institution?.id) {
        setPendingSync(parsed);
      }
    } catch {
      window.localStorage.removeItem(pendingSyncStorageKey);
    }
  }, []);

  useEffect(() => { let active = true; if (!hasSupabaseEnv) { setRemoteInstitutions([]); return; } void loadMunicipalityCatalog().then((catalog) => { if (!active) return; const mapped = catalog.map((bundle) => { const fallback = institutions.find((item) => item.id === bundle.municipality?.id) ?? null; return buildTenantFromMunicipalityBundle(bundle.municipality, bundle.branding, bundle.settings, fallback); }).filter((item): item is Institution => Boolean(item)); setRemoteInstitutions(mapped); }).catch(() => active && setRemoteInstitutions([])); return () => { active = false; }; }, [institutions]);

  const institutionCatalog = useMemo(() => {
    const merged = new Map<string, Institution>();

    institutions.forEach((institution) => {
      merged.set(institution.id, institution);
    });

    remoteInstitutions.forEach((institution) => {
      merged.set(institution.id, institution);
    });

    return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [institutions, remoteInstitutions]);
  const activeTenant = institutionCatalog.find((item) => item.id === selectedTenantId) ?? null;
  const knownAdministrativeUsers = useMemo(() => sessionUsers.filter((user) => ["prefeitura_admin", "master_admin", "master_ops", "prefeitura_supervisor"].includes(user.role)), [sessionUsers]);
  const availableAdminEmails = useMemo(() => { const map = new Map<string, SessionUser>(); knownAdministrativeUsers.forEach((user) => map.set(user.email.trim().toLowerCase(), user)); return [...map.values()]; }, [knownAdministrativeUsers]);
  const activeUsersCount = useMemo(() => sessionUsers.filter((user) => user.accountStatus === "active").length, [sessionUsers]);
  const blockedUsersCount = useMemo(() => sessionUsers.filter((user) => user.accountStatus === "blocked").length, [sessionUsers]);
  const adminUsersCount = useMemo(() => sessionUsers.filter((user) => ["master_admin", "master_ops", "prefeitura_admin"].includes(user.role)).length, [sessionUsers]);
  const monthlyRevenue = useMemo(() => institutionCatalog.reduce((sum, tenant) => sum + Number(getInstitutionSettings(tenant.id)?.monthlyFee ?? 0), 0), [getInstitutionSettings, institutionCatalog]);
  const activePlansCount = useMemo(() => institutionCatalog.filter((tenant) => tenant.status === "ativo" && Number(getInstitutionSettings(tenant.id)?.monthlyFee ?? 0) > 0).length, [getInstitutionSettings, institutionCatalog]);
  const activeInstitutionCount = useMemo(() => institutionCatalog.filter((tenant) => tenant.status === "ativo").length, [institutionCatalog]);
  const overviewInstitutions = useMemo(() => institutionCatalog.filter((tenant) => tenant.status === "ativo").slice(0, 3), [institutionCatalog]);
  const recentActivity = useMemo(() => [...sessionUsers].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5), [sessionUsers]);
  useEffect(() => {
    if (institutionCatalog.length === 0) {
      if (selectedTenantId) setSelectedTenantId("");
      return;
    }

    const stillExists = institutionCatalog.some((item) => item.id === selectedTenantId);
    if (stillExists) return;

    const nextPreferred =
      institutionCatalog.find((item) => item.status === "ativo")?.id ??
      institutionCatalog.find((item) => item.status === "implantacao")?.id ??
      institutionCatalog[0]?.id ??
      "";

    if (nextPreferred !== selectedTenantId) {
      setSelectedTenantId(nextPreferred);
    }
  }, [institutionCatalog, selectedTenantId]);

  useEffect(() => {
    if (!activeTenant) { setForm(emptyTenantForm); setAdmins([createAdminDraft()]); return; }
    const settings = getInstitutionSettings(activeTenant.id);
    const prefeituraAdmins = knownAdministrativeUsers.filter((user) => (user.tenantId === activeTenant.id || user.municipalityId === activeTenant.id) && user.role === "prefeitura_admin");
    setForm({ name: activeTenant.name, city: activeTenant.city, state: activeTenant.state, status: activeTenant.status, plan: activeTenant.plan, subdomain: activeTenant.subdomain, primaryColor: activeTenant.theme.primary, accentColor: activeTenant.theme.accent, contractNumber: settings?.contractNumber ?? "", contractStart: settings?.contractStart ?? "", contractEnd: settings?.contractEnd ?? "", monthlyFee: settings?.monthlyFee ?? 0, setupFee: settings?.setupFee ?? 0, signatureMode: settings?.signatureMode ?? "eletronica", clientDeliveryLink: settings?.clientDeliveryLink ?? settings?.linkPortalCliente ?? buildTenantLink(activeTenant.subdomain, settings?.site), secretariat: settings?.secretariaResponsavel ?? "", directorate: settings?.diretoriaResponsavel ?? "", directorPhone: settings?.diretoriaTelefone ?? "", directorEmail: settings?.diretoriaEmail ?? "", cnpj: settings?.cnpj ?? "", phone: settings?.telefone ?? "", email: settings?.email ?? "", site: settings?.site ?? "", address: settings?.endereco ?? "" });
    setAdmins(prefeituraAdmins.length > 0 ? prefeituraAdmins.map((user) => ({ id: `admin-${user.id}`, email: user.email, fullName: user.name, title: user.title, accessLevel: user.accessLevel >= 3 ? 3 : 2 })) : [createAdminDraft()]);
  }, [activeTenant, getInstitutionSettings, knownAdministrativeUsers]);

  const platformAlerts = useMemo(() => {
    const suspendedCount = institutionCatalog.filter((tenant) => tenant.status === "suspenso").length;
    const withoutAdmin = institutionCatalog.filter((tenant) => !knownAdministrativeUsers.some((user) => (user.tenantId === tenant.id || user.municipalityId === tenant.id) && user.role === "prefeitura_admin")).length;
    return [
      { id: "suspended", title: "Contas suspensas", description: suspendedCount > 0 ? `${suspendedCount} prefeitura${suspendedCount > 1 ? "s" : ""} com status suspenso.` : "Nenhuma Prefeitura suspensa no momento.", tone: suspendedCount > 0 ? ("danger" as const) : ("success" as const) },
      { id: "without-admin", title: "Gestão sem administrador", description: withoutAdmin > 0 ? `${withoutAdmin} prefeitura${withoutAdmin > 1 ? "s" : ""} sem administrador principal vinculado.` : "Todas as prefeituras possuem gestor principal.", tone: withoutAdmin > 0 ? ("warning" as const) : ("success" as const) },
      { id: "environment", title: "Ambiente da plataforma", description: hasSupabaseEnv ? "Supabase conectado e sincronização remota ativa." : "Modo local ativo para homologação e simulação.", tone: hasSupabaseEnv ? ("success" as const) : ("default" as const) },
    ];
  }, [institutionCatalog, knownAdministrativeUsers]);

  const filteredSystemUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return sessionUsers.filter((user) => {
      if (userStatusFilter !== "todos" && user.accountStatus !== userStatusFilter) return false;
      if (userRoleFilter !== "todos" && user.role !== userRoleFilter) return false;
      if (userGroup === "internos" && (user.role === "profissional_externo" || user.role === "proprietario_consulta")) return false;
      if (userGroup === "externos" && user.role !== "profissional_externo" && user.role !== "proprietario_consulta") return false;
      if (userGroup === "administradores" && !["master_admin", "master_ops", "prefeitura_admin"].includes(user.role)) return false;
      if (!term) return true;
      return [user.name, user.email, user.title, user.department, user.userType].filter(Boolean).some((value) => value?.toLowerCase().includes(term));
    });
  }, [sessionUsers, userGroup, userRoleFilter, userSearch, userStatusFilter]);

  const handleSetForm = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [field]: value }));
  const handleSelectTenant = (tenantId: string) => { setSelectedTenantId(tenantId); setWorkspaceView("cadastro"); setStatusMessage(""); window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const addAdminRow = () => setAdmins((current) => [...current, createAdminDraft()]);
  const updateAdminRow = <K extends keyof AdminContactDraft>(id: string, field: K, value: AdminContactDraft[K]) => setAdmins((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  const removeAdminRow = (id: string) => setAdmins((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  const applyKnownAdminEmail = (draftId: string, email: string) => { const known = availableAdminEmails.find((user) => user.email.trim().toLowerCase() === email.trim().toLowerCase()); if (!known) return; updateAdminRow(draftId, "email", known.email); updateAdminRow(draftId, "fullName", known.name); updateAdminRow(draftId, "title", known.title || roleSuggestedTitles.prefeitura_admin); updateAdminRow(draftId, "accessLevel", known.accessLevel >= 3 ? 3 : 2); };
  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const handleCopyLink = async (subdomain: string, customDomain?: string) => {
    const link = buildTenantLink(subdomain, customDomain);
    if (!link) {
      setStatusMessage("Defina um subdomínio para copiar o portal do cliente.");
      return;
    }
    console.log("[CopyPortalLink] Copiando link do portal", { subdomain, customDomain, link });
    try {
      await navigator.clipboard.writeText(link);
      setStatusMessage("Link do cliente copiado com sucesso.");
    } catch {
      setStatusMessage(`Link do cliente: ${link}`);
    }
  };
  const handleMasterStatusToggle = (user: SessionUser) => { if (user.id === "u-master" && user.role === "master_admin") { setStatusMessage("A conta raiz do master não pode ser bloqueada."); return; } if (user.accountStatus === "blocked") { if (!window.confirm(`Deseja desbloquear ${user.name}?`)) return; const updated = setUserAccountStatus({ userId: user.id, status: "active", actor: "master" }); if (updated) setStatusMessage(`Conta de ${updated.name} reativada.`); return; } const reason = window.prompt(`Informe o motivo do bloqueio de ${user.name}:`, user.blockReason || "Bloqueio administrativo"); if (reason === null) return; const updated = setUserAccountStatus({ userId: user.id, status: "blocked", actor: "master", reason }); if (updated) setStatusMessage(`Conta de ${updated.name} bloqueada.`); };
  const handleMasterDelete = (user: SessionUser) => { if (user.id === "u-master" && user.role === "master_admin") { setStatusMessage("A conta raiz do master não pode ser desativada."); return; } if (!window.confirm(`Deseja desativar a conta de ${user.name}?`)) return; const reason = window.prompt("Informe a justificativa da desativação:", user.blockReason || "Conta desativada administrativamente"); if (reason === null) return; const updated = deleteUserAccount({ userId: user.id, actor: "master", reason }); if (updated) setStatusMessage(`Conta de ${updated.name} marcada como inativa.`); };
  const handleMasterEdit = (user: SessionUser) => { const nextName = window.prompt("Nome do usuário:", user.name); if (nextName === null) return; const nextTitle = window.prompt("Cargo / título:", user.title || roleSuggestedTitles[user.role]); if (nextTitle === null) return; const nextRole = window.prompt(`Perfil (${Object.keys(roleLabels).join(", ")}):`, user.role) as UserRole | null; if (nextRole === null) return; if (!(nextRole in roleLabels)) { setStatusMessage("Perfil informado é inválido."); return; } const nextAccessRaw = window.prompt("Nível de acesso (1, 2 ou 3):", String(user.accessLevel)); if (nextAccessRaw === null) return; const nextAccess = Number(nextAccessRaw); if (![1, 2, 3].includes(nextAccess)) { setStatusMessage("Nível de acesso inválido."); return; } const updated = updateTenantUser(user.id, { name: nextName.trim(), title: nextTitle.trim(), role: nextRole, accessLevel: nextAccess as 1 | 2 | 3 }); if (updated) setStatusMessage(`Dados de ${updated.name} atualizados.`); };
  const handleRetryRemoteSync = async () => {
    if (!pendingSync || !hasSupabaseEnv) return;
    setStatusMessage("Tentando sincronizar com o Supabase...");
    try {
      await ensureSupabaseAvailable();
      const remoteInstitution = await withRetry(() =>
        withTimeout(
          upsertRemoteInstitution({
            institutionId: pendingSync.institution.id,
            name: pendingSync.institution.name,
            city: pendingSync.institution.city,
            state: pendingSync.institution.state,
            status: pendingSync.institution.status,
            subdomain: pendingSync.institution.subdomain,
            cnpj: pendingSync.institution.cnpj,
            primaryColor: pendingSync.institution.primaryColor,
            accentColor: pendingSync.institution.accentColor,
            secretariat: pendingSync.institution.secretariat,
          }),
        ),
      );
      await withRetry(() => withTimeout(saveRemoteInstitutionSettings({ ...pendingSync.settings, tenantId: remoteInstitution.id })));
      window.localStorage.removeItem(pendingSyncStorageKey);
      setPendingSync(null);
      setStatusMessage("Sincronização concluída com o Supabase.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar com o Supabase.";
      setStatusMessage(`Sincronização pendente: ${message}`);
    }
  };
  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatusMessage("");
    const normalizedSubdomain = normalizeSubdomainInput(form.subdomain || form.city || form.name);
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
    try {
      const currentSettings = activeTenant ? getInstitutionSettings(activeTenant.id) : undefined;
      const slug = normalizedSubdomain;
      let savedTenant = upsertInstitution({ institutionId: selectedTenantId || undefined, name: form.name, city: form.city, state: form.state, status: form.status, plan: form.plan, subdomain: slug, primaryColor: form.primaryColor, accentColor: form.accentColor });
      let remoteSyncError: string | null = null;

      if (hasSupabaseEnv) {
        try {
          await ensureSupabaseAvailable();
        } catch (error) {
          remoteSyncError = error instanceof Error ? error.message : "Supabase indisponível no momento.";
        }
      }

      if (hasSupabaseEnv && !remoteSyncError) {
        try {
          const remoteInstitution = await withRetry(() =>
            withTimeout(
              upsertRemoteInstitution({
                institutionId: savedTenant.id,
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
          savedTenant = upsertInstitution({ institutionId: remoteInstitution.id, name: form.name, city: form.city, state: form.state, status: form.status, plan: form.plan, subdomain: slug, primaryColor: form.primaryColor, accentColor: form.accentColor });
        } catch (error) {
          remoteSyncError = error instanceof Error ? error.message : "Falha ao sincronizar com o Supabase.";
        }
      }

      const nextSettings = { tenantId: savedTenant.id, cnpj: form.cnpj || currentSettings?.cnpj || "", endereco: form.address || currentSettings?.endereco || "", telefone: form.phone || currentSettings?.telefone || "", email: form.email || currentSettings?.email || "", site: form.site || currentSettings?.site || "", secretariaResponsavel: form.secretariat || currentSettings?.secretariaResponsavel || "", diretoriaResponsavel: form.directorate || currentSettings?.diretoriaResponsavel || "", diretoriaTelefone: form.directorPhone || currentSettings?.diretoriaTelefone || "", diretoriaEmail: form.directorEmail || currentSettings?.diretoriaEmail || "", horarioAtendimento: currentSettings?.horarioAtendimento || "", brasaoUrl: currentSettings?.brasaoUrl || "", bandeiraUrl: currentSettings?.bandeiraUrl || "", logoUrl: currentSettings?.logoUrl || "", imagemHeroUrl: currentSettings?.imagemHeroUrl || "", resumoPlanoDiretor: currentSettings?.resumoPlanoDiretor || "", resumoUsoSolo: currentSettings?.resumoUsoSolo || "", leisComplementares: currentSettings?.leisComplementares || "", linkPortalCliente: buildTenantLink(slug, form.site || currentSettings?.site), protocoloPrefixo: currentSettings?.protocoloPrefixo || "PM", guiaPrefixo: currentSettings?.guiaPrefixo || "DAM", chavePix: currentSettings?.chavePix || "", beneficiarioArrecadacao: currentSettings?.beneficiarioArrecadacao || form.name, taxaProtocolo: currentSettings?.taxaProtocolo ?? 35.24, taxaIssPorMetroQuadrado: currentSettings?.taxaIssPorMetroQuadrado ?? 0, taxaAprovacaoFinal: currentSettings?.taxaAprovacaoFinal ?? 0, registroProfissionalObrigatorio: currentSettings?.registroProfissionalObrigatorio ?? true, contractNumber: form.contractNumber || currentSettings?.contractNumber || "", contractStart: form.contractStart || currentSettings?.contractStart || "", contractEnd: form.contractEnd || currentSettings?.contractEnd || "", monthlyFee: Number(form.monthlyFee || 0), setupFee: Number(form.setupFee || 0), signatureMode: form.signatureMode, clientDeliveryLink: form.clientDeliveryLink || buildTenantLink(slug, form.site || currentSettings?.site), logoScale: currentSettings?.logoScale ?? 1, logoOffsetX: currentSettings?.logoOffsetX ?? 0, logoOffsetY: currentSettings?.logoOffsetY ?? 0, headerLogoScale: currentSettings?.headerLogoScale ?? currentSettings?.logoScale ?? 1, headerLogoOffsetX: currentSettings?.headerLogoOffsetX ?? currentSettings?.logoOffsetX ?? 0, headerLogoOffsetY: currentSettings?.headerLogoOffsetY ?? currentSettings?.logoOffsetY ?? 0, footerLogoScale: currentSettings?.footerLogoScale ?? currentSettings?.logoScale ?? 1, footerLogoOffsetX: currentSettings?.footerLogoOffsetX ?? currentSettings?.logoOffsetX ?? 0, footerLogoOffsetY: currentSettings?.footerLogoOffsetY ?? currentSettings?.logoOffsetY ?? 0, logoAlt: currentSettings?.logoAlt || `Logo institucional de ${form.name}`, logoUpdatedAt: currentSettings?.logoUpdatedAt || "", logoUpdatedBy: currentSettings?.logoUpdatedBy || "", logoFrameMode: currentSettings?.logoFrameMode || "soft-square", logoFitMode: currentSettings?.logoFitMode || "contain", headerLogoFrameMode: currentSettings?.headerLogoFrameMode || currentSettings?.logoFrameMode || "soft-square", headerLogoFitMode: currentSettings?.headerLogoFitMode || currentSettings?.logoFitMode || "contain", footerLogoFrameMode: currentSettings?.footerLogoFrameMode || currentSettings?.logoFrameMode || "soft-square", footerLogoFitMode: currentSettings?.footerLogoFitMode || currentSettings?.logoFitMode || "contain", planoDiretorArquivoNome: currentSettings?.planoDiretorArquivoNome || "", planoDiretorArquivoUrl: currentSettings?.planoDiretorArquivoUrl || "", usoSoloArquivoNome: currentSettings?.usoSoloArquivoNome || "", usoSoloArquivoUrl: currentSettings?.usoSoloArquivoUrl || "", leisArquivoNome: currentSettings?.leisArquivoNome || "", leisArquivoUrl: currentSettings?.leisArquivoUrl || "" };
      if (hasSupabaseEnv && !remoteSyncError) {
        try {
          await withRetry(() => withTimeout(saveRemoteInstitutionSettings(nextSettings)));
        } catch (error) {
          remoteSyncError = error instanceof Error ? error.message : "Falha ao sincronizar configurações no Supabase.";
        }
      }

      saveInstitutionSettings(nextSettings);
      admins.filter((admin) => admin.email.trim() && admin.fullName.trim()).forEach((admin) => {
        const normalizedEmail = admin.email.trim().toLowerCase();
        const alreadyExists = sessionUsers.some((user) => normalizedEmail === user.email.trim().toLowerCase() && (user.tenantId === savedTenant.id || user.municipalityId === savedTenant.id));
        if (!alreadyExists) createTenantUser({ tenantId: savedTenant.id, fullName: admin.fullName.trim(), email: normalizedEmail, role: "prefeitura_admin", title: admin.title.trim() || roleSuggestedTitles.prefeitura_admin, accessLevel: admin.accessLevel });
      });
      setSelectedTenantId(savedTenant.id);
      if (remoteSyncError) {
        const pendingPayload: PendingTenantSync = {
          institution: {
            id: savedTenant.id,
            name: form.name,
            city: form.city,
            state: form.state,
            status: form.status,
            subdomain: slug,
            cnpj: form.cnpj,
            primaryColor: form.primaryColor,
            accentColor: form.accentColor,
            secretariat: form.secretariat,
          },
          settings: nextSettings,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(pendingSyncStorageKey, JSON.stringify(pendingPayload));
        setPendingSync(pendingPayload);
        setStatusMessage(`Salvo localmente. Não foi possível sincronizar com o Supabase: ${remoteSyncError}`);
      } else {
        window.localStorage.removeItem(pendingSyncStorageKey);
        setPendingSync(null);
        setStatusMessage("Prefeitura salva com sucesso e pronta para operação comercial.");
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível salvar a Prefeitura.";
      setStatusMessage(message);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      console.error("Falha ao salvar prefeitura:", error);
    } finally { setSaving(false); }
  };

  const resetForNewInstitution = () => { setSelectedTenantId(""); setWorkspaceView("cadastro"); setForm(emptyTenantForm); setAdmins([createAdminDraft()]); setStatusMessage(""); window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };

  const renderInstitutionCard = (tenant: Institution) => {
    const settings = getInstitutionSettings(tenant.id);
    const tenantAdmins = knownAdministrativeUsers.filter((user) => (user.tenantId === tenant.id || user.municipalityId === tenant.id) && user.role === "prefeitura_admin");
    const portalLink = settings?.clientDeliveryLink || settings?.linkPortalCliente || buildTenantLink(tenant.subdomain, settings?.site) || "Não definido";
    return (
      <div key={tenant.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
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
            <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 lg:w-auto" onClick={() => handleCopyLink(tenant.subdomain, settings?.site)}>
              <Copy className="mr-2 h-4 w-4 text-sky-200" />
              Copiar link
            </Button>
            <Button
              type="button"
              variant="outline"
              className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 lg:w-auto"
              onClick={() => {
                setInstitutionStatus(tenant.id, tenant.status === "suspenso" ? "ativo" : "suspenso");
                setStatusMessage(
                  tenant.status === "suspenso"
                    ? `${tenant.name} reativada com sucesso.`
                    : `${tenant.name} suspensa com sucesso.`,
                );
              }}
            >
              {tenant.status === "suspenso" ? (
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
            <Button
              type="button"
              variant="outline"
              className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 hover:text-slate-50 lg:w-auto"
              onClick={() => {
                if (!window.confirm(`Deseja remover ${tenant.name} da carteira local?`)) return;
                removeInstitution(tenant.id);
                setStatusMessage(`${tenant.name} removida da carteira local.`);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4 text-rose-300" />
              Remover
            </Button>
          </div>
        </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1.2fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Usuários ativos</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{tenant.users}</p>
            <p className="mt-1 text-sm text-slate-500">Base vinculada à conta municipal.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Receita mensal</p>
            <p className="mt-2 sig-fit-title text-lg font-semibold text-slate-950" title={formatCurrency(Number(settings?.monthlyFee ?? 0))}>
              {formatCurrency(Number(settings?.monthlyFee ?? 0))}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {settings?.contractEnd ? `Contrato até ${settings.contractEnd}` : "Sem vencimento contratual"}
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
                  <UserAvatar name={admin.name} imageUrl={profile?.avatarUrl} size="sm" />
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
          ) : (
            <Badge className="rounded-full border border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400 hover:bg-amber-50">
              Sem administrador principal
            </Badge>
          )}
        </div>
      </div>
    );
  };

  const renderUserCard = (user: SessionUser) => {
    const profile = getUserProfile(user.id, user.email);
    return <div key={user.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex min-w-0 items-start gap-3"><UserAvatar name={user.name} imageUrl={profile?.avatarUrl} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="sig-fit-title text-lg font-semibold text-slate-950">{user.name}</p><Badge className={`rounded-full border ${getStatusTone(user.accountStatus)}`}>{getStatusLabel(user.accountStatus)}</Badge></div><p className="text-sm text-slate-600">{user.title || user.department || "Sem cargo definido"}</p><p className="mt-1 sig-fit-copy text-sm text-slate-500" title={user.email}>{user.email}</p></div></div><div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end"><Badge className="rounded-full bg-slate-950 text-white hover:bg-slate-950">{roleLabels[user.role]}</Badge><Badge variant="outline" className="rounded-full border-slate-300 text-slate-700">{accessLevelLabels[user.accessLevel]}</Badge></div></div><div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Setor:</span> {user.department || user.title || "Não informado"}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Tipo:</span> {user.userType || "Usuário"}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Criado em:</span> {user.createdAt || "Não informado"}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Último acesso:</span> {user.lastAccessAt || "Não registrado"}</div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => handleMasterEdit(user)}><PencilLine className="mr-2 h-4 w-4 text-sky-200" />Editar</Button><Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => handleMasterStatusToggle(user)}>{user.accountStatus === "blocked" ? <><Undo2 className="mr-2 h-4 w-4 text-sky-200" />Desbloquear</> : <><ShieldAlert className="mr-2 h-4 w-4 text-sky-200" />Bloquear</>}</Button><Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 hover:text-slate-50 sm:w-auto" onClick={() => handleMasterDelete(user)}><UserX className="mr-2 h-4 w-4 text-rose-300" />Desativar</Button></div></div>;
  };
  return (
    <PortalFrame eyebrow="Administrador Geral" title="Console executivo da plataforma">
      <PageShell>
        <PageHero eyebrow="Governança SaaS" title="Carteira institucional do SIGAPRO" description="Acompanhe base ativa, risco operacional e saúde comercial em uma visão única de governança." icon={ShieldPlus} actions={<Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" onClick={resetForNewInstitution}><Plus className="mr-2 h-4 w-4" />Nova prefeitura</Button>} />
        <InternalSectionNav value={workspaceView} onChange={(value) => setWorkspaceView(value as WorkspaceView)} items={[{ value: "visao-geral", label: "Visão geral", helper: "Resumo executivo" }, { value: "carteira", label: "Carteira", helper: "Prefeituras e contratos" }, { value: "cadastro", label: "Cadastro", helper: "Conta institucional" }, { value: "usuarios", label: "Usuários", helper: "Acessos e perfis" }]} />

        {workspaceView === "visao-geral" ? <><PageStatsRow className="xl:grid-cols-4"><MetricCard title="Prefeituras ativas" value={String(activeInstitutionCount)} helper="Carteira em operação" icon={Landmark} tone="blue" /><MetricCard title="Usuários ativos" value={String(activeUsersCount)} helper="Contas habilitadas" icon={Users2} tone="emerald" /><MetricCard title="Planos ativos" value={String(activePlansCount)} helper="Recorrência mensal" icon={CreditCard} tone="amber" /><MetricCard title="Receita mensal" value={formatCurrency(monthlyRevenue)} helper="Base institucional ativa" icon={Zap} tone="rose" valueTitle={monthlyRevenue.toString()} /></PageStatsRow><PageMainGrid><PageMainContent><TableCard title="Carteira institucional" description="Prefeituras prioritárias e leitura comercial da operação." icon={Building2}><div className="space-y-4">{overviewInstitutions.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhuma Prefeitura ativa cadastrada ainda. Use o cadastro para abrir a primeira conta institucional.</div> : null}{overviewInstitutions.map((tenant) => renderInstitutionCard(tenant))}</div></TableCard></PageMainContent><PageSideContent><SectionCard title="Painel master" description="Alertas, atividade curta e leitura comercial."><div className="space-y-4"><div className="space-y-3">{platformAlerts.slice(0, 3).map((alert) => <AlertCard key={alert.id} title={alert.title} description={alert.description} tone={alert.tone} />)}</div><div className="grid gap-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Base total</p><p className="mt-2 text-lg font-semibold text-slate-950">{institutionCatalog.length}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Receita média</p><p className="mt-2 text-lg font-semibold text-slate-950">{institutionCatalog.length > 0 ? formatCurrency(monthlyRevenue / institutionCatalog.length) : formatCurrency(0)}</p></div></div><div className="space-y-3">{recentActivity.slice(0, 3).map((user) => { const profile = getUserProfile(user.id, user.email); return <div key={user.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3"><UserAvatar name={user.name} imageUrl={profile?.avatarUrl} size="sm" /><div className="min-w-0"><p className="sig-fit-title text-sm font-semibold text-slate-950">{user.name}</p><p className="sig-fit-copy text-xs text-slate-500">{roleLabels[user.role]}</p></div></div>; })}</div></div></SectionCard></PageSideContent></PageMainGrid></> : null}

        {workspaceView === "carteira" ? <TableCard title="Prefeituras" description="Carteira municipal, contratos e ações de governança." icon={Building2}><div className="space-y-4">{institutionCatalog.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhuma Prefeitura cadastrada ainda. Use o cadastro para abrir a primeira conta institucional.</div> : null}{institutionCatalog.map((tenant) => renderInstitutionCard(tenant))}</div></TableCard> : null}

        {workspaceView === "cadastro" ? (
          <PageMainGrid>
            <PageMainContent>
              <div ref={formRef}>
                <TableCard
                  title="Cadastro da Prefeitura"
                  description="Dados comerciais, identidade institucional e governança da conta."
                  icon={Settings2}
                  actions={
                    <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={() => navigate(-1)}>
                      <ArrowLeft className="mr-2 h-4 w-4 text-sky-200" />
                      Voltar
                    </Button>
                  }
                >
                  <form className="sig-premium-admin-form space-y-6" onSubmit={handleSave}>
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
                    {pendingSync ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        <span>Sincronização pendente com o Supabase.</span>
                        <Button type="button" variant="outline" className="h-9 rounded-full px-4 text-xs" onClick={handleRetryRemoteSync}>
                          Tentar sincronizar agora
                        </Button>
                      </div>
                    ) : null}
                  <div className="grid gap-5 xl:grid-cols-12">
                      <div className="sig-dark-panel flex min-h-[140px] min-w-0 flex-col rounded-[24px] border border-slate-200 p-5 shadow-sm xl:col-span-7">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Conta selecionada</p>
                        <p className="mt-3 text-[1.35rem] font-semibold leading-[1.22] tracking-[-0.02em] text-slate-950 sig-url-display" title={activeTenant?.name || "Nova Prefeitura"}>
                          {activeTenant?.name || "Nova Prefeitura"}
                        </p>
                        <p className="pt-3 text-sm leading-6 text-slate-500">Ficha comercial e institucional.</p>
                      </div>
                      <div className="sig-dark-panel flex min-h-[140px] min-w-0 flex-col rounded-[24px] border border-slate-200 p-5 shadow-sm xl:col-span-5">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Saúde do contrato</p>
                        <p className="mt-3 text-[1.35rem] font-semibold leading-[1.22] tracking-[-0.02em] text-slate-950" title={form.contractEnd || "Sem vencimento"}>
                          {form.contractEnd || "Sem vencimento"}
                        </p>
                        <p className="pt-3 text-sm leading-6 text-slate-500">Renovação e recorrência.</p>
                      </div>
                      <div className="sig-dark-panel flex min-h-[128px] min-w-0 flex-col rounded-[24px] border border-slate-200 p-5 shadow-sm xl:col-span-12">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Entrega comercial</p>
                        <p
                          className="mt-3 text-[1.05rem] font-semibold leading-6 tracking-[-0.02em] text-slate-950 sig-url-display"
                          title={form.clientDeliveryLink || buildTenantLink(form.subdomain, form.site) || "Link pendente"}
                          >
                          {form.clientDeliveryLink || buildTenantLink(form.subdomain, form.site) || "Link pendente"}
                        </p>
                        <p className="pt-3 text-sm leading-6 text-slate-500">Portal e acesso institucional.</p>
                      </div>
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
                      <Label>Plano</Label>
                      <Input value={form.plan} onChange={(event) => handleSetForm("plan", event.target.value)} className="sig-admin-input" />
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
                            <SelectItem value="icp_brasil">ICP Brasil</SelectItem>
                          </SelectContent>
                        </Select>
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
                    <div className="sig-dark-panel space-y-4 rounded-[24px] border border-slate-200 p-5">
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
                          <div key={admin.id} className="sig-dark-panel grid gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-12">
                            <div className="space-y-2 lg:col-span-4">
                              <Label>E-mail</Label>
                              <Input list={`admin-email-options-${admin.id}`} value={admin.email} onChange={(event) => updateAdminRow(admin.id, "email", event.target.value)} onBlur={(event) => applyKnownAdminEmail(admin.id, event.target.value)} className="sig-admin-input" />
                              <datalist id={`admin-email-options-${admin.id}`}>
                                {availableAdminEmails.map((user) => (
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
                      <Button type="submit" className="h-11 w-full rounded-full bg-slate-950 px-6 hover:bg-slate-900 sm:w-auto" disabled={saving}>
                        {saving ? "Salvando..." : "Salvar Prefeitura"}
                      </Button>
                      <Button type="button" variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto" onClick={resetForNewInstitution}>
                        Limpar formulário
                      </Button>
                    </div>
                  </form>
                </TableCard>
              </div>
            </PageMainContent>
            <PageSideContent>
              <SectionCard title="Apoio comercial" description="Leitura rápida da conta selecionada e do ambiente.">
                <div className="space-y-4">
                  <div className="sig-dark-panel rounded-[22px] border border-slate-200 px-4 py-4 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Conta ativa</p>
                    <p className="mt-2 text-balance text-[1rem] font-semibold leading-6 tracking-[-0.02em] text-slate-950">{activeTenant?.name || "Nova Prefeitura"}</p>
                  </div>
                  <div className="sig-dark-panel rounded-[22px] border border-slate-200 px-4 py-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Portal</p>
                      <Button type="button" variant="outline" className="sig-dark-action-btn h-8 rounded-full px-3 text-xs text-slate-50" onClick={() => handleCopyLink(form.subdomain, form.site)}>
                        <Copy className="mr-1.5 h-3.5 w-3.5 text-sky-200" />
                        Copiar
                      </Button>
                    </div>
                    <p className="mt-3 text-[13px] font-semibold leading-6 text-slate-950 sig-url-display" title={form.clientDeliveryLink || buildTenantLink(form.subdomain, form.site) || "Link pendente"}>
                      {form.clientDeliveryLink || buildTenantLink(form.subdomain, form.site) || "Link pendente"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Acesso institucional publicado para a conta ativa.</p>
                  </div>
                  <div className="sig-dark-panel rounded-[22px] border border-slate-200 px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <Workflow className="h-4 w-4 text-sky-200" />
                      Sincronização
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-500">{hasSupabaseEnv ? "Supabase conectado para contas, branding e persistência comercial." : "Ambiente local em modo de demonstração para validação da operação."}</p>
                  </div>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {workspaceView === "usuarios" ? <PageMainGrid><PageMainContent><PageStatsRow className="xl:grid-cols-3"><MetricCard title="Base total" value={String(sessionUsers.length)} helper="Contas monitoradas" icon={Users2} tone="blue" /><MetricCard title="Administradores" value={String(adminUsersCount)} helper="Perfis de governança" icon={ShieldPlus} tone="amber" /><MetricCard title="Bloqueados" value={String(blockedUsersCount)} helper="Contas com restrição" icon={ShieldAlert} tone="rose" /></PageStatsRow><TableCard title="Usuários do sistema" description="Governança de contas, acessos e perfis da operação SaaS." icon={Users2}><div className="space-y-4"><Tabs value={userGroup} onValueChange={(value) => setUserGroup(value as UserGroup)}><TabsList className="flex h-auto flex-nowrap justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-100 p-1"><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="internos">Internos</TabsTrigger><TabsTrigger value="externos">Externos</TabsTrigger><TabsTrigger value="administradores">Administradores</TabsTrigger></TabsList></Tabs><div className="grid gap-3 xl:grid-cols-[1.2fr,0.7fr,0.7fr]"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar nome, e-mail, setor ou tipo" className="h-11 rounded-2xl pl-11" /></div><Select value={userStatusFilter} onValueChange={(value) => setUserStatusFilter(value as "todos" | AccountStatus)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="active">Ativos</SelectItem><SelectItem value="blocked">Bloqueados</SelectItem><SelectItem value="inactive">Inativos</SelectItem></SelectContent></Select><Select value={userRoleFilter} onValueChange={(value) => setUserRoleFilter(value as "todos" | UserRole)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os perfis</SelectItem>{Object.entries(roleLabels).map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-3">{filteredSystemUsers.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">Nenhum usuário encontrado com os filtros atuais.</div> : null}{filteredSystemUsers.map((user) => renderUserCard(user))}</div></div></TableCard></PageMainContent><PageSideContent><SectionCard title="Governança de acessos" description="Leitura rápida da base e dos perfis críticos."><div className="space-y-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Contas ativas</p><p className="mt-2 text-lg font-semibold text-slate-950">{activeUsersCount}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Bloqueadas</p><p className="mt-2 text-lg font-semibold text-slate-950">{blockedUsersCount}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Administradores</p><p className="mt-2 text-lg font-semibold text-slate-950">{adminUsersCount}</p></div></div></SectionCard></PageSideContent></PageMainGrid> : null}
      </PageShell>
    </PortalFrame>
  );
}
