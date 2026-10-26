import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultProtocolDraftForm, saveProtocolDraft, readProtocolDraft, type ProtocolDraftPayload } from "@/lib/protocolDraft";

describe("padrão construtivo informado expressamente pelo profissional", () => {
  it("não pré-seleciona Médio em protocolos novos", () => {
    expect(defaultProtocolDraftForm.padraoConstrutivo).toBe("");
    const page = readFileSync("src/pages/saas/ProtocolarProjetoPage.tsx", "utf8");
    expect(page).toContain('value={form.padraoConstrutivo || ""}');
    expect(page).toContain('placeholder="Selecione o padrão construtivo"');
    expect(page).toContain('<SelectItem value="medio">Médio</SelectItem>');
    expect(page).not.toContain('list="padroes-construtivos"');
  });

  it("preserva Médio escolhido e já salvo num rascunho antigo", () => {
    const payload: ProtocolDraftPayload = {
      draftNumber: "QA-STANDARD-MEDIO-20261026",
      entryMode: "projeto",
      form: {...defaultProtocolDraftForm, padraoConstrutivo: "medio"},
      files: {},
      updatedAt: new Date().toISOString(),
    };
    const tenant = "11111111-1111-4111-8111-111111111111";
    expect(saveProtocolDraft("qa-standard-user", tenant, payload)).toBe(true);
    const restored = readProtocolDraft("qa-standard-user", tenant, undefined, payload.draftNumber, "projeto");
    expect(restored?.form.padraoConstrutivo).toBe("medio");
  });

  it("mantém a classificação livre de cobrança presumida para novos requerimentos", () => {
    const page = readFileSync("src/pages/saas/ProtocolarProjetoPage.tsx", "utf8");
    expect(page).toContain('constructionStandard: isHabiteSeMode ? "" : form.padraoConstrutivo');
    expect(page).toContain('padraoConstrutivo: isHabiteSeMode ? "" : defaultProtocolDraftForm.padraoConstrutivo');
  });
});