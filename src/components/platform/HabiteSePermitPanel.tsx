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
  openHabiteSePermitPdf,
  reserveHabiteSePermitPdfWindow,
} from "@/lib/habiteSePermitPdf";
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

type HabiteSePermitVisualCache = {
  processId: string;
  sessionId: string;
  permit: HabiteSePermitRecord | null;
  form: HabiteSePermitFormData;
  signatureState: ArtifactSignatureSnapshot;
  directorRequestPending: boolean;
  savedAt: number;
};

function permitVisualCacheKey(processId: string, sessionId: string) {
  return `sigapro.habite-se.permit.visual.v1:${sessionId}:${processId}`;
}

function readPermitVisualCache(
  processId: string,
  sessionId: string,
): HabiteSePermitVisualCache | null {
  if (typeof window === "undefined" || !processId || !sessionId || sessionId === "unknown") return null;
  try {
    const raw = window.localStorage.getItem(permitVisualCacheKey(processId, sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HabiteSePermitVisualCache>;
    if (parsed.processId !== processId || parsed.sessionId !== sessionId || !parsed.form) return null;
    return {
      processId,
      sessionId,
      permit: parsed.permit ?? null,
      form: parsed.form as HabiteSePermitFormData,
      signatureState: parsed.signatureState ?? { block: null, signers: [] },
      directorRequestPending: parsed.directorRequestPending === true,
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

function writePermitVisualCache(value: HabiteSePermitVisualCache) {
  if (typeof window === "undefined" || !value.processId || !value.sessionId || value.sessionId === "unknown") return;
  try {
    window.localStorage.setItem(
      permitVisualCacheKey(value.processId, value.sessionId),
      JSON.stringify(value),
    );
  } catch {
    // Cache somente visual: o banco continua sendo a fonte oficial.
  }
}

function mergeAutomaticPermitForm(
  process: ProcessRecord,
  defaults?: Partial<HabiteSePermitFormData> | null,
  saved?: Partial<HabiteSePermitFormData> | null,
): HabiteSePermitFormData {
  const automatic = {
    ...initialForm(process),
    ...(defaults ?? {}),
  };

  const choose = (savedValue: unknown, automaticValue: unknown) => {
    const normalizedSaved = String(savedValue ?? "").trim();
    return normalizedSaved || String(automaticValue ?? "");
  };

  return {
    modality: choose(saved?.modality, automatic.modality),
    sourceProcess: choose(saved?.sourceProcess, automatic.sourceProcess),
    sourcePermit: choose(saved?.sourcePermit, automatic.sourcePermit),
    completionDate: choose(saved?.completionDate, automatic.completionDate),
    conditions: choose(saved?.conditions, automatic.conditions),
    observations: choose(saved?.observations, automatic.observations),
  };
}

export function HabiteSePermitPanel({
  process,
  session,
  externalView = false,
  municipalityName = "Prefeitura Municipal",
  municipalityLogoUrl,
  municipalityAddress,
  municipalityPhone,
  municipalityEmail,
  secretariat,
  directorate,
  onProcessRefresh,
}: {
  process: ProcessRecord;
  session: SessionUser;
  externalView?: boolean;
  municipalityName?: string | null;
  municipalityLogoUrl?: string | null;
  municipalityAddress?: string | null;
  municipalityPhone?: string | null;
  municipalityEmail?: string | null;
  secretariat?: string | null;
  directorate?: string | null;
  onProcessRefresh?: () => Promise<void> | void;
}) {
  const habiteSeGuide = process.payment.guides?.find((guide) => guide.kind === "habite_se");
  const paymentConfirmed = habiteSeGuide?.status === "compensada";
  const initialVisual = useMemo(
    () => readPermitVisualCache(process.id, session.id),
    [process.id, session.id],
  );
  const [permit, setPermit] = useState<HabiteSePermitRecord | null>(
    () => initialVisual?.permit ?? null,
  );
  const [form, setForm] = useState<HabiteSePermitFormData>(
    () => initialVisual?.form ?? initialForm(process),
  );
  // Permissão operacional continua sendo revalidada no banco.
  const [canManage, setCanManage] = useState(false);
  const [signatureState, setSignatureState] = useState<ArtifactSignatureSnapshot>(
    () => initialVisual?.signatureState ?? { block: null, signers: [] },
  );
  const [directorRequestPending, setDirectorRequestPending] = useState(
    () => initialVisual?.directorRequestPending ?? false,
  );
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
    setForm(
      mergeAutomaticPermitForm(
        process,
        snapshot.defaults,
        snapshot.permit?.formData,
      ),
    );

    const signatures = await getProcessArtifactSignatures(process.id, ARTIFACT_KEY);
    setSignatureState(signatures);

    const request = await getProcessArtifactSignatureRequest(
      process.id,
      ARTIFACT_KEY,
      "diretoria",
    );
    const nextDirectorRequestPending = request.request?.status === "pending";
    setDirectorRequestPending(nextDirectorRequestPending);
    writePermitVisualCache({
      processId: process.id,
      sessionId: session.id,
      permit: snapshot.permit,
      form: mergeAutomaticPermitForm(
        process,
        snapshot.defaults,
        snapshot.permit?.formData,
      ),
      signatureState: signatures,
      directorRequestPending: nextDirectorRequestPending,
      savedAt: Date.now(),
    });
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
        setForm(
          mergeAutomaticPermitForm(
            process,
            snapshot.defaults,
            snapshot.permit?.formData,
          ),
        );
        setSignatureState(signatures);
        const nextDirectorRequestPending = request.request?.status === "pending";
        setDirectorRequestPending(nextDirectorRequestPending);
        writePermitVisualCache({
          processId: process.id,
          sessionId: session.id,
          permit: snapshot.permit,
          form: mergeAutomaticPermitForm(
            process,
            snapshot.defaults,
            snapshot.permit?.formData,
          ),
          signatureState: signatures,
          directorRequestPending: nextDirectorRequestPending,
          savedAt: Date.now(),
        });
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : "Não foi possível carregar o Alvará de Habite-se.");
      });
    return () => {
      active = false;
    };
  }, [paymentConfirmed, process.id, process.status]);

  useEffect(() => {
    if (!process.id || !session.id || session.id === "unknown") return;
    writePermitVisualCache({
      processId: process.id,
      sessionId: session.id,
      permit,
      form,
      signatureState,
      directorRequestPending,
      savedAt: Date.now(),
    });
  }, [
    directorRequestPending,
    form,
    permit,
    process.id,
    session.id,
    signatureState,
  ]);

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

  const openOfficialDocument = async (autoPrint = false) => {
    if (!permit) return;

    const reservedWindow = reserveHabiteSePermitPdfWindow({
      permit,
      process,
    });
    if (!reservedWindow) {
      setNotice(
        "O navegador bloqueou a abertura do PDF. Libere pop-ups para o SIGAPRO e tente novamente.",
      );
      return;
    }

    const pdfBusyKey = autoPrint ? "print-pdf" : "preview-pdf";
    setBusy(pdfBusyKey);
    setNotice("");

    try {
      await openHabiteSePermitPdf(
        {
          permit,
          process,
          municipalityName: municipalityName || "Prefeitura Municipal",
          municipalityLogoUrl,
          municipalityAddress,
          municipalityPhone,
          municipalityEmail,
          secretariat,
          directorate,
          analystSignature: analystSigner
            ? {
                name: analystSigner.name,
                role: analystSigner.role,
                title: analystSigner.title,
                registration: analystSigner.registration,
                signedAt: analystSigner.signed_at,
              }
            : null,
          directorSignature: directorSigner
            ? {
                name: directorSigner.name,
                role: directorSigner.role,
                title: directorSigner.title,
                registration: directorSigner.registration,
                signedAt: directorSigner.signed_at,
              }
            : null,
          verificationCode: signatureMatchesCurrent
            ? signatureState.block?.verification_code
            : null,
          evidenceHash: signatureMatchesCurrent
            ? signatureState.block?.artifact_hash
            : null,
        },
        reservedWindow,
      );

      if (autoPrint) {
        window.setTimeout(() => {
          try {
            if (!reservedWindow.closed) {
              reservedWindow.focus();
              reservedWindow.print();
            }
          } catch {
            // O visualizador nativo continua aberto para impressão manual.
          }
        }, 900);
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o PDF oficial do Alvará de Habite-se.",
      );
    } finally {
      setBusy("");
    }
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
      <Card data-habite-se-permit-panel="true" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
        <CardHeader
          data-force-card-contrast="dark"
          data-premium-process-dark-header="habite-se-permit"
          className="border-b border-white/10 bg-[linear-gradient(135deg,#06192b_0%,#0a4166_52%,#0879a8_100%)] px-5 py-5 text-white shadow-[0_14px_34px_rgba(3,38,65,0.18)] dark:border-slate-700"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-sky-400/15 !text-white shadow-inner">
                <FileBadge2 className="h-6 w-6 !text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] !text-sky-100">
                  Licenciamento de ocupação
                </p>
                <CardTitle className="mt-1 text-xl font-bold !text-white">
                  Alvará de Habite-se
                </CardTitle>
                <p className="mt-1 max-w-3xl text-sm leading-6 !text-slate-200">
                  Documento final do Habite-se, preparado pelo Analista Técnico após vistoria e pagamento, com assinatura conclusiva da Diretoria.
                </p>
              </div>
            </div>
            <Badge
              data-habite-se-status-badge="true"
              data-status={permit?.status || "rascunho"}
              className={
                permit?.status === "emitido"
                  ? "w-fit rounded-full border border-emerald-200/50 bg-emerald-600 px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] !text-white shadow-[0_7px_18px_rgba(5,150,105,0.24)] [&_*]:!text-white"
                  : permit?.status === "aguardando_diretor"
                    ? "w-fit rounded-full border border-violet-200/50 bg-violet-700 px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] !text-white shadow-[0_7px_18px_rgba(109,40,217,0.24)] [&_*]:!text-white"
                    : "w-fit rounded-full border border-sky-100/70 bg-[#075985] px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] !text-white shadow-[0_7px_18px_rgba(3,37,65,0.32)] [&_*]:!text-white"
              }
            >
              <span className="!text-white">
                {permit?.status === "emitido"
                  ? "Emitido e finalizado"
                  : permit?.status === "aguardando_diretor"
                    ? "Aguardando Diretoria"
                    : "Em elaboração"}
              </span>
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Número</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{permit?.permitNumber || "Gerado ao salvar"}</p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Área certificada</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{Number(process.property.area || 0).toLocaleString("pt-BR")} m²</p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Analista responsável</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{permit?.analystName || process.analysis?.assignedTo || "Aguardando"}</p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Diretoria</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">{permit?.directorName || (directorRequestPending ? "Assinatura pendente" : "Aguardando encaminhamento")}</p>
            </div>
          </div>

          {!externalView && canManage && permit?.status !== "emitido" ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/35">
              <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-950/25 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black text-sky-950 dark:text-sky-100">
                    Dados recuperados automaticamente do processo
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-sky-800 dark:text-sky-200">
                    Modalidade, conclusão da obra, processo de origem e Alvará de origem são reaproveitados do protocolo oficial, como no Alvará de Construção.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit shrink-0 rounded-full border-sky-300 bg-white text-sky-800 dark:border-sky-500/40 dark:bg-slate-900 dark:text-sky-200">
                  Preenchimento automático
                </Badge>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Modalidade</label>
                <Input value={form.modality} onChange={(event) => setForm((current) => ({ ...current, modality: event.target.value }))} className="mt-2 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Conclusão informada</label>
                <Input type="date" value={form.completionDate} onChange={(event) => setForm((current) => ({ ...current, completionDate: event.target.value }))} className="mt-2 bg-white dark:bg-slate-950" />
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
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={busy === "preview-pdf" || busy === "print-pdf"}
                  onClick={() => void openOfficialDocument(false)}
                >
                  {busy === "preview-pdf" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="mr-2 h-4 w-4" />
                  )}
                  {busy === "preview-pdf" ? "Gerando PDF..." : "Abrir PDF oficial"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={busy === "preview-pdf" || busy === "print-pdf"}
                  onClick={() => void openOfficialDocument(true)}
                >
                  {busy === "print-pdf" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="mr-2 h-4 w-4" />
                  )}
                  {busy === "print-pdf" ? "Preparando impressão..." : "Imprimir"}
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
