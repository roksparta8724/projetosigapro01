import { useEffect, useState } from "react";
import { BookOpenCheck, FileCheck2, FileText, Layers3, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  listUrbanMatrixBatches,
  listUrbanMatrixReadingAudit,
  listUrbanQuadroIIWorkspace,
} from "@/integrations/backend/urbanPrecheckClient";

type LiveTotals = {
  batches: number | null;
  rows: number | null;
  reviews: number | null;
  pages: number | null;
  proposals: number | null;
  quadroTwoStatus: string | null;
};
const empty: LiveTotals = {
  batches: null, rows: null, reviews: null, pages: null, proposals: null,
  quadroTwoStatus: null,
};
type LegacyFile = { name: string; label: string };

/**
 * Existing legal work is stored across the original institutional PDF fields,
 * the Quadro I matrix and reading audits, and the Quadro II page evidence.
 * None of those data sources belongs to the new individual-PDF registry table.
 * This panel reads those existing records; it never writes or activates rules.
 */
export function UrbanLegislationContinuityPanel({
  municipalityId,
  legacyFiles,
}: {
  municipalityId: string;
  legacyFiles: LegacyFile[];
}) {
  const [totals, setTotals] = useState<LiveTotals>(empty);
  const [pending, setPending] = useState(true);
  const [warning, setWarning] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!municipalityId) {
      setTotals(empty);
      setWarning("");
      setPending(false);
      return;
    }
    let current = true;
    setTotals(empty);
    setWarning("");
    setPending(true);
    void Promise.allSettled([
      listUrbanMatrixBatches(municipalityId),
      listUrbanMatrixReadingAudit(municipalityId),
      listUrbanQuadroIIWorkspace(municipalityId),
    ]).then(([batches, audit, quadroTwo]) => {
      if (!current) return;
      setTotals({
        batches: batches.status === "fulfilled" ? batches.value.length : null,
        rows: batches.status === "fulfilled"
          ? batches.value.reduce((sum, batch) => sum + batch.total_rows, 0) : null,
        reviews: audit.status === "fulfilled" ? audit.value.row_reviews.length : null,
        pages: quadroTwo.status === "fulfilled" ? quadroTwo.value.pages.length : null,
        proposals: quadroTwo.status === "fulfilled"
          ? quadroTwo.value.pages.reduce((sum, page) => sum + page.proposals.length, 0) : null,
        quadroTwoStatus: quadroTwo.status === "fulfilled" ? quadroTwo.value.status : null,
      });
      const failures = [batches, audit, quadroTwo].filter((result) => result.status === "rejected").length;
      if (failures) setWarning(
        "Não foi possível consultar todas as fontes do banco. Isso NÃO significa que algum documento foi excluído. " +
        "Atualize os dados e confira a prefeitura selecionada.",
      );
    }).finally(() => {
      if (current) setPending(false);
    });
    return () => { current = false; };
  }, [municipalityId, refreshToken]);

  function openSection(section: "I" | "II" | "legacy") {
    if (section === "legacy") {
      document.getElementById("sigapro-legal-archive-upload")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const target = document.getElementById(section === "I"
      ? "sigapro-quadro-i-tab" : "sigapro-quadro-ii-tab");
    if (!target) {
      setWarning("O painel dos Quadros ainda não foi carregado. Atualize os dados e tente novamente.");
      return;
    }
    target.click();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const metric = (value: number | null, suffix: string) =>
    value === null ? (pending ? "Consultando..." : "Indisponível") : value + " " + suffix;

  return (
    <section data-urban-work-preservation="true"
      className="min-w-0 overflow-hidden rounded-[22px] border border-sky-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 break-words text-sm font-extrabold text-slate-950 dark:text-white">
            <ShieldCheck className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
            Trabalhos e documentos já cadastrados
          </h3>
          <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-slate-600 dark:text-slate-200">
            Consulta ao acervo anterior no Neon, independente do novo cadastro individual de leis.
            Uma lista vazia no cadastro novo não apaga históricos, matrizes ou PDFs antigos.
          </p>
        </div>
        <button type="button" disabled={pending}
          onClick={() => setRefreshToken((token) => token + 1)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar registros
        </button>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <FileCheck2 className="h-4 w-4 shrink-0" /> PDFs do acervo antigo
          </div>
          <p className="mt-2 break-words text-lg font-extrabold text-slate-950 dark:text-white">
            {legacyFiles.length} {legacyFiles.length === 1 ? "referência" : "referências"}
          </p>
          <p className="mt-1 break-words text-[11px] leading-5 text-slate-600 dark:text-slate-300">
            {legacyFiles.length
              ? legacyFiles.map((item) => item.name).join(" · ")
              : "Nenhum arquivo carregado nesta sessão; confira os campos institucionais"}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <BookOpenCheck className="h-4 w-4 shrink-0" /> Quadro I — matrizes
          </div>
          <p className="mt-2 break-words text-lg font-extrabold text-slate-950 dark:text-white">
            {metric(totals.rows, "linhas")}
          </p>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {metric(totals.batches, "lote(s)")} · {metric(totals.reviews, "conferência(s)")}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <Layers3 className="h-4 w-4 shrink-0" /> Quadro II — leitura
          </div>
          <p className="mt-2 text-lg font-extrabold text-slate-950 dark:text-white">
            {metric(totals.pages, "páginas")}
          </p>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {metric(totals.proposals, "sugestões não validadas")}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-200">
            <FileText className="h-4 w-4 shrink-0" /> Situação jurídica
          </div>
          <p className="mt-2 text-sm font-extrabold text-amber-950 dark:text-amber-100">
            Conferência legal pendente
          </p>
          <p className="mt-1 text-[11px] leading-5 text-amber-900 dark:text-amber-200">
            Nenhum texto OCR ou norma fictícia é aprovado automaticamente para uso da IA.
          </p>
        </div>
      </div>

      {warning ? (
        <p role="alert" className="mt-3 break-words rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          {warning}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => openSection("I")}
          className="min-h-10 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
          Abrir Quadro I e conferências
        </button>
        <button type="button" onClick={() => openSection("II")}
          className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
          Abrir Quadro II
        </button>
        <button type="button" onClick={() => openSection("legacy")}
          className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
          Ver PDFs anteriores
        </button>
      </div>
    </section>
  );
}
