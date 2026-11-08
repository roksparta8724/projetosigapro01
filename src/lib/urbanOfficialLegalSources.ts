/**
 * Curated public OFFICIAL reading links for Campo Limpo Paulista.
 * External PDFs are NOT uploaded to R2, NOT transcribed into Neon,
 * NOT a consolidated legal opinion, and NEVER become AI rules.
 * Every item still needs a verified municipality-bound legal evidence scope.
 *
 * Sources checked against Câmara Municipal and the digitally signed DIOE
 * edition nº 589 (10/04/2026) and nº 629 (18/08/2026).
 */
export const CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID =
  "49dac0b6-6352-4744-9aab-9ff91c59d970";

export type UrbanOfficialLegalSource = {
  id: string;
  title: string;
  kind: "base" | "alteracao" | "restauracao_vigencia" | "procedimento_especial" | "proposta_sem_vigencia";
  documentLabel: string;
  pdfUrl: string | null;
  officialPageUrl: string;
  scopeNote: string;
  readingNote: string;
};

export const CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES: readonly UrbanOfficialLegalSource[] = [
  {
    id: "lc-379-2009",
    title: "LC 379/2009 — Parcelamento, Uso e Ocupação do Solo",
    kind: "base",
    documentLabel: "PDF original da Câmara (110 páginas; inclui quadros e anexos)",
    pdfUrl: "https://camaracampolimpo.sp.gov.br/legislacao/download-lei/1830/",
    officialPageUrl: "https://camaracampolimpo.sp.gov.br/legislacao/detalhe/1830/institui-a-lei-complementar-de-parcelamento-uso-e-ocupacao-do-solo-de-campo-limpo-paulista/",
    scopeNote: "Base histórica dos Quadros I e II, zoneamento e recuos. O PDF original não é texto consolidado.",
    readingNote: "Conferir as modificações posteriores, o mapa e as exceções antes de transcrever índices.",
  },
  {
    id: "lc-440-2011",
    title: "LC 440/2011 — Alteração da LC 379/2009",
    kind: "alteracao",
    documentLabel: "PDF original da Câmara (11 páginas)",
    pdfUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1889/",
    officialPageUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/detalhe/1889/altera-a-lei-complementar-de-parcelamento-uso-e-ocupacao-do-solo-do-municipio-de-campo-limpo-paulista-instituida-pela-lei-complementar-n-379-de-24-de-novembro-de-2009-/",
    scopeNote: "Altera artigos da lei de parcelamento, incluindo condições de declividade e parcelamento.",
    readingNote: "Não usar a redação original de artigo que foi alterado sem confrontar este PDF.",
  },
  {
    id: "lc-473-2014",
    title: "LC 473/2014 — Outra alteração da LC 379/2009",
    kind: "alteracao",
    documentLabel: "PDF original da Câmara (7 páginas)",
    pdfUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1928/",
    officialPageUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/detalhe/1928/altera-a-lei-complementar-de-parcelamento-uso-e-ocupacao-do-solo-do-municipio-de-campo-limpo-paulista-instituida-pela-lei-complementar-n-379-de-24-de-novembro-de-2009-com-suas-alteracoes/",
    scopeNote: "Altera definições e dispositivos sobre parcelamento e habitação de interesse social.",
    readingNote: "Altera definições e dispositivos sobre parcelamento e ZEIS. A LC 566/2022 não a cita expressamente na lista de alterações repristinadas; manter ressalva de enquadramento até conferência jurídica."
  },
  {
    id: "lc-501-2016",
    title: "LC 501/2016 — Alteração do artigo 76 da LC 379/2009",
    kind: "alteracao",
    documentLabel: "PDF original da Câmara; alteração dos incisos I e II do artigo 76",
    pdfUrl: "https://www.camaracampolimpo.sp.gov.br/public/legislacao/download-lei/1948/",
    officialPageUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/detalhe/1948/altera-os-incisos-i-e-ii-do-artigo-76-da-lei-complementar-no-379-de-24-de-novembro-de-2009-que-instituiu-as-normas-de-parcelamento-uso-e-ocupacao-do-solo-de-campo-limpo-paulista/",
    scopeNote: "Altera os incisos I e II do artigo 76 sobre loteamentos e controle de acesso.",
    readingNote: "Aplicar somente ao dispositivo e modalidade pertinentes; não substituir índices do Quadro I.",
  },
  {
    id: "lc-566-2022",
    title: "LC 566/2022 — Revogação de 535/2019 e 548/2019 e restauração normativa",
    kind: "restauracao_vigencia",
    documentLabel: "PDF da Câmara; art. 1º sobre revogação e repristinação",
    pdfUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/2024/",
    officialPageUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/detalhe/2024/revoga-a-lei-complementar-n-535-de-17-de-maio-de-2019-e-sua-alteracao-processada-pela-lei-complementar-n-548-de-13-de-dezembro-de-2019-que-institui-o-novo-plano-diretor-e-uso-e-ocupacao-do-solo-do-municipio-de-campo-limpo-paulista-nos-termos-do-artigo-182-da-constituicao-federal-e-do-ca/",
    scopeNote: "Art. 1º revoga as LCs 535 e 548/2019 e restaura expressamente a LC 379/2009, com 440/2011 e 501/2016. A situação da LC 473/2014 precisa ser conferida individualmente, pois não é citada nessa enumeração.",
    readingNote: "Usar para investigar a vigência histórica; não presumir redação consolidada ou eliminar a verificação da LC 613/2023.",
  },
  {
    id: "lc-613-2023",
    title: "LC 613/2023 — Plano Diretor Estratégico",
    kind: "base",
    documentLabel: "PDF da Câmara (arquivo grande, aproximadamente 65 MB)",
    pdfUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/2073/",
    officialPageUrl: "https://www.camaracampolimpo.sp.gov.br/legislacao/detalhe/2073/institui-o-novo-plano-diretor-do-municipio-de-campo-limpo-paulista-nos-termos-do-artigo-182-da-constituicao-federal-da-lei-10257-de-10-de-julho-de-2001-estatuto-da-cidade-e-dos-objetivos-de-desenvolvimento-sustentavel-2030-da-uno/",
    scopeNote: "Diretrizes do Plano Diretor; substitui o Plano Diretor anterior LC 302/2006.",
    readingNote: "Confrontar diretrizes e mapas com as normas de uso do solo; não presumir substituição integral da LC 379.",
  },
  {
    id: "lc-655-2026",
    title: "LC 655/2026 — Direito real de laje",
    kind: "procedimento_especial",
    documentLabel: "PDF certificado: Diário Oficial 589/2026, desde a página 3",
    pdfUrl: "https://www.dosp.com.br/exibe_do.php?i=ODAzMzc5#page=3",
    officialPageUrl: "https://www.dosp.com.br/leituratexto?p=MjU4MDQyNg%3D%3D",
    scopeNote: "Exclusiva para direito real de laje e regularização vinculada, quando cabível.",
    readingNote: "Não aplicar automaticamente a novos projetos ordinários ou a todas as obras.",
  },
  {
    id: "lc-656-2026",
    title: "LC 656/2026 — Regularização extraordinária",
    kind: "procedimento_especial",
    documentLabel: "PDF certificado: Diário Oficial 589/2026, desde a página 4",
    pdfUrl: "https://www.dosp.com.br/exibe_do.php?i=ODAzMzc5#page=4",
    officialPageUrl: "https://www.dosp.com.br/leituratexto?p=MjU4MDQyNw%3D%3D",
    scopeNote: "Somente para regularização extraordinária de situações consolidadas, sujeita aos requisitos da lei.",
    readingNote: "Seu índice específico de permeabilidade não substitui o índice de uma obra nova.",
  },
  {
    id: "decreto-7548-2026",
    title: "Decreto 7.548/2026 — Procedimento de direito real de laje",
    kind: "procedimento_especial",
    documentLabel: "PDF certificado: Diário Oficial 629/2026, desde a página 3",
    pdfUrl: "https://www.dosp.com.br/exibe_do.php?i=ODY0MTcx#page=3",
    officialPageUrl: "https://www.dosp.com.br/leituratexto?p=Mjc1MjE4Mg%3D%3D",
    scopeNote: "Regulamenta a LC 655/2026 e seu fluxo documental específico.",
    readingNote: "Exige identificação expressa da modalidade do processo e controle de checklist especial.",
  },
  {
    id: "decreto-7550-2026",
    title: "Decreto 7.550/2026 — Procedimento de regularização",
    kind: "procedimento_especial",
    documentLabel: "PDF certificado: Diário Oficial 629/2026, desde a página 4",
    pdfUrl: "https://www.dosp.com.br/exibe_do.php?i=ODY0MTcx#page=4",
    officialPageUrl: "https://www.dosp.com.br/leituratexto?p=Mjc1MTkyNg%3D%3D",
    scopeNote: "Regulamenta o programa extraordinário da LC 656/2026.",
    readingNote: "Não mudar os índices gerais e o workflow de aprovação ordinária por este decreto.",
  },
  {
    id: "minuta-lpuos-2026",
    title: "Minuta municipal 2026 — revisão proposta da LPUOS",
    kind: "proposta_sem_vigencia",
    documentLabel: "Minuta e quadros de revisão divulgados pela Prefeitura; sem lei promulgada comprovada.",
    pdfUrl: null,
    officialPageUrl: "https://www.campolimpopaulista.sp.gov.br/leis-urbanisticas",
    scopeNote: "MATERIAL DE DISCUSSÃO: o portal municipal identifica expressamente como MINUTA 2026.",
    readingNote: "Não utilizar quadros ou mapas desta minuta como índice legal vigente nem confundir com a LC 379/2009.",
  },
  {
    id: "plc-795-2024",
    title: "PLC 795/2024 — Revisão proposta da LC 379",
    kind: "proposta_sem_vigencia",
    documentLabel: "Consulta de tramitação; proposta retirada pelo autor em 16/01/2025",
    pdfUrl: null,
    officialPageUrl: "https://camaracampolimpo.sp.gov.br/projeto/detalhe/11/pinstitui-a-nova-lei-complementar-de-parcelamento-uso-e-ocupacao-do-solo-do-municipio-de-campo-limpo-paulista-apos-a-revisao-da-lei-complementar-n-3792009-e-suas-alteracoes-e-sua-posterior-revogacaop/",
    scopeNote: "PROPOSTA RETIRADA; não se trata de lei promulgada nem norma aplicável.",
    readingNote: "Nunca converter os quadros, minuta ou mapas desta proposta em regras ativas.",
  },
] as const;

export function getMunicipalOfficialUrbanSources(
  municipalityId: string | null | undefined,
): readonly UrbanOfficialLegalSource[] {
  return municipalityId === CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID
    ? CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES
    : [];
}
