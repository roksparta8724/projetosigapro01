import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type AccountStatus,
  buildProcessDocuments,
  calculateApprovalGuideAmount,
  calculateIssGuideAmount,
  checklistTemplates as seedChecklistTemplates,
  cmsSections as seedCmsSections,
  documentTemplates as seedDocumentTemplates,
  getMasterMetrics,
  planCatalog as seedPlanCatalog,
  processRecords as seedProcessRecords,
  registrationRequests as seedRegistrationRequests,
  sessionUsers as seedSessionUsers,
  tenantSettings as seedTenantSettings,
  tenants as seedTenants,
  type CreateProcessInput,
  type ChecklistTemplate,
  type FormalRequirement,
  type Institution,
  type InstitutionSettings,
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
  userProfiles as seedUserProfiles,
} from "@/lib/platform";
import { hasSupabaseEnv } from "@/integrations/supabase/client";
import { loadRemotePlatformStore } from "@/integrations/supabase/platform";

type CmsSection = (typeof seedCmsSections)[number];
type DocumentTemplate = (typeof seedDocumentTemplates)[number];
type PlanItem = (typeof seedPlanCatalog)[number];
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
  processes: ProcessRecord[];
  plans: PlanItem[];
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
  processes: ProcessRecord[];
  plans: PlanItem[];
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
    const remoteEmail = normalizeEmail(remoteProfile.email);
    const existingIndex = merged.findIndex(
      (localProfile) =>
        localProfile.userId === remoteProfile.userId ||
        (remoteEmail.length > 0 && normalizeEmail(localProfile.email) === remoteEmail),
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = mergeUserProfileRecord(merged[existingIndex], remoteProfile) ?? merged[existingIndex];
      return;
    }

    merged.push(remoteProfile);
  });

  return merged;
}

function findUserProfile(profiles: UserProfile[], userId: string | null | undefined, email?: string | null | undefined) {
  if (!userId && !email) return undefined;
  const normalizedEmail = normalizeEmail(email);
  const byUserId = userId ? profiles.find((item) => item.userId === userId) : undefined;

  if (!normalizedEmail) {
    return byUserId;
  }

  const byEmail = profiles.find((item) => normalizeEmail(item.email) === normalizedEmail);
  return mergeUserProfileRecord(byUserId, byEmail) ?? byUserId ?? byEmail;
}

const STORAGE_KEY = "sigapro-platform-store";
const AUTH_STORAGE_KEY = "sigapro-demo-credentials";

const defaultStore: PlatformStore = {
  tenants: seedTenants,
  tenantSettings: seedTenantSettings,
  sessionUsers: seedSessionUsers,
  userProfiles: seedUserProfiles,
  registrationRequests: seedRegistrationRequests,
  processes: seedProcessRecords,
  plans: seedPlanCatalog,
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
  upsertInstitution: () => defaultStore.tenants[0],
  saveInstitutionSettings: () => undefined,
  removeInstitution: () => undefined,
  createInstitutionUser: () => defaultStore.sessionUsers[0],
  createInstitutionProcess: () => defaultStore.processes[0],
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
    return {
      tenants: parsed.tenants ?? defaultStore.tenants,
      tenantSettings: parsed.tenantSettings ?? defaultStore.tenantSettings,
      sessionUsers: parsed.sessionUsers ?? defaultStore.sessionUsers,
      userProfiles: parsed.userProfiles ?? defaultStore.userProfiles,
      registrationRequests: parsed.registrationRequests ?? defaultStore.registrationRequests,
      processes: parsed.processes ?? defaultStore.processes,
      plans: parsed.plans ?? defaultStore.plans,
      cmsSections: parsed.cmsSections ?? defaultStore.cmsSections,
      checklistTemplates: parsed.checklistTemplates ?? defaultStore.checklistTemplates,
      documentTemplates: parsed.documentTemplates ?? defaultStore.documentTemplates,
    };
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

export function PlatformDataProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<PlatformStore>(defaultStore);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<DataSource>("demo");

  useEffect(() => {
    const nextStore = readStore();
    setStore(nextStore);
    syncAuthUsers(nextStore.sessionUsers);
    setSource(nextStore === defaultStore ? "demo" : "local");
    setLoading(false);

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
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!hasSupabaseEnv) return;

    loadRemotePlatformStore()
      .then((remote) => {
        if (remote.tenants.length === 0 && remote.sessionUsers.length === 0 && remote.processes.length === 0) {
          return;
        }

        setStore((current) => {
          const next = {
            ...current,
            tenants: remote.tenants.length > 0 ? remote.tenants : current.tenants,
            tenantSettings: remote.tenantSettings.length > 0 ? remote.tenantSettings : current.tenantSettings,
            sessionUsers: remote.sessionUsers.length > 0 ? remote.sessionUsers : current.sessionUsers,
            userProfiles: remote.userProfiles.length > 0 ? mergeUserProfiles(current.userProfiles, remote.userProfiles) : current.userProfiles,
            processes: remote.processes.length > 0 ? remote.processes : current.processes,
          };
          syncStore(next);
          syncAuthUsers(next.sessionUsers);
          return next;
        });
        setSource("remote");
      })
      .catch(() => {
        return;
      });
  }, []);

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
                linkPortalCliente: `https://sigapro.com.br/${input.subdomain || tenantId}`,
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
                clientDeliveryLink: `https://${input.subdomain || tenantId}`,
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
      updateStore((current) => ({
        ...current,
        tenants: current.tenants.filter((item) => item.id !== tenantId),
        tenantSettings: current.tenantSettings.filter((item) => item.tenantId !== tenantId),
        sessionUsers: current.sessionUsers.filter((item) => item.tenantId !== tenantId),
        userProfiles: current.userProfiles.filter((item) => {
          const user = current.sessionUsers.find((sessionUser) => sessionUser.id === item.userId);
          return user?.tenantId !== tenantId;
        }),
        registrationRequests: current.registrationRequests.filter((item) => item.tenantId !== tenantId),
        processes: current.processes.filter((item) => item.tenantId !== tenantId),
      }));
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
        userType: input.role === "profissional_externo" || input.role === "proprietario_consulta" ? "Externo" : "Interno",
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
      upsertInstitution,
      saveInstitutionSettings,
      removeInstitution,
      createInstitutionUser,
      createInstitutionProcess,
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

            if (process.tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
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
          const serialized = `${normalized}::${color}`;
          const processes = current.processes.map((process) => {
            if (process.id !== processId) return process;
            if (process.tags.includes(serialized)) return process;

            return {
              ...process,
              tags: [...process.tags, serialized],
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

            return {
              ...process,
              tags: process.tags.filter((tag) => tag !== marker),
              timeline: [buildTimelineEntry("Marcador removido", `Marcador "${marker.split("::")[0]}" removido do processo.`, actor), ...process.timeline],
              auditTrail: [buildAuditEntry("perfil", "Marcador removido", `Marcador ${marker.split("::")[0]} removido do processo.`, actor, true), ...process.auditTrail],
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
