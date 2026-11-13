import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO QA — estabilidade do painel e consultas municipais", () => {
  it("desduplica consultas do mesmo usuário e ignora resposta da conta anterior", () => {
    const provider = read("src/hooks/usePlatformData.tsx");
    expect(provider).toContain("new IdentityScopedSingleFlight()");
    expect(provider).toContain("return refreshFlightsRef.current.run(identity, focusProcessRouteKey ??");
    expect(provider).toContain("if (currentAuthIdentityRef.current !== identity) return");
    expect(provider).toContain("if (currentAuthIdentityRef.current === identity)");
  });

  it("não consulta toda a plataforma em intervalos de 1-8s", () => {
    const hook = read("src/hooks/useLivePlatformRefresh.ts");
    expect(hook).toContain("Math.max(10000, options?.intervalMs ?? 30000)");
    expect(hook).toContain('window.addEventListener("sigapro:data-changed"');
    expect(hook).toContain('window.addEventListener("focus"');
    expect(hook).toContain("inFlightRef.current");

    const process = read("src/pages/saas/ProcessDetailPage.tsx");
    expect(process).toContain("useLivePlatformRefresh(refreshCurrentProcessStore, { intervalMs: 30000, refreshOnMount: false })");
    expect(process).toContain("window.setInterval(() => void syncExactProcess(), 8000)");
    expect(process).not.toContain("intervalMs: 1800");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    expect(analysis).toContain("intervalMs: 30000, refreshOnMount: false");
  });

  it("mantém mudanças reais e eventos de foco, sem polling geral agressivo", () => {
    const sources: Array<[string, string]> = [
      ["src/pages/saas/FinanceDeskPage.tsx", "intervalMs: 20000, refreshOnMount: false"],
      ["src/pages/saas/MunicipalProcessRegistryPage.tsx", "intervalMs: 30000, refreshOnMount: false"],
      ["src/pages/saas/MovementHistoryPage.tsx", "intervalMs: 30000, refreshOnMount: false"],
    ];
    for (const [path, expected] of sources)
      expect(read(path)).toContain(expected);
    const analyst = read("src/pages/saas/AnalystDeskPage.tsx");
    expect(analyst).toContain("window.setInterval(sync, 30000)");
    expect(analyst).toContain('window.addEventListener("sigapro:data-changed", sync)');
    expect(analyst).not.toContain("window.setInterval(sync, 5000)");
    const externalPayments = read("src/pages/saas/ExternalPaymentsPage.tsx");
    expect(externalPayments).toContain("window.setInterval(refresh, 15000)");
  });

  it("desabilita auto-preview por commit sem tocar na entrega do main", () => {
    const json = JSON.parse(read("vercel.json")) as {git?:{deploymentEnabled?:Record<string,boolean>}};
    const toggles = json.git?.deploymentEnabled ?? {};
    expect(toggles["fix/qa-triagem-analise-pagamento-20261101"]).toBe(false);
    expect(toggles.main).not.toBe(false);
  });
});
