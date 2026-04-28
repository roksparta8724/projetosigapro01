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
  planCatalog as seedPlanCatalog,
  ownerLinks as seedOwnerLinks,
  ownerMessages as seedOwnerMessages,
  ownerRequests as seedOwnerRequests,
  processRecords as seedProcessRecords,
  registrationRequests as seedRegistrationRequests,
  sessionUsers as seedSessionUsers,
  tenantSettings as seedTenantSettings,
  tenants as seedTenants,
  type CreateProcessInput,
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
  type RegistrationRequest,
  type SessionUser,
  type Tenant,
  type TenantUserInput,
  type TimelineEntry,
  type UserProfile,
  type InstitutionUserInput,
  type CreateInstitutionProcessInput,
  getProcessPaymentGuides,
  parseMarker,
  serializeMarker,
  userProfiles as seedUserProfiles,
} from "@/lib/platform";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import {
  createRemoteOwnerMessage,
  createRemoteOwnerRequest,
  loadRemotePlatformStore,
  respondRemoteOwnerRequest,
  setRemoteOwnerChatEnabled,
} from "@/integrations/supabase/platform";

type CmsSection = (typeof seedCmsSections)[number];
type DocumentTemplate = (typeof seedDocumentTemplates)[number];
type DataSource = "demo" | "local" | "remote";

interface PlatformDataState {
  source: DataSource;
  loading: boolean;
  tenants: Tenant[];
  institutions: Institution[];
  tenantSettings: InstitutionSettings[];
  institutionSettings: InstitutionSettings[];
  sessionUsers: SessionUser[];
  userProfiles: UserProfile[];
  registrationRequests: RegistrationRequest[];
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
  saveInstitutionSettings: (settings: InstitutionSettings) => void;
  removeInstitution: (institutionId: string) => void;
  createInstitutionUser: (input: InstitutionUserInput) => SessionUser;
  createInstitutionProcess: (input: CreateInstitutionProcessInput) => ProcessRecord;
  getInstitutionPlanAssignment: (institutionId: string | null | undefined) => ClientPlanAssignment | undefined;
  upsertPlan: (plan: PlanItem) => PlanItem;
  duplicatePlan: (planId: string) => PlanItem | null;
  saveClientPlanAssignment: (assignment: Omit<ClientPlanAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }) => ClientPlanAssignment;
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
  upsertTenant: (input: {
    tenantId?: string;
    name: string;
    city: string;
    state: string;
    status: Tenant["status"];
    plan: string;
    subdomain: string;
    primaryColor: string;
    accentColor: string;
  }) => Institution;
  saveTenantSettings: (settings: InstitutionSettings) => void;
  removeTenant: (tenantId: string) => void;
  saveUserProfile: (profile: UserProfile) => void;
  createTenantUser: (input: TenantUserInput) => SessionUser;
  updateTenantUser: (userId: string, input: Partial<Pick<SessionUser, "name" | "email" | "role" | "accessLevel" | "title" | "department" | "userType">>) => SessionUser | null;
  setUserAccountStatus: (input: { userId: string; status: AccountStatus; actor: string; reason?: string }) => SessionUser | null;
  deleteUserAccount: (input: { userId: string; actor: string; reason?: string }) => SessionUser | null;
  createRegistrationRequest: (input: Omit<RegistrationRequest, "id" | "status" | "createdAt">) => RegistrationRequest;
  approveRegistrationRequest: (requestId: string) => SessionUser | null;
  createProcess: (input: CreateProcessInput) => ProcessRecord;
  createRequirement: (input: { processId: string; title: string; description: string; dueDate: string; actor: string; targetName: string; visibility: "interno" | "externo" | "misto" }) => void;
  respondRequirement: (input: { processId: string; requirementId: string; response: string; actor: string }) => void;
  completeRequirement: (input: { processId: string; requirementId: string; actor: string }) => void;
  updateProcessStatus: (input: {
    processId: string;
    status: ProcessStatus;
    actor: string;
    detail: string;
    title?: string;
  }) => void;
  reopenProcess: (input: { processId: string; actor: string; reason: string }) => void;
  markGuideAsPaid: (processId: string, actor: string, guideKind?: "protocolo" | "iss_obra" | "aprovacao_final") => void;
  appendProcessDocuments: (processId: string, documents: ProcessDocument[], actor: string) => void;
  reviewProcessDocument: (processId: string, documentId: string, status: "aprovado" | "rejeitado", actor: string) => void;
  addDocumentAnnotation: (processId: string, documentId: string, annotation: { x: number; y: number; note: string; author: string }) => void;
  addProcessMarker: (processId: string, marker: string, actor: string) => void;
  addProcessMarkerWithColor: (processId: string, marker: string, color: string, actor: string) => void;
  removeProcessMarker: (processId: string, marker: string, actor: string) => void;
  setInstitutionStatus: (institutionId: string, status: Tenant["status"]) => void;
  setTenantStatus: (tenantId: string, status: Tenant["status"]) => void;
  dispatchProcess: (input: { processId: string; actor: string; from: string; to: string; subject: string; dueDate: string; visibility?: "interno" | "externo" | "misto"; priority?: "baixa" | "media" | "alta" | "critica"; assignedTo?: string }) => void;
  acknowledgeDispatchReceipt: (input: { processIds: string[]; actor: string; unit: string }) => void;
  completeDispatches: (input: { processIds: string[]; actor: string; unit: string }) => void;
  returnDispatches: (input: { processIds: string[]; actor: string; unit: string; reason?: string }) => void;
  setProcessCheckpoint: (input: { processIds: string[]; actor: string; checkpoint: string }) => void;
  setProcessOnHold: (input: { processIds: string[]; actor: string; onHold: boolean; reason?: string }) => void;
  setProcessTransitVisibility: (input: { processId: string; actor: string; visibility: ProcessTransitVisibility }) => void;
  sendProcessMessage: (input: { processId: string; senderName: string; senderRole: string; audience: "interno" | "externo" | "misto"; recipientName?: string; message: string }) => void;
  reissuePaymentGuide: (processId: string, actor: string, guideKind?: "protocolo" | "iss_obra" | "aprovacao_final") => void;
}

