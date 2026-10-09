/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  type AccountStatus,
  buildProcessDocuments,
  calculateApprovalGuideAmount,
  calculateIssGuideAmount,
  checklistTemplates as seedChecklistTemplates,
  cmsSections as seedCmsSections,
  clientPlanAssignments as seedClientPlanAssignments,
  documentTemplates as seedDocumentTemplates,
  getMasterMetrics,
  matchesOwnerDocument,
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
import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import {
  acknowledgeRemoteProcessDispatch,
  annotateRemoteProcessDocument,
  appendRemoteProcessDocuments,
  completeRemoteProcessDispatch,
  completeRemoteProcessRequirement,
  confirmRemoteProcessPaymentGuide,
  createRemoteOwnerMessage,
  createRemoteProcessDispatch,
  createRemoteProcessRequirement,
  createRemoteOwnerRequest,
  issueRemoteProcessPaymentGuide,
  loadRemotePlatformStore,
  linkExistingMunicipalStaff,
  manageRemoteUserAccess,
  reissueRemoteProcessPaymentGuide,
  removeRemoteProcessMarkerByLabel,
  reopenRemoteProcess,
  respondRemoteOwnerRequest,
  respondRemoteProcessRequirement,
  returnRemoteProcessDispatch,
  reviewRemoteProcessDocument,
  saveRemoteClientPlanAssignment,
  saveRemoteInstitutionSettings,
  saveRemoteProfile,
  sendRemoteProcessMessage,
  setRemoteOwnerChatEnabled,
  setRemoteProcessCheckpoint,
  setRemoteProcessHold,
  setRemoteProcessStatus,
  setRemoteProcessTransitVisibility,
  upsertRemoteInstitution,
  upsertRemotePlan,
  upsertRemoteProcessMarker,
} from "@/integrations/backend/platform";

type CmsSection = (typeof seedCmsSections)[number];
type DocumentTemplate = (typeof seedDocumentTemplates)[number];
type DataSource = "demo" | "local" | "remote";

