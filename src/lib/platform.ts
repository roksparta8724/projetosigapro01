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
  | "proprietario_consulta";

export type AccountStatus = "active" | "blocked" | "inactive";

export type Permission =
  | "view_master_dashboard"
  | "manage_tenants"
  | "manage_modules"
  | "view_platform_metrics"
  | "manage_tenant_users"
  | "manage_tenant_branding"
  | "manage_own_profile"
  | "review_processes"
  | "dispatch_interdepartmental"
  | "manage_financial"
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
  tenantId: string | null;
  municipalityId?: string | null;
  title: string;
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
  avatarScale?: number;
  avatarOffsetX?: number;
  avatarOffsetY?: number;
  useAvatarInHeader?: boolean;
  bio: string;
}

export interface RegistrationRequest {
  id: string;
  tenantId: string;
  municipalityId?: string | null;
  fullName: string;
  email: string;
  role: UserRole;
  title: string;
  phone: string;
  cpfCnpj: string;
  professionalType: string;
  registrationNumber: string;
  companyName: string;
  avatarUrl: string;
  bio: string;
  status: "pendente" | "aprovado" | "rejeitado";
  createdAt: string;
}
export type InstitutionRegistrationRequest = RegistrationRequest & { institutionId?: string | null };

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

export interface ThemePreset {
  id: string;
  label: string;
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
  rate: number;
}

export interface TenantSettings {
  tenantId: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  site: string;
  secretariaResponsavel: string;
  diretoriaResponsavel: string;
  diretoriaTelefone: string;
  diretoriaEmail: string;
  horarioAtendimento: string;
  brasaoUrl: string;
  bandeiraUrl: string;
  logoUrl: string;
  imagemHeroUrl: string;
  resumoPlanoDiretor: string;
  resumoUsoSolo: string;
  leisComplementares: string;
  linkPortalCliente: string;
  protocoloPrefixo: string;
  guiaPrefixo: string;
  chavePix: string;
  beneficiarioArrecadacao: string;
  taxaProtocolo: number;
  taxaIssPorMetroQuadrado: number;
  issRateProfiles?: MunicipalIssRateProfile[];
  taxaAprovacaoFinal: number;
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
  planoDiretorArquivoNome: string;
  planoDiretorArquivoUrl: string;
  usoSoloArquivoNome: string;
  usoSoloArquivoUrl: string;
  leisArquivoNome: string;
  leisArquivoUrl: string;
}

export type InstitutionSettings = TenantSettings;
export type InstitutionScopedSettings = InstitutionSettings & { institutionId?: string };

export type PaymentGuideKind = "protocolo" | "iss_obra" | "aprovacao_final";

export interface PaymentGuideEntry {
  kind: PaymentGuideKind;
  label: string;
  code: string;
  amount: number;
  status: "pendente" | "compensada";
  dueDate: string;
  issuedAt?: string;
  expiresAt?: string;
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
    x: number;
    y: number;
    note: string;
    author: string;
    createdAt: string;
  }>;
  version: number;
  source: "profissional" | "prefeitura" | "integracao";
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  sizeLabel?: string;
  previewUrl?: string;
}

export interface ChecklistTemplate {
  id: string;
  tenantId: string | null;
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
  visibleToExternal: boolean;
  at: string;
}

export interface FormalRequirement {
  id: string;
  title: string;
  description: string;
  status: "aberta" | "respondida" | "atendida" | "cancelada";
  createdAt: string;
  dueDate: string;
  createdBy: string;
  targetName: string;
  response?: string;
  respondedAt?: string;
  responseBy?: string;
  visibility: "interno" | "externo" | "misto";
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
  status: "aguardando" | "respondido" | "concluido" | "devolvido" | "sobrestado";
  visibility?: "interno" | "externo" | "misto";
  priority?: "baixa" | "media" | "alta" | "critica";
  assignedTo?: string;
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
  title: string;
  type: string;
  status: ProcessStatus;
  ownerName: string;
  ownerDocument: string;
  technicalLead: string;
  createdBy: string;
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
    constructionStandard?: string;
  };
  triage: {
    status: "recebido" | "em_triagem" | "concluido";
    assignedTo?: string;
    notes?: string;
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
  technicalLead: string;
  tags: string[];
  notes: string;
  property: {
    registration: string;
    iptu: string;
    lot: string;
    block: string;
    area: number;
    usage: string;
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
      return "Guia de Recolhimento de ISSQN da Obra";
    case "aprovacao_final":
      return "Guia Final de Aprovação / Habite-se";
  }
}