interface PlatformStore {
  tenants: Tenant[];
  tenantSettings: InstitutionSettings[];
  sessionUsers: SessionUser[];
  userProfiles: UserProfile[];
  registrationRequests: RegistrationRequest[];
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

function findUserProfile(profiles: UserProfile[], userId: string | null | undefined, _email?: string | null | undefined) {
  if (!userId) return undefined;
  return profiles.find((item) => item.userId === userId);
}

const STORAGE_KEY = "sigapro-platform-store";
const AUTH_STORAGE_KEY = "sigapro-demo-credentials";
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
  registrationRequests: seedRegistrationRequests,
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

const demoState: PlatformDataState = {
  source: "demo",
  loading: false,
  ...defaultStore,
  metrics: getMasterMetrics(defaultStore.processes, defaultStore.tenants),
  institutions: defaultStore.tenants,
  institutionSettings: defaultStore.tenantSettings,
  getTenantSettings: (tenantId) => defaultStore.tenantSettings.find((item) => item.tenantId === tenantId),
  getInstitutionSettings: (institutionId) => defaultStore.tenantSettings.find((item) => item.tenantId === institutionId),
  getUserProfile: (userId, email) => findUserProfile(defaultStore.userProfiles, userId, email),
  getInstitutionPlanAssignment: (institutionId) => defaultStore.planAssignments.find((item) => item.municipalityId === institutionId),
  upsertInstitution: () => defaultStore.tenants[0],
  saveInstitutionSettings: () => undefined,
  removeInstitution: () => undefined,
  createInstitutionUser: () => defaultStore.sessionUsers[0],
  createInstitutionProcess: () => defaultStore.processes[0],
  upsertPlan: () => defaultStore.plans[0],
  duplicatePlan: () => defaultStore.plans[0],
  saveClientPlanAssignment: () => defaultStore.planAssignments[0],
  createOwnerRequest: async () => ({ request: null, error: "Operacao indisponivel." }),
  respondOwnerRequest: async () => null,
  setOwnerChatEnabled: async () => null,
  sendOwnerMessage: async () => null,
  upsertTenant: () => defaultStore.tenants[0],
  saveTenantSettings: () => undefined,
  removeTenant: () => undefined,
  saveUserProfile: () => undefined,
  createTenantUser: () => defaultStore.sessionUsers[0],
  updateTenantUser: () => null,
  setUserAccountStatus: () => null,
  deleteUserAccount: () => null,
  createRegistrationRequest: () => defaultStore.registrationRequests[0],
  approveRegistrationRequest: () => null,
  createProcess: () => defaultStore.processes[0],
  createRequirement: () => undefined,
  respondRequirement: () => undefined,
  completeRequirement: () => undefined,
  updateProcessStatus: () => undefined,
  reopenProcess: () => undefined,
  markGuideAsPaid: () => undefined,
  appendProcessDocuments: () => undefined,
  reviewProcessDocument: () => undefined,
  addDocumentAnnotation: () => undefined,
  addProcessMarker: () => undefined,
  addProcessMarkerWithColor: () => undefined,
  removeProcessMarker: () => undefined,
  setInstitutionStatus: () => undefined,
  setTenantStatus: () => undefined,
  dispatchProcess: () => undefined,
  acknowledgeDispatchReceipt: () => undefined,
  completeDispatches: () => undefined,
  returnDispatches: () => undefined,
  setProcessCheckpoint: () => undefined,
  setProcessOnHold: () => undefined,
  setProcessTransitVisibility: () => undefined,
  sendProcessMessage: () => undefined,
  reissuePaymentGuide: () => undefined,
};

const PlatformDataContext = createContext<PlatformDataState>(demoState);

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
  const sourceTenants = rawStore.tenants ?? defaultStore.tenants;
  const legacyDemoIds = new Set(
    sourceTenants
      .filter((tenant) => isLegacyDemoTenantName(tenant.name))
      .map((tenant) => tenant.id),
  );
  const tenants = sourceTenants.filter((tenant) => !legacyDemoIds.has(tenant.id));
  const processes = (rawStore.processes ?? defaultStore.processes).filter(
    (process) => !legacyDemoIds.has(process.tenantId) && !legacyDemoIds.has(process.municipalityId ?? ""),
  );
  const validProcessIds = new Set(processes.map((process) => process.id));

  const normalizedSessionUsers = (rawStore.sessionUsers ?? defaultStore.sessionUsers).filter(
    (user) => !legacyDemoIds.has(user.tenantId ?? "") && !legacyDemoIds.has(user.municipalityId ?? ""),
  );
  const normalizedUserProfiles = (rawStore.userProfiles ?? (fallbackToDefault ? defaultStore.userProfiles : []));