interface PlatformDataState {
  source: DataSource;
  loading: boolean;
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
  }) => Institution;
  saveInstitutionSettings: (settings: InstitutionSettings, options?: { skipRemoteSync?: boolean }) => Promise<void>;
  getInstitutionPlanAssignment: (institutionId: string | null | undefined) => ClientPlanAssignment | undefined;
  upsertPlan: (plan: PlanItem) => Promise<PlanItem>;
  duplicatePlan: (planId: string) => Promise<PlanItem | null>;
  saveClientPlanAssignment: (assignment: Omit<ClientPlanAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<ClientPlanAssignment>;
  createOwnerRequest: (input: {
    processId: string;
    ownerUserId: string;
    ownerDocument: string;
    notes?: string;
  }) => Promise<{ request: OwnerProjectRequest | null; error?: string }>;
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
  saveUserProfile: (profile: UserProfile) => Promise<void>;
  createTenantUser: (input: TenantUserInput) => Promise<SessionUser>;
  updateTenantUser: (userId: string, input: Partial<Pick<SessionUser, "name" | "email" | "role" | "accessLevel" | "title" | "department" | "userType">>) => Promise<SessionUser | null>;
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
  reopenProcess: (input: { processId: string; actor: string; reason: string }) => Promise<void>;
  issuePaymentGuide: (processId: string, actor: string, guideKind: "iss_obra" | "aprovacao_final") => Promise<void>;
  markGuideAsPaid: (processId: string, actor: string, guideKind?: "protocolo" | "iss_obra" | "aprovacao_final") => Promise<void>;
  appendProcessDocuments: (processId: string, documents: ProcessDocument[], actor: string) => Promise<void>;
  reviewProcessDocument: (processId: string, documentId: string, status: "aprovado" | "rejeitado", actor: string) => Promise<void>;
  addDocumentAnnotation: (processId: string, documentId: string, annotation: { x: number; y: number; note: string; author: string }) => Promise<void>;
  addProcessMarker: (processId: string, marker: string, actor: string) => Promise<void>;
  addProcessMarkerWithColor: (processId: string, marker: string, color: string, actor: string) => Promise<void>;
  removeProcessMarker: (processId: string, marker: string, actor: string) => Promise<void>;
  setInstitutionStatus: (institutionId: string, status: Tenant["status"]) => Promise<void>;
  dispatchProcess: (input: { processId: string; actor: string; from: string; to: string; subject: string; dueDate: string; visibility?: "interno" | "externo" | "misto"; priority?: "baixa" | "media" | "alta" | "critica"; assignedTo?: string }) => Promise<void>;
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
type DeletedRecords = {
  institutions: string[];
};
const LEGACY_DEMO_TENANT_NAMES = new Set([
  "prefeitura de jardim da serra",
  "prefeitura jardim da serra",
  "prefeitura municipal de jardim da serra",
  "prefeitura de ribeira nova",
  "prefeitura municipal de ribeira nova",
  "sigapro plataforma",
]);

const defaultStore: PlatformStore = {
  tenants: seedTenants,
  tenantSettings: seedTenantSettings,
  sessionUsers: seedSessionUsers,
  userProfiles: seedUserProfiles,
  ownerRequests: seedOwnerRequests,
  ownerLinks: seedOwnerLinks,
  ownerMessages: seedOwnerMessages,
  processes: seedProcessRecords,
  plans: seedPlanCatalog,
  planAssignments: seedClientPlanAssignments,
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

  // Cache operacional é permitido somente no ambiente local de desenvolvimento.
  // Em produção, perfis/processos/documentos permanecem apenas em memória.
  if (hasBackendEnv && !isLocalDevHost()) {
    window.localStorage.removeItem(STORAGE_KEY);
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

  // Em produção, dados operacionais nunca são restaurados do navegador.
  // O Neon é a única fonte persistente; o bootstrap começa apenas com catálogo estático.
  if (hasBackendEnv && !localDev) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return {
      store: staticCatalogStore,
      source: "local" as const,
    };
  }

  const initialStore = readStore();
  return {
    store: initialStore,
    source: initialStore === defaultStore ? ("demo" as const) : ("local" as const),
  };
}

function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? Number((error as { status?: number }).status) : NaN;
  return status === 401 || status === 403;
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
  const lastFetchedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const allowRemoteInLocal =
      (import.meta.env.VITE_FORCE_REMOTE_STORE as string | undefined) === "true";
    const localDev = isLocalDevHost();

    const bootstrap = async () => {
      if (authLoading) return;

      if (!authenticatedUserId || (localDev && !allowRemoteInLocal) || !hasBackendEnv) {
        if (!active) return;

        if (hasBackendEnv && !localDev) {
          // Sessão ausente/expirada em produção: mantém apenas catálogo estático,
          // nunca restaura processos, usuários, guias ou Prefeituras do navegador.
          setStore(staticCatalogStore);
          setSource("local");
          setLoading(false);
          return;
        }

        const nextStore = readStore();
        setStore(nextStore);
        setSource(nextStore === defaultStore ? "demo" : "local");
        setLoading(false);
        return;
      }

      if (lastFetchedUserId.current === authenticatedUserId && source === "remote") {
        setLoading(false);
        return;
      }

      // Mantem a UI com o ultimo estado valido enquanto sincroniza o remoto.
      setLoading(false);
      try {
        const remote = await loadRemotePlatformStore();
        const sanitized = buildSanitizedStore(remote, false);
        if (!active) return;
        setStore(sanitized);
        syncStore(sanitized);
        setSource("remote");
        lastFetchedUserId.current = authenticatedUserId;
      } catch (error) {
        if (!active) return;
        if (isAuthError(error) && backendClient) {
          await backendClient.auth.signOut();
        }
        const nextStore =
          hasBackendEnv && !localDev
            ? staticCatalogStore
            : readPersistedStore() ?? buildSanitizedStore({}, false);
        setStore(nextStore);
        setSource("local");
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
      throw new Error("Sessão ou banco oficial indisponível para atualizar os dados.");
    }

    const remote = await loadRemotePlatformStore();
    const sanitized = buildSanitizedStore(remote, false);
    setStore(sanitized);
    syncStore(sanitized);
    setSource("remote");
    lastFetchedUserId.current = authenticatedUserId;
  };

  useEffect(() => {
    if (!authenticatedUserId || !hasBackendEnv) return;

    let lastRefreshAt = 0;
    const refreshOnFocus = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 1500) return;
      lastRefreshAt = now;
      void refreshRemoteStore().catch((error) => {
        console.error("[SIGAPRO][Store] Falha na atualização automática", error);
      });
    };
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [authenticatedUserId]);

  const updateStore = (updater: (current: PlatformStore) => PlatformStore) => {
    setStore((current) => {
      const next = updater(current);
      syncStore(next);
      return next;
    });
  };

  const value = useMemo<PlatformDataState>(() => {
    const metrics = getMasterMetrics(store.processes, store.tenants);
    const upsertInstitution: PlatformDataState["upsertInstitution"] = (input) => {
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
        const tenantSettings = existingSettings
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

      const settings = store.tenantSettings.find((item) => item.tenantId === tenantId);
      await upsertRemoteInstitution({
        institutionId: tenantId,
        name: tenant.name,
        city: tenant.city,
        state: tenant.state,
        status,
        subdomain: tenant.subdomain,
        cnpj: settings?.cnpj ?? "",
        primaryColor: tenant.theme.primary,
        accentColor: tenant.theme.accent,
        secretariat: settings?.secretariaResponsavel ?? "",
      });

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
            ? { ...tenant, plan: linkedPlan?.name ?? tenant.plan }
            : tenant,
        );

        return { ...current, planAssignments, tenants };
      });

      return nextAssignment;
    };

    const resolveProfessionalId = (process: ProcessRecord) => {
      const normalize = (value: string) => value.trim().toLowerCase();
      const candidates = [process.createdBy, process.technicalLead].filter(Boolean) as string[];
      const normalizedCandidates = candidates.map(normalize);

      const matchById = store.sessionUsers.find(
        (user) => user.role === "profissional_externo" && candidates.includes(user.id),
      );
      if (matchById) return matchById.id;

      const matchByName = store.sessionUsers.find(
        (user) =>
          user.role === "profissional_externo" &&
          normalizedCandidates.includes(normalize(user.name)),
      );

      if (matchByName) return matchByName.id;

      const matchByProfile = store.userProfiles.find(
        (profile) =>
          profile.email &&
          candidates.some((candidate) => normalize(profile.email) === normalize(candidate)),
      );

      if (matchByProfile) {
        const user = store.sessionUsers.find((sessionUser) => sessionUser.id === matchByProfile.userId);
        return user?.id ?? null;
      }

      return null;
    };

    const createOwnerRequest: PlatformDataState["createOwnerRequest"] = async (input) => {
      const normalizedDocument = normalizeOwnerDocument(input.ownerDocument);
      if (!normalizedDocument) {
        return { request: null, error: "Informe o CPF/CNPJ para solicitar acompanhamento." };
      }

      const process = store.processes.find((item) => item.id === input.processId);
      if (!process) {
        return { request: null, error: "Processo não encontrado." };
      }

      const normalizedStoredDocument = normalizeOwnerDocument(process.ownerDocument ?? "");
      if (normalizedStoredDocument && !matchesOwnerDocument(normalizedDocument, normalizedStoredDocument)) {
        return { request: null, error: "Documento não confere com o cadastro do processo." };
      }

      const professionalId = resolveProfessionalId(process);
      if (!professionalId) {
        return { request: null, error: "Processo sem profissional responsável." };
      }

      const hasLink = store.ownerLinks.some(
        (link) =>
          link.projectId === process.id &&
          link.ownerUserId === input.ownerUserId &&
          link.professionalUserId === professionalId,
      );
      if (hasLink) {
        return { request: null, error: "Acompanhamento já aprovado para este processo." };
      }

      const existing = store.ownerRequests.find(
        (request) =>
          request.projectId === process.id &&
          request.ownerUserId === input.ownerUserId &&
          request.status === "pending",
      );
      if (existing) {
        return { request: null, error: "Sua solicitação já está em análise." };
      }

      if (!hasBackendEnv) {
        return { request: null, error: "Banco oficial indisponível. A solicitação não foi criada." };
      }

      try {
        const remoteRequest = await createRemoteOwnerRequest({
          processId: process.id,
          ownerUserId: input.ownerUserId,
          professionalUserId: professionalId,
          ownerDocument: normalizedDocument,
          notes: input.notes?.trim() || undefined,
        });

        await refreshRemoteStore();
        return { request: remoteRequest };
      } catch (remoteError) {
        return {
          request: null,
          error:
            remoteError instanceof Error
              ? remoteError.message
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

    return {
      source,
      loading,
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
      createOwnerRequest,
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

        await saveRemoteProfile(normalizedProfile);

        updateStore((current) => {
          const userProfiles = current.userProfiles.some((item) => item.userId === normalizedProfile.userId)
            ? current.userProfiles.map((item) => (item.userId === normalizedProfile.userId ? normalizedProfile : item))
            : [normalizedProfile, ...current.userProfiles];

          const cachedSession = readCachedPlatformSession();
          const existingUser = current.sessionUsers.find((item) => item.id === normalizedProfile.userId);
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
            id: normalizedProfile.userId,
            name: normalizedProfile.fullName,
            role: safeRole,
            accessLevel: safeAccessLevel,
            tenantId: existingUser?.tenantId ?? cachedSession?.tenantId ?? authenticatedMunicipalityId ?? null,
            municipalityId: existingUser?.municipalityId ?? cachedSession?.municipalityId ?? authenticatedMunicipalityId ?? null,
            title: existingUser?.title ?? cachedSession?.title ?? "Profissional Externo",
            email: normalizedProfile.email,
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
            ? current.sessionUsers.map((item) => (item.id === normalizedProfile.userId ? nextUser : item))
            : [nextUser, ...current.sessionUsers];

          return { ...current, userProfiles, sessionUsers };
        });

        syncProfileToPlatformSession(normalizedProfile, {
          role: authenticatedRole as SessionUser["role"],
          email: authenticatedEmail ?? undefined,
          municipalityId: authenticatedMunicipalityId ?? null,
          tenantId: authenticatedMunicipalityId ?? null,
        });
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
          title: input.title ?? input.department ?? currentUser.title,
          accessLevel: input.accessLevel ?? currentUser.accessLevel,
        });

        const nextUser: SessionUser = {
          ...currentUser,
          ...input,
          ...remote,
          department: remote?.title ?? input.department ?? input.title ?? currentUser.department ?? currentUser.title,
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
      reopenProcess: async ({ processId, actor, reason }) => {
        const normalized = reason.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para reabrir processo.");

        await reopenRemoteProcess(processId, normalized);
        await refreshRemoteStore();
      },
      issuePaymentGuide: async (processId, actor, guideKind) => {
        if (!hasBackendEnv) {
          throw new Error("O banco oficial está indisponível para emitir a guia.");
        }

        const process = store.processes.find((item) => item.id === processId);
        if (!process) throw new Error("Processo não encontrado.");

        const settings = store.tenantSettings.find(
          (item) => item.tenantId === (process.municipalityId ?? process.tenantId),
        );

        const amount =
          guideKind === "iss_obra"
            ? calculateIssGuideAmount(
                process.property.area || 0,
                process.property.usage,
                settings,
              )
            : calculateApprovalGuideAmount(
                process.property.area || 0,
                process.property.usage,
                process.property.constructionStandard,
                settings,
              );

        await issueRemoteProcessPaymentGuide({
          processId,
          guideKind,
          amount,
          guidePrefix: settings?.guiaPrefixo || "DAM",
        });

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
        if (documents.length === 0) return;
        if (!hasBackendEnv) {
          throw new Error("Banco oficial indisponível para anexar documentos.");
        }

        await appendRemoteProcessDocuments(processId, documents);
        await refreshRemoteStore();
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
          x: annotation.x,
          y: annotation.y,
          note: normalized,
        });
        await refreshRemoteStore();
      },
      addProcessMarker: async (processId, marker, actor) => {
        const normalized = marker.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para salvar marcador.");

        await upsertRemoteProcessMarker(processId, normalized, "#2563eb");
        await refreshRemoteStore();
      },
      addProcessMarkerWithColor: async (processId, marker, color, actor) => {
        const normalized = marker.trim();
        if (!normalized) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para salvar marcador.");

        await upsertRemoteProcessMarker(processId, normalized, color);
        await refreshRemoteStore();
      },
      removeProcessMarker: async (processId, marker, actor) => {
        const parsedMarker = parseMarker(marker);
        if (!parsedMarker.label.trim()) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para remover marcador.");

        await removeRemoteProcessMarkerByLabel(processId, parsedMarker.label);
        await refreshRemoteStore();
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
          .map((process) => process.dispatches[0]?.id)
          .filter((id): id is string => Boolean(id));

        await Promise.all(targets.map((dispatchId) => acknowledgeRemoteProcessDispatch(dispatchId, unit)));
        await refreshRemoteStore();
      },
      completeDispatches: async ({ processIds, actor, unit }) => {
        if (processIds.length === 0) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para concluir despacho.");

        const targets = store.processes
          .filter((process) => processIds.includes(process.id))
          .map((process) => process.dispatches[0]?.id)
          .filter((id): id is string => Boolean(id));

        await Promise.all(targets.map((dispatchId) => completeRemoteProcessDispatch(dispatchId, unit)));
        await refreshRemoteStore();
      },
      returnDispatches: async ({ processIds, actor, unit, reason }) => {
        if (processIds.length === 0) return;
        if (!hasBackendEnv) throw new Error("Banco oficial indisponível para devolver despacho.");

        const targets = store.processes
          .filter((process) => processIds.includes(process.id))
          .map((process) => process.dispatches[0]?.id)
          .filter((id): id is string => Boolean(id));

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
  }, [authenticatedEmail, authenticatedMunicipalityId, authenticatedRole, authenticatedUserId, loading, source, store]);

  return <PlatformDataContext.Provider value={value}>{children}</PlatformDataContext.Provider>;
}

export function usePlatformData() {
  const context = useContext(PlatformDataContext);
  if (!context) {
    throw new Error("usePlatformData must be used inside PlatformDataProvider");
  }
  return context;
}
