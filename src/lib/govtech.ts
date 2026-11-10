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
  processType?: string;
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
  processType?: string;
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
  amount?: number;
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

/**
 * Reference stages only. The Neon RLS/RPC layer is the authorization source.
 * Initial fees are paid BEFORE the municipality allocates an official protocol,
 * then triage is performed. Habite-se has a separate protocol, not an automatic
 * continuation of approval. Admin municipal is observation-only for processes.
 */
export const defaultMunicipalWorkflowStages: MunicipalWorkflowStage[] = [
  {
    id:"stage-preprotocol",code:"protocol_initial",
    label:"Cadastro / pré-protocolo",
    description:"Dados e anexos do profissional; ainda não existe número municipal de processo.",
    queueCode:"protocols",stageType:"manual",orderIndex:1,
  },
  {
    id:"stage-initial-fee",code:"initial_fee",
    label:"Guia inicial de protocolo",
    description:"Emissão e arquivamento do PDF original; a numeração do processo ainda não é consumida.",
    queueCode:"financial",stageType:"financial",orderIndex:2,requiresPayment:true,
  },
  {
    id:"stage-initial-settlement",code:"initial_settlement",
    label:"Compensação e oficialização",
    description:"Conciliação da guia e oficialização sequencial pelo banco/Protocolo, sem confundir simulações com arrecadação.",
    queueCode:"financial",stageType:"financial",orderIndex:3,requiresPayment:true,
  },
  {
    id:"stage-document-screening",code:"document_screening",
    label:"Triagem documental",
    description:"Triagem após compensação: confere anexos e retorna documentos insuficientes ao profissional.",
    queueCode:"protocols",stageType:"documental",orderIndex:4,
  },
  {
    id:"stage-technical-analysis",code:"technical_analysis",
    label:"Análise técnica",
    description:"Checklist, medições evidenciadas, legislação verificada e parecer sujeito à conferência humana.",
    queueCode:"analysis",stageType:"technical",orderIndex:5,requiresChecklist:true,allowsRequirement:true,
  },
  {
    id:"stage-formal-requirement",code:"formal_requirement",
    label:"Comunique-se",
    description:"Exigência formal com histórico e retorno documental ao profissional.",
    queueCode:"requirements",stageType:"manual",orderIndex:6,
  },
  {
    id:"stage-resubmission",code:"resubmission",
    label:"Reapresentação",
    description:"Nova versão documental sem perder o histórico, retornando à análise.",
    queueCode:"requirements",stageType:"documental",orderIndex:7,
  },
  {
    id:"stage-approval",code:"approval",
    label:"Parecer e aprovação",
    description:"Análise final, decisão humana e assinatura competente, sem aprovação automática por IA.",
    queueCode:"approval",stageType:"approval",orderIndex:8,
  },
  {
    id:"stage-complementary-fee",code:"complementary_fee",
    label:"Guias finais / ISSQN",
    description:"Valores complementares do processo de aprovação, vinculados aos atos originais.",
    queueCode:"financial",stageType:"financial",orderIndex:9,requiresPayment:true,
  },
  {
    id:"stage-occupancy-permit",code:"occupancy_permit",
    label:"Habite-se — protocolo independente",
    description:"Fluxo de habite-se próprio: vistoria, relatório, guia e assinatura do diretor.",
    queueCode:"occupancy",stageType:"approval",orderIndex:10,
  },
  {
    id:"stage-completed",code:"completed",
    label:"Concluído e arquivado",
    description:"Encerramento rastreável do protocolo correspondente com documentos originais preservados.",
    queueCode:"approval",stageType:"approval",orderIndex:11,terminal:true,
  },
];

/**
 * Reference transition contract. Every rule is an explicit input supplied
 * by the authenticated backend; this array does not itself grant permissions.
 * No prefeitura_admin role is allowed to act on a process.
 */
export const defaultMunicipalWorkflowTransitions: MunicipalWorkflowTransition[] = [
  {
    id:"preprotocol-to-fee",fromStageCode:"protocol_initial",toStageCode:"initial_fee",
    actionLabel:"Solicitar guia inicial",
    allowedRoles:["profissional_externo","atendimento_balcao"],
    validationRules:["protocol_data_completed","required_documents_present"],
  },
  {
    id:"fee-to-settlement",fromStageCode:"initial_fee",toStageCode:"initial_settlement",
    actionLabel:"Aguardar compensação",
    allowedRoles:["atendimento_balcao","financeiro"],
    validationRules:["guide_issued","original_pdf_archived"],
  },
  {
    id:"settlement-to-triage",fromStageCode:"initial_settlement",toStageCode:"document_screening",
    actionLabel:"Oficializar e encaminhar à triagem",
    allowedRoles:["financeiro","atendimento_balcao"],
    validationRules:["guide_compensated","protocol_officialized"],
  },
  {
    id:"triage-to-analysis",fromStageCode:"document_screening",toStageCode:"technical_analysis",
    actionLabel:"Liberar aprovação para análise",
    allowedRoles:["atendimento_balcao","prefeitura_supervisor"],
    validationRules:["approval_protocol","triage_completed","required_documents_present"],
  },
  {
    id:"triage-to-habite-se",fromStageCode:"document_screening",toStageCode:"occupancy_permit",
    actionLabel:"Liberar habite-se para vistoria",
    allowedRoles:["atendimento_balcao","prefeitura_supervisor"],
    validationRules:["habite_se_protocol","triage_completed","required_documents_present"],
  },
  {
    id:"analysis-to-requirement",fromStageCode:"technical_analysis",toStageCode:"formal_requirement",
    actionLabel:"Emitir comunique-se",
    allowedRoles:["analista","prefeitura_supervisor"],
    validationRules:["checklist_started"],
  },
  {
    id:"requirement-to-resubmission",fromStageCode:"formal_requirement",toStageCode:"resubmission",
    actionLabel:"Responder ao comunique-se",
    allowedRoles:["profissional_externo"],
    validationRules:["requirement_answered"],
  },
  {
    id:"resubmission-to-analysis",fromStageCode:"resubmission",toStageCode:"technical_analysis",
    actionLabel:"Reabrir análise com novas versões",
    allowedRoles:["atendimento_balcao","prefeitura_supervisor"],
    validationRules:["replacement_documents_valid"],
  },
  {
    id:"analysis-to-approval",fromStageCode:"technical_analysis",toStageCode:"approval",
    actionLabel:"Concluir análise técnica",
    allowedRoles:["analista","prefeitura_supervisor"],
    validationRules:["checklist_completed","no_open_requirements","legal_review_verified"],
  },
  {
    id:"approval-to-fees",fromStageCode:"approval",toStageCode:"complementary_fee",
    actionLabel:"Emitir taxas finais",
    allowedRoles:["financeiro"],
    validationRules:["approval_granted"],
  },
  {
    id:"approval-to-completed",fromStageCode:"complementary_fee",toStageCode:"completed",
    actionLabel:"Arquivar aprovação e alvará",
    allowedRoles:["diretor","financeiro"],
    validationRules:["final_guide_compensated","construction_permit_signed"],
  },
  {
    id:"habite-se-to-completed",fromStageCode:"occupancy_permit",toStageCode:"completed",
    actionLabel:"Arquivar habite-se",
    allowedRoles:["diretor","fiscal"],
    validationRules:["inspection_completed","habite_se_guide_compensated","occupancy_permit_signed"],
  },
];
