import { describe, expect, it } from "vitest";
import { can, canAccessProcess, getMasterMetrics, getProcessById, sessionUsers } from "@/lib/platform";

describe("platform RBAC", () => {
  it("blocks master from opening process data directly", () => {
    const master = sessionUsers.find((user) => user.role === "master_admin");
    const process = getProcessById("proc-001");

    expect(master).toBeTruthy();
    expect(process).toBeTruthy();
    expect(canAccessProcess(master!, process!)).toBe(false);
  });

  it("allows external professional to see only own process", () => {
    const professional = sessionUsers.find((user) => user.id === "u-ext-1");
    const ownProcess = getProcessById("proc-001");
    const otherTenantProcess = getProcessById("proc-002");

    expect(canAccessProcess(professional!, ownProcess!)).toBe(true);
    expect(canAccessProcess(professional!, otherTenantProcess!)).toBe(false);
  });

  it("keeps master capabilities focused on metrics and tenant governance", () => {
    const master = sessionUsers.find((user) => user.role === "master_admin");
    const metrics = getMasterMetrics();

    expect(can(master!, "view_master_dashboard")).toBe(true);
    expect(can(master!, "manage_tenant_users")).toBe(true);
    expect(metrics.tenants).toBeGreaterThan(0);
    expect(metrics.processes).toBeGreaterThan(0);
  });
});
