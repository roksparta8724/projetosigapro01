import { buildMunicipalityPortalUrl } from "@/lib/publicDomain";
import { getDefaultMarkerPaletteEntry, getMarkerPaletteEntry } from "@/lib/markerPalette";

export type UserRole =
  | "master_admin"
  | "master_ops"
  | "prefeitura_admin"
  | "prefeitura_supervisor"
  | "analista"
  | "financeiro"
  | "setor_intersetorial"
  | "fiscal"
  | "profissional_externo"
  | "property_owner"
  | "proprietario_consulta";

export type AccountStatus = "active" | "blocked" | "inactive";

export type Permission =
  | "view_master_dashboard"
  | "manage_tenants"
  | "manage_modules"
  | "manage_commercial_plans"
  | "view_platform_metrics"
  | "manage_tenant_users"
  | "manage_tenant_branding"
  | "manage_protocols"
  | "manage_own_profile"
  | "review_processes"
  | "dispatch_interdepartmental"
  | "manage_financial"
  | "manage_fiscal_financial"
  | "submit_processes"
  | "view_own_processes"
  | "sign_documents";

export type InstitutionPermission = Permission;
export type InstitutionManagementPermission =
  | "manage_institutions"
  | "manage_institution_users"
  | "manage_institution_branding";
export type InstitutionScopedInput = {
  institutionId?: string | null;
  municipalityId?: string | null;
  tenantId?: string | null;
};

export type ProcessStatus =
  | "rascunho"
  | "triagem"
  | "pendencia_documental"
  | "guia_emitida"
  | "pagamento_pendente"
  | "pagamento_confirmado"
  | "distribuicao"
  | "analise_tecnica"
  | "despacho_intersetorial"
  | "exigencia"
  | "reapresentacao"
  | "deferido"
  | "indeferido"
  | "arquivado";

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
  accessLevel: 1 | 2 | 3;
  tenantId?: string | null;
  municipalityId?: string | null;
  title: string;
  profileLabel?: string;
  email: string;
  accountStatus: AccountStatus;
  userType?: string;
  department?: string;
  createdAt?: string;
  lastAccessAt?: string;
  blockedAt?: string | null;
  blockedBy?: string | null;
  blockReason?: string | null;
  deletedAt?: string | null;
}
export type InstitutionSessionUser = SessionUser & { institutionId?: string | null };

export function formatOfficialProcessNumber(
  protocol: string | { protocol?: string | null } | null | undefined,
) {
  const raw =
    typeof protocol === "string"
      ? protocol
      : protocol && typeof protocol === "object"
        ? protocol.protocol
        : "";
  const value = typeof raw === "string" ? raw.trim() : "";
  const auditMatch = value.match(/^AUDIT(?:-[A-Z0-9]+)?-(\d{4})(\d{2})(\d{2})-(\d+)$/i);
  if (auditMatch) {
    const year = auditMatch[1];
    const sequence = auditMatch[4].padStart(6, "0");
    return `Processo nº ${sequence}/${year}`;
  }

  const compactAuditMatch = value.match(/^AUDIT(?:-[A-Z0-9]+)?-(\d{4})-(\d+)$/i);
  if (compactAuditMatch) {
    return `Processo nº ${compactAuditMatch[2].padStart(6, "0")}/${compactAuditMatch[1]}`;
  }

  const officialMatch = value.match(/^[A-Z0-9]+-(\d{4})-(\d+)$/i);
  if (officialMatch) {
    return `Processo nº ${officialMatch[2].padStart(6, "0")}/${officialMatch[1]}`;
  }

  return value;
}

export function buildProcessRouteKey(
  protocol: string | null | undefined,
  fallbackId = "",
) {
  const normalized = String(protocol || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/\s]+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || String(fallbackId || "").trim();
}

export function buildProcessPath(
  process: Pick<ProcessRecord, "id" | "protocol">,
  tab?: string,
) {
  const routeKey = buildProcessRouteKey(process.protocol, process.id);
  const search = tab ? `?aba=${encodeURIComponent(tab)}` : "";
  return `/processos/${encodeURIComponent(routeKey)}${search}`;
}

export function resolveProcessRoute(
  processes: ProcessRecord[],
  routeValue: string | null | undefined,
) {
  if (!routeValue) return undefined;

  let decoded = routeValue.trim();
  try {
    decoded = decodeURIComponent(routeValue).trim();
  } catch {
    decoded = routeValue.trim();
  }

  const byId = getProcessById(decoded, processes);
  if (byId) return byId;

  const normalized = decoded.toLocaleLowerCase("pt-BR");
  return processes.find((item) => {
    const protocol = String(item.protocol || "");
    return (
      protocol.toLocaleLowerCase("pt-BR") === normalized ||
      buildProcessRouteKey(protocol, item.id).toLocaleLowerCase("pt-BR") === normalized
    );
  });
}

