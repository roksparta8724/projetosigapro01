/**
 * Independent human-readable transcription of the ORIGINAL Quadro I of
 * LC 379/2009, pp. 36-37 in the official Câmara PDF (pdf index 35-36).
 * This is a READING REFERENCE ONLY, never an executable urban regulation.
 * It does not establish current legal scope or override later amendments.
 *
 * Official source: https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1830/
 */
export const CAMPO_LIMPO_QUADRO_I_ORIGINAL_URL =
  "https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1830/";

export type OriginalQuadroIRow = {
  ordinal: number;
  pdfPage: number;
  zone: string;
  use: string;
  caMinimumLiteral: string;
  caBasicLiteral: string;
  caMaximumLiteral: string;
  maximumOccupancyPercentLiteral: string;
  minimumPermeabilityPercentLiteral: string;
  minimumParcelAreaM2Literal: string;
  minimumFrontageMLiteral: string;
  maximumHeightLiteral: string;
  frontSetbackMLiteral: string;
  rearSetbackMLiteral: string;
  lateralSetbackMLiteral: string;
  lateralExceptionLiteral: string;
  readingStatus: "original_legible" | "ambiguous_original";
};

/* Values are literal strings, not number inputs. No decimal normalisation,
 * approval, or calculation can use these rows.
 * Fields: page, zone, use, CA min/basic/max, TO, TP, lot, frontage,
 * height, front/rear/side setbacks, side condition.
 */
type OriginalTuple = readonly [
  number, string, string, string, string, string, string, string,
  string, string, string, string, string, string, string,
];
const W = "largura da via da testada + recuo";
const W0 = "largura da via da testada";
const P2 = "2 pavimentos";
const D = "2 m, recuo único";
const rows: readonly OriginalTuple[] = [
  [36,"ZM-B(e)","comercial","0,05","0,5","1","50","70","3000","30",W,"10","8","5",""],
  [36,"ZM-B(e)","residencial","0,02","0,1","0,6","30","80","3000","30",P2,"10","8","4",""],
  [36,"ZM-B1","comercial","0,05","0,5","1","50","70","5000","50",W,"10","8","5",""],
  [36,"ZM-B1","residencial","0,02","0,1","0,6","30","80","5000","50",P2,"10","8","4",""],
  [36,"ZM-B2","comercial","0,05","0,5","1","50","70","3000","30",W,"10","8","5",""],
  [36,"ZM-B2","residencial","0,02","0,1","0,6","30","80","3000","30",P2,"10","8","4",""],
  [36,"ZM-B3(A) e ZM-B3(B)","comercial","0,05","0,5","1","50","70","10000","80",P2,"15","10","6",""],
  [36,"ZM-B3(A) e ZM-B3(B)","residencial","0,02","0,1","0,6","30","80","10000","80",P2,"15","10","6",""],
  [36,"ZM-MB(1)","comercial","0,2","1","2","50","60","1500","30",W,"5","5","3",""],
  [36,"ZM-MB(1)","residencial","0,2","1","1,5","30","60","1500","30",P2,"7","5","3",""],
  [36,"ZM-MB(2) e ZM-MB(3)","comercial","0,2","1","2","60","60","1250","25",W,"5","5","3",""],
  [36,"ZM-MB(2) e ZM-MB(3)","residencial","0,2","1","1,5","40","60","1250","25",P2,"7","5","3",""],
  [36,"ZM-MA(1,2,3,4)","comercial","0,25","1","2","64","35","250","10",W0,"5","0","1,5",D],
  [36,"ZM-MA(1,2,3,4)","residencial","0,25","1","1,5","64","35","250","10",W0,"5","0","1,5",D],
  [37,"ZM-MA(1,2,3,4)","fração total residencial","0,25","1","2","60","35","200","15",W,"5","3","3",""],
  [37,"ZM-MA(1,2,3,4)","fração total comercial","0,25","1","2","70","35","100","15",W,"5","3","3",""],
  [37,"ZC","residencial","0,25","1","1,5","64","30","250","10",W,"5","0","1,5",D],
  [37,"ZC","comercial","0,25","1","1,5","64","30","250","10",W,"5","0","1,5",D],
  [37,"ZC","fração total residencial","0,25","1","1,5","60","30","150","15",W,"5","3","3",""],
  [37,"ZC","fração total comercial","0,25","1","1,5","70","30","100","15",W,"5","3","3",""],
  [37,"AIU (1)","comercial e residencial","0,1","1","1","60","35","250","10",P2,"5","0","1,5",D],
  // This original cell reads literally "01". Do NOT coerce to 1, 0.1 or 0.01.
  [37,"AIU (2)","comercial e residencial","01","1","1","40","35","5000","50",P2,"10","8","4",""],
  [37,"ZI","industrial","0,25","1,2","2","60","30","1250","25","3 pavimentos","8","3","4","6 m, recuo único"],
];

export const CAMPO_LIMPO_QUADRO_I_ORIGINAL: readonly OriginalQuadroIRow[] = rows.map((row, index) => ({
  ordinal: index + 1, pdfPage: row[0], zone: row[1], use: row[2],
  caMinimumLiteral: row[3], caBasicLiteral: row[4], caMaximumLiteral: row[5],
  maximumOccupancyPercentLiteral: row[6], minimumPermeabilityPercentLiteral: row[7],
  minimumParcelAreaM2Literal: row[8], minimumFrontageMLiteral: row[9],
  maximumHeightLiteral: row[10], frontSetbackMLiteral: row[11],
  rearSetbackMLiteral: row[12], lateralSetbackMLiteral: row[13],
  lateralExceptionLiteral: row[14],
  readingStatus: row[3] === "01" ? "ambiguous_original" : "original_legible",
}));

export const CAMPO_LIMPO_QUADRO_I_READING_CAVEATS = [
  "A célula de CA mínimo da AIU (2) é graficamente '01' no PDF da LC 379/2009; permanece indeterminada.",
  "ZEIS e ZEPAM remetem à legislação específica, sem parâmetros numéricos gerais no Quadro I.",
  "As quatro observações de recuos após a tabela e o Anexo III podem alterar a aplicação de um valor a um caso concreto.",
  "A expressão 'largura da via da testada + recuo' não representa altura fixa em metros.",
  "A LC 440/2011, art. 69-B, prevê análise excepcional de recuos para determinados imóveis existentes com lote ou testada abaixo do mínimo; não substituir os valores do Quadro I sem confirmar o enquadramento.",
  "A LC 440/2011, art. 77-A, traz hipótese excepcional de hierarquia viária condicionada à análise municipal e oitiva do Conselho das Cidades.",
  "A LC 473/2014 trata de ZEIS, habitação de interesse social e outras condições especiais, cuja aplicabilidade após a LC 566/2022 necessita avaliação jurídica específica.",
  "Este é o texto original de 2009, NÃO uma consolidação da vigência após as alterações municipais.",
] as const;
