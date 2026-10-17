/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  type AccountStatus,
  buildProcessDocuments,
  checklistTemplates as seedChecklistTemplates,
  cmsSections as seedCmsSections,
  clientPlanAssignments as seedClientPlanAssignments,
  documentTemplates as seedDocumentTemplates,
  getMasterMetrics,
  isFinalApprovalFeeConfigured,
  isOccupancyPermitProcessType,
  isIssFeeConfigured,
  normalizeOwnerDocument,
  normalizeSessionUserScope,
  planCatalog as seedPlanCatalog,
  ownerLinks as seedOwnerLinks,
  ownerMessages as seedOwnerMessages,
  ownerRequests as seedOwnerRequests,
  processRecords as seedProcessRecords,
  sessionUsers as seedSessionUsers,
  tenantSettings as seedTenantSettings,
  tenants as seedTenants,
  type ChecklistTemplate,
  type ClientPlanAssignment,
  type FormalRequirement,
  type Institution,
  type InstitutionSettings,
  type PlanItem,
  type OwnerProfessionalMessage,
  type OwnerProjectLink,
  type OwnerProjectRequest,
  type OwnerRequestStatus,
  type ProcessDocument,
  type ProcessRecord,
  type ProcessStatus,
  type ProcessTransitVisibility,
  type SessionUser,
  type Tenant,
  type TenantUserInput,
  type UserProfile,
  getProcessPaymentGuides,
  parseMarker,
  serializeMarker,
  userProfiles as seedUserProfiles,
} from "@/lib/platform";
import { backendClient, hasBackendEnv } from "@/integrations/backend/databaseClient";
import { isNeonBackend } from "@/integrations/backend/config";
import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import {
  acknowledgeRemoteProcessDispatch,
  annotateRemoteProcessDocument,
  appendRemoteProcessDocuments,
  beginRemoteAnalysisSupervisorIntervention,
  completeRemoteProcessDispatch,
  completeRemoteProcessRequirement,
  confirmRemoteProcessPaymentGuide,
  createRemoteOwnerMessage,
  createRemoteProcessDispatch,
  createRemoteProcessRequirement,
  createRemoteOwnerRequestByProtocol,
  createRemoteExternalProcessV2,
  issueRemoteProcessPaymentGuide,
  loadRemotePlatformStore,
  linkExistingMunicipalStaff,
  manageRemoteUserAccess,
  reissueRemoteProcessPaymentGuide,
  reviseRemoteIssProjectGuide,
  removeRemoteProcessMarkerByLabel,
  reopenRemoteProcess,
  respondRemoteOwnerRequest,
  respondRemoteProcessRequirement,
  reassignRemoteProcessAnalysis,
  returnRemoteProcessDispatch,
  reviewRemoteProcessDocument,
  saveRemoteClientPlanAssignment,
  saveRemoteInstitutionSettings,
  saveRemoteProfile,
  sendRemoteProcessMessage,
  shareRemoteIssProjectGuide,
  endRemoteAnalysisSupervisorIntervention,
  setRemoteOwnerChatEnabled,
  startRemoteProcessAnalysis,
  setRemoteProcessCheckpoint,
  setRemoteProcessHold,
  setRemoteProcessStatus,
  setRemoteProcessTriage,
  setRemoteProcessTransitVisibility,
  updateRemoteProcessIssProjectData,
  upsertRemoteInstitution,
  upsertRemotePlan,
  upsertRemoteProcessMarker,
} from "@/integrations/backend/platform";

type CmsSection = (typeof seedCmsSections)[number];
type DocumentTemplate = (typeof seedDocumentTemplates)[number];
type DataSource = "demo" | "local" | "warm" | "remote";

