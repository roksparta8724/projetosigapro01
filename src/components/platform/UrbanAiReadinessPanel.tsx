import { useEffect, useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeUrbanLegalAuditInvalidations } from "@/lib/urbanLegalAuditEvents";
import { isUrbanMatrixBatchArchived } from "@/lib/urbanMatrixBatchStatus";
import { listLawRegistry } from "@/integrations/backend/urbanLegislationRegistryClient";
import {
  listUrbanMatrixBatches, readUrbanMatrixBatch, listUrbanMatrixReadingAudit,
  listUrbanQuadroIIWorkspace, listUrbanRegulations, listUrbanLegalMatrixImports,
  listUrbanVerifiedEvidenceScopes,
} from "@/integrations/backend/urbanPrecheckClient";
import {
  assessUrbanAiReadiness, OTHER_REQUIRED_URBAN_FIELDS,
  type MunicipalLegalFiles, type UrbanReadinessSummary,
} from "@/lib/urbanAiReadiness";

const NEXT_ACTIONS: Record<string, {
  label: string; owner: string; target: "pdfs" | "registry" | "quadros-i" | "quadros-ii" | "versions" | "evidence";
}> = {
  pdf: { label: "Conferir documentos oficiais", owner: "Admin da Prefeitura", target: "pdfs" },
  registry: { label: "Cadastrar lei e alterações", owner: "Admin da Prefeitura", target: "registry" },
  "quadro-i": { label: "Conferir linhas com ressalva", owner: "Setor urbanístico", target: "quadros-i" },
  "quadro-ii": { label: "Revisar usos e condições", owner: "Setor urbanístico / jurídico", target: "quadros-ii" },
  imports: { label: "Conferir e versionar por zona", owner: "Setor urbanístico / jurídico", target: "quadros-ii" },
  evidence: { label: "Conferir evidências por índice", owner: "Setor urbanístico / jurídico", target: "evidence" },
  active: { label: "Verificar ativação supervisionada", owner: "Responsável legal habilitado", target: "versions" },
};

