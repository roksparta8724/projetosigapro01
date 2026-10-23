import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractUrbanLegalSuggestions, searchLegalEvidence,
  validateLegalEvidenceDraft, type UrbanLegalEvidence,
} from "@/lib/urbanLegalKnowledge";

describe("SIGAPRO IA — normas provenientes de documentos reais", () => {
  it("propõe um limite explícito e conserva a página e o texto original", () => {
    const out = extractUrbanLegalSuggestions([
      { page: 7, text: "Artigo 21. O recuo frontal mínimo de 5 metros deve ser observado nos lotes urbanos." },
      { page: 10, text: "Art. 30. Taxa de ocupação máxima de 60% na área do município." },
    ]);
    expect(out.find(x => x.metric === "front_setback_m")).toMatchObject({ page: 7, suggestedLimit: 5 });
    expect(out.find(x => x.metric === "occupancy_percent")).toMatchObject({ page: 10, suggestedLimit: 60 });
    expect(out[0].excerpt).toContain("Artigo 21");
  });
  it("não transforma remissões legais, condições ou valores sem unidade em obrigação automática", () => {
    const out = extractUrbanLegalSuggestions([
      { page: 8, text: "O recuo frontal mínimo de 5 metros, salvo quando previsto no anexo II." },
      { page: 9, text: "Taxa de ocupação máxima de 60 conforme tabela de usos e anexos." },
      { page: 10, text: "Coeficiente de aproveitamento 2,5 para setores específicos." },
      { page: 11, text: "Recuo lateral mínimo de 4% sujeito a condição especial." },
    ]);
    expect(out.every(x => x.suggestedLimit === null)).toBe(true);
    expect(out[0].uncertainty).toMatch(/condição|exceção/i);
  });
  it("não usa número de outra página nem repete pesquisa falsa", () => {
    expect(extractUrbanLegalSuggestions([{ page: 1, text: "" }, { page: 2, text: "Lei complementar sem parâmetros." }])).toEqual([]);
  });
  it("valida tamanho, hash, página, parâmetro e trecho antes de qualquer persistência", () => {
    const good = {
      title: "Plano Diretor 2026", hash: "a".repeat(64), page: 11,
      metric: "front_setback_m", excerpt: "Recuo frontal mínimo de cinco metros.",
    };
    expect(() => validateLegalEvidenceDraft(good)).not.toThrow();
    expect(() => validateLegalEvidenceDraft({ ...good, hash: "invalid" })).toThrow("SHA-256");
    expect(() => validateLegalEvidenceDraft({ ...good, page: -1 })).toThrow("Página");
    expect(() => validateLegalEvidenceDraft({ ...good, metric: "__anything" })).toThrow("Parâmetro");
    expect(() => validateLegalEvidenceDraft({ ...good, excerpt: "x" })).toThrow("Trecho");
  });
  it("busca trechos já confirmados sem fabricar resultados", () => {
    const one: UrbanLegalEvidence = {
      id: "one", municipality_id: "municipio-a", document_title: "Plano Diretor",
      document_sha256: "b".repeat(64), page_number: 3,
      metric: "front_setback_m", excerpt: "O recuo frontal aplicável está disposto no Artigo 32.",
      created_at: "2026-10-23T10:00:00Z",
    };
    expect(searchLegalEvidence([one], "artigo 32")).toEqual([one]);
    expect(searchLegalEvidence([one], "altura máxima")).toEqual([]);
  });
  it("SQL veda acesso direto à tabela e condiciona escrita ao administrador municipal", () => {
    const sql = readFileSync(resolve(process.cwd(),
      "neon/migrations/20261023_urban_ai_legal_evidence_catalog_v1.sql"), "utf8");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.urban_legal_evidence_catalog from public, authenticated");
    expect(sql).toContain("public.is_urban_regulation_admin_v1(_municipality_id)");
    expect(sql).toContain("public.has_tenant_access(_municipality_id)");
    expect(sql).toContain("where municipality_id=_municipality_id");
    expect(sql).not.toContain("grant select on public.urban_legal_evidence_catalog");
  });
  it("citação e regra só podem ser ativadas separadamente após revisão", () => {
    const view = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanLegalKnowledgeDesk.tsx"), "utf8");
    const settings = readFileSync(resolve(process.cwd(), "src/components/platform/MunicipalUrbanRulesSettings.tsx"), "utf8");
    expect(view).toContain("Confirmar trecho no acervo municipal");
    expect(view).toContain("Li o artigo integral");
    expect(view).not.toContain("activateUrbanRegulation(");
    expect(settings).toContain("Validar e ativar");
    expect(view).toContain("extractUrbanPdfText(bytes)");
    expect(view).not.toContain("uploadFile(");
  });
});
