export type MunicipalStageCode =
  | "protocol_initial"
  | "document_screening"
  | "initial_fee"
  | "initial_settlement"
  | "technical_analysis"
  | "formal_requirement"
  | "resubmission"
  | "approval"
  | "complementary_fee"
  | "occupancy_permit"
  | "completed";

export type MunicipalStageType = "manual" | "financial" | "documental" | "technical" | "approval";

export type ChecklistDecision = "de_acordo" | "apresentar" | "corrigir";

export type FeeRuleKind =
  | "fixed"
  | "per_square_meter"
  | "tiered_square_meter"
  | "percentage"
  | "professional_category"
  | "construction_standard";

export interface MunicipalWorkflowStage {
  id: string;
  code: MunicipalStageCode;
  label: string;
  description: string;
  queueCode: string;
  stageType: MunicipalStageType;
  orderIndex: number;
  requiresPayment?: boolean;
  requiresChecklist?: boolean;
  allowsRequirement?: boolean;
  terminal?: boolean;
}

export interface MunicipalWorkflowTransition {
  id: string;
  fromStageCode: MunicipalStageCode;
  toStageCode: MunicipalStageCode;
  actionLabel: string;
  allowedRoles: string[];
  validationRules: string[];
}

export interface TechnicalChecklistTemplate {
  id: string;
  tenantId: string;
  processType: string;
  label: string;
  items: TechnicalChecklistItem[];
}

export interface TechnicalChecklistItem {
  id: string;
  title: string;
  reference?: string;
  guidance?: string;
  required: boolean;
}

