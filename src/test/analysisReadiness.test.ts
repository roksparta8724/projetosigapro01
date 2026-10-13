import { describe, expect, it } from "vitest";
import type { ProcessRecord, UserProfile } from "@/lib/platform";
import { getAnalysisPreflightChecks } from "@/components/platform/AnalysisReadinessPanel";
import { getProcessRegistrationIssues, hasRealRegistryValue } from "@/lib/processIdentityValidation";

const demo = {
  id: "sample",
  ownerName: "Titular",
  ownerDocument: "***6659",
  technicalLead: "Responsável",
  address: "Não informado",
  property: {
    iptu: "",
    registration: "N/A",
    usage: "",
    workType: "",
    area: 0,
    lot: "",
    block: "",
  },
  documents: [
    { id: "a", label: "Projeto arquitetônico", required: true, uploaded: true, reviewStatus: "pendente" },
  ],
  requirements: [
    { id: "r", status: "aberta" },
  ],
} as ProcessRecord;

describe("SIGAPRO analysis preparatory checklist", () => {
  it("detects placeholder values as missing instead of treating them as real registrations", () => {
    expect(hasRealRegistryValue("Não informado")).toBe(false);
    expect(hasRealRegistryValue("n/a")).toBe(false);
    expect(hasRealRegistryValue("Rua das Flores, 12")).toBe(true);
    expect(getProcessRegistrationIssues(demo, false)).toEqual(expect.arrayContaining([
      expect.stringContaining("Endereço"),
      expect.stringContaining("Matrícula"),
      expect.stringContaining("CPF/CNPJ"),
    ]));
  });

  it("preserves required document review and open requirements as pending", () => {
    const checks = getAnalysisPreflightChecks(demo);
    expect(checks.find((item) => item.id === "documentos")?.state).toBe("pending");
    expect(checks.find((item) => item.id === "comunique")?.state).toBe("pending");
  });

  it("never claims to approve zoning or professional certification automatically", () => {
    const profile = { fullName: "Responsável", registrationNumber: "CREA 123", cpfCnpj: "52998224725" } as UserProfile;
    const checks = getAnalysisPreflightChecks(demo, undefined, profile);
    expect(checks.find((item) => item.id === "urbanismo")?.state).toBe("manual");
    expect(checks.find((item) => item.id === "responsabilidade")?.state).toBe("manual");
    expect(checks.filter((item) => item.state === "ok")).toHaveLength(0);
  });
});
