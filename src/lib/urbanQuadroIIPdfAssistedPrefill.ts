import type { UrbanQuadroIISuggestion } from "@/integrations/backend/urbanPrecheckClient";
import { CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID } from "@/lib/urbanOfficialLegalSources";

/**
 * Transcription aids produced from the ORIGINAL 110-page LC 379/2009 PDF,
 * SHA-256 pinned to the municipal QA batch. These are never approved law:
 * subsequent amendments, zoning maps, column relationships and effective
 * dates MUST be reviewed by the municipality before legal activation.
 *
 * The quote is a candidate line from a printed cell, not permission to
 * infer an unprinted zone, numeric standard or missing exception.
 */
export const LC379_QUADRO_II_SHA =
  "68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1";

type Correction = {
  quote?: string;
  parking?: string;
  road?: string;
  conditions?: string;
  pages?: readonly number[];
  warning?: string;
};

// Key is the page of the CATEGORY, not necessarily the page of its values.
const reviewedPdfCandidates: Record<string, Correction> = {
  "38:E1.1": {quote:"1 vaga para cada 50m2, ou fração, de sala de aula",parking:"1 vaga para cada 50 m², ou fração, de sala de aula",road:"N3, E3",conditions:"Embarque e desembarque: no mínimo 1 vaga."},
  "38:E1.2": {quote:"1:7 (pessoas de capacidade de lotação máxima) ou 02 vagas para cada 20m2 de auditório",parking:"1 vaga a cada 7 pessoas da capacidade de lotação máxima ou 2 vagas para cada 20 m² de auditório",road:"N3, E3",conditions:"Vagas para carga: no mínimo 1 vaga."},
  "38:E1.3": {quote:"1vaga para cada 100m2 de área construída ou fração",parking:"1 vaga para cada 100 m² de área construída ou fração",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga. Embarque e desembarque: no mínimo 1 vaga para ambulância."},
  "38:E1.4": {quote:"1vaga para cada 100m2 de área construída ou fração",parking:"1 vaga para cada 100 m² de área construída ou fração",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga."},
  "38:E1.5": {quote:"1vaga para cada 100m2 de área construída ou fração",parking:"1 vaga para cada 100 m² de área construída ou fração",road:"N3, E2, E3",conditions:"Carga: no mínimo 1 vaga. Nota de rodapé: locais de culto de até 50 m² podem estar em via E4 sob medidas de mitigação de impactos."},
  "38:E1.6": {quote:"1vaga para cada 100m2 de área construída ou fração",parking:"1 vaga para cada 100 m² de área construída ou fração",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga."},
  "38:E1.7": {quote:"1vaga para cada 100m2 de área construída ou fração",parking:"1 vaga para cada 100 m² de área construída ou fração",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga."},

  "39:E2.1": {quote:"1 vaga para cada 50m2, ou fração, de sala de aula",parking:"1 vaga para cada 50 m², ou fração, de sala de aula",road:"N2, E2",conditions:"Carga: no mínimo 1 vaga. Embarque/desembarque: 1 vaga a cada 4 salas de aula.",pages:[39,40]},
  "39:E2.2": {quote:"1:15(pessoas de capacidade de lotação máxima) ou 01 vagas para cada 100 m2 de área construída",parking:"1 vaga para cada 15 pessoas ou 1 vaga para cada 100 m² de área construída (nota de estudo técnico)",road:"N2, E1, E1(T)",conditions:"Carga: no mínimo 1 vaga; embarque/desembarque: no mínimo 1 vaga. Asterisco exige estudo e aprovação do órgão responsável.",pages:[39,40],warning:"Conferir leitura parcialmente encoberta do denominador 1:15 no original."},
  "39:E2.3": {quote:"1 vaga para cada 75m2, ou fração",parking:"1 vaga para cada 75 m² ou fração",road:"N2, E1",conditions:"Carga: 1 vaga para cada 250 m² de administração e serviço, no mínimo 1. Desembarque: no mínimo 2 vagas para ambulância.",pages:[39,40]},
  "39:E2.4": {quote:"1 vaga para cada 100m2, ou fração",parking:"1 vaga para cada 100 m² ou fração",road:"N2, E1",conditions:"Carga: 1 vaga para cada 500 m², no mínimo 1.",pages:[39,40]},
  "39:E2.5": {quote:"pessoas – referente a capacidade máxima de lotação",parking:"1 vaga por 10 pessoas da capacidade máxima de lotação (rever impressão)",road:"N2, E1, E2",conditions:"Carga: 1 vaga para cada 500 m², no mínimo 1.",pages:[39,40],warning:"Razão 1:10 parcialmente encoberta: confirmação visual obrigatória."},
  "39:E2.6": {quote:"1 vaga para cada 100m2, ou fração",parking:"1 vaga para cada 100 m² ou fração",road:"N2, E2",conditions:"Carga: 1 vaga para cada 500 m², no mínimo 1.",pages:[39,40]},
  "39:E2.7": {quote:"1 vaga para cada 75m2, ou fração",parking:"1 vaga para cada 75 m² ou fração",road:"N2, E2",conditions:"Embarque e desembarque: no mínimo 1 vaga. Carga exige conferir a célula original.",pages:[39,40]},

  "40:E3.1": {quote:"Faculdade Universidade E similares",parking:"1 vaga para cada 15 m² de área computável em salas de aula (conferir relação impressa)",road:"N2, E1, E1(T)",conditions:"Carga: 1 vaga para cada 100 m² de área administrativa. Embarque: 1 vaga por 500 m² de área construída ou fração.",warning:"Aplicabilidade de E3: lotação acima de 500 pessoas e/ou área construída acima de 2.500 m²."},
  "40:E3.2": {quote:"Auditório para convenções, congressos e conferências",parking:"1 vaga para cada 15 pessoas da lotação máxima (conferir fração impressa)",road:"N2, E1, E1(T)",conditions:"Carga: 1 vaga a cada 250 m², mínimo 1. Embarque: no mínimo 1 vaga.",warning:"Conferir no PDF o denominador por pessoa e o símbolo de m²; não aplicar antes da revisão."},
  "40:E3.3": {quote:"Estádio Esportivo E similares",parking:"1 vaga para cada 15 pessoas sentadas (conferir célula original)",road:"N2, E1, E1(T)",conditions:"Carga: 1 vaga para cada 500 m², mínimo 4. Embarque: mínimo 3 vagas.",warning:"Célula de estacionamento exige confirmação visual."},

  "41:I1": {quote:"Sabões e velas, Condimentos, exceto quando consistir apenas em mistura e embalagem",parking:"Produção: 1 vaga/100 m²; administração: 1 vaga/100 m².",road:"N3 / E1 / E2 (verificar nota *)",conditions:"Carga e descarga: 1 vaga/500 m², mínimo 1. Conferir condições de zoneamento e REPAIIV."},
  "41:I2": {quote:"Indústrias alimentícias, fabricação de material cerâmico, fabricação de artigos de fibrocimento e gesso",parking:"Produção: 1 vaga/100 m²; administração: 1 vaga/50 m².",road:"N3 / E1",conditions:"Carga e descarga: 1 vaga/300 m², mínimo 1. Aplicação excepcional em zona assinalada com * depende do relatório de impacto."},
  "42:I3": {quote:"Indústrias metalúrgicas e mecânicas de grande porte, fusão e fundição",parking:"Produção: 1 vaga/100 m²; administração: 1 vaga/25 m².",road:"N2 / E1",conditions:"Zona impressa: ZI. Carga e descarga: 1 vaga/300 m², mínimo 1."},
  "42:I4": {quote:"Estabelecimentos com características especiais, diretamente relacionados com a exploração das atividades agropecuárias",parking:"A definir em certidão de diretrizes específica emitida pelo órgão municipal responsável.",conditions:"Não existe número genérico de vagas nesta linha: exigir certidão específica para produção, administração e carga."},

  "43:S1.1": {quote:"Engenheiro, arquiteto, advogado, e outros profissionais liberais semelhantes",parking:"Mínimo de 1 vaga (página 44).",road:"N4, E5",conditions:"Carga: 0; desembarque: 0 (continuação na página 44).",pages:[43,44]},
  "43:S1.2": {quote:"Escritórios técnicos profissionais",parking:"1 vaga a cada 75 m² ou fração, mínimo 1 (página 44).",road:"N3, E3",conditions:"Carga: 0; desembarque sem exigência indicada na célula.",pages:[43,44]},
  "43:S1.3": {quote:"Oficinas de reparos e consertos de: aparelhos eletroeletrônicos",parking:"1 vaga a cada 75 m² ou fração, mínimo 1 (página 44).",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga (página 44).",pages:[43,44]},
  "43:S1.4": {quote:"Associações comunitárias de vizinhança",parking:"1 vaga a cada 100 m² ou fração, mínimo 1 (página 44).",road:"N3, E3",conditions:"Carga: 0 (página 44).",pages:[43,44]},
  "43:S1.5": {parking:"1 vaga a cada 50 m² ou fração, mínimo 1 (página 44).",road:"N3, E2, E1(T)",conditions:"Carga: no mínimo 1 vaga (página 44).",pages:[43,44],warning:"Na página 43 as únicas linhas desta coluna são Pensões e Pousada; confirmar trecho literal antes de salvar."},

  "45:S2.1": {quote:"Lab. análises clínicas, químicas",parking:"1 vaga por 50 m² ou fração.",road:"N2, E2"},
  "45:S2.2": {quote:"Cartório e registro civil",parking:"1 vaga por 50 m² ou fração.",road:"N2, E2",conditions:"Carga e descarga: no mínimo 1 vaga."},
  "45:S2.3": {quote:"Academia de ginástica e esporte",parking:"1 vaga por 25 m² ou fração.",road:"N2, E2, E1(T)",conditions:"Carga e descarga: 1 vaga por 100 m² de administração e serviço; embarque/desembarque mínimo 1 vaga."},
  "45:S2.4": {quote:"Diversões eletrônicas",parking:"1 vaga por 50 m² ou fração.",road:"N2, E2",conditions:"Carga e descarga: no mínimo 1 vaga."},
  "45:S2.5": {quote:"Oficinas de reparos e prestação de serviço",parking:"1 vaga por 100 m² ou fração, mínimo 1.",road:"N2, E2",conditions:"Carga e descarga: no mínimo 1 vaga."},

  "46:S3.1": {quote:"Aluguel de máquinas e equipamentos pesados",parking:"1 veículo ou máquina da frota + 1 vaga por 75 m² de área administrativa.",road:"N1, E1, RE e em zona industrial em qualquer via."},
  "46:S3.2": {quote:"Oficinas de consertos e de prestação de serviços de:",parking:"1 vaga para cada 100 m² ou fração.",road:"N1, E1, RE e em zona industrial em qualquer via.",conditions:"Carga: 1 vaga a cada 250 m², mínimo uma vaga."},
  "46:S3.3": {quote:"Depósito de materiais e equipamentos de empresas construtoras",parking:"1 veículo/máquina da frota + 1 vaga por 75 m² administrativos (conferir alternativa para veículos em reparo).",road:"N1, E1, RE e zona industrial em qualquer via.",conditions:"Carga: 1 vaga a cada 250 m², mínimo uma vaga."},

  "47:C1.1": {quote:"Mercearia, laticínios",parking:"1 vaga a cada 75 m² ou fração.",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga. Nota: área construída de até 50 m² admite condição especial para via E4, com mitigação de impactos."},
  "47:C1.2": {quote:"Confeitaria, doceira, bomboniere, sorveteria, rotisserie",parking:"1 vaga a cada 75 m² ou fração.",road:"N3, E3",conditions:"Carga: no mínimo 1 vaga. Nota: área construída de até 50 m² admite condição especial para via E4, com mitigação de impactos."},

  "48:C2.1": {quote:"Artigos esportivos e recreativos"},
  "48:C2.2": {quote:"Pet-shop, produtos de agropecuária"},
  "48:C2.3": {quote:"Comércio e dep. De materiais de construção"},
  "48:C2.4": {quote:"Concessionária de veículos (agência e oficina)"},
  "48:C2.5": {quote:"Postos de Abastecimento e serviços automobilísticos"},
  "48:C2.6": {quote:"Artefatos de borracha, plástico, carvão"},
  "48:C2.7": {parking:"",warning:"Descrição Centro de compras / Shopping Center em células distintas. Validar literalmente as colunas e valores na página 49 antes de preencher vagas.",pages:[48,49]},

  "50:C3.1": {quote:"Comercio atacadista de produtos alimentícios, vestuários",parking:"1 vaga a cada 20 m² de área de venda ou fração.",road:"N2, E1",conditions:"Carga e descarga: 1 vaga para cada 250 m² ou fração."},
  "50:C3.2": {quote:"Alcool, armazenamento de petróleo, carvão, combustível, gás",parking:"1 vaga a cada 50 m² ou fração.",road:"N1",conditions:"Zona impressa: ZI. Carga e descarga: 1 vaga para cada 250 m² ou fração."},
};

export type AssistedQuadroIIPrefill = {
  sourceExcerpt: string;
  roadHierarchy: string;
  parkingRequirement: string;
  specialConditions: string;
  pages: number[];
  hasLiteralCandidate: boolean;
  manualReviewRequired: true;
  warnings: string[];
};

/** Safe fallback: never mistake generated summaries for an actual PDF quote. */
function isSyntheticSummary(text: string): boolean {
  return /categoria identificada|transcri[cç][aã]o n[aã]o validada|campo n[aã]o localizado|texto n[aã]o verificado/i.test(text);
}
export function prepareQuadroIIPdfAssistedPrefill(
  municipalityId: string, documentSha256: string,
  pageNumber: number, proposal: UrbanQuadroIISuggestion,
): AssistedQuadroIIPrefill {
  const trustedSource = municipalityId === CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID &&
    documentSha256 === LC379_QUADRO_II_SHA;
  const override = trustedSource
    ? reviewedPdfCandidates[pageNumber + ":" + proposal.category_code.trim().toUpperCase()]
    : undefined;
  const preferred = override?.quote ||
    (proposal.literal_source_excerpt || "").trim();
  const hasLiteralCandidate = preferred.length >= 20 && !isSyntheticSummary(preferred);
  return {
    sourceExcerpt: hasLiteralCandidate ? preferred.slice(0,1600) : "",
    roadHierarchy: (override?.road ?? proposal.road_hierarchy_text ?? "").slice(0,600),
    parkingRequirement: (override?.parking ?? proposal.parking_requirement_text ?? "").slice(0,600),
    specialConditions: (override?.conditions ?? proposal.special_conditions_text ?? "").slice(0,800),
    pages: [...(override?.pages || proposal.source_pages || [pageNumber])],
    hasLiteralCandidate,
    manualReviewRequired:true,
    warnings: [
      ...(override?.warning ? [override.warning] : []),
      ...(proposal.field_warnings || []),
      "Texto pré-preenchido por leitura assistida do PDF; não constitui prova de vigência ou autorização de uso por zona.",
      ...(hasLiteralCandidate ? [] : ["Trecho literal insuficiente: ainda não salvar como transcrição conferida."]),
    ],
  };
}
