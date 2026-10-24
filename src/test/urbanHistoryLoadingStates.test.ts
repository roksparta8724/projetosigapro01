import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO IA - estados do histórico", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");

  it("não anuncia histórico vazio antes da resposta da consulta", () => {
    expect(source).toContain("const [historyLoading, setHistoryLoading] = useState(true)");
    expect(source).toContain('setHistoryLoading(true);');
    expect(source).toContain("historyLoading ? <p role=\"status\"");
    expect(source).toContain("Consultando histórico de pré-conferências...");
    expect(source).toContain("!historyLoading && !history.length && !historyError");
  });

  it("finaliza indicador quando a leitura inicial termina ou falha", () => {
    expect(source).toContain('setHistory(past); setHistoryError(""); setHistoryLoading(false);');
    expect(source).toContain('setHistoryError(String((error as Error)?.message || error)); setHistoryLoading(false);');
  });

  it("não deixa atualização antiga após salvar sobrescrever uma consulta manual mais recente", () => {
    expect(source).toContain("const savedHistoryGeneration = ++historyRetryGenerationRef.current;");
    const saveRefresh = source.slice(source.indexOf("const savedHistoryGeneration"));
    const retry = source.slice(source.indexOf("const retryHistory = async () =>"));
    expect(saveRefresh).toContain("historyRetryGenerationRef.current !== savedHistoryGeneration");
    expect(retry).toContain("const retryGeneration = ++historyRetryGenerationRef.current");
  });

  it("não mostra sucesso de leitura quando a atualização após salvar falhar", () => {
    expect(source).toContain('setHistoryLoading(true);');
    expect(source).toContain('setHistoryLoading(false);');
    expect(source).toContain("O sistema não confirmou que o histórico está vazio.");
  });
});