export interface TechnicalChecklistResultItem extends TechnicalChecklistItem {
  decision: ChecklistDecision | null;
  notes: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface MunicipalFeeTable {
  id: string;
  tenantId: string;
  code: string;
  label: string;
  description: string;
  currency: "BRL";
  active: boolean;
}

export interface MunicipalFeeRuleTier {
  id: string;
  minArea?: number;
  maxArea?: number;
  fixedAmount?: number;
  ratePerSquareMeter?: number;
}

export interface MunicipalFeeRule {
  id: string;
  tableId: string;
  code: string;
  label: string;
  kind: FeeRuleKind;
  amount?: number;
  rate?: number;
  professionalCategory?: string;
  constructionStandard?: string;
  processType?: string;
  occupancyPermit?: boolean;
  tiers?: MunicipalFeeRuleTier[];
}

export interface CalculationContext {
  processType: string;
  builtArea: number;
  occupancyPermitArea?: number;
  constructionStandard?: string;
  professionalCategory?: string;
  baseValue?: number;
}

export interface CalculationLine {
  id: string;
  code: string;
  label: string;
  amount: number;
  explanation: string;
}

export interface CalculationResult {
  total: number;
  lines: CalculationLine[];
}

export interface BankIntegrationProfile {
  id: string;
  tenantId: string;
  bankCode: string;
  bankName: string;
  agreementCode: string;
  settlementMode: "manual" | "cnab" | "api" | "pix";
  pixEnabled: boolean;
  reconciliationWindowHours: number;
}

export interface MunicipalWorkQueue {
  id: string;
  tenantId: string;
  code: string;
  label: string;
  sector: string;
  roles: string[];
  stageCodes: MunicipalStageCode[];
}

export interface AuditTrailEntry {
  id: string;
  tenantId: string;
  processId?: string;
  actorUserId: string;
  actorName: string;
  eventType: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const defaultMunicipalWorkflowStages: MunicipalWorkflowStage[] = [
  {
    id: "stage-protocol-initial",
    code: "protocol_initial",
    label: "Protocolo inicial",
    description: "Recepcao do pedido e abertura oficial do protocolo.",
    queueCode: "protocols",
    stageType: "manual",
    orderIndex: 1,
  },
  {
    id: "stage-document-screening",
    code: "document_screening",
    label: "Conferencia documental",
    description: "Triagem documental inicial e validacao de anexos.",
    queueCode: "protocols",
    stageType: "documental",
    orderIndex: 2,
  },
  {
    id: "stage-initial-fee",
    code: "initial_fee",
    label: "Emissao de guia inicial",
    description: "Geracao da guia inicial do protocolo.",
    queueCode: "financial",
    stageType: "financial",
    orderIndex: 3,
    requiresPayment: true,
  },
  {
    id: "stage-initial-settlement",
    code: "initial_settlement",
    label: "Compensacao inicial",
    description: "Aguardando confirmacao bancaria ou baixa manual.",
    queueCode: "financial",
    stageType: "financial",
    orderIndex: 4,
    requiresPayment: true,
  },
  {
    id: "stage-technical-analysis",
    code: "technical_analysis",
    label: "Analise tecnica",
    description: "Checklist tecnico, parecer e validacoes setoriais.",
    queueCode: "analysis",
    stageType: "technical",
    orderIndex: 5,
    requiresChecklist: true,
    allowsRequirement: true,
  },
  {
    id: "stage-formal-requirement",
    code: "formal_requirement",
    label: "Comunique-se",
    description: "Pendencia formal aguardando resposta do profissional.",
    queueCode: "requirements",
    stageType: "manual",
    orderIndex: 6,
  },
  {
    id: "stage-resubmission",
    code: "resubmission",
    label: "Reenvio",
    description: "Reapresentacao documental ou tecnica pelo profissional.",
    queueCode: "requirements",
    stageType: "documental",
    orderIndex: 7,
  },
  {
    id: "stage-approval",
    code: "approval",
    label: "Aprovacao",
    description: "Parecer final e deferimento da analise.",
    queueCode: "approval",
    stageType: "approval",
    orderIndex: 8,
  },
  {
    id: "stage-complementary-fee",
    code: "complementary_fee",
    label: "Guia complementar / ISSQN",
    description: "Emissao de ISSQN, taxa de aprovacao ou valores complementares.",
    queueCode: "financial",
    stageType: "financial",
    orderIndex: 9,
    requiresPayment: true,
  },
  {
    id: "stage-occupancy-permit",
    code: "occupancy_permit",
    label: "Habite-se",
    description: "Etapa de vistoria final e emissao de habite-se, quando aplicavel.",
    queueCode: "occupancy",
    stageType: "approval",
    orderIndex: 10,
  },
  {
    id: "stage-completed",
    code: "completed",
    label: "Concluido",
    description: "Processo encerrado com todos os atos finalizados.",
    queueCode: "approval",
    stageType: "approval",
    orderIndex: 11,
    terminal: true,
  },
];

export const defaultMunicipalWorkflowTransitions: MunicipalWorkflowTransition[] = [
  {
    id: "transition-1",
    fromStageCode: "protocol_initial",
    toStageCode: "document_screening",
    actionLabel: "Encaminhar para triagem",
    allowedRoles: ["atendimento_balcao", "prefeitura_admin", "prefeitura_supervisor"],
    validationRules: ["protocol_data_completed"],
  },
  {
    id: "transition-2",
    fromStageCode: "document_screening",
    toStageCode: "initial_fee",
    actionLabel: "Emitir guia inicial",
    allowedRoles: ["atendimento_balcao", "financeiro", "prefeitura_admin"],
    validationRules: ["required_documents_present"],
  },
  {
    id: "transition-3",
    fromStageCode: "initial_settlement",
    toStageCode: "technical_analysis",
    actionLabel: "Liberar para analise",
    allowedRoles: ["financeiro", "prefeitura_admin"],
    validationRules: ["guide_compensated"],
  },
  {
    id: "transition-4",
    fromStageCode: "technical_analysis",
    toStageCode: "formal_requirement",
    actionLabel: "Gerar exigencia",
    allowedRoles: ["analista", "prefeitura_supervisor", "prefeitura_admin"],
    validationRules: ["checklist_started"],
  },
  {
    id: "transition-5",
    fromStageCode: "formal_requirement",
    toStageCode: "resubmission",
    actionLabel: "Receber reapresentacao",
    allowedRoles: ["profissional_externo", "prefeitura_admin"],
    validationRules: ["requirement_answered"],
  },
  {
    id: "transition-6",
    fromStageCode: "resubmission",
    toStageCode: "technical_analysis",
    actionLabel: "Retornar para analise",
    allowedRoles: ["atendimento_balcao", "prefeitura_admin"],
    validationRules: ["replacement_documents_valid"],
  },
  {
    id: "transition-7",
    fromStageCode: "technical_analysis",
    toStageCode: "approval",
    actionLabel: "Aprovar tecnicamente",
    allowedRoles: ["analista", "prefeitura_supervisor", "prefeitura_admin"],
    validationRules: ["checklist_completed", "no_open_requirements"],
  },
  {
    id: "transition-8",
    fromStageCode: "approval",
    toStageCode: "complementary_fee",
    actionLabel: "Gerar guia complementar",
    allowedRoles: ["financeiro", "prefeitura_admin"],
    validationRules: ["approval_granted"],
  },
  {
    id: "transition-9",
    fromStageCode: "complementary_fee",
    toStageCode: "occupancy_permit",
    actionLabel: "Liberar para habite-se",
    allowedRoles: ["financeiro", "prefeitura_admin"],
    validationRules: ["guide_compensated"],
  },
  {
    id: "transition-10",
    fromStageCode: "occupancy_permit",
    toStageCode: "completed",
    actionLabel: "Concluir processo",
    allowedRoles: ["fiscal", "prefeitura_admin", "prefeitura_supervisor"],
    validationRules: ["occupancy_permit_granted"],
  },
];
