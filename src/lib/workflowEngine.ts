import {
  defaultMunicipalWorkflowStages,
  defaultMunicipalWorkflowTransitions,
  type MunicipalStageCode,
  type MunicipalWorkflowStage,
  type MunicipalWorkflowTransition,
} from "@/lib/govtech";

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
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const current = orderedStages[safeIndex] ?? null;
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
