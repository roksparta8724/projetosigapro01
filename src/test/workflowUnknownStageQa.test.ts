import {describe,expect,it} from "vitest";
import {getWorkflowProgress,resolveAllowedTransitions} from "@/lib/workflowEngine";
import {defaultMunicipalWorkflowStages,type MunicipalStageCode} from "@/lib/govtech";
describe("SIGAPRO unknown workflow stage: fail closed",()=>{
  it("does not present an unknown stage as the official first step",()=>{
    const snapshot=getWorkflowProgress("invalid-stage" as MunicipalStageCode);
    expect(snapshot.current).toBeNull();
    expect(snapshot.completed).toEqual([]);
    expect(snapshot.upcoming).toHaveLength(defaultMunicipalWorkflowStages.length);
    expect(snapshot.progressPercent).toBe(0);
  });
  it("preserves the known progress and does not authorize unknown transitions",()=>{
    const first=defaultMunicipalWorkflowStages[0];
    expect(getWorkflowProgress(first.code).current?.code).toBe(first.code);
    expect(resolveAllowedTransitions({
      currentStageCode:"invalid-stage" as MunicipalStageCode,
      completedRules:[],role:"analista",
    })).toHaveLength(0);
  });
});
