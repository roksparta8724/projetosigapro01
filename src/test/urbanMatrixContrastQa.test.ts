import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const css = readFileSync("src/styles/surface-polarity.css","utf8");

describe("SIGAPRO matriz QA — contraste e salvamento verificável",()=>{
  it("distingue os cards de leitura visual e registro manual sem afetar outros módulos",()=>{
    expect(ui).toContain('data-urban-matrix-ai-card="true"');
    expect(ui).toContain('data-urban-matrix-manual-card="true"');
    expect(css).toContain('[data-urban-matrix-import="true"]');
    expect(css).toContain('background:#eff8ff !important');
    expect(css).toContain('-webkit-text-fill-color:#0f172a !important');
  });
  it("mantém ações com estados habilitado/desabilitado legíveis",()=>{
    expect(ui).toContain('data-urban-matrix-action="vision"');
    expect(ui).toContain('data-urban-matrix-action="extract"');
    expect(ui).toContain('data-urban-matrix-action="manual"');
    expect(css).toContain('button[data-urban-matrix-action="vision"]:not(:disabled)');
    expect(css).toContain('button[data-urban-matrix-action]:disabled');
    expect(css).toContain('color:#ffffff !important');
    expect(css).toContain('color:#334155 !important');
    expect(ui).toContain('data-urban-matrix-vision-hint="true"');
  });
  it("não confunde erro de leitura de histórico com ausência de registros",()=>{
    expect(ui).toContain('setHistoryError(true)');
    expect(ui).toContain('setHistoryChecked(true)');
    expect(ui).toContain('historyChecked && !historyError && history.length===0');
    expect(ui).toContain('data-urban-matrix-empty-history="true"');
    expect(ui).toContain('Registro enviado ao banco, mas a leitura do histórico falhou');
    expect(ui).not.toContain('activateUrbanRegulation(');
  });
});
