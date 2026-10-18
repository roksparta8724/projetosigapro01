import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  FileBadge2,
  FileCheck2,
  Loader2,
  Printer,
  Save,
  Send,
  ShieldCheck,
  Signature,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProcessRecord, SessionUser } from "@/lib/platform";
import {
  getProcessArtifactSignatureRequest,
  getProcessArtifactSignatures,
  requestProcessArtifactSignature,
  signProcessArtifactWithPassword,
  type ArtifactSignatureSnapshot,
} from "@/integrations/esign/artifactClient";
import {
  finalizeHabiteSePermit,
  getHabiteSePermit,
  saveHabiteSePermit,
  setHabiteSePermitAwaitingDirector,
  type HabiteSePermitFormData,
  type HabiteSePermitRecord,
} from "@/integrations/permits/habiteSePermitClient";

const ARTIFACT_TYPE = "habite_se_permit";
const ARTIFACT_KEY = "habite-se-permit";

function extractNoteValue(notes: string | undefined, label: string) {
  const prefix = label.toLocaleLowerCase("pt-BR") + ":";
  const part = String(notes || "")
    .split("|")
    .map((item) => item.trim())
    .find((item) => item.toLocaleLowerCase("pt-BR").startsWith(prefix));
  return part ? part.slice(part.indexOf(":") + 1).trim() : "";
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Não registrado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPermitPayload(
  process: ProcessRecord,
  permit: HabiteSePermitRecord,
): Record<string, unknown> {
  return {
    schema: "sigapro.habite-se-permit.v1",
    processId: process.id,
    protocol: process.protocol,
    permitNumber: permit.permitNumber,
    owner: process.ownerName,
    ownerDocument: process.ownerDocument,
    professional: process.technicalLead,
    propertyAddress: process.address,
    areaM2: Number(process.property.area || 0),
    usage: process.property.usage,
    constructionStandard: process.property.constructionStandard || "",
    formData: permit.formData,
  };
}

function initialForm(process: ProcessRecord): HabiteSePermitFormData {
  return {
    observations: "",
    conditions: "",
    modality:
      extractNoteValue(process.notes, "Modalidade") ||
      (process.type.toLocaleLowerCase("pt-BR").includes("parcial")
        ? "Habite-se parcial"
        : "Habite-se integral"),
    sourceProcess: extractNoteValue(process.notes, "Processo de aprovação de origem"),
    sourcePermit: extractNoteValue(process.notes, "Alvará de origem"),
    completionDate: extractNoteValue(process.notes, "Conclusão informada"),
  };
}

export function HabiteSePermitPanel({
  process,
  session,
  externalView = false,
  municipalityName = "Prefeitura Municipal",
  onProcessRefresh,
}: {
  process: ProcessRecord;
  session: SessionUser;
  externalView?: boolean;
  municipalityName?: string | null;
  onProcessRefresh?: () => Promise<void> | void;
}) {
  const habiteSeGuide = process.payment.guides?.find((guide) => guide.kind === "habite_se");
  const paymentConfirmed = habiteSeGuide?.status === "compensada";
  const [permit, setPermit] = useState<HabiteSePermitRecord | null>(null);
  const [form, setForm] = useState<HabiteSePermitFormData>(() => initialForm(process));
  const [canManage, setCanManage] = useState(false);
  const [signatureState, setSignatureState] = useState<ArtifactSignatureSnapshot>({
    block: null,
    signers: [],
  });
  const [directorRequestPending, setDirectorRequestPending] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordDialog, setPasswordDialog] = useState<"analyst" | "director" | null>(null);
  const [password, setPassword] = useState("");

  const isDirector =
    ["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor"].includes(session.role) &&
    /diretor|diretora/i.test(session.title || "");

  const refresh = async () => {
    const snapshot = await getHabiteSePermit(process.id);
    setPermit(snapshot.permit);
    setCanManage(snapshot.canManage);
    if (snapshot.permit) setForm(snapshot.permit.formData);

    const signatures = await getProcessArtifactSignatures(process.id, ARTIFACT_KEY);
    setSignatureState(signatures);

    const request = await getProcessArtifactSignatureRequest(
      process.id,
      ARTIFACT_KEY,
      "diretoria",
    );
    setDirectorRequestPending(request.request?.status === "pending");
  };

  useEffect(() => {
    if (!paymentConfirmed && !["deferido", "arquivado"].includes(process.status)) return;
    let active = true;
    void Promise.all([
      getHabiteSePermit(process.id),
      getProcessArtifactSignatures(process.id, ARTIFACT_KEY),
      getProcessArtifactSignatureRequest(process.id, ARTIFACT_KEY, "diretoria"),
    ])
      .then(([snapshot, signatures, request]) => {
        if (!active) return;
        setPermit(snapshot.permit);
        setCanManage(snapshot.canManage);
        if (snapshot.permit) setForm(snapshot.permit.formData);
        setSignatureState(signatures);
        setDirectorRequestPending(request.request?.status === "pending");
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : "Não foi possível carregar o Alvará de Habite-se.");
      });
    return () => {
      active = false;
    };
  }, [paymentConfirmed, process.id, process.status]);

  const currentPayload = useMemo(
    () => (permit ? buildPermitPayload(process, { ...permit, formData: form }) : null),
    [form, permit, process],
  );
  const signedPayload = signatureState.block?.payload ?? null;
  const signatureMatchesCurrent =
    Boolean(currentPayload && signedPayload) &&
    stableStringify(currentPayload) === stableStringify(signedPayload);
  const analystSigner = signatureMatchesCurrent
    ? signatureState.signers.find((item) => item.slot === "analise_tecnica")
    : undefined;
  const directorSigner = signatureMatchesCurrent
    ? signatureState.signers.find((item) => item.slot === "diretoria")
    : undefined;
  const analystSigned = Boolean(analystSigner);
  const directorSigned = Boolean(directorSigner);

  const saveDraft = async () => {
    if (!paymentConfirmed) {
      setNotice("O pagamento da Guia de Habite-se precisa estar confirmado antes da elaboração do Alvará.");
      return null;
    }
    setBusy("save");
    setNotice("");
    try {
      const saved = await saveHabiteSePermit({
        processId: process.id,
        permitNumber: permit?.permitNumber,
        formData: form,
      });
      setPermit(saved);
      setForm(saved.formData);
      await onProcessRefresh?.();
      setNotice(
        signatureMatchesCurrent
          ? "Rascunho salvo."
          : signatureState.block
            ? "Retificação salva. A assinatura anterior permanece no histórico e esta nova versão precisa ser assinada novamente."
            : "Rascunho do Alvará de Habite-se salvo no banco oficial.",
      );
      return saved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar o Alvará.");
      return null;
    } finally {
      setBusy("");
    }
  };

  const openSignature = (kind: "analyst" | "director") => {
    if (kind === "analyst" && (!permit || !canManage)) {
      setNotice("Salve o Alvará de Habite-se antes de assinar.");
      return;
    }
    if (kind === "director" && (!isDirector || permit?.status !== "aguardando_diretor")) {
      setNotice("O documento ainda não está formalmente encaminhado para assinatura da Diretoria.");
      return;
    }
    setPassword("");
    setPasswordDialog(kind);
  };

  const confirmSignature = async () => {
    if (!passwordDialog || !password.trim() || !permit) return;
    setBusy(passwordDialog === "analyst" ? "sign-analyst" : "sign-director");
    setNotice("");
    try {
      const payload =
        passwordDialog === "director" && signatureState.block?.payload
          ? signatureState.block.payload
          : buildPermitPayload(process, permit);

      await signProcessArtifactWithPassword({
        processId: process.id,
        artifactType: ARTIFACT_TYPE,
        artifactKey: ARTIFACT_KEY,
        signerSlot: passwordDialog === "analyst" ? "analise_tecnica" : "diretoria",
        password,
        payload,
      });

      let signatures = await getProcessArtifactSignatures(process.id, ARTIFACT_KEY);
      setSignatureState(signatures);

      if (passwordDialog === "analyst") {
        const technical = signatures.signers.find((item) => item.slot === "analise_tecnica");
        const artifactHash = signatures.block?.artifact_hash || "";
        if (!technical || !artifactHash) {
          throw new Error("A assinatura do Analista não foi confirmada integralmente no banco.");
        }
        await requestProcessArtifactSignature({
          processId: process.id,
          artifactKey: ARTIFACT_KEY,
          artifactHash,
          signerSlot: "diretoria",
        });
        const waiting = await setHabiteSePermitAwaitingDirector(process.id);
        setPermit(waiting);
        setDirectorRequestPending(true);
        setNotice("Alvará assinado pelo Analista Técnico e encaminhado à Diretoria para assinatura final.");
      } else {
        signatures = await getProcessArtifactSignatures(process.id, ARTIFACT_KEY);
        setSignatureState(signatures);
        const director = signatures.signers.find((item) => item.slot === "diretoria");
        if (!director) {
          throw new Error("A assinatura da Diretoria não foi confirmada integralmente no banco.");
        }
        const finalized = await finalizeHabiteSePermit(process.id);
        setPermit(finalized.permit);
        setDirectorRequestPending(false);
        setNotice("Alvará de Habite-se assinado pela Diretoria. Processo finalizado com êxito.");
      }

      setPasswordDialog(null);
      setPassword("");
      await onProcessRefresh?.();
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível concluir a assinatura.");
    } finally {
      setBusy("");
    }
  };

  const openOfficialDocument = (autoPrint = false) => {
    if (!permit) return;
    const windowRef = window.open("", "_blank");
    if (!windowRef) {
      setNotice("O navegador bloqueou a abertura do Alvará. Permita pop-ups e tente novamente.");
      return;
    }

    const analyst = signatureState.signers.find((item) => item.slot === "analise_tecnica");
    const director = signatureState.signers.find((item) => item.slot === "diretoria");
    const statusText = permit.status === "emitido" ? "EMITIDO" : permit.status === "aguardando_diretor" ? "AGUARDANDO DIRETORIA" : "RASCUNHO";
    windowRef.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(permit.permitNumber)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#142033;margin:0;background:#eef3f8}.sheet{width:190mm;min-height:267mm;margin:10mm auto;background:#fff;padding:14mm;box-sizing:border-box;border:1px solid #d8e2ec}.head{text-align:center;border-bottom:3px solid #154d72;padding-bottom:14px}.eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#5b6b7b}.title{font-size:25px;font-weight:800;margin:8px 0;color:#123f61}.number{font-size:13px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.box{border:1px solid #dbe4ec;border-radius:9px;padding:10px}.label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#68788a;font-weight:700}.value{font-size:12px;font-weight:700;margin-top:5px}.section{margin-top:16px;border:1px solid #dbe4ec;border-radius:9px;padding:12px}.section h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;color:#24516e}.text{font-size:12px;line-height:1.55;white-space:pre-wrap}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px}.sig{border-top:1px solid #68788a;padding-top:8px;font-size:11px;text-align:center}.status{display:inline-block;margin-top:9px;padding:5px 10px;border:1px solid #8ab7d2;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.1em}.foot{margin-top:26px;font-size:9px;color:#657486;border-top:1px solid #e1e8ee;padding-top:10px}@media print{body{background:#fff}.sheet{border:0;margin:0;width:auto;min-height:auto;padding:8mm}}
      </style></head><body><main class="sheet"><header class="head"><div class="eyebrow">${escapeHtml(municipalityName)}</div><div class="title">ALVARÁ DE HABITE-SE</div><div class="number">${escapeHtml(permit.permitNumber)}</div><div class="status">${statusText}</div></header>
      <div class="grid">
        <div class="box"><div class="label">Processo</div><div class="value">${escapeHtml(process.protocol)}</div></div>
        <div class="box"><div class="label">Modalidade</div><div class="value">${escapeHtml(permit.formData.modality)}</div></div>
        <div class="box"><div class="label">Proprietário</div><div class="value">${escapeHtml(process.ownerName)}</div></div>
        <div class="box"><div class="label">Responsável técnico</div><div class="value">${escapeHtml(process.technicalLead)}</div></div>
        <div class="box"><div class="label">Imóvel</div><div class="value">${escapeHtml(process.address)}</div></div>
        <div class="box"><div class="label">Área / uso</div><div class="value">${escapeHtml(Number(process.property.area||0).toLocaleString("pt-BR"))} m² • ${escapeHtml(process.property.usage)}</div></div>
        <div class="box"><div class="label">Processo de origem</div><div class="value">${escapeHtml(permit.formData.sourceProcess || "Não informado")}</div></div>
        <div class="box"><div class="label">Alvará de origem</div><div class="value">${escapeHtml(permit.formData.sourcePermit || "Não informado")}</div></div>
      </div>
      <section class="section"><h3>Certificação municipal</h3><div class="text">Após análise documental, vistoria/conferência e confirmação do recolhimento da taxa de Habite-se, fica certificado o atendimento das condições registradas neste processo para ocupação do imóvel descrito acima.</div></section>
      <section class="section"><h3>Condições / ressalvas</h3><div class="text">${escapeHtml(permit.formData.conditions || "Sem ressalvas registradas.")}</div></section>
      <section class="section"><h3>Observações do Analista Técnico</h3><div class="text">${escapeHtml(permit.formData.observations || "Sem observações complementares.")}</div></section>
      <div class="signatures">
        <div class="sig"><strong>${escapeHtml(analyst?.name || permit.analystName || "Analista Técnico")}</strong><br>Analista Técnico<br>${escapeHtml(formatDateTime(analyst?.signed_at))}</div>
        <div class="sig"><strong>${escapeHtml(director?.name || permit.directorName || "Diretoria")}</strong><br>Diretoria<br>${escapeHtml(formatDateTime(director?.signed_at || permit.issuedAt))}</div>
      </div>
      <footer class="foot">Código de verificação: ${escapeHtml(signatureState.block?.verification_code || "Aguardando assinatura final")} • Documento eletrônico vinculado ao processo ${escapeHtml(process.protocol)}.</footer>
      </main>${autoPrint ? '<script>window.addEventListener("load",()=>window.print())<\/script>' : ""}</body></html>`);
    windowRef.document.close();
  };

  if (!paymentConfirmed && !permit) {
    return (
      <Card className="rounded-[24px] border-amber-200 bg-white shadow-sm dark:border-amber-500/30 dark:bg-slate-900">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-slate-950 dark:text-white">Alvará de Habite-se aguardando pagamento</p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Após a confirmação do pagamento pelo Financeiro, o processo retorna automaticamente ao Analista responsável para elaboração e assinatura do Alvará de Habite-se.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card data-habite-se-permit-panel="true" className="overflow-hidden rounded-[24px] border-sky-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-sky-500/30 dark:bg-slate-900">
        <CardHeader className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf8ff_100%)] dark:border-sky-500/20 dark:bg-[linear-gradient(135deg,#0c2032_0%,#103650_100%)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileBadge2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                <CardTitle className="text-slate-950 dark:text-white">Alvará de Habite-se</CardTitle>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Documento final deste processo. O Analista elabora e assina a versão; a Diretoria realiza a assinatura final, que conclui automaticamente o processo.
              </p>
            </div>
            <Badge variant="outline" className={
              permit?.status === "emitido"
                ? "w-fit border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                : permit?.status === "aguardando_diretor"
                  ? "w-fit border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200"
                  : "w-fit border-sky-300 bg-white text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-200"
            }>
              {permit?.status === "emitido" ? "Emitido e finalizado" : permit?.status === "aguardando_diretor" ? "Aguardando Diretoria" : "Em elaboração"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Número</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{permit?.permitNumber || "Gerado ao salvar"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Área certificada</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{Number(process.property.area || 0).toLocaleString("pt-BR")} m²</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Analista responsável</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{permit?.analystName || process.analysis?.assignedTo || "Aguardando"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Diretoria</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{permit?.directorName || (directorRequestPending ? "Assinatura pendente" : "Aguardando encaminhamento")}</p>
            </div>
          </div>

          {!externalView && canManage && permit?.status !== "emitido" ? (
            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/35 lg:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Modalidade</label>
                <Input value={form.modality} onChange={(event) => setForm((current) => ({ ...current, modality: event.target.value }))} className="mt-2 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Conclusão informada</label>
                <Input value={form.completionDate} onChange={(event) => setForm((current) => ({ ...current, completionDate: event.target.value }))} className="mt-2 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Processo de aprovação de origem</label>
                <Input value={form.sourceProcess} onChange={(event) => setForm((current) => ({ ...current, sourceProcess: event.target.value }))} className="mt-2 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Alvará de origem</label>
                <Input value={form.sourcePermit} onChange={(event) => setForm((current) => ({ ...current, sourcePermit: event.target.value }))} className="mt-2 bg-white dark:bg-slate-950" />
              </div>
              <div className="lg:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Condições / ressalvas</label>
                <Textarea value={form.conditions} onChange={(event) => setForm((current) => ({ ...current, conditions: event.target.value }))} className="mt-2 min-h-24 bg-white dark:bg-slate-950" placeholder="Sem ressalvas, ou informe as condições aplicáveis." />
              </div>
              <div className="lg:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Observações do Analista Técnico</label>
                <Textarea value={form.observations} onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))} className="mt-2 min-h-28 bg-white dark:bg-slate-950" placeholder="Registre somente observações técnicas pertinentes ao Habite-se." />
              </div>
            </div>
          ) : null}

          {permit && signatureState.block && !signatureMatchesCurrent && permit.status !== "emitido" ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
              Esta versão foi retificada após a última assinatura. A assinatura anterior continua preservada no histórico, mas a versão atual precisa ser assinada novamente pelo Analista antes de retornar à Diretoria.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className={
              "rounded-2xl border p-4 " +
              (analystSigned ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-950/25" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/35")
            }>
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-5 w-5 text-sky-700 dark:text-sky-300" />
                <div>
                  <p className="text-sm font-bold text-slate-950 dark:text-white">Assinatura do Analista Técnico</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {analystSigned ? `${analystSigner?.name} • ${formatDateTime(analystSigner?.signed_at)}` : "Obrigatória antes do encaminhamento à Diretoria."}
                  </p>
                </div>
              </div>
            </div>
            <div className={
              "rounded-2xl border p-4 " +
              (directorSigned ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-950/25" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/35")
            }>
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-violet-700 dark:text-violet-300" />
                <div>
                  <p className="text-sm font-bold text-slate-950 dark:text-white">Assinatura final da Diretoria</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {directorSigned ? `${directorSigner?.name} • ${formatDateTime(directorSigner?.signed_at)}` : permit?.status === "aguardando_diretor" ? "Solicitação formal enviada à Diretoria." : "Disponível após a assinatura do Analista."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {notice ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-100">
              {notice}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            {!externalView && canManage && permit?.status !== "emitido" ? (
              <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(busy)} onClick={() => void saveDraft()}>
                {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar / retificar Alvará
              </Button>
            ) : null}

            {!externalView && canManage && permit && permit.status !== "emitido" && !analystSigned ? (
              <Button type="button" className="rounded-full bg-sky-700 font-bold !text-white hover:bg-sky-600 [&_*]:!text-white" disabled={Boolean(busy)} onClick={() => openSignature("analyst")}>
                <Signature className="mr-2 h-4 w-4" />
                Assinar e encaminhar à Diretoria
              </Button>
            ) : null}

            {!externalView && isDirector && permit?.status === "aguardando_diretor" && !directorSigned ? (
              <Button type="button" className="rounded-full bg-violet-700 font-bold !text-white hover:bg-violet-600 [&_*]:!text-white" disabled={Boolean(busy)} onClick={() => openSignature("director")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Assinar como Diretor e finalizar
              </Button>
            ) : null}

            {permit ? (
              <>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => openOfficialDocument(false)}>
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  Visualizar Alvará
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => openOfficialDocument(true)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
              </>
            ) : null}
          </div>

          {permit?.status === "emitido" ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/25">
              <div className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 h-6 w-6 text-emerald-700 dark:text-emerald-300" />
                <div>
                  <p className="font-black text-emerald-950 dark:text-emerald-100">Processo de Habite-se finalizado</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-200">
                    O Alvará {permit.permitNumber} foi assinado pela Diretoria em {formatDateTime(permit.issuedAt)}. A conclusão e o código de verificação permanecem vinculados ao histórico oficial do processo.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(passwordDialog)} onOpenChange={(open) => !open && !busy && setPasswordDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {passwordDialog === "director" ? "Assinatura final da Diretoria" : "Assinatura do Analista Técnico"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              Confirme sua senha de acesso. A assinatura eletrônica será vinculada exatamente a esta versão do Alvará de Habite-se.
            </p>
            <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha de acesso" />
            <Button type="button" className="w-full bg-sky-700 font-bold !text-white hover:bg-sky-600" disabled={!password || Boolean(busy)} onClick={() => void confirmSignature()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Signature className="mr-2 h-4 w-4" />}
              Confirmar assinatura eletrônica
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
