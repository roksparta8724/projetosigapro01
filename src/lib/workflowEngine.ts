import {
  defaultMunicipalWorkflowStages,
  defaultMunicipalWorkflowTransitions,
  type MunicipalStageCode,
  type MunicipalWorkflowStage,
  type MunicipalWorkflowTransition,
} from "@/lib/govtech";

export type MunicipalWorkflowKind="aprovacao"|"habite_se";
/**
 * Two independent protocols: an approval does not automatically proceed into
 * habite-se. Preserve a single registry of stage codes for existing adapters.
 */
export function buildMunicipalWorkflowForKind(kind:MunicipalWorkflowKind){
  const included=new Set<import("@/lib/govtech").MunicipalStageCode>(
    kind==="habite_se"
      ?["protocol_initial","initial_fee","initial_settlement","document_screening","technical_analysis",
        "formal_requirement","resubmission","habite_se_inspection","habite_se_fee","occupancy_permit","completed"]
      :["protocol_initial","initial_fee","initial_settlement","document_screening","technical_analysis",
         "formal_requirement","resubmission","approval","complementary_fee","completed"],
  );
  return {
    stages:defaultMunicipalWorkflowStages.filter(s=>included.has(s.code))
      .sort((a,b)=>a.orderIndex-b.orderIndex),
    transitions:defaultMunicipalWorkflowTransitions.filter(
      t=>included.has(t.fromStageCode)&&included.has(t.toStageCode)),
  };
}

export interface WorkflowRuntimeContext {
  currentStageCode: MunicipalStageCode;
  completedRules: string[];
  role: string;
}

export interface WorkflowProgressSnapshot {
  current: MunicipalWorkflowStage | null;
  completed: MunicipalWorkflowStage[];
  upcoming: MunicipalWorkflowStage[];
  progressPercent: number;
}

export function buildDefaultMunicipalWorkflow() {
  return {
    stages: [...defaultMunicipalWorkflowStages].sort((a, b) => a.orderIndex - b.orderIndex),
    transitions: [...defaultMunicipalWorkflowTransitions],
  };
}

export function getStageByCode(stageCode: MunicipalStageCode, stages = defaultMunicipalWorkflowStages) {
  return stages.find((stage) => stage.code === stageCode) ?? null;
}

export function resolveAllowedTransitions(
  context: WorkflowRuntimeContext,
  transitions = defaultMunicipalWorkflowTransitions,
) {
  return transitions.filter((transition) => {
    if (transition.fromStageCode !== context.currentStageCode) return false;
    if (!transition.allowedRoles.includes(context.role)) return false;
    return transition.validationRules.every((rule) => context.completedRules.includes(rule));
  });
}

export function canAdvanceWorkflow(
  context: WorkflowRuntimeContext,
  transitions = defaultMunicipalWorkflowTransitions,
) {
  return resolveAllowedTransitions(context, transitions).length > 0;
}

export function getWorkflowProgress(
  currentStageCode: MunicipalStageCode,
  stages = defaultMunicipalWorkflowStages,
): WorkflowProgressSnapshot {
  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentIndex = orderedStages.findIndex((stage) => stage.code === currentStageCode);
  // An unknown stage must never be disguised as a valid opening stage.
  if(currentIndex<0)return {
    current:null,completed:[],upcoming:orderedStages,progressPercent:0,
  };
  const safeIndex=currentIndex;
  const current=orderedStages[safeIndex]??null;
  const completed = orderedStages.slice(0, safeIndex);
  const upcoming = orderedStages.slice(safeIndex + 1);
  const progressPercent = orderedStages.length > 1 ? Math.round((safeIndex / (orderedStages.length - 1)) * 100) : 0;

  return {
    current,
    completed,
    upcoming,
    progressPercent,
  };
}

export function groupStagesByQueue(stages = defaultMunicipalWorkflowStages) {
  return stages.reduce<Record<string, MunicipalWorkflowStage[]>>((accumulator, stage) => {
    if (!accumulator[stage.queueCode]) {
      accumulator[stage.queueCode] = [];
    }
    accumulator[stage.queueCode].push(stage);
    return accumulator;
  }, {});
}

export function resolveNextStageCodes(
  context: WorkflowRuntimeContext,
  transitions = defaultMunicipalWorkflowTransitions,
) {
  return resolveAllowedTransitions(context, transitions).map((transition) => transition.toStageCode);
}

export function buildWorkflowAuditDescription(transition: MunicipalWorkflowTransition) {
  return `${transition.actionLabel} (${transition.fromStageCode} -> ${transition.toStageCode})`;
}
