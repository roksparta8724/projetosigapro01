import { BookOpenCheck, ExternalLink, ShieldAlert } from "lucide-react";
import {
  CAMPO_LIMPO_QUADRO_I_ORIGINAL, CAMPO_LIMPO_QUADRO_I_ORIGINAL_URL,
  CAMPO_LIMPO_QUADRO_I_READING_CAVEATS,
} from "@/lib/campoLimpoQuadroIOriginal";

/** Legible transcription of the ORIGINAL law; no data writes or activation. */
export function CampoLimpoQuadroIOriginalPanel() {
  return (
    <details data-urban-original-quadro-i="true"
      className="mt-4 min-w-0 overflow-hidden rounded-xl border border-sky-200 bg-white dark:border-sky-700 dark:bg-slate-950">
      <summary className="cursor-pointer px-4 py-4 text-slate-950 dark:text-white">
        <span className="flex items-start gap-2">
          <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
          <span className="min-w-0">
            <strong className="block break-words text-sm font-extrabold">
              Quadro I original de 2009 — 23 linhas transcritas para conferência
            </strong>
            <span className="mt-1 block text-xs leading-5 text-slate-700 dark:text-slate-200">
              Leitura de referência das páginas 36 e 37; não é consolidação legal vigente.
              A célula “01” da AIU (2) permanece isolada como ambígua.
            </span>
          </span>
        </span>
      </summary>
      <div className="border-t border-slate-200 p-4 dark:border-slate-700">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <ShieldAlert className="mr-1 inline h-4 w-4" />
          Estes são valores literais de uma tabela histórica. Não preenchem normas,
          não substituem anexos alterados e NÃO autorizam aprovar projetos ou liberar IA.
        </div>
        <a href={CAMPO_LIMPO_QUADRO_I_ORIGINAL_URL} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-100">
          <ExternalLink className="h-4 w-4" /> Comparar com o PDF original da Câmara
        </a>
        <div tabIndex={0} role="region" aria-label="Tabela histórica do Quadro I, com rolagem horizontal"
          className="mt-3 max-w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[1350px] border-collapse text-left text-xs text-slate-800 dark:text-slate-100">
            <caption className="sr-only">
              Transcrição visual para conferência, sem valor de aprovação legal
            </caption>
            <thead className="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
              <tr>
                {["Nº", "Página", "Zona", "Uso", "CA mínimo", "CA básico", "CA máximo",
                  "TO máx. %", "TP mín. %", "Lote mín. m²", "Testada mín. m",
                  "Gabarito original", "Recuo frontal m", "Fundos m", "Lateral m", "Exceção lateral"].map((label) => (
                  <th key={label} scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold dark:border-slate-700">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAMPO_LIMPO_QUADRO_I_ORIGINAL.map((row) => (
                <tr key={row.ordinal} data-urban-original-quadro-row={row.ordinal}
                  className={row.readingStatus === "ambiguous_original"
                    ? "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-t border-slate-100 bg-white even:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:even:bg-slate-900"}>
                  <td className="px-3 py-2 font-bold">{row.ordinal}</td>
                  <td className="px-3 py-2">{row.pdfPage}</td>
                  <td className="px-3 py-2 font-semibold">{row.zone}</td>
                  <td className="px-3 py-2">{row.use}</td>
                  <td className="px-3 py-2 font-bold">
                    {row.caMinimumLiteral}
                    {row.readingStatus === "ambiguous_original" ? (
                      <span className="ml-2 whitespace-nowrap rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                        leitura ambígua
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{row.caBasicLiteral}</td>
                  <td className="px-3 py-2">{row.caMaximumLiteral}</td>
                  <td className="px-3 py-2">{row.maximumOccupancyPercentLiteral}</td>
                  <td className="px-3 py-2">{row.minimumPermeabilityPercentLiteral}</td>
                  <td className="px-3 py-2">{row.minimumParcelAreaM2Literal}</td>
                  <td className="px-3 py-2">{row.minimumFrontageMLiteral}</td>
                  <td className="max-w-[220px] px-3 py-2">{row.maximumHeightLiteral}</td>
                  <td className="px-3 py-2">{row.frontSetbackMLiteral}</td>
                  <td className="px-3 py-2">{row.rearSetbackMLiteral}</td>
                  <td className="px-3 py-2">{row.lateralSetbackMLiteral}</td>
                  <td className="max-w-[150px] px-3 py-2">{row.lateralExceptionLiteral || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
          {CAMPO_LIMPO_QUADRO_I_READING_CAVEATS.map((note) => (
            <p key={note}>• {note}</p>
          ))}
        </div>
      </div>
    </details>
  );
}
