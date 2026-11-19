// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";
import type { MunicipalStaffAssignment } from "@/lib/municipalStaffAssignments";

const mock = vi.hoisted(() => ({
  rows: [] as MunicipalStaffAssignment[],
  saved: vi.fn(),
}));
vi.mock("@/integrations/backend/platform", () => ({
  listRemoteMunicipalStaffAssignments: async () => [...mock.rows],
  setRemoteMunicipalStaffDepartment: async (input: {
    municipalityId: string; profileId: string; departmentId: string; enabled: boolean;
  }) => {
    mock.saved(input);
    const item: MunicipalStaffAssignment = {
      id: "link-" + input.departmentId, municipalityId: input.municipalityId,
      profileId: input.profileId, departmentId: input.departmentId,
      departmentName: input.departmentId === "urban" ? "Urbanismo" : "Financeiro",
      departmentCode: "DEP", role: input.departmentId === "urban" ? "analista" : "financeiro",
      isCurrent: false, isActive: true,
    };
    mock.rows = input.enabled
      ? [...mock.rows.filter((row) => row.departmentId !== input.departmentId), item]
      : mock.rows.filter((row) => row.departmentId !== input.departmentId);
    return { ok: true };
  },
}));
import { MunicipalStaffAssignmentsEditor } from "@/components/platform/MunicipalStaffAssignmentsEditor";
const departments = [
  { id: "urban", municipalityId: "city", name: "Urbanismo", code: "URB", isActive: true, sortOrder: 0 },
  { id: "fin", municipalityId: "city", name: "Financeiro", code: "FIN", isActive: true, sortOrder: 1 },
] as MunicipalDepartmentRecord[];

beforeEach(() => { mock.rows = []; mock.saved.mockClear(); });
afterEach(cleanup);

describe("SIGAPRO — designação de departamentos com uma conta", () => {
  it("não confunde lotação legada com vínculo do banco nem bloqueia a primeira autorização", async () => {
    render(<MunicipalStaffAssignmentsEditor municipalityId="city"
      profileId="staff-1" currentDepartment="Urbanismo" departments={departments} />);
    expect(await screen.findByText("Lotação antiga — autorize para vincular")).toBeInTheDocument();
    const allow = screen.getByRole("button", { name: "Autorizar Urbanismo" });
    expect(allow).toBeEnabled();

    fireEvent.click(allow);
    await waitFor(() => {
      expect(mock.saved).toHaveBeenCalledWith({
        municipalityId: "city", profileId: "staff-1", departmentId: "urban", enabled: true,
      });
    });
    expect(await screen.findByRole("button", { name: "Retirar Urbanismo" })).toBeDisabled();
    expect(screen.getByText("Autorizado para troca")).toBeInTheDocument();
  });

  it("adiciona outra unidade ao mesmo usuário, sem cadastro ou login adicional", async () => {
    mock.rows = [{
      id: "link-urban", municipalityId: "city", profileId: "staff-1",
      departmentId: "urban", departmentName: "Urbanismo", departmentCode: "URB",
      role: "analista", isCurrent: true, isActive: true,
    }];
    render(<MunicipalStaffAssignmentsEditor municipalityId="city"
      profileId="staff-1" currentDepartment="Urbanismo" departments={departments} />);
    const allow = await screen.findByRole("button", { name: "Autorizar Financeiro" });
    fireEvent.click(allow);
    await waitFor(() => expect(mock.rows).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Retirar Urbanismo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retirar Financeiro" })).toBeEnabled();
  });
});
