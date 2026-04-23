import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/integrations/r2/client";
import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import {
  buildProcessDocuments,
  type ClientPlanAssignment,
  type CreateProcessInput,
  type InstitutionAdminContact,
  type OwnerProfessionalMessage,
  type OwnerProjectLink,
  type OwnerProjectRequest,
  type PlanItem,
  type ProcessRecord,
  type SessionUser,
  type Tenant,
  type TenantSettings,
  type UserProfile,
} from "@/lib/platform";

function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== "object") return false;

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const blob = `${message} ${details} ${hint}`.toLowerCase();

  return code === "PGRST205" || blob.includes(relationName.toLowerCase());
}

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const blob = `${message} ${details} ${hint}`.toLowerCase();

  return blob.includes("could not find the") && blob.includes("column");
}

function getMissingColumnName(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const blob = `${message} ${details} ${hint}`;
  const match = blob.match(/could not find the ['"]([^'"]+)['"] column/i);
  return match?.[1] ?? null;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return "Erro desconhecido do Supabase.";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";
  const details =
    "details" in error && typeof error.details === "string" ? error.details : "";
  const hint =
    "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const parts = [message, details, hint, code].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "Erro desconhecido do Supabase.";
}

function normalizeUuid(value: string | null | undefined) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

async function upsertWithColumnRetry(
  table: string,
  payload: Record<string, unknown>,
  onConflict: string,
) {
  let currentPayload: Record<string, unknown> = { ...payload };
  let lastError: { message?: string } | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await supabase
      .from(table)
      .upsert(currentPayload, { onConflict });
    lastError = result.error;

    if (!lastError) {
      return result;
    }

    if (!isMissingColumnError(lastError)) break;

    const missingColumn = getMissingColumnName(lastError);
    if (!missingColumn || !(missingColumn in currentPayload)) break;

    console.warn(
      `[SIGAPRO][Supabase] Coluna ausente em ${table}, removendo e tentando novamente`,
      { missingColumn },
    );
    delete currentPayload[missingColumn];
  }

  return { error: lastError };
}