export function getGuideReference(kind: PaymentGuideKind) {
  switch (kind) {
    case "protocolo":
      return "Taxa de protocolo administrativo";
    case "iss_obra":
      return "ISSQN incidente sobre a metragem da construção";
    case "aprovacao_final":
      return "Taxa final de aprovação e emissão de habite-se";
  }
}

export function getGuideObservation(kind: PaymentGuideKind) {
  switch (kind) {
    case "protocolo":
      return "Documento de arrecadação municipal vinculado à abertura do protocolo administrativo.";
    case "iss_obra":
      return "Documento de arrecadação municipal destinado ao recolhimento do ISSQN calculado pela metragem da construção.";
    case "aprovacao_final":
      return "Documento de arrecadação municipal vinculado à etapa final de aprovação e emissão do habite-se.";
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

export const defaultApprovalRateProfiles: MunicipalApprovalRateProfile[] = [
  { id: "residencial-luxo", label: "Residencial • Luxo", usage: "Residencial", standard: "luxo", rate: 547.2 },
  { id: "residencial-primeira", label: "Residencial • Primeira", usage: "Residencial", standard: "primeira", rate: 444.6 },
  { id: "residencial-medio", label: "Residencial • Médio", usage: "Residencial", standard: "medio", rate: 342 },
  { id: "residencial-economico", label: "Residencial • Econômico", usage: "Residencial", standard: "economico", rate: 239.4 },
  { id: "apartamento-luxo", label: "Apartamento • Luxo", usage: "Apartamento", standard: "luxo", rate: 444.6 },
  { id: "apartamento-primeira", label: "Apartamento • Primeira", usage: "Apartamento", standard: "primeira", rate: 376.2 },
  { id: "apartamento-medio", label: "Apartamento • Médio", usage: "Apartamento", standard: "medio", rate: 307.8 },
  { id: "escritorio-luxo", label: "Escritório • Luxo", usage: "Escritório", standard: "luxo", rate: 410.4 },
  { id: "escritorio-primeira", label: "Escritório • Primeira", usage: "Escritório", standard: "primeira", rate: 342 },
  { id: "escritorio-medio", label: "Escritório • Médio", usage: "Escritório", standard: "medio", rate: 307.8 },
  { id: "comercial-luxo", label: "Comercial • Luxo", usage: "Comercial", standard: "luxo", rate: 342 },
  { id: "comercial-primeira", label: "Comercial • Primeira", usage: "Comercial", standard: "primeira", rate: 307.8 },
  { id: "comercial-medio", label: "Comercial • Médio", usage: "Comercial", standard: "medio", rate: 307.8 },
  { id: "comercial-economico", label: "Comercial • Econômico", usage: "Comercial", standard: "economico", rate: 273.6 },
  { id: "industrial-luxo", label: "Industrial • Luxo", usage: "Industrial", standard: "luxo", rate: 342 },
  { id: "industrial-primeira", label: "Industrial • Primeira", usage: "Industrial", standard: "primeira", rate: 307.8 },
  { id: "industrial-medio", label: "Industrial • Médio", usage: "Industrial", standard: "medio", rate: 273.6 },
  { id: "industrial-economico", label: "Industrial • Econômico", usage: "Industrial", standard: "economico", rate: 239.4 },
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
  const profiles =
    settings?.issRateProfiles && settings.issRateProfiles.length > 0
      ? settings.issRateProfiles
      : defaultIssRateProfiles;

  const normalizedUsage = normalizeUsageLabel(usage);
  const matched =
    profiles.find((profile) =>
      [profile.label, ...(profile.aliases ?? [])]
        .map((item) => normalizeUsageLabel(item))
        .some((item) => item.length > 0 && normalizedUsage.includes(item)),
    ) ?? profiles[0];

  return matched;
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
  const profiles =
    settings?.approvalRateProfiles && settings.approvalRateProfiles.length > 0
      ? settings.approvalRateProfiles
      : defaultApprovalRateProfiles;

  const normalizedUsage = normalizeUsageLabel(usage);
  const normalizedStandard = normalizeUsageLabel(standard || "medio");

  return (
    profiles.find(
      (profile) =>
        normalizeUsageLabel(profile.usage) === normalizedUsage &&
        normalizeUsageLabel(profile.standard) === normalizedStandard,
    ) ??
    profiles.find((profile) => normalizeUsageLabel(profile.usage) === normalizedUsage) ??
    null
  );
}

export function calculateApprovalGuideAmount(
  area: number,
  usage: string | null | undefined,
  standard: string | null | undefined,
  settings?: TenantSettings | null,
) {
  const profile = resolveApprovalRateProfile(usage, standard, settings);
  const fallbackFixed = settings?.taxaAprovacaoFinal ?? 0;
  if (!profile) return Number(fallbackFixed.toFixed(2));
  return Number(((area || 0) * profile.rate).toFixed(2));
}


export function getProcessPaymentGuides(process: ProcessRecord, settings?: TenantSettings | null): PaymentGuideEntry[] {
  if (process.payment.guides && process.payment.guides.length > 0) {
    return process.payment.guides;
  }

  const protocolo = process.payment.amount || settings?.taxaProtocolo || 35.24;
  const issAmount = calculateIssGuideAmount(process.property.area, process.property.usage, settings);
  const aprovacao = calculateApprovalGuideAmount(
    process.property.area,
    process.property.usage,
    process.property.constructionStandard,
    settings,
  );
  const prefix = process.payment.guideNumber.split("-").slice(0, 2).join("-") || settings?.guiaPrefixo || "DAM";
  const issueAt = process.payment.issuedAt;
  const expiresAt = process.payment.expiresAt;
  const dueDate = process.payment.dueDate;

  return [
    {
      kind: "protocolo",
      label: getGuideLabel("protocolo"),
      code: process.payment.guideNumber,
      amount: protocolo,
      status: process.payment.status,
      dueDate,
      issuedAt: issueAt,
      expiresAt,
    },
    {
      kind: "iss_obra",
      label: getGuideLabel("iss_obra"),
      code: `${prefix}-ISS-${process.protocol.split("-").pop()}`,
      amount: issAmount,
      status: "pendente",
      dueDate,
      issuedAt: issueAt,
      expiresAt,
    },
    {
      kind: "aprovacao_final",
      label: getGuideLabel("aprovacao_final"),
      code: `${prefix}-APR-${process.protocol.split("-").pop()}`,
      amount: aprovacao,
      status: "pendente",
      dueDate,
      issuedAt: issueAt,
      expiresAt,
    },
  ];
}

export function serializeMarker(label: string, color: string) {
  return `${label}::${color}`;
}

export function parseMarker(tag: string) {
  const [label, color] = tag.includes("::") ? tag.split("::") : [tag, "#1d4ed8"];
  return { label, color };
}

export const roleLabels: Record<UserRole, string> = {
  master_admin: "Administrador Geral",
  master_ops: "Operação Geral",
  prefeitura_admin: "Administrador da Prefeitura",
  prefeitura_supervisor: "Supervisor da Prefeitura",
  analista: "Analista",
  financeiro: "Financeiro",
  setor_intersetorial: "Setor Intersetorial",
  fiscal: "Fiscalização e Postura",
  profissional_externo: "Profissional Externo",
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
  prefeitura_supervisor: "Supervisor da Prefeitura",
  analista: "Analista Técnico",
  financeiro: "Financeiro Municipal",
  setor_intersetorial: "Setor Intersetorial",
  fiscal: "Fiscalização e Postura",
  profissional_externo: "Profissional Externo",
  proprietario_consulta: "Proprietário do Imóvel",
};

const rolePermissions: Record<UserRole, Permission[]> = {
  master_admin: ["view_master_dashboard", "manage_tenants", "manage_modules", "view_platform_metrics", "manage_own_profile"],
  master_ops: ["view_master_dashboard", "manage_tenants", "view_platform_metrics", "manage_own_profile"],
  prefeitura_admin: [
    "manage_tenant_users",
    "manage_tenant_branding",
    "manage_own_profile",
    "review_processes",
    "dispatch_interdepartmental",
    "manage_financial",
    "sign_documents",
  ],
  prefeitura_supervisor: ["review_processes", "dispatch_interdepartmental", "sign_documents", "manage_own_profile", "view_own_processes"],
  analista: ["review_processes", "dispatch_interdepartmental", "sign_documents", "manage_own_profile", "view_own_processes"],
  financeiro: ["manage_financial", "sign_documents", "manage_own_profile", "view_own_processes"],
  setor_intersetorial: ["dispatch_interdepartmental", "sign_documents", "manage_own_profile", "view_own_processes"],
  fiscal: ["review_processes", "manage_own_profile", "view_own_processes"],
  profissional_externo: ["submit_processes", "view_own_processes", "sign_documents", "manage_own_profile"],
  proprietario_consulta: ["view_own_processes", "manage_own_profile"],
};

export const sessionUsers: SessionUser[] = [
  {
    id: "u-master",
    name: "Rafael Monteiro",
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
    id: "u-admin-jd",
    name: "Camila Andrade",
    role: "prefeitura_admin",
    accessLevel: 3,
    tenantId: "tenant-jardim",
    title: "Administrador da Prefeitura",
    email: "camila@jardimdaserra.sp.gov.br",
    accountStatus: "active",
    userType: "Administrador",
    department: "Administracao Municipal",
  },
  {
    id: "u-analyst-jd",
    name: "Marcelo Teixeira",
    role: "analista",
    accessLevel: 2,
    tenantId: "tenant-jardim",
    title: "Analista urbanístico",
    email: "marcelo@jardimdaserra.sp.gov.br",
    accountStatus: "active",
    userType: "Interno",
    department: "Analise",
  },
  {
    id: "u-fin-jd",
    name: "Fernanda Souza",
    role: "financeiro",
    accessLevel: 2,
    tenantId: "tenant-jardim",
    title: "Financeiro Municipal",
    email: "fernanda@jardimdaserra.sp.gov.br",
    accountStatus: "active",
    userType: "Interno",
    department: "Financeiro",
  },
  {
    id: "u-fiscal-jd",
    name: "Luciana Prado",
    role: "fiscal",
    accessLevel: 2,
    tenantId: "tenant-jardim",
    title: "Fiscalizacao e Postura",
    email: "luciana@jardimdaserra.sp.gov.br",
    accountStatus: "active",
    userType: "Interno",
    department: "Fiscalizacao",
  },
  {
    id: "u-ext-1",
    name: "Patricia Moraes",
    role: "profissional_externo",
    accessLevel: 1,
    tenantId: "tenant-jardim",
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
    tenantId: "tenant-jardim",
    title: "Profissional Externo",
    email: "arturerfarm2@gmail.com",
    accountStatus: "active",
    userType: "Profissional externo",
    department: "Acesso Externo",
  },
  {
    id: "u-owner-1",
    name: "Sergio Matos",
    role: "proprietario_consulta",
    accessLevel: 1,
    tenantId: "tenant-jardim",
    title: "Proprietario do Imovel",
    email: "sergio@dominio.com",
    accountStatus: "active",
    userType: "Usuário externo",
    department: "Consulta",
  },
];

export const userProfiles: UserProfile[] = [
  {
    userId: "u-master",
    fullName: "Rafael Monteiro",
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
    userId: "u-admin-jd",
    fullName: "Camila Andrade",
    email: "camila@jardimdaserra.sp.gov.br",
    phone: "(11) 4000-1234",
    cpfCnpj: "111.222.333-44",
    rg: "",
    birthDate: "",
    professionalType: "Gestora Publica",
    registrationNumber: "",
    companyName: "Prefeitura de Jardim da Serra",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Jardim da Serra",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Administracao da Secretaria de Planejamento.",
  },
  {
    userId: "u-analyst-jd",
    fullName: "Marcelo Teixeira",
    email: "marcelo@jardimdaserra.sp.gov.br",
    phone: "(11) 4000-2222",
    cpfCnpj: "222.333.444-55",
    rg: "",
    birthDate: "",
    professionalType: "Engenheiro Civil",
    registrationNumber: "CREA 123456-SP",
    companyName: "Prefeitura de Jardim da Serra",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Jardim da Serra",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Analista responsável por aprovação urbanística.",
  },
  {
    userId: "u-fin-jd",
    fullName: "Fernanda Souza",
    email: "fernanda@jardimdaserra.sp.gov.br",
    phone: "(11) 4000-3333",
    cpfCnpj: "333.444.555-66",
    rg: "",
    birthDate: "",
    professionalType: "Gestora Financeira",
    registrationNumber: "",
    companyName: "Prefeitura de Jardim da Serra",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Jardim da Serra",
    state: "SP",
    zipCode: "",
    avatarUrl: "",
    bio: "Gestão de guias e arrecadação.",
  },
  {
    userId: "u-fiscal-jd",
    fullName: "Luciana Prado",
    email: "luciana@jardimdaserra.sp.gov.br",
    phone: "(11) 4000-4444",
    cpfCnpj: "444.555.666-00",
    rg: "",
    birthDate: "",
    professionalType: "Fiscal Municipal",
    registrationNumber: "",
    companyName: "Prefeitura de Jardim da Serra",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "Jardim da Serra",
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
    city: "Jardim da Serra",
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

export const registrationRequests: RegistrationRequest[] = [];

export const tenants: Tenant[] = [
  {
    id: "tenant-jardim",
    name: "Prefeitura de Jardim da Serra",
    city: "Jardim da Serra",
    state: "SP",
    status: "ativo",
    plan: "Plano institucional",
    activeModules: ["Protocolo", "Análise", "Financeiro", "Assinatura", "Despacho", "Configurações"],
    users: 6,
    processes: 2,
    revenue: 148200,
    subdomain: "jardimdaserra.sigapro.com.br",
    theme: { primary: "#0f3557", accent: "#178f78" },
  },
  {
    id: "tenant-ribeira",
    name: "Prefeitura de Ribeira Nova",
    city: "Ribeira Nova",
    state: "SP",
    status: "implantacao",
    plan: "Plano institucional",
    activeModules: ["Protocolo", "Analise", "Acesso externo"],
    users: 0,
    processes: 1,
    revenue: 38600,
    subdomain: "ribeiranova.sigapro.com.br",
    theme: { primary: "#203f6b", accent: "#c58d2a" },
  },
];

export const tenantSettings: TenantSettings[] = [
  {
    tenantId: "tenant-jardim",
    cnpj: "12.345.678/0001-90",
    endereco: "Av. Central, 100 - Centro - Jardim da Serra/SP",
    telefone: "(11) 4000-1000",
    email: "planejamento@jardimdaserra.sp.gov.br",
    site: "https://jardimdaserra.sp.gov.br",
    secretariaResponsavel: "Secretaria de Planejamento e Obras",
    diretoriaResponsavel: "Diretoria de Aprovação de Projetos",
    diretoriaTelefone: "(11) 4000-1010",
    diretoriaEmail: "diretoria.aprovacao@jardimdaserra.sp.gov.br",
    horarioAtendimento: "Segunda a sexta, das 8h as 17h",
    brasaoUrl: "",
    bandeiraUrl: "",
    logoUrl: "",
    imagemHeroUrl: "",
    resumoPlanoDiretor: "Plano diretor com foco em adensamento controlado, sustentabilidade e qualificacao dos eixos urbanos.",
    resumoUsoSolo: "Uso e ocupacao do solo com parametros para zona mista, residencial, comercial e de protecao ambiental.",
    leisComplementares: "Lei complementar 120/2024, codigo de obras municipal e normas de acessibilidade.",
    linkPortalCliente: "https://sigapro.com.br/jardimdaserra",
    protocoloPrefixo: "PMJS",
    guiaPrefixo: "DAM-JS",
    chavePix: "pix@jardimdaserra.sp.gov.br",
    beneficiarioArrecadacao: "Prefeitura de Jardim da Serra",
    taxaProtocolo: 35.24,
    taxaIssPorMetroQuadrado: 12.5,
    taxaAprovacaoFinal: 180,
    registroProfissionalObrigatorio: true,
    contractNumber: "CT-2026-001",
    contractStart: "2026-03-01",
    contractEnd: "2027-02-28",
    monthlyFee: 1290,
    setupFee: 3500,
    signatureMode: "eletronica",
    clientDeliveryLink: "https://jardimdaserra.sigapro.com.br",
    logoScale: 1,
    logoOffsetX: 0,
    logoOffsetY: 0,
    headerLogoScale: 1,
    headerLogoOffsetX: 0,
    headerLogoOffsetY: 0,
    footerLogoScale: 1,
    footerLogoOffsetX: 0,
    footerLogoOffsetY: 0,
    logoAlt: "Logo institucional da Prefeitura de Jardim da Serra",
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
    leisArquivoNome: "",
    leisArquivoUrl: "",
  },
  {
    tenantId: "tenant-ribeira",
    cnpj: "98.765.432/0001-10",
    endereco: "Rua das Flores, 80 - Centro - Ribeira Nova/SP",
    telefone: "(11) 4000-2000",
    email: "urbanismo@ribeiranova.sp.gov.br",
    site: "https://ribeiranova.sp.gov.br",
    secretariaResponsavel: "Secretaria de Urbanismo",
    diretoriaResponsavel: "Diretoria de Controle Urbano",
    diretoriaTelefone: "(11) 4000-2015",
    diretoriaEmail: "diretoria.urbana@ribeiranova.sp.gov.br",
    horarioAtendimento: "Segunda a sexta, das 9h as 16h",
    brasaoUrl: "",
    bandeiraUrl: "",
    logoUrl: "",
    imagemHeroUrl: "",
    resumoPlanoDiretor: "Diretrizes iniciais em implantação.",
    resumoUsoSolo: "Parametros urbanisticos em configuracao.",
    leisComplementares: "Normas municipais em consolidacao.",
    linkPortalCliente: "https://sigapro.com.br/ribeiranova",
    protocoloPrefixo: "PMRN",
    guiaPrefixo: "DAM-RN",
    chavePix: "pix@ribeiranova.sp.gov.br",
    beneficiarioArrecadacao: "Prefeitura de Ribeira Nova",
    taxaProtocolo: 35.24,
    taxaIssPorMetroQuadrado: 10,
    taxaAprovacaoFinal: 150,
    registroProfissionalObrigatorio: true,
    contractNumber: "CT-2026-002",
    contractStart: "2026-03-10",
    contractEnd: "2027-03-09",
    monthlyFee: 980,
    setupFee: 2500,
    signatureMode: "manual",
    clientDeliveryLink: "https://ribeiranova.sigapro.com.br",
    logoScale: 1,
    logoOffsetX: 0,
    logoOffsetY: 0,
    headerLogoScale: 1,
    headerLogoOffsetX: 0,
    headerLogoOffsetY: 0,
    footerLogoScale: 1,
    footerLogoOffsetX: 0,
    footerLogoOffsetY: 0,
    logoAlt: "Logo institucional da Prefeitura de Ribeira Nova",
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

export const planCatalog = [
  { name: "Institucional", enabled: false, seats: "Usuários conforme contrato", description: "Plano-base do sistema para entrega a prefeituras." },
  { name: "Expansao", enabled: false, seats: "Multi secretaria", description: "Fluxos completos com modulos adicionais e integracoes." },
  { name: "Premium", enabled: false, seats: "Ilimitado", description: "Operação completa com personalização institucional ampliada." },
];

export const themePresets: ThemePreset[] = [
  { id: "azul-institucional", label: "Azul institucional", primary: "#16324a", accent: "#5bc0be" },
  { id: "verde-institucional", label: "Verde institucional", primary: "#184e43", accent: "#88c98c" },
  { id: "rosa-institucional", label: "Rosa institucional", primary: "#7a284f", accent: "#f0b6ca" },
  { id: "preto-verde", label: "Preto e verde", primary: "#1f6b3a", accent: "#9fe3b5", background: "#050705" },
  { id: "preto-turquesa", label: "Preto e azul-turquesa", primary: "#0f6a78", accent: "#6fe6e8", background: "#040607" },
  { id: "menu-invertido-turquesa", label: "Menu invertido turquesa", primary: "#0f2a33", accent: "#57d8df", background: "#f8fbfc", inverseMain: true },
  { id: "menu-invertido-verde", label: "Menu invertido verde", primary: "#11281d", accent: "#6fd3a2", background: "#f7fbf8", inverseMain: true },
  { id: "menu-invertido-vinho", label: "Menu invertido vinho", primary: "#2a1520", accent: "#d6a5b4", background: "#fcf8fa", inverseMain: true },
  { id: "menu-invertido-grafite", label: "Menu invertido grafite", primary: "#1b2230", accent: "#a8b5c7", background: "#f8fafc", inverseMain: true },
  { id: "grafite", label: "Grafite", primary: "#232b38", accent: "#d7b56d" },
  { id: "ardosia", label: "Cinza ardosia", primary: "#334155", accent: "#94a3b8" },
  { id: "petroleo", label: "Azul petroleo", primary: "#123a58", accent: "#65c7d0" },
  { id: "esmeralda", label: "Esmeralda", primary: "#155e52", accent: "#7dd3a7" },
  { id: "ambar", label: "Ambar suave", primary: "#6b4f1d", accent: "#e8c27a" },
  { id: "vinho", label: "Vinho sobrio", primary: "#5a2230", accent: "#d8a6ab" },
  { id: "indigo", label: "Indigo", primary: "#3730a3", accent: "#a5b4fc" },
  { id: "areia", label: "Areia clara", primary: "#6b6255", accent: "#d8ccb8" },
  { id: "oceano", label: "Oceano", primary: "#0d5f73", accent: "#8ee3ef" },
];

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
  "Certificado de Conclusao de Obra",
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
      { id: "hab-3", label: "IPTU", required: true },
      { id: "hab-4", label: "Projeto aprovado", required: true },
      { id: "hab-5", label: "Termo de conclusao da obra", required: true },
      { id: "hab-6", label: "ART ou RRT", required: true },
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
    tenantId: "tenant-jardim",
    protocol: "SIG-2026-0001",
    externalProtocol: "PMJS-2026-23109",
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
      guideNumber: "DAM-JS-2026-9914",
      amount: 35.24,
      status: "pendente",
      dueDate: "20/03/2026",
      issuedAt: "2026-03-18T09:14:00-03:00",
      expiresAt: "2026-03-18T10:14:00-03:00",
    },
  },
  {
    id: "proc-002",
    tenantId: "tenant-ribeira",
    protocol: "SIG-2026-0002",
    externalProtocol: "PMRN-2026-4501",
    title: "Condominio Bosque do Sol",
    type: "Projeto multifamiliar",
    status: "triagem",
    ownerName: "Aline Nogueira",
    ownerDocument: "***.877.115-**",
    technicalLead: "Estudio Vertice",
    createdBy: "u-ext-rn",
    tags: ["implantacao", "piloto"],
    address: "Estrada da Serra, 2400 - Vale Verde",
    notes: "Prefeitura em implantação com parâmetros urbanísticos iniciais.",
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
    timeline: [{ id: "t31", title: "Triagem inicial", detail: "Tenant em implantação utilizando checklist piloto.", actor: "Sistema", at: "17/03/2026 16:10" }],
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
      guideNumber: "DAM-RN-2026-8501",
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
  if (!rolePermissions[session.role].includes(permission)) {
    return false;
  }

  if (permission === "manage_tenant_users" || permission === "manage_tenant_branding") {
    return session.accessLevel >= 3;
  }

  if (permission === "dispatch_interdepartmental" || permission === "sign_documents") {
    return session.accessLevel >= 2;
  }

  return true;
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

export function isInternalRole(role: UserRole) {
  return role !== "master_admin" && role !== "master_ops" && role !== "profissional_externo" && role !== "proprietario_consulta";
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

export function canAccessProcess(session: SessionUser, process: ProcessRecord, scopeId?: string | null) {
  if (session.role === "master_admin" || session.role === "master_ops") {
    return false;
  }

  const activeScopeId = scopeId || getOperationalScopeId(session);
  if (!matchesOperationalScope(activeScopeId, process)) {
    return false;
  }

  if (session.role === "profissional_externo") {
    return process.createdBy === session.id;
  }

  if (session.role === "proprietario_consulta") {
    return process.ownerName === session.name;
  }

  return isInternalRole(session.role);
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
  return status.replaceAll("_", " ");
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

export function buildTenantClientLink(origin: string, tenant: Tenant, settings?: TenantSettings) {
  const slug = getTenantClientSlug(tenant, settings);
  return `${origin.replace(/\/$/, "")}/cliente/${slug}`;
}

export const getInstitutionClientSlug = getTenantClientSlug;
export const buildInstitutionClientLink = buildTenantClientLink;
export const institutions = tenants;
export const institutionSettings = tenantSettings;

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