/** Read-only, live, tenant-scoped audit. Never writes or activates a law. */
export function UrbanAiReadinessPanel({
  municipalityId, documents, onOpenQuadro, revision = 0,
}: {
  municipalityId: string;
  documents: MunicipalLegalFiles;
  onOpenQuadro: (quadro: "I" | "II") => void;
  revision?: number;
}) {
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<UrbanReadinessSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [navigationNotice, setNavigationNotice] = useState("");

  useEffect(() => subscribeUrbanLegalAuditInvalidations((changedMunicipalityId) => {
    if (changedMunicipalityId === municipalityId) setRefresh((value) => value + 1);
  }), [municipalityId]);

  const openNextStep = (
    target: "pdfs" | "registry" | "quadros-i" | "quadros-ii" | "versions" | "evidence",
  ) => {
    setNavigationNotice("");
    if (target === "quadros-i" || target === "quadros-ii") {
      onOpenQuadro(target === "quadros-i" ? "I" : "II");
    }
    // Navigation is intentionally user-initiated. Never scroll on polling or
    // execute legal writes just because a task was opened.
    window.requestAnimationFrame(() => {
      let node: Element | null = null;
      if (target === "pdfs") {
        node = document.querySelector('[data-legal-archive="true"]');
      } else if (target === "registry") {
        node = document.querySelector('[data-urban-legislation-registry="true"]');
      } else if (target === "quadros-i" || target === "quadros-ii") {
        node = document.querySelector('[data-urban-quadros-workspace="true"]');
      } else {
        const versions = document.querySelector('[data-urban-regulation-versions="true"]');
        const evidence = document.querySelector<HTMLDetailsElement>(
          'details[data-urban-regulation-evidence="true"]',
        );
        if (target === "evidence" && evidence) {
          evidence.open = true;
          node = evidence;
        } else {
          // Without a real legal version, the evidence form cannot exist.
          // Point authorized staff to the DRAFT editor instead of a dead end.
          const editor = document.querySelector<HTMLDetailsElement>(
            'details[data-urban-legal-editor="true"]',
          );
          if (!evidence && editor) {
            editor.open = true;
            node = editor;
            setNavigationNotice(
              "Cadastre primeiro uma versão jurídica em rascunho. Depois vincule os trechos e páginas oficiais a cada índice, sem ativar automaticamente.",
            );
          } else {
            node = versions;
          }
        }
      }
      if (!node) {
        setNavigationNotice(
          "Esta etapa não está disponível para o perfil ou o município selecionado. Consulte o administrador da Prefeitura ou atualize a página de legislação.",
        );
        return;
      }
      node.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError("");
    if (!municipalityId) return;
    setLoading(true);
    void (async () => {
      const [batches, audit, quadroII, imports, evidences, regulations, registry] =
        await Promise.all([
          listUrbanMatrixBatches(municipalityId),
          listUrbanMatrixReadingAudit(municipalityId),
          listUrbanQuadroIIWorkspace(municipalityId),
          listUrbanLegalMatrixImports(municipalityId),
          listUrbanVerifiedEvidenceScopes(municipalityId),
          listUrbanRegulations(municipalityId),
          listLawRegistry(municipalityId),
        ]);
      const activeBatch = batches.find((batch) =>
        !isUrbanMatrixBatchArchived(audit.batch_events, batch.id)) ?? null;
      const source = activeBatch
        ? await readUrbanMatrixBatch(municipalityId, activeBatch.id) : null;
      return assessUrbanAiReadiness({
        files: documents, source, audits: audit.row_reviews,
        quadroII, matrixImports: imports, verifiedEvidence: evidences,
        regulations, versionedLawCount: registry.total,
      });
    })().then((next) => {
      if (!cancelled) setReport(next);
    }).catch((cause: unknown) => {
      if (!cancelled) setError("Não foi possível consultar todas as fontes do banco municipal: " +
        String((cause as Error)?.message || cause));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Document replacements and reviewed rows must invalidate the audit.
  }, [municipalityId, documents.usoSolo, documents.zoneamento,
    documents.planoDiretor, documents.leisComplementares, refresh, revision]);

  return (
    <section data-urban-ai-readiness="true"
      className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-sky-200 bg-white p-4 text-slate-900 shadow-sm dark:border-sky-700 dark:bg-slate-950 dark:text-white md:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
            <BookOpenCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            Auditoria de prontidão da IA — dados reais da Prefeitura
          </h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700 dark:text-slate-200">
            Fontes, Quadros I e II, vigência, versões e evidências jurídicas.
            A transcrição de uma página não constitui aprovação legal.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar auditoria
        </Button>
      </div>
      {loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" /> Consultando o banco municipal...
      </p> : null}
      {navigationNotice ? <p role="status" data-urban-navigation-feedback="true"
        className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-100">
        {navigationNotice}
      </p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-950 dark:border-rose-500/50 dark:bg-slate-900 dark:text-rose-200">
        {error} Nenhuma conferência pode ser dada como concluída com consultas incompletas.
      </p> : null}
      {report && !error && !loading ? <>
        <div data-urban-ai-readiness-summary="true"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-100">
          <strong className="flex items-center gap-2">
            {report.readyForHumanAssistedPrecheck ?
              <CheckCircle2 className="h-4 w-4" /> :
              <AlertTriangle className="h-4 w-4" />}
            {report.readyForHumanAssistedPrecheck ?
              "Base apta para pré-conferência assistida e supervisionada" :
              "Base legal incompleta — sem liberação automática"}
          </strong>
          <p className="mt-1 text-xs leading-5">
            Quadro I: {report.reading.verified}/{report.reading.total} leituras conferidas.
            {" "}Ressalvas: {report.reading.needsCorrection}.
            {" "}Quadro II: {report.quadroII.draftEntries} rascunhos.
            {" "}Regras reais ativas: {report.counts.officialActive}.
          </p>
        </div>
        <div data-urban-readiness-progress="true"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-xs dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {report.checks.filter((item) => item.passed).length} de {report.checks.length} etapas documentais atendidas
            {" · "}Os itens restantes exigem conferência por servidor habilitado.
          </p>
          {report.checks.find((item) => !item.passed && NEXT_ACTIONS[item.code]) ? (
            <button type="button" data-urban-readiness-primary-action="true"
              className="min-h-9 max-w-full rounded-lg border border-sky-200 bg-white px-3 text-left text-xs font-bold text-sky-900 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-100"
              onClick={() => {
                const next = report.checks.find((item) => !item.passed && NEXT_ACTIONS[item.code]);
                if (next) openNextStep(NEXT_ACTIONS[next.code].target);
              }}>
              Próximo passo: {NEXT_ACTIONS[report.checks.find((item) => !item.passed && NEXT_ACTIONS[item.code])!.code].label}
            </button>
          ) : null}
        </div>
        {report.readingIssues.length > 0 ? (
          <details data-urban-reading-reservations="true"
            className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-100">
            <summary className="cursor-pointer text-xs font-extrabold">
              Quadro I — {report.readingIssues.length} linha(s) exigem comprovação documental
            </summary>
            <div className="mt-3 space-y-2">
              {report.readingIssues.map((issue) => (
                <div key={issue.line} className="min-w-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100">
                  <p className="font-bold">
                    Linha {issue.line} · {issue.zone}
                    {issue.page ? " · Página " + issue.page : ""}
                    {" · "}{issue.status === "needs_correction" ? "Ressalva registrada" : "Leitura sem conferência"}
                  </p>
                  <p className="mt-1 break-words">{issue.reason}</p>
                </div>
              ))}
              <button type="button" onClick={() => openNextStep("quadros-i")}
                className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-slate-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-white">
                Consultar origem e conferência
              </button>
            </div>
          </details>
        ) : null}
        {report.originalComparison ? (
          <details data-urban-original-comparison="true"
            className="mt-3 min-w-0 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-slate-900 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
            <summary className="cursor-pointer text-xs font-extrabold">
              Comparação com o Quadro I original da Câmara · {report.originalComparison.comparedFields} campo(s) confrontado(s)
              {" · "}{report.originalComparison.differences.length} divergência(s) ou dado(s) não extraído(s)
            </summary>
            <button type="button" data-urban-open-original-quadro-i="true"
              className="mt-3 min-h-9 rounded-lg border border-sky-200 bg-white px-3 text-xs font-bold text-sky-900 hover:bg-sky-50 dark:border-sky-700 dark:bg-slate-950 dark:text-sky-100"
              onClick={() => {
                const sources = document.querySelector<HTMLDetailsElement>(
                  'details[data-sigapro-urban-official-sources="true"]',
                );
                const original = document.querySelector<HTMLDetailsElement>(
                  'details[data-urban-original-quadro-i="true"]',
                );
                if (!sources || !original) {
                  setNavigationNotice("A tabela histórica está indisponível para este município ou perfil.");
                  return;
                }
                sources.open = true;
                original.open = true;
                window.requestAnimationFrame(() => {
                  original.scrollIntoView?.({ behavior: "smooth", block: "start" });
                });
              }}>
              Abrir tabela original e fonte oficial
            </button>
            <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
              {report.originalComparison.scopeNotice}
              {" "}O CA mínimo da AIU (2) continua fora da comparação numérica por ambiguidade no original.
              Mesmo que duas transcrições coincidam, isso não comprova vigência.
            </p>
            {report.originalComparison.differences.length > 0 ? (
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" role="list" aria-label="Divergências de leitura original">
                {report.originalComparison.differences.slice(0, 40).map((issue, index) => (
                  <div role="listitem" key={issue.ordinal + ":" + issue.field + ":" + index}
                    className="min-w-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-slate-900 dark:border-amber-700 dark:bg-slate-950 dark:text-slate-100">
                    <p className="break-words font-bold">
                      {issue.ordinal ? "Linha " + issue.ordinal + " · " : ""}{issue.zone} · {issue.use}
                    </p>
                    <p className="break-words">
                      {issue.field} · Original: <strong>{issue.original}</strong>
                      {" · "}Importação: <strong>{issue.imported}</strong>
                    </p>
                  </div>
                ))}
                {report.originalComparison.differences.length > 40 ? (
                  <p className="text-xs font-semibold">
                    Exibindo 40 divergências. Refaça a comparação no PDF original antes da liberação.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-sky-900 dark:text-sky-100">
                Nenhuma divergência entre os campos comparáveis. Isso não resolve a ressalva da AIU (2),
                nem substitui verificação de artigos, zoneamento e vigência.
              </p>
            )}
          </details>
        ) : null}
        <details data-sigapro-urban-metric-inventory="true"
          className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-extrabold text-slate-950 dark:text-white">
            Comparador implementado: {report.metrics.length} índices numéricos ·
            {" "}{report.metrics.filter(item => item.legalScopesReady > 0).length} com escopo legal integralmente comprovado
          </summary>
          <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
            Os cálculos podem ser exercitados em testes isolados. No uso municipal,
            nenhum limite fica apto à IA sem lei vigente, zona, uso e evidências por página.
            CA básico, exceções e exigências condicionais continuam com conferência jurídica própria.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.metrics.map(item => (
              <div key={item.metric} data-sigapro-urban-metric-status={item.metric}
                className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="break-words text-xs font-bold text-slate-950 dark:text-white">{item.label}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-700 dark:text-slate-200">
                  {item.direction === "minimum" ? "Limite mínimo" : "Limite máximo"}
                  {item.unit ? " · " + item.unit : ""}
                </p>
                <p className={"mt-1 text-[11px] font-semibold " + (
                  item.legalScopesReady > 0
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-amber-800 dark:text-amber-200")}>
                  {item.legalScopesReady > 0
                    ? item.legalScopesReady + " escopo(s) ativo(s) com evidência integral"
                    : "Sem escopo legal comprovado — não liberar diagnóstico"}
                </p>
              </div>
            ))}
          </div>
        </details>
        <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
          {report.checks.map((check) => <article key={check.code}
            data-urban-ai-readiness-step={check.code} data-ready={String(check.passed)}
            className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <div className="flex min-w-0 items-start gap-2">
              {check.passed ?
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /> :
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />}
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-extrabold text-slate-950 dark:text-white">
                  {check.title} — {check.passed ? "Etapa atendida" : "Pendente"}
                </p>
                <p className="mt-1 break-words text-xs leading-5 text-slate-700 dark:text-slate-200">
                  {check.detail}
                </p>
                {check.passed && check.quadro ? (
                  <button type="button" onClick={() => openNextStep(check.quadro === "I" ? "quadros-i" : "quadros-ii")}
                    className="mt-2 min-h-9 text-xs font-semibold text-sky-800 underline underline-offset-2 dark:text-sky-300">
                    Consultar Quadro {check.quadro}
                  </button>
                ) : null}
                {!check.passed && NEXT_ACTIONS[check.code] ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" data-urban-readiness-next={check.code}
                      className="min-h-9 rounded-lg border border-sky-200 bg-white px-3 py-1 text-xs font-bold text-sky-900 underline-offset-2 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-sky-700 dark:bg-slate-950 dark:text-sky-100"
                      onClick={() => openNextStep(NEXT_ACTIONS[check.code].target)}>
                      {NEXT_ACTIONS[check.code].label}
                    </button>
                    <span className="break-words text-[11px] text-slate-600 dark:text-slate-300">
                      Responsável: {NEXT_ACTIONS[check.code].owner}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </article>)}
        </div>
        <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-bold text-slate-950 dark:text-white">
            Parâmetros jurídicos condicionais ainda fora da comparação numérica automática
          </summary>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
            {OTHER_REQUIRED_URBAN_FIELDS.map((field) => <li key={field}>• {field}</li>)}
          </ul>
        </details>
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">
          O leitor geométrico automático de plantas arquitetônicas ainda não foi homologado.
          Na pré-conferência, o analista deve informar e conferir cotas e evidências do projeto.
          A IA nunca substitui o responsável pela análise.
        </p>
      </> : null}
    </section>
  );
}
