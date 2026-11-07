import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const code = readFileSync("src/pages/saas/ProtocolDeskPage.tsx", "utf8");
const start = code.indexOf('if (session.role === "prefeitura_admin") {\n    const query = processListQuery');
const end = code.indexOf('  return (\n    <PortalFrame eyebrow="SETOR DE PROTOCOLO"', start);
const readonlyBranch = code.slice(start, end);

describe("SIGAPRO QA — Admin Prefeitura não pode operar protocolo pela interface", () => {
  it("interrompe a renderização das ações operacionais e apresenta apenas consulta", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(readonlyBranch).toContain('data-sigapro-prefeitura-admin-readonly="true"');
    expect(readonlyBranch).toContain("Consultar processo");
    expect(readonlyBranch).toContain("return (");
    expect(readonlyBranch).toContain('Exibindo até 75 resultados por consulta.');
  });

  it("não oferece baixa, triagem, retorno auditado, despacho ou upload no ramo de consulta", () => {
    for (const operation of [
      "handleConfirmPreprotocolPayment(",
      "handleConfirmProtocolPayment(",
      "handleRecoverPrematureAnalysis(",
      "handleTriageStatus(",
      "handleDispatchToUrbanism(",
      "dispatchSelectedToUrbanism(",
      "<MarkerSelector",
      "reconcileRemoteProcessTriage(",
      "markGuideAsPaid(",
      "Confirmar pagamento recebido",
      "Protocolar no balcão",
    ]) {
      expect(readonlyBranch).not.toContain(operation);
    }
  });

  it("mantém leitura limitada à prefeitura autenticada e links que não incorporam outra identidade", () => {
    expect(code).toContain("matchesOperationalScope(effectiveScopeId, item)");
    expect(code).toContain("const processes = useMemo(");
    expect(readonlyBranch).toContain("processes.filter(");
    expect(readonlyBranch).toContain("buildProcessPath(process)");
    expect(readonlyBranch).not.toContain("allProcesses.filter(");
  });
});