export function formatProfessionalProcessType(type?: string | null) {
  const normalized = (type ?? "").trim().toLowerCase();
  if (!normalized) return "Processo administrativo digital";

  const labels: Record<string, string> = {
    licenciamento: "Licenciamento Urbanístico",
    aprovacao: "Aprovação de Projeto",
    "aprovacao_projeto": "Aprovação de Projeto",
    regularizacao: "Regularização Urbanística",
    reforma: "Licenciamento de Reforma",
    ampliacao: "Licenciamento de Ampliação",
    demolicao: "Licenciamento de Demolição",
    habitese: "Habite-se",
    "habite-se": "Habite-se",
  };

  return labels[normalized] ?? normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

export function formatOfficialProcessTitle(input: { title: string; type?: string | null }) {
  const title = input.title?.trim() || "";
  if (/^AUDIT(?:\s|\b|-)/i.test(title)) {
    return formatProfessionalProcessType(input.type);
  }
  return title || formatProfessionalProcessType(input.type);
}

export function formatOfficialProcessLabel(input: { protocol: string; type?: string | null }) {
  const number = formatOfficialProcessNumber(input.protocol);
  const typeLabel = formatProfessionalProcessType(input.type);
  const match = number.match(/^Processo nº\s+(.+)$/i);
  return match ? `Processo de ${typeLabel} nº ${match[1]}` : number;
}

export const URBAN_ANALYSIS_DEPARTMENT = "Análise Urbanística";
export const PROTOCOL_DEPARTMENT = "Protocolo";

export const workTypeCatalog = [
  "Construção nova",
  "Reforma sem ampliação",
  "Ampliação",
  "Reforma e ampliação",
  "Regularização",
  "Demolição",
  "Mudança de uso",
  "Substituição / alteração de projeto",
] as const;

export const occupancyPermitProcessTypes = [
  "Habite-se",
  "Carta de Habite-se Parcial",
  "Certificado de Conclusão de Obra",
] as const;

export function isOccupancyPermitProcessType(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return (
    normalized === "habite se" ||
    normalized.includes("habite se parcial") ||
    normalized.includes("certificado de conclusao de obra")
  );
}


export const SIGAPRO_MASTER_EMAIL = "roksparta02@gmail.com";
export const SIGAPRO_DEFAULT_SUBDOMAIN = "campolimpopaulista";

export interface UserProfile {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  cpfCnpj: string;
  rg: string;
  birthDate: string;
  professionalType: string;
  registrationNumber: string;
  companyName: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  avatarUrl: string;
  avatarStorageRef?: string;
  avatarScale?: number;
  avatarOffsetX?: number;
  avatarOffsetY?: number;
  useAvatarInHeader?: boolean;
  bio: string;
}
export type OwnerRequestStatus = "pending" | "approved" | "rejected";

export interface OwnerProjectRequest {
  id: string;
  projectId: string;
  ownerUserId: string;
  professionalUserId: string;
  status: OwnerRequestStatus;
  requestedAt: string;
  respondedAt?: string | null;
  respondedBy?: string | null;
  notes?: string | null;
}

export interface OwnerProjectLink {
  id: string;
  projectId: string;
  ownerUserId: string;
  professionalUserId: string;
  chatEnabled: boolean;
  linkedAt: string;
  linkedBy: string;
}

export interface OwnerProfessionalMessage {
  id: string;
  projectId: string;
  ownerUserId: string;
  professionalUserId: string;
  senderUserId: string;
  message: string;
  createdAt?: string;
  readAt?: string | null;
  isSystemMessage?: boolean;
}
function normalizeScopedEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export function isSigaproMasterAccount(input: {
  email?: string | null;
  role?: string | null;
} | string | null | undefined) {
  if (typeof input === "string") {
    return normalizeScopedEmail(input) === SIGAPRO_MASTER_EMAIL;
  }
  if (input == null) return false;

  return (
    normalizeScopedEmail(input.email) === SIGAPRO_MASTER_EMAIL ||
    input.role === "master_admin" ||
    input.role === "master_ops"
  );
}

export function resolveDefaultInstitutionScope(input: {
  email?: string | null;
  role?: string | null;
  tenantId?: string | null;
  municipalityId?: string | null;
}) {
  if (isSigaproMasterAccount(input)) {
    return {
      tenantId: null,
      municipalityId: null,
    };
  }

  const resolvedScope =
    input.municipalityId?.trim() ||
    input.tenantId?.trim() ||
    null;

  return {
    tenantId: resolvedScope,
    municipalityId: resolvedScope,
  };
}

export function normalizeSessionUserScope<T extends SessionUser>(user: T): T {
  return {
    ...user,
    ...resolveDefaultInstitutionScope(user),
  };
}

export interface Tenant {
  id: string;
  name: string;
  city: string;
  state: string;
  status: "ativo" | "implantacao" | "suspenso";
  plan: string;
  activeModules: string[];
  users: number;
  processes: number;
  revenue: number;
  subdomain: string;
  theme: {
    primary: string;
    accent: string;
  };
}

export type Institution = Tenant;
export type InstitutionStatus = Tenant["status"];

export type PlanBillingCycle = "mensal" | "anual" | "personalizado";
export type PlanBadgeVariant = "default" | "blue" | "emerald" | "amber" | "rose" | "slate";
export type PlanContractStatus =
  | "rascunho"
  | "ativo"
  | "trial"
  | "suspenso"
  | "upgrade"
  | "downgrade"
  | "encerrado";

export interface PlanItem {
  id: string;
  accountLevel: string;
  name: string;
  subtitle: string;
  description?: string;
  price: number;
  billingCycle: PlanBillingCycle;
  badge: string;
  badgeVariant: PlanBadgeVariant;
  featuresIncluded: string[];
  featuresExcluded: string[];
  modulesIncluded: string[];
  maxUsers: number | null;
  maxProcesses: number | null;
  maxDepartments: number | null;
  maxStorageGb: number | null;
  isFeatured: boolean;
  isActive: boolean;
  isPublic: boolean;
  isInternalOnly: boolean;
  isCustom: boolean;
  isVisibleInMaster: boolean;
  displayOrder: number;
  accentColor: string;
  notes?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface ClientPlanAssignment {
  id: string;
  municipalityId: string;
  planId: string;
  contractStatus: PlanContractStatus;
  startsAt: string;
  endsAt: string;
  billingCycle: PlanBillingCycle;
  billingNotes: string;
  customPrice: number | null;
  isCustom: boolean;
  createdAt?: string;
  updatedAt: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  description?: string;
  primary: string;
  accent: string;
  background?: string;
  inverseMain?: boolean;
}

export interface MunicipalIssRateProfile {
  id: string;
  label: string;
  aliases: string[];
  rate: number;
}

export interface MunicipalApprovalRateProfile {
  id: string;
  label: string;
  usage: string;
  standard: string;
  /**
   * Valor de referência do metro quadrado para o tipo/padrão.
   * A taxa de licença é calculada aplicando a alíquota municipal sobre este valor.
   */
  rate: number;
  /**
   * Taxa fixa do Alvará para esta combinação. Quando ausente, usa a taxa fixa geral.
   */
  permitFee?: number;
}

export interface InstitutionAdminContact {
  email: string;
  fullName: string;
  title: string;
  accessLevel: 2 | 3;
}

export type DepartmentOwnershipKey = "protocolo" | "analise" | "financeiro" | "acesso_externo";

export interface DepartmentOwnershipEntry {
  secretaria: string;
  diretoria: string;
}

export type MunicipalPixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
export type MunicipalBankCollectionMode = "manual" | "agreement" | "api";
export type MunicipalPaymentProvider = "mercado_pago" | "bank_direct" | "manual";
export type MunicipalPaymentProviderEnvironment = "test" | "production";
export type MunicipalPaymentAuthenticationMode = "automatic" | "manual";

export interface TenantSettings {
  tenantId: string;
  cnpj: string;
  cep?: string;
  endereco: string;
  telefone: string;
  email: string;
  site: string;
  secretariaResponsavel: string;
  secretariaTelefone?: string;
  secretariaEmail?: string;
  diretoriaResponsavel: string;
  diretoriaTelefone: string;
  diretoriaEmail: string;
  departmentOwnership?: Partial<Record<DepartmentOwnershipKey, DepartmentOwnershipEntry>>;
  footerContactSource?: "secretaria" | "diretoria";
  horarioAtendimento: string;
  brasaoUrl: string;
  bandeiraUrl: string;
  logoUrl: string;
  headerLogoUrl?: string;
  footerLogoUrl?: string;
  faviconUrl?: string;
  imagemHeroUrl: string;
  resumoPlanoDiretor: string;
  resumoUsoSolo: string;
  leisComplementares: string;
  linkPortalCliente: string;
  protocoloPrefixo: string;
  guiaPrefixo: string;
  chavePix: string;
  beneficiarioArrecadacao: string;
  pixEnabled?: boolean;
  pixKeyType?: MunicipalPixKeyType;
  pixMerchantCity?: string;
  bankCode?: string;
  bankName?: string;
  bankAgency?: string;
  bankAgencyDigit?: string;
  bankAccount?: string;
  bankAccountDigit?: string;
  bankBeneficiaryDocument?: string;
  bankCollectionMode?: MunicipalBankCollectionMode;
  bankAgreementCode?: string;
  bankWallet?: string;
  bankInstructions?: string;
  paymentProvider?: MunicipalPaymentProvider;
  paymentProviderEnvironment?: MunicipalPaymentProviderEnvironment;
  paymentAuthenticationMode?: MunicipalPaymentAuthenticationMode;
  taxaProtocolo: number;
  taxaIssPorMetroQuadrado: number;
  issRateProfiles?: MunicipalIssRateProfile[];
  issStageEnabled?: boolean;
  taxaAprovacaoFinal: number;
  /**
   * Alíquota aplicada sobre (área × valor de referência do m²) na guia de aprovação.
   * Campo Limpo Paulista utiliza 5% no modelo informado.
   */
  approvalAliquotPercent?: number;
  finalApprovalFeeEnabled?: boolean;
  constructionGuideIssuerMode?: "analise" | "financeiro" | "ambos";
  approvalRateProfiles?: MunicipalApprovalRateProfile[];
  registroProfissionalObrigatorio: boolean;
  contractNumber?: string;
  contractStart?: string;
  contractEnd?: string;
  monthlyFee?: number;
  setupFee?: number;
  signatureMode?: "eletronica" | "manual" | "icp_brasil";
  clientDeliveryLink?: string;
  logoScale?: number;
  logoOffsetX?: number;
  logoOffsetY?: number;
  headerLogoScale?: number;
  headerLogoOffsetX?: number;
  headerLogoOffsetY?: number;
  footerLogoScale?: number;
  footerLogoOffsetX?: number;
  footerLogoOffsetY?: number;
  logoAlt?: string;
  logoUpdatedAt?: string;
  logoUpdatedBy?: string;
  logoFrameMode?: "soft-square" | "rounded";
  logoFitMode?: "contain" | "cover";
  headerLogoFrameMode?: "soft-square" | "rounded";
  headerLogoFitMode?: "contain" | "cover";
  footerLogoFrameMode?: "soft-square" | "rounded";
  footerLogoFitMode?: "contain" | "cover";
  logoStorageProvider?: "r2" | "supabase";
  logoBucket?: string;
  logoObjectKey?: string;
  logoFileName?: string;
  logoMimeType?: string;
  logoFileSize?: number;
  headerLogoBucket?: string;
  headerLogoObjectKey?: string;
  headerLogoFileName?: string;
  headerLogoMimeType?: string;
  headerLogoFileSize?: number;
  footerLogoBucket?: string;
  footerLogoObjectKey?: string;
  footerLogoFileName?: string;
  footerLogoMimeType?: string;
  footerLogoFileSize?: number;
  faviconBucket?: string;
  faviconObjectKey?: string;
  faviconFileName?: string;
  faviconMimeType?: string;
  faviconFileSize?: number;
  planoDiretorArquivoNome: string;
  planoDiretorArquivoUrl: string;
  usoSoloArquivoNome: string;
  usoSoloArquivoUrl: string;
  zoneamentoArquivoNome?: string;
  zoneamentoArquivoUrl?: string;
  leisArquivoNome: string;
  leisArquivoUrl: string;
  adminContacts?: InstitutionAdminContact[];
}

export type InstitutionSettings = TenantSettings;
export type InstitutionScopedSettings = InstitutionSettings & { institutionId?: string };

export type PaymentGuideKind = "protocolo" | "iss_obra" | "aprovacao_final" | "habite_se";

export interface PaymentGuideEntry {
  kind: PaymentGuideKind;
  label: string;
  code: string;
  amount: number;
  status: "pendente" | "compensada";
  dueDate: string;
  issuedAt?: string;
  paidAt?: string;
  expiresAt?: string;
  requestedBy?: string;
  requestedAt?: string;
  issuedBy?: string;
  ownerName?: string;
  ownerDocument?: string;
  professionalName?: string;
  areaM2?: number;
  usage?: string;
  constructionStandard?: string;
  revision?: number;
  paymentMethod?: string;
  pixPayload?: string;
  barcode?: string;
  digitableLine?: string;
  bankReference?: string;
  bankPaymentId?: string;
  bankStatus?: string;
  bankStatusDetail?: string;
  bankAuthenticatedAt?: string;
  paymentProvider?: MunicipalPaymentProvider;
  providerEnvironment?: MunicipalPaymentProviderEnvironment;
}

export interface ProcessDocument {
  id: string;
  label: string;
  required: boolean;
  uploaded: boolean;
  signed: boolean;
  reviewStatus?: "pendente" | "aprovado" | "rejeitado";
  reviewedBy?: string;
  annotations?: Array<{
    id: string;
    kind?: "text" | "highlight";
    page?: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
    note: string;
    author: string;
    createdAt: string;
  }>;
  version: number;
  source: "profissional" | "prefeitura" | "integracao";
  fileName?: string;
  filePath?: string;
  fileHash?: string;
  mimeType?: string;
  sizeLabel?: string;
  fileSizeBytes?: number;
  previewUrl?: string;
}

export interface ChecklistTemplate {
  id: string;
  tenantId?: string | null;
  processType: string;
  items: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
}
export type InstitutionChecklistTemplate = ChecklistTemplate & { institutionId?: string | null };

export interface TimelineEntry {
  id: string;
  title: string;
  detail: string;
  actor: string;
  at: string;
}

export interface AuditEntry {
  id: string;
  category: "status" | "documento" | "financeiro" | "despacho" | "mensagem" | "assinatura" | "perfil" | "sistema";
  title: string;
  detail: string;
  actor: string;
  /** Identificador auditável de quem executou a ação, sem comparação por nome. */
  actorProfileId?: string;
  visibleToExternal: boolean;
  at: string;
}

export interface FormalRequirement {
  id: string;
  title: string;
  description?: string;
  status: "aberta" | "respondida" | "atendida" | "cancelada";
  createdAt?: string;
  dueDate: string;
  createdBy: string;
  targetName: string;
  response?: string;
  respondedAt?: string;
  responseBy?: string;
  visibility?: "interno" | "externo" | "misto";
}

export interface SignatureBlock {
  id: string;
  title: string;
  status: "pendente" | "concluido" | "invalidado";
  evidence?: {
    ip?: string;
    userAgent?: string;
    hash?: string;
    signedVersion?: number;
    timestampAuthority?: string;
  };
  signers: Array<{
    name: string;
    role: string;
    signedAt?: string;
  }>;
}

export interface DispatchItem {
  id: string;
  from: string;
  to: string;
  subject: string;
  dueDate: string;
  createdAt?: string;
  status: "aguardando" | "respondido" | "concluido" | "devolvido" | "sobrestado";
  visibility?: "interno" | "externo" | "misto";
  priority?: "baixa" | "media" | "alta" | "critica";
  assignedTo?: string;
  requestedBy?: string;
  requestedByProfileId?: string;
}

export type ProcessTransitVisibility = "completo" | "restrito";

export interface ProcessMessage {
  id: string;
  senderName: string;
  senderRole: string;
  audience: "interno" | "externo" | "misto";
  recipientName?: string;
  message: string;
  at: string;
}

export interface ProcessRecord {
  id: string;
  tenantId: string;
  municipalityId?: string | null;
  protocol: string;
  externalProtocol: string;
  /** Número temporário usado somente antes da confirmação da guia inicial. */
  preProtocol?: string;
  /** false = pré-protocolo; true = processo municipal já oficializado. */
  isOfficial?: boolean;
  officializedAt?: string;
  title: string;
  type: string;
  status: ProcessStatus;
  ownerName: string;
  ownerDocument: string;
  ownerIdentityDocument?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  technicalLead: string;
  /** Referências explícitas da parte processual ao perfil cadastral. */
  ownerProfileId?: string;
  technicalProfileId?: string;
  createdBy: string;
  createdByProfileId?: string;
  createdByUserId?: string;
  createdByEmail?: string;
  createdByRole?: string;
  professionalProfileId?: string;
  professionalUserId?: string;
  professionalEmail?: string;
  tags: string[];
  address: string;
  notes?: string;
  property: {
    registration: string;
    iptu: string;
    lot: string;
    block: string;
    area: number;
    usage: string;
    buildingType?: string;
    workType?: string;
    constructionStandard?: string;
  };
  triage: {
    status: "recebido" | "em_triagem" | "concluido";
    assignedTo?: string;
    notes?: string;
  };
  analysis?: {
    assignedTo?: string;
    assignedProfileId?: string;
    startedAt?: string;
    supervisorOverrideProfileId?: string;
    supervisorOverrideReason?: string;
    supervisorOverrideStartedAt?: string;
    supervisorOverrideExpiresAt?: string;
  };
  checklistType: string;
  sla: {
    currentStage: string;
    dueDate: string;
    hoursRemaining: number;
    breached: boolean;
  };
  reopenHistory: Array<{
    id: string;
    reason: string;
    actor: string;
    at: string;
  }>;
  documents: ProcessDocument[];
  requirements: FormalRequirement[];
  timeline: TimelineEntry[];
  auditTrail: AuditEntry[];
  signatures: SignatureBlock[];
  dispatches: DispatchItem[];
  messages: ProcessMessage[];
  processControl?: {
    externalTransitView?: ProcessTransitVisibility;
    currentFolder?: string;
    checkpoint?: string;
    onHold?: boolean;
    onHoldReason?: string;
  };
  payment: {
    guideNumber: string;
    amount: number;
    status: "pendente" | "compensada";
    dueDate: string;
    issuedAt?: string;
    expiresAt?: string;
    guides?: PaymentGuideEntry[];
  };
}
export type InstitutionProcessRecord = ProcessRecord & { institutionId?: string | null };

export interface TenantUserInput {
  tenantId: string;
  fullName: string;
  email: string;
  role: UserRole;
  title: string;
  accessLevel: 1 | 2 | 3;
  temporaryPassword?: string;
}

export type InstitutionUserInput = TenantUserInput & {
  institutionId?: string;
};

export interface CreateProcessInput {
  tenantId: string;
  createdBy: string;
  title: string;
  type: string;
  address: string;
  ownerName: string;
  ownerDocument: string;
  ownerIdentityDocument?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  technicalLead: string;
  professionalDocument?: string;
  professionalRegistration?: string;
  professionalType?: string;
  professionalPhone?: string;
  professionalEmail?: string;
  professionalCompany?: string;
  tags: string[];
  notes?: string;
  property: {
    registration: string;
    iptu: string;
    lot: string;
    block: string;
    area: number;
    usage: string;
    buildingType?: string;
    workType?: string;
    constructionStandard?: string;
  };
  documents: ProcessDocument[];
  remote?: {
    processId: string;
    protocol: string;
    externalProtocol?: string;
    guideNumber: string;
    amount: number;
    dueDate: string;
    issuedAt?: string;
    expiresAt?: string;
    status?: ProcessStatus;
    guides?: PaymentGuideEntry[];
  };
}

export type CreateInstitutionProcessInput = CreateProcessInput & {
  institutionId?: string;
};

export function getGuideLabel(kind: PaymentGuideKind) {
  switch (kind) {
    case "protocolo":
      return "Guia de Recolhimento de Protocolo";
    case "iss_obra":
      return "Guia de ISSQN / Projeto";
    case "aprovacao_final":
      return "Guia de Pagamento - Aprovação / Alvará";
    case "habite_se":
      return "Guia de Pagamento do Habite-se";
  }
}

export function getGuideReference(kind: PaymentGuideKind) {
  switch (kind) {
    case "protocolo":
      return "Taxa de protocolo administrativo";
    case "iss_obra":
      return "ISSQN / Projeto calculado pela metragem e pelo uso da edificação";
    case "aprovacao_final":
      return "Aprovação do projeto e emissão do Alvará; Habite-se possui protocolo próprio";
    case "habite_se":
      return "Taxa municipal do Habite-se após vistoria / conferência";
  }
}

export function getGuideObservation(kind: PaymentGuideKind) {
  switch (kind) {
    case "protocolo":
      return "Documento de arrecadação municipal vinculado à abertura do protocolo administrativo.";
    case "iss_obra":
      return "Documento de arrecadação municipal de ISSQN / Projeto, calculado pela metragem e pelo uso da edificação conforme a tabela oficial da Prefeitura.";
    case "aprovacao_final":
      return "Guia de aprovação do projeto e Alvará. A taxa de licença considera área, tipo de obra, padrão de acabamento e alíquota municipal. Habite-se é um protocolo separado.";
    case "habite_se":
      return "Guia própria do processo de Habite-se, emitida pelo Financeiro depois da vistoria / conferência e antes da decisão / emissão.";
  }
}

export const defaultIssRateProfiles: MunicipalIssRateProfile[] = [
  {
    id: "residencial",
    label: "Residencial",
    aliases: ["residencial", "apartamento", "casa", "habitacional"],
    rate: 1.2,
  },
  {
    id: "comercial-mista",
    label: "Comercial e mista",
    aliases: ["comercial", "comercial e mista", "mista", "escritorio", "escritório"],
    rate: 1.43,
  },
  {
    id: "industrial",
    label: "Industrial",
    aliases: ["industrial", "galpao", "galpão", "fabrica", "fábrica"],
    rate: 1.71,
  },
  {
    id: "loteamentos",
    label: "Loteamentos",
    aliases: ["loteamento", "loteamentos", "desdobro", "desmembramento", "remembramento"],
    rate: 0.4,
  },
];

// Estrutura inicial da tabela. Os valores oficiais do m² devem ser cadastrados
// pela Prefeitura; não usamos números fictícios como base de arrecadação.
export const defaultApprovalRateProfiles: MunicipalApprovalRateProfile[] = [
  { id: "residencial-luxo", label: "Residencial • Luxo", usage: "Residencial", standard: "luxo", rate: 0 },
  { id: "residencial-primeira", label: "Residencial • Primeira", usage: "Residencial", standard: "primeira", rate: 0 },
  { id: "residencial-medio", label: "Residencial • Médio", usage: "Residencial", standard: "medio", rate: 0 },
  { id: "residencial-economico", label: "Residencial • Econômico", usage: "Residencial", standard: "economico", rate: 0 },
  { id: "apartamento-luxo", label: "Apartamento • Luxo", usage: "Apartamento", standard: "luxo", rate: 0 },
  { id: "apartamento-primeira", label: "Apartamento • Primeira", usage: "Apartamento", standard: "primeira", rate: 0 },
  { id: "apartamento-medio", label: "Apartamento • Médio", usage: "Apartamento", standard: "medio", rate: 0 },
  { id: "escritorio-luxo", label: "Escritório • Luxo", usage: "Escritório", standard: "luxo", rate: 0 },
  { id: "escritorio-primeira", label: "Escritório • Primeira", usage: "Escritório", standard: "primeira", rate: 0 },
  { id: "escritorio-medio", label: "Escritório • Médio", usage: "Escritório", standard: "medio", rate: 0 },
  { id: "comercial-luxo", label: "Comercial • Luxo", usage: "Comercial", standard: "luxo", rate: 0 },
  { id: "comercial-primeira", label: "Comercial • Primeira", usage: "Comercial", standard: "primeira", rate: 0 },
  { id: "comercial-medio", label: "Comercial • Médio", usage: "Comercial", standard: "medio", rate: 0 },
  { id: "comercial-economico", label: "Comercial • Econômico", usage: "Comercial", standard: "economico", rate: 0 },
  { id: "industrial-luxo", label: "Industrial • Luxo", usage: "Industrial", standard: "luxo", rate: 0 },
  { id: "industrial-primeira", label: "Industrial • Primeira", usage: "Industrial", standard: "primeira", rate: 0 },
  { id: "industrial-medio", label: "Industrial • Médio", usage: "Industrial", standard: "medio", rate: 0 },
  { id: "industrial-economico", label: "Industrial • Econômico", usage: "Industrial", standard: "economico", rate: 0 },
];

function normalizeUsageLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function resolveIssRateProfile(
  usage: string | null | undefined,
  settings?: TenantSettings | null,
) {
  const profiles = settings?.issRateProfiles ?? [];
  if (profiles.length === 0) return null;

  const normalizedUsage = normalizeUsageLabel(usage);
  return (
    profiles.find((profile) =>
      [profile.label, ...(profile.aliases ?? [])]
        .map((item) => normalizeUsageLabel(item))
        .some((item) => item.length > 0 && normalizedUsage.includes(item)),
    ) ?? null
  );
}

export function isIssFeeConfigured(settings?: TenantSettings | null) {
  return Boolean(
    (settings?.issRateProfiles ?? []).some((profile) => Number(profile.rate) > 0) ||
    Number(settings?.taxaIssPorMetroQuadrado ?? 0) > 0,
  );
}

export function isFinalApprovalFeeConfigured(settings?: TenantSettings | null) {
  const aliquot = Number(settings?.approvalAliquotPercent ?? 5);
  return Boolean(
    (settings?.approvalRateProfiles ?? []).some(
      (profile) =>
        (Number(profile.rate) > 0 && aliquot > 0) ||
        Number(profile.permitFee ?? 0) > 0,
    ) ||
    Number(settings?.taxaAprovacaoFinal ?? 0) > 0,
  );
}

export function calculateIssGuideAmount(
  area: number,
  usage: string | null | undefined,
  settings?: TenantSettings | null,
) {
  const rateProfile = resolveIssRateProfile(usage, settings);
  const fallbackRate = settings?.taxaIssPorMetroQuadrado ?? 0;
  const rate = rateProfile?.rate ?? fallbackRate;
  return Number(((area || 0) * rate).toFixed(2));
}

export function resolveApprovalRateProfile(
  usage: string | null | undefined,
  standard: string | null | undefined,
  settings?: TenantSettings | null,
) {
  const profiles = settings?.approvalRateProfiles ?? [];
  if (profiles.length === 0) return null;

  const normalizedUsage = normalizeUsageLabel(usage);
  const normalizedStandard = normalizeUsageLabel(standard);

  if (!normalizedUsage || !normalizedStandard) return null;

  return (
    profiles.find(
      (profile) =>
        normalizeUsageLabel(profile.usage) === normalizedUsage &&
        normalizeUsageLabel(profile.standard) === normalizedStandard,
    ) ?? null
  );
}

export interface ApprovalGuideBreakdown {
  areaM2: number;
  usage: string;
  standard: string;
  baseValueM2: number;
  aliquotPercent: number;
  licenseUnitValue: number;
  licenseAmount: number;
  permitFee: number;
  totalAmount: number;
  profile?: MunicipalApprovalRateProfile | null;
}

export function calculateApprovalGuideBreakdown(
  area: number,
  usage: string | null | undefined,
  standard: string | null | undefined,
  settings?: TenantSettings | null,
): ApprovalGuideBreakdown {
  const profile = resolveApprovalRateProfile(usage, standard, settings);
  const areaM2 = Math.max(0, Number(area || 0));
  const baseValueM2 = Math.max(0, Number(profile?.rate ?? 0));
  const aliquotPercent = Math.max(0, Number(settings?.approvalAliquotPercent ?? 5));
  const permitFee = Math.max(
    0,
    Number(profile?.permitFee ?? settings?.taxaAprovacaoFinal ?? 0),
  );
  const licenseUnitValue = Number(
    (baseValueM2 * (aliquotPercent / 100)).toFixed(4),
  );
  const licenseAmount = Number((areaM2 * licenseUnitValue).toFixed(2));
  const totalAmount = Number((permitFee + licenseAmount).toFixed(2));

  return {
    areaM2,
    usage: usage ?? "",
    standard: standard ?? "",
    baseValueM2,
    aliquotPercent,
    licenseUnitValue,
    licenseAmount,
    permitFee,
    totalAmount,
    profile,
  };
}

export function calculateApprovalGuideAmount(
  area: number,
  usage: string | null | undefined,
  standard: string | null | undefined,
  settings?: TenantSettings | null,
) {
  return calculateApprovalGuideBreakdown(area, usage, standard, settings).totalAmount;
}


export function getProcessPaymentGuides(process: ProcessRecord, settings?: TenantSettings | null): PaymentGuideEntry[] {
  const persistedGuides = process.payment.guides ?? [];

  // No fluxo oficial, payment_guides/Neon é a fonte de verdade.
  // Não inferir existência de cobrança por status, tabela de preço ou texto de auditoria.
  if (persistedGuides.length > 0) {
    return persistedGuides;
  }

  // Compatibilidade estritamente limitada a processos históricos que ainda
  // armazenam somente a guia inicial no objeto payment.
  if (!process.payment.guideNumber?.trim()) {
    return [];
  }

  return [
    {
      kind: "protocolo",
      label: getGuideLabel("protocolo"),
      code: process.payment.guideNumber,
      amount: process.payment.amount || settings?.taxaProtocolo || 35.24,
      status: process.payment.status,
      dueDate: process.payment.dueDate,
      issuedAt: process.payment.issuedAt,
      expiresAt: process.payment.expiresAt,
    },
  ];
}

export function isProcessPaymentGuideSharedExternally(
  process: ProcessRecord,
  guide: PaymentGuideEntry,
) {
  // Protocolo e aprovação/Alvará são cobranças dirigidas ao interessado e
  // ficam disponíveis assim que oficialmente emitidas. O ISSQN / Projeto
  // preserva a liberação manual já existente no workflow municipal.
  if (
    guide.kind === "protocolo" ||
    guide.kind === "aprovacao_final" ||
    guide.kind === "habite_se"
  ) return true;

  const guideCode = guide.code?.trim();
  if (!guideCode) return false;

  return (process.messages ?? []).some(
    (item) =>
      (item.audience === "externo" || item.audience === "misto") &&
      item.message.includes(guideCode),
  );
}

export function getExternallyVisibleProcessPaymentGuides(
  process: ProcessRecord,
  settings?: TenantSettings | null,
) {
  return getProcessPaymentGuides(process, settings).filter((guide) =>
    isProcessPaymentGuideSharedExternally(process, guide),
  );
}

export function serializeMarker(label: string, color: string) {
  const paletteEntry = getMarkerPaletteEntry(color);
  return `${label}::${paletteEntry.id}`;
}

export function parseMarker(tag: string) {
  const [label, rawColor = getDefaultMarkerPaletteEntry().id] = tag.includes("::")
    ? tag.split("::")
    : [tag, getDefaultMarkerPaletteEntry().id];
  const paletteEntry = getMarkerPaletteEntry(rawColor);
  return {
    label,
    color: paletteEntry.value,
    colorId: paletteEntry.id,
    palette: paletteEntry,
  };
}

export const roleLabels: Record<UserRole, string> = {
  master_admin: "Administrador Geral",
  master_ops: "Operação Geral",
  prefeitura_admin: "Administrador da Prefeitura",
  prefeitura_supervisor: "Diretor",
  analista: "Analista",
  financeiro: "Financeiro",
  setor_intersetorial: "Administrativo / Protocolo",
  fiscal: "Fiscalização e Postura",
  profissional_externo: "Profissional Externo",
  property_owner: "Proprietário do Imóvel",
  proprietario_consulta: "Proprietário",
};

export const institutionPermissionAliases: Record<InstitutionManagementPermission, Permission> = {
  manage_institutions: "manage_tenants",
  manage_institution_users: "manage_tenant_users",
  manage_institution_branding: "manage_tenant_branding",
};

export const accessLevelLabels: Record<1 | 2 | 3, string> = {
  1: "Nível 1",
  2: "Nível 2",
  3: "Nível 3",
};

export const roleSuggestedTitles: Record<UserRole, string> = {
  master_admin: "Administrador Geral da Plataforma",
  master_ops: "Operação Geral da Plataforma",
  prefeitura_admin: "Administrador da Prefeitura",
  prefeitura_supervisor: "Diretor",
  analista: "Analista Técnico",
  financeiro: "Financeiro Municipal",
  setor_intersetorial: "Funcionário Administrativo",
  fiscal: "Fiscalização e Postura",
  profissional_externo: "Profissional Externo",
  property_owner: "Proprietário do Imóvel",
  proprietario_consulta: "Proprietário do Imóvel",
};

const rolePermissions: Record<UserRole, Permission[]> = {
  master_admin: ["view_master_dashboard", "manage_tenants", "manage_modules", "manage_commercial_plans", "view_platform_metrics", "manage_own_profile"],
  master_ops: ["view_master_dashboard", "manage_tenants", "manage_commercial_plans", "view_platform_metrics", "manage_own_profile"],
  prefeitura_admin: [
    "manage_tenant_users",
    "manage_tenant_branding",
    "manage_own_profile",
    "view_own_processes",
  ],
  prefeitura_supervisor: ["manage_protocols", "review_processes", "dispatch_interdepartmental", "manage_fiscal_financial", "sign_documents", "manage_own_profile", "view_own_processes"],
  analista: ["manage_protocols", "review_processes", "dispatch_interdepartmental", "sign_documents", "manage_own_profile", "view_own_processes"],
  financeiro: ["manage_financial", "manage_fiscal_financial", "sign_documents", "manage_own_profile", "view_own_processes"],
  setor_intersetorial: ["manage_protocols", "dispatch_interdepartmental", "sign_documents", "manage_own_profile", "view_own_processes"],
  fiscal: ["review_processes", "manage_fiscal_financial", "manage_own_profile", "view_own_processes"],
  profissional_externo: ["submit_processes", "view_own_processes", "sign_documents", "manage_own_profile"],
  property_owner: ["view_own_processes", "manage_own_profile"],
  proprietario_consulta: ["view_own_processes", "manage_own_profile"],
};

export const sessionUsers: SessionUser[] = [
  {
    id: "u-master",
    name: "Jonatas Rodrigues",
    role: "master_admin",
    accessLevel: 3,
    tenantId: null,
    title: "Administrador Geral da Plataforma",
    email: "roksparta02@gmail.com",
    accountStatus: "active",
    userType: "Administrador",
    department: "Plataforma",
  },
  {
    id: "u-admin-clp",
    name: "Camila Andrade",
    role: "prefeitura_admin",
    accessLevel: 3,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Administrador da Prefeitura",
    email: "camila@campolimpopaulista.sp.gov.br",
    accountStatus: "active",
    userType: "Administrador",
    department: "Administracao Municipal",
  },
  {
    id: "u-analyst-clp",
    name: "Marcelo Teixeira",
    role: "analista",
    accessLevel: 2,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Analista urbanístico",
    email: "marcelo@campolimpopaulista.sp.gov.br",
    accountStatus: "active",
    userType: "Interno",
    department: "Analise",
  },
  {
    id: "u-fin-clp",
    name: "Fernanda Souza",
    role: "financeiro",
    accessLevel: 2,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Financeiro Municipal",
    email: "fernanda@campolimpopaulista.sp.gov.br",
    accountStatus: "active",
    userType: "Interno",
    department: "Financeiro",
  },
  {
    id: "u-fiscal-clp",
    name: "Luciana Prado",
    role: "fiscal",
    accessLevel: 2,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Fiscalizacao e Postura",
    email: "luciana@campolimpopaulista.sp.gov.br",
    accountStatus: "active",
    userType: "Interno",
    department: "Fiscalizacao",
  },
  {
    id: "u-ext-1",
    name: "Patricia Moraes",
    role: "profissional_externo",
    accessLevel: 1,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Arquiteta responsável",
    email: "patricia@estudiomoraes.com.br",
    accountStatus: "active",
    userType: "Profissional externo",
    department: "Acesso Externo",
  },
  {
    id: "u-ext-arturer",
    name: "Arturerfarm2",
    role: "profissional_externo",
    accessLevel: 1,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Profissional Externo",
    email: "arturerfarm2@gmail.com",
    accountStatus: "active",
    userType: "Profissional externo",
    department: "Acesso Externo",
  },
  {
    id: "u-owner-1",
    name: "Sergio Matos",
    role: "property_owner",
    accessLevel: 1,
    tenantId: "tenant-campo",
    municipalityId: "tenant-campo",
    title: "Proprietario do Imovel",
    email: "sergio@dominio.com",
    accountStatus: "active",
    userType: "Usuário externo",
    department: "Consulta",
  },
].map((user) => normalizeSessionUserScope(user as SessionUser));

export const userProfiles: UserProfile[] = [
  {
    userId: "u-master",
    fullName: "Jonatas Rodrigues",
    email: "roksparta02@gmail.com",
    phone: "(11) 98888-1000",
    cpfCnpj: "000.000.000-00",
    rg: "",
    birthDate: "",
    professionalType: "Administrador de Plataforma",
    registrationNumber: "",
    companyName: "SIGAPRO Tecnologia",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    avatarUrl: "",
    bio: "Responsável pela operação geral da plataforma.",
  },
  {
    userId: "u-admin-clp",
    fullName: "Camila Andrade",
    email: "camila@campolimpopaulista.sp.gov.br",
    phone: "(11) 4000-1234",
    cpfCnpj: "111.222.333-44",
    rg: "",
    birthDate: "",
    professionalType: "Gestora Publica",
    registrationNumber: "",
    companyName: "Prefeitura de Campo Limpo Paulista",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Campo Limpo Paulista",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Administracao da Secretaria de Planejamento.",
  },
  {
    userId: "u-analyst-clp",
    fullName: "Marcelo Teixeira",
    email: "marcelo@campolimpopaulista.sp.gov.br",
    phone: "(11) 4000-2222",
    cpfCnpj: "222.333.444-55",
    rg: "",
    birthDate: "",
    professionalType: "Engenheiro Civil",
    registrationNumber: "CREA 123456-SP",
    companyName: "Prefeitura de Campo Limpo Paulista",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Campo Limpo Paulista",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Analista responsável por aprovação urbanística.",
  },
  {
    userId: "u-fin-clp",
    fullName: "Fernanda Souza",
    email: "fernanda@campolimpopaulista.sp.gov.br",
    phone: "(11) 4000-3333",
    cpfCnpj: "333.444.555-66",
    rg: "",
    birthDate: "",
    professionalType: "Gestora Financeira",
    registrationNumber: "",
    companyName: "Prefeitura de Campo Limpo Paulista",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Campo Limpo Paulista",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Gestão de guias e arrecadação.",
  },
  {
    userId: "u-fiscal-clp",
    fullName: "Luciana Prado",
    email: "luciana@campolimpopaulista.sp.gov.br",
    phone: "(11) 4000-4444",
    cpfCnpj: "444.555.666-00",
    rg: "",
    birthDate: "",
    professionalType: "Fiscal Municipal",
    registrationNumber: "",
    companyName: "Prefeitura de Campo Limpo Paulista",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Campo Limpo Paulista",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Fiscalizacao Urbana e Posturas Municipais.",
  },
  {
    userId: "u-ext-1",
    fullName: "Patricia Moraes",
    email: "patricia@estudiomoraes.com.br",
    phone: "(11) 97777-8899",
    cpfCnpj: "444.555.666-77",
    rg: "",
    birthDate: "",
    professionalType: "Arquiteta",
    registrationNumber: "CAU A12345-6",
    companyName: "Estudio Moraes",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    avatarUrl: "",
    bio: "Responsável por projetos residenciais e comerciais.",
  },
  {
    userId: "u-ext-arturer",
    fullName: "Joao Vitor",
    email: "arturerfarm2@gmail.com",
    phone: "1156458785",
    cpfCnpj: "4789652355",
    rg: "457895204",
    birthDate: "1958-02-03",
    professionalType: "Engenheiro Civil",
    registrationNumber: "4567891235",
    companyName: "",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Campo Limpo Paulista",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    useAvatarInHeader: true,
    bio: "",
  },
  {
    userId: "u-owner-1",
    fullName: "Sergio Matos",
    email: "sergio@dominio.com",
    phone: "(11) 96666-1111",
    cpfCnpj: "555.666.777-88",
    rg: "",
    birthDate: "",
    professionalType: "Proprietario",
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
    bio: "Acompanhamento de Protocolos Vinculados ao Imovel.",
  },
];

export const ownerRequests: OwnerProjectRequest[] = [];
export const ownerLinks: OwnerProjectLink[] = [];
export const ownerMessages: OwnerProfessionalMessage[] = [];

export const tenants: Tenant[] = [
  {
    id: "tenant-campo",
    name: "Prefeitura de Campo Limpo Paulista",
    city: "Campo Limpo Paulista",
    state: "SP",
    status: "ativo",
    plan: "Plano institucional",
    activeModules: ["Protocolo", "Análise", "Financeiro", "Assinatura", "Despacho", "Configurações"],
    users: 6,
    processes: 3,
    revenue: 186800,
    subdomain: "campolimpopaulista",
    theme: { primary: "#0f3557", accent: "#178f78" },
  },
];

export const tenantSettings: TenantSettings[] = [
  {
    tenantId: "tenant-campo",
    cnpj: "12.345.678/0001-90",
    endereco: "Av. Adherbal da Costa Moreira, 255 - Centro - Campo Limpo Paulista/SP",
    telefone: "(11) 4000-1000",
    email: "planejamento@campolimpopaulista.sp.gov.br",
    site: "https://campolimpopaulista.sp.gov.br",
    secretariaResponsavel: "Secretaria de Planejamento e Obras",
    secretariaTelefone: "(11) 4000-1000",
    secretariaEmail: "planejamento@campolimpopaulista.sp.gov.br",
    diretoriaResponsavel: "Diretoria de Aprovação de Projetos",
    diretoriaTelefone: "(11) 4000-1010",
    diretoriaEmail: "diretoria.aprovacao@campolimpopaulista.sp.gov.br",
    footerContactSource: "diretoria",
    horarioAtendimento: "Segunda a sexta, das 8h as 17h",
    brasaoUrl: "",
    bandeiraUrl: "",
    logoUrl: "",
    imagemHeroUrl: "",
    resumoPlanoDiretor: "Plano diretor com foco em adensamento controlado, sustentabilidade e qualificacao dos eixos urbanos.",
    resumoUsoSolo: "Uso e ocupacao do solo com parametros para zona mista, residencial, comercial e de protecao ambiental.",
    leisComplementares: "Lei complementar 120/2024, codigo de obras municipal e normas de acessibilidade.",
    linkPortalCliente: "https://campolimpopaulista.sigapromunicipal.com.br",
    protocoloPrefixo: "PMCLP",
    guiaPrefixo: "DAM-CLP",
    chavePix: "pix@campolimpopaulista.sp.gov.br",
    beneficiarioArrecadacao: "Prefeitura de Campo Limpo Paulista",
    taxaProtocolo: 35.24,
    taxaIssPorMetroQuadrado: 12.5,
    issStageEnabled: true,
    taxaAprovacaoFinal: 180,
    finalApprovalFeeEnabled: true,
    registroProfissionalObrigatorio: true,
    contractNumber: "CT-2026-001",
    contractStart: "2026-03-01",
    contractEnd: "2027-02-28",
    monthlyFee: 1290,
    setupFee: 3500,
    signatureMode: "eletronica",
    clientDeliveryLink: "https://campolimpopaulista.sigapromunicipal.com.br",
    logoScale: 1,
    logoOffsetX: 0,
    logoOffsetY: 0,
    headerLogoScale: 1,
    headerLogoOffsetX: 0,
    headerLogoOffsetY: 0,
    footerLogoScale: 1,
    footerLogoOffsetX: 0,
    footerLogoOffsetY: 0,
    logoAlt: "Logo institucional da Prefeitura de Campo Limpo Paulista",
    logoUpdatedAt: "",
    logoUpdatedBy: "",
    logoFrameMode: "soft-square",
    logoFitMode: "contain",
    headerLogoFrameMode: "soft-square",
    headerLogoFitMode: "contain",
    footerLogoFrameMode: "soft-square",
    footerLogoFitMode: "contain",
    planoDiretorArquivoNome: "",
    planoDiretorArquivoUrl: "",
    usoSoloArquivoNome: "",
    usoSoloArquivoUrl: "",
    zoneamentoArquivoNome: "",
    zoneamentoArquivoUrl: "",
    leisArquivoNome: "",
    leisArquivoUrl: "",
  },
];

export const platformModules = [
  { name: "Protocolo digital", description: "Cadastro completo de projetos, imovel, proprietario e fluxo inicial de atendimento." },
  { name: "Analise tecnica", description: "Fila de analise, despacho, exigencias e decisao do processo." },
  { name: "Financeiro", description: "Guias vinculadas ao IPTU, acompanhamento de arrecadacao e baixa." },
  { name: "Assinatura", description: "Blocos de assinatura e trilha de evidencias." },
  { name: "Configurações", description: "Cadastro da Prefeitura, plano diretor, uso do solo e identidade institucional." },
  { name: "Acesso externo", description: "Protocolos por profissionais externos com isolamento entre usuarios." },
];

export const planCatalog: PlanItem[] = [
  {
    id: "plan-basic",
    accountLevel: "Basic",
    name: "Basic",
    subtitle: "Entrada institucional controlada",
    description: "Fluxo essencial para prefeituras que estão iniciando a digitalização do protocolo e da análise técnica.",
    price: 1490,
    billingCycle: "mensal",
    badge: "",
    badgeVariant: "slate",
    featuresIncluded: [
      "Protocolo digital institucional",
      "Triagem documental guiada",
      "Acesso externo para profissionais",
      "Branding municipal essencial",
    ],
    featuresExcluded: [
      "Módulo financeiro avançado",
      "Automação ampliada de operação",
      "Atendimento enterprise dedicado",
    ],
    modulesIncluded: ["Protocolo digital", "Analise tecnica", "Configurações", "Acesso externo"],
    maxUsers: 12,
    maxProcesses: 250,
    maxDepartments: 4,
    maxStorageGb: 20,
    isFeatured: false,
    isActive: true,
    isPublic: true,
    isInternalOnly: false,
    isCustom: false,
    isVisibleInMaster: true,
    displayOrder: 1,
    accentColor: "#1d4ed8",
    notes: "Ideal para municípios com operação inicial e baixa complexidade de análise.",
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-18T09:00:00.000Z",
  },
  {
    id: "plan-pro",
    accountLevel: "Pro",
    name: "Pro",
    subtitle: "Operação municipal completa",
    description: "Plano de tração para prefeituras com análise técnica, financeiro e histórico institucional integrados.",
    price: 2890,
    billingCycle: "mensal",
    badge: "Mais popular",
    badgeVariant: "blue",
    featuresIncluded: [
      "Protocolo, análise e financeiro integrados",
      "Histórico e trilha operacional",
      "Filas por responsável e gestão por equipe",
      "Painéis executivos e alertas",
    ],
    featuresExcluded: [
      "Customizações enterprise profundas",
    ],
    modulesIncluded: ["Protocolo digital", "Analise tecnica", "Financeiro", "Configurações", "Acesso externo"],
    maxUsers: 40,
    maxProcesses: 1200,
    maxDepartments: 12,
    maxStorageGb: 80,
    isFeatured: true,
    isActive: true,
    isPublic: true,
    isInternalOnly: false,
    isCustom: false,
    isVisibleInMaster: true,
    displayOrder: 2,
    accentColor: "#0f766e",
    notes: "Plano recomendado para a maior parte das prefeituras da carteira.",
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-18T09:00:00.000Z",
  },
  {
    id: "plan-premium",
    accountLevel: "Premium",
    name: "Premium",
    subtitle: "Governança ampliada e multi-secretaria",
    description: "Camada premium com maior capacidade operacional, monitoramento gerencial e personalização institucional estendida.",
    price: 4890,
    billingCycle: "mensal",
    badge: "Recomendado",
    badgeVariant: "emerald",
    featuresIncluded: [
      "Tudo do plano Pro",
      "Operação multi-secretaria",
      "Dashboards ampliados por área",
      "Políticas e fluxos institucionais refinados",
      "Mais capacidade documental e de usuários",
    ],
    featuresExcluded: [
      "SLA enterprise dedicado 24/7",
    ],
    modulesIncluded: [...platformModules.map((module) => module.name)],
    maxUsers: 120,
    maxProcesses: 5000,
    maxDepartments: 30,
    maxStorageGb: 250,
    isFeatured: false,
    isActive: true,
    isPublic: true,
    isInternalOnly: false,
    isCustom: false,
    isVisibleInMaster: true,
    displayOrder: 3,
    accentColor: "#7c3aed",
    notes: "Voltado a cidades com maior volume operacional e necessidade de governança ampliada.",
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-18T09:00:00.000Z",
  },
  {
    id: "plan-enterprise",
    accountLevel: "Enterprise",
    name: "Enterprise",
    subtitle: "Estrutura customizada e comercial",
    description: "Plano corporativo com desenho contratual próprio, camadas extras de atendimento e pacote de implantação dedicado.",
    price: 0,
    billingCycle: "personalizado",
    badge: "Enterprise",
    badgeVariant: "amber",
    featuresIncluded: [
      "Ambiente e módulos configuráveis",
      "Regras comerciais personalizadas",
      "Atendimento e implantação dedicados",
      "Possibilidade de pricing customizado",
    ],
    featuresExcluded: [],
    modulesIncluded: [...platformModules.map((module) => module.name)],
    maxUsers: null,
    maxProcesses: null,
    maxDepartments: null,
    maxStorageGb: null,
    isFeatured: false,
    isActive: true,
    isPublic: false,
    isInternalOnly: true,
    isCustom: true,
    isVisibleInMaster: true,
    displayOrder: 4,
    accentColor: "#b45309",
    notes: "Usado para propostas comerciais especiais e contratos sob medida.",
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-18T09:00:00.000Z",
  },
];

export const clientPlanAssignments: ClientPlanAssignment[] = [
  {
    id: "assignment-tenant-campo-pro",
    municipalityId: "tenant-campo",
    planId: "plan-pro",
    contractStatus: "ativo",
    startsAt: "2026-01-10",
    endsAt: "2027-01-10",
    billingCycle: "mensal",
    billingNotes: "Contrato mensal com recorrência ativa e operação em regime padrão.",
    customPrice: null,
    isCustom: false,
    createdAt: "2026-01-10T10:00:00.000Z",
    updatedAt: "2026-04-18T09:00:00.000Z",
  },
];

export const mobileThemePresets: ThemePreset[] = [
  {
    id: "claro-institucional",
    label: "Claro institucional",
    description: "Base clara com azul institucional e leitura municipal.",
    primary: "#163b63",
    accent: "#3b82f6",
    background: "#ffffff",
    inverseMain: false,
  },
  {
    id: "claro-neutro",
    label: "Claro neutro",
    description: "Base neutra com cinza ardósia e visual sóbrio.",
    primary: "#334155",
    accent: "#64748b",
    background: "#f4f6f8",
    inverseMain: false,
  },
  {
    id: "escuro-institucional",
    label: "Escuro institucional",
    description: "Azul profundo com sensação premium de govtech municipal.",
    primary: "#0f2a44",
    accent: "#67e8f9",
    background: "#081421",
    inverseMain: true,
  },
  {
    id: "escuro-grafite",
    label: "Escuro grafite",
    description: "Grafite elegante com acento azul contido.",
    primary: "#1f2937",
    accent: "#93c5fd",
    background: "#111827",
    inverseMain: true,
  },
];

export const desktopThemePresets: ThemePreset[] = [
  ...mobileThemePresets,
  {
    id: "claro-civico",
    label: "Claro cívico",
    description: "Base clara com azul petróleo e sensação institucional refinada.",
    primary: "#1d4f6f",
    accent: "#38bdf8",
    background: "#f3f7fb",
    inverseMain: false,
  },
  {
    id: "claro-ardosia",
    label: "Claro ardósia",
    description: "Cinza nobre com acento sóbrio e leitura corporativa.",
    primary: "#475569",
    accent: "#94a3b8",
    background: "#f5f7fa",
    inverseMain: false,
  },
  {
    id: "claro-vinho",
    label: "Claro vinho",
    description: "Base clara com vinho institucional e presença mais executiva.",
    primary: "#7c2d3a",
    accent: "#be445d",
    background: "#fbf5f7",
    inverseMain: false,
  },
  {
    id: "claro-rosa",
    label: "Claro rosa",
    description: "Rosa sofisticado com leitura leve e aparência premium.",
    primary: "#9d4b74",
    accent: "#ec4899",
    background: "#fcf6fa",
    inverseMain: false,
  },
  {
    id: "claro-verde",
    label: "Claro verde",
    description: "Verde administrativo com sensação estável e confiável.",
    primary: "#1f5d4d",
    accent: "#22c55e",
    background: "#f3faf7",
    inverseMain: false,
  },
  {
    id: "claro-marrom",
    label: "Claro marrom",
    description: "Marrom tabaco com tom executivo e mais calor institucional.",
    primary: "#6b4f3b",
    accent: "#c08457",
    background: "#f8f5f2",
    inverseMain: false,
  },
  {
    id: "escuro-oceano",
    label: "Escuro oceano",
    description: "Azul profundo com acento aqua para um visual premium.",
    primary: "#10293f",
    accent: "#22d3ee",
    background: "#091723",
    inverseMain: true,
  },
  {
    id: "escuro-petroleo",
    label: "Escuro petróleo",
    description: "Base petróleo elegante com contraste estável para operação.",
    primary: "#16343f",
    accent: "#60a5fa",
    background: "#0c1920",
    inverseMain: true,
  },
  {
    id: "escuro-vinho",
    label: "Escuro vinho",
    description: "Vinho profundo com elegância corporativa e contraste sóbrio.",
    primary: "#4f1f2d",
    accent: "#fb7185",
    background: "#170d12",
    inverseMain: true,
  },
  {
    id: "escuro-floresta",
    label: "Escuro floresta",
    description: "Verde fechado com presença institucional forte e serena.",
    primary: "#17372d",
    accent: "#4ade80",
    background: "#0c1713",
    inverseMain: true,
  },
  {
    id: "escuro-cacau",
    label: "Escuro cacau",
    description: "Marrom escuro elegante para uma leitura enterprise menos fria.",
    primary: "#3f2d21",
    accent: "#d4a373",
    background: "#17120f",
    inverseMain: true,
  },
];

export const themePresets: ThemePreset[] = desktopThemePresets;

export const processTypeCatalog = [
  "Aprovação de Projeto Residencial",
  "Aprovação de Projeto Comercial",
  "Aprovação de Projeto Industrial",
  "Aprovação de Projeto Institucional",
  "Projeto Multifamiliar",
  "Projeto de Reforma",
  "Projeto de Ampliacao",
  "Projeto de Regularizacao",
  "Projeto de Demolicao",
  "Projeto de Terraplenagem",
  "Projeto de Drenagem",
  "Projeto de Contencao",
  "Loteamento",
  "Desmembramento",
  "Remembramento",
  "Desdobro de Lote",
  "Certidao de Numeracao Predial",
  "Certidao de Uso do Solo",
  "Consulta Previa",
  "Alvara de Construcao",
  "Alvara de Reforma",
  "Alvara de Demolicao",
  "Habite-se",
  "Carta de Habite-se Parcial",
  "Certificado de Conclusão de Obra",
  "Licenciamento de Fachada",
  "Licenciamento de Muro e Fechamento",
  "Licenciamento de Tapume",
  "Aprovação de Projeto de Acessibilidade",
  "Aprovação de Projeto de Combate a Incêndio",
  "Aprovação de Projeto de Infraestrutura",
  "Aprovação de Projeto de Condomínio",
];

const checklistPadraoProjeto = [
  { id: "base-1", label: "RG ou CNH do proprietario", required: true },
  { id: "base-2", label: "CPF do proprietario", required: true },
  { id: "base-3", label: "IPTU", required: true },
  { id: "base-4", label: "Matricula do imovel", required: true },
  { id: "base-5", label: "Projeto arquitetonico", required: true },
  { id: "base-6", label: "Memorial descritivo", required: true },
  { id: "base-7", label: "ART ou RRT", required: true },
];

const checklistParcelamento = [
  { id: "parc-1", label: "Matricula do imovel", required: true },
  { id: "parc-2", label: "Levantamento planialtimetrico", required: true },
  { id: "parc-3", label: "Projeto urbanistico", required: true },
  { id: "parc-4", label: "Memorial descritivo", required: true },
  { id: "parc-5", label: "Anuencia ambiental", required: false },
];

const checklistCertidao = [
  { id: "cert-1", label: "Requerimento assinado", required: true },
  { id: "cert-2", label: "RG ou CNH do requerente", required: true },
  { id: "cert-3", label: "CPF do requerente", required: true },
  { id: "cert-4", label: "IPTU", required: true },
  { id: "cert-5", label: "Matricula do imovel", required: false },
];

export const checklistTemplates: ChecklistTemplate[] = [
  {
    id: "check-licenciamento",
    tenantId: null,
    processType: "licenciamento",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-licenciamento-urbanistico",
    tenantId: null,
    processType: "Licenciamento Urbanístico",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-residencial",
    tenantId: null,
    processType: "Aprovação de projeto residencial",
    items: [
      { id: "res-1", label: "RG ou CNH do proprietario", required: true },
      { id: "res-2", label: "CPF do proprietario", required: true },
      { id: "res-3", label: "IPTU", required: true },
      { id: "res-4", label: "Matricula do imovel", required: true },
      { id: "res-5", label: "Projeto arquitetonico", required: true },
      { id: "res-6", label: "Memorial descritivo", required: true },
      { id: "res-7", label: "ART ou RRT", required: true },
    ],
  },
  {
    id: "check-multi",
    tenantId: null,
    processType: "Projeto multifamiliar",
    items: [
      { id: "mul-1", label: "Projeto arquitetonico", required: true },
      { id: "mul-2", label: "Memorial descritivo", required: true },
      { id: "mul-3", label: "Levantamento planialtimetrico", required: true },
      { id: "mul-4", label: "Matricula do imovel", required: true },
      { id: "mul-5", label: "Licencas complementares", required: false },
    ],
  },
  {
    id: "check-comercial",
    tenantId: null,
    processType: "Aprovação de Projeto Comercial",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-industrial",
    tenantId: null,
    processType: "Aprovação de Projeto Industrial",
    items: [...checklistPadraoProjeto, { id: "ind-1", label: "Licencas complementares", required: false }],
  },
  {
    id: "check-institucional",
    tenantId: null,
    processType: "Aprovação de Projeto Institucional",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-reforma",
    tenantId: null,
    processType: "Projeto de Reforma",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-ampliacao",
    tenantId: null,
    processType: "Projeto de Ampliacao",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-regularizacao",
    tenantId: null,
    processType: "Projeto de Regularizacao",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-demolicao",
    tenantId: null,
    processType: "Projeto de Demolicao",
    items: [
      { id: "dem-1", label: "RG ou CNH do proprietario", required: true },
      { id: "dem-2", label: "CPF do proprietario", required: true },
      { id: "dem-3", label: "IPTU", required: true },
      { id: "dem-4", label: "Matricula do imovel", required: true },
      { id: "dem-5", label: "Projeto ou croqui da demolicao", required: true },
      { id: "dem-6", label: "ART ou RRT", required: true },
    ],
  },
  {
    id: "check-terraplenagem",
    tenantId: null,
    processType: "Projeto de Terraplenagem",
    items: [
      { id: "terr-1", label: "IPTU", required: true },
      { id: "terr-2", label: "Matricula do imovel", required: true },
      { id: "terr-3", label: "Levantamento planialtimetrico", required: true },
      { id: "terr-4", label: "Projeto de terraplenagem", required: true },
      { id: "terr-5", label: "Memorial descritivo", required: true },
      { id: "terr-6", label: "ART ou RRT", required: true },
    ],
  },
  {
    id: "check-loteamento",
    tenantId: null,
    processType: "Loteamento",
    items: checklistParcelamento,
  },
  {
    id: "check-desmembramento",
    tenantId: null,
    processType: "Desmembramento",
    items: checklistParcelamento,
  },
  {
    id: "check-remembramento",
    tenantId: null,
    processType: "Remembramento",
    items: checklistParcelamento,
  },
  {
    id: "check-desdobro",
    tenantId: null,
    processType: "Desdobro de Lote",
    items: checklistParcelamento,
  },
  {
    id: "check-cert-num",
    tenantId: null,
    processType: "Certidao de Numeracao Predial",
    items: checklistCertidao,
  },
  {
    id: "check-cert-uso",
    tenantId: null,
    processType: "Certidao de Uso do Solo",
    items: checklistCertidao,
  },
  {
    id: "check-consulta",
    tenantId: null,
    processType: "Consulta Previa",
    items: checklistCertidao,
  },
  {
    id: "check-alvara-construcao",
    tenantId: null,
    processType: "Alvara de Construcao",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-alvara-reforma",
    tenantId: null,
    processType: "Alvara de Reforma",
    items: checklistPadraoProjeto,
  },
  {
    id: "check-habite-se",
    tenantId: null,
    processType: "Habite-se",
    items: [
      { id: "hab-1", label: "RG ou CNH do proprietario", required: true },
      { id: "hab-2", label: "CPF do proprietario", required: true },
      { id: "hab-3", label: "IPTU atualizado", required: true },
      { id: "hab-4", label: "Matricula do imovel", required: true },
      { id: "hab-5", label: "Alvará de construção ou regularização", required: true },
      { id: "hab-6", label: "Projeto aprovado pela Prefeitura", required: true },
      { id: "hab-7", label: "ART ou RRT de execução ou conclusão da obra", required: true },
      { id: "hab-8", label: "Termo de conclusão da obra pelo responsável técnico", required: true },
      { id: "hab-9", label: "AVCB ou CLCB, quando aplicavel", required: false },
      { id: "hab-10", label: "Licenças e anuências complementares, quando aplicável", required: false },
    ],
  },
  {
    id: "check-habite-se-parcial",
    tenantId: null,
    processType: "Carta de Habite-se Parcial",
    items: [
      { id: "habp-1", label: "RG ou CNH do proprietario", required: true },
      { id: "habp-2", label: "CPF do proprietario", required: true },
      { id: "habp-3", label: "IPTU atualizado", required: true },
      { id: "habp-4", label: "Matricula do imovel", required: true },
      { id: "habp-5", label: "Alvará de construção ou regularização", required: true },
      { id: "habp-6", label: "Projeto aprovado pela Prefeitura", required: true },
      { id: "habp-7", label: "Planta destacando a etapa concluída", required: true },
      { id: "habp-8", label: "ART ou RRT de execução ou conclusão da etapa", required: true },
      { id: "habp-9", label: "Termo de conclusão parcial pelo responsável técnico", required: true },
      { id: "habp-10", label: "AVCB ou CLCB, quando aplicavel", required: false },
      { id: "habp-11", label: "Licenças e anuências complementares, quando aplicável", required: false },
    ],
  },
];

export const documentTemplates = [
  { id: "tpl-despacho-1", type: "despacho", title: "Despacho para setor financeiro", body: "Encaminho o processo para validacao da arrecadacao e conferencia da guia municipal." },
  { id: "tpl-despacho-2", type: "despacho", title: "Despacho para setor intersetorial", body: "Encaminho para manifestacao tecnica complementar dentro do prazo estabelecido." },
  { id: "tpl-parecer-1", type: "parecer", title: "Parecer favorável com ressalvas", body: "Análise favorável, condicionada ao atendimento das exigências descritas no processo." },
  { id: "tpl-parecer-2", type: "parecer", title: "Parecer desfavorável", body: "Análise desfavorável em razão de inconformidade com a legislação urbanística vigente." },
  { id: "tpl-decisao-1", type: "decisao", title: "Decisao de deferimento", body: "Fica deferido o processo, observadas as condicionantes registradas." },
  { id: "tpl-decisao-2", type: "decisao", title: "Decisao de indeferimento", body: "Fica indeferido o processo em razao das inconsistencias registradas." },
];

export const cmsSections = [
  { title: "Pagina institucional", status: "publicado", content: "Apresentacao institucional do SIGAPRO sem exposicao de valores comerciais." },
  { title: "Bloco de integracoes", status: "rascunho", content: "Informacoes sobre protocolo oficial, IPTU, guias e assinatura eletronica." },
  { title: "Entrega ao cliente", status: "rascunho", content: "Geracao do link da prefeitura com brasao, bandeira, leis e identidade visual." },
];

export const processRecords: ProcessRecord[] = [
  {
    id: "proc-001",
    tenantId: "tenant-campo",
    protocol: "SIG-2026-0001",
    externalProtocol: "PMCLP-2026-23109",
    title: "Residencial Santa Cruz",
    type: "Aprovação de projeto residencial",
    status: "pagamento_pendente",
    ownerName: "Sergio Matos",
    ownerDocument: "***.401.218-**",
    technicalLead: "Patricia Moraes",
    createdBy: "u-ext-1",
    tags: ["residencial", "zona mista"],
    address: "Rua das Acacias, 145 - Jardim das Figueiras",
    notes: "Aguardando confirmacao da guia para seguir com distribuicao.",
    property: {
      registration: "44.018.223",
      iptu: "01.24.876.0031.000",
      lot: "15",
      block: "C",
      area: 320.5,
      usage: "Residencial",
      constructionStandard: "medio",
    },
    triage: {
      status: "concluido",
      assignedTo: "Camila Andrade",
      notes: "Triagem documental inicial concluida com envio para pagamento.",
    },
    checklistType: "Aprovação de projeto residencial",
    sla: {
      currentStage: "Pagamento e distribuicao",
      dueDate: "20/03/2026",
      hoursRemaining: 18,
      breached: false,
    },
    reopenHistory: [],
    documents: [
      { id: "doc-1", label: "RG ou CNH do proprietario", required: true, uploaded: true, signed: false, reviewStatus: "pendente", version: 1, source: "profissional", fileName: "rg-proprietario.pdf", mimeType: "application/pdf", sizeLabel: "240 KB" },
      { id: "doc-2", label: "CPF do proprietario", required: true, uploaded: true, signed: false, reviewStatus: "pendente", version: 1, source: "profissional", fileName: "cpf-proprietario.pdf", mimeType: "application/pdf", sizeLabel: "110 KB" },
      { id: "doc-3", label: "IPTU", required: true, uploaded: true, signed: false, reviewStatus: "aprovado", reviewedBy: "Marcelo Teixeira", version: 1, source: "profissional", fileName: "iptu-2026.pdf", mimeType: "application/pdf", sizeLabel: "520 KB" },
      { id: "doc-4", label: "Projeto arquitetonico", required: true, uploaded: true, signed: true, reviewStatus: "pendente", version: 2, source: "profissional", fileName: "projeto-arquitetonico.pdf", mimeType: "application/pdf", sizeLabel: "1.8 MB" },
    ],
    timeline: [
      { id: "t1", title: "Protocolo criado", detail: "Cadastro inicial finalizado pelo profissional externo.", actor: "Patricia Moraes", at: "18/03/2026 09:14" },
      { id: "t2", title: "Analise documental", detail: "Checklist inicial validado pela triagem.", actor: "Sistema", at: "18/03/2026 09:20" },
    ],
    requirements: [
      {
        id: "req-1",
        title: "Complementar quadro de areas",
        description: "Apresentar quadro de areas atualizado com taxa de ocupacao e permeabilidade.",
        status: "aberta",
        createdAt: "18/03/2026 14:20",
        dueDate: "22/03/2026",
        createdBy: "Marcelo Teixeira",
        targetName: "Patricia Moraes",
        visibility: "misto",
      },
    ],
    auditTrail: [
      {
        id: "aud-1",
        category: "sistema",
        title: "Processo protocolado",
        detail: "Entrada criada pelo portal externo com numeracao oficial.",
        actor: "Sistema",
        visibleToExternal: true,
        at: "18/03/2026 09:14",
      },
      {
        id: "aud-2",
        category: "financeiro",
        title: "Guia emitida",
        detail: "Guia DAM vinculada ao protocolo e ao cadastro imobiliario.",
        actor: "Sistema",
        visibleToExternal: true,
        at: "18/03/2026 09:15",
      },
    ],
    signatures: [
      {
        id: "sig-1",
        title: "Projeto arquitetonico",
        status: "concluido",
        evidence: {
          ip: "177.54.10.88",
          userAgent: "Chrome 135 / Windows",
          hash: "sha256:8f9c1c20b9d412fe4f3b8d0e9914e8f2a7a5c312",
          signedVersion: 2,
          timestampAuthority: "SIGAPRO TSA",
        },
        signers: [
          { name: "Patricia Moraes", role: "Profissional externo", signedAt: "18/03/2026 09:12" },
          { name: "Marcelo Teixeira", role: "Analista", signedAt: "18/03/2026 14:05" },
        ],
      },
    ],
    dispatches: [],
    messages: [
      {
        id: "msg-1",
        senderName: "Marcelo Teixeira",
        senderRole: "Analista",
        audience: "externo",
        message: "Favor acompanhar a compensação da guia para continuidade da análise.",
        at: "18/03/2026 14:12",
      },
    ],
    payment: {
      guideNumber: "DAM-CLP-2026-9914",
      amount: 35.24,
      status: "pendente",
      dueDate: "20/03/2026",
      issuedAt: "2026-03-18T09:14:00-03:00",
      expiresAt: "2026-03-18T10:14:00-03:00",
    },
  },
  {
    id: "proc-002",
    tenantId: "tenant-campo",
    protocol: "SIG-2026-0002",
    externalProtocol: "PMCLP-2026-4501",
    title: "Condominio Bosque do Sol",
    type: "Projeto multifamiliar",
    status: "triagem",
    ownerName: "Aline Nogueira",
    ownerDocument: "***.877.115-**",
    technicalLead: "Joao Vitor",
    createdBy: "u-ext-arturer",
    tags: ["multifamiliar", "piloto"],
    address: "Estrada da Serra, 2400 - Vale Verde",
    notes: "Protocolo multifamiliar em triagem documental com parâmetros institucionais ativos.",
    property: {
      registration: "99.102.221",
      iptu: "03.11.702.0001.000",
      lot: "2",
      block: "Q",
      area: 1240,
      usage: "Residencial",
      constructionStandard: "primeira",
    },
    triage: {
      status: "em_triagem",
      assignedTo: "Camila Andrade",
      notes: "Aguardando matricula do imovel para concluir triagem.",
    },
    checklistType: "Projeto multifamiliar",
    sla: {
      currentStage: "Triagem inicial",
      dueDate: "19/03/2026",
      hoursRemaining: 4,
      breached: false,
    },
    reopenHistory: [
      {
        id: "reopen-1",
        reason: "Retorno para complementacao da matricula do imovel.",
        actor: "Sistema",
        at: "17/03/2026 16:30",
      },
    ],
    documents: [
        { id: "doc-31", label: "Projeto arquitetonico", required: true, uploaded: true, signed: true, reviewStatus: "pendente", version: 1, source: "profissional", fileName: "torre-a.pdf", mimeType: "application/pdf", sizeLabel: "2.1 MB" },
        { id: "doc-32", label: "Matricula do imovel", required: true, uploaded: false, signed: false, reviewStatus: "pendente", version: 0, source: "profissional" },
      ],
    timeline: [{ id: "t31", title: "Triagem inicial", detail: "Triagem inicial com checklist institucional da Prefeitura.", actor: "Sistema", at: "17/03/2026 16:10" }],
    requirements: [],
    auditTrail: [
      {
        id: "aud-31",
        category: "sistema",
        title: "Triagem iniciada",
        detail: "Processo inserido na fila inicial de validacao documental.",
        actor: "Sistema",
        visibleToExternal: true,
        at: "17/03/2026 16:10",
      },
    ],
    signatures: [],
    dispatches: [],
    messages: [],
    payment: {
      guideNumber: "DAM-CLP-2026-8501",
      amount: 35.24,
      status: "pendente",
      dueDate: "19/03/2026",
      issuedAt: "2026-03-17T16:10:00-03:00",
      expiresAt: "2026-03-17T17:10:00-03:00",
    },
  },
];

export function can(session: SessionUser, permission: Permission) {
  if (session.role === "master_admin" || session.role === "master_ops") {
    return true;
  }

  // Administração da Prefeitura governa cadastros e configuração institucional.
  // Pode consultar processos, mas não recebe capacidades operacionais de setor.
  if (session.role === "prefeitura_admin") {
    const permissions = rolePermissions.prefeitura_admin;
    if (!permissions.includes(permission)) return false;
    if (permission === "manage_tenant_users" || permission === "manage_tenant_branding") {
      return session.accessLevel >= 3;
    }
    return true;
  }

  // Funcionários internos recebem capacidades somente dentro da própria pasta.
  // Isso também protege acesso por URL direta; não basta esconder o item no menu.
  if (isInternalRole(session.role)) {
    if (permission === "manage_tenant_users" || permission === "manage_tenant_branding") return false;
    if (permission === "manage_own_profile" || permission === "view_own_processes") return true;

    const operationalArea = resolveSessionOperationalArea(session);
    if (permission === "manage_protocols") return operationalArea === "protocolos";
    if (permission === "review_processes") return operationalArea === "analise";
    if (permission === "manage_financial") return operationalArea === "financeiro";
    if (permission === "manage_fiscal_financial") {
      return operationalArea === "financeiro" && session.accessLevel >= 2;
    }
    if (permission === "dispatch_interdepartmental" || permission === "sign_documents") {
      return session.accessLevel >= 2;
    }
    return false;
  }

  const permissionRole = isExternalProfessionalRole(session.role)
    ? "profissional_externo"
    : session.role;
  const permissions = rolePermissions[permissionRole as UserRole] ?? [];
  return permissions.includes(permission);
}

export function canInstitution(
  session: SessionUser,
  permission: InstitutionPermission | InstitutionManagementPermission,
) {
  const resolvedPermission =
    permission in institutionPermissionAliases
      ? institutionPermissionAliases[permission as InstitutionManagementPermission]
      : (permission as Permission);
  return can(session, resolvedPermission);
}

export function isExternalProfessionalRole(role: UserRole | string | null | undefined) {
  const normalized = (role ?? "").trim().toLowerCase();
  return ["profissional_externo", "professional_external", "professional", "profissional"].includes(normalized);
}

export function isInternalRole(role: UserRole | string | null | undefined) {
  const normalized = (role ?? "").trim().toLowerCase();
  return (
    normalized !== "master_admin" &&
    normalized !== "master_ops" &&
    !isExternalProfessionalRole(normalized) &&
    normalized !== "property_owner" &&
    normalized !== "proprietario_consulta"
  );
}

export function getOperationalScopeId(input: { municipalityId?: string | null; tenantId?: string | null }) {
  return input.municipalityId || input.tenantId || null;
}

export function getInstitutionOperationalId(input: InstitutionScopedInput) {
  return input.institutionId || input.municipalityId || input.tenantId || null;
}

export const getInstitutionScopeId = getInstitutionOperationalId;

export function matchesOperationalScope(
  scopeId: string | null | undefined,
  input: { municipalityId?: string | null; tenantId?: string | null },
) {
  if (!scopeId) return false;
  return getOperationalScopeId(input) === scopeId;
}

export function matchesInstitutionOperationalScope(scopeId: string | null | undefined, input: InstitutionScopedInput) {
  if (!scopeId) return false;
  return getInstitutionOperationalId(input) === scopeId;
}

export const matchesInstitutionScope = matchesInstitutionOperationalScope;

function normalizeDepartmentAccessLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveDepartmentAccessBucket(value: string | null | undefined) {
  const normalized = normalizeDepartmentAccessLabel(value);
  if (!normalized) return "";
  if (/protocolo|protocol|triagem|recepcao|administracao|administrativo|expediente|atendimento/.test(normalized)) return "protocolos";
  if (/finance|financa|fazenda|tribut|arrecad/.test(normalized)) return "financeiro";
  if (/analise|urbanismo|urbanistic|obra|engenharia|planejamento|licenciamento|aprovacao|fiscal|fiscalizacao|postura|topografia|cadista/.test(normalized)) return "analise";
  return normalized;
}

export type MunicipalOperationalArea = "protocolos" | "analise" | "financeiro";

export function resolveSessionOperationalArea(
  session: Pick<SessionUser, "role" | "department" | "title">,
): MunicipalOperationalArea | "" {
  const explicitDepartment = resolveDepartmentAccessBucket(session.department || "");
  if (
    explicitDepartment === "protocolos" ||
    explicitDepartment === "analise" ||
    explicitDepartment === "financeiro"
  ) {
    return explicitDepartment;
  }

  const titleDepartment = resolveDepartmentAccessBucket(session.title || "");
  if (
    titleDepartment === "protocolos" ||
    titleDepartment === "analise" ||
    titleDepartment === "financeiro"
  ) {
    return titleDepartment;
  }

  // Compatibilidade com contas internas antigas ainda sem department_id.
  // O papel canônico é usado somente quando não existe um departamento explícito.
  if (session.role === "setor_intersetorial") return "protocolos";
  if (session.role === "analista") return "analise";
  if (session.role === "financeiro" || session.role === "fiscal") return "financeiro";
  return "";
}

export function getRoleLandingPath(role: UserRole | string | null | undefined) {
  switch (role) {
    case "master_admin":
    case "master_ops":
    case "admin_master":
      return "/master";
    case "prefeitura_admin":
      return "/prefeitura";
    case "prefeitura_supervisor":
      return "/prefeitura/analise";
    case "analista":
      return "/prefeitura/analise";
    case "financeiro":
      return "/prefeitura/financeiro";
    case "setor_intersetorial":
      return "/prefeitura/protocolos";
    case "fiscal":
      return "/prefeitura/analise";
    case "profissional_externo":
    case "professional_external":
    case "professional":
    case "profissional":
      return "/dashboard";
    case "property_owner":
    case "proprietario_consulta":
      return "/proprietario";
    default:
      return "/dashboard";
  }
}

export function canAccessMunicipalArea(session: SessionUser, area: MunicipalOperationalArea) {
  if (session.role === "master_admin" || session.role === "master_ops") {
    return true;
  }

  // Diretor/supervisor é autoridade do seu setor, não um superusuário municipal.
  // Ex.: Diretor de Urbanismo governa Análise/Fiscalização, mas não recebe
  // Financeiro ou Protocolo automaticamente.
  if (session.role === "prefeitura_supervisor") {
    return resolveSessionOperationalArea(session) === area;
  }

  // O administrador municipal governa usuários/configurações e pode consultar
  // processos, mas não recebe uma fila operacional só porque seu departamento
  // contém "Administração".
  if (session.role === "prefeitura_admin") return false;
  if (!isInternalRole(session.role)) return false;

  const department = resolveSessionOperationalArea(session);
  return department === area;
}

export function hasCompensatedIssReturnedToAnalysis(process: ProcessRecord) {
  const paidIss = process.payment?.guides?.some(
    (guide) => guide.kind === "iss_obra" && guide.status === "compensada",
  );

  if (!paidIss) return false;

  const currentFolder = normalizeDepartmentAccessLabel(
    process.processControl?.currentFolder || "",
  );

  return (
    process.status === "analise_tecnica" &&
    /analise|urbanismo|urbanistica/.test(currentFolder)
  );
}

export function isProcessOwnedBySessionDepartment(session: SessionUser, process: ProcessRecord) {
  if (session.role === "master_admin" || session.role === "master_ops") {
    return true;
  }
  if (!isInternalRole(session.role) || session.role === "prefeitura_admin") return false;

  const userDepartment = resolveSessionOperationalArea(session);
  if (!userDepartment) return false;

  if (hasCompensatedIssReturnedToAnalysis(process)) {
    return userDepartment === "analise";
  }

  const issuedIssGuide = process.payment?.guides?.find(
    (guide) => guide.kind === "iss_obra" && guide.status !== "compensada",
  );
  const holdsPrivateIssInAnalysis =
    Boolean(issuedIssGuide) &&
    !isProcessPaymentGuideSharedExternally(process, issuedIssGuide!);
  const currentFolder = holdsPrivateIssInAnalysis
    ? "analise"
    : resolveDepartmentAccessBucket(
        process.processControl?.currentFolder || process.dispatches[0]?.to || "",
      );
  if (currentFolder) return currentFolder === userDepartment;

  if (userDepartment === "protocolos") {
    return process.triage.status !== "concluido" ||
      ["triagem", "pendencia_documental", "guia_emitida", "pagamento_pendente", "pagamento_confirmado"].includes(process.status);
  }
  if (userDepartment === "analise") {
    return ["distribuicao", "analise_tecnica", "exigencia", "reapresentacao", "despacho_intersetorial"].includes(process.status);
  }
  if (userDepartment === "financeiro") {
    return ["pagamento_pendente", "pagamento_confirmado"].includes(process.status);
  }
  return false;
}

/**
 * Compatibilidade de auditoria: identifica se o usuário foi o emissor da guia ISSQN.
 * O acesso geral de acompanhamento da Análise é tratado por canTrackProcess.
 */
export function canFollowUpIssuedIssGuide(session: SessionUser, process: ProcessRecord) {
  if (
    session.accountStatus === "blocked" ||
    session.accountStatus === "inactive" ||
    (session.role !== "analista" && session.role !== "prefeitura_supervisor") ||
    !canAccessMunicipalArea(session, "analise") ||
    !matchesOperationalScope(getOperationalScopeId(session), process)
  ) return false;

  const hasIssuedGuide = Boolean(
    process.payment.guides?.some((guide) =>
      guide.kind === "iss_obra" &&
      Boolean(guide.code?.trim()) &&
      Boolean(guide.issuedAt),
    ),
  );
  if (!hasIssuedGuide) return false;

  return process.auditTrail.some((audit) =>
    audit.actorProfileId === session.id &&
    audit.category === "financeiro" &&
    /guia.*(issqn|iss).*emitid/i.test(audit.title),
  );
}

export function processBelongsToExternalProfessional(
  session: Pick<SessionUser, "id" | "email">,
  process: Pick<
    ProcessRecord,
    | "createdBy"
    | "createdByProfileId"
    | "createdByUserId"
    | "createdByEmail"
    | "professionalProfileId"
    | "professionalUserId"
    | "professionalEmail"
  >,
) {
  const ids = [
    process.createdBy,
    process.createdByProfileId,
    process.createdByUserId,
    process.professionalProfileId,
    process.professionalUserId,
  ].filter(Boolean);

  if (session.id && ids.includes(session.id)) return true;

  const email = session.email?.trim().toLowerCase();
  if (!email) return false;

  return [process.createdByEmail, process.professionalEmail]
    .filter(Boolean)
    .some((value) => value?.trim().toLowerCase() === email);
}

export function isExternalProfessionalProcess(
  process: Pick<
    ProcessRecord,
    | "createdByRole"
    | "professionalProfileId"
    | "professionalUserId"
    | "professionalEmail"
  >,
) {
  const creatorRole = (process.createdByRole ?? "").trim().toLowerCase();
  return Boolean(
    process.professionalProfileId ||
    process.professionalUserId ||
    process.professionalEmail ||
    ["profissional_externo", "professional_external", "professional", "profissional"].includes(creatorRole),
  );
}

export function canTrackProcess(session: SessionUser, process: ProcessRecord, scopeId?: string | null) {
  if (session.role === "master_admin" || session.role === "master_ops" || session.role === "prefeitura_admin") {
    return true;
  }

  if (isExternalProfessionalRole(session.role)) {
    // O vínculo profissional-processo é permanente e não depende de fila,
    // departamento, status ou cache de escopo da interface.
    return processBelongsToExternalProfessional(session, process);
  }

  const activeScopeId = scopeId || getOperationalScopeId(session);
  if (!matchesOperationalScope(activeScopeId, process)) return false;
  if (session.role === "property_owner" || session.role === "proprietario_consulta") return true;
  if (!isInternalRole(session.role)) return false;

  // Leitura/acompanhamento municipal é transversal: todo servidor interno da
  // mesma Prefeitura pode abrir a ficha do processo. A responsabilidade
  // operacional continua restrita por canAccessProcess/getVisibleProcessesByScope,
  // portanto ampliar a consulta não mistura as filas dos departamentos.
  return true;
}

export function canAccessProcess(session: SessionUser, process: ProcessRecord, scopeId?: string | null) {
  if (session.role === "master_admin" || session.role === "master_ops") {
    return true;
  }

  if (isExternalProfessionalRole(session.role)) {
    // O vínculo profissional-processo é permanente e não depende de fila,
    // departamento, status ou cache de escopo da interface.
    return processBelongsToExternalProfessional(session, process);
  }

  const activeScopeId = scopeId || getOperationalScopeId(session);
  if (!matchesOperationalScope(activeScopeId, process)) {
    return false;
  }

  if (session.role === "property_owner" || session.role === "proprietario_consulta") {
    return true;
  }

  if (session.role === "prefeitura_admin") {
    return true;
  }

  if (!isInternalRole(session.role)) {
    return false;
  }

  // Todo funcionário municipal comum enxerga somente a fila do próprio departamento.
  const userDepartmentRaw = session.department || session.title || "";
  const userDepartment = resolveSessionOperationalArea(session);
  if (!userDepartment) return false;

  if (hasCompensatedIssReturnedToAnalysis(process)) {
    return userDepartment === "analise";
  }

  const issuedIssGuide = process.payment.guides?.find(
    (guide) => guide.kind === "iss_obra" && guide.status !== "compensada",
  );
  const holdsPrivateIssInAnalysis =
    Boolean(issuedIssGuide) &&
    !isProcessPaymentGuideSharedExternally(process, issuedIssGuide!);
  const currentFolderRaw = holdsPrivateIssInAnalysis
    ? URBAN_ANALYSIS_DEPARTMENT
    : process.processControl?.currentFolder || "";
  const currentFolder = resolveDepartmentAccessBucket(currentFolderRaw);
  if (currentFolder) {
    if (currentFolder === userDepartment) return true;
    const currentNormalized = normalizeDepartmentAccessLabel(currentFolderRaw);
    const userNormalized = normalizeDepartmentAccessLabel(userDepartmentRaw);
    return Boolean(
      currentNormalized &&
      userNormalized &&
      (currentNormalized.includes(userNormalized) || userNormalized.includes(currentNormalized))
    );
  }

  const latestTargetRaw = process.dispatches[0]?.to || "";
  const latestTarget = resolveDepartmentAccessBucket(latestTargetRaw);
  if (latestTarget) {
    if (latestTarget === userDepartment) return true;
    const targetNormalized = normalizeDepartmentAccessLabel(latestTargetRaw);
    const userNormalized = normalizeDepartmentAccessLabel(userDepartmentRaw);
    if (
      targetNormalized &&
      userNormalized &&
      (targetNormalized.includes(userNormalized) || userNormalized.includes(targetNormalized))
    ) {
      return true;
    }
  }

  // Compatibilidade para processos antigos que ainda não possuem currentFolder.
  if (userDepartment === "protocolos") {
    return process.triage.status !== "concluido" ||
      ["triagem", "pendencia_documental", "guia_emitida", "pagamento_pendente"].includes(process.status);
  }
  if (userDepartment === "analise") {
    return ["distribuicao", "analise_tecnica", "exigencia", "reapresentacao", "despacho_intersetorial"].includes(process.status);
  }

  return false;
}

export function isAnalysisSupervisor(
  session: Pick<SessionUser, "role" | "department" | "title">,
) {
  return (
    session.role === "prefeitura_supervisor" &&
    resolveSessionOperationalArea(session as SessionUser) === "analise"
  );
}

export function hasActiveAnalysisSupervisorIntervention(
  session: Pick<SessionUser, "id">,
  process: ProcessRecord,
) {
  const overrideProfileId = String(process.analysis?.supervisorOverrideProfileId || "").trim();
  const expiresAt = process.analysis?.supervisorOverrideExpiresAt
    ? Date.parse(process.analysis.supervisorOverrideExpiresAt)
    : Number.NaN;

  return Boolean(
    overrideProfileId &&
    overrideProfileId === session.id &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now(),
  );
}

export function canSuperviseProcessAnalysis(
  session: SessionUser,
  process: ProcessRecord,
) {
  if (session.accountStatus === "blocked" || session.accountStatus === "inactive") return false;
  if (session.role === "master_admin" || session.role === "master_ops") return true;
  if (!isAnalysisSupervisor(session)) return false;

  const sessionScopeId = getOperationalScopeId(session);
  return Boolean(
    sessionScopeId &&
    matchesOperationalScope(sessionScopeId, process),
  );
}

export function canEditProcessAnalysis(
  session: SessionUser,
  process: ProcessRecord,
  scopeId?: string | null,
) {
  if (session.accountStatus === "blocked" || session.accountStatus === "inactive") {
    return false;
  }

  if (session.role === "prefeitura_admin") return false;
  if (session.role === "master_admin" || session.role === "master_ops") return true;

  const sessionScopeId = getOperationalScopeId(session);
  if (!sessionScopeId || !matchesOperationalScope(sessionScopeId, process)) {
    return false;
  }

  const worksInAnalysis =
    canAccessMunicipalArea(session, "analise") &&
    isProcessOwnedBySessionDepartment(session, process);

  // A Análise Urbanística é uma mesa técnica compartilhada. A atribuição de
  // responsável organiza carga/SLA e auditoria, mas nunca bloqueia outro
  // analista da mesma unidade de revisar projeto, Habite-se, anotar documentos,
  // aprovar/rejeitar arquivos ou emitir exigências.
  if (session.role === "analista") {
    return worksInAnalysis;
  }

  if (session.role === "prefeitura_supervisor") {
    return canSuperviseProcessAnalysis(session, process) && worksInAnalysis;
  }

  return false;
}

export function canAnalyzeProcessDocument(
  session: SessionUser,
  process: ProcessRecord,
  scopeId?: string | null,
) {
  return canEditProcessAnalysis(session, process, scopeId);
}

export function getVisibleProcesses(session: SessionUser, records: ProcessRecord[] = processRecords) {
  return records.filter((process) => canAccessProcess(session, process));
}

export function getVisibleProcessesByScope(
  session: SessionUser,
  scopeId: string | null | undefined,
  records: ProcessRecord[] = processRecords,
) {
  return records.filter((process) => canAccessProcess(session, process, scopeId));
}

export function getProcessById(processId: string, records: ProcessRecord[] = processRecords) {
  return records.find((process) => process.id === processId);
}
export function normalizeOwnerDocument(value: string) {
  return (value || "").replace(/\D/g, "");
}

export function matchesOwnerDocument(input: string, stored: string) {
  const normalizedInput = normalizeOwnerDocument(input);
  const normalizedStored = normalizeOwnerDocument(stored);
  if (!normalizedInput || !normalizedStored) return false;
  return normalizedInput === normalizedStored;
}

export function getOwnerLinksForOwner(ownerId: string, links: OwnerProjectLink[] = ownerLinks) {
  return links.filter((item) => item.ownerUserId === ownerId);
}

export function getOwnerLinksForProfessional(professionalUserId: string, links: OwnerProjectLink[] = ownerLinks) {
  return links.filter((item) => item.professionalUserId === professionalUserId);
}

export function getOwnerRequestsForOwner(ownerId: string, requests: OwnerProjectRequest[] = ownerRequests) {
  return requests.filter((item) => item.ownerUserId === ownerId);
}

export function getOwnerRequestsForProfessional(professionalUserId: string, requests: OwnerProjectRequest[] = ownerRequests) {
  return requests.filter((item) => item.professionalUserId === professionalUserId);
}

export function getOwnerMessagesForLink(
  link: OwnerProjectLink,
  messages: OwnerProfessionalMessage[] = ownerMessages,
) {
  return messages.filter(
    (item) =>
      item.projectId === link.projectId &&
      item.ownerUserId === link.ownerUserId &&
      item.professionalUserId === link.professionalUserId,
  );
}

export function getMasterMetrics(records: ProcessRecord[] = processRecords, items: Tenant[] = tenants) {
  return {
    tenants: items.length,
    activeTenants: items.filter((tenant) => tenant.status === "ativo").length,
    inactiveTenants: items.filter((tenant) => tenant.status === "suspenso").length,
    users: items.reduce((total, tenant) => total + tenant.users, 0),
    totalUsers: items.reduce((total, tenant) => total + tenant.users, 0),
    processes: records.length,
    totalProcesses: records.length,
    revenue: items.reduce((total, tenant) => total + tenant.revenue, 0),
    modulesEnabled: items.reduce((total, tenant) => total + tenant.activeModules.length, 0),
  };
}

export const getInstitutionMetrics = getMasterMetrics;

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function statusTone(status: ProcessStatus) {
  switch (status) {
    case "deferido":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "indeferido":
      return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "distribuicao":
    case "analise_tecnica":
    case "despacho_intersetorial":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "pagamento_pendente":
    case "guia_emitida":
    case "pendencia_documental":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}

export function statusLabel(status: ProcessStatus) {
  const labels: Partial<Record<ProcessStatus, string>> = {
    distribuicao: "Aguardando distribuição",
    analise_tecnica: "Análise Urbanística",
    despacho_intersetorial: "Despacho intersetorial",
    pagamento_pendente: "Pagamento pendente",
    pagamento_confirmado: "Pagamento confirmado",
    pendencia_documental: "Pendência documental",
    guia_emitida: "Guia emitida",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

export function generateProtocol(records: ProcessRecord[]) {
  return `SIG-${new Date().getFullYear()}-${String(records.length + 1).padStart(4, "0")}`;
}

export function getUserProfile(userId: string, profiles: UserProfile[] = userProfiles) {
  return profiles.find((profile) => profile.userId === userId);
}

export function slugifyTenantName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const slugifyInstitutionName = slugifyTenantName;

export function extractTenantSlug(input?: string | null) {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    if (firstPath) return firstPath.toLowerCase();
    const hostPart = url.hostname.split(".")[0];
    return hostPart.toLowerCase();
  } catch {
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
    const pathParts = withoutProtocol.split("/").filter(Boolean);
    if (pathParts.length > 1) return pathParts[1].toLowerCase();
    const first = pathParts[0] ?? "";
    if (first.includes(".")) return first.split(".")[0].toLowerCase();
    return first.toLowerCase();
  }
}

export const extractInstitutionSlug = extractTenantSlug;

export function getTenantClientSlug(tenant: Tenant, settings?: TenantSettings) {
  return (
    extractTenantSlug(settings?.clientDeliveryLink) ||
    extractTenantSlug(settings?.linkPortalCliente) ||
    extractTenantSlug(tenant.subdomain) ||
    slugifyTenantName(tenant.city || tenant.name)
  );
}

export function buildTenantClientLink(_origin: string, tenant: Tenant, settings?: TenantSettings) {
  const slug = getTenantClientSlug(tenant, settings);
  const customDomain = settings?.site || "";
  return buildMunicipalityPortalUrl({
    subdomain: slug || tenant.subdomain,
    customDomain,
  });
}

export const getInstitutionClientSlug = getTenantClientSlug;
export const buildInstitutionClientLink = buildTenantClientLink;
export const institutions = tenants;
export const institutionSettings = tenantSettings;

export function isInstitutionPubliclyAvailable(institution: Institution | Tenant) {
  if (institution.status !== "ativo") return false;

  const publicIdentity = `${institution.name ?? ""} ${institution.city ?? ""} ${institution.subdomain ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // O tenant técnico da plataforma nunca é destino de autocadastro.
  // Contas públicas pertencem sempre à Prefeitura escolhida/resolvida pelo subdomínio.
  return !publicIdentity.includes("sigapro plataforma") && !publicIdentity.includes("sigapro-plataforma");
}

export function getChecklistTemplate(processType: string, tenantId?: string | null, institutionId?: string | null) {
  const normalizedType = processType.trim().toLowerCase();
  const activeScopeId = institutionId || tenantId || null;
  return (
    checklistTemplates.find((item) => item.processType.trim().toLowerCase() === normalizedType && item.tenantId === activeScopeId) ||
    checklistTemplates.find((item) => item.processType.trim().toLowerCase() === normalizedType && item.tenantId === null)
  );
}

export function buildProcessDocuments(
  processType: string,
  uploadedDocuments: ProcessDocument[],
  tenantId?: string | null,
  institutionId?: string | null,
) {
  const template = getChecklistTemplate(processType, tenantId, institutionId);
  const normalizeLabel = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const uploadedByLabel = new Map(uploadedDocuments.map((document) => [normalizeLabel(document.label), document]));

  const fromTemplate = (template?.items ?? []).map((item) => {
    const existing = uploadedByLabel.get(normalizeLabel(item.label));
    return (
      existing ?? {
        id: `pending-${item.id}`,
        label: item.label,
        required: item.required,
        uploaded: false,
        signed: false,
        reviewStatus: "pendente" as const,
        annotations: [],
        version: 0,
        source: "profissional" as const,
      }
    );
  });

  const extras = uploadedDocuments.filter(
    (document) => !fromTemplate.some((item) => normalizeLabel(item.label) === normalizeLabel(document.label)),
  );

  return [...fromTemplate, ...extras];
}











