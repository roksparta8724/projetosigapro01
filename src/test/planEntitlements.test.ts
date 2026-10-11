import { describe, expect, it } from "vitest";
import { planHasModule, resolvePlanEntitlements } from "@/lib/planEntitlements";
import type { ClientPlanAssignment, PlanItem } from "@/lib/platform";

const plan: PlanItem = {
  id: "plan-test",
  accountLevel: "Test",
  name: "Test",
  subtitle: "",
  description: "",
  price: 100,
  billingCycle: "mensal",
  badge: "",
  badgeVariant: "default",
  featuresIncluded: [],
  featuresExcluded: [],
  modulesIncluded: ["Protocolo digital", "Analise tecnica"],
  maxUsers: 10,
  maxProcesses: 100,
  maxDepartments: 5,
  maxStorageGb: 20,
  isFeatured: false,
  isActive: true,
  isPublic: false,
  isInternalOnly: false,
  isCustom: false,
  isVisibleInMaster: true,
  displayOrder: 1,
  accentColor: "#000000",
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const assignment: ClientPlanAssignment = {
  id: "assignment-test",
  municipalityId: "municipality-test",
  planId: "plan-test",
  contractStatus: "ativo",
  startsAt: "2026-01-01",
  endsAt: "2027-01-01",
  billingCycle: "mensal",
  billingNotes: "",
  customPrice: null,
  isCustom: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("plan entitlements", () => {
  it("allows only modules present in an active contract", () => {
    const state = resolvePlanEntitlements({
      municipalityId: "municipality-test",
      plans: [plan],
      assignments: [assignment],
      now: new Date("2026-10-11T12:00:00.000Z"),
    });

    expect(state.contractActive).toBe(true);
    expect(planHasModule(state, "Protocolo digital")).toBe(true);
    expect(planHasModule(state, "Financeiro")).toBe(false);
    expect(state.maxUsers).toBe(10);
    expect(state.maxStorageGb).toBe(20);
  });

  it("blocks an expired contract even when the plan is active", () => {
    const state = resolvePlanEntitlements({
      municipalityId: "municipality-test",
      plans: [plan],
      assignments: [{ ...assignment, endsAt: "2026-01-31" }],
      now: new Date("2026-10-11T12:00:00.000Z"),
    });

    expect(state.contractActive).toBe(false);
    expect(planHasModule(state, "Protocolo digital")).toBe(false);
    expect(state.contractReason).toContain("vigência");
  });

  it("blocks an unassigned municipality", () => {
    const state = resolvePlanEntitlements({
      municipalityId: "municipality-test",
      plans: [plan],
      assignments: [],
      now: new Date("2026-10-11T12:00:00.000Z"),
    });

    expect(state.contractActive).toBe(false);
    expect(state.assignment).toBeNull();
  });
});
