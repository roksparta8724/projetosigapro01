import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Archive, BookOpenCheck, ExternalLink, FilePlus2, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { uploadFileToStorage } from "@/integrations/r2/storage";
import { getLegislationOpenUrl } from "@/integrations/r2/client";
import { getMunicipalOfficialUrbanSources } from "@/lib/urbanOfficialLegalSources";
import { canEditUrbanLegislationManagement, canViewUrbanLegislationManagement } from "@/lib/urbanLegislationAccess";
import {
  LAW_KINDS, LAW_SCOPES, LAW_RELATIONS, assertUrbanLegislationWriteAccess, listLawRegistry, registerLaw,
  setLawArchived, validateLawRegistryInput, type LawKind, type LawScope,
  type LawRegistryItem, type LawRegistryInput,
} from "@/integrations/backend/urbanLegislationRegistryClient";

type EditableLaw = {
  kind: LawKind;
  number: string;
  year: string;
  title: string;
  scope: LawScope;
  sourceUrl: string;
  publication: string;
  effective: string;
  relatedId: string;
  relationType: string;
};
const newLaw = (): EditableLaw => ({
  kind: "lei_complementar", number: "", year: "", title: "",
  scope: "geral", sourceUrl: "", publication: "", effective: "",
  relatedId: "", relationType: "",
});
const labelStyle = "block min-w-0 text-xs font-bold leading-5 text-slate-700 dark:text-slate-200";
const fieldStyle = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white";
const explainStyle = "mt-1 text-[11px] leading-5 font-normal text-slate-600 dark:text-slate-300";
const keyValid = (value: string | null | undefined) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");

