import { calculateUrbanMatrixBatchProgress } from "@/lib/urbanLegalMatrixReview";
import { isUrbanTestFixtureRule, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";
import { countCoveredUrbanMetrics, type UrbanLegalEvidenceScope } from "@/lib/urbanEvidenceCoverage";
import type {
  UrbanMatrixBatchDetail, UrbanMatrixRowReadingAudit, UrbanQuadroIIWorkspace,
} from "@/integrations/backend/urbanPrecheckClient";

export type MunicipalLegalFiles = {
  usoSolo: string; zoneamento: string; planoDiretor: string; leisComplementares: string;
};
export type UrbanReadinessInput = {
  files: MunicipalLegalFiles;
  source: UrbanMatrixBatchDetail | null;
  audits: UrbanMatrixRowReadingAudit[];
  quadroII: UrbanQuadroIIWorkspace | null;
  matrixImports: Array<{ quadro: string; status: string }>;
  verifiedEvidence: UrbanLegalEvidenceScope[];
  regulations: UrbanRegulationVersion[];
  versionedLawCount: number;
};
export type UrbanReadinessCheck = {
  code: string; title: string; detail: string; passed: boolean;
  quadro: "I" | "II" | null;
};
export type UrbanReadinessSummary = {
  readyForHumanAssistedPrecheck: boolean;
  reading: { total: number; verified: number; needsCorrection: number; untreated: number };
  quadroII: { pages: number; draftEntries: number; machineProposals: number };
  counts: {
    versionedLaws: number; numericImports: number; useImports: number;
    verifiedEvidence: number; officialActive: number; evidencedActive: number; fictitiousQA: number;
  };
  checks: UrbanReadinessCheck[];
};

export const OTHER_REQUIRED_URBAN_FIELDS = [
  "CA mínimo e CA básico (informação jurídica contextual)",
  "Área mínima do lote, frente ou testada e fração ideal",
  "Gabarito condicionado à largura da via",
  "Usos permitidos, permissíveis e proibidos por zona",
  "Vagas, acessos e condições especiais do Quadro II",
  "Recuos especiais de esquina, edícula e aberturas",
  "Restrições ambientais e faixas não edificantes",
] as const;

/**
 * A checked OCR reading is not legal validation. No PDF, QA fixture, machine
 * suggestion or historical draft can be automatically approved for the AI.
 */
export function assessUrbanAiReadiness(data: UrbanReadinessInput): UrbanReadinessSummary {
  const progress = data.source
    ? calculateUrbanMatrixBatchProgress(data.source, data.audits) : null;
  const officialActive = data.regulations.filter((row) =>
    row.status === "active" && !isUrbanTestFixtureRule(row)).length;
  const fictitiousQA = data.regulations.filter(isUrbanTestFixtureRule).length;
  const numericImports = data.matrixImports.filter((row) => row.quadro === "I").length;
  const useImports = data.matrixImports.filter((row) => row.quadro === "II").length;
  const verifiedEvidence = data.verifiedEvidence.filter((row) =>
    Boolean(row.id && row.metric)).length;
  // Do not mistake one unrelated citation for full legal coverage. Evidence
  // must match every metric of the same municipality, zone, use and period.
  const evidencedActive = data.regulations.filter((version) =>
    version.status === "active" && !isUrbanTestFixtureRule(version) &&
    version.rules.length > 0 &&
    countCoveredUrbanMetrics(version, data.verifiedEvidence) === version.rules.length).length;
  const pages = data.quadroII?.pages.length ?? 0;
  const draftEntries = data.quadroII?.entries.length ?? 0;
  const machineProposals = (data.quadroII?.pages ?? []).reduce(
    (sum, page) => sum + (page.proposals?.length ?? 0), 0);
  const reading = {
    total: progress?.total ?? 0,
    verified: progress?.reviewed ?? 0,
    needsCorrection: progress?.needsCorrection ?? 0,
    untreated: progress?.untreated ?? 0,
  };
  const checks: UrbanReadinessCheck[] = [
    {
      code: "pdf", title: "Fontes municipais anexadas",
      detail: data.files.usoSolo && data.files.zoneamento
        ? "Uso e Ocupação: " + data.files.usoSolo + ". Zoneamento: " + data.files.zoneamento + ". Vigência ainda depende de revisão."
        : "Cadastre a Lei de Uso e Ocupação e o zoneamento oficial.",
      passed: Boolean(data.files.usoSolo && data.files.zoneamento), quadro: null,
    },
    {
      code: "registry", title: "Acervo jurídico versionado",
      detail: data.versionedLawCount + " norma(s) individualmente registrada(s); o cadastro legado de PDFs não comprova vigência.",
      passed: data.versionedLawCount > 0, quadro: null,
    },
    {
      code: "quadro-i", title: "Quadro I — índices por zona e uso",
      detail: reading.verified + "/" + reading.total + " leitura(s) conferida(s), " +
        reading.needsCorrection + " ressalva(s) e " + reading.untreated + " linha(s) não tratada(s).",
      passed: reading.total > 0 && reading.verified === reading.total &&
        reading.needsCorrection === 0 && reading.untreated === 0, quadro: "I",
    },
    {
      code: "quadro-ii", title: "Quadro II — usos, vagas e condições",
      detail: pages + " página(s), " + machineProposals + " sugestão(ões) não verificadas e " +
        draftEntries + " rascunho(s) registrado(s).",
      passed: pages > 0 && draftEntries > 0 && useImports > 0, quadro: "II",
    },
    {
      code: "imports", title: "Importações jurídicas com fonte",
      detail: numericImports + " registro(s) do Quadro I e " + useImports + " do Quadro II; conferir página, escopo, vigência e hash.",
      passed: numericImports > 0 && useImports > 0, quadro: "I",
    },
    {
      code: "evidence", title: "Evidências por regra e vigência",
      detail: verifiedEvidence + " evidência(s) registradas; " +
        evidencedActive + " versão(ões) real(is) com cobertura de todos os índices, zona, uso e vigência.",
      passed: evidencedActive > 0, quadro: null,
    },
    {
      code: "active", title: "Versões oficiais para pré-conferência",
      detail: officialActive + " versão(ões) não fictícia(s) ativa(s); " +
        fictitiousQA + " regra(s) de teste isolada(s).",
      passed: evidencedActive > 0, quadro: null,
    },
  ];
  return {
    readyForHumanAssistedPrecheck: checks.every((step) => step.passed),
    reading,
    quadroII: { pages, draftEntries, machineProposals },
    counts: { versionedLaws: data.versionedLawCount, numericImports,
      useImports, verifiedEvidence, officialActive, evidencedActive, fictitiousQA },
    checks,
  };
}