interface PlatformDataState {
  source: DataSource;
  loading: boolean;
  dataError: string | null;
  dataReadyForCurrentUser: boolean;
  refreshRemoteStore: () => Promise<void>;
  tenants: Tenant[];
  institutions: Institution[];
  tenantSettings: InstitutionSettings[];
  institutionSettings: InstitutionSettings[];
  sessionUsers: SessionUser[];
  userProfiles: UserProfile[];
  ownerRequests: OwnerProjectRequest[];
  ownerLinks: OwnerProjectLink[];
  ownerMessages: OwnerProfessionalMessage[];
  processes: ProcessRecord[];
  plans: PlanItem[];
  planAssignments: ClientPlanAssignment[];
  cmsSections: CmsSection[];
  checklistTemplates: ChecklistTemplate[];
  documentTemplates: DocumentTemplate[];
  metrics: ReturnType<typeof getMasterMetrics>;
  getTenantSettings: (tenantId: string | null | undefined) => InstitutionSettings | undefined;
  getInstitutionSettings: (institutionId: string | null | undefined) => InstitutionSettings | undefined;
  getUserProfile: (userId: string | null | undefined, email?: string | null | undefined) => UserProfile | undefined;
  upsertInstitution: (input: {
    institutionId?: string;
    name: string;
    city: string;
    state: string;
    status: Tenant["status"];
    plan: string;
    subdomain: string;
    primaryColor: string;
    accentColor: string;
  }, options?: { remoteConfirmed?: boolean }) => Institution;
  saveInstitutionSettings: (settings: InstitutionSettings, options?: { skipRemoteSync?: boolean }) => Promise<void>;
  getInstitutionPlanAssignment: (institutionId: string | null | undefined) => ClientPlanAssignment | undefined;
  upsertPlan: (plan: PlanItem) => Promise<PlanItem>;
  duplicatePlan: (planId: string) => Promise<PlanItem | null>;
  saveClientPlanAssignment: (assignment: Omit<ClientPlanAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<ClientPlanAssignment>;
  createOwnerRequestByProtocol: (input: {
    protocol: string;
    ownerDocument: string;
    notes?: string;
  }) => Promise<{
    request: OwnerProjectRequest | null;
    process?: { id: string; protocol: string; title: string; status: string } | null;
    error?: string;
  }>;
  respondOwnerRequest: (input: {
    requestId: string;
    status: OwnerRequestStatus;
    professionalUserId: string;
    notes?: string;
  }) => Promise<OwnerProjectRequest | null>;
  setOwnerChatEnabled: (input: { linkId: string; enabled: boolean; actor: string }) => Promise<OwnerProjectLink | null>;
  sendOwnerMessage: (input: {
    projectId: string;
    ownerUserId: string;
    professionalUserId: string;
    senderUserId: string;
    message: string;
    isSystemMessage?: boolean;
  }) => Promise<OwnerProfessionalMessage | null>;
  saveUserProfile: (profile: UserProfile) => Promise<UserProfile>;
  createTenantUser: (input: TenantUserInput) => Promise<SessionUser>;
  updateTenantUser: (userId: string, input: Partial<Pick<SessionUser, "name" | "email" | "role" | "accessLevel" | "title" | "profileLabel" | "department" | "userType">>) => Promise<SessionUser | null>;
  setUserAccountStatus: (input: { userId: string; status: AccountStatus; actor: string; reason?: string }) => Promise<SessionUser | null>;
  deleteUserAccount: (input: { userId: string; actor: string; reason?: string }) => Promise<SessionUser | null>;
  createRequirement: (input: { processId: string; title: string; description: string; dueDate: string; actor: string; targetName: string; visibility: "interno" | "externo" | "misto" }) => Promise<void>;
  respondRequirement: (input: { processId: string; requirementId: string; response: string; actor: string }) => Promise<void>;
  completeRequirement: (input: { processId: string; requirementId: string; actor: string }) => Promise<void>;
  updateProcessStatus: (input: {
    processId: string;
    status: ProcessStatus;
    actor: string;
    detail: string;
    title?: string;
  }) => Promise<void>;
  updateProcessTriage: (input: {
    processId: string;
    status: "recebido" | "em_triagem" | "concluido";
    actor: string;
    notes?: string;
  }) => Promise<void>;
  startProcessAnalysis: (processId: string) => Promise<void>;
  beginAnalysisSupervisorIntervention: (input: { processId: string; reason: string; minutes?: number }) => Promise<void>;
  endAnalysisSupervisorIntervention: (processId: string) => Promise<void>;
  reassignProcessAnalysis: (input: { processId: string; targetProfileId: string; reason: string }) => Promise<void>;
  reopenProcess: (input: { processId: string; actor: string; reason: string }) => Promise<void>;
  requestConstructionPaymentGuide: (processId: string, actor: string) => Promise<void>;
  updateIssProjectGuideData: (input: {
    processId: string;
    areaM2: number;
    usage: string;
    workType: string;
  }) => Promise<void>;
  reviseIssProjectGuide: (input: {
    processId: string;
    areaM2: number;
    usage: string;
    workType: string;
  }) => Promise<void>;
  shareIssProjectGuide: (processId: string) => Promise<void>;
  issuePaymentGuide: (processId: string, actor: string, guideKind: "iss_obra" | "aprovacao_final") => Promise<void>;
  markGuideAsPaid: (processId: string, actor: string, guideKind?: "protocolo" | "iss_obra" | "aprovacao_final") => Promise<void>;
  appendProcessDocuments: (
    processId: string,
    documents: ProcessDocument[],
    actor: string,
  ) => Promise<{ process_id: string; synced: number; inserted: number; updated: number; stored: number }>;
  reviewProcessDocument: (processId: string, documentId: string, status: "aprovado" | "rejeitado", actor: string) => Promise<void>;
  addDocumentAnnotation: (
    processId: string,
    documentId: string,
    annotation: {
      kind: "text" | "highlight";
      page: number;
      x: number;
      y: number;
      width?: number;
      height?: number;
      note: string;
      author: string;
    },
  ) => Promise<void>;
  addProcessMarker: (processId: string, marker: string, actor: string) => Promise<void>;
  addProcessMarkerWithColor: (processId: string, marker: string, color: string, actor: string) => Promise<void>;
  removeProcessMarker: (processId: string, marker: string, actor: string) => Promise<void>;
  setInstitutionStatus: (institutionId: string, status: Tenant["status"]) => Promise<void>;
  dispatchProcess: (input: { processId: string; actor: string; from: string; to: string; subject: string; dueDate?: string; visibility?: "interno" | "externo" | "misto"; priority?: "baixa" | "media" | "alta" | "critica"; assignedTo?: string }) => Promise<void>;
  acknowledgeDispatchReceipt: (input: { processIds: string[]; actor: string; unit: string }) => Promise<void>;
  completeDispatches: (input: { processIds: string[]; actor: string; unit: string }) => Promise<void>;
  returnDispatches: (input: { processIds: string[]; actor: string; unit: string; reason?: string }) => Promise<void>;
  setProcessCheckpoint: (input: { processIds: string[]; actor: string; checkpoint: string }) => Promise<void>;
  setProcessOnHold: (input: { processIds: string[]; actor: string; onHold: boolean; reason?: string }) => Promise<void>;
  setProcessTransitVisibility: (input: { processId: string; actor: string; visibility: ProcessTransitVisibility }) => Promise<void>;
  sendProcessMessage: (input: { processId: string; senderName: string; senderRole: string; audience: "interno" | "externo" | "misto"; recipientName?: string; message: string }) => Promise<void>;
  reissuePaymentGuide: (processId: string, actor: string, guideKind?: "protocolo" | "iss_obra" | "aprovacao_final") => Promise<void>;
}

interface PlatformStore {
  tenants: Tenant[];
  tenantSettings: InstitutionSettings[];
  sessionUsers: SessionUser[];
  userProfiles: UserProfile[];
  ownerRequests: OwnerProjectRequest[];
  ownerLinks: OwnerProjectLink[];
  ownerMessages: OwnerProfessionalMessage[];
  processes: ProcessRecord[];
  plans: PlanItem[];
  planAssignments: ClientPlanAssignment[];
  cmsSections: CmsSection[];
  checklistTemplates: ChecklistTemplate[];
  documentTemplates: DocumentTemplate[];
}

function hasMeaningfulValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function mergeUserProfileRecord(localProfile?: UserProfile, remoteProfile?: UserProfile): UserProfile | undefined {
  if (!localProfile && !remoteProfile) return undefined;
  if (!localProfile) return remoteProfile;
  if (!remoteProfile) return localProfile;

  return {
    userId: remoteProfile.userId || localProfile.userId,
    fullName: hasMeaningfulValue(remoteProfile.fullName) ? remoteProfile.fullName : localProfile.fullName,
    email: hasMeaningfulValue(remoteProfile.email) ? remoteProfile.email : localProfile.email,
    phone: hasMeaningfulValue(remoteProfile.phone) ? remoteProfile.phone : localProfile.phone,
    cpfCnpj: hasMeaningfulValue(remoteProfile.cpfCnpj) ? remoteProfile.cpfCnpj : localProfile.cpfCnpj,
    rg: hasMeaningfulValue(remoteProfile.rg) ? remoteProfile.rg : localProfile.rg,
    birthDate: hasMeaningfulValue(remoteProfile.birthDate) ? remoteProfile.birthDate : localProfile.birthDate,
    professionalType: hasMeaningfulValue(remoteProfile.professionalType) ? remoteProfile.professionalType : localProfile.professionalType,
    registrationNumber: hasMeaningfulValue(remoteProfile.registrationNumber) ? remoteProfile.registrationNumber : localProfile.registrationNumber,
    companyName: hasMeaningfulValue(remoteProfile.companyName) ? remoteProfile.companyName : localProfile.companyName,
    addressLine: hasMeaningfulValue(remoteProfile.addressLine) ? remoteProfile.addressLine : localProfile.addressLine,
    addressNumber: hasMeaningfulValue(remoteProfile.addressNumber) ? remoteProfile.addressNumber : localProfile.addressNumber,
    addressComplement: hasMeaningfulValue(remoteProfile.addressComplement) ? remoteProfile.addressComplement : localProfile.addressComplement,
    neighborhood: hasMeaningfulValue(remoteProfile.neighborhood) ? remoteProfile.neighborhood : localProfile.neighborhood,
    city: hasMeaningfulValue(remoteProfile.city) ? remoteProfile.city : localProfile.city,
    state: hasMeaningfulValue(remoteProfile.state) ? remoteProfile.state : localProfile.state,
    zipCode: hasMeaningfulValue(remoteProfile.zipCode) ? remoteProfile.zipCode : localProfile.zipCode,
    avatarUrl: hasMeaningfulValue(remoteProfile.avatarUrl) ? remoteProfile.avatarUrl : localProfile.avatarUrl,
    avatarStorageRef: hasMeaningfulValue(remoteProfile.avatarStorageRef) ? remoteProfile.avatarStorageRef : localProfile.avatarStorageRef,
    avatarScale: remoteProfile.avatarScale ?? localProfile.avatarScale ?? 1,
    avatarOffsetX: remoteProfile.avatarOffsetX ?? localProfile.avatarOffsetX ?? 0,
    avatarOffsetY: remoteProfile.avatarOffsetY ?? localProfile.avatarOffsetY ?? 0,
    useAvatarInHeader: remoteProfile.useAvatarInHeader ?? localProfile.useAvatarInHeader ?? false,
    bio: hasMeaningfulValue(remoteProfile.bio) ? remoteProfile.bio : localProfile.bio,
  };
}

function mergeUserProfiles(localProfiles: UserProfile[], remoteProfiles: UserProfile[]) {
  const merged: UserProfile[] = [...localProfiles];

  remoteProfiles.forEach((remoteProfile) => {
    const existingIndex = merged.findIndex(
      (localProfile) => localProfile.userId === remoteProfile.userId,
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = mergeUserProfileRecord(merged[existingIndex], remoteProfile) ?? merged[existingIndex];
      return;
    }

    merged.push(remoteProfile);
  });

  return merged;
}

function mergeRecordsById<T extends { id: string }>(
  localRecords: T[],
  remoteRecords: T[],
  preferRemote = true,
) {
  const merged = new Map<string, T>();

  localRecords.forEach((record) => {
    merged.set(record.id, record);
  });

  remoteRecords.forEach((record) => {
    if (!merged.has(record.id) || preferRemote) {
      merged.set(record.id, record);
    }
  });

  return Array.from(merged.values());
}

function mergeRecordsByTenantId<T extends { tenantId: string }>(
  localRecords: T[],
  remoteRecords: T[],
  preferRemote = true,
) {
  const merged = new Map<string, T>();

  localRecords.forEach((record) => {
    merged.set(record.tenantId, record);
  });

  remoteRecords.forEach((record) => {
    if (!merged.has(record.tenantId) || preferRemote) {
      merged.set(record.tenantId, record);
    }
  });

  return Array.from(merged.values());
}

function findUserProfile(profiles: UserProfile[], userId: string | null | undefined, email?: string | null | undefined) {
  const id = userId && userId !== "unknown" ? userId : "";
  if (id) {
    const profile = profiles.find((item) => item.userId === id);
    if (profile) return profile;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return undefined;
  return profiles.find((item) => normalizeEmail(item.email) === normalizedEmail);
}

const LEGACY_STORAGE_KEY = "sigapro-platform-store";
const STORAGE_KEY = "sigapro-platform-store.v2";
const PLATFORM_SESSION_CACHE_KEY = "sigapro.platform.session.v1";
const PLATFORM_WARM_STORE_CACHE_PREFIX = "sigapro.platform.warm-store.v1:";
const PLATFORM_WARM_STORE_MAX_AGE_MS = 1000 * 60 * 60 * 8;
const PROFILE_VISUAL_CACHE_KEY = "sigapro.profile.visual.v1";
const LEGACY_RECONCILIATION_PENDING_KEY = "sigapro:legacy-process-reconciliation-pending";
const LEGACY_DEMO_TENANT_NAMES = new Set([
  "prefeitura de jardim da serra",
  "prefeitura jardim da serra",
  "prefeitura municipal de jardim da serra",
  "prefeitura de ribeira nova",
  "prefeitura municipal de ribeira nova",
  "sigapro plataforma",
]);

const enableDemoOperationalData =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? "").trim().toLowerCase() === "true";

const defaultStore: PlatformStore = {
  // Dados operacionais fictícios nunca são fallback implícito. Eles só existem
  // em desenvolvimento quando o modo demo é ativado conscientemente.
  tenants: enableDemoOperationalData ? seedTenants : [],
  tenantSettings: enableDemoOperationalData ? seedTenantSettings : [],
  sessionUsers: enableDemoOperationalData ? seedSessionUsers : [],
  userProfiles: enableDemoOperationalData ? seedUserProfiles : [],
  ownerRequests: enableDemoOperationalData ? seedOwnerRequests : [],
  ownerLinks: enableDemoOperationalData ? seedOwnerLinks : [],
  ownerMessages: enableDemoOperationalData ? seedOwnerMessages : [],
  processes: enableDemoOperationalData ? seedProcessRecords : [],
  plans: seedPlanCatalog,
  planAssignments: enableDemoOperationalData ? seedClientPlanAssignments : [],
  cmsSections: seedCmsSections,
  checklistTemplates: seedChecklistTemplates,
  documentTemplates: seedDocumentTemplates,
};

const staticCatalogStore: PlatformStore = {
  tenants: [],
  tenantSettings: [],
  sessionUsers: [],
  userProfiles: [],
  ownerRequests: [],
  ownerLinks: [],
  ownerMessages: [],
  processes: [],
  plans: seedPlanCatalog,
  planAssignments: [],
  cmsSections: seedCmsSections,
  checklistTemplates: seedChecklistTemplates,
  documentTemplates: seedDocumentTemplates,
};

const PlatformDataContext = createContext<PlatformDataState | null>(null);

function normalizeTenantLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findOperationalDispatch(
  process: ProcessRecord,
  unit: string,
  allowedStatuses: string[],
) {
  const normalizedUnit = normalizeTenantLabel(unit);

  return process.dispatches.find((dispatch) => {
    if (!allowedStatuses.includes(dispatch.status)) return false;
    if (!normalizedUnit) return true;

    const target = normalizeTenantLabel(dispatch.to);
    return (
      target === normalizedUnit ||
      target.includes(normalizedUnit) ||
      normalizedUnit.includes(target)
    );
  });
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  if (host.startsWith("172.")) {
    const parts = host.split(".");
    const second = Number(parts[1] || "0");
    return second >= 16 && second <= 31;
  }
  return host.endsWith(".local");
}

function isLegacyDemoTenantName(name: string | null | undefined) {
  const normalized = normalizeTenantLabel(name);
  return (
    LEGACY_DEMO_TENANT_NAMES.has(normalized) ||
    normalized.startsWith("sigapro plataforma")
  );
}

function buildSanitizedStore(rawStore: Partial<PlatformStore>, fallbackToDefault = true): PlatformStore {
  const fallback = <T,>(value: T[] | undefined, defaultValue: T[]) =>
    value ?? (fallbackToDefault ? defaultValue : []);

  const sourceTenants = fallback(rawStore.tenants, defaultStore.tenants);
  const legacyDemoIds = new Set(
    sourceTenants
      .filter((tenant) => isLegacyDemoTenantName(tenant.name))
      .map((tenant) => tenant.id),
  );
  const tenants = sourceTenants.filter((tenant) => !legacyDemoIds.has(tenant.id));
  const processes = fallback(rawStore.processes, defaultStore.processes)
    .filter(
      (process) =>
        !legacyDemoIds.has(process.tenantId) &&
        !legacyDemoIds.has(process.municipalityId ?? ""),
    )
    .map((process) => ({
      ...process,
      payment: {
        ...process.payment,
        guides: getProcessPaymentGuides(process),
      },
    }));
  const validProcessIds = new Set(processes.map((process) => process.id));

  const normalizedSessionUsers = fallback(rawStore.sessionUsers, defaultStore.sessionUsers)
    .map((user) => normalizeSessionUserScope(user))
    .filter(
      (user) =>
        !legacyDemoIds.has(user.tenantId ?? "") &&
        !legacyDemoIds.has(user.municipalityId ?? ""),
    );
  const normalizedUserProfiles = fallback(rawStore.userProfiles, defaultStore.userProfiles);

  return {
    tenants: tenants.length > 0 || !fallbackToDefault ? tenants : defaultStore.tenants,
    tenantSettings: fallback(rawStore.tenantSettings, defaultStore.tenantSettings)
      .filter((item) => !legacyDemoIds.has(item.tenantId)),
    sessionUsers: normalizedSessionUsers,
    userProfiles: normalizedUserProfiles,
    ownerRequests: fallback(rawStore.ownerRequests, defaultStore.ownerRequests).filter((request) =>
      validProcessIds.has(request.projectId),
    ),
    ownerLinks: fallback(rawStore.ownerLinks, defaultStore.ownerLinks).filter((link) =>
      validProcessIds.has(link.projectId),
    ),
    ownerMessages: fallback(rawStore.ownerMessages, defaultStore.ownerMessages).filter((message) =>
      validProcessIds.has(message.projectId),
    ),
    processes,
    plans: fallback(rawStore.plans, defaultStore.plans),
    planAssignments: fallback(rawStore.planAssignments, defaultStore.planAssignments),
    cmsSections: fallback(rawStore.cmsSections, defaultStore.cmsSections),
    checklistTemplates: fallback(rawStore.checklistTemplates, defaultStore.checklistTemplates),
    documentTemplates: fallback(rawStore.documentTemplates, defaultStore.documentTemplates),
  };
}

function readStore(): PlatformStore {
  if (typeof window === "undefined") {
    return defaultStore;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultStore;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlatformStore>;
    return buildSanitizedStore(parsed);
  } catch {
    return defaultStore;
  }
}

function readPersistedStore(): PlatformStore | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlatformStore>;
    return buildSanitizedStore(parsed, false);
  } catch {
    return null;
  }
}