async function computePdfSha256(file: File) {
  if (file.size < 1 || file.size > 100 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecione um PDF original de até 100 MB.");
  }
  const header = await file.slice(0, 5).text();
  if (header !== "%PDF-") throw new Error("O arquivo não possui cabeçalho válido de PDF.");
  if (!crypto.subtle) throw new Error("Não foi possível verificar a integridade do PDF neste navegador.");
  const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

function describeRegistryError(error: unknown): string {
  const message = String((error as Error)?.message || error);
  if (/PGRST202|schema cache|Could not find the function|list_urban_legislation_documents_v1/i.test(message)) {
    return "O acervo legislativo está em sincronização com o banco deste ambiente. Atualize a página e tente novamente; os documentos anteriores continuam preservados.";
  }
  return message;
}

export function UrbanLegislationRegistryPanel({
  municipalityId,
}: { municipalityId: string | null | undefined }) {
  const { session } = usePlatformSession();
  const pickerId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ file: File; storageKey: string; sha256: string } | null>(null);
  const generation = useRef(0);
  const [records, setRecords] = useState<LawRegistryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<EditableLaw>(newLaw);
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceChoice, setReferenceChoice] = useState("");
  const canWrite = Boolean(municipalityId && session.tenantId === municipalityId &&
    canEditUrbanLegislationManagement(session.role));
  const officialSources = useMemo(() =>
    getMunicipalOfficialUrbanSources(municipalityId), [municipalityId]);

  useEffect(() => {
    const request = ++generation.current;
    setRecords([]); setTotal(0); setNextOffset(null);
    setError(""); setNotice(""); setSearch(""); setFormOpen(false);
    setDraft(newLaw()); setFile(null); setReferenceChoice("");
    pendingUpload.current = null;
    if (!keyValid(municipalityId) || !canViewUrbanLegislationManagement(session.role)) return;
    setLoading(true);
    void listLawRegistry(municipalityId!)
      .then((page) => {
        if (request !== generation.current) return;
        setRecords(page.items); setTotal(page.total); setNextOffset(page.next_offset);
      })
      .catch((err: unknown) => {
        if (request === generation.current) setError(describeRegistryError(err));
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => { ++generation.current; };
  }, [municipalityId, session.role]);

  async function refresh() {
    if (!municipalityId) return;
    const request = ++generation.current;
    const page = await listLawRegistry(municipalityId);
    if (request !== generation.current) return;
    setRecords(page.items); setTotal(page.total); setNextOffset(page.next_offset);
  }

  async function loadMore() {
    if (!municipalityId || nextOffset === null || loading) return;
    const request = generation.current;
    setLoading(true); setError("");
    try {
      const page = await listLawRegistry(municipalityId, nextOffset);
      if (request !== generation.current) return;
      setRecords((old) => [...old, ...page.items]);
      setTotal(page.total); setNextOffset(page.next_offset);
    } catch (err) {
      if (request === generation.current) setError(describeRegistryError(err));
    } finally { if (request === generation.current) setLoading(false); }
  }

  function change<K extends keyof EditableLaw>(field: K, value: EditableLaw[K]) {
    setDraft((old) => ({ ...old, [field]: value }));
    setError("");
  }

  function prefillFromOfficialSource(id: string) {
    setReferenceChoice(id);
    const source = officialSources.find((entry) => entry.id === id);
    if (!source) return;
    const tokens = /^(lc|decreto|plc)-([0-9]+)-([0-9]{4})$/.exec(source.id);
    const kind: LawKind = tokens?.[1] === "decreto" ? "decreto" :
      tokens?.[1] === "plc" ? "projeto_de_lei" : "lei_complementar";
    const scope: LawScope = source.id === "lc-613-2023" ? "plano_diretor" :
      source.id === "lc-655-2026" || source.id === "decreto-7548-2026"
        ? "direito_real_laje" :
      source.id === "lc-656-2026" || source.id === "decreto-7550-2026"
        ? "regularizacao" :
      kind === "projeto_de_lei" ? "historico" : "aprovacao_ordinaria";
    const parentNumber = source.id === "lc-440-2011" || source.id === "lc-473-2014"
      ? "379" : source.id === "decreto-7548-2026" ? "655" :
        source.id === "decreto-7550-2026" ? "656" : "";
    const parent = records.find((entry) => !entry.archived &&
      entry.document_kind === "lei_complementar" &&
      entry.document_number === parentNumber &&
      entry.document_year === (parentNumber === "379" ? 2009 : 2026));
    setDraft({
      kind, number: tokens?.[2] || "", year: tokens?.[3] || "",
      title: source.title, scope, sourceUrl: source.officialPageUrl,
      publication: "", effective: "",
      relatedId: parent?.id || "",
      relationType: parent ? (kind === "decreto" ? "regulamenta" : "altera") : "",
    });
    setFormOpen(true);
    setError("");
    setNotice("Os metadados foram sugeridos a partir do catálogo público. Confira o PDF, número, vigência e relação legal antes de registrar.");
  }

  async function save() {
    if (!canWrite || !municipalityId || saving) return;
    setError(""); setNotice("");
    if (!file) { setError("Selecione o PDF original da norma."); return; }
    const hypotheticalKey = "municipalities/" + municipalityId +
      "/legislation-registry/" + "x".repeat(75) + ".pdf";
    const sample: LawRegistryInput = {
      documentKind: draft.kind, documentNumber: draft.number.trim(),
      documentYear: Number(draft.year), title: draft.title.trim(),
      legalScope: draft.scope, officialSourceUrl: draft.sourceUrl.trim(),
      publicationDate: draft.publication, effectiveFrom: draft.effective,
      relatedDocumentId: draft.relatedId, relationType: draft.relationType,
      storageKey: hypotheticalKey, fileName: file.name,
      fileSizeBytes: file.size, sha256: "0".repeat(64),
    };
    const validation = validateLawRegistryInput(municipalityId, sample);
    if (validation) { setError(validation); return; }
    setSaving(true);
    try {
      await assertUrbanLegislationWriteAccess(municipalityId);
      let uploaded = pendingUpload.current?.file === file ? pendingUpload.current : null;
      if (!uploaded) {
        const sha256 = await computePdfSha256(file);
        const result = await uploadFileToStorage({
          bucket: "process-documents", tenantId: municipalityId,
          userId: session.id, file, folder: "legislation-registry",
        });
        uploaded = { file, storageKey: result.path, sha256 };
        pendingUpload.current = uploaded;
      }
      const result = await registerLaw(municipalityId, {
        ...sample, storageKey: uploaded.storageKey, sha256: uploaded.sha256,
      }, crypto.randomUUID());
      setNotice("PDF e cadastro registrados no Neon/R2, revisão " + result.revision +
        ". A norma continua pendente de conferência e NÃO está ativa para a IA.");
      pendingUpload.current = null;
      setDraft(newLaw()); setFile(null); setReferenceChoice("");
      if (fileRef.current) fileRef.current.value = "";
      setFormOpen(false);
      await refresh();
    } catch (err) {
      const extra = pendingUpload.current
        ? " O PDF já foi enviado ao R2. Corrija o problema e tente salvar novamente; o envio não será repetido enquanto o mesmo arquivo estiver selecionado."
        : "";
      setError(describeRegistryError(err) + extra);
    } finally { setSaving(false); }
  }

  async function toggleArchive(item: LawRegistryItem) {
    if (!canWrite || !municipalityId || saving) return;
    const action = item.archived ? "restaurar" : "arquivar";
    const reason = window.prompt("Justifique por que deseja " + action +
      " esta versão (mínimo de 12 caracteres). O PDF e o histórico serão preservados.");
    if (reason === null) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await assertUrbanLegislationWriteAccess(municipalityId);
      await setLawArchived(municipalityId, item.id, !item.archived, reason);
      await refresh();
      setNotice("Registro " + (item.archived ? "restaurado" : "arquivado") +
        " com auditoria. O PDF original foi preservado.");
    } catch (err) { setError(describeRegistryError(err)); }
    finally { setSaving(false); }
  }

  const shown = records.filter((entry) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || [entry.title, entry.document_number, entry.document_year,
      entry.document_kind].join(" ").toLocaleLowerCase("pt-BR").includes(term);
  });
  if (!municipalityId || !keyValid(municipalityId) || !canViewUrbanLegislationManagement(session.role)) return null;

  return (
    <section id="sigapro-urban-legislation-registry" data-urban-legislation-registry="true"
      className="mt-5 w-full min-w-0 max-w-full overflow-hidden rounded-[22px] border border-sky-200 bg-white p-4 shadow-sm [overflow-wrap:anywhere] dark:border-sky-700 dark:bg-slate-950 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-950 dark:text-white">
            <BookOpenCheck className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
            Cadastro e gestão de legislação urbanística
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
            Adicione quantas leis, decretos, mapas e anexos forem necessários, um PDF por registro.
            Cada documento preserva suas revisões anteriores, com SHA-256 e histórico auditável.
          </p>
        </div>
        {canWrite ? (
          <button type="button" disabled={saving}
            onClick={() => setFormOpen((old) => !old)}
            className="sig-force-dark-action inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold !text-white hover:bg-slate-800">
            <FilePlus2 className="h-4 w-4" />
            {formOpen ? "Fechar cadastro" : "Cadastrar lei / PDF adicional"}
          </button>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            Consulta — cadastro pelo Admin da Prefeitura
          </span>
        )}
      </div>

      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
        <ShieldAlert className="mr-1 inline h-4 w-4" />
        Salvar documento não comprova vigência nem ativa regras para a IA.
        As leis relacionadas são apenas referências documentais até a conferência jurídica.
        O Admin da Prefeitura cadastra os documentos; a conferência jurídica é necessária antes de liberar parâmetros para a IA.
      </p>

      {formOpen && canWrite ? (
        <div data-urban-legislation-editor="true"
          className="mt-4 min-w-0 rounded-2xl border border-sky-200 bg-[#f3f9fe] p-4 dark:border-sky-700 dark:bg-slate-900">
          <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">
            Novo documento ou nova revisão
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
            Para substituir um PDF, cadastre novamente o mesmo tipo, número e ano:
            o sistema criará a próxima revisão sem apagar a anterior.
          </p>

          {officialSources.length ? (
            <label className={labelStyle + " mt-3"}>
              Pré-preencher com fonte pública de Campo Limpo Paulista (opcional)
              <select className={fieldStyle} value={referenceChoice}
                onChange={(event) => prefillFromOfficialSource(event.target.value)}>
                <option value="">Escolha um documento para preencher os metadados</option>
                {officialSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.title}</option>
                ))}
              </select>
              <span className={explainStyle}>
                O preenchimento não importa nem confere o arquivo: selecione também o PDF oficial.
              </span>
            </label>
          ) : null}

          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={labelStyle}>Tipo de norma
              <select className={fieldStyle} value={draft.kind}
                onChange={(e) => change("kind", e.target.value as LawKind)}>
                {LAW_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className={labelStyle}>Número / código
              <input className={fieldStyle} value={draft.number} maxLength={50}
                placeholder="Ex.: 379" onChange={(e) => change("number", e.target.value)} />
            </label>
            <label className={labelStyle}>Ano
              <input className={fieldStyle} value={draft.year} maxLength={4}
                inputMode="numeric" placeholder="Ex.: 2009"
                onChange={(e) => change("year", e.target.value)} />
            </label>
            <label className={labelStyle}>Finalidade da norma
              <select className={fieldStyle} value={draft.scope}
                onChange={(e) => change("scope", e.target.value as LawScope)}>
                {LAW_SCOPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label className={labelStyle + " mt-3"}>Título oficial completo
            <input className={fieldStyle} value={draft.title} maxLength={250}
              placeholder="Lei Complementar ... — assunto"
              onChange={(e) => change("title", e.target.value)} />
          </label>
          <label className={labelStyle + " mt-3"}>Endereço de publicação em órgão oficial (opcional)
            <input className={fieldStyle} value={draft.sourceUrl} maxLength={1200}
              placeholder="https://..." onChange={(e) => change("sourceUrl", e.target.value)} />
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className={labelStyle}>Data de publicação (se conferida)
              <input className={fieldStyle} type="date" value={draft.publication}
                onChange={(e) => change("publication", e.target.value)} />
            </label>
            <label className={labelStyle}>Início de vigência (somente se comprovado)
              <input className={fieldStyle} type="date" value={draft.effective}
                onChange={(e) => change("effective", e.target.value)} />
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className={labelStyle}>Documento relacionado (opcional)
              <select className={fieldStyle} value={draft.relatedId}
                onChange={(e) => {
                  change("relatedId", e.target.value);
                  if (!e.target.value) change("relationType", "");
                }}>
                <option value="">Nenhuma relação identificada</option>
                {records.filter((item) => !item.archived).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.document_kind} {item.document_number}/{item.document_year} · v{item.revision}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelStyle}>Relação jurídica (opcional)
              <select className={fieldStyle} value={draft.relationType}
                onChange={(e) => change("relationType", e.target.value)}
                disabled={!draft.relatedId}>
                <option value="">Sem relação</option>
                {LAW_RELATIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={labelStyle + " mt-3"} htmlFor={pickerId}>
            PDF original obrigatório — até 100 MB
          </label>
          <input ref={fileRef} id={pickerId} type="file" accept=".pdf,application/pdf"
            className={fieldStyle} disabled={saving}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              pendingUpload.current = null;
            }} />
          {file ? (
            <p className={explainStyle}>
              Selecionado: {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB.
              O SHA-256 será calculado antes do envio.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <span className="min-w-0 flex-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
              Não apagar histórico; não criar parâmetro ativo automaticamente.
            </span>
            <button type="button" onClick={() => void save()} disabled={saving || !file}
              aria-busy={saving}
              className="sig-force-dark-action inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 py-2 text-sm font-bold !text-white hover:bg-slate-800 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> :
                <FilePlus2 className="h-4 w-4" />}
              {saving ? "Enviando e registrando..." : "Salvar PDF e cadastrar no Neon"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 min-w-0 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="min-w-0 break-words text-xs leading-5 text-rose-900 [overflow-wrap:anywhere]">{error}</p>
          <button type="button" disabled={loading || saving}
            onClick={() => void refresh().then(() => setError("")).catch((err: unknown) => setError(describeRegistryError(err)))}
            className="mt-2 min-h-9 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-900 disabled:opacity-50">
            Recarregar acervo
          </button>
        </div>
      ) : null}
      {notice ? <p role="status" className="mt-3 break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
        {notice}
      </p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">Acervo cadastrado desta Prefeitura</h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {total} documento(s) no Neon · {records.length} carregado(s). Todos aguardam conferência
            ou são históricos; nenhum é liberado para IA por este cadastro.
          </p>
        </div>
        <input aria-label="Pesquisar documentos carregados" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-10 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-64"
          placeholder="Filtrar registros carregados" />
      </div>
      {loading && records.length === 0 ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando acervo no Neon...
        </p>
      ) : null}
      {!loading && !records.length && !error ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Nenhuma lei cadastrada neste módulo. Os PDFs do acervo institucional anterior
          são preservados separadamente. {canWrite
            ? "Para importar novas normas, use Cadastrar lei / PDF adicional, uma lei ou decreto por arquivo."
            : "O administrador da Prefeitura deve registrar as normas adicionais; elas aparecerão aqui para consulta."}
        </p>
      ) : null}
      <div className="mt-3 grid min-w-0 gap-2 xl:grid-cols-2">
        {shown.map((entry) => (
          <article key={entry.id}
            className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 [overflow-wrap:anywhere] dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-extrabold text-slate-950 dark:text-white">
                  {entry.title}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {entry.document_kind.replace(/_/g, " ")} · {entry.document_number}/{entry.document_year}
                  {" "}· revisão {entry.revision}
                </p>
              </div>
              <span className={"rounded-lg px-2 py-1 text-[11px] font-bold " +
                (entry.archived || entry.verification_status === "proposal_not_enacted"
                  ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-950")}>
                {entry.archived ? "Arquivada" :
                  entry.verification_status === "proposal_not_enacted" ?
                    "Proposta sem vigência" : "Aguardando conferência"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
              Finalidade: {LAW_SCOPES.find((scope) => scope.value === entry.legal_scope)?.label || entry.legal_scope}
              {entry.relation_type ? " · " + entry.relation_type + " documento vinculado" : ""}
            </p>
            <p className="mt-1 break-all text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              PDF: {entry.file_name} · SHA-256 {entry.sha256.slice(0, 16)}...
            </p>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
              <a href={getLegislationOpenUrl("r2:" + entry.storage_key)}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-slate-900 bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
              </a>
              {entry.official_source_url ? (
                <a href={entry.official_source_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                  Conferir publicação
                </a>
              ) : null}
              {canWrite ? (
                <button type="button" disabled={saving}
                  onClick={() => void toggleArchive(entry)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50">
                  {entry.archived ? <RotateCcw className="h-3.5 w-3.5" /> :
                    <Archive className="h-3.5 w-3.5" />}
                  {entry.archived ? "Restaurar" : "Arquivar"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {nextOffset !== null ? (
        <button type="button" disabled={loading}
          onClick={() => void loadMore()}
          className="mt-3 min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 disabled:opacity-50">
          {loading ? "Carregando..." : "Carregar mais documentos"}
        </button>
      ) : null}
    </section>
  );
}
