import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  notifyUrbanLegalAuditInvalidation, subscribeUrbanLegalAuditInvalidations,
} from "@/lib/urbanLegalAuditEvents";

describe("SIGAPRO QA — atualizações do acervo legal refletem na auditoria certa", () => {
  it("entrega atualização somente ao assinante do município correto e descadastra ao sair", () => {
    const relevant = "municipality-a";
    let refreshed = 0;
    const unsubscribe = subscribeUrbanLegalAuditInvalidations((municipalityId) => {
      if (municipalityId === relevant) refreshed += 1;
    });
    notifyUrbanLegalAuditInvalidation("");
    notifyUrbanLegalAuditInvalidation("municipality-b");
    expect(refreshed).toBe(0);
    notifyUrbanLegalAuditInvalidation(relevant);
    expect(refreshed).toBe(1);
    unsubscribe();
    notifyUrbanLegalAuditInvalidation(relevant);
    expect(refreshed).toBe(1);
  });

  it("reconsulta após registro e arquivamento, mas não concede aprovação jurídica", () => {
    const readiness = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
    const registry = readFileSync("src/components/platform/UrbanLegislationRegistryPanel.tsx", "utf8");
    expect(readiness).toContain("subscribeUrbanLegalAuditInvalidations");
    expect(readiness).toContain("changedMunicipalityId === municipalityId");
    expect(registry).toContain("notifyUrbanLegalAuditInvalidation(municipalityId)");
    expect(registry).toContain("A norma continua pendente de conferência e NÃO está ativa para a IA.");
    expect(readiness).not.toContain("activateUrbanRegulation(");
  });
});