function syncStore(store: PlatformStore) {
  if (typeof window === "undefined") return;

  const cachedSession = readCachedPlatformSession();
  if (cachedSession?.id) {
    syncWarmPlatformStore(store, cachedSession.id);
  }

  // O cache persistente continua proibido em produção. O warm cache acima vive
  // somente na aba atual (sessionStorage), é vinculado à identidade e serve
  // exclusivamente para impedir que a interface suma durante F5/revalidação.
  if (hasBackendEnv && (!isLocalDevHost() || isNeonBackend)) {
    if (window.localStorage.getItem(LEGACY_RECONCILIATION_PENDING_KEY) !== "1") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return;
  }

  const normalizedStore: PlatformStore = {
    ...store,
    sessionUsers: store.sessionUsers.map((user) => normalizeSessionUserScope(user)),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedStore));
}

function readCachedPlatformSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || parsed.id === "unknown") return null;
    return normalizeSessionUserScope(parsed);
  } catch {
    return null;
  }
}

function warmStoreCacheKey(userId: string) {
  return `${PLATFORM_WARM_STORE_CACHE_PREFIX}${userId}`;
}

function readWarmPlatformStore(): { userId: string; store: PlatformStore } | null {
  if (typeof window === "undefined") return null;

  const session = readCachedPlatformSession();
  if (!session?.id || session.id === "unknown") return null;

  try {
    const raw = window.sessionStorage.getItem(warmStoreCacheKey(session.id));
    if (!raw) return null;

    const cached = JSON.parse(raw) as {
      userId?: string;
      cachedAt?: number;
      store?: Partial<PlatformStore>;
    };

    if (
      cached.userId !== session.id ||
      typeof cached.cachedAt !== "number" ||
      Date.now() - cached.cachedAt > PLATFORM_WARM_STORE_MAX_AGE_MS ||
      !cached.store
    ) {
      window.sessionStorage.removeItem(warmStoreCacheKey(session.id));
      return null;
    }

    return {
      userId: session.id,
      store: buildSanitizedStore(cached.store, false),
    };
  } catch {
    return null;
  }
}

function syncWarmPlatformStore(store: PlatformStore, userId: string | null | undefined) {
  if (typeof window === "undefined" || !userId || userId === "unknown") return;

  try {
    window.sessionStorage.setItem(
      warmStoreCacheKey(userId),
      JSON.stringify({
        userId,
        cachedAt: Date.now(),
        store,
      }),
    );
  } catch {
    // O cache é somente visual; falha de quota nunca pode afetar o banco oficial.
  }
}

function clearWarmPlatformStores() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PLATFORM_WARM_STORE_CACHE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // noop
  }
}

function readProfileVisualCache(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PROFILE_VISUAL_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<UserProfile> & { cachedAt?: number };
    if (!cached.userId || !cached.avatarUrl) return null;

    const currentSession = readCachedPlatformSession();
    const sameIdentity =
      currentSession?.id === cached.userId ||
      (currentSession?.email && normalizeEmail(currentSession.email) === normalizeEmail(cached.email));
    if (!sameIdentity) return null;

    return {
      userId: cached.userId,
      fullName: cached.fullName ?? currentSession?.name ?? "",
      email: cached.email ?? currentSession?.email ?? "",
      phone: "",
      cpfCnpj: "",
      rg: "",
      birthDate: "",
      professionalType: "",
      registrationNumber: "",
      companyName: "",
      addressLine: "",
      addressNumber: "",
      addressComplement: "",
      neighborhood: "",
      city: "",
      state: "",
      zipCode: "",
      avatarUrl: cached.avatarUrl,
      avatarStorageRef: cached.avatarStorageRef ?? "",
      avatarScale: cached.avatarScale ?? 1,
      avatarOffsetX: cached.avatarOffsetX ?? 0,
      avatarOffsetY: cached.avatarOffsetY ?? 0,
      useAvatarInHeader: cached.useAvatarInHeader ?? false,
      bio: "",
    };
  } catch {
    return null;
  }
}

function syncProfileVisualCache(profile: UserProfile) {
  if (typeof window === "undefined" || !profile.userId || !profile.avatarUrl) return;
  window.sessionStorage.setItem(
    PROFILE_VISUAL_CACHE_KEY,
    JSON.stringify({
      userId: profile.userId,
      fullName: profile.fullName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      avatarStorageRef: profile.avatarStorageRef ?? "",
      avatarScale: profile.avatarScale ?? 1,
      avatarOffsetX: profile.avatarOffsetX ?? 0,
      avatarOffsetY: profile.avatarOffsetY ?? 0,
      useAvatarInHeader: profile.useAvatarInHeader ?? false,
      cachedAt: Date.now(),
    }),
  );
}

function syncProfileToPlatformSession(profile: UserProfile, fallback?: Partial<SessionUser>) {
  if (typeof window === "undefined" || !profile.userId || profile.userId === "unknown") return;
  const current = readCachedPlatformSession();
  if (current?.id && current.id !== profile.userId) return;

  const next: SessionUser = {
    id: profile.userId,
    name: profile.fullName.trim() || current?.name || fallback?.name || "Usuário autenticado",
    role: current?.role ?? fallback?.role ?? "profissional_externo",
    accessLevel: current?.accessLevel ?? fallback?.accessLevel ?? 1,
    tenantId: current?.tenantId ?? fallback?.tenantId ?? null,
    municipalityId: current?.municipalityId ?? fallback?.municipalityId ?? null,
    title: current?.title ?? fallback?.title ?? "Profissional Externo",
    email: normalizeEmail(profile.email || current?.email || fallback?.email),
    accountStatus: current?.accountStatus ?? fallback?.accountStatus ?? "active",
    userType: current?.userType ?? fallback?.userType ?? "Usuário",
    department: current?.department ?? fallback?.department ?? "",
    createdAt: current?.createdAt ?? fallback?.createdAt ?? "",
    lastAccessAt: current?.lastAccessAt ?? fallback?.lastAccessAt ?? "",
    blockedAt: current?.blockedAt ?? fallback?.blockedAt ?? null,
    blockedBy: current?.blockedBy ?? fallback?.blockedBy ?? null,
    blockReason: current?.blockReason ?? fallback?.blockReason ?? null,
    deletedAt: current?.deletedAt ?? fallback?.deletedAt ?? null,
  };

  const normalizedSession = normalizeSessionUserScope(next);
  window.localStorage.setItem(PLATFORM_SESSION_CACHE_KEY, JSON.stringify(normalizedSession));
  window.dispatchEvent(new CustomEvent("sigapro-platform-session-updated", { detail: normalizedSession }));
}

