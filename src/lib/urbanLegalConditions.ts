/**
 * SIGAPRO IA: signal detection, NOT statutory interpretation.
 * A keyword must never change a municipal parameter or authorize approval.
 * All citations are scoped by the server-side municipal evidence reader.
 */
import type { UrbanMetric, UrbanRegulationVersion } from "@/lib/urbanPrecheck";
import type { UrbanLegalEvidence } from "@/lib/urbanLegalKnowledge";
import { urbanLegalEvidenceAppliesTo } from "@/lib/urbanLegalScope";

export type UrbanLegalConditionKind =
  | "exception" | "condition" | "external_reference" | "zoning" | "effective_date";
export type UrbanLegalConditionFlag = {
  evidenceId: string;
  metric: UrbanMetric;
  documentTitle: string;
  documentSha256: string;
  page: number;
  excerpt: string;
  kinds: UrbanLegalConditionKind[];
  why: string;
};

function fold(value: string): string {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}
const kinds: ReadonlyArray<{
  kind: UrbanLegalConditionKind; label: string; pattern: RegExp;
}> = [
  {kind:"exception",label:"exceção/dispensa",pattern:/\b(exceto|salvo|ressalvad[oa]s?|dispensad[oa]s?|isencao|excecao|exclu(?:i|em|sao))\b/i},
  {kind:"condition",label:"condição de aplicação",pattern:/\b(desde que|quando|caso|condicionad[oa]s?|depende|sujeit[oa]s?|mediante|observad[oa]s?|somente se)\b/i},
  {kind:"external_reference",label:"remissão a outra norma/tabela",pattern:/\b(conforme|nos termos|de acordo com|tabela|anexo|inciso|paragrafo|outra lei|regulamentacao|decreto)\b/i},
  {kind:"zoning",label:"escopo de zona ou de uso",pattern:/\b(zona|zoneamento|zonas|setor|setores|corredor|uso residencial|uso comercial|uso industrial|uso misto|logradouro|loteamento)\b/i},
  {kind:"effective_date",label:"vigência ou transição",pattern:/\b(vigencia|vigente|revogad[oa]s?|alterad[oa]s?|ate a data|a partir de|transitori[oa]s?|anteriormente)\b/i},
];

/** Always returns an auditable set of signals without determining legal applicability. */
export function classifyUrbanLegalExcerpt(excerpt: string): UrbanLegalConditionKind[] {
  const normal = fold(excerpt.slice(0, 500));
  return kinds.filter(item => item.pattern.test(normal)).map(item => item.kind);
}

/**
 * Only compare internal evidence for the SAME municipality and metric.
 * A matching metric does not prove the citation is from the ACTIVE LAW:
 * that question remains visible and requires human confirmation.
 */
export function findUrbanLegalConditions(
  entries: readonly UrbanLegalEvidence[],
  municipalityId: string,
  regulation: UrbanRegulationVersion | null,
  referenceDate: string = regulation?.effective_from || "",
): UrbanLegalConditionFlag[] {
  if (!regulation || !municipalityId || regulation.municipality_id !== municipalityId) return [];
  const allowed = new Set(regulation.rules.map(x=>x.metric));
  return entries.filter(entry =>
    entry.municipality_id === municipalityId &&
    urbanLegalEvidenceAppliesTo(entry, regulation, referenceDate) &&
    allowed.has(entry.metric) &&
    /^[a-f0-9]{64}$/i.test(entry.document_sha256) &&
    Number.isInteger(entry.page_number) && entry.page_number > 0,
  ).flatMap(entry => {
    const flags = classifyUrbanLegalExcerpt(entry.excerpt);
    if (!flags.length) return [];
    return [{
      evidenceId:entry.id,metric:entry.metric,documentTitle:entry.document_title,
      documentSha256:entry.document_sha256,page:entry.page_number,
      excerpt:entry.excerpt,kinds:flags,
      why:flags.map(x=>kinds.find(k=>k.kind===x)!.label).join(" · "),
    }];
  }).slice(0,151);
}

export type UrbanLegalReviewConfirmation = {
  evidenceIds: string[];
  note: string;
  documentScopeConfirmed: boolean;
};

/** No partial acknowledgement: every flagged citation must be explicitly reviewed. */
export function validateUrbanLegalReview(
  flags: readonly UrbanLegalConditionFlag[],
  review: UrbanLegalReviewConfirmation,
): string | null {
  if (!flags.length) return null;
  if (flags.length > 50) return "O acervo possui mais de 50 referências condicionais; a conferência exige triagem técnica específica antes do registro.";
  if (!review.documentScopeConfirmed) return "Confirme se as citações pertencem à legislação aplicável, à zona, ao uso e à data do processo.";
  if (!review.note.trim() || review.note.trim().length < 20 || review.note.trim().length > 1200) {
    return "Registre fundamentação técnica com 20 a 1200 caracteres para as condições e exceções.";
  }
  const ids = new Set(review.evidenceIds);
  if (flags.some(flag=>!ids.has(flag.evidenceId))) {
    return "Revise e marque todas as referências condicionais antes de registrar a pré-conferência.";
  }
  return null;
}


/** Reviewer-only draft: complete, sourced and explicitly NON-official. */
export function buildUrbanConditionalReviewDraft(
  protocol: string, regulation: UrbanRegulationVersion,
  flags: readonly UrbanLegalConditionFlag[], review: UrbanLegalReviewConfirmation,
): string {
  if (!flags.length) return "";
  return [
    "MINUTA INTERNA — REVISÃO DE CONDIÇÕES E EXCEÇÕES URBANÍSTICAS",
    "O texto não constitui despacho, parecer definitivo nem exigência oficial.",
    "Processo: " + protocol.slice(0,80),
    "Parâmetros de comparação: " + regulation.zone_code + " / " + regulation.use_code +
      "; versão " + regulation.version + "; vigência desde " + regulation.effective_from,
    "Referências potencialmente relacionadas — aplicabilidade CONFERIDA APENAS PELO ANALISTA:",
    ...flags.map((f,index) =>
      String(index+1) + ". " + f.documentTitle.slice(0,120) +
      " · p. " + f.page + " · SHA-256 " + f.documentSha256.slice(0,16) +
      " · " + f.why + " · " + f.excerpt.slice(0,300)),
    "Fundamentação técnica do analista: " + review.note.trim().slice(0,1200),
    "Conferir legislação integral, condições específicas, escala, histórico normativo e processo antes de decidir.",
  ].join("\n\n");
}
