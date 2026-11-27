import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listUrbanLegalMatrixImports, saveUrbanQuadroIIReviewedImport,
  type UrbanQuadroIIDraft, type UrbanQuadroIIWorkspace, type UrbanReviewedMatrixImport,
} from "@/integrations/backend/urbanPrecheckClient";

/**
 * Second, optional Quadro II stage: a municipal admin independently confirms
 * the source, explicit individual zone and legal effective date. The backend
 * appends an immutable reviewed_draft. No use permissions are activated.
 */
export function UrbanQuadroIILegalReviewPanel({
  municipalityId, canEdit, workspace, entries, onDataChanged, focusRequest, originalPdfUrl,
}: {
  municipalityId: string; canEdit: boolean;
  workspace: UrbanQuadroIIWorkspace; entries: UrbanQuadroIIDraft[];
  onDataChanged?: () => void;
  focusRequest?: { id: string; token: number } | null;
  originalPdfUrl?: string | null;
}) {
  const [opened, setOpened] = useState(false);
  const [retries, setRetries] = useState(0);
  const [imports, setImports] = useState<UrbanReviewedMatrixImport[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState("");
  const [zone, setZone] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [repeatExcerpt, setRepeatExcerpt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lastAppliedFocusToken = useRef<number | null>(null);

  // Directly open the existing saved category, never create a duplicate.
  // This effect responds to an explicit button click in the Quadro II queue.
  useEffect(() => {
    if (!focusRequest || !canEdit || lastAppliedFocusToken.current === focusRequest.token) return;
    const existing = entries.find(entry => entry.id === focusRequest.id);
    if (!existing) return;
    lastAppliedFocusToken.current = focusRequest.token;
    setOpened(true);
    setChosen(existing.id);
    setZone("");
    setEffectiveFrom("");
    setExcerpt(existing.source_excerpt.trim().slice(0, 500));
    setRepeatExcerpt("");
    setConfirmed(false);
    setError("");
    setNotice("Rascunho já salvo. Confira o trecho no PDF original; zona e vigência não são preenchidas por suposição.");
  }, [focusRequest?.token, focusRequest?.id, canEdit, entries]);

  useEffect(() => {
    if (!focusRequest || !opened || chosen !== focusRequest.id) return;
    window.requestAnimationFrame(() => {
      document.querySelector('[data-urban-quadro-ii-legal-import="true"]')
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  }, [focusRequest?.token, focusRequest?.id, opened, chosen]);

  useEffect(() => {
    let alive = true;
    setImports([]);
    setError("");
    if (!opened) return;
    setLoading(true);
    void listUrbanLegalMatrixImports(municipalityId).then((result) => {
      if (alive) setImports(result.filter((row) =>
        row.quadro === "II" && row.document_sha256 === workspace.document_sha256));
    }).catch((reason: unknown) => {
      if (alive) setError("Não foi possível consultar a matriz jurídica: " +
        String((reason as Error)?.message || reason));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [opened, retries, municipalityId, workspace.document_sha256]);

  const current = entries.find((row) => row.id === chosen);
  const alreadyRegistered = imports.filter((row) =>
    row.page_number === current?.page_number &&
    row.use_code === current?.category_code.toLocaleUpperCase("pt-BR"));
  const valid = Boolean(
    canEdit && current && workspace.status === "pending_legal_review" &&
    workspace.document_title && workspace.document_sha256 &&
    /^[A-Z0-9_()/.-]{1,40}$/.test(zone.trim().toLocaleUpperCase("pt-BR")) &&
    /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) &&
    excerpt.trim().length >= 20 && excerpt.trim().length <= 500 &&
    current.source_excerpt.includes(excerpt.trim()) &&
    repeatExcerpt.trim() === excerpt.trim() && confirmed && !saving && !loading && !error,
  );

  const save = async () => {
    if (!valid || !current || !workspace.document_sha256 || !workspace.document_title) return;
    setSaving(true);
    setError(""); setNotice("");
    try {
      const result = await saveUrbanQuadroIIReviewedImport({
        municipalityId, documentTitle: workspace.document_title,
        documentSha256: workspace.document_sha256,
        pageNumber: current.page_number, categoryCode: current.category_code,
        zoneCode: zone.trim(), useDescription: current.use_description,
        permittedZones: current.permitted_zones_text,
        roadHierarchy: current.road_hierarchy_text,
        parkingRequirement: current.parking_requirement_text,
        specialConditions: current.special_conditions_text,
        effectiveFrom, sourceExcerpt: current.source_excerpt,
        literalExcerpt: excerpt.trim(),
      });
      // Read-back must confirm the new immutable imported version.
      const next = await listUrbanLegalMatrixImports(municipalityId);
      if (!next.some((item) => item.id === result.id &&
        item.quadro === "II" && item.status === "reviewed_draft" &&
        item.municipality_id === municipalityId &&
        item.document_sha256 === workspace.document_sha256)) {
        throw new Error("O banco não confirmou a gravação da matriz do Quadro II.");
      }
      setImports(next.filter((item) =>
        item.quadro === "II" && item.document_sha256 === workspace.document_sha256));
      onDataChanged?.();
      setChosen(""); setZone(""); setEffectiveFrom(""); setExcerpt(""); setRepeatExcerpt(""); setConfirmed(false);
      setNotice("Versão jurídica conferida registrada como RASCUNHO. Nenhuma permissão de uso foi ativada.");
    } catch (cause) {
      setError(String((cause as Error)?.message || cause));
    } finally { setSaving(false); }
  };

  return (
    <div data-urban-quadro-ii-legal-import="true"
      className="min-w-0 scroll-mt-24 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-slate-900 dark:border-sky-700 dark:bg-slate-950 dark:text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-extrabold text-sky-950 dark:text-sky-100">
            <BookOpenCheck className="h-4 w-4" /> Conferência jurídica e versionamento do Quadro II
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
            Transcrição é diferente de norma: esta etapa exige revisão do PDF e de suas
            alterações para registrar um rascunho jurídico por categoria e zona.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpened((value) => !value)}>
          {opened ? "Ocultar conferência" : "Conferir e versionar categorias"}
        </Button>
      </div>
      {opened ? <div className="mt-3 space-y-3">
        {loading ? <p role="status" className="flex gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Consultando versões...</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950 dark:bg-rose-950 dark:text-rose-200">{error}
          <button type="button" className="ml-2 underline" onClick={() => {setError("");setRetries((n)=>n+1);}}>Tentar novamente</button>
        </p> : null}
        <p className="text-xs font-semibold">
          {imports.length} importação(ões) jurídica(s) versionada(s) no PDF; apenas rascunhos.
          Selecione uma categoria por vez, sem recadastrar rascunhos existentes.
        </p>
        <details data-urban-qii-legal-category-picker="true"
          className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <summary className="cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
            Escolher outra categoria ({entries.length} rascunho(s) nesta página)
          </summary>
          <div className="mt-3 grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
          {entries.map((entry) => {
            const n=imports.filter((row) =>
              row.page_number === entry.page_number &&
              row.use_code === entry.category_code.toLocaleUpperCase("pt-BR")).length;
            return <button key={entry.id} type="button"
              aria-pressed={chosen === entry.id}
              disabled={!canEdit || saving}
              onClick={() => {
                setChosen(entry.id);setZone("");setEffectiveFrom("");
                // Pre-fill only a source candidate; do NOT pre-fill the independent
                // double transcription, an official zone, or effective date.
                setExcerpt(entry.source_excerpt.trim().slice(0, 500));
                setRepeatExcerpt("");setConfirmed(false);setError("");setNotice("");
                setNotice("Trecho candidato pré-preenchido a partir do lote municipal. Confira o PDF original, digite a segunda transcrição e valide zona e vigência.");
              }}
              className={"min-w-0 rounded-xl border p-3 text-left text-xs transition-colors " +
                (chosen === entry.id
                  ? "border-sky-400 bg-slate-950 text-white dark:bg-sky-950"
                  : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white")}>
              <strong className="block break-words">{entry.category_code} · {entry.use_description}</strong>
              <span className="mt-1 block">
                {n ? n + " versão(ões) conferida(s) para esta categoria" : "Conferência jurídica ainda não registrada"}
              </span>
            </button>;
          })}
          </div>
        </details>
        {current && canEdit ? <div data-urban-quadro-ii-legal-form="true"
          className="space-y-3 rounded-xl border border-sky-200 bg-white p-3 text-slate-900 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold">
              Revisar {current.category_code} — página {current.page_number}
            </p>
            {originalPdfUrl ? (
              <a href={originalPdfUrl + "#page=" + current.page_number}
                target="_blank" rel="noopener noreferrer"
                data-urban-qii-review-original-pdf="true"
                className="inline-flex min-h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-950 hover:bg-sky-100 dark:border-sky-700 dark:bg-slate-950 dark:text-sky-100">
                Conferir página no PDF original
              </a>
            ) : null}
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-200">
            A publicação original é referência documental; confirme alterações posteriores,
            uso e vigência antes de registrar uma matriz jurídica.
          </p>
          {alreadyRegistered.length > 0 ? <p className="text-xs text-amber-800 dark:text-amber-200">
            Já há versões conferidas desta categoria. Registre outra apenas se houver nova
            zona, correção documental ou mudança legal comprovada.
          </p> : null}
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <ShieldAlert className="mr-1 inline h-4 w-4" />
            Não copie automaticamente zonas, vias ou vagas do OCR. Confirme cada uma
            dessas condições diretamente no PDF, inclusive leis posteriores.
          </p>
          <p className="text-xs leading-5">
            Fonte: {workspace.document_title} · página {current.page_number} ·
            SHA-256 {workspace.document_sha256?.slice(0,16)}…
          </p>
          <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-900">
            {current.source_excerpt}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold">Zona individual confirmada no mapa oficial
              <Input aria-label="Zona legal conferida" value={zone} maxLength={40}
                placeholder="Ex.: ZC ou AIU(2)" className="mt-1 bg-white dark:bg-slate-950"
                onChange={(e) => {setZone(e.target.value.toLocaleUpperCase("pt-BR"));setConfirmed(false);}} />
            </label>
            <label className="block text-xs font-semibold">Data de vigência comprovada
              <Input aria-label="Vigência conferida do Quadro II" type="date"
                value={effectiveFrom} className="mt-1 bg-white dark:bg-slate-950"
                onChange={(e) => {setEffectiveFrom(e.target.value);setConfirmed(false);}} />
            </label>
          </div>
          <p data-urban-qii-autofill-candidate="true"
            className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950 dark:border-sky-700 dark:bg-slate-950 dark:text-sky-100">
            A primeira transcrição foi preenchida automaticamente do rascunho do Quadro II.
            Ela não equivale a uma leitura jurídica conferida. O campo seguinte fica vazio
            para comparação independente; zona e vigência exigem prova oficial.
          </p>
          <label className="block text-xs font-semibold">Trecho candidato a conferir no PDF (20–500 caracteres)
            <Textarea value={excerpt} maxLength={500} rows={3}
              className="mt-1 bg-white text-slate-900 dark:bg-slate-950 dark:text-white"
              onChange={(e) => {setExcerpt(e.target.value);setConfirmed(false);}} />
          </label>
          <label className="block text-xs font-semibold">Repita a transcrição após conferir novamente a imagem original
            <Textarea value={repeatExcerpt} maxLength={500} rows={3}
              className="mt-1 bg-white text-slate-900 dark:bg-slate-950 dark:text-white"
              onChange={(e) => {setRepeatExcerpt(e.target.value);setConfirmed(false);}} />
          </label>
          <label className="flex items-start gap-2 text-xs font-semibold">
            <input type="checkbox" checked={confirmed} onChange={(e)=>setConfirmed(e.target.checked)} />
            Confirmei pessoalmente o PDF, a zona individual, o código de uso,
            as condições especiais, estacionamento, alterações e vigência legal.
            Entendo que esta etapa cria apenas uma versão de revisão jurídica.
          </label>
          <Button type="button" disabled={!valid} onClick={()=>void save()}
            data-urban-quadro-ii-reviewed-save="true"
            className="sig-force-dark-action min-h-11 rounded-xl bg-slate-950 !text-white">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Gravar versão jurídica revisada — sem ativar IA
          </Button>
        </div> : null}
        {notice ? <p role="status" className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-sky-950 dark:bg-slate-900 dark:text-sky-100">{notice}</p> : null}
      </div> : null}
    </div>
  );
}
