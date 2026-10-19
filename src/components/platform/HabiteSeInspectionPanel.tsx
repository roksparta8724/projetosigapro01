import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  completeHabiteSeInspection,
  getHabiteSeInspection,
  removeHabiteSeInspectionPhoto,
  saveHabiteSeInspectionDraft,
  uploadHabiteSeInspectionPhoto,
  type HabiteSeInspectionChecklist,
  type HabiteSeInspectionChecklistStatus,
  type HabiteSeInspectionPhoto,
  type HabiteSeInspectionPhotoCategory,
  type HabiteSeInspectionRecord,
} from "@/integrations/backend/habiteSeInspectionClient";
import {
  formatOfficialProcessNumber,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

const INSPECTION_ITEMS = [
  {
    key: "projeto_aprovado",
    title: "Conformidade com o projeto aprovado",
    detail: "Implantação, volumetria, recuos, áreas aparentes e características verificáveis em campo.",
  },
  {
    key: "fachada_acesso",
    title: "Fachada, acesso e identificação predial",
    detail: "Acesso principal, numeração, condições visíveis da fachada e correspondência com o imóvel vistoriado.",
  },
  {
    key: "habitabilidade",
    title: "Condições de habitabilidade e higiene",
    detail: "Ambientes concluídos, ventilação/iluminação aparentes, instalações sanitárias e condições de uso.",
  },
  {
    key: "ligacoes",
    title: "Ligações e instalações aparentes",
    detail: "Água, esgoto, energia e demais ligações definitivas que possam ser conferidas visualmente.",
  },
  {
    key: "acessibilidade",
    title: "Acessibilidade, quando aplicável",
    detail: "Acessos, rota acessível, rampas, corrimãos e demais elementos exigidos para a tipologia.",
  },
  {
    key: "area_externa",
    title: "Passeio, drenagem e área externa",
    detail: "Calçada/passeio, drenagem superficial, acesso de veículos e condições externas aplicáveis.",
  },
  {
    key: "condicionantes",
    title: "Condicionantes e laudos complementares",
    detail: "AVCB/CLCB, licenças, termos ou condicionantes do processo quando exigíveis para o caso concreto.",
  },
  {
    key: "uso_ocupacao",
    title: "Uso e ocupação compatíveis",
    detail: "Uso observado compatível com o licenciamento e ausência de alteração aparente que exija nova análise.",
  },
] as const;

const PHOTO_CATEGORIES: Array<{
  value: HabiteSeInspectionPhotoCategory;
  label: string;
}> = [
  { value: "fachada", label: "Fachada / identificação" },
  { value: "implantacao", label: "Implantação / recuos" },
  { value: "habitabilidade", label: "Habitabilidade / interior" },
  { value: "acessibilidade", label: "Acessibilidade" },
  { value: "externa", label: "Área externa / passeio" },
  { value: "divergencia", label: "Divergência / pendência" },
  { value: "outros", label: "Outras evidências" },
];

const STATUS_META: Array<{
  value: Exclude<HabiteSeInspectionChecklistStatus, "">;
  label: string;
  short: string;
  selectedClasses: string;
  legendClasses: string;
}> = [
  {
    value: "conforme",
    label: "Conforme",
    short: "C",
    selectedClasses:
      "border-emerald-800 bg-emerald-600 !text-white shadow-[0_0_0_3px_rgba(16,185,129,0.22),0_8px_18px_rgba(5,150,105,0.24)] ring-1 ring-emerald-300 [&_*]:!text-white",
    legendClasses:
      "border-emerald-700 bg-emerald-600 !text-white [&_*]:!text-white",
  },
  {
    value: "pendencia",
    label: "Pendência",
    short: "P",
    selectedClasses:
      "border-amber-800 bg-amber-600 !text-white shadow-[0_0_0_3px_rgba(245,158,11,0.20),0_8px_18px_rgba(217,119,6,0.24)] ring-1 ring-amber-300 [&_*]:!text-white",
    legendClasses:
      "border-amber-700 bg-amber-600 !text-white [&_*]:!text-white",
  },
  {
    value: "nao_aplica",
    label: "Não se aplica",
    short: "N/A",
    selectedClasses:
      "border-slate-800 bg-slate-700 !text-white shadow-[0_0_0_3px_rgba(100,116,139,0.20),0_8px_18px_rgba(51,65,85,0.24)] ring-1 ring-slate-400 [&_*]:!text-white",
    legendClasses:
      "border-slate-700 bg-slate-700 !text-white [&_*]:!text-white",
  },
];

function emptyChecklist(): HabiteSeInspectionChecklist {
  return Object.fromEntries(INSPECTION_ITEMS.map((item) => [item.key, ""]));
}

type HabiteSeInspectionVisualCache = {
  processId: string;
  sessionId: string;
  inspection: HabiteSeInspectionRecord | null;
  photos: HabiteSeInspectionPhoto[];
  checklist: HabiteSeInspectionChecklist;
  notes: string;
  photoEvidenceWaived: boolean;
  photoWaiverReason: string;
  savedAt: number;
};

function inspectionVisualCacheKey(processId: string, sessionId: string) {
  return `sigapro.habite-se.inspection.visual.v1:${sessionId}:${processId}`;
}

function readInspectionVisualCache(
  processId: string,
  sessionId: string,
): HabiteSeInspectionVisualCache | null {
  if (typeof window === "undefined" || !processId || !sessionId || sessionId === "unknown") return null;
  try {
    const raw = window.localStorage.getItem(inspectionVisualCacheKey(processId, sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HabiteSeInspectionVisualCache>;
    if (parsed.processId !== processId || parsed.sessionId !== sessionId) return null;
    return {
      processId,
      sessionId,
      inspection: parsed.inspection ?? null,
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      checklist: {
        ...emptyChecklist(),
        ...(parsed.checklist ?? {}),
      },
      notes: String(parsed.notes || ""),
      photoEvidenceWaived: parsed.photoEvidenceWaived === true,
      photoWaiverReason: String(parsed.photoWaiverReason || ""),
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

function writeInspectionVisualCache(value: HabiteSeInspectionVisualCache) {
  if (typeof window === "undefined" || !value.processId || !value.sessionId || value.sessionId === "unknown") return;
  try {
    window.localStorage.setItem(
      inspectionVisualCacheKey(value.processId, value.sessionId),
      JSON.stringify(value),
    );
  } catch {
    // Cache somente visual: nunca deve bloquear a operação oficial.
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "Registrada automaticamente ao iniciar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function photoCategoryLabel(category: HabiteSeInspectionPhotoCategory) {
  return PHOTO_CATEGORIES.find((item) => item.value === category)?.label || category;
}

function statusBadge(status?: HabiteSeInspectionRecord["status"] | null) {
  if (status === "conforme") {
    return {
      label: "Vistoria conforme",
      classes:
        "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-200",
    };
  }
  if (status === "pendencias") {
    return {
      label: "Vistoria com pendências",
      classes:
        "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/35 dark:text-amber-200",
    };
  }
  return {
    label: "Vistoria em preenchimento",
    classes:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/35 dark:text-sky-200",
  };
}

export function HabiteSeInspectionPanel({
  process,
  session,
  externalView = false,
  dataReady = true,
  onProcessRefresh,
}: {
  process: ProcessRecord;
  session: SessionUser;
  externalView?: boolean;
  dataReady?: boolean;
  onProcessRefresh?: () => Promise<void> | void;
}) {
  const initialVisual = useRef(
    readInspectionVisualCache(process.id, session.id),
  ).current;
  const [inspection, setInspection] = useState<HabiteSeInspectionRecord | null>(
    () => initialVisual?.inspection ?? null,
  );
  const [photos, setPhotos] = useState<HabiteSeInspectionPhoto[]>(
    () => initialVisual?.photos ?? [],
  );
  // Permissão nunca é confiada ao cache; apenas os dados visuais são hidratados.
  const [canManage, setCanManage] = useState(false);
  const [checklist, setChecklist] = useState<HabiteSeInspectionChecklist>(
    () => initialVisual?.checklist ?? emptyChecklist(),
  );
  const [notes, setNotes] = useState(() => initialVisual?.notes ?? "");
  const [photoEvidenceWaived, setPhotoEvidenceWaived] = useState(
    () => initialVisual?.photoEvidenceWaived ?? false,
  );
  const [photoWaiverReason, setPhotoWaiverReason] = useState(
    () => initialVisual?.photoWaiverReason ?? "",
  );
  const [photoCategory, setPhotoCategory] =
    useState<HabiteSeInspectionPhotoCategory>("fachada");
  const [photoCaption, setPhotoCaption] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(() => Boolean(initialVisual));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedFolder = String(
    process.processControl?.currentFolder || process.sla.currentStage || "",
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  const inspectionStage = /fiscal|vistoria|inspec|conferencia/.test(normalizedFolder);
  const postInspectionStage =
    /financ|decis|emiss|conclus/.test(normalizedFolder) ||
    ["deferido", "indeferido", "arquivado"].includes(process.status);

  const readOnly = externalView || !canManage;
  const isPostInspectionRevision =
    Boolean(inspection?.completedAt) && !inspectionStage;
  const classifiedCount = INSPECTION_ITEMS.filter(
    (item) => Boolean(checklist[item.key]),
  ).length;
  const pendingCount = INSPECTION_ITEMS.filter(
    (item) => checklist[item.key] === "pendencia",
  ).length;
  const allClassified = classifiedCount === INSPECTION_ITEMS.length;
  const result: "conforme" | "pendencias" =
    pendingCount > 0 ? "pendencias" : "conforme";
  const resultMeta = statusBadge(inspection?.status);

  const municipalityId =
    process.municipalityId || process.tenantId || session.municipalityId || session.tenantId || "";

  const loadInspection = async () => {
    if (!process.id || !dataReady) return;
    setBusy((current) => current || "load");
    setLoadError("");
    try {
      const snapshot = await getHabiteSeInspection(process.id);
      setInspection(snapshot.inspection);
      setPhotos(snapshot.photos);
      setCanManage(snapshot.canManage && !externalView);
      const nextChecklist = snapshot.inspection
        ? {
            ...emptyChecklist(),
            ...snapshot.inspection.checklist,
          }
        : emptyChecklist();
      const nextNotes = snapshot.inspection?.notes || "";
      const nextPhotoEvidenceWaived = snapshot.inspection?.photoEvidenceWaived === true;
      const nextPhotoWaiverReason = snapshot.inspection?.photoWaiverReason || "";

      setChecklist(nextChecklist);
      setNotes(nextNotes);
      setPhotoEvidenceWaived(nextPhotoEvidenceWaived);
      setPhotoWaiverReason(nextPhotoWaiverReason);
      writeInspectionVisualCache({
        processId: process.id,
        sessionId: session.id,
        inspection: snapshot.inspection,
        photos: snapshot.photos,
        checklist: nextChecklist,
        notes: nextNotes,
        photoEvidenceWaived: nextPhotoEvidenceWaived,
        photoWaiverReason: nextPhotoWaiverReason,
        savedAt: Date.now(),
      });
      setLoaded(true);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o termo de vistoria.",
      );
      setLoaded(true);
    } finally {
      setBusy((current) => (current === "load" ? "" : current));
    }
  };

  useEffect(() => {
    if (!dataReady) {
      // No F5 do mesmo processo, preserve o snapshot já renderizado.
      // A Análise/Ficha técnica faz a mesma hidratação síncrona; não limpamos
      // os dados visuais apenas porque a sessão está sendo revalidada.
      if (!initialVisual) setLoaded(false);
      setLoadError("");
      return;
    }

    void loadInspection();
    // O processo é revalidado em tempo real em outro nível; não recarregamos o
    // formulário a cada heartbeat para não apagar o que o fiscal está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process.id, dataReady]);

  useEffect(() => {
    if (!loaded || !process.id || !session.id || session.id === "unknown") return;
    writeInspectionVisualCache({
      processId: process.id,
      sessionId: session.id,
      inspection,
      photos,
      checklist,
      notes,
      photoEvidenceWaived,
      photoWaiverReason,
      savedAt: Date.now(),
    });
  }, [
    checklist,
    inspection,
    loaded,
    notes,
    photoEvidenceWaived,
    photoWaiverReason,
    photos,
    process.id,
    session.id,
  ]);

  const persistDraft = async (options?: { silent?: boolean }) => {
    if (!canManage) return inspection;

    setBusy("save");
    if (!options?.silent) setNotice("");
    try {
      const saved = await saveHabiteSeInspectionDraft({
        processId: process.id,
        checklist,
        notes,
        photoEvidenceWaived,
        photoWaiverReason,
      });
      setInspection(saved);
      if (!options?.silent) {
        setNotice("Rascunho da vistoria salvo no banco oficial.");
      }
      return saved;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar a vistoria.";
      setNotice(message);
      throw error;
    } finally {
      setBusy("");
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length || !canManage || !municipalityId) return;

    setBusy("photo");
    setNotice("");
    try {
      const savedInspection =
        inspection?.id ? inspection : await persistDraft({ silent: true });
      if (!savedInspection?.id) {
        throw new Error("Salve o termo antes de anexar evidências.");
      }

      const selected = Array.from(files).slice(0, 10);
      for (const file of selected) {
        const uploaded = await uploadHabiteSeInspectionPhoto({
          processId: process.id,
          municipalityId,
          inspectionId: savedInspection.id,
          file,
          category: photoCategory,
          caption: photoCaption.trim(),
        });
        setPhotos((current) => [...current, uploaded]);
      }
      setPhotoCaption("");
      setNotice(
        selected.length === 1
          ? "Evidência fotográfica anexada à vistoria."
          : `${selected.length} evidências fotográficas anexadas à vistoria.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível anexar a evidência fotográfica.",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setBusy("");
    }
  };

  const handleRemovePhoto = async (photo: HabiteSeInspectionPhoto) => {
    if (!canManage) return;
    setBusy(`remove-photo:${photo.id}`);
    setNotice("");
    try {
      await removeHabiteSeInspectionPhoto({
        processId: process.id,
        photoId: photo.id,
      });
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
      setNotice("Evidência removida da vistoria.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível remover a evidência.",
      );
    } finally {
      setBusy("");
    }
  };

  const handleComplete = async () => {
    if (!canManage || !inspectionStage) return;
    if (!allClassified) {
      setNotice("Classifique todos os itens do checklist antes de concluir a vistoria.");
      return;
    }
    if (result === "pendencias" && !notes.trim()) {
      setNotice("Descreva as pendências encontradas antes de concluir.");
      return;
    }
    if (photoEvidenceWaived && photoWaiverReason.trim().length < 15) {
      setNotice("A justificativa para ausência de fotos deve ter pelo menos 15 caracteres.");
      return;
    }

    setBusy("complete");
    setNotice("");
    try {
      if (!inspection?.id) {
        await persistDraft({ silent: true });
      }
      const response = await completeHabiteSeInspection({
        processId: process.id,
        result,
        checklist,
        notes,
        photoEvidenceWaived,
        photoWaiverReason,
      });
      if (response.inspection) {
        setInspection(response.inspection);
      }
      setNotice(
        result === "conforme"
          ? "Vistoria concluída como conforme. O processo foi encaminhado automaticamente ao Financeiro."
          : "Vistoria concluída com pendências. A exigência foi registrada para correção.",
      );
      await onProcessRefresh?.();
      return response;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível concluir a vistoria.",
      );
    } finally {
      setBusy("");
    }
  };

  if (!inspectionStage && !postInspectionStage && !inspection) {
    return null;
  }

  return (
    <Card
      data-habite-se-inspection-document="true"
      className="overflow-hidden rounded-[24px] border-sky-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-sky-500/30 dark:bg-slate-900"
    >
      <CardHeader className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf8ff_55%,#f8fbff_100%)] dark:border-sky-500/20 dark:bg-[linear-gradient(135deg,#102336_0%,#0d2030_100%)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
              <CardTitle className="text-slate-950 dark:text-white">
                Termo de Vistoria / Conferência — Habite-se
              </CardTitle>
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Documento técnico institucional
              </Badge>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Registro da conferência in loco, com checklist objetivo, identificação do fiscal,
              evidências fotográficas e resultado auditável. A vistoria não substitui laudos e
              responsabilidades técnicas exigidos no processo.
            </p>
          </div>
          <Badge variant="outline" className={cn("w-fit rounded-full px-3 py-1.5 font-bold", resultMeta.classes)}>
            {resultMeta.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        {!dataReady || (!loaded && busy === "load") ? (
          <div className="flex min-h-24 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {!dataReady
              ? "Validando sessão segura da Fiscalização..."
              : "Carregando termo oficial da vistoria..."}
          </div>
        ) : null}

        {loadError ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-950/25">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                Não foi possível sincronizar o termo de vistoria
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
                {loadError}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full border-amber-300 bg-white font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-200"
              disabled={!dataReady || busy === "load"}
              onClick={() => void loadInspection()}
            >
              {busy === "load" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Tentar novamente
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/35">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
              Processo
            </p>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {formatOfficialProcessNumber(process.protocol)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/35">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
              Imóvel
            </p>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {process.address || "Endereço não informado"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/35">
            <div className="flex items-center gap-2 text-slate-500">
              <UserRound className="h-4 w-4" />
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em]">
                Responsável pela vistoria
              </p>
            </div>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {inspection?.inspectorName || (canManage ? session.name : "Aguardando início da vistoria")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/35">
            <div className="flex items-center gap-2 text-slate-500">
              <Clock3 className="h-4 w-4" />
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em]">
                Data e hora
              </p>
            </div>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {formatDateTime(inspection?.inspectedAt)}
            </p>
          </div>
        </div>

        {!externalView ? (
          <div
            data-habite-se-inspection-ownership="true"
            className={cn(
              "rounded-2xl border px-4 py-3 text-xs leading-5",
              canManage
                ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-100"
                : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300",
            )}
          >
            <span className="font-black">
              {canManage ? "Edição autorizada." : "Modo somente leitura."}
            </span>{" "}
            O checklist pertence ao Analista atualmente responsável pelo processo e à Diretoria. Quando a análise é reatribuída, o Analista anterior perde a edição e o novo responsável passa a ter o direito automaticamente.
          </div>
        ) : null}

        <div
          data-habite-se-inspection-checklist="true"
          className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Checklist técnico da vistoria
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {classifiedCount}/{INSPECTION_ITEMS.length} itens classificados
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "w-fit rounded-full px-3 py-1 font-bold",
                  allClassified
                    ? pendingCount > 0
                      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
                )}
              >
                {allClassified
                  ? pendingCount > 0
                    ? `${pendingCount} pendência(s)`
                    : "Checklist conforme"
                  : "Em preenchimento"}
              </Badge>
            </div>

            <div
              data-habite-se-inspection-legend="true"
              className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                Legenda:
              </span>
              {STATUS_META.map((option) => (
                <span
                  key={`legend-${option.value}`}
                  data-habite-se-inspection-legend-chip="true"
                  data-status={option.value}
                  data-contrast-surface="dark"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-extrabold leading-none !text-white shadow-sm",
                    option.legendClasses,
                  )}
                >
                  <span className="!text-white">{option.short}</span>
                  <span className="!text-white">=</span>
                  <span className="!text-white">{option.label}</span>
                </span>
              ))}
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_100%)] transition-[width] duration-300"
                style={{
                  width: `${Math.round((classifiedCount / INSPECTION_ITEMS.length) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {INSPECTION_ITEMS.map((item, index) => {
              const itemStatus = checklist[item.key];
              return (
                <div
                  key={item.key}
                  data-habite-se-inspection-row="true"
                  data-checklist-value={itemStatus || "pendente"}
                  className={cn(
                    "grid gap-3 px-4 py-4 transition-all duration-200 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center",
                    itemStatus === "conforme"
                      ? "bg-emerald-50/35 dark:bg-emerald-950/10"
                      : itemStatus === "pendencia"
                        ? "bg-amber-50/50 dark:bg-amber-950/12"
                        : itemStatus === "nao_aplica"
                          ? "bg-slate-50/80 dark:bg-slate-800/25"
                          : "bg-white hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/35",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl border text-[11px] font-black transition-all",
                          itemStatus === "conforme"
                            ? "border-emerald-700 bg-emerald-600 !text-white shadow-sm"
                            : itemStatus === "pendencia"
                              ? "border-amber-700 bg-amber-600 !text-white shadow-sm"
                              : itemStatus === "nao_aplica"
                                ? "border-slate-700 bg-slate-700 !text-white shadow-sm"
                                : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                        )}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-950 dark:text-white">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.detail}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {STATUS_META.map((option) => {
                      const selected = itemStatus === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          data-inspection-status={option.value}
                          data-selected={selected ? "true" : "false"}
                          data-contrast-surface={selected ? "dark" : undefined}
                          aria-pressed={selected}
                          className={cn(
                            "relative inline-flex h-10 min-w-[92px] items-center justify-center rounded-xl border px-3 text-[11px] font-black transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60",
                            selected
                              ? option.selectedClasses
                              : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                          )}
                          disabled={readOnly || busy === "complete"}
                          onClick={() =>
                            setChecklist((current) => ({
                              ...current,
                              [item.key]: selected ? "" : option.value,
                            }))
                          }
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {selected ? <CheckCircle2 className="h-3.5 w-3.5 !text-white" aria-hidden="true" /> : null}
                            <span className={selected ? "!text-white" : undefined}>{option.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          data-habite-se-inspection-photo-evidence="true"
          className="rounded-[20px] border border-sky-200 bg-sky-50/45 p-4 dark:border-sky-500/30 dark:bg-sky-950/15"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Evidências fotográficas da vistoria
                </p>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                Registre fachada/identificação, implantação e condições observadas quando a evidência
                contribuir para a comprovação da vistoria. As fotos ficam vinculadas ao processo, mas
                não bloqueiam a conclusão do termo quando o fiscal registrar o checklist e o resultado.
              </p>
            </div>
            <Badge
              variant="outline"
              className="w-fit rounded-full border-sky-300 bg-white text-sky-800 dark:border-sky-500/40 dark:bg-slate-900 dark:text-sky-200"
            >
              {photos.length} foto(s)
            </Badge>
          </div>

          {!readOnly ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Categoria
                </label>
                <Select
                  value={photoCategory}
                  onValueChange={(value) =>
                    setPhotoCategory(value as HabiteSeInspectionPhotoCategory)
                  }
                >
                  <SelectTrigger className="mt-2 h-11 rounded-xl bg-white dark:bg-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHOTO_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Legenda da evidência
                </label>
                <Input
                  value={photoCaption}
                  onChange={(event) => setPhotoCaption(event.target.value)}
                  placeholder="Ex.: Fachada principal e numeração predial"
                  className="mt-2 h-11 rounded-xl bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) => void handlePhotoUpload(event.target.files)}
                />
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl bg-sky-700 font-bold !text-white hover:bg-sky-800 [&_*]:!text-white lg:w-auto"
                  disabled={busy === "photo"}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {busy === "photo" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {busy === "photo" ? "Enviando..." : "Adicionar fotos"}
                </Button>
              </div>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-950">
                    {photo.url ? (
                      <img
                        src={photo.url}
                        alt={photo.caption || photoCategoryLabel(photo.category)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        Imagem protegida
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <Badge variant="outline" className="rounded-full text-[9px]">
                      {photoCategoryLabel(photo.category)}
                    </Badge>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {photo.caption || photo.fileName}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">
                        {formatDateTime(photo.createdAt)}
                      </span>
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          disabled={busy === `remove-photo:${photo.id}`}
                          onClick={() => void handleRemovePhoto(photo)}
                        >
                          {busy === `remove-photo:${photo.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-sky-200 bg-white/70 p-5 text-center dark:border-sky-500/25 dark:bg-slate-900/40">
              <Camera className="mx-auto h-6 w-6 text-sky-500" />
              <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                Nenhuma evidência fotográfica anexada
              </p>
              <p className="mt-1 text-xs text-slate-500">
                As fotos ficam vinculadas ao processo e protegidas no armazenamento institucional.
              </p>
            </div>
          )}

          {!readOnly ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`waive-photo-${process.id}`}
                  checked={photoEvidenceWaived}
                  onCheckedChange={(checked) => setPhotoEvidenceWaived(checked === true)}
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`waive-photo-${process.id}`}
                    className="text-sm font-bold text-slate-900 dark:text-white"
                  >
                    Justificar vistoria sem evidência fotográfica
                  </label>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Opcional. Use quando for importante registrar formalmente por que não houve foto;
                    a justificativa ficará vinculada ao termo e à auditoria.
                  </p>
                  {photoEvidenceWaived ? (
                    <Textarea
                      value={photoWaiverReason}
                      onChange={(event) => setPhotoWaiverReason(event.target.value)}
                      placeholder="Explique por que a vistoria foi concluída sem evidência fotográfica..."
                      className="mt-3 min-h-[84px] rounded-xl bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <label className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
            Observações técnicas / pendências
          </label>
          <Textarea
            value={notes}
            readOnly={readOnly}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Registre divergências, condições observadas, ressalvas e orientações para correção."
            className="mt-2 min-h-[120px] rounded-xl bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {notice ? (
          <div
            className={cn(
              "rounded-2xl border p-4 text-sm font-semibold leading-6",
              /não|informe|exige|pendên|erro|falha/i.test(notice)
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-200",
            )}
          >
            {notice}
          </div>
        ) : null}

        {!readOnly ? (
          <div
            className={cn(
              "grid gap-3",
              inspectionStage
                ? "lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center"
                : "lg:grid-cols-[minmax(0,1fr)]",
            )}
          >
            <Button
              type="button"
              variant={isPostInspectionRevision ? "default" : "outline"}
              className={cn(
                "h-11 rounded-xl font-bold",
                isPostInspectionRevision
                  ? "bg-sky-700 !text-white hover:bg-sky-800 [&_*]:!text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200",
              )}
              disabled={Boolean(busy)}
              onClick={() => void persistDraft()}
            >
              {busy === "save" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isPostInspectionRevision
                ? "Salvar retificação do checklist"
                : "Salvar rascunho da vistoria"}
            </Button>

            {inspectionStage ? (
              <Button
                type="button"
                data-habite-se-inspection-complete="true"
                className={cn(
                  "h-11 rounded-xl font-bold !text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)] [&_*]:!text-white",
                  pendingCount > 0
                    ? "bg-[linear-gradient(135deg,#92400e_0%,#c25b12_100%)] hover:brightness-105"
                    : "bg-[linear-gradient(135deg,#065f46_0%,#059669_100%)] hover:brightness-105",
                )}
                disabled={Boolean(busy) || !allClassified}
                onClick={() => void handleComplete()}
              >
                {busy === "complete" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : pendingCount > 0 ? (
                  <AlertTriangle className="mr-2 h-4 w-4" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {busy === "complete"
                  ? "Concluindo vistoria..."
                  : pendingCount > 0
                    ? "Concluir com pendências"
                    : "Concluir conforme e encaminhar ao Financeiro"}
              </Button>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold leading-5 text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-100">
                Retificação posterior à vistoria: o responsável, a data/hora e o resultado formal originais são preservados; a alteração fica registrada na auditoria.
              </div>
            )}
          </div>
        ) : inspection?.completedAt ? (
          <div
            className={cn(
              "flex items-start gap-3 rounded-2xl border p-4",
              inspection.status === "conforme"
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/25",
            )}
          >
            {inspection.status === "conforme" ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            )}
            <div>
              <p className="text-sm font-bold text-slate-950 dark:text-white">
                {inspection.status === "conforme"
                  ? "Vistoria concluída e registrada"
                  : "Vistoria concluída com pendências"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Concluída por {inspection.inspectorName || "fiscal responsável"} em{" "}
                {formatDateTime(inspection.completedAt)}. O histórico permanece vinculado ao processo.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/35">
            <div className="flex items-center gap-2 text-slate-500">
              <FileCheck2 className="h-4 w-4" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.10em]">
                Checklist
              </span>
            </div>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {classifiedCount}/{INSPECTION_ITEMS.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/35">
            <div className="flex items-center gap-2 text-slate-500">
              <Camera className="h-4 w-4" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.10em]">
                Evidências
              </span>
            </div>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {photos.length > 0
                ? `${photos.length} foto(s) vinculada(s)`
                : photoEvidenceWaived
                  ? "Sem fotos • justificativa registrada"
                  : "Sem fotos • não bloqueia a conclusão"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/35">
            <div className="flex items-center gap-2 text-slate-500">
              <RefreshCw className="h-4 w-4" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.10em]">
                Próxima etapa
              </span>
            </div>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
              {pendingCount > 0 ? "Correção / nova conferência" : "Financeiro — Guia de Habite-se"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