function readGeneralString(general: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = general[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function readGeneralOptionalString(general: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = general[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function readGeneralNumber(general: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = general[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return fallback;
}

function withTimeout<T>(promise: Promise<T>, label: string, ms = 12000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout: ${label}`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function buildMunicipalitySlug(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function buildPlanCode(plan: Pick<PlanItem, "id" | "name" | "accountLevel">) {
  return (
    buildMunicipalitySlug(plan.id) ||
    buildMunicipalitySlug(plan.accountLevel) ||
    buildMunicipalitySlug(plan.name) ||
    `plan-${Date.now()}`
  );
}

function normalizeMunicipalityStatus(status: string | null | undefined) {
  if (status === "suspenso" || status === "inactive" || status === "blocked") {
    return "inactive";
  }
  if (status === "implantacao" || status === "implementation") {
    return "implementation";
  }
  return "active";
}

function resolveMunicipalityName(record: Record<string, any>) {
  return (
    (typeof record.display_name === "string" && record.display_name.trim()) ||
    (typeof record.official_name === "string" && record.official_name.trim()) ||
    (typeof record.name === "string" && record.name.trim()) ||
    ""
  );
}

function resolveMunicipalityCity(record: Record<string, any>, general?: Record<string, unknown>) {
  return (
    (typeof record.city === "string" && record.city.trim()) ||
    (typeof general?.city === "string" && general.city.trim()) ||
    resolveMunicipalityName(record)
  );
}

function resolveMunicipalityEmail(record: Record<string, any>) {
  return (
    (typeof record.email === "string" && record.email.trim()) ||
    (typeof record.contact_email === "string" && record.contact_email.trim()) ||
    ""
  );
}

function resolveMunicipalityPhone(record: Record<string, any>) {
  return (
    (typeof record.phone === "string" && record.phone.trim()) ||
    (typeof record.contact_phone === "string" && record.contact_phone.trim()) ||
    ""
  );
}

function normalizeAdminContacts(value: unknown): InstitutionAdminContact[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const email = typeof item.email === "string" ? item.email.trim().toLowerCase() : "";
      const fullName =
        typeof item.fullName === "string"
          ? item.fullName.trim()
          : typeof item.full_name === "string"
            ? item.full_name.trim()
            : "";
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const rawLevel =
        typeof item.accessLevel === "number"
          ? item.accessLevel
          : typeof item.access_level === "number"
            ? item.access_level
            : 3;

      return {
        email,
        fullName,
        title,
        accessLevel: rawLevel >= 3 ? 3 : 2,
      } satisfies InstitutionAdminContact;
    })
    .filter((item) => item.email && item.fullName);
}

function normalizeMunicipalityStorageFolder(folder: string, bucket: "process-documents" | "profile-assets" | "institutional-branding") {
  const normalized = buildMunicipalitySlug(folder) || "files";

  if (bucket === "profile-assets") {
    return normalized === "avatars" ? "profiles/avatars" : `profiles/${normalized}`;
  }

  const aliases: Record<string, string> = {
    protocolos: "protocols",
    protocolo: "protocols",
    analise: "analysis",
    analises: "analysis",
    anexos: "attachments",
    anexo: "attachments",
    documentos: "documents",
    documento: "documents",
    branding: "branding",
    avatar: "profiles/avatars",
    avatars: "profiles/avatars",
  };

  return aliases[normalized] || normalized;
}

function roleToAccessLevel(role: string): 1 | 2 | 3 {
  if (role === "prefeitura_admin" || role === "master_admin" || role === "master_ops") return 3;
  if (role === "prefeitura_supervisor" || role === "analista" || role === "financeiro" || role === "setor_intersetorial") return 2;
  return 1;
}

function municipalityResultData(value: any[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

export async function loadRemotePlatformStore() {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const [
    tenantsResult,
    brandingResult,
    settingsResult,
    municipalitiesResult,
    municipalityBrandingResult,
    municipalitySettingsResult,
    profilesResult,
    membershipsResult,
    rolesResult,
    processesResult,
    propertiesResult,
    guidesResult,
    partiesResult,
    documentsResult,
    requirementsResult,
    auditResult,
    reopenResult,
    movementsResult,
    ownerRequestsResult,
    ownerLinksResult,
    ownerMessagesResult,
    plansResult,
    planAssignmentsResult,
  ] = await Promise.all([
    supabase.from("tenants").select("*").order("created_at", { ascending: false }),
    supabase.from("tenant_branding").select("*"),
    supabase.from("tenant_settings").select("*"),
    supabase.from("municipalities").select("*").order("created_at", { ascending: false }),
    supabase.from("municipality_branding").select("*"),
    supabase.from("municipality_settings").select("*"),
    supabase.from("profiles").select("*"),
    supabase.from("tenant_memberships").select("*").eq("is_active", true).is("deleted_at", null),
    supabase.from("roles").select("*"),
    supabase.from("processes").select("*").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("properties").select("*"),
    supabase.from("payment_guides").select("*").order("created_at", { ascending: false }),
    supabase.from("process_parties").select("*"),
    supabase.from("process_documents").select("*").order("created_at", { ascending: false }),
    supabase.from("process_requirements").select("*").order("created_at", { ascending: false }),
    supabase.from("process_audit_entries").select("*").order("created_at", { ascending: false }),
    supabase.from("process_reopen_history").select("*").order("created_at", { ascending: false }),
    supabase.from("process_movements").select("*").order("created_at", { ascending: false }),
    supabase.from("project_owner_requests").select("*").order("requested_at", { ascending: false }),
    supabase.from("project_owner_links").select("*").order("linked_at", { ascending: false }),
    supabase.from("owner_professional_messages").select("*").order("created_at", { ascending: false }),
    supabase.from("plans").select("*"),
    supabase.from("client_plan_assignments").select("*").order("updated_at", { ascending: false }),
  ]);

  const nonBlockingErrors: unknown[] = [];
  if (profilesResult.error) {
    nonBlockingErrors.push(profilesResult.error);
    console.warn("SIGAPRO: falha ao carregar profiles (ignorado para continuar carregamento).", profilesResult.error);
  }
  if (membershipsResult.error) {
    nonBlockingErrors.push(membershipsResult.error);
    console.warn(
      "SIGAPRO: falha ao carregar tenant_memberships (ignorado para continuar carregamento).",
      membershipsResult.error,
    );
  }

  const errors = [
    isMissingRelationError(tenantsResult.error, "public.tenants") ? null : tenantsResult.error,
    isMissingRelationError(brandingResult.error, "public.tenant_branding") ? null : brandingResult.error,
    isMissingRelationError(settingsResult.error, "public.tenant_settings") ? null : settingsResult.error,
    isMissingRelationError(municipalitiesResult.error, "public.municipalities") ? null : municipalitiesResult.error,
    isMissingRelationError(municipalityBrandingResult.error, "public.municipality_branding") ? null : municipalityBrandingResult.error,
    isMissingRelationError(municipalitySettingsResult.error, "public.municipality_settings") ? null : municipalitySettingsResult.error,
    rolesResult.error,
    processesResult.error,
    propertiesResult.error,
    guidesResult.error,
    partiesResult.error,
    documentsResult.error,
    requirementsResult.error,
    auditResult.error,
    reopenResult.error,
    movementsResult.error,
    isMissingRelationError(ownerRequestsResult.error, "public.project_owner_requests") ? null : ownerRequestsResult.error,
    isMissingRelationError(ownerLinksResult.error, "public.project_owner_links") ? null : ownerLinksResult.error,
    isMissingRelationError(ownerMessagesResult.error, "public.owner_professional_messages")
      ? null
      : ownerMessagesResult.error,
    isMissingRelationError(plansResult.error, "public.plans") ? null : plansResult.error,
    isMissingRelationError(planAssignmentsResult.error, "public.client_plan_assignments")
      ? null
      : planAssignmentsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  const tenantRows = tenantsResult.data ?? [];
  const municipalityRows = municipalityResultData(municipalitiesResult.data);
  const brandingByTenant = new Map((brandingResult.data ?? []).map((item) => [item.tenant_id, item]));
  const settingsByTenant = new Map((settingsResult.data ?? []).map((item) => [item.tenant_id, item]));
  const brandingByMunicipality = new Map((municipalityBrandingResult.data ?? []).map((item) => [item.municipality_id, item]));
  const settingsByMunicipality = new Map((municipalitySettingsResult.data ?? []).map((item) => [item.municipality_id, item]));
  const roleById = new Map((rolesResult.data ?? []).map((item) => [item.id, item]));
  const profileByUser = new Map((profilesResult.data ?? []).map((item) => [item.user_id, item]));
  const propertyById = new Map((propertiesResult.data ?? []).map((item) => [item.id, item]));
  const guidesByProcess = new Map<string, any>();
  const partiesByProcess = new Map<string, any[]>();
  const docsByProcess = new Map<string, any[]>();
  const requirementsByProcess = new Map<string, any[]>();
  const auditByProcess = new Map<string, any[]>();
  const reopenByProcess = new Map<string, any[]>();
  const movementsByProcess = new Map<string, any[]>();
  for (const guide of guidesResult.data ?? []) {
    if (!guidesByProcess.has(guide.process_id)) {
      guidesByProcess.set(guide.process_id, guide);
    }
  }
  for (const item of partiesResult.data ?? []) {
    const list = partiesByProcess.get(item.process_id) ?? [];
    list.push(item);
    partiesByProcess.set(item.process_id, list);
  }
  for (const item of documentsResult.data ?? []) {
    const list = docsByProcess.get(item.process_id) ?? [];
    list.push(item);
    docsByProcess.set(item.process_id, list);
  }
  for (const item of requirementsResult.data ?? []) {
    const list = requirementsByProcess.get(item.process_id) ?? [];
    list.push(item);
    requirementsByProcess.set(item.process_id, list);
  }
  for (const item of auditResult.data ?? []) {
    const list = auditByProcess.get(item.process_id) ?? [];
    list.push(item);
    auditByProcess.set(item.process_id, list);
  }
  for (const item of reopenResult.data ?? []) {
    const list = reopenByProcess.get(item.process_id) ?? [];
    list.push(item);
    reopenByProcess.set(item.process_id, list);
  }
  for (const item of movementsResult.data ?? []) {
    const list = movementsByProcess.get(item.process_id) ?? [];
    list.push(item);
    movementsByProcess.set(item.process_id, list);
  }

  const ownerRequests: OwnerProjectRequest[] = (ownerRequestsResult.data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    professionalUserId: row.professional_user_id,
    status: row.status ?? "pending",
    requestedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
    respondedAt: row.responded_at ?? null,
    respondedBy: row.responded_by ?? null,
    notes: row.notes ?? undefined,
  }));

  const ownerLinks: OwnerProjectLink[] = (ownerLinksResult.data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    professionalUserId: row.professional_user_id,
    chatEnabled: row.chat_enabled ?? true,
    linkedAt: row.linked_at ?? row.created_at ?? new Date().toISOString(),
    linkedBy: row.linked_by ?? null,
  }));

  const ownerMessages: OwnerProfessionalMessage[] = (ownerMessagesResult.data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    professionalUserId: row.professional_user_id,
    senderUserId: row.sender_user_id,
    message: row.message,
    createdAt: row.created_at ?? new Date().toISOString(),
    readAt: row.read_at ?? null,
    isSystemMessage: row.is_system_message ?? false,
  }));

  const plans: PlanItem[] = (plansResult.data ?? []).map((row) => ({
    id: row.id,
    accountLevel: row.account_level ?? row.name ?? "Custom",
    name: row.name ?? "Plano",
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    billingCycle:
      row.billing_cycle === "anual" || row.billing_cycle === "personalizado"
        ? row.billing_cycle
        : "mensal",
    badge: row.badge ?? "",
    badgeVariant: row.badge_variant ?? "default",
    featuresIncluded: Array.isArray(row.features_included) ? row.features_included : [],
    featuresExcluded: Array.isArray(row.features_excluded) ? row.features_excluded : [],
    modulesIncluded: Array.isArray(row.modules_included) ? row.modules_included : [],
    maxUsers: row.max_users ?? null,
    maxProcesses: row.max_processes ?? null,
    maxDepartments: row.max_departments ?? null,
    maxStorageGb: row.max_storage_gb ?? null,
    isFeatured: Boolean(row.is_featured ?? false),
    isActive: Boolean(row.is_active ?? row.is_enabled ?? true),
    isPublic: Boolean(row.is_public ?? false),
    isInternalOnly: Boolean(row.is_internal_only ?? false),
    isCustom: Boolean(row.is_custom ?? false),
    isVisibleInMaster: Boolean(row.is_visible_in_master ?? true),
    displayOrder: Number(row.display_order ?? 0),
    accentColor: row.accent_color ?? "#1d4ed8",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }));

  const planAssignments: ClientPlanAssignment[] = (planAssignmentsResult.data ?? []).map((row) => ({
    id: row.id,
    municipalityId: row.municipality_id,
    planId: row.plan_id,
    contractStatus: row.contract_status ?? "rascunho",
    startsAt: row.starts_at ?? "",
    endsAt: row.ends_at ?? "",
    billingCycle:
      row.billing_cycle === "anual" || row.billing_cycle === "personalizado"
        ? row.billing_cycle
        : "mensal",
    billingNotes: row.billing_notes ?? "",
    customPrice: row.custom_price ?? null,
    isCustom: Boolean(row.is_custom ?? false),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }));

  const mappedTenantsFromLegacy: Tenant[] = tenantRows.map((tenant) => {
    const branding = brandingByTenant.get(tenant.id);
    const tenantMemberships = (membershipsResult.data ?? []).filter((item) => item.tenant_id === tenant.id);
    const tenantProcesses = (processesResult.data ?? []).filter((item) => item.tenant_id === tenant.id);

    return {
      id: tenant.id,
      name: tenant.display_name,
      city: tenant.city,
      state: tenant.state,
      status: tenant.status === "encerrado" ? "suspenso" : tenant.status,
      plan:
        plans.find((plan) =>
          planAssignments.some((assignment) => assignment.municipalityId === tenant.id && assignment.planId === plan.id),
        )?.name ?? "Plano institucional",
      activeModules: [],
      users: tenantMemberships.length,
      processes: tenantProcesses.length,
      revenue: 0,
      subdomain: tenant.subdomain ?? "",
      theme: {
        primary: branding?.primary_color ?? "#123a58",
        accent: branding?.accent_color ?? "#5ee8d9",
      },
    };
  });

  const mappedSettingsFromLegacy: TenantSettings[] = tenantRows.map((tenant) => {
    const branding = brandingByTenant.get(tenant.id);
    const settings = settingsByTenant.get(tenant.id);
    const legacyExtra =
      settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
    return {
      tenantId: tenant.id,
      cnpj: settings?.cnpj ?? tenant.cnpj ?? "",
      endereco: settings?.endereco ?? "",
      telefone: settings?.telefone ?? "",
      email: settings?.email ?? "",
      site: settings?.site ?? "",
      secretariaResponsavel: settings?.secretaria_responsavel ?? branding?.hero_subtitle ?? "",
      diretoriaResponsavel: settings?.diretoria_responsavel ?? "",
      diretoriaTelefone: settings?.diretoria_telefone ?? "",
      diretoriaEmail: settings?.diretoria_email ?? "",
      horarioAtendimento: settings?.horario_atendimento ?? "",
      brasaoUrl: settings?.brasao_url ?? "",
      bandeiraUrl: settings?.bandeira_url ?? "",
      logoUrl: settings?.logo_url ?? branding?.logo_url ?? "",
      imagemHeroUrl: settings?.imagem_hero_url ?? "",
      resumoPlanoDiretor: settings?.resumo_plano_diretor ?? "",
      resumoUsoSolo: settings?.resumo_uso_solo ?? "",
      leisComplementares: settings?.leis_complementares ?? "",
      linkPortalCliente:
        settings?.link_portal_cliente ??
        buildMunicipalityPortalUrl({
          subdomain: tenant.subdomain,
          customDomain: tenant.customDomain,
        }),
      protocoloPrefixo: settings?.protocolo_prefixo ?? "SIG",
      guiaPrefixo: settings?.guia_prefixo ?? "DAM",
      chavePix: settings?.chave_pix ?? "",
      beneficiarioArrecadacao: settings?.beneficiario_arrecadacao ?? tenant.display_name,
      contractNumber: settings?.contract_number ?? "",
      contractStart: settings?.contract_start ?? "",
      contractEnd: settings?.contract_end ?? "",
      monthlyFee: Number(settings?.monthly_fee ?? 0),
      setupFee: Number(settings?.setup_fee ?? 0),
      signatureMode: settings?.signature_mode ?? "eletronica",
      clientDeliveryLink:
        settings?.client_delivery_link ??
        buildMunicipalityPortalUrl({
          subdomain: tenant.subdomain,
          customDomain: tenant.customDomain,
        }),
      logoScale: Number(settings?.logo_scale ?? branding?.logo_scale ?? branding?.header_logo_scale ?? 1),
      logoOffsetX: Number(settings?.logo_offset_x ?? branding?.logo_offset_x ?? branding?.header_logo_offset_x ?? 0),
      logoOffsetY: Number(settings?.logo_offset_y ?? branding?.logo_offset_y ?? branding?.header_logo_offset_y ?? 0),
      headerLogoScale: Number(settings?.header_logo_scale ?? branding?.header_logo_scale ?? settings?.logo_scale ?? branding?.logo_scale ?? 1),
      headerLogoOffsetX: Number(settings?.header_logo_offset_x ?? branding?.header_logo_offset_x ?? settings?.logo_offset_x ?? branding?.logo_offset_x ?? 0),
      headerLogoOffsetY: Number(settings?.header_logo_offset_y ?? branding?.header_logo_offset_y ?? settings?.logo_offset_y ?? branding?.logo_offset_y ?? 0),
      footerLogoScale: Number(settings?.footer_logo_scale ?? branding?.footer_logo_scale ?? settings?.logo_scale ?? branding?.logo_scale ?? 1),
      footerLogoOffsetX: Number(settings?.footer_logo_offset_x ?? branding?.footer_logo_offset_x ?? settings?.logo_offset_x ?? branding?.logo_offset_x ?? 0),
      footerLogoOffsetY: Number(settings?.footer_logo_offset_y ?? branding?.footer_logo_offset_y ?? settings?.logo_offset_y ?? branding?.logo_offset_y ?? 0),
      logoAlt: settings?.logo_alt ?? branding?.logo_alt ?? `Logo institucional de ${tenant.display_name}`,
      logoUpdatedAt: settings?.logo_updated_at ?? branding?.logo_updated_at ?? "",
      logoUpdatedBy: normalizeUuid(settings?.logo_updated_by ?? branding?.logo_updated_by) ?? "",
      logoFrameMode: settings?.logo_frame_mode ?? branding?.logo_frame_mode ?? branding?.header_logo_frame_mode ?? "soft-square",
      logoFitMode: settings?.logo_fit_mode ?? branding?.logo_fit_mode ?? branding?.header_logo_fit_mode ?? "contain",
      headerLogoFrameMode: settings?.header_logo_frame_mode ?? branding?.header_logo_frame_mode ?? settings?.logo_frame_mode ?? branding?.logo_frame_mode ?? "soft-square",
      headerLogoFitMode: settings?.header_logo_fit_mode ?? branding?.header_logo_fit_mode ?? settings?.logo_fit_mode ?? branding?.logo_fit_mode ?? "contain",
      footerLogoFrameMode: settings?.footer_logo_frame_mode ?? branding?.footer_logo_frame_mode ?? settings?.logo_frame_mode ?? branding?.logo_frame_mode ?? "soft-square",
      footerLogoFitMode: settings?.footer_logo_fit_mode ?? branding?.footer_logo_fit_mode ?? settings?.logo_fit_mode ?? branding?.logo_fit_mode ?? "contain",
      planoDiretorArquivoNome: settings?.plano_diretor_arquivo_nome ?? "",
      planoDiretorArquivoUrl: settings?.plano_diretor_arquivo_url ?? "",
      usoSoloArquivoNome: settings?.uso_solo_arquivo_nome ?? "",
      usoSoloArquivoUrl: settings?.uso_solo_arquivo_url ?? "",
      leisArquivoNome: settings?.leis_arquivo_nome ?? "",
      leisArquivoUrl: settings?.leis_arquivo_url ?? "",
      adminContacts: normalizeAdminContacts(legacyExtra.admin_contacts),
      taxaProtocolo: Number(settings?.taxa_protocolo ?? 35.24),
      taxaIssPorMetroQuadrado: Number(settings?.taxa_iss_por_metro_quadrado ?? 0),
      issRateProfiles:
        Array.isArray(legacyExtra.iss_rate_profiles) && legacyExtra.iss_rate_profiles.length > 0
          ? (legacyExtra.iss_rate_profiles as TenantSettings["issRateProfiles"])
          : undefined,
      taxaAprovacaoFinal: Number(settings?.taxa_aprovacao_final ?? 0),
      approvalRateProfiles:
        Array.isArray(legacyExtra.approval_rate_profiles) && legacyExtra.approval_rate_profiles.length > 0
          ? (legacyExtra.approval_rate_profiles as TenantSettings["approvalRateProfiles"])
          : undefined,
      registroProfissionalObrigatorio: Boolean(settings?.registro_profissional_obrigatorio ?? true),
    };
  });

  const mappedTenantsFromMunicipalities: Tenant[] = municipalityRows.map((municipality) => {
    const branding = brandingByMunicipality.get(municipality.id);
    const settings = settingsByMunicipality.get(municipality.id);
    const general =
      settings?.general_settings && typeof settings.general_settings === "object"
        ? (settings.general_settings as Record<string, unknown>)
        : {};
    const municipalityName = resolveMunicipalityName(municipality);
    const municipalityCity = resolveMunicipalityCity(municipality, general);
    const municipalityProfiles = (profilesResult.data ?? []).filter((item) => item.municipality_id === municipality.id && !item.deleted_at);
    const municipalityProcesses = (processesResult.data ?? []).filter(
      (item) => (item.municipality_id ?? item.tenant_id) === municipality.id,
    );
    const activeModules =
      Array.isArray(general.legacy_modules_enabled)
        ? general.legacy_modules_enabled
            .filter(
              (item): item is { is_enabled?: boolean; module_id?: string } =>
                Boolean(item) && typeof item === "object" && !Array.isArray(item),
            )
            .filter((item) => item.is_enabled && typeof item.module_id === "string")
            .map((item) => item.module_id)
        : [];

    return {
      id: municipality.id,
      name: municipalityName,
      city: municipalityCity,
      state: municipality.state,
      status:
        municipality.status === "blocked" || municipality.status === "inactive"
          ? "suspenso"
          : municipality.status === "implementation"
            ? "implantacao"
            : "ativo",
      plan:
        plans.find((plan) =>
          planAssignments.some((assignment) => assignment.municipalityId === municipality.id && assignment.planId === plan.id),
        )?.name ?? "Plano institucional",
      activeModules,
      users: municipalityProfiles.length,
      processes: municipalityProcesses.length,
      revenue: typeof general.monthly_fee === "number" ? general.monthly_fee : 0,
      subdomain: municipality.subdomain ?? municipality.slug ?? "",
      theme: {
        primary: branding?.primary_color ?? "#123a58",
        accent: branding?.accent_color ?? "#5ee8d9",
      },
    };
  });

  const mappedSettingsFromMunicipalities: TenantSettings[] = municipalityRows.map((municipality) => {
    const branding = brandingByMunicipality.get(municipality.id);
    const settings = settingsByMunicipality.get(municipality.id);
    const general =
      settings?.general_settings && typeof settings.general_settings === "object"
        ? (settings.general_settings as Record<string, unknown>)
        : {};
    const municipalityName = resolveMunicipalityName(municipality);

    return {
      tenantId: municipality.id,
      cnpj:
        (typeof general.cnpj === "string" && general.cnpj) ||
        (typeof municipality.cnpj === "string" ? municipality.cnpj : "") ||
        "",
      endereco: municipality.address ?? "",
      telefone: resolveMunicipalityPhone(municipality),
      email: resolveMunicipalityEmail(municipality),
      site: municipality.custom_domain ?? (typeof general.site === "string" ? general.site : ""),
      secretariaResponsavel: municipality.secretariat_name ?? "",
      diretoriaResponsavel: typeof general.directorship === "string" ? general.directorship : "",
      diretoriaTelefone: typeof general.directorship_phone === "string" ? general.directorship_phone : "",
      diretoriaEmail: typeof general.directorship_email === "string" ? general.directorship_email : "",
      horarioAtendimento: typeof general.office_hours === "string" ? general.office_hours : "",
      brasaoUrl: branding?.coat_of_arms_url ?? "",
      bandeiraUrl: typeof general.bandeira_url === "string" ? general.bandeira_url : "",
      logoUrl: branding?.logo_url ?? "",
      imagemHeroUrl: typeof general.imagem_hero_url === "string" ? general.imagem_hero_url : "",
      resumoPlanoDiretor: typeof general.resumo_plano_diretor === "string" ? general.resumo_plano_diretor : "",
      resumoUsoSolo: typeof general.resumo_uso_solo === "string" ? general.resumo_uso_solo : "",
      leisComplementares: typeof general.leis_complementares === "string" ? general.leis_complementares : "",
      linkPortalCliente:
        (typeof general.link_portal_cliente === "string" && general.link_portal_cliente) ||
        buildMunicipalityPortalUrl({
          subdomain: municipality.subdomain,
          customDomain: municipality.custom_domain ?? "",
        }),
      protocoloPrefixo: settings?.protocol_prefix ?? "SIG",
      guiaPrefixo: settings?.guide_prefix ?? "DAM",
      chavePix: readGeneralOptionalString(general, ["chave_pix", "pix_key"]),
      beneficiarioArrecadacao:
        readGeneralOptionalString(general, ["beneficiario_arrecadacao", "settlement_beneficiary"]) || municipalityName,
      contractNumber: typeof general.contract_number === "string" ? general.contract_number : "",
      contractStart: typeof general.contract_start === "string" ? general.contract_start : "",
      contractEnd: typeof general.contract_end === "string" ? general.contract_end : "",
      monthlyFee: typeof general.monthly_fee === "number" ? general.monthly_fee : 0,
      setupFee: typeof general.setup_fee === "number" ? general.setup_fee : 0,
      signatureMode:
        typeof general.signature_mode === "string" && ["eletronica", "manual", "icp_brasil"].includes(general.signature_mode)
          ? (general.signature_mode as TenantSettings["signatureMode"])
          : "eletronica",
      clientDeliveryLink:
        (typeof general.client_delivery_link === "string" && general.client_delivery_link) ||
        buildMunicipalityPortalUrl({
          subdomain: municipality.subdomain,
          customDomain: municipality.custom_domain ?? "",
        }),
      logoScale: typeof general.logo_scale === "number" ? general.logo_scale : 1,
      logoOffsetX: typeof general.logo_offset_x === "number" ? general.logo_offset_x : 0,
      logoOffsetY: typeof general.logo_offset_y === "number" ? general.logo_offset_y : 0,
      headerLogoScale: typeof general.header_logo_scale === "number" ? general.header_logo_scale : 1,
      headerLogoOffsetX: typeof general.header_logo_offset_x === "number" ? general.header_logo_offset_x : 0,
      headerLogoOffsetY: typeof general.header_logo_offset_y === "number" ? general.header_logo_offset_y : 0,
      footerLogoScale: typeof general.footer_logo_scale === "number" ? general.footer_logo_scale : 1,
      footerLogoOffsetX: typeof general.footer_logo_offset_x === "number" ? general.footer_logo_offset_x : 0,
      footerLogoOffsetY: typeof general.footer_logo_offset_y === "number" ? general.footer_logo_offset_y : 0,
      logoAlt: `Logo institucional de ${municipalityName}`,
      logoUpdatedAt: branding?.updated_at ?? "",
      logoUpdatedBy: "",
      logoFrameMode: "soft-square",
      logoFitMode: "contain",
      headerLogoFrameMode: "soft-square",
      headerLogoFitMode: "contain",
      footerLogoFrameMode: "soft-square",
      footerLogoFitMode: "contain",
      planoDiretorArquivoNome: readGeneralOptionalString(general, [
        "plano_diretor_arquivo_nome",
        "plan_file_name",
      ]),
      planoDiretorArquivoUrl: readGeneralOptionalString(general, ["plano_diretor_arquivo_url", "plan_file_url"]),
      usoSoloArquivoNome: readGeneralOptionalString(general, ["uso_solo_arquivo_nome", "zoning_file_name"]),
      usoSoloArquivoUrl: readGeneralOptionalString(general, ["uso_solo_arquivo_url", "zoning_file_url"]),
      leisArquivoNome: readGeneralOptionalString(general, ["leis_arquivo_nome", "complementary_laws_file_name"]),
      leisArquivoUrl: readGeneralOptionalString(general, ["leis_arquivo_url", "complementary_laws_file_url"]),
      adminContacts: normalizeAdminContacts(general.admin_contacts),
      taxaProtocolo: readGeneralNumber(general, ["taxa_protocolo", "fee_protocol"], 35.24),
      taxaIssPorMetroQuadrado: readGeneralNumber(general, ["taxa_iss_por_metro_quadrado", "fee_iss_m2"], 0),
      issRateProfiles:
        Array.isArray(general.iss_rate_profiles) && general.iss_rate_profiles.length > 0
          ? (general.iss_rate_profiles as TenantSettings["issRateProfiles"])
          : undefined,
      taxaAprovacaoFinal: readGeneralNumber(general, ["taxa_aprovacao_final", "fee_final_approval"], 0),
      approvalRateProfiles:
        Array.isArray(general.approval_rate_profiles) && general.approval_rate_profiles.length > 0
          ? (general.approval_rate_profiles as TenantSettings["approvalRateProfiles"])
          : undefined,
      registroProfissionalObrigatorio: settings?.require_professional_registration ?? true,
    };
  });

  const tenants: Tenant[] =
    mappedTenantsFromMunicipalities.length > 0 ? mappedTenantsFromMunicipalities : mappedTenantsFromLegacy;
  const tenantSettings: TenantSettings[] =
    mappedSettingsFromMunicipalities.length > 0 ? mappedSettingsFromMunicipalities : mappedSettingsFromLegacy;

  const userProfiles: UserProfile[] = (profilesResult.data ?? []).map((profile) => ({
    userId: profile.user_id,
    fullName: profile.full_name ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    cpfCnpj: profile.cpf_cnpj ?? "",
    rg: profile.rg ?? "",
    birthDate: profile.birth_date ?? "",
    professionalType: profile.professional_type ?? "",
    registrationNumber: profile.registration_number ?? "",
    companyName: profile.company_name ?? "",
    addressLine: profile.address_line ?? "",
    addressNumber: profile.address_number ?? "",
    addressComplement: profile.address_complement ?? "",
    neighborhood: profile.neighborhood ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    zipCode: profile.zip_code ?? "",
    avatarUrl: profile.avatar_url ?? "",
    avatarScale: Number(profile.avatar_scale ?? 1),
    avatarOffsetX: Number(profile.avatar_offset_x ?? 0),
    avatarOffsetY: Number(profile.avatar_offset_y ?? 0),
    useAvatarInHeader: Boolean(profile.use_avatar_in_header ?? false),
    bio: profile.bio ?? "",
  }));

  const sessionUsers: SessionUser[] = (membershipsResult.data ?? []).map((membership) => {
    const role = roleById.get(membership.role_id);
    const profile = profileByUser.get(membership.user_id);
    const roleCode = (role?.code ?? "profissional_externo") as SessionUser["role"];
    const accountStatus =
      membership.account_status === "blocked" || membership.blocked_at
        ? "blocked"
        : membership.account_status === "inactive" || membership.deleted_at
          ? "inactive"
          : "active";

    return {
      id: membership.user_id,
      name: profile?.full_name ?? profile?.email ?? "Usuario",
      role: roleCode,
      accessLevel: roleToAccessLevel(roleCode),
      tenantId: membership.tenant_id,
      municipalityId: profile?.municipality_id ?? membership.tenant_id,
      title: membership.department || membership.queue_name || membership.level_name || role?.label || "",
      email: profile?.email ?? "",
      accountStatus,
      userType:
        membership.user_type ??
        (roleCode === "profissional_externo" ||
        roleCode === "proprietario_consulta" ||
        roleCode === "property_owner"
          ? "Externo"
          : "Interno"),
      department: membership.department || membership.queue_name || membership.level_name || "",
      createdAt: membership.created_at ? new Date(membership.created_at).toLocaleString("pt-BR") : "",
      lastAccessAt: membership.last_access_at ? new Date(membership.last_access_at).toLocaleString("pt-BR") : "",
      blockedAt: membership.blocked_at ?? null,
      blockedBy: normalizeUuid(membership.blocked_by) ?? null,
      blockReason: membership.block_reason ?? null,
      deletedAt: membership.deleted_at ?? null,
    };
  });

  const processes: ProcessRecord[] = (processesResult.data ?? []).map((process) => {
    const property = propertyById.get(process.property_id);
    const guide = guidesByProcess.get(process.id);
    const parties = partiesByProcess.get(process.id) ?? [];
    const documents = docsByProcess.get(process.id) ?? [];
    const requirements = requirementsByProcess.get(process.id) ?? [];
    const auditEntries = auditByProcess.get(process.id) ?? [];
    const reopenEntries = reopenByProcess.get(process.id) ?? [];
    const movements = movementsByProcess.get(process.id) ?? [];
    const owner = parties.find((party) => party.party_type === "proprietario");
    const externalLead = parties.find((party) => party.party_type === "profissional_externo");

    return {
      id: process.id,
      tenantId: process.tenant_id,
      municipalityId: process.municipality_id ?? process.tenant_id,
      protocol: process.protocol_number,
      externalProtocol: process.external_protocol_number ?? process.protocol_number,
      title: process.title,
      type: process.process_type,
      status: process.status,
      ownerName: owner?.display_name ?? "Nao informado",
      ownerDocument: owner?.document_masked ?? "***",
      technicalLead: externalLead?.display_name ?? "Nao informado",
      createdBy: process.created_by,
      tags: [],
      address: property?.address ?? "Endereco nao informado",
      notes: "",
      property: {
        registration: property?.registry_code ?? "",
        iptu: property?.iptu_code ?? "",
        lot: property?.lot ?? "",
        block: property?.block ?? "",
        area: Number(property?.area_m2 ?? 0),
        usage: property?.usage_type ?? "",
      },
      triage: {
        status: (process.triage_status ?? "recebido") as ProcessRecord["triage"]["status"],
        assignedTo: process.triage_assigned_to ?? undefined,
        notes: process.triage_notes ?? undefined,
      },
      checklistType: process.checklist_type ?? process.process_type,
      sla: {
        currentStage: process.sla_stage ?? "Fluxo em andamento",
        dueDate: process.sla_due_at ? new Date(process.sla_due_at).toLocaleDateString("pt-BR") : "",
        hoursRemaining: process.sla_hours_remaining ?? 0,
        breached: Boolean(process.sla_breached),
      },
      reopenHistory: reopenEntries.map((entry) => ({
        id: entry.id,
        reason: entry.reason,
        actor: entry.actor_user_id ?? "Sistema",
        at: new Date(entry.created_at).toLocaleString("pt-BR"),
      })),
      documents: buildProcessDocuments(
        process.checklist_type ?? process.process_type,
        documents.map((document) => ({
          id: document.id,
          label: document.title,
          required: Boolean(document.is_required),
          uploaded: true,
          signed: false,
          reviewStatus: (document.review_status ?? "pendente") as "pendente" | "aprovado" | "rejeitado",
          reviewedBy: document.reviewed_by ?? undefined,
          annotations: Array.isArray(document.annotations) ? document.annotations : [],
          version: document.version ?? 1,
          source: (document.source ?? "profissional") as "profissional" | "prefeitura" | "integracao",
          fileName: document.file_name ?? undefined,
          mimeType: document.mime_type ?? undefined,
          sizeLabel: document.size_label ?? undefined,
          previewUrl: document.preview_url ?? undefined,
        })),
        process.tenant_id,
      ),
      requirements: requirements.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        createdAt: new Date(item.created_at).toLocaleString("pt-BR"),
        dueDate: item.due_at ? new Date(item.due_at).toLocaleDateString("pt-BR") : "",
        createdBy: item.created_by ?? "Sistema",
        targetName: item.target_name ?? "",
        response: item.response ?? undefined,
        respondedAt: item.responded_at ? new Date(item.responded_at).toLocaleString("pt-BR") : undefined,
        responseBy: item.response_by ?? undefined,
        visibility: item.visibility,
      })),
      timeline: movements.map((movement) => ({
        id: movement.id,
        title: movement.movement_type,
        detail: movement.description,
        actor: movement.actor_user_id ?? "Sistema",
        at: new Date(movement.created_at).toLocaleString("pt-BR"),
      })),
      auditTrail: auditEntries.map((entry) => ({
        id: entry.id,
        category: entry.category,
        title: entry.title,
        detail: entry.detail,
        actor: entry.actor_user_id ?? "Sistema",
        visibleToExternal: Boolean(entry.visible_to_external),
        at: new Date(entry.created_at).toLocaleString("pt-BR"),
      })),
      signatures: [],
      dispatches: [],
      messages: [],
      payment: {
        guideNumber: guide?.guide_number ?? "",
        amount: Number(guide?.amount ?? 0),
        status: guide?.status === "compensada" ? "compensada" : "pendente",
        dueDate: guide?.due_date ? new Date(guide.due_date).toLocaleDateString("pt-BR") : "",
        issuedAt: guide?.created_at ?? undefined,
        expiresAt: undefined,
      },
    };
  });

  return {
    tenants,
    tenantSettings,
    sessionUsers,
    userProfiles,
    ownerRequests,
    ownerLinks,
    ownerMessages,
    processes,
    plans,
    planAssignments,
  };
}

interface RegisterExternalAccountInput {
  tenantId: string;
  fullName: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  professionalType: string;
  registrationNumber: string;
  companyName: string;
  title: string;
  bio: string;
}

export async function registerRemoteExternalAccount(input: RegisterExternalAccountInput) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const scopeId = normalizeUuid(input.tenantId);
  if (!scopeId) {
    throw new Error("Prefeitura invalida para cadastro externo.");
  }

  const { data, error } = await supabase.rpc("register_external_account", {
    _tenant_id: scopeId,
    _full_name: input.fullName,
    _email: input.email,
    _cpf_cnpj: input.cpfCnpj || null,
    _phone: input.phone || null,
    _professional_type: input.professionalType || null,
    _registration_number: input.registrationNumber || null,
    _company_name: input.companyName || null,
    _title: input.title || null,
    _bio: input.bio || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function registerRemoteOwnerAccount(input: {
  tenantId: string;
  fullName: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  title?: string;
  bio?: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const scopeId = normalizeUuid(input.tenantId);
  if (!scopeId) {
    throw new Error("Prefeitura invalida para cadastro externo.");
  }

  const { data, error } = await supabase.rpc("register_property_owner_account", {
    _tenant_id: scopeId,
    _full_name: input.fullName,
    _email: input.email,
    _cpf_cnpj: input.cpfCnpj || null,
    _phone: input.phone || null,
    _title: input.title || null,
    _bio: input.bio || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function createRemoteOwnerRequest(input: {
  processId: string;
  ownerUserId: string;
  professionalUserId: string;
  ownerDocument: string;
  notes?: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const { data, error } = await supabase
    .from("project_owner_requests")
    .insert({
      process_id: input.processId,
      owner_user_id: input.ownerUserId,
      professional_user_id: input.professionalUserId,
      status: "pending",
      requested_at: new Date().toISOString(),
      notes: input.notes || null,
    })
    .select("*")
    .limit(1);

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("Falha ao criar solicitacao de responsavel.");
  }

  return {
    id: row.id,
    projectId: row.process_id,
    ownerUserId: row.owner_user_id,
    professionalUserId: row.professional_user_id,
    status: row.status ?? "pending",
    requestedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
    respondedAt: row.responded_at ?? null,
    respondedBy: row.responded_by ?? null,
    notes: row.notes ?? undefined,
  };
}

export async function respondRemoteOwnerRequest(input: {
  requestId: string;
  status: "pending" | "approved" | "rejected";
  professionalUserId: string;
  notes?: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const { data: requestData, error: requestError } = await supabase
    .from("project_owner_requests")
    .update({
      status: input.status,
      responded_at: new Date().toISOString(),
      responded_by: input.professionalUserId,
      notes: input.notes || null,
    })
    .eq("id", input.requestId)
    .select("*")
    .limit(1);

  if (requestError) {
    throw requestError;
  }

  const requestRow = Array.isArray(requestData) ? requestData[0] : null;
  if (!requestRow) {
    throw new Error("Falha ao atualizar solicitacao de responsavel.");
  }

  let linkData: any | null = null;

  if (input.status === "approved") {
    const { data, error } = await supabase
      .from("project_owner_links")
      .insert({
        project_id: requestData.process_id,
        owner_user_id: requestData.owner_user_id,
        professional_user_id: requestData.professional_user_id,
        chat_enabled: true,
        linked_at: new Date().toISOString(),
        linked_by: input.professionalUserId,
      })
      .select("*")
      .limit(1);

    if (error) {
      throw error;
    }

    linkData = Array.isArray(data) ? data[0] : null;
  }

  const request = {
    id: requestRow.id,
    projectId: requestRow.process_id,
    ownerUserId: requestRow.owner_user_id,
    professionalUserId: requestRow.professional_user_id,
    status: requestRow.status ?? "pending",
    requestedAt: requestRow.requested_at ?? requestRow.created_at ?? new Date().toISOString(),
    respondedAt: requestRow.responded_at ?? null,
    respondedBy: requestRow.responded_by ?? null,
    notes: requestRow.notes ?? undefined,
  };

  const link = linkData
    ? {
        id: linkData.id,
        projectId: linkData.project_id,
        ownerUserId: linkData.owner_user_id,
        professionalUserId: linkData.professional_user_id,
        chatEnabled: linkData.chat_enabled ?? true,
        linkedAt: linkData.linked_at ?? linkData.created_at ?? new Date().toISOString(),
        linkedBy: linkData.linked_by ?? null,
      }
    : null;

  return { request, link };
}

export async function setRemoteOwnerChatEnabled(input: {
  linkId: string;
  enabled: boolean;
  actor: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const { data, error } = await supabase
    .from("project_owner_links")
    .update({ chat_enabled: input.enabled })
    .eq("id", input.linkId)
    .select("*")
    .limit(1);

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("Falha ao atualizar chat do responsavel.");
  }

  return {
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    professionalUserId: row.professional_user_id,
    chatEnabled: row.chat_enabled ?? true,
    linkedAt: row.linked_at ?? row.created_at ?? new Date().toISOString(),
    linkedBy: row.linked_by ?? null,
  };
}

export async function createRemoteOwnerMessage(input: {
  projectId: string;
  ownerUserId: string;
  professionalUserId: string;
  senderUserId: string;
  message: string;
  isSystemMessage?: boolean;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const { data, error } = await supabase
    .from("owner_professional_messages")
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      professional_user_id: input.professionalUserId,
      sender_user_id: input.senderUserId,
      message: input.message,
      is_system_message: input.isSystemMessage ?? false,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .limit(1);

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("Falha ao criar mensagem de responsavel.");
  }

  return {
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    professionalUserId: row.professional_user_id,
    senderUserId: row.sender_user_id,
    message: row.message,
    createdAt: row.created_at ?? new Date().toISOString(),
    readAt: row.read_at ?? null,
    isSystemMessage: row.is_system_message ?? false,
  };
}

export async function createRemoteExternalProcess(
  input: CreateProcessInput & {
    guidePrefix?: string;
  },
) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const scopeId = normalizeUuid(input.tenantId);
  if (!scopeId) {
    throw new Error("Escopo municipal invalido para protocolar o processo.");
  }

  const { data, error } = await supabase.rpc("create_external_process", {
    _tenant_id: scopeId,
    _title: input.title,
    _process_type: input.type,
    _address: input.address,
    _iptu_code: input.property.iptu,
    _registry_code: input.property.registration || null,
    _lot: input.property.lot || null,
    _block: input.property.block || null,
    _area_m2: input.property.area || null,
    _usage_type: input.property.usage || null,
    _owner_name: input.ownerName,
    _owner_document: input.ownerDocument,
    _technical_lead: input.technicalLead,
    _notes: input.notes || null,
    _documents: input.documents.map((document) => ({
      label: document.label,
      required: document.required,
      signed: document.signed,
      version: document.version,
      source: document.source,
      fileName: document.fileName,
      filePath: document.filePath,
      mimeType: document.mimeType,
      sizeLabel: document.sizeLabel,
      previewUrl: document.previewUrl,
      reviewStatus: document.reviewStatus ?? "pendente",
      annotations: document.annotations ?? [],
    })),
    _guide_prefix: input.guidePrefix || "DAM",
  });

  if (error) {
    throw error;
  }

  return data as {
    process_id: string;
    protocol_number: string;
    guide_number: string;
    due_date: string;
    amount: number;
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadFileToStorage(input: {
  bucket: "process-documents" | "profile-assets" | "institutional-branding";
  tenantId?: string | null;
  userId: string;
  file: File;
  folder: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const scopeId = normalizeUuid(input.tenantId);
  if (!scopeId) {
    throw new Error("Escopo municipal invalido para upload.");
  }

  const safeName = sanitizeFileName(input.file.name);
  const folder = normalizeMunicipalityStorageFolder(input.folder, input.bucket);
  const objectKey = `municipalities/${scopeId}/${folder}/${input.userId}/${crypto.randomUUID()}-${safeName}`;
  const bucket =
    input.bucket === "process-documents"
      ? (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS || "sigapro-documentos")
      : (import.meta.env.VITE_R2_BUCKET_LOGOS || "sigapro-logos");

  const uploaded = await uploadFile({
    bucket,
    objectKey,
    file: input.file,
  });

  return {
    path: uploaded.objectKey,
    publicUrl: uploaded.publicUrl,
  };
}

export async function uploadInstitutionalBrandingAsset(input: {
  tenantId?: string;
  subdomain?: string;
  file: File;
  /** "header-logo" | "footer-logo" | "logo" */
  assetKey?: string;
}) {
  let scopeId = normalizeUuid(input.tenantId ?? "");

  if (!scopeId && input.subdomain && supabase) {
    const normalized = buildMunicipalitySlug(input.subdomain);
    if (normalized) {
      console.log("[SIGAPRO][R2] Resolvendo municipio por subdomain para upload", {
        subdomain: normalized,
      });
      const { data, error } = await supabase
        .from("municipalities")
        .select("id")
        .eq("subdomain", normalized)
        .maybeSingle();
      if (!error && data?.id) {
        scopeId = data.id;
      }
    }
  }

  if (!scopeId) {
    const msg =
      "Escopo municipal invalido para o branding institucional. " +
      `tenantId=${input.tenantId ?? ""} subdomain=${input.subdomain ?? ""}`;
    console.error("[SIGAPRO][R2] " + msg);
    throw new Error(msg);
  }

  const extension = input.file.name.split(".").pop()?.toLowerCase() || "png";
  const assetKey = input.assetKey ?? "logo";
  // Caminho: municipalities/{id}/branding/{header-logo|footer-logo|logo}.{ext}
  const objectKey = `municipalities/${scopeId}/branding/${assetKey}.${extension}`;
  const bucket =
    (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
    "sigapro-logos";

  console.log("[SIGAPRO][R2] Iniciando upload do branding", {
    scopeId,
    assetKey,
    objectKey,
    bucket,
    fileName: input.file.name,
    fileSize: input.file.size,
    mimeType: input.file.type,
  });

  const uploaded = await uploadFile({
    bucket,
    objectKey,
    file: input.file,
  });

  const basePublicUrl = (uploaded.publicUrl || "").trim();
  const publicUrl = basePublicUrl ? `${basePublicUrl}?v=${Date.now()}` : "";

  console.log("[SIGAPRO][R2] Upload concluido", {
    scopeId,
    assetKey,
    objectKey: uploaded.objectKey,
    publicUrl,
  });

  return {
    path: uploaded.objectKey,
    publicUrl,
    bucket: uploaded.bucket,
    objectKey: uploaded.objectKey,
    fileName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    fileSize: input.file.size,
  };
}

export async function uploadPlatformBrandingAsset(input: {
  file: File;
  /** "header-logo" | "footer-logo" | "logo" */
  assetKey?: string;
}) {
  const extension = input.file.name.split(".").pop()?.toLowerCase() || "png";
  const assetKey = input.assetKey ?? "master-logo";
  const objectKey = `platform/branding/${assetKey}.${extension}`;
  const bucket =
    (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
    "sigapro-logos";

  console.log("[SIGAPRO][R2] Iniciando upload do branding master", {
    assetKey,
    objectKey,
    bucket,
    fileName: input.file.name,
    fileSize: input.file.size,
    mimeType: input.file.type,
  });

  const uploaded = await uploadFile({
    bucket,
    objectKey,
    file: input.file,
  });

  const basePublicUrl = (uploaded.publicUrl || "").trim();
  const publicUrl = basePublicUrl ? `${basePublicUrl}?v=${Date.now()}` : "";

  console.log("[SIGAPRO][R2] Upload master concluido", {
    assetKey,
    objectKey: uploaded.objectKey,
    publicUrl,
  });

  return {
    path: uploaded.objectKey,
    publicUrl,
    bucket: uploaded.bucket,
    objectKey: uploaded.objectKey,
    fileName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    fileSize: input.file.size,
  };
}

const PLATFORM_BRANDING_KEY = "sigapro";
let platformBrandingUnavailable = false;

export type PlatformBrandingRecord = {
  platformKey: string;
  headerLogoUrl: string;
  headerLogoObjectKey: string;
  headerLogoFileName: string;
  headerLogoMimeType: string;
  footerLogoUrl: string;
  footerLogoObjectKey: string;
  footerLogoFileName: string;
  footerLogoMimeType: string;
  updatedAt: string;
  updatedBy: string;
};

function mapPlatformBranding(record: any): PlatformBrandingRecord {
  return {
    platformKey: record.platform_key ?? PLATFORM_BRANDING_KEY,
    headerLogoUrl: record.header_logo_url ?? "",
    headerLogoObjectKey: record.header_logo_object_key ?? "",
    headerLogoFileName: record.header_logo_file_name ?? "",
    headerLogoMimeType: record.header_logo_mime_type ?? "",
    footerLogoUrl: record.footer_logo_url ?? "",
    footerLogoObjectKey: record.footer_logo_object_key ?? "",
    footerLogoFileName: record.footer_logo_file_name ?? "",
    footerLogoMimeType: record.footer_logo_mime_type ?? "",
    updatedAt: record.updated_at ?? "",
    updatedBy: record.updated_by ?? "",
  };
}

export async function loadPlatformBranding(): Promise<PlatformBrandingRecord | null> {
  if (!supabase) return null;
  if (platformBrandingUnavailable) return null;
  const { data, error } = await supabase
    .from("platform_branding")
    .select("*")
    .eq("platform_key", PLATFORM_BRANDING_KEY)
    .limit(1);

  if (error) {
    if ("status" in error && error.status === 404) {
      platformBrandingUnavailable = true;
      return null;
    }
    if (isMissingRelationError(error, "public.platform_branding")) {
      platformBrandingUnavailable = true;
      return null;
    }
    console.warn("[PlatformBranding] Falha ao carregar", { error });
    return null;
  }

  if (!data || data.length === 0) return null;
  platformBrandingUnavailable = false;
  return mapPlatformBranding(data[0]);
}

export async function savePlatformBranding(input: {
  variant: "header" | "footer";
  objectKey: string;
  fileName: string;
  mimeType: string;
  publicUrl?: string;
  updatedBy?: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const normalizedObjectKey = input.objectKey?.trim();
  if (!normalizedObjectKey) {
    throw new Error("Object key do logo da plataforma não informado.");
  }

  const payload: Record<string, unknown> = {
    platform_key: PLATFORM_BRANDING_KEY,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? null,
  };

  if (input.variant === "header") {
    payload.header_logo_url = input.publicUrl ?? null;
    payload.header_logo_object_key = normalizedObjectKey;
    payload.header_logo_file_name = input.fileName;
    payload.header_logo_mime_type = input.mimeType;
  } else {
    payload.footer_logo_url = input.publicUrl ?? null;
    payload.footer_logo_object_key = normalizedObjectKey;
    payload.footer_logo_file_name = input.fileName;
    payload.footer_logo_mime_type = input.mimeType;
  }

  console.log("[PlatformBrandingSave] Payload", { payload, variant: input.variant });

  const result = await upsertWithColumnRetry("platform_branding", payload, "platform_key");

  if (result.error) {
    if (isMissingRelationError(result.error, "public.platform_branding")) {
      throw new Error("Tabela platform_branding inexistente.");
    }
    throw result.error;
  }
  platformBrandingUnavailable = false;

  return result.data ?? null;
}

export async function getMunicipalityBrandingSafe(municipalityId: string) {
  console.log("[DIAGNOSTICO] Buscando branding para:", municipalityId);

  if (!supabase) {
    console.error("[DIAGNOSTICO] Supabase indisponivel.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("municipality_branding")
      .select("*")
      .eq("municipality_id", municipalityId)
      .limit(1);

  console.log("[DIAGNOSTICO] Resultado bruto:", { data, error });

  if (error) {
    console.error("[DIAGNOSTICO] ERRO SUPABASE:", error);
    return null;
  }

  if (data && data.length > 0) {
    console.log("[BrandingLoad] Branding encontrado", {
      municipalityId,
      headerLogoObjectKey: data[0]?.header_logo_object_key,
      footerLogoObjectKey: data[0]?.footer_logo_object_key,
    });
  }

    if (!data || data.length === 0) {
      console.warn("[DIAGNOSTICO] Nenhum branding encontrado");

      const { data: created, error: createError } = await supabase
        .from("municipality_branding")
        .insert([
          {
            municipality_id: municipalityId,
            created_at: new Date().toISOString(),
          },
        ])
        .select("*")
        .limit(1);

      console.log("[DIAGNOSTICO] Criado:", { created, createError });

      if (createError) {
        console.error("[DIAGNOSTICO] ERRO CREATE:", createError);
        return null;
      }

      return created?.[0] ?? null;
    }

    return data[0];
  } catch (err) {
    console.error("[DIAGNOSTICO] ERRO GERAL:", err);
    return null;
  }
}

export async function saveRemoteProfile(profile: UserProfile) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const payload: Record<string, unknown> = {
    id: profile.userId,
    user_id: profile.userId,
    full_name: profile.fullName,
    email: profile.email,
    phone: profile.phone || null,
    cpf_cnpj: profile.cpfCnpj || null,
    rg: profile.rg || null,
    birth_date: profile.birthDate || null,
    professional_type: profile.professionalType || null,
    registration_number: profile.registrationNumber || null,
    company_name: profile.companyName || null,
    address_line: profile.addressLine || null,
    address_number: profile.addressNumber || null,
    neighborhood: profile.neighborhood || null,
    city: profile.city || null,
    state: profile.state || null,
    zip_code: profile.zipCode || null,
    avatar_url: profile.avatarUrl || null,
    avatar_scale: profile.avatarScale ?? 1,
    avatar_offset_x: profile.avatarOffsetX ?? 0,
    avatar_offset_y: profile.avatarOffsetY ?? 0,
    use_avatar_in_header: profile.useAvatarInHeader ?? false,
    bio: profile.bio || null,
  };

  let currentPayload = { ...payload };
  let error: { message?: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await supabase.from("profiles").upsert(currentPayload, { onConflict: "user_id" });
    error = result.error;

    if (!error) {
      return;
    }

    if (!isMissingColumnError(error)) {
      break;
    }

    const missingColumn = getMissingColumnName(error);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      break;
    }

    delete currentPayload[missingColumn];
  }

  if (error) {
    throw new Error(error.message || "Falha ao salvar o perfil no banco.");
  }
}

export async function linkExistingUserToMunicipalityAdmin(input: {
  email: string;
  municipalityId: string;
  fullName?: string;
  title?: string;
  accessLevel?: 2 | 3;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const municipalityId = normalizeUuid(input.municipalityId);
  if (!normalizedEmail) {
    throw new Error("Informe um e-mail válido para vincular o administrador da prefeitura.");
  }
  if (!municipalityId) {
    throw new Error("Prefeitura inválida para vincular o administrador.");
  }

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, full_name, email, municipality_id, deleted_at")
    .eq("email", normalizedEmail)
    .is("deleted_at", null)
    .limit(2);

  if (profileError) {
    throw new Error(profileError.message || "Falha ao localizar o usuário pelo e-mail informado.");
  }

  const profileRecord = (profileRows ?? [])[0];
  if (!profileRecord?.user_id) {
    return {
      email: normalizedEmail,
      linked: false,
      reason: "not_found" as const,
    };
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("roles")
    .select("id, code, label")
    .in("code", ["prefeitura_admin", "admin_municipality"])
    .limit(5);

  if (roleError) {
    throw new Error(roleError.message || "Falha ao localizar o papel de administrador da prefeitura.");
  }

  const roleRecord =
    (roleRows ?? []).find((item) => item.code === "prefeitura_admin") ??
    (roleRows ?? []).find((item) => item.code === "admin_municipality");

  if (!roleRecord?.id) {
    throw new Error("O papel de administrador da prefeitura não está disponível no banco.");
  }

  const title = input.title?.trim() || roleRecord.label || "Administrador da Prefeitura";
  const accessLevel = input.accessLevel && input.accessLevel >= 3 ? 3 : 2;

  const membershipPayload: Record<string, unknown> = {
    tenant_id: municipalityId,
    user_id: profileRecord.user_id,
    role_id: roleRecord.id,
    department: title,
    queue_name: title,
    level_name: `Nível ${accessLevel}`,
    is_active: true,
    deleted_at: null,
    account_status: "active",
    blocked_at: null,
    blocked_by: null,
    block_reason: null,
    user_type: "Interno",
  };

  const { error: membershipError } = await upsertWithColumnRetry(
    "tenant_memberships",
    membershipPayload,
    "tenant_id,user_id,role_id",
  );

  if (membershipError) {
    throw new Error(membershipError.message || "Falha ao criar o vínculo institucional do administrador.");
  }

  const profilePayload: Record<string, unknown> = {
    user_id: profileRecord.user_id,
    municipality_id: municipalityId,
    role: roleRecord.code,
    email: normalizedEmail,
    full_name: input.fullName?.trim() || profileRecord.full_name || normalizedEmail,
  };

  const { error: profileUpdateError } = await upsertWithColumnRetry(
    "profiles",
    profilePayload,
    "user_id",
  );

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message || "Falha ao atualizar o perfil institucional do administrador.");
  }

  return {
    email: normalizedEmail,
    linked: true,
    userId: profileRecord.user_id,
    municipalityId,
    role: roleRecord.code,
  };
}

export async function upsertRemoteInstitution(input: {
  institutionId?: string;
  tenantId?: string;
  name: string;
  city: string;
  state: string;
  status: string;
  subdomain: string;
  cnpj: string;
  primaryColor: string;
  accentColor: string;
  secretariat: string;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const normalizedName = input.name.trim();
  const normalizedCity = input.city.trim();
  const normalizedState = input.state.trim().toUpperCase();
  const normalizedSubdomain = buildMunicipalitySlug(input.subdomain);

  if (!normalizedName) {
    throw new Error("O nome da prefeitura é obrigatório para sincronizar com o Supabase.");
  }

  if (!normalizedCity) {
    throw new Error("A cidade da prefeitura é obrigatória para sincronizar com o Supabase.");
  }

  if (!normalizedState) {
    throw new Error("O estado da prefeitura é obrigatório para sincronizar com o Supabase.");
  }

  const tenantId = normalizeUuid(input.institutionId ?? input.tenantId) ?? crypto.randomUUID();
  const municipalitySlug = buildMunicipalitySlug(input.subdomain || input.city || input.name);

  const municipalityPayload: Record<string, unknown> = {
    id: tenantId,
    name: normalizedName,
    official_name: normalizedName,
    display_name: normalizedName,
    city: normalizedCity,
    state: normalizedState,
    slug: municipalitySlug,
    subdomain: normalizedSubdomain,
    status: normalizeMunicipalityStatus(input.status),
    secretariat_name: input.secretariat || null,
    email: null,
    contact_email: null,
    phone: null,
    contact_phone: null,
    address: null,
    updated_at: new Date().toISOString(),
  };

  const { error: municipalityError } = await upsertWithColumnRetry(
    "municipalities",
    municipalityPayload,
    "id",
  );

  if (!municipalityError) {
    const { error: municipalityBrandingError } = await upsertWithColumnRetry(
      "municipality_branding",
      {
        municipality_id: tenantId,
        primary_color: input.primaryColor,
        accent_color: input.accentColor,
        official_header_text: normalizedName,
      },
      "municipality_id",
    );

    const { error: municipalitySettingsError } = await upsertWithColumnRetry(
      "municipality_settings",
      {
        municipality_id: tenantId,
        protocol_prefix: "PM",
        guide_prefix: "DAM",
      },
      "municipality_id",
    );

    const municipalityErrors = [
      isMissingRelationError(municipalityBrandingError, "public.municipality_branding") ? null : municipalityBrandingError,
      isMissingRelationError(municipalitySettingsError, "public.municipality_settings") ? null : municipalitySettingsError,
    ].filter(Boolean);

    if (municipalityErrors.length === 0) {
      return { id: tenantId };
    }

    throw municipalityErrors[0];
  }

  if (!isMissingRelationError(municipalityError, "public.municipalities")) {
    throw municipalityError;
  }

  const { error: tenantError } = await supabase.from("tenants").upsert(
    {
      id: tenantId,
      legal_name: normalizedName,
      display_name: normalizedName,
      cnpj: input.cnpj,
      city: normalizedCity,
      state: normalizedState,
      status: input.status,
      subdomain: normalizedSubdomain || municipalitySlug,
    },
    { onConflict: "id" },
  );
  if (tenantError) throw tenantError;

  const { error: brandingError } = await supabase.from("tenant_branding").upsert(
    {
      tenant_id: tenantId,
      primary_color: input.primaryColor,
      accent_color: input.accentColor,
      hero_title: input.name,
      hero_subtitle: input.secretariat || null,
    },
    { onConflict: "tenant_id" },
  );
  if (brandingError) throw brandingError;

  return { id: tenantId };
}

export async function upsertRemoteTenant(input: {
  tenantId?: string;
  name: string;
  city: string;
  state: string;
  status: string;
  subdomain: string;
  cnpj: string;
  primaryColor: string;
  accentColor: string;
  secretariat: string;
}) {
  return upsertRemoteInstitution(input);
}

export async function saveRemoteInstitutionSettings(
  settings: TenantSettings & {
    institutionId?: string | null;
    // campos extras injetados pelo fluxo de branding
    headerLogoUrl?: string;
    footerLogoUrl?: string;
    headerLogoObjectKey?: string;
    footerLogoObjectKey?: string;
    headerLogoFileName?: string;
    footerLogoFileName?: string;
    headerLogoMimeType?: string;
    footerLogoMimeType?: string;
  },
  options?: {
    skipMunicipalityUpdate?: boolean;
    skipMunicipalitySettings?: boolean;
  },
) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const remoteTenantId = normalizeUuid(
    settings.institutionId ?? settings.tenantId,
  );
  if (!remoteTenantId) {
    console.error(
      "[SIGAPRO][Supabase] saveRemoteInstitutionSettings: tenantId invalido",
      {
        institutionId: settings.institutionId,
        tenantId: settings.tenantId,
      },
    );
    throw new Error("Tenant inválido para salvar o branding institucional.");
  }

  console.log("[SIGAPRO][Supabase] Salvando branding institucional", {
    remoteTenantId,
    logoUrl: settings.logoUrl,
    headerLogoUrl: settings.headerLogoUrl,
    footerLogoUrl: settings.footerLogoUrl,
    logoStorageProvider: settings.logoStorageProvider,
    headerLogoObjectKey: settings.headerLogoObjectKey,
    footerLogoObjectKey: settings.footerLogoObjectKey,
  });

  // ------------------------------------------------------------------
  // 1. municipality_branding — inclui header/footer logo separados
  // ------------------------------------------------------------------
  const municipalityBrandingPayload: Record<string, unknown> = {
    municipality_id: remoteTenantId,
    // logo por variante
    header_logo_url: settings.headerLogoUrl || null,
    header_logo_object_key: settings.headerLogoObjectKey || null,
    header_logo_file_name: settings.headerLogoFileName || null,
    header_logo_mime_type: settings.headerLogoMimeType || null,
    footer_logo_url: settings.footerLogoUrl || null,
    footer_logo_object_key: settings.footerLogoObjectKey || null,
    footer_logo_file_name: settings.footerLogoFileName || null,
    footer_logo_mime_type: settings.footerLogoMimeType || null,
    updated_at: new Date().toISOString(),
  };

  // ------------------------------------------------------------------
  // 2. municipality_settings — geral_settings inclui escalas por variante
  // ------------------------------------------------------------------
  const municipalitySettingsPayload = {
    municipality_id: remoteTenantId,
    protocol_prefix: settings.protocoloPrefixo || null,
    guide_prefix: settings.guiaPrefixo || null,
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
    require_professional_registration:
      settings.registroProfissionalObrigatorio ?? true,
    allow_digital_protocol: true,
    allow_walkin_protocol: false,
    general_settings: {
      admin_contacts: settings.adminContacts ?? [],
      cnpj: settings.cnpj || null,
      site: settings.site || null,
      directorship: settings.diretoriaResponsavel || null,
      directorship_phone: settings.diretoriaTelefone || null,
      directorship_email: settings.diretoriaEmail || null,
      office_hours: settings.horarioAtendimento || null,
      pix_key: settings.chavePix || null,
      chave_pix: settings.chavePix || null,
      settlement_beneficiary: settings.beneficiarioArrecadacao || null,
      beneficiario_arrecadacao: settings.beneficiarioArrecadacao || null,
      contract_number: settings.contractNumber || null,
      contract_start: settings.contractStart || null,
      contract_end: settings.contractEnd || null,
      monthly_fee: settings.monthlyFee ?? 0,
      setup_fee: settings.setupFee ?? 0,
      signature_mode: settings.signatureMode || "eletronica",
      client_delivery_link: settings.clientDeliveryLink || null,
      plan_file_name: settings.planoDiretorArquivoNome || null,
      plan_file_url: settings.planoDiretorArquivoUrl || null,
      plano_diretor_arquivo_nome: settings.planoDiretorArquivoNome || null,
      plano_diretor_arquivo_url: settings.planoDiretorArquivoUrl || null,
      zoning_file_name: settings.usoSoloArquivoNome || null,
      zoning_file_url: settings.usoSoloArquivoUrl || null,
      uso_solo_arquivo_nome: settings.usoSoloArquivoNome || null,
      uso_solo_arquivo_url: settings.usoSoloArquivoUrl || null,
      complementary_laws_file_name: settings.leisArquivoNome || null,
      complementary_laws_file_url: settings.leisArquivoUrl || null,
      leis_arquivo_nome: settings.leisArquivoNome || null,
      leis_arquivo_url: settings.leisArquivoUrl || null,
      fee_protocol: settings.taxaProtocolo ?? 35.24,
      taxa_protocolo: settings.taxaProtocolo ?? 35.24,
      fee_iss_m2: settings.taxaIssPorMetroQuadrado ?? 0,
      taxa_iss_por_metro_quadrado: settings.taxaIssPorMetroQuadrado ?? 0,
      iss_rate_profiles: settings.issRateProfiles ?? null,
      fee_final_approval: settings.taxaAprovacaoFinal ?? 0,
      taxa_aprovacao_final: settings.taxaAprovacaoFinal ?? 0,
      approval_rate_profiles: settings.approvalRateProfiles ?? null,
      // escalas por variante no general_settings para leitura futura
      logo_scale: settings.logoScale ?? 1,
      logo_offset_x: settings.logoOffsetX ?? 0,
      logo_offset_y: settings.logoOffsetY ?? 0,
      header_logo_scale: settings.headerLogoScale ?? settings.logoScale ?? 1,
      header_logo_offset_x:
        settings.headerLogoOffsetX ?? settings.logoOffsetX ?? 0,
      header_logo_offset_y:
        settings.headerLogoOffsetY ?? settings.logoOffsetY ?? 0,
      footer_logo_scale: settings.footerLogoScale ?? settings.logoScale ?? 1,
      footer_logo_offset_x:
        settings.footerLogoOffsetX ?? settings.logoOffsetX ?? 0,
      footer_logo_offset_y:
        settings.footerLogoOffsetY ?? settings.logoOffsetY ?? 0,
      logo_storage_provider: settings.logoStorageProvider || null,
      logo_bucket: settings.logoBucket || null,
      logo_object_key: settings.logoObjectKey || null,
      logo_file_name: settings.logoFileName || null,
      logo_file_size: settings.logoFileSize ?? null,
    },
  };

  // ------------------------------------------------------------------
  // 3. municipalities — dados gerais da prefeitura
  // ------------------------------------------------------------------
  const municipalityUpdatePayload = {
    id: remoteTenantId,
    secretariat_name: settings.secretariaResponsavel || null,
    email: settings.email || null,
    contact_email: settings.email || null,
    phone: settings.telefone || null,
    contact_phone: settings.telefone || null,
    address: settings.endereco || null,
    custom_domain: settings.site || null,
  };

  // Executa as três operações
  const municipalityUpdateResult = options?.skipMunicipalityUpdate
    ? { error: null }
    : await withTimeout(
        upsertWithColumnRetry("municipalities", municipalityUpdatePayload, "id"),
        "municipalities upsert",
        12000,
      );

  const municipalitySettingsResult = options?.skipMunicipalitySettings
    ? { error: null }
    : await withTimeout(
        upsertWithColumnRetry(
          "municipality_settings",
          municipalitySettingsPayload,
          "municipality_id",
        ),
        "municipality_settings upsert",
        12000,
      );

  // municipality_branding com retry para colunas ausentes (colunas header/footer
  // podem não existir em bancos mais antigos — graceful degradation)
  const upsertMunicipalityBranding = async () => {
    let currentPayload: Record<string, unknown> = {
      ...municipalityBrandingPayload,
    };
    let lastError: { message?: string } | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await supabase
        .from("municipality_branding")
        .upsert(currentPayload, { onConflict: "municipality_id" });
      lastError = result.error;

      if (!lastError) {
        console.log(
          "[SIGAPRO][Supabase] municipality_branding salvo com sucesso",
          { attempt },
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("sigapro-branding-updated", {
              detail: { municipalityId: remoteTenantId },
            }),
          );
        }
        return result;
      }

      if (!isMissingColumnError(lastError)) break;

      const missingColumn = getMissingColumnName(lastError);
      if (!missingColumn || !(missingColumn in currentPayload)) break;

      console.warn(
        "[SIGAPRO][Supabase] Coluna ausente em municipality_branding, removendo e tentando novamente",
        { missingColumn },
      );
      delete currentPayload[missingColumn];
    }

    return { error: lastError };
  };

  const municipalityBrandingResult = await withTimeout(
    upsertMunicipalityBranding(),
    "municipality_branding upsert",
    12000,
  );

  const municipalityUpdateMissing = isMissingRelationError(
    municipalityUpdateResult.error,
    "public.municipalities",
  );
  const municipalitySettingsMissing =
    options?.skipMunicipalitySettings
      ? false
      : isMissingRelationError(
          municipalitySettingsResult.error,
          "public.municipality_settings",
        );
  const municipalityBrandingMissing = isMissingRelationError(
    municipalityBrandingResult.error,
    "public.municipality_branding",
  );

  const municipalityErrors = [
    municipalityUpdateMissing ? null : municipalityUpdateResult.error,
    municipalitySettingsMissing ? null : municipalitySettingsResult.error,
    municipalityBrandingMissing ? null : municipalityBrandingResult.error,
  ].filter(Boolean);

  if (municipalityErrors.length === 0) {
    console.log(
      "[SIGAPRO][Supabase] Branding salvo com sucesso via municipalities",
      {
        remoteTenantId,
      },
    );
    return;
  }

  const onlyMissingRelations =
    municipalityUpdateMissing &&
    municipalitySettingsMissing &&
    municipalityBrandingMissing;

  if (!onlyMissingRelations) {
    const firstError = municipalityErrors[0];
    const formatted = formatSupabaseError(firstError);
    console.error("[SIGAPRO][Supabase] Falha ao salvar branding", {
      remoteTenantId,
      error: formatted,
    });
    throw new Error(formatted);
  }

  // ------------------------------------------------------------------
  // Fallback: tenant_settings / tenant_branding (schema legado)
  // ------------------------------------------------------------------
  console.warn(
    "[SIGAPRO][Supabase] Tabelas municipality_* ausentes. Tentando fallback tenant_*",
  );

  const settingsPayload = {
    tenant_id: remoteTenantId,
    cnpj: settings.cnpj || null,
    endereco: settings.endereco || null,
    telefone: settings.telefone || null,
    email: settings.email || null,
    site: settings.site || null,
    secretaria_responsavel: settings.secretariaResponsavel || null,
    diretoria_responsavel: settings.diretoriaResponsavel || null,
    diretoria_telefone: settings.diretoriaTelefone || null,
    diretoria_email: settings.diretoriaEmail || null,
    horario_atendimento: settings.horarioAtendimento || null,
    brasao_url: settings.brasaoUrl || null,
    bandeira_url: settings.bandeiraUrl || null,
    logo_url: settings.logoUrl || null,
    imagem_hero_url: settings.imagemHeroUrl || null,
    resumo_plano_diretor: settings.resumoPlanoDiretor || null,
    resumo_uso_solo: settings.resumoUsoSolo || null,
    leis_complementares: settings.leisComplementares || null,
    link_portal_cliente: settings.linkPortalCliente || null,
    protocolo_prefixo: settings.protocoloPrefixo || null,
    guia_prefixo: settings.guiaPrefixo || null,
    chave_pix: settings.chavePix || null,
    beneficiario_arrecadacao: settings.beneficiarioArrecadacao || null,
    contract_number: settings.contractNumber || null,
    contract_start: settings.contractStart || null,
    contract_end: settings.contractEnd || null,
    monthly_fee: settings.monthlyFee ?? 0,
    setup_fee: settings.setupFee ?? 0,
    signature_mode: settings.signatureMode || "eletronica",
    client_delivery_link: settings.clientDeliveryLink || null,
    plano_diretor_arquivo_nome: settings.planoDiretorArquivoNome || null,
    plano_diretor_arquivo_url: settings.planoDiretorArquivoUrl || null,
    uso_solo_arquivo_nome: settings.usoSoloArquivoNome || null,
    uso_solo_arquivo_url: settings.usoSoloArquivoUrl || null,
    leis_arquivo_nome: settings.leisArquivoNome || null,
    leis_arquivo_url: settings.leisArquivoUrl || null,
    logo_scale: settings.logoScale ?? 1,
    logo_offset_x: settings.logoOffsetX ?? 0,
    logo_offset_y: settings.logoOffsetY ?? 0,
    header_logo_scale: settings.headerLogoScale ?? settings.logoScale ?? 1,
    header_logo_offset_x:
      settings.headerLogoOffsetX ?? settings.logoOffsetX ?? 0,
    header_logo_offset_y:
      settings.headerLogoOffsetY ?? settings.logoOffsetY ?? 0,
    footer_logo_scale: settings.footerLogoScale ?? settings.logoScale ?? 1,
    footer_logo_offset_x:
      settings.footerLogoOffsetX ?? settings.logoOffsetX ?? 0,
    footer_logo_offset_y:
      settings.footerLogoOffsetY ?? settings.logoOffsetY ?? 0,
    logo_alt: settings.logoAlt || null,
    logo_updated_at: settings.logoUpdatedAt || null,
    logo_updated_by: normalizeUuid(settings.logoUpdatedBy),
    logo_frame_mode: settings.logoFrameMode || "soft-square",
    logo_fit_mode: settings.logoFitMode || "contain",
    header_logo_frame_mode:
      settings.headerLogoFrameMode || settings.logoFrameMode || "soft-square",
    header_logo_fit_mode:
      settings.headerLogoFitMode || settings.logoFitMode || "contain",
    footer_logo_frame_mode:
      settings.footerLogoFrameMode || settings.logoFrameMode || "soft-square",
    footer_logo_fit_mode:
      settings.footerLogoFitMode || settings.logoFitMode || "contain",
    taxa_protocolo: settings.taxaProtocolo ?? 35.24,
    taxa_iss_por_metro_quadrado: settings.taxaIssPorMetroQuadrado ?? 0,
    taxa_aprovacao_final: settings.taxaAprovacaoFinal ?? 0,
    registro_profissional_obrigatorio:
      settings.registroProfissionalObrigatorio ?? true,
  };

  const { error: settingsError } = await supabase
    .from("tenant_settings")
    .upsert(settingsPayload, { onConflict: "tenant_id" });

  if (!settingsError) return;

  if (!isMissingRelationError(settingsError, "public.tenant_settings")) {
    throw settingsError;
  }

  const brandingFallbackPayload = {
    tenant_id: remoteTenantId,
    logo_url: settings.logoUrl || null,
    hero_subtitle: settings.secretariaResponsavel || null,
    logo_scale: settings.logoScale ?? 1,
    logo_offset_x: settings.logoOffsetX ?? 0,
    logo_offset_y: settings.logoOffsetY ?? 0,
    header_logo_scale: settings.headerLogoScale ?? settings.logoScale ?? 1,
    header_logo_offset_x:
      settings.headerLogoOffsetX ?? settings.logoOffsetX ?? 0,
    header_logo_offset_y:
      settings.headerLogoOffsetY ?? settings.logoOffsetY ?? 0,
    footer_logo_scale: settings.footerLogoScale ?? settings.logoScale ?? 1,
    footer_logo_offset_x:
      settings.footerLogoOffsetX ?? settings.logoOffsetX ?? 0,
    footer_logo_offset_y:
      settings.footerLogoOffsetY ?? settings.logoOffsetY ?? 0,
    logo_alt: settings.logoAlt || null,
    logo_updated_at: settings.logoUpdatedAt || null,
    logo_updated_by: normalizeUuid(settings.logoUpdatedBy),
    logo_frame_mode: settings.logoFrameMode || "soft-square",
    logo_fit_mode: settings.logoFitMode || "contain",
    header_logo_frame_mode:
      settings.headerLogoFrameMode || settings.logoFrameMode || "soft-square",
    header_logo_fit_mode:
      settings.headerLogoFitMode || settings.logoFitMode || "contain",
    footer_logo_frame_mode:
      settings.footerLogoFrameMode || settings.logoFrameMode || "soft-square",
    footer_logo_fit_mode:
      settings.footerLogoFitMode || settings.logoFitMode || "contain",
  };

  const { error: brandingError } = await supabase
    .from("tenant_branding")
    .upsert(brandingFallbackPayload, { onConflict: "tenant_id" });

  if (brandingError && isMissingColumnError(brandingError)) {
    const { error: legacyBrandingError } = await supabase
      .from("tenant_branding")
      .upsert(
        {
          tenant_id: remoteTenantId,
          logo_url: settings.logoUrl || null,
          hero_subtitle: settings.secretariaResponsavel || null,
        },
        { onConflict: "tenant_id" },
      );

    if (!legacyBrandingError) return;
    throw new Error(
      legacyBrandingError.message || "Falha ao salvar o branding institucional.",
    );
  }

  if (brandingError) {
    throw new Error(
      brandingError.message || "Falha ao salvar o branding institucional.",
    );
  }
}

export async function upsertRemotePlan(plan: PlanItem) {
  if (!supabase) {
    throw new Error("Supabase indisponível.");
  }

  const payload: Record<string, unknown> = {
    id: normalizeUuid(plan.id) ?? plan.id,
    code: buildPlanCode(plan),
    account_level: plan.accountLevel,
    name: plan.name,
    subtitle: plan.subtitle,
    description: plan.description,
    price: plan.price,
    billing_cycle: plan.billingCycle,
    badge: plan.badge || null,
    badge_variant: plan.badgeVariant,
    features_included: plan.featuresIncluded,
    features_excluded: plan.featuresExcluded,
    modules_included: plan.modulesIncluded,
    max_users: plan.maxUsers,
    max_processes: plan.maxProcesses,
    max_departments: plan.maxDepartments,
    max_storage_gb: plan.maxStorageGb,
    is_featured: plan.isFeatured,
    is_active: plan.isActive,
    is_enabled: plan.isActive,
    is_public: plan.isPublic,
    is_internal_only: plan.isInternalOnly,
    is_custom: plan.isCustom,
    is_visible_in_master: plan.isVisibleInMaster,
    display_order: plan.displayOrder,
    accent_color: plan.accentColor,
    notes: plan.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await upsertWithColumnRetry("plans", payload, "id");

  if (error) {
    if (isMissingRelationError(error, "public.plans")) {
      throw new Error("A tabela de planos ainda não foi aplicada no banco remoto.");
    }
    throw new Error(error.message || "Falha ao salvar o plano.");
  }

  return plan;
}

export async function saveRemoteClientPlanAssignment(assignment: ClientPlanAssignment) {
  if (!supabase) {
    throw new Error("Supabase indisponível.");
  }

  const payload: Record<string, unknown> = {
    id: normalizeUuid(assignment.id) ?? assignment.id,
    municipality_id: assignment.municipalityId,
    plan_id: assignment.planId,
    contract_status: assignment.contractStatus,
    starts_at: assignment.startsAt || null,
    ends_at: assignment.endsAt || null,
    billing_cycle: assignment.billingCycle,
    billing_notes: assignment.billingNotes || null,
    custom_price: assignment.customPrice,
    is_custom: assignment.isCustom,
    updated_at: new Date().toISOString(),
  };

  const { error } = await upsertWithColumnRetry("client_plan_assignments", payload, "id");

  if (error) {
    if (isMissingRelationError(error, "public.client_plan_assignments")) {
      throw new Error("A tabela de contratos de planos ainda não foi aplicada no banco remoto.");
    }
    throw new Error(error.message || "Falha ao salvar o vínculo comercial.");
  }

  return assignment;
}

export type CommercialMaterialPayload = {
  planIds: string[];
  modelType: string;
  materialType: string;
  customerName?: string;
  customerContact?: string;
  responsibleName?: string;
  responsibleRole?: string;
  title: string;
  subtitle?: string;
  generatedContent?: Record<string, unknown>;
  pdfUrl?: string;
  shareSlug?: string;
  isPublic?: boolean;
  status?: "draft" | "active" | "archived";
  validUntil?: string;
  notes?: string;
};

export async function saveRemoteCommercialMaterial(material: CommercialMaterialPayload) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const userResult = await supabase.auth.getUser();
  const payload: Record<string, unknown> = {
    created_by: userResult.data.user?.id ?? null,
    plan_ids: material.planIds,
    model_type: material.modelType,
    material_type: material.materialType,
    customer_name: material.customerName || null,
    customer_contact: material.customerContact || null,
    responsible_name: material.responsibleName || null,
    responsible_role: material.responsibleRole || null,
    title: material.title,
    subtitle: material.subtitle || null,
    generated_content: material.generatedContent ?? {},
    pdf_url: material.pdfUrl || null,
    share_slug: material.shareSlug || null,
    is_public: material.isPublic ?? false,
    status: material.status ?? "draft",
    valid_until: material.validUntil || null,
    notes: material.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("commercial_materials")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error, "public.commercial_materials")) {
      throw new Error("A tabela de materiais comerciais ainda nao foi aplicada no banco remoto.");
    }
    throw new Error(error.message || "Falha ao salvar o material comercial.");
  }

  return String(data?.id ?? "");
}

export type DemoContactRequestPayload = {
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  roleTitle: string;
  message?: string;
  origin?: string;
  interest?: string;
};

export async function saveDemoContactRequest(input: DemoContactRequestPayload) {
  if (!supabase) {
    throw new Error("Supabase indisponivel para registrar a solicitacao.");
  }

  const payload = {
    full_name: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    organization: input.organization.trim(),
    role_title: input.roleTitle.trim(),
    message: input.message?.trim() || null,
    origin: input.origin || "demo_modal_contact",
    interest: input.interest || "apresentacao_sigapro",
    status: "new",
    metadata: {
      source: "landing_demo_modal",
      submitted_at: new Date().toISOString(),
    },
  };

  const { data, error } = await supabase
    .from("demo_contact_requests")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error, "public.demo_contact_requests")) {
      throw new Error("A tabela de solicitacoes comerciais ainda nao foi aplicada no banco remoto.");
    }
    throw new Error(error.message || "Falha ao registrar a solicitacao comercial.");
  }

  return String(data?.id ?? "");
}

export async function loadPublicPlansCatalog() {
  if (!supabase) {
    return [] as PlanItem[];
  }

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_public", true)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "public.plans")) {
      return [] as PlanItem[];
    }
    if (isMissingColumnError(error)) {
      return [] as PlanItem[];
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    accountLevel: row.account_level ?? row.name ?? "Plano",
    name: row.name ?? "Plano",
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    billingCycle:
      row.billing_cycle === "anual" || row.billing_cycle === "personalizado"
        ? row.billing_cycle
        : "mensal",
    badge: row.badge ?? "",
    badgeVariant: row.badge_variant ?? "default",
    featuresIncluded: Array.isArray(row.features_included) ? row.features_included : [],
    featuresExcluded: Array.isArray(row.features_excluded) ? row.features_excluded : [],
    modulesIncluded: Array.isArray(row.modules_included) ? row.modules_included : [],
    maxUsers: row.max_users ?? null,
    maxProcesses: row.max_processes ?? null,
    maxDepartments: row.max_departments ?? null,
    maxStorageGb: row.max_storage_gb ?? null,
    isFeatured: Boolean(row.is_featured ?? false),
    isActive: Boolean(row.is_active ?? row.is_enabled ?? true),
    isPublic: Boolean(row.is_public ?? false),
    isInternalOnly: Boolean(row.is_internal_only ?? false),
    isCustom: Boolean(row.is_custom ?? false),
    isVisibleInMaster: Boolean(row.is_visible_in_master ?? true),
    displayOrder: Number(row.display_order ?? 0),
    accentColor: row.accent_color ?? "#1d4ed8",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })) as PlanItem[];
}

export async function saveRemoteTenantSettings(settings: TenantSettings) {
  return saveRemoteInstitutionSettings(settings);
}