  return {
    tenants: tenants.length > 0 || !fallbackToDefault ? tenants : defaultStore.tenants,
    tenantSettings: (rawStore.tenantSettings ?? defaultStore.tenantSettings)
      .filter((item) => !legacyDemoIds.has(item.tenantId)),
    sessionUsers: normalizedSessionUsers,
    userProfiles: normalizedUserProfiles,
    registrationRequests: (rawStore.registrationRequests ?? defaultStore.registrationRequests).filter(
      (request) => !legacyDemoIds.has(request.tenantId) && !legacyDemoIds.has(request.municipalityId ?? ""),
    ),
    ownerRequests: (rawStore.ownerRequests ?? defaultStore.ownerRequests).filter((request) =>
      validProcessIds.has(request.projectId),
    ),
    ownerLinks: (rawStore.ownerLinks ?? defaultStore.ownerLinks).filter((link) =>
      validProcessIds.has(link.projectId),
    ),
    ownerMessages: (rawStore.ownerMessages ?? defaultStore.ownerMessages).filter((message) =>
      validProcessIds.has(message.projectId),
    ),
    processes,
    plans: rawStore.plans?.length ? rawStore.plans : fallbackToDefault ? defaultStore.plans : [],
    planAssignments: rawStore.planAssignments ?? (fallbackToDefault ? defaultStore.planAssignments : []),
    cmsSections: rawStore.cmsSections ?? (fallbackToDefault ? defaultStore.cmsSections : []),
    checklistTemplates: rawStore.checklistTemplates ?? (fallbackToDefault ? defaultStore.checklistTemplates : []),
    documentTemplates: rawStore.documentTemplates ?? (fallbackToDefault ? defaultStore.documentTemplates : []),
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

function syncStore(store: PlatformStore) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function syncAuthUsers(users: SessionUser[]) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  const parsed = raw ? (JSON.parse(raw) as Record<string, { password: string; userId: string; role: string }>) : {};

  users.forEach((user) => {
    const email = user.email.trim().toLowerCase();
    if (!parsed[email]) {
      parsed[email] = {
        password: "Acesso@2026",
        userId: user.id,
        role: user.role,
      };
    }
  });

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
}

function toSizeLabel(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function buildTimelineEntry(title: string, detail: string, actor: string): TimelineEntry {
  return {
    id: `timeline-${crypto.randomUUID()}`,
    title,
    detail,
    actor,
    at: new Date().toLocaleString("pt-BR"),
  };
}

function buildAuditEntry(
  category: ProcessRecord["auditTrail"][number]["category"],
  title: string,
  detail: string,
  actor: string,
  visibleToExternal = true,
) {
  return {
    id: `audit-${crypto.randomUUID()}`,
    category,
    title,
    detail,
    actor,
    visibleToExternal,
    at: new Date().toLocaleString("pt-BR"),
  };
}

function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? Number((error as { status?: number }).status) : NaN;
  return status === 401 || status === 403;
}

export function PlatformDataProvider({ children }: { children: React.ReactNode }) {
  const { authenticatedUserId, loading: authLoading } = useAuthGateway();
  const [store, setStore] = useState<PlatformStore>(defaultStore);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<DataSource>("demo");
  const lastFetchedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const allowRemoteInLocal =
      (import.meta.env.VITE_FORCE_REMOTE_STORE as string | undefined) === "true";
    const localDev = isLocalDevHost();

    const bootstrap = async () => {
      if (authLoading) return;

      if (!authenticatedUserId || (localDev && !allowRemoteInLocal) || !hasSupabaseEnv) {
        const nextStore = readStore();
        if (!active) return;
        setStore(nextStore);
        syncAuthUsers(nextStore.sessionUsers);
        setSource(nextStore === defaultStore ? "demo" : "local");
        setLoading(false);
        return;
      }

      if (lastFetchedUserId.current === authenticatedUserId && source === "remote") {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const remote = await loadRemotePlatformStore();
        const sanitized = buildSanitizedStore(remote, false);
        if (!active) return;
        setStore(sanitized);
        syncStore(sanitized);
        syncAuthUsers(sanitized.sessionUsers);
        setSource("remote");
        lastFetchedUserId.current = authenticatedUserId;
      } catch (error) {
        if (!active) return;
        if (isAuthError(error) && supabase) {
          await supabase.auth.signOut();
        }
        const nextStore = readStore();
        setStore(nextStore);
        syncAuthUsers(nextStore.sessionUsers);
        setSource(nextStore === defaultStore ? "demo" : "local");
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    if (!hasSupabaseEnv) {
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

  const updateStore = (updater: (current: PlatformStore) => PlatformStore) => {
    setStore((current) => {
      const next = updater(current);
      syncStore(next);
      syncAuthUsers(next.sessionUsers);
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
    const saveInstitutionSettings: PlatformDataState["saveInstitutionSettings"] = (settings) => {
      updateStore((current) => {
        const tenantSettings = current.tenantSettings.some((item) => item.tenantId === settings.tenantId)
          ? current.tenantSettings.map((item) => (item.tenantId === settings.tenantId ? settings : item))
          : [settings, ...current.tenantSettings];

        const processes = current.processes.map((process) => {
          if (process.tenantId !== settings.tenantId) return process;

          const guides = getProcessPaymentGuides(process, settings);
          const recalculatedGuides = guides.map((guide) => {
            if (guide.status === "compensada") return guide;

            if (guide.kind === "protocolo") {
              return { ...guide, amount: settings.taxaProtocolo ?? guide.amount };
            }

            if (guide.kind === "iss_obra") {
              return {
                ...guide,
                amount: calculateIssGuideAmount(
                  process.property.area || 0,
                  process.property.usage,
                  settings,
                ),
              };
            }

            if (guide.kind === "aprovacao_final") {
              return {
                ...guide,
                amount: calculateApprovalGuideAmount(
                  process.property.area || 0,
                  process.property.usage,
                  process.property.constructionStandard,
                  settings,
                ),
              };
            }

            return guide;
          });

          return {
            ...process,
            payment: {
              ...process.payment,
              amount:
                process.payment.status === "compensada"
                  ? process.payment.amount
                  : settings.taxaProtocolo ?? process.payment.amount,
              guides: recalculatedGuides,
            },
          };
        });

        return { ...current, tenantSettings, processes };
      });
    };
    const removeInstitution: PlatformDataState["removeInstitution"] = (tenantId) => {
      updateStore((current) => {
        const removedProcessIds = new Set(
          current.processes.filter((item) => item.tenantId === tenantId).map((item) => item.id),
        );

        return {
          ...current,
          tenants: current.tenants.filter((item) => item.id !== tenantId),
          tenantSettings: current.tenantSettings.filter((item) => item.tenantId !== tenantId),
          sessionUsers: current.sessionUsers.filter((item) => item.tenantId !== tenantId),
          userProfiles: current.userProfiles.filter((item) => {
            const user = current.sessionUsers.find((sessionUser) => sessionUser.id === item.userId);
            return user?.tenantId !== tenantId;
          }),
          registrationRequests: current.registrationRequests.filter((item) => item.tenantId !== tenantId),
          ownerRequests: current.ownerRequests.filter((item) => !removedProcessIds.has(item.projectId)),
          ownerLinks: current.ownerLinks.filter((item) => !removedProcessIds.has(item.projectId)),
          ownerMessages: current.ownerMessages.filter((item) => !removedProcessIds.has(item.projectId)),
          processes: current.processes.filter((item) => item.tenantId !== tenantId),
          planAssignments: current.planAssignments.filter((item) => item.municipalityId !== tenantId),
        };
      });
    };
    const setInstitutionStatus: PlatformDataState["setInstitutionStatus"] = (tenantId, status) => {
      updateStore((current) => ({
        ...current,
        tenants: current.tenants.map((tenant) => (tenant.id === tenantId ? { ...tenant, status } : tenant)),
      }));
    };
    const createInstitutionUser: PlatformDataState["createInstitutionUser"] = (input) => {
      const institutionId = input.institutionId ?? input.tenantId;
      const user: SessionUser = {
        id: `user-${crypto.randomUUID()}`,
        name: input.fullName,
        role: input.role,
        accessLevel: input.accessLevel,
        tenantId: institutionId,
        municipalityId: institutionId,
        title: input.title,
        email: input.email,
        accountStatus: "active",
        userType:
          input.role === "profissional_externo" ||
          input.role === "proprietario_consulta" ||
          input.role === "property_owner"
            ? "Externo"
            : "Interno",
        department: input.title,
        createdAt: new Date().toLocaleString("pt-BR"),
        lastAccessAt: "",
        blockedAt: null,
        blockedBy: null,
        blockReason: null,
        deletedAt: null,
      };

      const profile: UserProfile = {
        userId: user.id,
        fullName: input.fullName,
        email: input.email,
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
        avatarUrl: "",
        useAvatarInHeader: false,
        bio: "",
      };

      updateStore((current) => {
        const sessionUsers = [user, ...current.sessionUsers];
        const userProfiles = current.userProfiles.some((item) => item.userId === user.id) ? current.userProfiles : [profile, ...current.userProfiles];
        const tenants = current.tenants.map((tenant) =>
          tenant.id === institutionId ? { ...tenant, users: tenant.users + 1 } : tenant,
        );

        return { ...current, sessionUsers, userProfiles, tenants };
      });

      return user;
    };
    const createInstitutionProcess: PlatformDataState["createInstitutionProcess"] = (input) => {
      const institutionId = input.institutionId ?? input.tenantId;
      let createdProcess = store.processes[0];

      updateStore((current) => {
        const now = new Date();
        const tenant = current.tenants.find((item) => item.id === institutionId);
        const settings = current.tenantSettings.find((item) => item.tenantId === institutionId);
        const tenantCount = current.processes.filter((item) => item.tenantId === institutionId).length + 1;
        const protocolPrefix = settings?.protocoloPrefixo || "PM";
        const guidePrefix = settings?.guiaPrefixo || "DAM";
        const protocol = input.remote?.protocol ?? `${protocolPrefix}-${now.getFullYear()}-${String(tenantCount).padStart(5, "0")}`;
        const guideNumber = input.remote?.guideNumber ?? `${guidePrefix}-${now.getFullYear()}-${String(tenantCount).padStart(5, "0")}`;
        const dueDateLabel =
          input.remote?.dueDate ??
          new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR");

        const process: ProcessRecord = {
          id: input.remote?.processId ?? `proc-${crypto.randomUUID()}`,
          tenantId: institutionId,
          municipalityId: institutionId,
          protocol,
          externalProtocol: input.remote?.externalProtocol ?? protocol,
          title: input.title,
          type: input.type,
          status: input.remote?.status ?? "pagamento_pendente",
          ownerName: input.ownerName,
          ownerDocument: input.ownerDocument,
          technicalLead: input.technicalLead,
          createdBy: input.createdBy,
          tags: input.tags,
          address: input.address,
          notes: input.notes,
          property: input.property,
          triage: {
            status: "recebido",
            assignedTo: "Setor de protocolo",
            notes: "Aguardando conferência inicial e validação da guia.",
          },
          checklistType: input.type,
          sla: {
            currentStage: "Triagem inicial",
            dueDate: dueDateLabel,
            hoursRemaining: 48,
            breached: false,
          },
          reopenHistory: [],
          documents: buildProcessDocuments(
            input.type,
            input.documents.map((document) => ({
              ...document,
              uploaded: document.uploaded,
              signed: document.signed,
              reviewStatus: document.reviewStatus || "pendente",
              annotations: document.annotations ?? [],
              version: document.version || 1,
              sizeLabel: document.sizeLabel ?? (document.fileName ? toSizeLabel(0) : undefined),
              previewUrl: document.previewUrl,
            })),
            institutionId,
          ),
          requirements: [],
          timeline: [
            buildTimelineEntry("Protocolo criado", "Cadastro inicial concluido com os dados do profissional e do imovel.", input.technicalLead),
            buildTimelineEntry("Guia Emitida", "Guia de pagamento gerada automaticamente e enviada ao Financeiro.", tenant?.name ?? "Sistema"),
            buildTimelineEntry("Tramitacao Inicial", "Protocolo encaminhado ao Setor de Protocolo para triagem municipal.", tenant?.name ?? "Sistema"),
          ],
          auditTrail: [
            buildAuditEntry("sistema", "Processo protocolado", "Cadastro inicial concluído com numeração oficial do tenant.", input.technicalLead, true),
            buildAuditEntry("financeiro", "Guia Inicial Emitida", "Guia DAM criada automaticamente no protocolo.", tenant?.name ?? "Sistema", true),
          ],
          signatures: input.documents.some((item) => item.signed)
            ? [
                {
                  id: `sign-${crypto.randomUUID()}`,
                  title: "Bloco inicial de assinatura",
                  status: "pendente",
                  evidence: {
                    ip: "0.0.0.0",
                    userAgent: "SIGAPRO local demo",
                    hash: `sha256:${crypto.randomUUID().replaceAll("-", "")}`,
                    signedVersion: 1,
                    timestampAuthority: "SIGAPRO TSA",
                  },
                  signers: [
                    { name: input.technicalLead, role: "Profissional externo" },
                    { name: tenant?.name ?? "Prefeitura", role: "Análise municipal" },
                  ],
                },
              ]
            : [],
          dispatches: [
            {
              id: `dispatch-${crypto.randomUUID()}`,
              from: "Portal externo",
              to: "Setor de protocolo",
              subject: "Novo protocolo recebido para triagem",
              dueDate: dueDateLabel,
              status: "aguardando",
              visibility: "interno",
            },
            {
              id: `dispatch-${crypto.randomUUID()}`,
              from: "Portal externo",
              to: "Financeiro",
              subject: "Guia emitida aguardando pagamento",
              dueDate: dueDateLabel,
              status: "aguardando",
              visibility: "interno",
            },
          ],
          messages: [
            {
              id: `message-${crypto.randomUUID()}`,
              senderName: tenant?.name ?? "Sistema",
              senderRole: "Sistema",
              audience: "externo",
              recipientName: input.technicalLead,
              message: "Seu protocolo foi recebido. A guia de recolhimento foi emitida automaticamente. Após o pagamento, o processo seguirá para análise técnica.",
              at: new Date().toLocaleString("pt-BR"),
            },
          ],
          payment: {
            guideNumber,
            amount: input.remote?.amount ?? (settings?.taxaProtocolo ?? 35.24),
            status: "pendente",
            dueDate: dueDateLabel,
            issuedAt: input.remote?.issuedAt ?? now.toISOString(),
            expiresAt: input.remote?.expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
            guides:
              input.remote?.guides ??
              [
                {
                  kind: "protocolo",
                  label: "Guia de Recolhimento",
                  code: guideNumber,
                  amount: input.remote?.amount ?? (settings?.taxaProtocolo ?? 35.24),
                  status: "pendente" as const,
                  dueDate: dueDateLabel,
                  issuedAt: input.remote?.issuedAt ?? now.toISOString(),
                  expiresAt: input.remote?.expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
                },
                {
                  kind: "iss_obra",
                  label: "Guia de ISS da Obra",
                  code: `${guidePrefix}-ISS-${now.getFullYear()}-${String(tenantCount).padStart(5, "0")}`,
                  amount: calculateIssGuideAmount(
                    input.property.area || 0,
                    input.property.usage,
                    settings,
                  ),
                  status: "pendente" as const,
                  dueDate: dueDateLabel,
                  issuedAt: input.remote?.issuedAt ?? now.toISOString(),
                  expiresAt: input.remote?.expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
                },
                {
                  kind: "aprovacao_final",
                  label: "Guia Final de Aprovação",
                  code: `${guidePrefix}-APR-${now.getFullYear()}-${String(tenantCount).padStart(5, "0")}`,
                  amount: calculateApprovalGuideAmount(
                    input.property.area || 0,
                    input.property.usage,
                    input.property.constructionStandard,
                    settings,
                  ),
                  status: "pendente" as const,
                  dueDate: dueDateLabel,
                  issuedAt: input.remote?.issuedAt ?? now.toISOString(),
                  expiresAt: input.remote?.expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
                },
              ],
          },
        };

        createdProcess = process;
        const processes = [process, ...current.processes];
        const tenants = current.tenants.map((tenantItem) =>
          tenantItem.id === institutionId ? { ...tenantItem, processes: tenantItem.processes + 1 } : tenantItem,
        );
        return { ...current, processes, tenants };
      });

      return createdProcess;
    };

    const upsertPlan: PlatformDataState["upsertPlan"] = (plan) => {
      const nextPlan: PlanItem = {
        ...plan,
        updatedAt: new Date().toISOString(),
      };

      updateStore((current) => {
        const plans = current.plans.some((item) => item.id === nextPlan.id)
          ? current.plans.map((item) => (item.id === nextPlan.id ? nextPlan : item))
          : [...current.plans, nextPlan];

        return {
          ...current,
          plans: [...plans].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "pt-BR")),
        };
      });

      return nextPlan;
    };

    const duplicatePlan: PlatformDataState["duplicatePlan"] = (planId) => {
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

      updateStore((current) => ({
        ...current,
        plans: [...current.plans, duplicate].sort(
          (left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "pt-BR"),
        ),
      }));

      return duplicate;
    };

    const saveClientPlanAssignment: PlatformDataState["saveClientPlanAssignment"] = (assignment) => {
      const now = new Date().toISOString();
      const nextAssignment: ClientPlanAssignment = {
        ...assignment,
        id: assignment.id ?? `assignment-${crypto.randomUUID()}`,
        createdAt:
          store.planAssignments.find((item) => item.id === assignment.id)?.createdAt ??
          now,
        updatedAt: now,
      };

      updateStore((current) => {
        const linkedPlan = current.plans.find((item) => item.id === nextAssignment.planId);
        const planAssignments = current.planAssignments.some((item) => item.id === nextAssignment.id)
          ? current.planAssignments.map((item) => (item.id === nextAssignment.id ? nextAssignment : item))
          : [nextAssignment, ...current.planAssignments.filter((item) => item.municipalityId !== nextAssignment.municipalityId)];
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
        return { request: null, error: "Processo nao encontrado." };
      }

      const normalizedStoredDocument = normalizeOwnerDocument(process.ownerDocument ?? "");
      if (normalizedStoredDocument && !matchesOwnerDocument(normalizedDocument, normalizedStoredDocument)) {
        return { request: null, error: "Documento nao confere com o cadastro do processo." };
      }

      if (!normalizedStoredDocument && !normalizedDocument) {
        return { request: null, error: "Processo sem documento valido para validacao." };
      }

      const professionalId = resolveProfessionalId(process);
      if (!professionalId) {
        return { request: null, error: "Processo sem profissional responsavel." };
      }

      const hasLink = store.ownerLinks.some(
        (link) =>
          link.projectId === process.id &&
          link.ownerUserId === input.ownerUserId &&
          link.professionalUserId === professionalId,
      );
      if (hasLink) {
        return { request: null, error: "Acompanhamento ja aprovado para este processo." };
      }

      const existing = store.ownerRequests.find(
        (request) =>
          request.projectId === process.id &&
          request.ownerUserId === input.ownerUserId &&
          request.status === "pending",
      );
      if (existing) {
        return { request: null, error: "Sua solicitacao ja esta em analise." };
      }

      if (hasSupabaseEnv) {
        try {
          const remoteRequest = await createRemoteOwnerRequest({
            processId: process.id,
            ownerUserId: input.ownerUserId,
            professionalUserId: professionalId,
            ownerDocument: normalizedDocument,
            notes: input.notes?.trim() || undefined,
          });

          updateStore((current) => ({
            ...current,
            ownerRequests: [remoteRequest, ...current.ownerRequests.filter((item) => item.id !== remoteRequest.id)],
          }));

          return { request: remoteRequest };
        } catch (remoteError) {
          return {
            request: null,
            error:
              remoteError instanceof Error
                ? remoteError.message
                : "Nao foi possivel enviar a solicitacao agora.",
          };
        }
      }

      const request: OwnerProjectRequest = {
        id: `owner-request-${crypto.randomUUID()}`,
        projectId: process.id,
        ownerUserId: input.ownerUserId,
        professionalUserId: professionalId,
        status: "pending",
        requestedAt: new Date().toISOString(),
        respondedAt: null,
        respondedBy: null,
        notes: input.notes?.trim() || undefined,
      };

      updateStore((current) => ({
        ...current,
        ownerRequests: [request, ...current.ownerRequests],
      }));

      return { request };
    };

    const respondOwnerRequest: PlatformDataState["respondOwnerRequest"] = async (input) => {
      const existingRequest = store.ownerRequests.find((item) => item.id === input.requestId);
      if (!existingRequest) {
        return null;
      }

      if (hasSupabaseEnv) {
        try {
          const { request: remoteRequest, link: remoteLink } = await respondRemoteOwnerRequest({
            requestId: input.requestId,
            status: input.status,
            professionalUserId: input.professionalUserId,
            notes: input.notes,
          });

          updateStore((current) => {
            const ownerRequests = current.ownerRequests.map((item) =>
              item.id === input.requestId ? remoteRequest : item,
            );
            const ownerLinks =
              remoteLink && input.status === "approved"
                ? [remoteLink, ...current.ownerLinks.filter((item) => item.id !== remoteLink.id)]
                : current.ownerLinks;

            return { ...current, ownerRequests, ownerLinks };
          });

          return remoteRequest;
        } catch {
          return null;
        }
      }

      let updated: OwnerProjectRequest | null = null;

      updateStore((current) => {
        const request = current.ownerRequests.find((item) => item.id === input.requestId);
        if (!request) {
          updated = null;
          return current;
        }

        const nextRequest: OwnerProjectRequest = {
          ...request,
          status: input.status,
          respondedAt: new Date().toISOString(),
          respondedBy: input.professionalUserId,
          notes: input.notes?.trim() || request.notes,
        };

        const ownerRequests = current.ownerRequests.map((item) =>
          item.id === input.requestId ? nextRequest : item,
        );

        let ownerLinks = current.ownerLinks;
        if (input.status === "approved") {
          const existing = current.ownerLinks.find(
            (link) =>
              link.projectId === request.projectId &&
              link.ownerUserId === request.ownerUserId &&
              link.professionalUserId === request.professionalUserId,
          );

          if (!existing) {
            const link: OwnerProjectLink = {
              id: `owner-link-${crypto.randomUUID()}`,
              projectId: request.projectId,
              ownerUserId: request.ownerUserId,
              professionalUserId: request.professionalUserId,
              chatEnabled: true,
              linkedAt: new Date().toISOString(),
              linkedBy: input.professionalUserId,
            };
            ownerLinks = [link, ...current.ownerLinks];
          }
        }

        updated = nextRequest;
        return { ...current, ownerRequests, ownerLinks };
      });

      return updated;
    };

    const setOwnerChatEnabled: PlatformDataState["setOwnerChatEnabled"] = async (input) => {
      if (hasSupabaseEnv) {
        try {
          const updated = await setRemoteOwnerChatEnabled({
            linkId: input.linkId,
            enabled: input.enabled,
            actor: input.actor,
          });

          updateStore((current) => ({
            ...current,
            ownerLinks: current.ownerLinks.map((link) => (link.id === updated.id ? updated : link)),
          }));

          return updated;
        } catch {
          return null;
        }
      }

      let updated: OwnerProjectLink | null = null;

      updateStore((current) => {
        const ownerLinks = current.ownerLinks.map((link) => {
          if (link.id !== input.linkId) return link;
          updated = { ...link, chatEnabled: input.enabled };
          return updated;
        });

        return { ...current, ownerLinks };
      });

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
      if (input.senderUserId === input.ownerUserId && !linkSnapshot.chatEnabled) {
        return null;
      }

      if (hasSupabaseEnv) {
        try {
          const message = await createRemoteOwnerMessage({
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            professionalUserId: input.professionalUserId,
            senderUserId: input.senderUserId,
            message: normalized,
            isSystemMessage: input.isSystemMessage ?? false,
          });

          updateStore((current) => ({
            ...current,
            ownerMessages: [message, ...current.ownerMessages.filter((item) => item.id !== message.id)],
          }));

          return message;
        } catch {
          return null;
        }
      }

      let created: OwnerProfessionalMessage | null = null;

      updateStore((current) => {
        const link = current.ownerLinks.find(
          (item) =>
            item.projectId === input.projectId &&
            item.ownerUserId === input.ownerUserId &&
            item.professionalUserId === input.professionalUserId,
        );

        if (!link) {
          created = null;
          return current;
        }

        if (input.senderUserId === input.ownerUserId && !link.chatEnabled) {
          created = null;
          return current;
        }

        const message: OwnerProfessionalMessage = {
          id: `owner-message-${crypto.randomUUID()}`,
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          professionalUserId: input.professionalUserId,
          senderUserId: input.senderUserId,
          message: normalized,
          createdAt: new Date().toISOString(),
          readAt: null,
          isSystemMessage: input.isSystemMessage ?? false,
        };

        created = message;
        return { ...current, ownerMessages: [message, ...current.ownerMessages] };
      });

      return created;
    };

    return {
      source,
      loading,
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
      removeInstitution,
      createInstitutionUser,
      createInstitutionProcess,
      upsertPlan,
      duplicatePlan,
      saveClientPlanAssignment,
      createOwnerRequest,
      respondOwnerRequest,
      setOwnerChatEnabled,
      sendOwnerMessage,
      upsertTenant: (input) =>
        upsertInstitution({
          institutionId: input.tenantId,
          name: input.name,
          city: input.city,
          state: input.state,
          status: input.status,
          plan: input.plan,
          subdomain: input.subdomain,
          primaryColor: input.primaryColor,
          accentColor: input.accentColor,
        }),
      saveTenantSettings: (settings) => saveInstitutionSettings(settings),
      removeTenant: (tenantId) => removeInstitution(tenantId),
      saveUserProfile: (profile) => {
        updateStore((current) => {
          const userProfiles = current.userProfiles.some((item) => item.userId === profile.userId)
            ? current.userProfiles.map((item) => (item.userId === profile.userId ? profile : item))
            : [profile, ...current.userProfiles];

          const sessionUsers = current.sessionUsers.map((item) =>
            item.id === profile.userId ? { ...item, name: profile.fullName, email: profile.email } : item,
          );

          return { ...current, userProfiles, sessionUsers };
        });
      },
      createRegistrationRequest: (input) => {
        const request: RegistrationRequest = {
          ...input,
          id: `registration-${crypto.randomUUID()}`,
          status: "pendente",
          createdAt: new Date().toLocaleString("pt-BR"),
        };

        updateStore((current) => ({
          ...current,
          registrationRequests: [request, ...current.registrationRequests],
        }));

        return request;
      },
      createTenantUser: (input) => createInstitutionUser({ ...input, institutionId: input.tenantId }),
      updateTenantUser: (userId, input) => {
        const currentUser = store.sessionUsers.find((item) => item.id === userId);
        if (!currentUser) return null;

        const nextUser: SessionUser = {
          ...currentUser,
          ...input,
          department: input.department ?? input.title ?? currentUser.department ?? currentUser.title,
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
                  professionalType: input.userType ?? profile.professionalType,
                }
              : profile,
          ),
        }));

        return nextUser;
      },
      setUserAccountStatus: ({ userId, status, actor, reason }) => {
        const currentUser = store.sessionUsers.find((item) => item.id === userId);
        if (!currentUser) return null;

        const nextUser: SessionUser = {
          ...currentUser,
          accountStatus: status,
          blockedAt: status === "blocked" ? new Date().toISOString() : null,
          blockedBy: status === "blocked" ? actor : null,
          blockReason: status === "blocked" ? reason?.trim() || "Bloqueio administrativo" : null,
          deletedAt: status === "inactive" ? currentUser.deletedAt ?? new Date().toISOString() : null,
        };

        updateStore((current) => ({
          ...current,
          sessionUsers: current.sessionUsers.map((item) => (item.id === userId ? nextUser : item)),
        }));

        return nextUser;
      },
      deleteUserAccount: ({ userId, actor, reason }) => {
        const currentUser = store.sessionUsers.find((item) => item.id === userId);
        if (!currentUser) return null;

        const nextUser: SessionUser = {
          ...currentUser,
          accountStatus: "inactive",
          deletedAt: new Date().toISOString(),
          blockedBy: actor,
          blockReason: reason?.trim() || "Conta desativada administrativamente",
        };

        updateStore((current) => ({
          ...current,
          sessionUsers: current.sessionUsers.map((item) => (item.id === userId ? nextUser : item)),
        }));

        return nextUser;
      },
      approveRegistrationRequest: (requestId) => {
        const request = store.registrationRequests.find((item) => item.id === requestId);
        if (!request) return null;

        const user: SessionUser = {
          id: `user-${crypto.randomUUID()}`,
          name: request.fullName,
          role: request.role,
          accessLevel: 1,
          tenantId: request.tenantId,
          municipalityId: request.municipalityId ?? request.tenantId,
          title: request.title,
          email: request.email,
          accountStatus: "active",
          userType: request.role === "profissional_externo" || request.role === "proprietario_consulta" ? "Externo" : "Interno",
          department: request.title,
          createdAt: new Date().toLocaleString("pt-BR"),
          lastAccessAt: "",
          blockedAt: null,
          blockedBy: null,
          blockReason: null,
          deletedAt: null,
        };

        const profile: UserProfile = {
          userId: user.id,
          fullName: request.fullName,
          email: request.email,
          phone: request.phone,
          cpfCnpj: request.cpfCnpj,
          rg: "",
          birthDate: "",
          professionalType: request.professionalType,
          registrationNumber: request.registrationNumber,
          companyName: request.companyName,
          addressLine: "",
          addressNumber: "",
          addressComplement: "",
          neighborhood: "",
          city: "",
          state: "",
          zipCode: "",
          avatarUrl: request.avatarUrl,
          useAvatarInHeader: false,
          bio: request.bio,
        };

        updateStore((current) => {
          const sessionUsers = [user, ...current.sessionUsers];
          const userProfiles = [profile, ...current.userProfiles];
          const registrationRequests = current.registrationRequests.map((item) =>
            item.id === requestId ? { ...item, status: "aprovado" } : item,
          );
          const tenants = current.tenants.map((tenant) =>
            tenant.id === request.tenantId ? { ...tenant, users: tenant.users + 1 } : tenant,
          );

          return { ...current, sessionUsers, userProfiles, registrationRequests, tenants };
        });

        return user;
      },
      createProcess: (input) => createInstitutionProcess({ ...input, institutionId: input.tenantId }),
      createRequirement: (input) => {
        const normalizedTitle = input.title.trim();
        const normalizedDescription = input.description.trim();
        if (!normalizedTitle || !normalizedDescription) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== input.processId) return process;

            const requirement: FormalRequirement = {
              id: `requirement-${crypto.randomUUID()}`,
              title: normalizedTitle,
              description: normalizedDescription,
              status: "aberta",
              createdAt: new Date().toLocaleString("pt-BR"),
              dueDate: input.dueDate,
              createdBy: input.actor,
              targetName: input.targetName,
              visibility: input.visibility,
            };

            return {
              ...process,
              status: "exigencia",
              requirements: [requirement, ...process.requirements],
              timeline: [buildTimelineEntry("Exigencia formal emitida", `${normalizedTitle} enviada para ${input.targetName}.`, input.actor), ...process.timeline],
              auditTrail: [buildAuditEntry("mensagem", "Exigencia formal", `${normalizedTitle} registrada com prazo ${input.dueDate}.`, input.actor, input.visibility !== "interno"), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      respondRequirement: (input) => {
        const normalized = input.response.trim();
        if (!normalized) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== input.processId) return process;

            const target = process.requirements.find((item) => item.id === input.requirementId);
            if (!target) return process;

            return {
              ...process,
              requirements: process.requirements.map((item) =>
                item.id === input.requirementId
                  ? { ...item, status: "respondida", response: normalized, respondedAt: new Date().toLocaleString("pt-BR"), responseBy: input.actor }
                  : item,
              ),
              timeline: [buildTimelineEntry("Resposta de exigência", `Resposta registrada para: ${target.title}.`, input.actor), ...process.timeline],
              auditTrail: [buildAuditEntry("mensagem", "Resposta de exigência", `Resposta enviada para a exigência ${target.title}.`, input.actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      completeRequirement: (input) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== input.processId) return process;

            const target = process.requirements.find((item) => item.id === input.requirementId);
            if (!target) return process;

            return {
              ...process,
              requirements: process.requirements.map((item) => (item.id === input.requirementId ? { ...item, status: "atendida" } : item)),
              timeline: [buildTimelineEntry("Exigencia atendida", `Exigencia ${target.title} validada.`, input.actor), ...process.timeline],
              auditTrail: [buildAuditEntry("documento", "Exigência concluída", `A exigência ${target.title} foi encerrada.`, input.actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      updateProcessStatus: ({ processId, status, actor, detail, title }) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            return {
              ...process,
              status,
              sla: {
                ...process.sla,
                currentStage: status.replaceAll("_", " "),
                breached: false,
              },
              timeline: [buildTimelineEntry(title ?? "Status atualizado", detail, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("status", title ?? "Status atualizado", detail, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      reopenProcess: ({ processId, actor, reason }) => {
        const normalized = reason.trim();
        if (!normalized) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;

            return {
              ...process,
              status: "reapresentacao",
              reopenHistory: [
                {
                  id: `reopen-${crypto.randomUUID()}`,
                  reason: normalized,
                  actor,
                  at: new Date().toLocaleString("pt-BR"),
                },
                ...process.reopenHistory,
              ],
              timeline: [buildTimelineEntry("Processo reaberto", normalized, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("status", "Processo reaberto", normalized, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      markGuideAsPaid: (processId, actor, guideKind = "protocolo") => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            const guides = (process.payment.guides ?? []).map((guide) =>
              guide.kind === guideKind ? { ...guide, status: "compensada" as const } : guide,
            );
            const protocolGuide = guides.find((guide) => guide.kind === "protocolo");
            const issGuide = guides.find((guide) => guide.kind === "iss_obra");
            const approvalGuide = guides.find((guide) => guide.kind === "aprovacao_final");
            const nextStatus =
              guideKind === "protocolo"
                ? "analise_tecnica"
                : guideKind === "iss_obra"
                  ? "analise_tecnica"
                  : approvalGuide?.status === "compensada"
                    ? "deferido"
                    : process.status;
            const nextStage =
              guideKind === "protocolo"
                ? "Análise técnica"
                : guideKind === "iss_obra"
                  ? "Análise técnica após ISSQN"
                  : approvalGuide?.status === "compensada"
                    ? "Habite-se e aprovacao final"
                    : process.sla.currentStage;

            return {
              ...process,
              status: nextStatus,
              triage: {
                ...process.triage,
                status: protocolGuide?.status === "compensada" ? "concluido" : process.triage.status,
              },
              sla: {
                ...process.sla,
                currentStage: nextStage,
                breached: false,
              },
              payment: {
                ...process.payment,
                status: protocolGuide?.status === "compensada" ? "compensada" : process.payment.status,
                guides,
              },
              dispatches: [
                ...(guideKind === "protocolo"
                  ? [
                      {
                        id: `dispatch-${crypto.randomUUID()}`,
                        from: "Financeiro",
                        to: "Análise técnica",
                        subject: "Pagamento confirmado e processo liberado para análise",
                        dueDate: new Date().toLocaleDateString("pt-BR"),
                        status: "aguardando" as const,
                        visibility: "interno" as const,
                      },
                    ]
                  : guideKind === "iss_obra"
                    ? [
                        {
                          id: `dispatch-${crypto.randomUUID()}`,
                          from: "Setor de IPTU",
                          to: "Análise técnica",
                          subject: "ISSQN confirmado e projeto retornado para a fila técnica",
                          dueDate: new Date().toLocaleDateString("pt-BR"),
                          status: "aguardando" as const,
                          visibility: "interno" as const,
                        },
                      ]
                    : guideKind === "aprovacao_final"
                      ? [
                          {
                            id: `dispatch-${crypto.randomUUID()}`,
                            from: "Financeiro",
                            to: "Habite-se",
                            subject: "Taxa final compensada e processo apto para conclusao",
                            dueDate: new Date().toLocaleDateString("pt-BR"),
                            status: "aguardando" as const,
                            visibility: "interno" as const,
                          },
                        ]
                  : []),
                ...process.dispatches,
              ],
              timeline: [
                buildTimelineEntry(
                  "Pagamento confirmado",
                  `${
                    guides.find((guide) => guide.kind === guideKind)?.label || "Guia"
                  } compensada${
                    guideKind === "protocolo"
                      ? " e processo encaminhado automaticamente para a análise técnica."
                      : guideKind === "iss_obra"
                        ? " pelo Setor de IPTU, retornando o processo para análise técnica."
                        : " e etapa final de habitese/aprovacao liberada."
                  }`,
                  actor,
                ),
                ...process.timeline,
              ],
              auditTrail: [
                buildAuditEntry(
                  "financeiro",
                  "Pagamento confirmado",
                  `${guides.find((guide) => guide.kind === guideKind)?.label || "Guia"} registrada como paga.${
                    guideKind === "protocolo"
                      ? " Processo enviado para a fila de análise."
                      : guideKind === "iss_obra"
                        ? " ISSQN confirmado pelo setor de IPTU."
                        : " Taxa final de aprovacao confirmada."
                  }`,
                  actor,
                  true,
                ),
                ...process.auditTrail,
              ],
              messages: [
                {
                  id: `message-${crypto.randomUUID()}`,
                  senderName: actor,
                  senderRole: "Financeiro",
                  audience: "misto",
                  message:
                    guideKind === "protocolo"
                      ? "Pagamento confirmado. O protocolo retornou ao fluxo de análise."
                      : guideKind === "iss_obra"
                        ? "ISSQN da obra confirmado. O processo voltou para a análise técnica."
                        : "Taxa final de aprovacao confirmada. O processo avancou para a etapa final.",
                  at: new Date().toLocaleString("pt-BR"),
                },
                ...process.messages,
              ],
            };
          });

          return { ...current, processes };
        });
      },
      appendProcessDocuments: (processId, documents, actor) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            return {
              ...process,
              documents: [...process.documents, ...documents.map((document) => ({ ...document, reviewStatus: document.reviewStatus || "pendente" }))],
              timeline: [buildTimelineEntry("Novos documentos anexados", `Foram anexados ${documents.length} documento(s).`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("documento", "Documentos anexados", `${documents.length} documento(s) adicionados ao processo.`, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      reviewProcessDocument: (processId, documentId, status, actor) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;

            return {
              ...process,
              documents: process.documents.map((document) =>
                document.id === documentId ? { ...document, reviewStatus: status, reviewedBy: actor } : document,
              ),
              timeline: [
                buildTimelineEntry(
                  status === "aprovado" ? "Documento aprovado" : "Documento rejeitado",
                  `O documento foi ${status === "aprovado" ? "aprovado" : "rejeitado"} por ${actor}.`,
                  actor,
                ),
                ...process.timeline,
              ],
              auditTrail: [buildAuditEntry("documento", status === "aprovado" ? "Documento aprovado" : "Documento rejeitado", `Revisao documental executada por ${actor}.`, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      addDocumentAnnotation: (processId, documentId, annotation) => {
        const normalized = annotation.note.trim();
        if (!normalized) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;

            return {
              ...process,
              documents: process.documents.map((document) =>
                document.id === documentId
                  ? {
                      ...document,
                      annotations: [
                        ...(document.annotations ?? []),
                        {
                          id: `annotation-${crypto.randomUUID()}`,
                          x: annotation.x,
                          y: annotation.y,
                          note: normalized,
                          author: annotation.author,
                          createdAt: new Date().toLocaleString("pt-BR"),
                        },
                      ],
                    }
                  : document,
              ),
              timeline: [
                buildTimelineEntry("Marcação técnica registrada", `Uma anotação foi incluída no documento ${documentId}.`, annotation.author),
                ...process.timeline,
              ],
              auditTrail: [buildAuditEntry("documento", "Marcação técnica", `Anotação técnica registrada no documento ${documentId}.`, annotation.author, false), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      addProcessMarker: (processId, marker, actor) => {
        const normalized = marker.trim();
        if (!normalized) {
          return;
        }

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            if (process.tags.some((tag) => parseMarker(tag).label.toLowerCase() === normalized.toLowerCase())) {
              return process;
            }

            return {
              ...process,
              tags: [...process.tags, normalized],
              timeline: [buildTimelineEntry("Marcador incluido", `Marcador "${normalized}" adicionado ao processo.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("perfil", "Marcador incluido", `Marcador ${normalized} salvo no processo.`, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      addProcessMarkerWithColor: (processId, marker, color, actor) => {
        const normalized = marker.trim();
        if (!normalized) return;

        updateStore((current) => {
          const serialized = serializeMarker(normalized, color);
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;
            const nextTags = [
              ...process.tags.filter(
                (tag) => parseMarker(tag).label.toLowerCase() !== normalized.toLowerCase(),
              ),
              serialized,
            ];

            if (
              nextTags.length === process.tags.length &&
              nextTags.every((tag, index) => tag === process.tags[index])
            ) {
              return process;
            }

            return {
              ...process,
              tags: nextTags,
              timeline: [buildTimelineEntry("Marcador colorido incluido", `Marcador "${normalized}" adicionado ao processo.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("perfil", "Marcador colorido", `Marcador ${normalized} salvo com destaque visual.`, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      removeProcessMarker: (processId, marker, actor) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;
            if (!process.tags.includes(marker)) return process;
            const parsedMarker = parseMarker(marker);

            return {
              ...process,
              tags: process.tags.filter((tag) => tag !== marker),
              timeline: [buildTimelineEntry("Marcador removido", `Marcador "${parsedMarker.label}" removido do processo.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("perfil", "Marcador removido", `Marcador ${parsedMarker.label} removido do processo.`, actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      setInstitutionStatus,
      setTenantStatus: (tenantId, status) => setInstitutionStatus(tenantId, status),
      dispatchProcess: ({ processId, actor, from, to, subject, dueDate, visibility, priority, assignedTo }) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            return {
              ...process,
              status: "despacho_intersetorial",
              dispatches: [
                {
                  id: `dispatch-${crypto.randomUUID()}`,
                  from,
                  to,
                  subject,
                  dueDate,
                  status: "aguardando",
                  visibility: visibility ?? "interno",
                  priority: priority ?? "media",
                  assignedTo,
                },
                ...process.dispatches,
              ],
              processControl: {
                externalTransitView: process.processControl?.externalTransitView ?? "completo",
                currentFolder: to,
              },
              timeline: [buildTimelineEntry("Despacho intersetorial", `${subject} encaminhado de ${from} para ${to}.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("despacho", "Despacho criado", `${subject} encaminhado para ${to}.`, actor, (visibility ?? "interno") !== "interno"), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      acknowledgeDispatchReceipt: ({ processIds, actor, unit }) => {
        const targetIds = new Set(processIds);
        if (targetIds.size === 0) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (!targetIds.has(process.id)) {
              return process;
            }

            const latestDispatchId = process.dispatches[0]?.id;
            return {
              ...process,
              dispatches: process.dispatches.map((dispatch, index) =>
                dispatch.id === latestDispatchId || index === 0 ? { ...dispatch, status: "respondido" as const } : dispatch,
              ),
              processControl: {
                externalTransitView: process.processControl?.externalTransitView ?? "completo",
                currentFolder: unit,
              },
              timeline: [
                buildTimelineEntry("Recebimento institucional", `O processo foi recebido formalmente pela unidade ${unit}.`, actor),
                ...process.timeline,
              ],
              auditTrail: [
                buildAuditEntry("despacho", "Recebimento confirmado", `A unidade ${unit} confirmou o recebimento do processo.`, actor, false),
                ...process.auditTrail,
              ],
            };
          });

          return { ...current, processes };
        });
      },
      completeDispatches: ({ processIds, actor, unit }) => {
        const targetIds = new Set(processIds);
        if (targetIds.size === 0) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (!targetIds.has(process.id)) return process;
            const latestDispatchId = process.dispatches[0]?.id;

            return {
              ...process,
              dispatches: process.dispatches.map((dispatch, index) =>
                dispatch.id === latestDispatchId || index === 0 ? { ...dispatch, status: "concluido" as const } : dispatch,
              ),
              processControl: {
                externalTransitView: process.processControl?.externalTransitView ?? "completo",
                currentFolder: unit,
                checkpoint: process.processControl?.checkpoint,
                onHold: process.processControl?.onHold ?? false,
                onHoldReason: process.processControl?.onHoldReason,
              },
              timeline: [buildTimelineEntry("Despacho concluído", `A unidade ${unit} concluiu o despacho do processo.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("despacho", "Despacho concluído", `Conclusão registrada pela unidade ${unit}.`, actor, false), ...process.auditTrail],
            };
          });
          return { ...current, processes };
        });
      },
      returnDispatches: ({ processIds, actor, unit, reason }) => {
        const targetIds = new Set(processIds);
        if (targetIds.size === 0) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (!targetIds.has(process.id)) return process;
            const currentDispatch = process.dispatches[0];
            const destination = currentDispatch?.from || unit;

            return {
              ...process,
              dispatches: [
                {
                  id: `dispatch-${crypto.randomUUID()}`,
                  from: unit,
                  to: destination,
                  subject: reason?.trim() ? `Devolução: ${reason.trim()}` : "Devolução para unidade de origem",
                  dueDate: new Date().toLocaleDateString("pt-BR"),
                  status: "devolvido",
                  visibility: "interno",
                  priority: currentDispatch?.priority ?? "media",
                  assignedTo: currentDispatch?.assignedTo,
                },
                ...process.dispatches.map((dispatch, index) =>
                  index === 0 ? { ...dispatch, status: "devolvido" as const } : dispatch,
                ),
              ],
              processControl: {
                externalTransitView: process.processControl?.externalTransitView ?? "completo",
                currentFolder: destination,
                checkpoint: process.processControl?.checkpoint,
                onHold: false,
                onHoldReason: "",
              },
              timeline: [
                buildTimelineEntry(
                  "Processo devolvido",
                  reason?.trim() ? `Devolvido pela unidade ${unit}. Motivo: ${reason.trim()}.` : `Devolvido pela unidade ${unit} para a origem do despacho.`,
                  actor,
                ),
                ...process.timeline,
              ],
              auditTrail: [buildAuditEntry("despacho", "Processo devolvido", `O processo retornou para ${destination}.`, actor, false), ...process.auditTrail],
            };
          });
          return { ...current, processes };
        });
      },
      setProcessCheckpoint: ({ processIds, actor, checkpoint }) => {
        const targetIds = new Set(processIds);
        if (targetIds.size === 0 || !checkpoint.trim()) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (!targetIds.has(process.id)) return process;

            return {
              ...process,
              processControl: {
                externalTransitView: process.processControl?.externalTransitView ?? "completo",
                currentFolder: process.processControl?.currentFolder ?? process.sla.currentStage,
                checkpoint: checkpoint.trim(),
                onHold: process.processControl?.onHold ?? false,
                onHoldReason: process.processControl?.onHoldReason,
              },
              timeline: [buildTimelineEntry("Ponto de controle definido", `Ponto de controle atualizado para ${checkpoint.trim()}.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("despacho", "Ponto de controle", `Checkpoint institucional definido como ${checkpoint.trim()}.`, actor, false), ...process.auditTrail],
            };
          });
          return { ...current, processes };
        });
      },
      setProcessOnHold: ({ processIds, actor, onHold, reason }) => {
        const targetIds = new Set(processIds);
        if (targetIds.size === 0) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (!targetIds.has(process.id)) return process;
            const latestDispatchId = process.dispatches[0]?.id;

            return {
              ...process,
              dispatches: process.dispatches.map((dispatch, index) =>
                dispatch.id === latestDispatchId || index === 0 ? { ...dispatch, status: onHold ? "sobrestado" as const : "aguardando" as const } : dispatch,
              ),
              processControl: {
                externalTransitView: process.processControl?.externalTransitView ?? "completo",
                currentFolder: process.processControl?.currentFolder ?? process.sla.currentStage,
                checkpoint: process.processControl?.checkpoint,
                onHold,
                onHoldReason: onHold ? reason?.trim() || "Sobrestamento administrativo." : "",
              },
              timeline: [
                buildTimelineEntry(
                  onHold ? "Processo sobrestado" : "Sobrestamento removido",
                  onHold ? `Processo sobrestado. ${reason?.trim() || "Aguardando providência administrativa."}` : "O processo voltou ao fluxo normal de tramitação.",
                  actor,
                ),
                ...process.timeline,
              ],
              auditTrail: [
                buildAuditEntry(
                  "despacho",
                  onHold ? "Processo sobrestado" : "Sobrestamento removido",
                  onHold ? `Sobrestamento registrado. ${reason?.trim() || ""}` : "O processo foi reativado no fluxo.",
                  actor,
                  false,
                ),
                ...process.auditTrail,
              ],
            };
          });
          return { ...current, processes };
        });
      },
      setProcessTransitVisibility: ({ processId, actor, visibility }) => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            return {
              ...process,
              processControl: {
                externalTransitView: visibility,
                currentFolder: process.processControl?.currentFolder ?? process.dispatches[0]?.to ?? process.sla.currentStage,
              },
              timeline: [
                buildTimelineEntry(
                  "Controle de visualização atualizado",
                  visibility === "completo"
                    ? "O acompanhamento externo passou a exibir também as tramitações internas do processo."
                    : "Os tramites internos entre setores passaram a ficar ocultos para o acompanhamento externo.",
                  actor,
                ),
                ...process.timeline,
              ],
              auditTrail: [
                buildAuditEntry(
                  "despacho",
                  "Visibilidade do fluxo atualizada",
                  visibility === "completo"
                    ? "A visualização externa do fluxo foi liberada para acompanhamento completo."
                    : "A visualização externa do fluxo foi restringida, ocultando tramitações internas.",
                  actor,
                  false,
                ),
                ...process.auditTrail,
              ],
            };
          });

          return { ...current, processes };
        });
      },
      sendProcessMessage: ({ processId, senderName, senderRole, audience, recipientName, message }) => {
        const normalized = message.trim();
        if (!normalized) return;

        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) {
              return process;
            }

            return {
              ...process,
              messages: [
                {
                  id: `message-${crypto.randomUUID()}`,
                  senderName,
                  senderRole,
                  audience,
                  recipientName,
                  message: normalized,
                  at: new Date().toLocaleString("pt-BR"),
                },
                ...process.messages,
              ],
              timeline: [buildTimelineEntry("Comunique-se registrado", `Nova mensagem enviada para ${audience}.`, senderName), ...process.timeline],
              auditTrail: [buildAuditEntry("mensagem", "Mensagem registrada", `Nova mensagem enviada com visibilidade ${audience}.`, senderName, audience !== "interno"), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
      reissuePaymentGuide: (processId, actor, guideKind = "protocolo") => {
        updateStore((current) => {
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;

            const now = new Date();
            const prefix = process.payment.guideNumber.split("-").slice(0, 2).join("-");
            const serial = String(Math.floor(Math.random() * 90000) + 10000);
            const nextCode =
              guideKind === "protocolo"
                ? `${prefix}-${serial}`
                : guideKind === "iss_obra"
                  ? `${prefix}-ISS-${serial}`
                  : `${prefix}-APR-${serial}`;

            return {
              ...process,
              payment: {
                ...process.payment,
                guideNumber: guideKind === "protocolo" ? nextCode : process.payment.guideNumber,
                status: guideKind === "protocolo" ? "pendente" : process.payment.status,
                issuedAt: now.toISOString(),
                expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
                guides: (process.payment.guides ?? []).map((guide) =>
                  guide.kind === guideKind
                    ? {
                        ...guide,
                        code: nextCode,
                        status: "pendente",
                        issuedAt: now.toISOString(),
                        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
                      }
                    : guide,
                ),
              },
              timeline: [buildTimelineEntry("Guia reemitida", `Uma nova ${guideKind === "protocolo" ? "guia de recolhimento" : guideKind === "iss_obra" ? "guia de ISS da obra" : "guia final de aprovação"} foi emitida devido ao vencimento do Pix.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("financeiro", "Guia reemitida", "Nova guia emitida no modulo financeiro.", actor, true), ...process.auditTrail],
            };
          });

          return { ...current, processes };
        });
      },
    };
  }, [loading, source, store]);

  return <PlatformDataContext.Provider value={value}>{children}</PlatformDataContext.Provider>;
}

export function usePlatformData() {
  return useContext(PlatformDataContext);
}
