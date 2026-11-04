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
  RotateCcw,
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
import { backendClient } from "@/integrations/backend/databaseClient";
import type { ProcessRecord, SessionUser } from "@/lib/platform";
import { userCanSignPermitAsDirector, userCanSignPermitAsSecretary } from "@/lib/constructionPermit";
import {
  openHabiteSePermitPdf,
  reserveHabiteSePermitPdfWindow,
} from "@/lib/habiteSePermitPdf";
import {
  getProcessArtifactSignatureRequest,
  getProcessArtifactSignatures,
  requestHabiteSeSecretarySignature,
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

const DEFAULT_HABITE_SE_CONDITIONS =
  "Sem ressalvas ou condicionantes pendentes registradas no processo para a emissão deste Alvará de Habite-se, sem prejuízo das obrigações e responsabilidades técnicas previstas na legislação aplicável.";

const DEFAULT_HABITE_SE_TECHNICAL_OBSERVATION =
  "Com base na documentação técnica, no projeto aprovado e nos registros de vistoria constantes do processo, a edificação encontra-se concluída e apta à ocupação para o uso declarado, observadas as condições do licenciamento, as normas técnicas aplicáveis e as responsabilidades dos profissionais legalmente habilitados.";

function initialForm(process: ProcessRecord): HabiteSePermitFormData {
  return {
    observations: DEFAULT_HABITE_SE_TECHNICAL_OBSERVATION,
    conditions: DEFAULT_HABITE_SE_CONDITIONS,
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
  const base = initialForm(process);
  const choose = (savedValue: unknown, automaticValue: unknown) => {
    const normalizedSaved = String(savedValue ?? "").trim();
    return normalizedSaved || String(automaticValue ?? "");
  };
  const automatic = {
    ...base,
    ...(defaults ?? {}),
    conditions: choose(defaults?.conditions, base.conditions),
    observations: choose(defaults?.observations, base.observations),
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
  onCompleteProcess,
  onReopenProcess,
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
  onCompleteProcess?: () => Promise<void> | void;
  onReopenProcess?: (reason: string) => Promise<void> | void;
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
    () => mergeAutomaticPermitForm(process, null, initialVisual?.form),
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
  const [passwordDialog, setPasswordDialog] = useState<"director" | "secretary" | null>(null);
  const [secretaryRequestPending, setSecretaryRequestPending] = useState(false);
  const [password, setPassword] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState<ProcessRecord["status"]>(process.status);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const lifecycleCompleted = ["deferido", "arquivado"].includes(lifecycleStatus);

  useEffect(() => {
    setLifecycleStatus(process.status);
  }, [process.status]);

  useEffect(() => {
    if (!process.id || typeof window === "undefined") return;

    let disposed = false;
    let inFlight = false;

    const syncLifecycle = async () => {
      if (
        disposed ||
        inFlight ||
        (typeof document !== "undefined" && document.visibilityState !== "visible")
      ) {
        return;
      }

      inFlight = true;
      try {
        const { data, error } = await backendClient
          .from("processes")
          .select("id,status,updated_at")
          .eq("id", process.id)
          .limit(1);

        if (error || disposed) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.status) {
          setLifecycleStatus(row.status as ProcessRecord["status"]);
        }
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncLifecycle();
    };

    void syncLifecycle();
    const timer = window.setInterval(() => void syncLifecycle(), 1200);
    window.addEventListener("focus", syncLifecycle);
    window.addEventListener("pageshow", syncLifecycle);
    window.addEventListener("online", syncLifecycle);
    window.addEventListener("sigapro:data-changed", syncLifecycle as EventListener);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncLifecycle);
      window.removeEventListener("pageshow", syncLifecycle);
      window.removeEventListener("online", syncLifecycle);
      window.removeEventListener("sigapro:data-changed", syncLifecycle as EventListener);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [process.id]);

  const isDirector = userCanSignPermitAsDirector(session);
  const isSecretary = userCanSignPermitAsSecretary(session);
  const canCloseProcess =
    canManage ||
    isDirector ||
    ["prefeitura_admin", "prefeitura_supervisor", "master_admin", "master_ops"].includes(session.role);

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

    const [directorRequest, secretaryRequest] = await Promise.all([
      getProcessArtifactSignatureRequest(process.id, ARTIFACT_KEY, "diretoria"),
      getProcessArtifactSignatureRequest(process.id, ARTIFACT_KEY, "secretaria"),
    ]);
    const nextDirectorRequestPending =
      directorRequest.request?.status === "pending" ||
      snapshot.permit?.status === "aguardando_diretor";
    setDirectorRequestPending(nextDirectorRequestPending);
    setSecretaryRequestPending(secretaryRequest.request?.status === "pending");
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
      getProcessArtifactSignatureRequest(process.id, ARTIFACT_KEY, "secretaria"),
    ])
      .then(([snapshot, signatures, request, secretaryRequest]) => {
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
        const nextDirectorRequestPending = request.request?.status === "pending" || snapshot.permit?.status === "aguardando_diretor";
        setDirectorRequestPending(nextDirectorRequestPending);
        setSecretaryRequestPending(secretaryRequest.request?.status === "pending");
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
    if (
      (!paymentConfirmed && !["deferido", "arquivado"].includes(process.status)) ||
      typeof window === "undefined"
    ) {
      return;
    }

    let disposed = false;
    let inFlight = false;

    const syncNow = async () => {
      if (
        disposed ||
        inFlight ||
        (typeof document !== "undefined" && document.visibilityState !== "visible")
      ) {
        return;
      }

      inFlight = true;
      try {
        await refresh();
      } catch {
        // Revalidação silenciosa: a leitura oficial será tentada novamente
        // no próximo pulso, foco da janela ou retorno de visibilidade.
      } finally {
        inFlight = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncNow();
    };

    void syncNow();
    const timer = window.setInterval(() => void syncNow(), 2500);
    window.addEventListener("focus", syncNow);
    window.addEventListener("pageshow", syncNow);
    window.addEventListener("online", syncNow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncNow);
      window.removeEventListener("pageshow", syncNow);
      window.removeEventListener("online", syncNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [paymentConfirmed, process.id, process.status, session.id]);

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
  const directorSigner = signatureMatchesCurrent
    ? signatureState.signers.find((item) => item.slot === "diretoria")
    : undefined;
  const secretarySigner = signatureMatchesCurrent
    ? signatureState.signers.find((item) => item.slot === "secretaria")
    : undefined;
  const directorSigned = Boolean(directorSigner) || permit?.status === "emitido";
  const secretarySigned = Boolean(secretarySigner);
  const effectivePermitStatus = directorSigned ? "emitido" : permit?.status || "rascunho";
  const effectiveDirectorName =
    directorSigner?.name || permit?.directorName || null;

  useEffect(() => {
    if (
      canCloseProcess &&
      onCompleteProcess &&
      notice === "Sua conta não possui atribuição para concluir administrativamente este processo."
    ) {
      setNotice("");
    }
  }, [canCloseProcess, notice, onCompleteProcess]);

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
      setNotice("");
      return saved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar o Alvará.");
      return null;
    } finally {
      setBusy("");
    }
  };

  const requestDirectorSignature = async () => {
    if (!paymentConfirmed) {
      setNotice("O pagamento da Guia de Habite-se precisa estar confirmado antes do encaminhamento à Diretoria.");
      return;
    }
    if (!canManage) {
      setNotice("Somente o responsável pela elaboração pode encaminhar este Alvará à Diretoria.");
      return;
    }

    setBusy("request-director");
    setNotice("");
    try {
      const saved = await saveHabiteSePermit({
        processId: process.id,
        permitNumber: permit?.permitNumber,
        formData: form,
      });
      const waiting = await setHabiteSePermitAwaitingDirector(process.id);
      setPermit(waiting);
      setForm(waiting.formData);
      setDirectorRequestPending(true);
      setSignatureState({ block: null, signers: [] });
      setNotice("");
      await onProcessRefresh?.();
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível encaminhar o Alvará à Diretoria.");
    } finally {
      setBusy("");
    }
  };

  const requestSecretarySignature = async () => {
    if (!directorSigned || !signatureState.block?.artifact_hash) {
      setNotice("A assinatura complementar da Secretaria só pode ser solicitada depois da assinatura da Diretoria.");
      return;
    }
    if (!canCloseProcess) {
      setNotice("Somente a Diretoria ou a administração pode solicitar a assinatura complementar da Secretaria.");
      return;
    }

    setBusy("request-secretary");
    setNotice("");
    try {
      await requestHabiteSeSecretarySignature({
        processId: process.id,
        artifactKey: ARTIFACT_KEY,
        artifactHash: signatureState.block.artifact_hash,
      });
      setSecretaryRequestPending(true);
      await onProcessRefresh?.();
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível solicitar a assinatura complementar da Secretaria.",
      );
    } finally {
      setBusy("");
    }
  };

  const openSignature = (kind: "director" | "secretary") => {
    if (kind === "director") {
      if (!isDirector) {
        setNotice("Somente o Diretor responsável pode assinar eletronicamente o Alvará de Habite-se.");
        return;
      }
      if (!permit || permit.status !== "aguardando_diretor") {
        setNotice("O Alvará ainda não foi formalmente encaminhado para assinatura da Diretoria.");
        return;
      }
    } else {
      if (!isSecretary) {
        setNotice("Somente um perfil de Secretário(a) pode registrar a assinatura complementar.");
        return;
      }
      if (!directorSigned || !secretaryRequestPending || secretarySigned) {
        setNotice("A assinatura complementar da Secretaria precisa estar formalmente solicitada e ainda pendente.");
        return;
      }
    }
    setPassword("");
    setPasswordDialog(kind);
  };

  const confirmSignature = async () => {
    if (!passwordDialog || !password.trim() || !permit) return;

    const signingSecretary = passwordDialog === "secretary";
    if (signingSecretary) {
      if (!isSecretary || !directorSigned || !secretaryRequestPending || secretarySigned) {
        setNotice("A assinatura complementar da Secretaria não está disponível para esta conta ou para esta versão.");
        return;
      }
    } else if (!isDirector || permit.status !== "aguardando_diretor") {
      setNotice("A assinatura eletrônica da Diretoria exige encaminhamento prévio e perfil autorizado.");
      return;
    }

    setBusy(signingSecretary ? "sign-secretary" : "sign-director");
    setNotice("");
    try {
      const payload = buildPermitPayload(process, { ...permit, formData: form });
      const slot = signingSecretary ? "secretaria" : "diretoria";

      await signProcessArtifactWithPassword({
        processId: process.id,
        artifactType: ARTIFACT_TYPE,
        artifactKey: ARTIFACT_KEY,
        signerSlot: slot,
        password,
        payload,
      });

      const signatures = await getProcessArtifactSignatures(process.id, ARTIFACT_KEY);
      const signer = signatures.signers.find((item) => item.slot === slot);
      if (!signatures.block || !signer) {
        throw new Error("A assinatura foi enviada, mas ainda não pôde ser confirmada no banco oficial.");
      }

      setSignatureState(signatures);
      if (signingSecretary) {
        setSecretaryRequestPending(false);
      } else {
        const finalized = await finalizeHabiteSePermit(process.id);
        setPermit(finalized.permit);
        setDirectorRequestPending(false);
      }
      setPasswordDialog(null);
      setPassword("");
      setNotice("");
      await onProcessRefresh?.();
      await refresh();
    } catch (error) {
      setPassword("");
      setNotice(error instanceof Error ? error.message : "Não foi possível concluir a assinatura eletrônica.");
    } finally {
      setBusy("");
    }
  };

  const completeProcess = async () => {
    if (!directorSigned || !permit) {
      setNotice("O processo só pode ser concluído depois da assinatura válida da Diretoria.");
      return;
    }
    if (!canCloseProcess || !onCompleteProcess) {
      setNotice("Sua conta não possui atribuição para concluir administrativamente este processo.");
      return;
    }

    setBusy("complete-process");
    setNotice("");
    try {
      await onCompleteProcess();
      setLifecycleStatus("deferido");
      window.dispatchEvent(new Event("sigapro:data-changed"));
      await onProcessRefresh?.();
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir administrativamente o processo.",
      );
    } finally {
      setBusy("");
    }
  };

  const reopenCompletedProcess = async () => {
    const reason = reopenReason.trim();
    if (!reason) {
      setNotice("Informe o motivo da reabertura para manter a rastreabilidade administrativa.");
      return;
    }
    if (!canCloseProcess || !onReopenProcess) {
      setNotice("Sua conta não possui atribuição para reabrir este processo.");
      return;
    }

    setBusy("reopen-process");
    setNotice("");
    try {
      await onReopenProcess(reason);
      setLifecycleStatus("reapresentacao");
      setReopenDialogOpen(false);
      setReopenReason("");
      window.dispatchEvent(new Event("sigapro:data-changed"));
      await onProcessRefresh?.();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível reabrir administrativamente o processo.",
      );
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
          directorSignature: directorSigner
            ? {
                name: directorSigner.name,
                role: directorSigner.role,
                title: directorSigner.title,
                registration: directorSigner.registration,
                signedAt: directorSigner.signed_at,
              }
            : null,
          secretarySignature: secretarySigner
            ? {
                name: secretarySigner.name,
                role: secretarySigner.role,
                title: secretarySigner.title,
                registration: secretarySigner.registration,
                signedAt: secretarySigner.signed_at,
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
              data-status={effectivePermitStatus}
              className={
                effectivePermitStatus === "emitido"
                  ? "w-fit rounded-full border border-emerald-200/50 bg-emerald-600 px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] !text-white shadow-[0_7px_18px_rgba(5,150,105,0.24)] [&_*]:!text-white"
                  : effectivePermitStatus === "aguardando_diretor"
                    ? "w-fit rounded-full border border-violet-200/50 bg-violet-700 px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] !text-white shadow-[0_7px_18px_rgba(109,40,217,0.24)] [&_*]:!text-white"
                    : "w-fit rounded-full border border-sky-100/70 bg-[#075985] px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] !text-white shadow-[0_7px_18px_rgba(3,37,65,0.32)] [&_*]:!text-white"
              }
            >
              <span className="!text-white">
                {effectivePermitStatus === "emitido"
                  ? "Emitido pela Diretoria"
                  : effectivePermitStatus === "aguardando_diretor"
                    ? "Aguardando Diretoria"
                    : "Em elaboração"}
              </span>
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div data-habite-se-permit-metric="true" className="min-w-0 rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p data-habite-se-permit-metric-label="true" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Número</p>
              <p data-habite-se-permit-metric-value="true" className="mt-2 break-words text-sm font-black leading-5 text-slate-950 dark:text-white">{permit?.permitNumber || "Gerado ao salvar"}</p>
            </div>
            <div data-habite-se-permit-metric="true" className="min-w-0 rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p data-habite-se-permit-metric-label="true" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Área certificada</p>
              <p data-habite-se-permit-metric-value="true" className="mt-2 break-words text-sm font-black leading-5 text-slate-950 dark:text-white">{Number(process.property.area || 0).toLocaleString("pt-BR")} m²</p>
            </div>
            <div data-habite-se-permit-metric="true" className="min-w-0 rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p data-habite-se-permit-metric-label="true" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Analista responsável</p>
              <p data-habite-se-permit-metric-value="true" className="mt-2 break-words text-sm font-black leading-5 text-slate-950 dark:text-white">{permit?.analystName || process.analysis?.assignedTo || "Aguardando"}</p>
            </div>
            <div data-habite-se-permit-metric="true" className="min-w-0 rounded-[18px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0f172a_0%,#111827_100%)]">
              <p data-habite-se-permit-metric-label="true" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Diretoria</p>
              <p data-habite-se-permit-metric-value="true" className="mt-2 break-words text-sm font-black leading-5 text-slate-950 dark:text-white">{effectiveDirectorName || (directorRequestPending ? "Assinatura pendente" : "Aguardando encaminhamento")}</p>
            </div>
          </div>

          {!externalView && canManage && effectivePermitStatus !== "emitido" ? (
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
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Condições, ressalvas e condicionantes da emissão
                </label>
                <Textarea
                  value={form.conditions}
                  onChange={(event) => setForm((current) => ({ ...current, conditions: event.target.value }))}
                  className="mt-2 min-h-28 bg-white leading-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                  placeholder={DEFAULT_HABITE_SE_CONDITIONS}
                />
                <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Registre somente condicionantes efetivamente vinculadas ao processo, como exigências do Alvará de origem, AVCB/CLCB, licenças complementares ou ressalvas técnicas aplicáveis. Na inexistência de pendências, mantenha a declaração institucional padrão.
                </p>
              </div>
              <div className="lg:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Parecer técnico conclusivo do Analista
                </label>
                <Textarea
                  value={form.observations}
                  onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
                  className="mt-2 min-h-32 bg-white leading-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                  placeholder={DEFAULT_HABITE_SE_TECHNICAL_OBSERVATION}
                />
                <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Síntese técnica destinada ao documento final. Ajuste o texto quando houver particularidade constatada na análise, vistoria ou documentação do processo.
                </p>
              </div>
              </div>
            </div>
          ) : null}

          {!externalView && canManage && permit?.status !== "emitido" && permit?.status !== "aguardando_diretor" ? (
            <div
              data-habite-se-director-request="ready"
              className="rounded-[20px] border border-violet-200 bg-[linear-gradient(135deg,#faf8ff_0%,#f3f0ff_100%)] p-5 shadow-sm dark:border-violet-500/30 dark:bg-[linear-gradient(135deg,#17132a_0%,#111827_100%)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-sm">
                    <Signature className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      Assinatura eletrônica da Diretoria
                    </p>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                      Finalize a elaboração e envie esta versão para a fila oficial da Diretoria. O Diretor acessará o processo com a própria conta e confirmará a assinatura com a própria senha.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  data-request-director-signature="true"
                  className="rounded-full bg-violet-700 px-5 font-bold !text-white hover:bg-violet-600 [&_*]:!text-white"
                  disabled={Boolean(busy)}
                  onClick={() => void requestDirectorSignature()}
                >
                  {busy === "request-director" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Solicitar assinatura eletrônica do Diretor
                </Button>
              </div>
            </div>
          ) : null}

          {effectivePermitStatus === "aguardando_diretor" && !directorSigned ? (
            <div
              data-habite-se-director-request="pending"
              className="rounded-[20px] border border-violet-200 bg-violet-50 px-5 py-4 dark:border-violet-500/30 dark:bg-violet-950/25"
            >
              <div className="flex items-center gap-3">
                <Send className="h-5 w-5 text-violet-700 dark:text-violet-300" />
                <div>
                  <p className="text-sm font-bold text-violet-950 dark:text-violet-100">
                    Solicitação enviada à Diretoria
                  </p>
                  <p className="mt-1 text-xs leading-5 text-violet-800 dark:text-violet-200">
                    O Alvará está na fila de assinatura. O Diretor responsável deve abrir este processo e confirmar eletronicamente com a própria senha.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {directorSigned ? (
            <div className="space-y-3">
              <div
                data-habite-se-director-request="signed"
                className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-950/25"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                  <div>
                    <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                      Assinatura obrigatória da Diretoria validada
                    </p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                      ${directorSigner?.name || "Diretor responsável"} • ${formatDateTime(directorSigner?.signed_at || permit?.issuedAt)}
                    </p>
                  </div>
                </div>
              </div>

              {!secretarySigned ? (
                <div
                  data-habite-se-secretary-signature="optional"
                  className="rounded-[20px] border border-sky-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eff8ff_100%)] p-5 dark:border-sky-500/30 dark:bg-[linear-gradient(135deg,#0d2032_0%,#10283d_100%)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                        Assinatura complementar opcional
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                        Secretaria responsável
                      </p>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                        A assinatura da Secretaria não é requisito para a validade ou conclusão do Habite-se. Solicite apenas nos casos em que a autoridade competente desejar subscrição complementar.
                      </p>
                      {secretaryRequestPending ? (
                        <p className="mt-2 text-xs font-bold text-sky-800 dark:text-sky-200">
                          Solicitação enviada. A Secretaria pode assinar com a própria conta e senha.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!secretaryRequestPending && canCloseProcess ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-sky-300 text-sky-800 dark:border-sky-500/40 dark:text-sky-200"
                          disabled={Boolean(busy)}
                          onClick={() => void requestSecretarySignature()}
                        >
                          {busy === "request-secretary" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Solicitar assinatura do Secretário
                        </Button>
                      ) : null}

                      {secretaryRequestPending && isSecretary ? (
                        <Button
                          type="button"
                          className="rounded-full bg-sky-700 font-bold !text-white hover:bg-sky-600"
                          disabled={Boolean(busy)}
                          onClick={() => openSignature("secretary")}
                        >
                          <Signature className="mr-2 h-4 w-4" />
                          Assinar como Secretário
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  data-habite-se-secretary-signature="signed"
                  className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                >
                  <div className="flex items-center gap-3">
                    <BadgeCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                    <div>
                      <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                        Assinatura complementar da Secretaria validada
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                        ${secretarySigner?.name || "Secretário responsável"} • ${formatDateTime(secretarySigner?.signed_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

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

            {!externalView && isDirector && effectivePermitStatus === "aguardando_diretor" && !directorSigned ? (
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

          {effectivePermitStatus === "emitido" ? (
            <div
              data-habite-se-completion-state={lifecycleStatus}
              className={
                lifecycleCompleted
                  ? "rounded-[22px] border border-emerald-200 bg-[linear-gradient(135deg,#f4fff9_0%,#ecfdf5_100%)] p-5 shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(135deg,#0d251c_0%,#10291f_100%)]"
                  : "rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm dark:border-slate-700 dark:bg-[linear-gradient(135deg,#111827_0%,#0f172a_100%)]"
              }
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      {lifecycleCompleted
                        ? "Processo concluído com êxito"
                        : lifecycleStatus === "reapresentacao"
                          ? "Processo reaberto para reapresentação"
                          : "Pronto para conclusão administrativa"}
                    </p>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {lifecycleCompleted
                        ? `O Alvará ${permit.permitNumber} permanece emitido e assinado pela Diretoria. O fluxo administrativo foi encerrado e preservado no histórico oficial.`
                        : lifecycleStatus === "reapresentacao"
                          ? "O processo foi reaberto administrativamente. A reabertura e o motivo permanecem registrados no histórico e na auditoria."
                          : `O Alvará ${permit.permitNumber} já possui a assinatura obrigatória da Diretoria. A assinatura da Secretaria é complementar e opcional. Ao concluir, o processo registra a decisão final e fecha o fluxo ativo.`}
                    </p>
                  </div>
                </div>

                {!externalView && canCloseProcess ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {lifecycleCompleted ? (
                      <>
                        <Button
                          type="button"
                          className="shrink-0 rounded-full bg-emerald-700 px-5 font-bold !text-white hover:bg-emerald-700 [&_*]:!text-white"
                          disabled
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Concluído
                        </Button>
                        {onReopenProcess ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="shrink-0 rounded-full border-amber-300 bg-white px-5 font-bold text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-200"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              setNotice("");
                              setReopenDialogOpen(true);
                            }}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reabrir processo
                          </Button>
                        ) : null}
                      </>
                    ) : lifecycleStatus === "reapresentacao" ? (
                      <Badge className="w-fit rounded-full border border-sky-200 bg-sky-100 px-3 py-1.5 font-bold text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-200">
                        Processo reaberto
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        className="shrink-0 rounded-full bg-emerald-700 px-5 font-bold !text-white hover:bg-emerald-600 [&_*]:!text-white"
                        disabled={Boolean(busy)}
                        onClick={() => void completeProcess()}
                      >
                        {busy === "complete-process" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {secretaryRequestPending && !secretarySigned
                          ? "Concluir sem assinatura complementar"
                          : "Concluir processo com êxito"}
                      </Button>
                    )}
                  </div>
                ) : lifecycleCompleted ? (
                  <Badge className="w-fit rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1.5 font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Processo concluído e arquivado
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={reopenDialogOpen} onOpenChange={(open) => !busy && setReopenDialogOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Reabrir processo de Habite-se</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              A reabertura retorna o processo ao fluxo ativo de reapresentação sem invalidar automaticamente o Alvará já emitido. O motivo, responsável, data e movimentação ficam registrados na auditoria.
            </p>
            <Textarea
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              className="min-h-28"
              placeholder="Informe o motivo administrativo da reabertura..."
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={Boolean(busy)}
                onClick={() => {
                  setReopenDialogOpen(false);
                  setReopenReason("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="rounded-full bg-amber-600 font-bold !text-white hover:bg-amber-500"
                disabled={!reopenReason.trim() || Boolean(busy)}
                onClick={() => void reopenCompletedProcess()}
              >
                {busy === "reopen-process" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Confirmar reabertura
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordDialog)} onOpenChange={(open) => !open && !busy && setPasswordDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {passwordDialog === "secretary"
                ? "Assinatura complementar da Secretaria"
                : "Assinatura final da Diretoria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {passwordDialog === "secretary"
                ? "Confirme sua senha de acesso. Esta assinatura é complementar e não altera o caráter conclusivo da assinatura já realizada pela Diretoria."
                : "Confirme sua senha de acesso. A assinatura eletrônica do Diretor será vinculada exatamente a esta versão do Alvará de Habite-se e concluirá a emissão."}
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