function getInitialPlatformStoreState() {
  const localDev = isLocalDevHost();

  // Em produção, dados operacionais nunca são RESTAURADOS na interface.
  // Entretanto, capturamos uma cópia do cache antigo apenas para uma migração
  // controlada de protocolos que ainda não chegaram ao Neon.
  if (hasBackendEnv && (!localDev || isNeonBackend)) {
    const legacyStore = readPersistedStore();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const warmStore = readWarmPlatformStore();
    if (warmStore) {
      return {
        store: warmStore.store,
        source: "warm" as const,
        legacyStore,
        contextUserId: warmStore.userId,
      };
    }

    const cachedVisualProfile = readProfileVisualCache();
    return {
      store: cachedVisualProfile
        ? { ...staticCatalogStore, userProfiles: [cachedVisualProfile] }
        : staticCatalogStore,
      source: "local" as const,
      legacyStore,
      contextUserId: null,
    };
  }

  const initialStore = readStore();
  return {
    store: initialStore,
    source: initialStore === defaultStore ? ("demo" as const) : ("local" as const),
    legacyStore: null,
    contextUserId: readCachedPlatformSession()?.id ?? null,
  };
}

function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? Number((error as { status?: number }).status) : NaN;
  return status === 401 || status === 403;
}

async function loadRemotePlatformStoreWithRetry(maxAttempts = 3) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await loadRemotePlatformStore();
    } catch (error) {
      lastError = error;
      if (isAuthError(error) || attempt >= maxAttempts) {
        throw error;
      }

      // Logo após o sign-in o token e o Data API podem levar alguns instantes
      // para convergir. Retentamos apenas falhas transitórias; 401/403 nunca são mascarados.
      await new Promise((resolve) => window.setTimeout(resolve, 450 * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Banco oficial temporariamente indisponível.");
}

export function PlatformDataProvider({ children }: { children: React.ReactNode }) {
  const {
    authenticatedEmail,
    authenticatedMunicipalityId,
    authenticatedRole,
    authenticatedUserId,
    loading: authLoading,
  } = useAuthGateway();
  const initialStateRef = useRef<ReturnType<typeof getInitialPlatformStoreState> | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = getInitialPlatformStoreState();
  }
  const [store, setStore] = useState<PlatformStore>(() => initialStateRef.current?.store ?? defaultStore);
  const [loading, setLoading] = useState<boolean>(false);
  const [source, setSource] = useState<DataSource>(() => initialStateRef.current?.source ?? "demo");
  const [dataError, setDataError] = useState<string | null>(null);
  const [remoteContextUserId, setRemoteContextUserId] = useState<string | null>(
    () => initialStateRef.current?.contextUserId ?? null,
  );
  const lastFetchedUserId = useRef<string | null>(null);
  const allowRemoteInLocal =
    isNeonBackend ||
    (import.meta.env.VITE_FORCE_REMOTE_STORE as string | undefined) === "true";
  const localDev = isLocalDevHost();
  const expectsRemoteStore = Boolean(hasBackendEnv && (!localDev || allowRemoteInLocal));

  useEffect(() => {
    if (!authenticatedUserId) return;

    const hasVisibleData =
      store.sessionUsers.length > 0 ||
      store.tenants.length > 0 ||
      store.processes.length > 0;

    if (hasVisibleData) {
      syncWarmPlatformStore(store, authenticatedUserId);
    }
  }, [authenticatedUserId, store]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (authLoading) return;

      if (!authenticatedUserId || (localDev && !allowRemoteInLocal) || !hasBackendEnv) {
        if (!active) return;

        if (!authenticatedUserId) {
          const cachedSession = readCachedPlatformSession();

          // Neon pode ficar alguns frames sem authUserId enquanto restaura/renova
          // a sessão no F5. Se a sessão visual atual ainda existe, não desmonta a
          // tela nem zera usuários/processos. A revalidação seguirá em segundo plano.
          if (isNeonBackend && hasBackendEnv && cachedSession?.id) {
            setLoading(false);
            setDataError(null);
            return;
          }

          clearWarmPlatformStores();
          setRemoteContextUserId(null);
          lastFetchedUserId.current = null;
        }

        if (hasBackendEnv && !localDev) {
          // Sessão ausente/expirada em produção: mantém apenas catálogo estático,
          // nunca restaura processos, usuários, guias ou Prefeituras do navegador.
          setStore(staticCatalogStore);
          setSource("local");
          setDataError(null);
          setLoading(false);
          return;
        }

        const nextStore = readStore();
        setStore(nextStore);
        setSource(nextStore === defaultStore ? "demo" : "local");
        setDataError(null);

        // O contexto local também precisa pertencer explicitamente à conta atual.
        // Isso impede que a rota seja liberada usando o plano da sessão anterior.
        if (authenticatedUserId) {
          lastFetchedUserId.current = authenticatedUserId;
          setRemoteContextUserId(authenticatedUserId);
        }

        setLoading(false);
        return;
      }

      if (lastFetchedUserId.current === authenticatedUserId && source === "remote") {
        setRemoteContextUserId(authenticatedUserId);
        setLoading(false);
        return;
      }

      // Mantém a UI com o último estado visual válido, mas nunca carrega
      // um erro da conta anterior para a autenticação atual.
      setLoading(false);
      if (lastFetchedUserId.current !== authenticatedUserId) {
        setDataError(null);
      }
      try {
        let remote = await loadRemotePlatformStoreWithRetry();
        let sanitized = buildSanitizedStore(remote, false);

        const legacyStore = initialStateRef.current?.legacyStore ?? null;
        const canReconcileLegacyProcesses =
          !localDev &&
          authenticatedRole === "profissional_externo" &&
          Boolean(legacyStore?.processes.length);

        if (canReconcileLegacyProcesses && legacyStore) {
          const currentSession =
            sanitized.sessionUsers.find((user) => user.id === authenticatedUserId) ??
            sanitized.sessionUsers.find((user) => normalizeEmail(user.email) === normalizeEmail(authenticatedEmail));
          const currentProfile = findUserProfile(
            sanitized.userProfiles,
            authenticatedUserId,
            authenticatedEmail,
          );
          const currentName = (currentProfile?.fullName || currentSession?.name || "").trim().toLowerCase();
          const scopeId =
            authenticatedMunicipalityId ??
            currentSession?.municipalityId ??
            currentSession?.tenantId ??
            null;
          const remoteProtocols = new Set(
            sanitized.processes
              .map((process) => process.protocol?.trim().toLowerCase())
              .filter(Boolean),
          );

          const candidates = legacyStore.processes.filter((process) => {
            const protocol = process.protocol?.trim();
            if (!scopeId || !protocol || protocol.startsWith("PRE-") || process.status === "rascunho") {
              return false;
            }

            const processScope = process.municipalityId ?? process.tenantId;
            if (processScope !== scopeId || remoteProtocols.has(protocol.toLowerCase())) {
              return false;
            }

            const createdByCurrentUser = process.createdBy === authenticatedUserId;
            const technicalLeadMatches =
              Boolean(currentName) &&
              process.technicalLead?.trim().toLowerCase() === currentName;

            return createdByCurrentUser || technicalLeadMatches;
          });

          if (candidates.length > 0) {
            window.localStorage.setItem(LEGACY_RECONCILIATION_PENDING_KEY, "1");
            const settings = sanitized.tenantSettings.find((item) => item.tenantId === scopeId);
            let migrationFailed = false;

            for (const process of candidates) {
              try {
                await createRemoteExternalProcessV2({
                  tenantId: scopeId!,
                  createdBy: authenticatedUserId,
                  title: process.title,
                  type: process.type,
                  address: process.address,
                  ownerName: process.ownerName,
                  ownerDocument: process.ownerDocument,
                  technicalLead: process.technicalLead,
                  tags: process.tags,
                  notes: process.notes,
                  property: process.property,
                  documents: process.documents,
                  guidePrefix: settings?.guiaPrefixo || "DAM",
                  protocolPrefix: settings?.protocoloPrefixo || "PM",
                  requestedProtocolNumber: process.protocol,
                  remote: {
                    processId: process.id,
                    protocol: process.protocol,
                    externalProtocol: process.externalProtocol,
                    guideNumber: process.payment.guideNumber,
                    amount: process.payment.amount,
                    dueDate: process.payment.dueDate,
                    issuedAt: process.payment.issuedAt,
                    expiresAt: process.payment.expiresAt,
                    status: process.status,
                    guides: getProcessPaymentGuides(process, settings),
                  },
                });
              } catch (migrationError) {
                migrationFailed = true;
                console.error("[SIGAPRO][Migração] Falha ao reconciliar protocolo legado", {
                  protocol: process.protocol,
                  error: migrationError,
                });
              }
            }

            if (!migrationFailed) {
              window.localStorage.removeItem(LEGACY_RECONCILIATION_PENDING_KEY);
              window.localStorage.removeItem(STORAGE_KEY);
              initialStateRef.current.legacyStore = null;
              remote = await loadRemotePlatformStoreWithRetry();
              sanitized = buildSanitizedStore(remote, false);
            }
          } else {
            window.localStorage.removeItem(LEGACY_RECONCILIATION_PENDING_KEY);
            window.localStorage.removeItem(STORAGE_KEY);
            initialStateRef.current.legacyStore = null;
          }
        } else if (!localDev) {
          window.localStorage.removeItem(LEGACY_RECONCILIATION_PENDING_KEY);
          window.localStorage.removeItem(STORAGE_KEY);
          if (initialStateRef.current) initialStateRef.current.legacyStore = null;
        }

        if (!active) return;
        const cachedVisualProfile = readProfileVisualCache();
        if (cachedVisualProfile) {
          sanitized = {
            ...sanitized,
            userProfiles: mergeUserProfiles([cachedVisualProfile], sanitized.userProfiles),
          };
        }
        const activeProfile = findUserProfile(
          sanitized.userProfiles,
          authenticatedUserId,
          authenticatedEmail,
        );
        if (activeProfile?.avatarUrl) syncProfileVisualCache(activeProfile);
        setStore(sanitized);
        syncWarmPlatformStore(sanitized, authenticatedUserId);
        syncStore(sanitized);
        setSource("remote");
        setDataError(null);
        lastFetchedUserId.current = authenticatedUserId;
        setRemoteContextUserId(authenticatedUserId);
      } catch (error) {
        if (!active) return;
        if (isAuthError(error) && backendClient) {
          await backendClient.auth.signOut();
        }
        const cachedVisualProfile = readProfileVisualCache();
        const nextStore =
          hasBackendEnv && !localDev
            ? cachedVisualProfile
              ? { ...staticCatalogStore, userProfiles: [cachedVisualProfile] }
              : staticCatalogStore
            : readPersistedStore() ?? buildSanitizedStore({}, false);
        setStore((current) => {
          const hasVisibleData =
            current.sessionUsers.length > 0 ||
            current.tenants.length > 0 ||
            current.processes.length > 0;
          return hasVisibleData ? current : nextStore;
        });
        setSource((current) => (current === "remote" || current === "warm" ? current : "local"));
        setRemoteContextUserId((current) => current);
        setDataError(
          error instanceof Error && error.message
            ? `Banco oficial indisponível: ${error.message}`
            : "Banco oficial temporariamente indisponível.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    if (!hasBackendEnv) {
      const handleStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY || !event.newValue) {
          return;
        }
        try {
          const parsed = JSON.parse(event.newValue) as PlatformStore;
          setStore(parsed);
        } catch {
          return;
        }
      };

      window.addEventListener("storage", handleStorage);
      return () => {
        active = false;
        window.removeEventListener("storage", handleStorage);
      };
    }

    return () => {
      active = false;
    };
  }, [authenticatedUserId, authLoading]);

  const refreshRemoteStore = async () => {
    if (!authenticatedUserId || !hasBackendEnv) {
      const error = new Error("Sessão ou banco oficial indisponível para atualizar os dados.");
      setDataError(error.message);
      throw error;
    }

    try {
      const remote = await loadRemotePlatformStoreWithRetry();
      let sanitized = buildSanitizedStore(remote, false);
      const cachedVisualProfile = readProfileVisualCache();
      if (cachedVisualProfile) {
        sanitized = {
          ...sanitized,
          userProfiles: mergeUserProfiles([cachedVisualProfile], sanitized.userProfiles),
        };
      }
      const activeProfile = findUserProfile(
        sanitized.userProfiles,
        authenticatedUserId,
        authenticatedEmail,
      );
      if (activeProfile?.avatarUrl) syncProfileVisualCache(activeProfile);
      setStore(sanitized);
      syncWarmPlatformStore(sanitized, authenticatedUserId);
      syncStore(sanitized);
      setSource("remote");
      setDataError(null);
      lastFetchedUserId.current = authenticatedUserId;
      setRemoteContextUserId(authenticatedUserId);
    } catch (error) {
      setDataError(
        error instanceof Error && error.message
          ? `Banco oficial indisponível: ${error.message}`
          : "Banco oficial temporariamente indisponível.",
      );
      throw error;
    }
  };

  // Não atualize o store inteiro em focus/visibility: esse padrão substituía
  // simultaneamente processos, plano, tema e permissões, causando cards,
  // cores e abas piscarem. Dados remotos são atualizados por bootstrap e
  // pelas operações que realmente modificam o processo.

  const updateStore = (updater: (current: PlatformStore) => PlatformStore) => {
    setStore((current) => {
      const next = updater(current);
      syncStore(next);
      return next;
    });
  };

  const value = useMemo<PlatformDataState>(() => {
    const metrics = getMasterMetrics(store.processes, store.tenants);
    const upsertInstitution: PlatformDataState["upsertInstitution"] = (input, options) => {
      if (hasBackendEnv && !options?.remoteConfirmed) {
        throw new Error(
          "A Prefeitura precisa ser persistida no banco oficial antes de atualizar o cache local.",
        );
      }

      const tenantId = input.institutionId ?? `tenant-${crypto.randomUUID()}`;
      const existing = store.tenants.find((item) => item.id === tenantId);

      const nextTenant: Tenant = {
        id: tenantId,
        name: input.name,
        city: input.city,
        state: input.state,
        status: input.status,
        plan: input.plan,
        activeModules: existing?.activeModules ?? ["Protocolo", "Análise", "Financeiro", "Assinatura", "Cadastro e Gestão", "Acesso Externo"],
        users: existing?.users ?? 0,
        processes: existing?.processes ?? 0,
        revenue: existing?.revenue ?? 0,
        subdomain: input.subdomain,
        theme: {
          primary: input.primaryColor,
          accent: input.accentColor,
        },
      };

      updateStore((current) => {
        const tenants = current.tenants.some((item) => item.id === tenantId)
          ? current.tenants.map((item) => (item.id === tenantId ? nextTenant : item))
          : [nextTenant, ...current.tenants];

        const existingSettings = current.tenantSettings.find((item) => item.tenantId === tenantId);
        const tenantSettings: InstitutionSettings[] = existingSettings
          ? current.tenantSettings
          : [
              {
                tenantId,
                cnpj: "",
                endereco: "",
                telefone: "",
                email: "",
                site: "",
                secretariaResponsavel: "",
                diretoriaResponsavel: "",
                diretoriaTelefone: "",
                diretoriaEmail: "",
                horarioAtendimento: "",
                brasaoUrl: "",
                bandeiraUrl: "",
                logoUrl: "",
                imagemHeroUrl: "",
                resumoPlanoDiretor: "",
                resumoUsoSolo: "",
                leisComplementares: "",
                linkPortalCliente: buildMunicipalityPortalUrl({
                  subdomain: input.subdomain || "",
                }),
                protocoloPrefixo: "PM",
                guiaPrefixo: "DAM",
                chavePix: "",
                beneficiarioArrecadacao: input.name,
                taxaProtocolo: 35.24,
                taxaIssPorMetroQuadrado: 0,
                taxaAprovacaoFinal: 0,
                approvalAliquotPercent: 5,
                registroProfissionalObrigatorio: true,
                contractNumber: "",
                contractStart: "",
                contractEnd: "",
                monthlyFee: 0,
                setupFee: 0,
                signatureMode: "eletronica",
                clientDeliveryLink: buildMunicipalityPortalUrl({
                  subdomain: input.subdomain || "",
                }),
                planoDiretorArquivoNome: "",
                planoDiretorArquivoUrl: "",
                usoSoloArquivoNome: "",
                usoSoloArquivoUrl: "",
                leisArquivoNome: "",
                leisArquivoUrl: "",
                logoAlt: `Logo institucional de ${input.name}`,
                logoUpdatedAt: "",
                logoUpdatedBy: "",
                logoFrameMode: "soft-square",
                logoFitMode: "contain",
                headerLogoScale: 1,
                headerLogoOffsetX: 0,
                headerLogoOffsetY: 0,
                footerLogoScale: 1,
                footerLogoOffsetX: 0,
                footerLogoOffsetY: 0,
                headerLogoFrameMode: "soft-square",
                headerLogoFitMode: "contain",
                footerLogoFrameMode: "soft-square",
                footerLogoFitMode: "contain",
              },
              ...current.tenantSettings,
            ];

        return { ...current, tenants, tenantSettings };
      });

      return nextTenant;
    };
    const saveInstitutionSettings: PlatformDataState["saveInstitutionSettings"] = async (settings, options) => {
      if (!options?.skipRemoteSync) {
        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível para salvar as configurações da Prefeitura.");
        }
        await saveRemoteInstitutionSettings(
          settings as unknown as Parameters<typeof saveRemoteInstitutionSettings>[0],
        );
      }

      updateStore((current) => {
        const tenantSettings = current.tenantSettings.some((item) => item.tenantId === settings.tenantId)
          ? current.tenantSettings.map((item) => (item.tenantId === settings.tenantId ? settings : item))
          : [settings, ...current.tenantSettings];

        // Valores de guias já emitidas são documentos financeiros históricos e
        // não podem ser recalculados retroativamente por uma mudança de tabela.
        return { ...current, tenantSettings };
      });
    };
    const setInstitutionStatus: PlatformDataState["setInstitutionStatus"] = async (tenantId, status) => {
      const tenant = store.tenants.find((item) => item.id === tenantId);
      if (!tenant) throw new Error("Prefeitura não encontrada.");
      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível para alterar o status da Prefeitura.");
      }

      const assignment = store.planAssignments.find((item) => item.municipalityId === tenantId);
      if (!assignment && status !== "suspenso") {
        throw new Error("Vincule um plano comercial antes de ativar esta Prefeitura.");
      }

      const settings = store.tenantSettings.find((item) => item.tenantId === tenantId);
      const saveInstitutionStatus = (nextStatus: Tenant["status"]) =>
        upsertRemoteInstitution({
          institutionId: tenantId,
          name: tenant.name,
          city: tenant.city,
          state: tenant.state,
          status: nextStatus,
          subdomain: tenant.subdomain,
          cnpj: settings?.cnpj ?? "",
          primaryColor: tenant.theme.primary,
          accentColor: tenant.theme.accent,
          secretariat: settings?.secretariaResponsavel ?? "",
        });

      await saveInstitutionStatus(status);

      if (assignment) {
        const previousContractStatus = assignment.contractStatus;
        const nextContractStatus =
          status === "suspenso"
            ? "suspenso"
            : previousContractStatus === "trial"
              ? "trial"
              : "ativo";
        try {
          await saveRemoteClientPlanAssignment({
            ...assignment,
            contractStatus: nextContractStatus,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          await saveInstitutionStatus(tenant.status).catch(() => undefined);
          throw error;
        }
      }

      await refreshRemoteStore();
    };
    const upsertPlan: PlatformDataState["upsertPlan"] = async (plan) => {
      const nextPlan: PlanItem = {
        ...plan,
        updatedAt: new Date().toISOString(),
      };

      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível para salvar o plano.");
      }

      await upsertRemotePlan(nextPlan);

      updateStore((current) => {
        const plans = current.plans.some((item) => item.id === nextPlan.id)
          ? current.plans.map((item) => (item.id === nextPlan.id ? nextPlan : item))
          : [...current.plans, nextPlan];

        return {
          ...current,
          plans: [...plans].sort(
            (left, right) =>
              left.displayOrder - right.displayOrder ||
              left.name.localeCompare(right.name, "pt-BR"),
          ),
        };
      });

      return nextPlan;
    };

    const duplicatePlan: PlatformDataState["duplicatePlan"] = async (planId) => {
      const sourcePlan = store.plans.find((item) => item.id === planId);
      if (!sourcePlan) return null;

      const duplicate: PlanItem = {
        ...sourcePlan,
        id: `plan-${crypto.randomUUID()}`,
        name: `${sourcePlan.name} Cópia`,
        badge: sourcePlan.badge || "Duplicado",
        isFeatured: false,
        displayOrder: store.plans.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível para duplicar o plano.");
      }

      await upsertRemotePlan(duplicate);

      updateStore((current) => ({
        ...current,
        plans: [...current.plans, duplicate].sort(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.name.localeCompare(right.name, "pt-BR"),
        ),
      }));

      return duplicate;
    };

    const saveClientPlanAssignment: PlatformDataState["saveClientPlanAssignment"] = async (assignment) => {
      const now = new Date().toISOString();
      const nextAssignment: ClientPlanAssignment = {
        ...assignment,
        id: assignment.id ?? `assignment-${crypto.randomUUID()}`,
        createdAt:
          store.planAssignments.find((item) => item.id === assignment.id)?.createdAt ??
          now,
        updatedAt: now,
      };

      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível para salvar o vínculo comercial.");
      }

      await saveRemoteClientPlanAssignment(nextAssignment);

      updateStore((current) => {
        const linkedPlan = current.plans.find((item) => item.id === nextAssignment.planId);
        const planAssignments = current.planAssignments.some((item) => item.id === nextAssignment.id)
          ? current.planAssignments.map((item) =>
              item.id === nextAssignment.id ? nextAssignment : item,
            )
          : [
              nextAssignment,
              ...current.planAssignments.filter(
                (item) => item.municipalityId !== nextAssignment.municipalityId,
              ),
            ];
        const tenants = current.tenants.map((tenant) =>
          tenant.id === nextAssignment.municipalityId
            ? {
                ...tenant,
                plan: linkedPlan?.name ?? tenant.plan,
                activeModules: linkedPlan?.modulesIncluded ?? tenant.activeModules,
              }
            : tenant,
        );

        return { ...current, planAssignments, tenants };
      });

      return nextAssignment;
    };

    const createOwnerRequestByProtocol: PlatformDataState["createOwnerRequestByProtocol"] = async (input) => {
      const normalizedProtocol = input.protocol.trim();
      const normalizedDocument = normalizeOwnerDocument(input.ownerDocument);

      if (!normalizedProtocol) {
        return { request: null, error: "Informe o número do protocolo." };
      }
      if (!normalizedDocument) {
        return { request: null, error: "Informe o CPF/CNPJ do proprietário." };
      }
      if (!hasBackendEnv) {
        return { request: null, error: "Banco oficial indisponível. A solicitação não foi criada." };
      }

      try {
        const result = await createRemoteOwnerRequestByProtocol({
          protocol: normalizedProtocol,
          ownerDocument: normalizedDocument,
          notes: input.notes?.trim() || undefined,
        });

        await refreshRemoteStore();
        return {
          request: result.request,
          process: result.process,
        };
      } catch (error) {
        return {
          request: null,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível enviar a solicitação agora.",
        };
      }
    };

    const respondOwnerRequest: PlatformDataState["respondOwnerRequest"] = async (input) => {
      const existingRequest = store.ownerRequests.find((item) => item.id === input.requestId);
      if (!existingRequest) return null;
      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível. A solicitação não foi alterada.");
      }

      const { request: remoteRequest } = await respondRemoteOwnerRequest({
        requestId: input.requestId,
        status: input.status,
        professionalUserId: input.professionalUserId,
        notes: input.notes,
      });

      await refreshRemoteStore();
      return remoteRequest;
    };

    const setOwnerChatEnabled: PlatformDataState["setOwnerChatEnabled"] = async (input) => {
      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível. A configuração do chat não foi alterada.");
      }

      const updated = await setRemoteOwnerChatEnabled({
        linkId: input.linkId,
        enabled: input.enabled,
        actor: input.actor,
      });

      await refreshRemoteStore();
      return updated;
    };

    const sendOwnerMessage: PlatformDataState["sendOwnerMessage"] = async (input) => {
      const normalized = input.message.trim();
      if (!normalized) return null;

      const linkSnapshot = store.ownerLinks.find(
        (item) =>
          item.projectId === input.projectId &&
          item.ownerUserId === input.ownerUserId &&
          item.professionalUserId === input.professionalUserId,
      );

      if (!linkSnapshot) return null;
      if (input.senderUserId === input.ownerUserId && !linkSnapshot.chatEnabled) return null;
      if (!hasBackendEnv) {
        throw new Error("Banco oficial indisponível. A mensagem não foi enviada.");
      }

      const message = await createRemoteOwnerMessage({
        linkId: linkSnapshot.id,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        professionalUserId: input.professionalUserId,
        senderUserId: input.senderUserId,
        message: normalized,
        isSystemMessage: input.isSystemMessage ?? false,
      });

      await refreshRemoteStore();
      return message;
    };

    const dataReadyForCurrentUser = Boolean(
      authenticatedUserId &&
      remoteContextUserId === authenticatedUserId &&
      !authLoading &&
      !loading &&
      (
        !expectsRemoteStore ||
        source === "remote" ||
        source === "warm"
      ),
    );

    return {
      source,
      loading,
      dataError,
      dataReadyForCurrentUser,
      refreshRemoteStore,
      ...store,
      institutions: store.tenants,
      institutionSettings: store.tenantSettings,
      metrics,
      getTenantSettings: (tenantId) => store.tenantSettings.find((item) => item.tenantId === tenantId),
      getInstitutionSettings: (institutionId) => store.tenantSettings.find((item) => item.tenantId === institutionId),
      getUserProfile: (userId, email) => findUserProfile(store.userProfiles, userId, email),
      getInstitutionPlanAssignment: (institutionId) => store.planAssignments.find((item) => item.municipalityId === institutionId),
      upsertInstitution,
      saveInstitutionSettings,
      upsertPlan,
      duplicatePlan,
      saveClientPlanAssignment,
      createOwnerRequestByProtocol,
      respondOwnerRequest,
      setOwnerChatEnabled,
      sendOwnerMessage,
      saveUserProfile: async (profile) => {
        const normalizedProfile: UserProfile = {
          ...profile,
          fullName: profile.fullName.trim() || "Usuário autenticado",
          email: normalizeEmail(profile.email || authenticatedEmail),
        };

        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível para salvar o perfil.");
        }

        const confirmedProfile = (await saveRemoteProfile(normalizedProfile)) ?? normalizedProfile;
        const persistedProfile: UserProfile = {
          ...normalizedProfile,
          ...confirmedProfile,
          userId: confirmedProfile.userId || normalizedProfile.userId,
          email: normalizeEmail(confirmedProfile.email || normalizedProfile.email),
        };

        updateStore((current) => {
          const userProfiles = current.userProfiles.some(
            (item) =>
              item.userId === persistedProfile.userId ||
              normalizeEmail(item.email) === normalizeEmail(persistedProfile.email),
          )
            ? current.userProfiles.map((item) =>
                item.userId === persistedProfile.userId ||
                normalizeEmail(item.email) === normalizeEmail(persistedProfile.email)
                  ? persistedProfile
                  : item,
              )
            : [persistedProfile, ...current.userProfiles];

          const cachedSession = readCachedPlatformSession();
          const existingUser = current.sessionUsers.find(
            (item) =>
              item.id === persistedProfile.userId ||
              normalizeEmail(item.email) === normalizeEmail(persistedProfile.email),
          );
          const safeRole =
            (existingUser?.role ?? cachedSession?.role ?? authenticatedRole ?? "profissional_externo") as SessionUser["role"];
          const safeAccessLevel =
            existingUser?.accessLevel ??
            cachedSession?.accessLevel ??
            (safeRole === "master_admin" || safeRole === "prefeitura_admin"
              ? 3
              : safeRole === "prefeitura_supervisor"
                ? 2
                : 1);
          const nextUser: SessionUser = normalizeSessionUserScope({
            id: existingUser?.id || persistedProfile.userId,
            name: persistedProfile.fullName,
            role: safeRole,
            accessLevel: safeAccessLevel,
            tenantId: existingUser?.tenantId ?? cachedSession?.tenantId ?? authenticatedMunicipalityId ?? null,
            municipalityId: existingUser?.municipalityId ?? cachedSession?.municipalityId ?? authenticatedMunicipalityId ?? null,
            title: existingUser?.title ?? cachedSession?.title ?? "Profissional Externo",
            email: persistedProfile.email,
            accountStatus: existingUser?.accountStatus ?? cachedSession?.accountStatus ?? "active",
            userType: existingUser?.userType ?? cachedSession?.userType ?? "Usuário",
            department: existingUser?.department ?? cachedSession?.department ?? "",
            createdAt: existingUser?.createdAt ?? cachedSession?.createdAt ?? "",
            lastAccessAt: existingUser?.lastAccessAt ?? cachedSession?.lastAccessAt ?? "",
            blockedAt: existingUser?.blockedAt ?? cachedSession?.blockedAt ?? null,
            blockedBy: existingUser?.blockedBy ?? cachedSession?.blockedBy ?? null,
            blockReason: existingUser?.blockReason ?? cachedSession?.blockReason ?? null,
            deletedAt: existingUser?.deletedAt ?? cachedSession?.deletedAt ?? null,
          });

          const sessionUsers = existingUser
            ? current.sessionUsers.map((item) =>
                item.id === existingUser.id || normalizeEmail(item.email) === normalizeEmail(persistedProfile.email)
                  ? nextUser
                  : item,
              )
            : [nextUser, ...current.sessionUsers];

          return { ...current, userProfiles, sessionUsers };
        });

        syncProfileVisualCache(persistedProfile);
        syncProfileToPlatformSession(persistedProfile, {
          role: authenticatedRole as SessionUser["role"],
          email: authenticatedEmail ?? undefined,
          municipalityId: authenticatedMunicipalityId ?? null,
          tenantId: authenticatedMunicipalityId ?? null,
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("sigapro-profile-updated", {
              detail: persistedProfile,
            }),
          );
        }
        return persistedProfile;
      },
      createTenantUser: async (input) => {
        if (!hasBackendEnv) throw new Error("Conexão com o banco indisponível.");
        const saved = await linkExistingMunicipalStaff({
          email: input.email,
          municipalityId: input.tenantId,
          role: input.role,
          name: input.fullName,
          title: input.title,
          accessLevel: input.accessLevel,
          temporaryPassword: input.temporaryPassword,
        });
        const user: SessionUser = {
          id: saved.userId,
          tenantId: input.tenantId,
          municipalityId: input.tenantId,
          email: saved.email,
          name: saved.name,
          role: saved.role,
          title: saved.title,
          department: saved.title,
          accessLevel: saved.accessLevel,
          accountStatus: saved.accountStatus,
          userType: saved.userType,
          blockedAt: saved.blockedAt,
          blockedBy: saved.blockedBy,
          blockReason: saved.blockReason,
        };
        updateStore((current) => ({
          ...current,
          sessionUsers: [user, ...current.sessionUsers.filter((item) => item.id !== user.id)],
        }));
        return user;
      },
      updateTenantUser: async (userId, input) => {
        const currentUser = store.sessionUsers.find((item) => item.id === userId);
        if (!currentUser) return null;

        if (input.email && normalizeEmail(input.email) !== normalizeEmail(currentUser.email)) {
          throw new Error("O e-mail de acesso não pode ser alterado nesta edição. Use o fluxo de segurança da conta.");
        }

        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível. O usuário não foi alterado.");
        }

        const remote = await manageRemoteUserAccess({
          userId,
          municipalityId: currentUser.municipalityId ?? currentUser.tenantId ?? "",
          role: input.role ?? currentUser.role,
          name: input.name ?? currentUser.name,
          title: input.title ?? currentUser.title,
          profileLabel: input.profileLabel ?? currentUser.profileLabel ?? "",
          accessLevel: input.accessLevel ?? currentUser.accessLevel,
        });

        const nextUser: SessionUser = {
          ...currentUser,
          ...input,
          ...remote,
          department: input.department ?? currentUser.department ?? remote?.title ?? input.title ?? currentUser.title,
        };

        updateStore((current) => ({
          ...current,
          sessionUsers: current.sessionUsers.map((item) => (item.id === userId ? nextUser : item)),
          userProfiles: current.userProfiles.map((profile) =>
            profile.userId === userId
              ? {
                  ...profile,
                  fullName: input.name ?? profile.fullName,
                  email: input.email ?? profile.email,
                }
              : profile,
          ),
        }));

        return nextUser;
      },
      setUserAccountStatus: async ({ userId, status, actor, reason }) => {
        const currentUser = store.sessionUsers.find((item) => item.id === userId);
        if (!currentUser) return null;

        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível. O status da conta não foi alterado.");
        }

        const remote = await manageRemoteUserAccess({
          userId,
          municipalityId: currentUser.municipalityId ?? currentUser.tenantId ?? "",
          accountStatus: status,
          reason,
        });

        const nextUser: SessionUser = {
          ...currentUser,
          accountStatus: status,
          blockedAt: status === "blocked" ? new Date().toISOString() : null,
          blockedBy: status === "blocked" ? actor : null,
          blockReason: status === "blocked" ? reason?.trim() || "Bloqueio administrativo" : null,
          deletedAt: status === "inactive" ? currentUser.deletedAt ?? new Date().toISOString() : null,
          ...remote,
        };

        updateStore((current) => ({
          ...current,
          sessionUsers: current.sessionUsers.map((item) => (item.id === userId ? nextUser : item)),
        }));

        return nextUser;
      },
      deleteUserAccount: async ({ userId, actor, reason }) => {
        const currentUser = store.sessionUsers.find((item) => item.id === userId);
        if (!currentUser) return null;

        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível. A conta não foi desativada.");
        }

        const remote = await manageRemoteUserAccess({
          userId,
          municipalityId: currentUser.municipalityId ?? currentUser.tenantId ?? "",
          accountStatus: "inactive",
          reason,
        });

        const nextUser: SessionUser = {
          ...currentUser,
          accountStatus: "inactive",
          deletedAt: new Date().toISOString(),
          blockedBy: actor,
          blockReason: reason?.trim() || "Conta desativada administrativamente",
          ...remote,
        };

        updateStore((current) => ({
          ...current,
          sessionUsers: current.sessionUsers.map((item) => (item.id === userId ? nextUser : item)),
        }));

        return nextUser;
      },
      createRequirement: async (input) => {
        const normalizedTitle = input.title.trim();
        const normalizedDescription = input.description.trim();
        if (!normalizedTitle || !normalizedDescription) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para criar exigência.");

        await createRemoteProcessRequirement({
          processId: input.processId,
          title: normalizedTitle,
          description: normalizedDescription,
          dueAt: input.dueDate ? new Date(`${input.dueDate}T23:59:59`).toISOString() : null,
          targetName: input.targetName,
          visibility: input.visibility,
        });
        await refreshRemoteStore();
      },
      respondRequirement: async (input) => {
        const normalized = input.response.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para responder exigência.");

        await respondRemoteProcessRequirement(input.requirementId, normalized);
        await refreshRemoteStore();
      },
      completeRequirement: async (input) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para concluir exigência.");

        await completeRemoteProcessRequirement(input.requirementId);
        await refreshRemoteStore();
      },
      updateProcessStatus: async ({ processId, status, actor, detail, title }) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para atualizar status.");

        await setRemoteProcessStatus({
          processId,
          status,
          detail,
          title,
        });
        await refreshRemoteStore();
      },
      updateProcessTriage: async ({ processId, status, actor, notes }) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para atualizar a triagem.");

        await setRemoteProcessTriage({
          processId,
          status,
          notes,
        });
        await refreshRemoteStore();
      },
      startProcessAnalysis: async (processId) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para iniciar análise.");

        await startRemoteProcessAnalysis(processId);
        await refreshRemoteStore();
      },
      beginAnalysisSupervisorIntervention: async ({ processId, reason, minutes }) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para iniciar intervenção.");
        await beginRemoteAnalysisSupervisorIntervention({ processId, reason, minutes });
        await refreshRemoteStore();
      },
      endAnalysisSupervisorIntervention: async (processId) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para encerrar intervenção.");
        await endRemoteAnalysisSupervisorIntervention(processId);
        await refreshRemoteStore();
      },
      reassignProcessAnalysis: async ({ processId, targetProfileId, reason }) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para redistribuir análise.");
        await reassignRemoteProcessAnalysis({ processId, targetProfileId, reason });
        await refreshRemoteStore();
      },
      reopenProcess: async ({ processId, actor, reason }) => {
        const normalized = reason.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para reabrir processo.");

        await reopenRemoteProcess(processId, normalized);
        await refreshRemoteStore();
      },
      requestConstructionPaymentGuide: async (processId, actor) => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para encaminhar o ISSQN / Projeto ao Financeiro.");
        }

        const process = store.processes.find((item) => item.id === processId);
        if (!process) throw new Error("Processo não encontrado.");

        const uploadedDocuments = process.documents.filter((document) => document.uploaded);
        const allDocumentsApproved =
          uploadedDocuments.length > 0 &&
          process.documents
            .filter((document) => document.required || document.uploaded)
            .every((document) => document.uploaded && document.reviewStatus === "aprovado");

        if (!allDocumentsApproved) {
          throw new Error(
            "Todos os documentos e projetos obrigatórios precisam estar enviados e aprovados antes do encaminhamento.",
          );
        }

        if (
          process.requirements.some(
            (requirement) => requirement.status === "aberta" || requirement.status === "respondida",
          )
        ) {
          throw new Error("Conclua os Comunique-se e exigências pendentes antes de encaminhar ao Financeiro.");
        }

        const alreadyRequested = process.dispatches.some(
          (dispatch) =>
            /(issqn|iss|projeto).*guia|guia.*(issqn|iss|projeto)/i.test(dispatch.subject) &&
            ["aguardando", "respondido"].includes(dispatch.status),
        );
        if (alreadyRequested) {
          throw new Error("A emissão da Guia de ISSQN / Projeto já foi encaminhada ao Financeiro.");
        }

        await createRemoteProcessDispatch({
          processId,
          from: process.processControl?.currentFolder || "Análise Urbanística",
          to: "Financeiro",
          subject: "Solicitação de emissão — Guia de ISSQN / Projeto",
          visibility: "interno",
          priority: "media",
        });

        await refreshRemoteStore();
      },
      updateIssProjectGuideData: async ({ processId, areaM2, usage, workType }) => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para salvar os dados do ISSQN / Projeto.");
        }

        await updateRemoteProcessIssProjectData({
          processId,
          areaM2,
          usage,
          workType,
        });
        await refreshRemoteStore();
      },
      reviseIssProjectGuide: async ({ processId, areaM2, usage, workType }) => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para revisar a guia.");
        }

        await reviseRemoteIssProjectGuide({
          processId,
          areaM2,
          usage,
          workType,
        });
        await refreshRemoteStore();
      },
      shareIssProjectGuide: async (processId) => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para liberar a guia ao profissional.");
        }

        await shareRemoteIssProjectGuide(processId);
        await refreshRemoteStore();
      },
      issuePaymentGuide: async (processId, actor, guideKind) => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para emitir a guia.");
        }

        const process = store.processes.find((item) => item.id === processId);
        if (!process) throw new Error("Processo não encontrado.");

        if (isOccupancyPermitProcessType(process.type)) {
          throw new Error(
            "Habite-se possui protocolo e workflow próprios. Não é permitido emitir ISSQN / Projeto nem guia de aprovação / Alvará dentro deste processo.",
          );
        }

        const settings = store.tenantSettings.find(
          (item) => item.tenantId === (process.municipalityId ?? process.tenantId),
        );

        if (guideKind === "iss_obra" && settings?.issStageEnabled === false) {
          throw new Error("A etapa de ISSQN está desativada nas regras financeiras desta Prefeitura.");
        }
        if (guideKind === "iss_obra" && !isIssFeeConfigured(settings)) {
          throw new Error("A tabela de ISSQN ainda não foi configurada pela Prefeitura.");
        }
        if (guideKind === "aprovacao_final" && settings?.finalApprovalFeeEnabled === false) {
          throw new Error("A guia de aprovação / Alvará está desativada nas regras financeiras desta Prefeitura.");
        }
        if (guideKind === "aprovacao_final" && !isFinalApprovalFeeConfigured(settings)) {
          throw new Error("A tabela oficial da aprovação / Alvará ainda não foi configurada pela Prefeitura.");
        }

        await issueRemoteProcessPaymentGuide({
          processId,
          guideKind,
        });

        if (guideKind === "iss_obra") {
          const pendingRequest = process.dispatches.find(
            (dispatch) =>
              /(issqn|iss|projeto).*guia|guia.*(issqn|iss|projeto)/i.test(dispatch.subject) &&
              ["aguardando", "respondido"].includes(dispatch.status),
          );
          if (pendingRequest) {
            await completeRemoteProcessDispatch(
              pendingRequest.id,
              "Financeiro",
            );
          }
        }

        await refreshRemoteStore();
      },
      markGuideAsPaid: async (processId, actor, guideKind = "protocolo") => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para confirmar o pagamento.");
        }

        await confirmRemoteProcessPaymentGuide({
          processId,
          guideKind,
        });

        await refreshRemoteStore();
      },
      appendProcessDocuments: async (processId, documents, actor) => {
        if (documents.length === 0) {
          return { process_id: processId, synced: 0, inserted: 0, updated: 0, stored: 0 };
        }
        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível para anexar documentos.");
        }

        const result = await appendRemoteProcessDocuments(processId, documents) as {
          process_id: string;
          synced: number;
          inserted: number;
          updated: number;
          stored: number;
        };
        await refreshRemoteStore();
        return result;
      },
      reviewProcessDocument: async (processId, documentId, status, actor) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para revisar documento.");

        await reviewRemoteProcessDocument(documentId, status);
        await refreshRemoteStore();
      },
      addDocumentAnnotation: async (processId, documentId, annotation) => {
        const normalized = annotation.note.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para anotar documento.");

        await annotateRemoteProcessDocument({
          documentId,
          kind: annotation.kind,
          page: annotation.page,
          x: annotation.x,
          y: annotation.y,
          width: annotation.width,
          height: annotation.height,
          note: normalized,
        });
        await refreshRemoteStore();
      },
      addProcessMarker: async (processId, marker, actor) => {
        const normalized = marker.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para salvar marcador.");

        await upsertRemoteProcessMarker(processId, normalized, "#2563eb");
        const serialized = serializeMarker(normalized, "#2563eb");

        updateStore((current) => ({
          ...current,
          processes: current.processes.map((process) => {
            if (process.id !== processId) return process;
            const nextTags = (process.tags ?? []).filter(
              (tag) => parseMarker(tag).label.trim().toLowerCase() !== normalized.toLowerCase(),
            );
            return { ...process, tags: [...nextTags, serialized] };
          }),
        }));
      },
      addProcessMarkerWithColor: async (processId, marker, color, actor) => {
        const normalized = marker.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para salvar marcador.");

        await upsertRemoteProcessMarker(processId, normalized, color);
        const serialized = serializeMarker(normalized, color);

        updateStore((current) => ({
          ...current,
          processes: current.processes.map((process) => {
            if (process.id !== processId) return process;
            const nextTags = (process.tags ?? []).filter(
              (tag) => parseMarker(tag).label.trim().toLowerCase() !== normalized.toLowerCase(),
            );
            return { ...process, tags: [...nextTags, serialized] };
          }),
        }));
      },
      removeProcessMarker: async (processId, marker, actor) => {
        const parsedMarker = parseMarker(marker);
        const normalizedLabel = parsedMarker.label.trim();
        if (!normalizedLabel) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para remover marcador.");

        await removeRemoteProcessMarkerByLabel(processId, normalizedLabel);

        updateStore((current) => ({
          ...current,
          processes: current.processes.map((process) =>
            process.id !== processId
              ? process
              : {
                  ...process,
                  tags: (process.tags ?? []).filter(
                    (tag) =>
                      parseMarker(tag).label.trim().toLowerCase() !== normalizedLabel.toLowerCase(),
                  ),
                },
          ),
        }));
      },
      setInstitutionStatus,
      dispatchProcess: async ({ processId, actor, from, to, subject, dueDate, visibility, priority, assignedTo }) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para despachar processo.");

        await createRemoteProcessDispatch({
          processId,
          from,
          to,
          subject,
          dueAt: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
          visibility: visibility ?? "interno",
          priority: priority ?? "media",
          assignedTo: assignedTo || null,
        });
        await refreshRemoteStore();
      },
      acknowledgeDispatchReceipt: async ({ processIds, actor, unit }) => {
        if (processIds.length === 0) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para receber despacho.");

        const targets = store.processes
          .filter((process) => processIds.includes(process.id))
          .map((process) => findOperationalDispatch(process, unit, ["aguardando"])?.id)
          .filter((id): id is string => Boolean(id));

        if (targets.length === 0) {
          throw new Error("Nenhum despacho aguardando recebimento foi encontrado para esta unidade.");
        }

        await Promise.all(targets.map((dispatchId) => acknowledgeRemoteProcessDispatch(dispatchId, unit)));
        await refreshRemoteStore();
      },
      completeDispatches: async ({ processIds, actor, unit }) => {
        if (processIds.length === 0) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para concluir despacho.");

        const targets = store.processes
          .filter((process) => processIds.includes(process.id))
          .map((process) =>
            findOperationalDispatch(process, unit, ["aguardando", "respondido"])?.id,
          )
          .filter((id): id is string => Boolean(id));

        if (targets.length === 0) {
          throw new Error("Nenhum despacho ativo foi encontrado para conclusão nesta unidade.");
        }

        await Promise.all(targets.map((dispatchId) => completeRemoteProcessDispatch(dispatchId, unit)));
        await refreshRemoteStore();
      },
      returnDispatches: async ({ processIds, actor, unit, reason }) => {
        if (processIds.length === 0) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para devolver despacho.");

        const targets = store.processes
          .filter((process) => processIds.includes(process.id))
          .map((process) =>
            findOperationalDispatch(process, unit, ["aguardando", "respondido"])?.id,
          )
          .filter((id): id is string => Boolean(id));

        if (targets.length === 0) {
          throw new Error("Nenhum despacho ativo foi encontrado para devolução nesta unidade.");
        }

        await Promise.all(
          targets.map((dispatchId) => returnRemoteProcessDispatch(dispatchId, unit, reason?.trim() || null)),
        );
        await refreshRemoteStore();
      },
      setProcessCheckpoint: async ({ processIds, actor, checkpoint }) => {
        const normalized = checkpoint.trim();
        if (processIds.length === 0 || !normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para definir checkpoint.");

        await Promise.all(processIds.map((processId) => setRemoteProcessCheckpoint(processId, normalized)));
        await refreshRemoteStore();
      },
      setProcessOnHold: async ({ processIds, actor, onHold, reason }) => {
        if (processIds.length === 0) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para alterar sobrestamento.");

        await Promise.all(
          processIds.map((processId) =>
            setRemoteProcessHold({
              processId,
              onHold,
              reason: reason?.trim() || null,
            }),
          ),
        );
        await refreshRemoteStore();
      },
      setProcessTransitVisibility: async ({ processId, actor, visibility }) => {
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para alterar visibilidade.");

        await setRemoteProcessTransitVisibility(processId, visibility);
        await refreshRemoteStore();
      },
      sendProcessMessage: async ({ processId, senderName, senderRole, audience, recipientName, message }) => {
        const normalized = message.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para enviar mensagem.");

        await sendRemoteProcessMessage({
          processId,
          audience,
          recipientName: recipientName || null,
          message: normalized,
        });
        await refreshRemoteStore();
      },
      reissuePaymentGuide: async (processId, actor, guideKind = "protocolo") => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para reemitir a guia.");
        }

        await reissueRemoteProcessPaymentGuide({
          processId,
          guideKind,
        });

        await refreshRemoteStore();
      }
    };
  }, [
    authenticatedEmail,
    authenticatedMunicipalityId,
    authenticatedRole,
    authenticatedUserId,
    authLoading,
    dataError,
    expectsRemoteStore,
    loading,
    remoteContextUserId,
    source,
    store,
  ]);

  return <PlatformDataContext.Provider value={value}>{children}</PlatformDataContext.Provider>;
}

export function usePlatformData() {
  const context = useContext(PlatformDataContext);
  if (!context) {
    throw new Error("usePlatformData must be used inside PlatformDataProvider");
  }
  return context;
}
