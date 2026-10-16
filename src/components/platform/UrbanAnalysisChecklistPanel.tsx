import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Building2,
  FileDown,
  FileText,
  PenLine,
  Route,
  Save,
  Signature,
  ShieldCheck,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatOfficialProcessNumber,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  ArtifactSignatureError,
  getProcessArtifactSignatureRequest,
  getProcessArtifactSignatures,
  getProcessArtifactWithdrawal,
  requestProcessArtifactSignature,
  saveProcessArtifactWithdrawal,
  signProcessArtifactWithPassword,
  type ArtifactSignatureRequestSnapshot,
  type ArtifactWithdrawalRecord,
  type ArtifactSignerSlot,
} from "@/integrations/esign/artifactClient";

type ChecklistStatus = "" | "A" | "AP" | "C" | "NA";
type ChecklistSection = "engenharia" | "externas";

type ChecklistTemplateItem = {
  id: string;
  order: number;
  section: ChecklistSection;
  label: string;
};

type ChecklistItemState = {
  status: ChecklistStatus;
  observation: string;
};

type ChecklistSignature = {
  userId: string;
  name: string;
  title: string;
  signedAt: string;
  verificationCode?: string;
  evidenceHash?: string;
  registration?: string | null;
  authMethod?: string;
  official?: boolean;
};

type AnalysisChecklistState = {
  version: 2;
  processId: string;
  analystId: string;
  analystName: string;
  analystTitle: string;
  analysisDate: string;
  sheetNumber: string;
  items: Record<string, ChecklistItemState>;
  routing: "expediente" | "topografia" | "outro" | "";
  routingOther: string;
  conclusion: string;
  communiquePages: string;
  savedAt: string;
  signedAt: string;
  signedBy: string;
  technicalSignature?: ChecklistSignature | null;
  directorSignature?: ChecklistSignature | null;
};

const ANALYSIS_ARTIFACT_TYPE = "urban_analysis_checklist";
const ANALYSIS_ARTIFACT_KEY = "urban-analysis-checklist";

type SignatureFlowStage = "idle" | "signing" | "verifying";
type SignatureFlowError = {
  message: string;
  stage?: string;
  code?: string;
} | null;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const CAMPO_LIMPO_BRASAO_FALLBACK =
  "https://upload.wikimedia.org/wikipedia/commons/4/4e/Brasao-campo-limpo-paulista2.png";

function resolveMunicipalityLogoUrl(
  municipalityName?: string | null,
  municipalityLogoUrl?: string | null,
) {
  if (municipalityLogoUrl?.trim()) return municipalityLogoUrl.trim();
  if (/campo\s+limpo\s+paulista/i.test(municipalityName || "")) {
    return CAMPO_LIMPO_BRASAO_FALLBACK;
  }
  return "";
}

async function loadPdfImageDataUrl(url?: string | null) {
  const normalized = url?.trim();
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;

  try {
    const response = await fetch(normalized, {
      cache: "force-cache",
      credentials: "omit",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function pdfImageFormat(dataUrl: string) {
  if (/^data:image\/jpe?g/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
}

function compactEvidenceHash(hash?: string) {
  const value = hash?.trim() || "";
  if (value.length <= 34) return value;
  return `${value.slice(0, 18)}...${value.slice(-12)}`;
}


function stableSignatureStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableSignatureStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSignatureStringify(record[key])}`)
    .join(",")}}`;
}

function buildChecklistSignaturePayload(
  state: AnalysisChecklistState,
  process: ProcessRecord,
  municipalityId: string,
): Record<string, unknown> {
  return {
    schema: "sigapro.urban-analysis-checklist.v2",
    processId: process.id,
    protocol: formatOfficialProcessNumber(process.protocol),
    municipalityId,
    analysisDate: state.analysisDate,
    sheetNumber: state.sheetNumber,
    items: state.items,
    routing: state.routing,
    routingOther: state.routingOther,
    conclusion: state.conclusion,
    communiquePages: state.communiquePages,
  };
}

type UrbanAnalysisChecklistPanelProps = {
  process: ProcessRecord;
  session: SessionUser;
  municipalityId: string;
  municipalityName?: string | null;
  municipalityLogoUrl?: string | null;
  secretariat?: string | null;
  directorate?: string | null;
  municipalityAddress?: string | null;
  municipalityPhone?: string | null;
  municipalityEmail?: string | null;
  departmentLabel?: string | null;
  organogramTrail?: Array<{ code: string; name: string }>;
};

const STATUS_META: Record<Exclude<ChecklistStatus, "">, { label: string; short: string; classes: string }> = {
  A: {
    label: "De acordo",
    short: "A",
    classes: "border-emerald-700 bg-emerald-600 !text-white shadow-[0_8px_18px_rgba(5,150,105,0.28)] hover:bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-600 dark:!text-white",
  },
  AP: {
    label: "Apresentar",
    short: "AP",
    classes: "border-sky-700 bg-sky-600 !text-white shadow-[0_8px_18px_rgba(2,132,199,0.28)] hover:bg-sky-600 dark:border-sky-400 dark:bg-sky-600 dark:!text-white",
  },
  C: {
    label: "Corrigir",
    short: "C",
    classes: "border-amber-700 bg-amber-600 !text-white shadow-[0_8px_18px_rgba(217,119,6,0.28)] hover:bg-amber-600 dark:border-amber-400 dark:bg-amber-600 dark:!text-white",
  },
  NA: {
    label: "Não se aplica",
    short: "N/A",
    classes: "border-slate-800 bg-slate-700 !text-white shadow-[0_8px_18px_rgba(51,65,85,0.28)] hover:bg-slate-700 dark:border-slate-400 dark:bg-slate-700 dark:!text-white",
  },
};

const ENGINEERING_ITEMS: ChecklistTemplateItem[] = [
  { id: "req", order: 1, section: "engenharia", label: "Requerimento" },
  { id: "art-rrt", order: 2, section: "engenharia", label: "ART / RRT" },
  { id: "issqn", order: 3, section: "engenharia", label: "ISSQN / Projeto — Profissional" },
  { id: "propriedade", order: 4, section: "engenharia", label: "Documento de propriedade atualizado e cópia dos documentos pessoais" },
  { id: "registro-imoveis", order: 5, section: "engenharia", label: "Certidão do Registro de Imóveis atualizada" },
  { id: "certidao-debitos", order: 6, section: "engenharia", label: "Certidão Negativa de Débitos atualizada" },
  { id: "iptu", order: 7, section: "engenharia", label: "Contra capa de IPTU atualizada" },
  { id: "procuracao", order: 8, section: "engenharia", label: "Procuração" },
  { id: "declaracao-5581", order: 9, section: "engenharia", label: "Declaração — Decreto 5581/10" },
  { id: "titulo-obra", order: 10, section: "engenharia", label: "Título da obra" },
  { id: "proprietario-endereco", order: 11, section: "engenharia", label: "Proprietário / endereço da obra / nº contribuinte" },
  { id: "cotas-nivel", order: 12, section: "engenharia", label: "Cotas de nível — divisas do terreno / edificação / P.N.T." },
  { id: "vagas", order: 13, section: "engenharia", label: "Vagas — veículos / carga e descarga / PNE" },
  { id: "dimensoes-terreno", order: 14, section: "engenharia", label: "Dimensões do terreno" },
  { id: "memorial-obras", order: 15, section: "engenharia", label: "Memorial Descritivo — Obras" },
  { id: "memorial-atividades", order: 16, section: "engenharia", label: "Memorial Descritivo — Atividades + croqui (R = 50,00 m)" },
  { id: "desenho", order: 17, section: "engenharia", label: "Desenho / projeto" },
  { id: "recuos", order: 18, section: "engenharia", label: "Recuos — frontal / lateral / fundo / amarração da construção no lote" },
  { id: "carimbo", order: 19, section: "engenharia", label: "Carimbo / quadro de áreas / banheiros / declarações / legenda" },
  { id: "escada-rampa", order: 20, section: "engenharia", label: "Detalhe de escada / inclinação da rampa / gabarito da construção" },
  { id: "iluminacao", order: 21, section: "engenharia", label: "Quadro de iluminação e ventilação" },
  { id: "indices", order: 22, section: "engenharia", label: "Índices urbanísticos (CA / TO / TP) — gabarito — recuos obrigatórios" },
  { id: "responsabilidade-tecnica", order: 23, section: "engenharia", label: "Responsabilidade técnica assumida no projeto" },
  { id: "muro-aguas-fossa", order: 24, section: "engenharia", label: "Declaração: muro de contenção / águas pluviais / fossa séptica" },
  { id: "madeira-legal", order: 25, section: "engenharia", label: "Declaração de madeira legal — profissional e proprietário" },
  { id: "codigo-sanitario", order: 26, section: "engenharia", label: "Atender Código Sanitário Estadual de São Paulo" },
  { id: "fechamento-lote", order: 27, section: "engenharia", label: "Fechamento do lote" },
  { id: "situacao", order: 28, section: "engenharia", label: "Situação apresentada" },
  { id: "habitabilidade", order: 29, section: "engenharia", label: "Laudo de Habitabilidade" },
  { id: "taxas", order: 30, section: "engenharia", label: "Taxas de aprovação" },
  { id: "outros", order: 31, section: "engenharia", label: "Outros" },
];

const EXTERNAL_ITEMS: ChecklistTemplateItem[] = [
  { id: "bombeiro", order: 1, section: "externas", label: "Bombeiro / Declaração de combate a incêndio" },
  { id: "cetesb", order: 2, section: "externas", label: "CETESB" },
  { id: "deprn", order: 3, section: "externas", label: "DEPRN" },
  { id: "sabesp", order: 4, section: "externas", label: "SABESP" },
  { id: "visa", order: 5, section: "externas", label: "VISA — Vigilância Sanitária" },
  { id: "transito", order: 6, section: "externas", label: "Trânsito" },
  { id: "uso-ocupacao", order: 7, section: "externas", label: "Certidão de uso e ocupação do solo" },
];

const TEMPLATE = [...ENGINEERING_ITEMS, ...EXTERNAL_ITEMS];

function blankItems() {
  return Object.fromEntries(
    TEMPLATE.map((item) => [item.id, { status: "", observation: "" } satisfies ChecklistItemState]),
  );
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function storageKey(municipalityId: string, processId: string) {
  return `sigapro:urban-analysis-checklist:v2:${municipalityId}:${processId}`;
}

function legacyStorageKey(processId: string, analystId: string) {
  return `sigapro:urban-analysis-checklist:v1:${processId}:${analystId}`;
}

function makeInitialState(process: ProcessRecord, session: SessionUser): AnalysisChecklistState {
  return {
    version: 2,
    processId: process.id,
    analystId: session.id,
    analystName: session.name,
    analystTitle: session.title || "Analista",
    analysisDate: todayIsoDate(),
    sheetNumber: "1",
    items: blankItems(),
    routing: "",
    routingOther: "",
    conclusion: "",
    communiquePages: "",
    savedAt: "",
    signedAt: "",
    signedBy: "",
    technicalSignature: null,
    directorSignature: null,
  };
}

function readInitialChecklistState(
  key: string,
  process: ProcessRecord,
  session: SessionUser,
): AnalysisChecklistState {
  const empty = makeInitialState(process, session);
  if (typeof window === "undefined") return empty;

  try {
    const raw =
      window.localStorage.getItem(key) ||
      window.localStorage.getItem(legacyStorageKey(process.id, session.id));
    if (!raw) return empty;

    const parsed = JSON.parse(raw) as Partial<AnalysisChecklistState>;
    return {
      ...empty,
      ...parsed,
      processId: process.id,
      items: { ...blankItems(), ...(parsed.items ?? {}) },
      technicalSignature: parsed.technicalSignature ?? (
        parsed.signedAt && parsed.signedBy
          ? {
              userId: parsed.analystId || session.id,
              name: parsed.signedBy,
              title: parsed.analystTitle || "Analista",
              signedAt: parsed.signedAt,
            }
          : null
      ),
      directorSignature: parsed.directorSignature ?? null,
    };
  } catch {
    return empty;
  }
}


function statusLabel(status: ChecklistStatus) {
  if (!status) return "Não avaliado";
  return STATUS_META[status].label;
}

function normalizeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function UrbanAnalysisChecklistPanel({
  process,
  session,
  municipalityId,
  municipalityName,
  municipalityLogoUrl,
  secretariat,
  directorate,
  municipalityAddress,
  municipalityPhone,
  municipalityEmail,
  departmentLabel,
  organogramTrail = [],
}: UrbanAnalysisChecklistPanelProps) {
  const key = storageKey(municipalityId, process.id);
  const [state, setState] = useState<AnalysisChecklistState>(() =>
    readInitialChecklistState(key, process, session),
  );
  const [notice, setNotice] = useState("");
  const [signatureDialog, setSignatureDialog] = useState<"technical" | "director" | null>(null);
  const [signaturePassword, setSignaturePassword] = useState("");
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureStage, setSignatureStage] = useState<SignatureFlowStage>("idle");
  const [signatureError, setSignatureError] = useState<SignatureFlowError>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [directorRequest, setDirectorRequest] = useState<ArtifactSignatureRequestSnapshot>({
    request: null,
    candidate_count: 0,
  });
  const [directorRequestBusy, setDirectorRequestBusy] = useState(false);
  const [withdrawalRecord, setWithdrawalRecord] = useState<ArtifactWithdrawalRecord | null>(null);
  const [withdrawalName, setWithdrawalName] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState("");
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const resolvedMunicipalityLogoUrl = useMemo(
    () => resolveMunicipalityLogoUrl(municipalityName, municipalityLogoUrl),
    [municipalityLogoUrl, municipalityName],
  );

  useEffect(() => {
    // Só reidrata quando realmente muda processo/usuário. No F5 do mesmo
    // processo o useState lazy já leu o estado antes do primeiro paint,
    // evitando o salto 0/38 -> valor real.
    setState(readInitialChecklistState(key, process, session));
  }, [key, process.id, session.id]);

  useEffect(() => {
    let active = true;

    void getProcessArtifactSignatures(process.id, ANALYSIS_ARTIFACT_KEY)
      .then((snapshot) => {
        if (!active || !snapshot.block) return;

        const technical = snapshot.signers.find((item) => item.slot === "analise_tecnica");
        const director = snapshot.signers.find((item) => item.slot === "diretoria");

        if (!technical && !director) return;

        setState((current) => {
          const currentPayload = buildChecklistSignaturePayload(current, process, municipalityId);
          const signedPayload = snapshot.block?.payload ?? {};
          const payloadMatches =
            stableSignatureStringify(currentPayload) === stableSignatureStringify(signedPayload);

          if (!payloadMatches) {
            const next: AnalysisChecklistState = {
              ...current,
              technicalSignature: null,
              directorSignature: null,
              signedAt: "",
              signedBy: "",
            };
            window.localStorage.setItem(key, JSON.stringify(next));
            setNotice("A ficha foi alterada após a última assinatura eletrônica. Uma nova assinatura é necessária.");
            return next;
          }

          const verificationCode = snapshot.block?.verification_code;
          const evidenceHash = snapshot.block?.artifact_hash;

          const next: AnalysisChecklistState = {
            ...current,
            technicalSignature: technical
              ? {
                  userId: technical.profile_id || "",
                  name: technical.name || "Usuário",
                  title: technical.title || technical.role || "Analista Técnico",
                  signedAt: technical.signed_at || snapshot.block?.completed_at || new Date().toISOString(),
                  verificationCode,
                  evidenceHash,
                  registration: technical.registration ?? null,
                  authMethod: technical.auth_method || "password_reauth",
                  official: true,
                }
              : current.technicalSignature,
            directorSignature: director
              ? {
                  userId: director.profile_id || "",
                  name: director.name || "Diretor(a)",
                  title: director.title || director.role || "Diretor(a)",
                  signedAt: director.signed_at || snapshot.block?.completed_at || new Date().toISOString(),
                  verificationCode,
                  evidenceHash,
                  registration: director.registration ?? null,
                  authMethod: director.auth_method || "password_reauth",
                  official: true,
                }
              : current.directorSignature,
          };

          window.localStorage.setItem(key, JSON.stringify(next));
          return next;
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error("[SIGAPRO][Assinatura] Falha ao carregar assinaturas oficiais.", error);
      });

    return () => {
      active = false;
    };
  }, [key, process.id]);

  useEffect(() => {
    let active = true;

    void getProcessArtifactSignatureRequest(
      process.id,
      ANALYSIS_ARTIFACT_KEY,
      "diretoria",
    )
      .then((snapshot) => {
        if (active) setDirectorRequest(snapshot);
      })
      .catch((error) => {
        if (!active) return;
        console.error("[SIGAPRO][Diretoria] Falha ao carregar solicitação de assinatura.", error);
      });

    return () => {
      active = false;
    };
  }, [process.id, state.directorSignature?.signedAt, state.technicalSignature?.evidenceHash]);

  useEffect(() => {
    let active = true;

    void getProcessArtifactWithdrawal(process.id, ANALYSIS_ARTIFACT_KEY)
      .then((snapshot) => {
        if (!active) return;
        const record = snapshot.withdrawal;
        const currentHash = state.technicalSignature?.evidenceHash || "";

        if (!record || !currentHash || record.artifact_hash !== currentHash) {
          setWithdrawalRecord(null);
          setWithdrawalName("");
          setWithdrawalDate("");
          return;
        }

        setWithdrawalRecord(record);
        setWithdrawalName(record.withdrawn_by_name || "");
        setWithdrawalDate(record.withdrawn_at || "");
      })
      .catch((error) => {
        if (!active) return;
        console.error("[SIGAPRO][Retirada] Falha ao carregar registro de retirada.", error);
      });

    return () => {
      active = false;
    };
  }, [process.id, state.technicalSignature?.evidenceHash]);

  const counts = useMemo(() => {
    const values = TEMPLATE.map((item) => state.items[item.id]?.status ?? "");
    return {
      total: TEMPLATE.length,
      evaluated: values.filter(Boolean).length,
      a: values.filter((value) => value === "A").length,
      ap: values.filter((value) => value === "AP").length,
      c: values.filter((value) => value === "C").length,
      na: values.filter((value) => value === "NA").length,
    };
  }, [state.items]);

  const progress = Math.round((counts.evaluated / counts.total) * 100);
  const pendingCorrectionCount = counts.ap + counts.c;

  const canSignTechnical =
    ["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor", "analista", "analyst"].includes(session.role);
  const isDirectorProfile =
    /diretor|diretora|director/i.test(session.role || "") ||
    /diretor|diretora/i.test(session.title || "");
  const technicalOfficial = Boolean(
    state.technicalSignature?.official &&
    state.technicalSignature?.verificationCode &&
    state.technicalSignature?.authMethod === "password_reauth",
  );
  const directorOfficial = Boolean(
    state.directorSignature?.official &&
    state.directorSignature?.verificationCode &&
    state.directorSignature?.authMethod === "password_reauth",
  );
  const directorRequestMatchesCurrentVersion =
    Boolean(directorRequest.request) &&
    directorRequest.request?.artifact_hash === state.technicalSignature?.evidenceHash;
  const directorRequestPending =
    directorRequestMatchesCurrentVersion &&
    directorRequest.request?.status === "pending";
  const canRequestDirector =
    technicalOfficial &&
    ["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor", "analista", "analyst"].includes(session.role);
  const isFullySigned = technicalOfficial && directorOfficial;
  const withdrawalMatchesCurrentVersion = Boolean(withdrawalRecord);
  const canRecordWithdrawal =
    ["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor", "analista", "analyst"].includes(session.role);

  const invalidateSignature = (next: AnalysisChecklistState) => ({
    ...next,
    signedAt: "",
    signedBy: "",
    technicalSignature: null,
    directorSignature: null,
  });

  const updateItem = (itemId: string, patch: Partial<ChecklistItemState>) => {
    setState((current) =>
      invalidateSignature({
        ...current,
        items: {
          ...current.items,
          [itemId]: {
            ...(current.items[itemId] ?? { status: "", observation: "" }),
            ...patch,
          },
        },
      }),
    );
  };

  const persistState = (next: AnalysisChecklistState) => {
    window.localStorage.setItem(key, JSON.stringify(next));
    setState(next);
  };

  const saveDraft = () => {
    const now = new Date().toISOString();
    const next = { ...state, savedAt: now };
    persistState(next);
    setNotice(
      "Rascunho técnico salvo para este processo. As assinaturas permanecem vinculadas somente à versão assinada.",
    );
  };

  const openSignatureConfirmation = (
    kind: "technical" | "director",
  ) => {
    if (kind === "technical") {
      if (!canSignTechnical) {
        setNotice("Este perfil não possui atribuição para assinar a análise técnica.");
        return;
      }
      if (counts.evaluated === 0) {
        setNotice("Avalie pelo menos um item antes de assinar.");
        return;
      }
      if (technicalOfficial) {
        setNotice("A análise técnica já possui assinatura eletrônica oficial nesta versão.");
        return;
      }
    } else {
      if (!isDirectorProfile) {
        setNotice("Este perfil não está cadastrado como Diretor(a) para realizar esta assinatura.");
        return;
      }
      if (!technicalOfficial) {
        setNotice("A análise técnica precisa estar assinada antes da assinatura da Diretoria.");
        return;
      }
      if (!directorRequestPending) {
        setNotice("A assinatura da Diretoria precisa ser solicitada pelo analista antes da assinatura.");
        return;
      }
      if (directorOfficial) {
        setNotice("A Diretoria já assinou eletronicamente esta versão.");
        return;
      }
    }

    setSignaturePassword("");
    setSignatureError(null);
    setSignatureDialog(kind);
  };

  const confirmElectronicSignature = async () => {
    if (!signatureDialog || !signaturePassword) {
      setSignatureError({ message: "Informe sua senha de acesso." });
      return;
    }

    const kind = signatureDialog;
    const slot: ArtifactSignerSlot =
      kind === "technical" ? "analise_tecnica" : "diretoria";
    const payload = buildChecklistSignaturePayload(state, process, municipalityId);

    setSignatureBusy(true);
    setSignatureStage("signing");
    setSignatureError(null);

    try {
      try {
        await signProcessArtifactWithPassword({
          processId: process.id,
          artifactType: ANALYSIS_ARTIFACT_TYPE,
          artifactKey: ANALYSIS_ARTIFACT_KEY,
          signerSlot: slot,
          password: signaturePassword,
          payload,
        });
      } catch (error) {
        // Idempotência real: se o servidor concluiu a gravação e a resposta se
        // perdeu, uma segunda tentativa retorna 409. Nesse caso confirmamos no
        // banco e tratamos como sucesso, sem duplicar assinatura.
        if (
          !(error instanceof ArtifactSignatureError) ||
          error.code !== "SIGNATURE_ALREADY_EXISTS"
        ) {
          throw error;
        }
      }

      setSignatureStage("verifying");

      let snapshot = await getProcessArtifactSignatures(process.id, ANALYSIS_ARTIFACT_KEY);
      let verifiedSigner = snapshot.signers.find((item) => item.slot === slot);

      for (let attempt = 0; attempt < 3 && (!snapshot.block || !verifiedSigner); attempt += 1) {
        await wait(220 + attempt * 180);
        snapshot = await getProcessArtifactSignatures(process.id, ANALYSIS_ARTIFACT_KEY);
        verifiedSigner = snapshot.signers.find((item) => item.slot === slot);
      }

      const signedPayload = snapshot.block?.payload ?? {};
      const payloadMatches =
        stableSignatureStringify(payload) === stableSignatureStringify(signedPayload);

      if (
        !snapshot.block ||
        !verifiedSigner ||
        !snapshot.block.verification_code ||
        !snapshot.block.artifact_hash ||
        !payloadMatches
      ) {
        throw new ArtifactSignatureError(
          "A assinatura não foi confirmada integralmente no banco oficial. Nenhum sucesso visual foi aplicado.",
          {
            stage: "verification",
            code: "SIGNATURE_READBACK_FAILED",
          },
        );
      }

      const signedAt =
        verifiedSigner.signed_at ||
        snapshot.block.completed_at ||
        new Date().toISOString();
      const verificationCode = snapshot.block.verification_code;
      const evidenceHash = snapshot.block.artifact_hash;

      const signature: ChecklistSignature = {
        userId: verifiedSigner.profile_id || session.id,
        name: verifiedSigner.name || session.name,
        title:
          verifiedSigner.title ||
          verifiedSigner.role ||
          session.title ||
          (kind === "technical" ? "Analista Técnico" : "Diretor(a)"),
        signedAt,
        verificationCode,
        evidenceHash,
        registration: verifiedSigner.registration ?? null,
        authMethod: verifiedSigner.auth_method || "password_reauth",
        official: true,
      };

      const now = new Date().toISOString();
      const next: AnalysisChecklistState =
        kind === "technical"
          ? {
              ...state,
              analystId: session.id,
              analystName: signature.name,
              analystTitle: signature.title,
              technicalSignature: signature,
              directorSignature: null,
              signedBy: signature.name,
              signedAt,
              savedAt: now,
            }
          : {
              ...state,
              directorSignature: signature,
              savedAt: now,
            };

      persistState(next);
      setSignaturePassword("");
      setSignatureStage("idle");
      setSignatureDialog(null);
      if (kind === "director") {
        const requestSnapshot = await getProcessArtifactSignatureRequest(
          process.id,
          ANALYSIS_ARTIFACT_KEY,
          "diretoria",
        );
        setDirectorRequest(requestSnapshot);
      }

      setNotice(
        kind === "technical"
          ? `Análise técnica assinada e confirmada no banco oficial. Código: ${verificationCode}.`
          : `Assinatura da Diretoria concluída e confirmada no banco oficial. Código: ${verificationCode}.`,
      );
    } catch (error) {
      setSignaturePassword("");
      setSignatureStage("idle");
      if (error instanceof ArtifactSignatureError) {
        setSignatureError({
          message: error.message,
          stage: error.stage,
          code: error.code,
        });
      } else {
        setSignatureError({
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível concluir a assinatura eletrônica.",
          stage: "client",
          code: "SIGNATURE_FLOW_ERROR",
        });
      }
    } finally {
      setSignatureBusy(false);
    }
  };

  const requestDirectorSignature = async () => {
    if (!canRequestDirector || !state.technicalSignature?.evidenceHash) {
      setNotice("Conclua primeiro a assinatura técnica desta versão.");
      return;
    }

    setDirectorRequestBusy(true);
    try {
      const snapshot = await requestProcessArtifactSignature({
        processId: process.id,
        artifactKey: ANALYSIS_ARTIFACT_KEY,
        artifactHash: state.technicalSignature?.evidenceHash || "",
        signerSlot: "diretoria",
      });
      setDirectorRequest(snapshot);
      setNotice(
        snapshot.candidate_count > 0
          ? "Solicitação de assinatura enviada à Diretoria. O diretor receberá a pendência e poderá assinar com a própria senha."
          : "Solicitação registrada. Ainda não existe um perfil ativo identificado como Diretor(a) neste município; assim que o cargo for atribuído, a pendência ficará disponível.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível solicitar a assinatura da Diretoria.",
      );
    } finally {
      setDirectorRequestBusy(false);
    }
  };

  const saveWithdrawalRecord = async () => {
    if (!canRecordWithdrawal) {
      setNotice("Somente o Analista Técnico responsável pode registrar a retirada em mãos.");
      return;
    }
    if (!withdrawalName.trim()) {
      setNotice("Informe o nome de quem retirou o documento em mãos.");
      return;
    }
    if (!withdrawalDate) {
      setNotice("Informe a data da retirada.");
      return;
    }

    setWithdrawalBusy(true);
    try {
      const snapshot = await saveProcessArtifactWithdrawal({
        processId: process.id,
        artifactKey: ANALYSIS_ARTIFACT_KEY,
        artifactHash: state.technicalSignature.evidenceHash,
        withdrawnByName: withdrawalName.trim(),
        withdrawnAt: withdrawalDate,
      });
      setWithdrawalRecord(snapshot.withdrawal);
      setNotice("Retirada em mãos registrada no processo.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a retirada em mãos.",
      );
    } finally {
      setWithdrawalBusy(false);
    }
  };

  const signTechnicalEvaluation = () => openSignatureConfirmation("technical");
  const signDirectorReview = () => openSignatureConfirmation("director");

  const renderSignatureEvidence = (
    signature: ChecklistSignature | null | undefined,
    official: boolean,
    label: string,
  ) => {
    if (!official || !signature) return null;

    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_10px_28px_rgba(5,150,105,0.10)] dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="flex items-center gap-3 border-b border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fffc_100%)] px-4 py-3 dark:border-emerald-500/20 dark:bg-none dark:bg-emerald-950/25">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.25)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              Assinatura eletrônica válida
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-950 dark:text-white">
              {label}
            </p>
          </div>
        </div>

        <div className="grid gap-3 px-4 py-4 text-xs sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Documento assinado eletronicamente por
            </p>
            <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
              {signature.name}
            </p>
            <p className="mt-0.5 text-slate-500 dark:text-slate-300">
              {[signature.title, signature.registration ? `Registro ${signature.registration}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Data e hora
            </p>
            <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
              {new Date(signature.signedAt).toLocaleString("pt-BR")}
            </p>
          </div>

          <div className="rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/25">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-300">
              Código de verificação
            </p>
            <p className="mt-1 font-mono text-[11px] font-black text-emerald-800 dark:text-emerald-100">
              {signature.verificationCode}
            </p>
          </div>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Integridade SHA-256
            </p>
            <p className="mt-1 break-all font-mono text-[10px] font-semibold leading-4 text-slate-600 dark:text-slate-300">
              {signature.evidenceHash || "Registrado no banco oficial"}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const generatePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const margin = 10;
      const contentW = pageW - margin * 2;
      const totalPages = 2;

      const navy = [7, 47, 73] as const;
      const blue = [7, 89, 133] as const;
      const slate = [15, 23, 42] as const;
      const muted = [71, 85, 105] as const;
      const line = [203, 213, 225] as const;
      const light = [248, 250, 252] as const;
      const emerald = [5, 150, 105] as const;
      const amber = [180, 83, 9] as const;

      const logoDataUrl =
        (await loadPdfImageDataUrl(resolvedMunicipalityLogoUrl)) ||
        (await loadPdfImageDataUrl(CAMPO_LIMPO_BRASAO_FALLBACK));

      const rawProtocol = process.protocol?.trim() || "Não informado";
      const protocolLabel = /^processo\b/i.test(rawProtocol)
        ? rawProtocol
        : `Processo nº ${rawProtocol}`;
      const currentSecretariat =
        /campo\s+limpo\s+paulista/i.test(municipalityName || "") &&
        (!secretariat ||
          /^secretaria\s+de\s+desenvolvimento\s+urbano$/i.test(secretariat.trim()))
          ? "Secretaria de Desenvolvimento Urbano, Habitação e Meio Ambiente"
          : secretariat || "Secretaria responsável";
      const currentDirectorate =
        directorate || departmentLabel || "Diretoria de Urbanismo";
      const currentAddress =
        municipalityAddress ||
        (/campo\s+limpo\s+paulista/i.test(municipalityName || "")
          ? "Avenida Adherbal da Costa Moreira, 255 - Jardim América - Campo Limpo Paulista/SP"
          : "");
      const currentPhone =
        municipalityPhone ||
        (/campo\s+limpo\s+paulista/i.test(municipalityName || "")
          ? "(11) 4038-8300"
          : "");
      const analysisDateLabel = state.analysisDate
        ? state.analysisDate.split("-").reverse().join("/")
        : "Não informada";

      const drawCheckSeal = (cx: number, cy: number, radius = 3.2) => {
        doc.setFillColor(...emerald);
        doc.circle(cx, cy, radius, "F");
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.65);
        doc.line(cx - 1.35, cy, cx - 0.35, cy + 1.05);
        doc.line(cx - 0.35, cy + 1.05, cx + 1.55, cy - 1.15);
      };

      const drawFooter = (pageNumber: number) => {
        doc.setDrawColor(...line);
        doc.setLineWidth(0.2);
        doc.line(margin, 286, pageW - margin, 286);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.7);
        doc.setTextColor(...muted);
        doc.text(
          "SIGAPRO Municipal - Ficha Oficial de Análise de Processo",
          margin,
          290.3,
        );
        doc.text(
          `Página ${pageNumber} de ${totalPages}`,
          pageW - margin,
          290.3,
          { align: "right" },
        );
      };

      const drawHeader = (pageNumber: number, compact = false) => {
        const headerH = 31;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(214, 223, 232);
        doc.setLineWidth(0.25);
        doc.roundedRect(margin, 8, contentW, headerH, 2.6, 2.6, "FD");

        doc.setFillColor(...blue);
        doc.roundedRect(margin, 8, 3.2, headerH, 1.6, 1.6, "F");

        if (logoDataUrl) {
          try {
            doc.addImage(
              logoDataUrl,
              pdfImageFormat(logoDataUrl),
              margin + 7,
              10.5,
              19,
              19,
              undefined,
              "FAST",
            );
          } catch {
            // Mantém a identificação textual se o navegador não decodificar a imagem.
          }
        }

        const copyX = logoDataUrl ? margin + 31 : margin + 8;
        doc.setTextColor(...slate);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text((municipalityName || "Prefeitura Municipal").toUpperCase(), copyX, 14.8);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(...muted);
        doc.setFontSize(5.9);
        doc.text(
          doc.splitTextToSize(currentSecretariat.toUpperCase(), 104).slice(0, 1),
          copyX,
          19.4,
        );
        doc.text(currentDirectorate.toUpperCase(), copyX, 23.6);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(...blue);
        doc.setFontSize(compact ? 6.5 : 7);
        doc.text("FICHA OFICIAL DE ANÁLISE DE PROCESSO", copyX, 29.2);

        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(pageW - margin - 34, 12, 28, 8, 4, 4, "FD");
        doc.setTextColor(...navy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.9);
        doc.text(`PÁGINA ${pageNumber}/${totalPages}`, pageW - margin - 20, 17.2, {
          align: "center",
        });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.2);
        doc.setTextColor(...muted);
        doc.text(protocolLabel, pageW - margin - 6, 27.2, { align: "right" });

        const contact = [currentAddress, currentPhone, municipalityEmail]
          .filter(Boolean)
          .join("  •  ");
        if (contact) {
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(4.9);
          doc.text(
            doc.splitTextToSize(contact, 170).slice(0, 1),
            margin + 4,
            42.5,
          );
        }
      };

      const drawProcessSummary = (y: number) => {
        const h = 31;
        doc.setDrawColor(218, 226, 234);
        doc.setFillColor(250, 252, 254);
        doc.roundedRect(margin, y, contentW, h, 2.2, 2.2, "FD");

        const leftX = margin + 4;
        const rightX = margin + 100;

        const drawField = (
          label: string,
          value: string,
          x: number,
          labelY: number,
          width: number,
        ) => {
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(4.8);
          doc.text(label, x, labelY);

          doc.setTextColor(...slate);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.text(
            doc.splitTextToSize(value || "Não informado", width).slice(0, 1),
            x,
            labelY + 4.1,
          );
        };

        drawField("PROCESSO", protocolLabel, leftX, y + 5, 84);
        drawField(
          "PROPRIETÁRIO",
          process.ownerName || "Não informado",
          rightX,
          y + 5,
          86,
        );

        drawField("PROJETO", process.title || "Não informado", leftX, y + 14, 84);
        drawField(
          "RESPONSÁVEL TÉCNICO",
          process.technicalLead || "Não informado",
          rightX,
          y + 14,
          86,
        );

        drawField("IMÓVEL", process.address || "Não informado", leftX, y + 23, 84);
        drawField(
          "ANÁLISE / FOLHA",
          `${analysisDateLabel}  •  Folha ${state.sheetNumber || "1"}`,
          rightX,
          y + 23,
          86,
        );
      };

      const widths = {
        item: 8,
        desc: 82,
        a: 8,
        ap: 8,
        c: 8,
        na: 10,
        obs: 66,
      };

      const fitLines = (
        text: string,
        width: number,
        maxLines = 2,
        preferredFont = 5.6,
      ) => {
        let fontSize = preferredFont;
        let lines: string[] = [];
        while (fontSize >= 4.7) {
          doc.setFontSize(fontSize);
          lines = doc.splitTextToSize(text || "", width) as string[];
          if (lines.length <= maxLines) return { lines, fontSize };
          fontSize -= 0.25;
        }

        doc.setFontSize(4.7);
        lines = doc.splitTextToSize(text || "", width) as string[];
        if (lines.length > maxLines) {
          const clipped = lines.slice(0, maxLines);
          const last = clipped[maxLines - 1] || "";
          clipped[maxLines - 1] = `${last.replace(/[. ]+$/g, "")}…`;
          lines = clipped;
        }
        return { lines, fontSize: 4.7 };
      };

      const drawTableHeader = (title: string, y: number) => {
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(218, 226, 234);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentW, 6.8, 1.4, 1.4, "FD");
        doc.setFillColor(...blue);
        doc.roundedRect(margin, y, 2.2, 6.8, 1, 1, "F");

        doc.setTextColor(...slate);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.4);
        doc.text(title.toUpperCase(), margin + 4, y + 4.5);
        y += 7.3;

        const headers = [
          ["Item", widths.item],
          ["Documentação", widths.desc],
          ["A", widths.a],
          ["AP", widths.ap],
          ["C", widths.c],
          ["N/A", widths.na],
          ["Observações", widths.obs],
        ] as const;

        let x = margin;
        doc.setFillColor(248, 250, 252);
        doc.setTextColor(51, 65, 85);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.1);
        headers.forEach(([label, width]) => {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.rect(x, y, width, 5.6, "FD");
          doc.text(label, x + width / 2, y + 3.7, { align: "center" });
          x += width;
        });

        return y + 5.6;
      };

      const drawRow = (
        item: ChecklistTemplateItem,
        y: number,
        compact = false,
      ) => {
        const itemState = state.items[item.id] ?? { status: "", observation: "" };
        const desc = fitLines(
          item.label,
          widths.desc - 3.2,
          compact ? 1 : 2,
          compact ? 5.1 : 5.45,
        );
        const obs = fitLines(
          itemState.observation || "",
          widths.obs - 3.2,
          compact ? 1 : 2,
          compact ? 4.9 : 5.2,
        );
        const lineCount = Math.max(desc.lines.length, obs.lines.length, 1);
        const rowH = compact ? 5.8 : Math.max(6, 2.55 * lineCount + 2.6);

        const rowFill =
          item.order % 2 === 0
            ? ([250, 252, 254] as const)
            : ([255, 255, 255] as const);

        doc.setFillColor(...rowFill);
        doc.rect(margin, y, contentW, rowH, "F");

        doc.setDrawColor(214, 223, 232);
        doc.setLineWidth(0.16);
        doc.rect(margin, y, contentW, rowH, "S");

        const columnWidths = [
          widths.item,
          widths.desc,
          widths.a,
          widths.ap,
          widths.c,
          widths.na,
          widths.obs,
        ];
        let gridX = margin;
        for (let index = 0; index < columnWidths.length - 1; index += 1) {
          gridX += columnWidths[index];
          doc.line(gridX, y, gridX, y + rowH);
        }

        let x = margin;
        doc.setTextColor(...slate);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.1);
        doc.text(String(item.order), x + widths.item / 2, y + rowH / 2 + 1.45, {
          align: "center",
        });
        x += widths.item;

        doc.setFontSize(desc.fontSize);
        doc.text(desc.lines, x + 1.6, y + 3.65);
        x += widths.desc;

        for (const status of ["A", "AP", "C", "NA"] as const) {
          const width =
            status === "A"
              ? widths.a
              : status === "AP"
                ? widths.ap
                : status === "C"
                  ? widths.c
                  : widths.na;

          if (itemState.status === status) {
            const fill =
              status === "A"
                ? emerald
                : status === "AP"
                  ? blue
                  : status === "C"
                    ? amber
                    : ([71, 85, 105] as const);
            doc.setFillColor(...fill);
            doc.roundedRect(
              x + width / 2 - 2.15,
              y + rowH / 2 - 2.15,
              4.3,
              4.3,
              1.25,
              1.25,
              "F",
            );
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(5.2);
            doc.text("X", x + width / 2, y + rowH / 2 + 1.45, {
              align: "center",
            });
            doc.setTextColor(...slate);
            doc.setFont("helvetica", "normal");
          }
          x += width;
        }

        doc.setFontSize(obs.fontSize);
        doc.setTextColor(51, 65, 85);
        doc.text(obs.lines, x + 1.6, y + 3.65);

        return y + rowH;
      };

      const drawSectionRows = (
        title: string,
        items: ChecklistTemplateItem[],
        startY: number,
        compact = false,
      ) => {
        let y = drawTableHeader(title, startY);
        for (const item of items) y = drawRow(item, y, compact);
        return y;
      };

      const drawSignatureCard = (
        x: number,
        y: number,
        w: number,
        label: string,
        signature: ChecklistSignature | null | undefined,
        official: boolean,
        requested = false,
      ) => {
        const h = 39;
        if (official && signature) {
          doc.setFillColor(240, 253, 250);
          doc.setDrawColor(167, 243, 208);
          doc.roundedRect(x, y, w, h, 2.2, 2.2, "FD");
          drawCheckSeal(x + 7, y + 7, 3.2);

          doc.setTextColor(...emerald);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.8);
          doc.text("ASSINATURA ELETRÔNICA VÁLIDA", x + 13, y + 5.7);

          doc.setTextColor(...slate);
          doc.setFontSize(6.2);
          doc.text(label.toUpperCase(), x + 13, y + 9.7);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.2);
          doc.setTextColor(...muted);
          doc.text("Documento assinado eletronicamente por", x + 5, y + 15);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.4);
          doc.setTextColor(...slate);
          doc.text(
            doc.splitTextToSize(signature.name || "Usuário", w - 10).slice(0, 1),
            x + 5,
            y + 19.4,
          );

          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.3);
          const titleLine = [
            signature.title,
            signature.registration ? `Registro ${signature.registration}` : "",
          ]
            .filter(Boolean)
            .join(" - ");
          doc.text(
            doc.splitTextToSize(titleLine || "Função registrada no SIGAPRO", w - 10).slice(0, 1),
            x + 5,
            y + 23.6,
          );
          doc.text(
            new Date(signature.signedAt).toLocaleString("pt-BR"),
            x + 5,
            y + 27.6,
          );

          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.1);
          doc.setTextColor(...emerald);
          doc.text(
            `Código: ${signature.verificationCode || "registrado"}`,
            x + 5,
            y + 32,
          );

          doc.setFont("helvetica", "normal");
          doc.setTextColor(...muted);
          doc.setFontSize(4.7);
          doc.text(
            `SHA-256: ${compactEvidenceHash(signature.evidenceHash) || "registrado"}`,
            x + 5,
            y + 35.6,
          );
        } else {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(...line);
          doc.roundedRect(x, y, w, h, 2.2, 2.2, "FD");

          doc.setFillColor(226, 232, 240);
          doc.circle(x + 7, y + 7, 3.2, "F");
          doc.setTextColor(...muted);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.8);
          doc.text(
            requested ? "ASSINATURA SOLICITADA" : "ASSINATURA PENDENTE",
            x + 13,
            y + 5.7,
          );

          doc.setTextColor(...slate);
          doc.setFontSize(6.2);
          doc.text(label.toUpperCase(), x + 13, y + 9.7);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(...muted);
          doc.setFontSize(5.4);
          const pendingMessage = requested
            ? "Solicitação registrada pelo analista. Aguardando assinatura eletrônica da Diretoria."
            : signature
              ? "Há um registro antigo nesta ficha, mas ele ainda não foi validado com senha."
              : "Aguardando assinatura eletrônica com senha de acesso.";
          doc.text(
            doc.splitTextToSize(pendingMessage, w - 10).slice(0, 3),
            x + 5,
            y + 17,
          );
        }
      };

      // Página 1 - dados principais + primeiros 20 itens de Engenharia.
      drawHeader(1);
      drawProcessSummary(47);
      let y = drawSectionRows(
        "Engenharia - Itens 1 a 20",
        ENGINEERING_ITEMS.slice(0, 20),
        82,
      );

      doc.setTextColor(...muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      doc.text(
        "Legenda: A = De acordo   AP = Apresentar   C = Corrigir   N/A = Não se aplica",
        margin,
        Math.min(y + 5.5, 281),
      );
      drawFooter(1);

      // Página 2 - conclusão dos itens + externas + resultado + assinaturas.
      doc.addPage();
      drawHeader(2, true);
      doc.setFillColor(250, 252, 254);
      doc.setDrawColor(218, 226, 234);
      doc.roundedRect(margin, 47, contentW, 10, 2, 2, "FD");
      doc.setTextColor(...slate);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(protocolLabel, margin + 4, 53.2);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...muted);
      doc.setFontSize(5.4);
      doc.text(
        doc.splitTextToSize(process.title || "Projeto", 82).slice(0, 1),
        margin + 58,
        53.2,
      );
      doc.text(
        `Análise: ${analysisDateLabel}  •  Folha ${state.sheetNumber || "1"}`,
        pageW - margin - 4,
        53.2,
        { align: "right" },
      );

      y = drawSectionRows(
        "Engenharia - Itens 21 a 31",
        ENGINEERING_ITEMS.slice(20),
        61,
        true,
      );
      y = drawSectionRows("Aprovações externas", EXTERNAL_ITEMS, y + 4, true);

      const resultY = Math.max(y + 4, 170);
      doc.setFillColor(...light);
      doc.setDrawColor(...line);
      doc.roundedRect(margin, resultY, contentW, 25, 2.2, 2.2, "FD");

      doc.setTextColor(...slate);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.text("RESULTADO DA ANÁLISE", margin + 4, resultY + 5.2);

      const metrics = [
        ["DE ACORDO", counts.a, [236, 253, 245] as const, [167, 243, 208] as const, [4, 120, 87] as const],
        ["APRESENTAR", counts.ap, [239, 246, 255] as const, [186, 230, 253] as const, [3, 105, 161] as const],
        ["CORRIGIR", counts.c, [255, 247, 237] as const, [254, 215, 170] as const, [180, 83, 9] as const],
        ["N/A", counts.na, [248, 250, 252] as const, [203, 213, 225] as const, [71, 85, 105] as const],
      ] as const;

      metrics.forEach(([label, value, fill, border, textColor], index) => {
        const x = margin + 4 + index * 31;
        doc.setFillColor(...fill);
        doc.setDrawColor(...border);
        doc.roundedRect(x, resultY + 8, 28, 8, 2, 2, "FD");
        doc.setTextColor(...textColor);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4.4);
        doc.text(label, x + 3, resultY + 11.2);
        doc.setFontSize(7.1);
        doc.text(String(value), x + 24, resultY + 13.3, { align: "right" });
      });

      const routingLabel =
        state.routing === "expediente"
          ? "Expediente"
          : state.routing === "topografia"
            ? "Topografia"
            : state.routing === "outro"
              ? state.routingOther || "Outro"
              : "Não definido";

      doc.setTextColor(...muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.1);
      const conclusion =
        state.conclusion?.trim() || "Sem conclusão complementar.";
      doc.text(
        `Conclusão: ${doc.splitTextToSize(conclusion, 82).slice(0, 1).join(" ")}`,
        margin + 4,
        resultY + 21,
      );
      doc.text(
        `Encaminhamento: ${routingLabel}`,
        margin + 98,
        resultY + 18.6,
      );
      doc.text(
        `Comunique-se: ${state.communiquePages || "Não informado"}`,
        margin + 98,
        resultY + 22,
      );

      const signatureY = resultY + 30;
      const signatureCardW = 92;
      const signatureGap = 6;
      drawSignatureCard(
        margin,
        signatureY,
        signatureCardW,
        "Análise técnica",
        state.technicalSignature,
        technicalOfficial,
      );
      drawSignatureCard(
        margin + signatureCardW + signatureGap,
        signatureY,
        signatureCardW,
        "Diretoria",
        state.directorSignature,
        directorOfficial,
        directorRequestPending,
      );

      const withdrawalY = signatureY + 41;
      doc.setFillColor(250, 252, 254);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, withdrawalY, contentW, 10, 2, 2, "FD");
      doc.setTextColor(...slate);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.2);
      doc.text("RETIRADA EM MÃOS", margin + 4, withdrawalY + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...muted);
      doc.setFontSize(5.1);
      doc.text(
        `Retirada por: ${withdrawalMatchesCurrentVersion ? withdrawalRecord?.withdrawn_by_name : "Não registrada"}`,
        margin + 4,
        withdrawalY + 7.8,
      );
      doc.text(
        `Data: ${withdrawalMatchesCurrentVersion && withdrawalRecord?.withdrawn_at
          ? withdrawalRecord.withdrawn_at.split("-").reverse().join("/")
          : "Não registrada"}`,
        pageW - margin - 4,
        withdrawalY + 7.8,
        { align: "right" },
      );

      drawFooter(2);

      const fileName = `analise-${normalizeFilePart(process.protocol)}.pdf`;
      doc.save(fileName);
      setNotice(
        directorOfficial
          ? "PDF oficial gerado em 2 páginas com as assinaturas do Analista Técnico e da Diretoria."
          : directorRequestPending
            ? "PDF oficial gerado em 2 páginas. A assinatura da Diretoria permanece solicitada."
            : technicalOfficial
              ? "PDF oficial gerado em 2 páginas. A análise técnica está assinada e a Diretoria permanece pendente."
              : "PDF oficial gerado em 2 páginas. As assinaturas pendentes permanecem identificadas no documento.",
      );
    } catch (error) {
      console.error("[SIGAPRO][PDF] Falha ao gerar ficha oficial.", error);
      setNotice(
        error instanceof Error
          ? `Não foi possível gerar o PDF: ${error.message}`
          : "Não foi possível gerar o PDF.",
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const renderSection = (title: string, subtitle: string, items: ChecklistTemplateItem[]) => (
    <section data-analysis-section="true" data-force-card-contrast="adaptive" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_16px_38px_rgba(0,0,0,0.20)]">
      <div data-analysis-section-header="true" className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {items.filter((item) => Boolean(state.items[item.id]?.status)).length}/{items.length} avaliados
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => {
          const itemState = state.items[item.id] ?? { status: "", observation: "" };
          return (
            <div
              key={item.id}
              data-analysis-row="true"
              className="grid gap-3 px-4 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/35 xl:grid-cols-[minmax(0,1.45fr)_auto_minmax(280px,0.9fr)] xl:items-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {item.order}
                </span>
                <p className="pt-1 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{item.label}</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(["A", "AP", "C", "NA"] as const).map((status) => {
                  const selected = itemState.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      data-checklist-status={status}
                      data-selected={selected ? "true" : "false"}
                      aria-pressed={selected}
                      onClick={() => updateItem(item.id, { status: selected ? "" : status })}
                      className={cn(
                        "relative inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-[11px] font-black transition-all",
                        selected
                          ? status === "A"
                            ? "border-emerald-800 bg-emerald-600 !text-white shadow-[0_0_0_3px_rgba(16,185,129,0.22),0_8px_18px_rgba(5,150,105,0.24)] ring-1 ring-emerald-300"
                            : status === "AP"
                              ? "border-sky-800 bg-sky-600 !text-white shadow-[0_0_0_3px_rgba(14,165,233,0.20),0_8px_18px_rgba(2,132,199,0.24)] ring-1 ring-sky-300"
                              : status === "C"
                                ? "border-amber-800 bg-amber-600 !text-white shadow-[0_0_0_3px_rgba(245,158,11,0.20),0_8px_18px_rgba(217,119,6,0.24)] ring-1 ring-amber-300"
                                : "border-slate-800 bg-slate-700 !text-white shadow-[0_0_0_3px_rgba(100,116,139,0.20),0_8px_18px_rgba(51,65,85,0.24)] ring-1 ring-slate-400"
                          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                      )}
                      title={STATUS_META[status].label}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        <span>{STATUS_META[status].short}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <Input
                value={itemState.observation}
                onChange={(event) => updateItem(item.id, { observation: event.target.value })}
                placeholder="Observação do analista..."
                className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <Card data-urban-analysis-sheet="true" className="overflow-hidden rounded-[28px] border-slate-200 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <CardHeader
        data-force-card-contrast="dark"
        data-premium-process-dark-header="analysis"
        data-analysis-dark-header="true"
        data-premium-inverse-surface="true"
        className="sig-process-dark-surface-v9 border-b border-white/10 bg-[linear-gradient(135deg,#06192b_0%,#0a4166_52%,#0879a8_100%)] px-5 py-5 text-white shadow-[0_14px_34px_rgba(3,38,65,0.18)] md:px-6"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div data-analysis-header-icon="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-sky-400/15 !text-white shadow-inner">
              <ClipboardCheck className="h-6 w-6 !text-white" />
            </div>
            <div data-analysis-header-copy="true" className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] !text-sky-100">Caderno técnico digital</p>
              <CardTitle className="mt-1 text-xl font-bold !text-white">Ficha Oficial de Análise do Processo</CardTitle>
              <p className="mt-1 max-w-3xl text-sm leading-6 !text-slate-200">
                A ficha municipal foi transformada em uma mesa digital de conferência: análise técnica, observações por item, encaminhamento, assinaturas eletrônicas e PDF oficial.
              </p>

              {organogramTrail.length > 0 ? (
                <div data-dark-organogram-trail="true" className="mt-3 flex flex-wrap items-center gap-2">
                  {organogramTrail.map((unit, index) => (
                    <div key={`analysis-org-${unit.code}-${unit.name}`} className="flex items-center gap-2">
                      {index > 0 ? <span className="!text-sky-200/80">›</span> : null}
                      <span
                        data-dark-organogram-code="true"
                        className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-[0.10em] !text-white shadow-sm backdrop-blur-sm"
                        title={unit.name}
                      >
                        <span className="!text-white">{unit.code}</span>
                        <span className="hidden font-semibold tracking-normal !text-sky-100 sm:inline">
                          {unit.name}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[430px]">
            <div data-analysis-metric="blue" className="rounded-2xl border border-sky-300/35 bg-[#075985] px-3 py-3 shadow-[0_8px_20px_rgba(2,132,199,0.22)]">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-sky-100">Avaliados</p>
              <p className="mt-1 text-xl font-bold !text-white">{counts.evaluated}/{counts.total}</p>
            </div>
            <div data-analysis-metric="emerald" className="rounded-2xl border border-emerald-300/35 bg-[#056249] px-3 py-3 shadow-[0_8px_20px_rgba(5,150,105,0.22)]">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-emerald-100">De acordo</p>
              <p className="mt-1 text-xl font-bold !text-emerald-50">{counts.a}</p>
            </div>
            <div data-analysis-metric="amber" className="rounded-2xl border border-amber-300/35 bg-[#8a5b08] px-3 py-3 shadow-[0_8px_20px_rgba(217,119,6,0.22)]">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-amber-100">Pendências</p>
              <p className="mt-1 text-xl font-bold !text-amber-50">{pendingCorrectionCount}</p>
            </div>
            <div data-analysis-metric="cyan" className="rounded-2xl border border-cyan-300/35 bg-[#0a6077] px-3 py-3 shadow-[0_8px_20px_rgba(8,145,178,0.22)]">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-cyan-100">Progresso</p>
              <p className="mt-1 text-xl font-bold !text-white">{progress}%</p>
            </div>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_100%)] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </CardHeader>

      <CardContent data-workspace-surface="adaptive" className="space-y-5 bg-[linear-gradient(180deg,#fbfdff_0%,#f5f8fc_100%)] p-5 dark:bg-[linear-gradient(180deg,#0f172a_0%,#0b1320_100%)] md:p-6">
        <section data-analysis-identity="true" data-force-card-contrast="adaptive" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-4 border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef6fb_100%)] px-5 py-5 dark:border-slate-700 dark:bg-[linear-gradient(135deg,#0d2032_0%,#10283d_100%)] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
              {resolvedMunicipalityLogoUrl ? (
                <img src={resolvedMunicipalityLogoUrl} alt="" className="h-full w-full object-contain p-2" />
              ) : (
                <ClipboardCheck className="h-6 w-6 text-sky-700 dark:text-sky-300" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {municipalityName || "Prefeitura Municipal"}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                {secretariat || "Secretaria responsável"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {directorate || departmentLabel || "Diretoria de Urbanismo"}
              </p>
              {[municipalityPhone, municipalityEmail, municipalityAddress].filter(Boolean).length > 0 ? (
                <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {[municipalityPhone, municipalityEmail, municipalityAddress].filter(Boolean).join(" • ")}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-right dark:border-sky-500/30 dark:bg-sky-950/30">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">Documento municipal</p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">Análise de Processos</p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Folha {state.sheetNumber || "1"}</p>
            </div>
          </div>

          <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-4">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 md:border-r xl:border-b-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Processo</p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{process.protocol?.trim() || "Não informado"}</p>
            </div>
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 xl:border-b-0 xl:border-r">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Requerente / proprietário</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-white">{process.ownerName}</p>
            </div>
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 md:border-r xl:border-b-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Responsável técnico</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-white">{process.technicalLead || "Não informado"}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Imóvel</p>
              <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-950 dark:text-white">{process.address || "Não informado"}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div data-analysis-mini-card="true" data-force-card-contrast="adaptive" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Processo</p>
            <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{process.protocol?.trim() || "Não informado"}</p>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{process.title}</p>
          </div>
          <div data-analysis-mini-card="true" data-force-card-contrast="adaptive" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Usuário em conferência</p>
            <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{session.name}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{session.title || "Servidor municipal"}</p>
          </div>
          <div data-analysis-mini-card="true" data-force-card-contrast="adaptive" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Data da análise</p>
            <Input
              type="date"
              value={state.analysisDate}
              onChange={(event) => setState((current) => invalidateSignature({ ...current, analysisDate: event.target.value }))}
              className="mt-2 h-9 rounded-xl border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div data-analysis-mini-card="true" data-force-card-contrast="adaptive" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Folha / revisão</p>
            <Input
              value={state.sheetNumber}
              onChange={(event) => setState((current) => invalidateSignature({ ...current, sheetNumber: event.target.value }))}
              placeholder="1"
              className="mt-2 h-9 rounded-xl border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>

        <div data-analysis-legend="true" data-force-card-contrast="adaptive" className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="font-bold text-slate-700 dark:text-slate-200">Legenda:</span>
          {(Object.keys(STATUS_META) as Array<Exclude<ChecklistStatus, "">>).map((status) => (
            <span key={status} className={cn("rounded-full border px-2.5 py-1 font-semibold", STATUS_META[status].classes)}>
              {STATUS_META[status].short} = {STATUS_META[status].label}
            </span>
          ))}
        </div>

        {renderSection("Engenharia", "Conferência documental e técnica do projeto.", ENGINEERING_ITEMS)}
        {renderSection("Aprovações externas", "Órgãos e documentos complementares exigidos conforme o caso.", EXTERNAL_ITEMS)}

        <section data-force-card-contrast="adaptive" className="grid gap-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-sky-700 dark:text-sky-300" />
              <p className="text-sm font-bold text-slate-950 dark:text-white">Conclusão e observações gerais</p>
            </div>
            <Textarea
              value={state.conclusion}
              onChange={(event) => setState((current) => invalidateSignature({ ...current, conclusion: event.target.value }))}
              placeholder="Registre a conclusão técnica, condicionantes ou orientações gerais..."
              className="mt-3 min-h-[132px] rounded-2xl border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                <p className="text-sm font-bold text-slate-950 dark:text-white">Encaminhamento após análise</p>
              </div>
              <Select
                value={state.routing || "none"}
                onValueChange={(value) =>
                  setState((current) =>
                    invalidateSignature({
                      ...current,
                      routing: value === "none" ? "" : (value as AnalysisChecklistState["routing"]),
                    }),
                  )
                }
              >
                <SelectTrigger className="mt-3 h-11 rounded-xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                  <SelectValue placeholder="Selecionar destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não definido</SelectItem>
                  <SelectItem value="expediente">Expediente</SelectItem>
                  <SelectItem value="topografia">Topografia</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
              {state.routing === "outro" ? (
                <Input
                  value={state.routingOther}
                  onChange={(event) => setState((current) => invalidateSignature({ ...current, routingOther: event.target.value }))}
                  placeholder="Informe o destino..."
                  className="mt-2 h-10 rounded-xl"
                />
              ) : null}
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                Folhas / referência do Comunique-se
              </label>
              <Input
                value={state.communiquePages}
                onChange={(event) => setState((current) => invalidateSignature({ ...current, communiquePages: event.target.value }))}
                placeholder="Ex.: folhas 12 a 15"
                className="mt-2 h-10 rounded-xl"
              />
            </div>
          </div>
        </section>

        <section data-force-card-contrast="adaptive" className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Validação da ficha</p>
              <p className="mt-1 text-base font-bold text-slate-950 dark:text-white">Assinaturas do Analista Técnico e da Diretoria</p>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                O analista conclui a avaliação e pode solicitar formalmente a assinatura da Diretoria. O diretor recebe a pendência, confirma com a própria senha e a assinatura passa a integrar o PDF oficial. Qualquer alteração da ficha invalida as assinaturas vinculadas à versão anterior.
              </p>
            </div>
            <div className={cn(
              "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em]",
              isFullySigned
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-200"
                : technicalOfficial
                  ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/35 dark:text-sky-200"
                  : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
            )}>
              {isFullySigned ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Signature className="h-3.5 w-3.5" />}
              {isFullySigned
                ? "Ficha concluída"
                : directorRequestPending
                  ? "Aguardando Diretoria"
                  : technicalOfficial
                    ? "Em validação"
                    : "Em elaboração"}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className={cn(
              "rounded-[20px] border p-4",
              technicalOfficial
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40",
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  technicalOfficial
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  {technicalOfficial ? <CheckCircle2 className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">1ª assinatura</p>
                  <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">Responsável pela análise técnica</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {state.technicalSignature
                      ? `${state.technicalSignature.name} · ${state.technicalSignature.title} · ${new Date(state.technicalSignature.signedAt).toLocaleString("pt-BR")}`
                      : "Pendente da assinatura do analista responsável."}
                    {state.technicalSignature && !technicalOfficial ? (
                      <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-300">
                        Registro anterior ainda não confirmado eletronicamente com senha.
                      </span>
                    ) : null}
                    {technicalOfficial && state.technicalSignature?.verificationCode ? (
                      <span className="mt-1 block font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Código: {state.technicalSignature.verificationCode}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              {renderSignatureEvidence(
                state.technicalSignature,
                technicalOfficial,
                "Análise técnica",
              )}
              {canSignTechnical ? (
                <Button
                  type="button"
                  data-analysis-signature-action="technical"
                  className="mt-4 w-full rounded-xl border border-sky-500 bg-[#082f49] font-bold !text-white shadow-[0_9px_22px_rgba(8,47,73,0.24)] hover:bg-[#0b4568] [&_*]:!text-white"
                  onClick={signTechnicalEvaluation}
                  disabled={technicalOfficial}
                >
                  <Signature className="mr-2 h-4 w-4" />
                  {technicalOfficial
                    ? "Assinatura eletrônica concluída"
                    : state.technicalSignature
                      ? "Confirmar assinatura com senha"
                      : "Assinar análise técnica"}
                </Button>
              ) : null}
            </div>

            <div className={cn(
              "rounded-[20px] border p-4",
              directorOfficial
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                : directorRequestPending
                  ? "border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-950/25"
                  : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40",
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  directorOfficial
                    ? "bg-emerald-600 text-white"
                    : directorRequestPending
                      ? "bg-sky-700 text-white"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  {directorOfficial ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Building2 className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">2ª assinatura</p>
                  <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">Diretoria responsável</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {state.directorSignature
                      ? `${state.directorSignature.name} · ${state.directorSignature.title} · ${new Date(state.directorSignature.signedAt).toLocaleString("pt-BR")}`
                      : directorRequestPending
                        ? `Solicitada por ${directorRequest.request?.requested_by_name || "Analista"} em ${directorRequest.request?.requested_at ? new Date(directorRequest.request.requested_at).toLocaleString("pt-BR") : "data registrada"}.`
                        : technicalOfficial
                          ? "O analista pode solicitar a assinatura eletrônica da Diretoria."
                          : "Disponível depois da assinatura técnica eletrônica."}
                    {directorRequestPending && directorRequest.candidate_count === 0 ? (
                      <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-300">
                        Nenhum perfil ativo está identificado como Diretor(a) neste município.
                      </span>
                    ) : null}
                    {directorOfficial && state.directorSignature?.verificationCode ? (
                      <span className="mt-1 block font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Código: {state.directorSignature.verificationCode}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>

              {renderSignatureEvidence(
                state.directorSignature,
                directorOfficial,
                "Diretoria",
              )}

              {canRequestDirector && !directorOfficial ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full rounded-xl border-sky-300 bg-sky-50 font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-200"
                  disabled={!technicalOfficial || directorRequestBusy || directorRequestPending}
                  onClick={() => void requestDirectorSignature()}
                >
                  {directorRequestBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : directorRequestPending ? (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {directorRequestBusy
                    ? "Enviando solicitação..."
                    : directorRequestPending
                      ? "Solicitação enviada à Diretoria"
                      : "Solicitar assinatura do Diretor"}
                </Button>
              ) : null}

              {isDirectorProfile ? (
                <Button
                  type="button"
                  className="mt-3 w-full rounded-xl bg-[#082f49] font-bold !text-white shadow-[0_9px_22px_rgba(8,47,73,0.20)] hover:bg-[#0b4568] [&_*]:!text-white"
                  disabled={!directorRequestPending || directorOfficial}
                  onClick={signDirectorReview}
                >
                  <Signature className="mr-2 h-4 w-4" />
                  {directorOfficial
                    ? "Assinatura da Diretoria concluída"
                    : directorRequestPending
                      ? "Assinar como Diretor"
                      : "Aguardando solicitação do analista"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  Retirada em mãos
                </p>
                <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                  Registro de entrega física
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  O Analista Técnico registra o nome de quem retirou o documento e a data da retirada. Este registro não altera nem invalida as assinaturas eletrônicas.
                </p>
              </div>
              {withdrawalMatchesCurrentVersion ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Retirada registrada
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Retirada em mãos por
                </label>
                <Input
                  value={withdrawalName}
                  onChange={(event) => setWithdrawalName(event.target.value)}
                  placeholder="Nome completo de quem retirou"
                  className="mt-2 h-10 rounded-xl bg-white dark:bg-slate-900"
                  disabled={!canRecordWithdrawal || withdrawalBusy}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Data da retirada
                </label>
                <Input
                  type="date"
                  value={withdrawalDate}
                  onChange={(event) => setWithdrawalDate(event.target.value)}
                  className="mt-2 h-10 rounded-xl bg-white dark:bg-slate-900"
                  disabled={!canRecordWithdrawal || withdrawalBusy}
                />
              </div>
              {canSignTechnical ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-sky-300 bg-white font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-500/40 dark:bg-slate-900 dark:text-sky-200"
                  disabled={!canRecordWithdrawal || withdrawalBusy || !withdrawalName.trim() || !withdrawalDate}
                  onClick={() => void saveWithdrawalRecord()}
                >
                  {withdrawalBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {withdrawalBusy
                    ? "Registrando..."
                    : withdrawalMatchesCurrentVersion
                      ? "Atualizar retirada"
                      : "Registrar retirada"}
                </Button>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              O registro pode ser preenchido pelo Analista Técnico no momento da entrega física e permanece separado das assinaturas eletrônicas.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              {state.savedAt
                ? `Último rascunho: ${new Date(state.savedAt).toLocaleString("pt-BR")}`
                : "Nenhum rascunho salvo ainda."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={saveDraft}>
                <Save className="mr-2 h-4 w-4" />
                Salvar rascunho
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[linear-gradient(135deg,#082f49_0%,#075985_48%,#0f78b8_100%)] px-5 font-bold !text-white shadow-[0_10px_24px_rgba(7,89,133,0.24)] hover:brightness-110 [&_*]:!text-white"
                onClick={() => void generatePdf()}
                disabled={pdfBusy}
              >
                {pdfBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                {pdfBusy ? "Gerando PDF oficial..." : "Gerar PDF oficial"}
              </Button>
            </div>
          </div>

          {pendingCorrectionCount > 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Esta avaliação contém <strong>{pendingCorrectionCount}</strong> item(ns) marcados como Apresentar ou Corrigir. Eles podem fundamentar o Comunique-se do processo.
              </span>
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-200">
              {notice}
            </div>
          ) : null}
        </section>

        <Dialog
          open={Boolean(signatureDialog)}
          onOpenChange={(open) => {
            if (!open && !signatureBusy) {
              setSignatureDialog(null);
              setSignaturePassword("");
              setSignatureError(null);
            }
          }}
        >
          <DialogContent className="max-w-lg overflow-hidden rounded-[26px] border-slate-200 p-0 dark:border-slate-700">
            <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900">
              <DialogTitle className="flex items-center gap-2 text-left text-xl text-slate-950 dark:text-white">
                <ShieldCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                Confirmar assinatura eletrônica
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 p-6">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-100">
                <p className="font-bold">
                  {signatureDialog === "technical"
                    ? "Assinatura da análise técnica"
                    : "Assinatura da Diretoria"}
                </p>
                <p className="mt-1">
                  Informe a mesma senha usada para entrar no SIGAPRO. A senha será revalidada no Neon Auth e não será armazenada no processo.
                </p>
              </div>

              <div>
                <label htmlFor="analysis-signature-password" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Senha de acesso
                </label>
                <Input
                  id="analysis-signature-password"
                  type="password"
                  autoComplete="current-password"
                  value={signaturePassword}
                  onChange={(event) => setSignaturePassword(event.target.value)}
                  className="mt-2"
                  placeholder="Digite sua senha atual"
                  disabled={signatureBusy}
                  autoFocus
                />
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                A assinatura vincula sua identidade, cargo/função, data e hora, hash SHA-256 da ficha, código de verificação e trilha de auditoria.
              </div>

              {signatureBusy ? (
                <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,#f0f9ff_0%,#ffffff_70%)] p-4 dark:border-sky-500/30 dark:bg-none dark:bg-sky-950/25">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-700 text-white shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-950 dark:text-white">
                        {signatureStage === "verifying"
                          ? "Confirmando no banco oficial"
                          : "Validando identidade e registrando assinatura"}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-300">
                        {signatureStage === "verifying"
                          ? "Conferindo hash, código de verificação e assinante antes de concluir."
                          : "Sua senha está sendo revalidada e a evidência eletrônica está sendo registrada com segurança."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {signatureError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 dark:border-rose-500/30 dark:bg-rose-950/30">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                      <CircleAlert className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                        Não foi possível concluir a assinatura
                      </p>
                      <p className="mt-1 text-sm leading-5 text-rose-800 dark:text-rose-200">
                        {signatureError.message}
                      </p>
                      {signatureError.stage || signatureError.code ? (
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-rose-600/80 dark:text-rose-300/80">
                          {[signatureError.stage ? `etapa: ${signatureError.stage}` : "", signatureError.code ? `código: ${signatureError.code}` : ""]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={signatureBusy}
                  onClick={() => {
                    setSignatureDialog(null);
                    setSignaturePassword("");
                    setSignatureError(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-[#082f49] px-6 font-bold !text-white hover:bg-[#0b4568] [&_*]:!text-white"
                  disabled={signatureBusy || !signaturePassword}
                  onClick={() => void confirmElectronicSignature()}
                >
                  {signatureBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Signature className="mr-2 h-4 w-4" />
                  )}
                  {signatureBusy
                    ? signatureStage === "verifying"
                      ? "Confirmando assinatura..."
                      : "Validando e assinando..."
                    : "Confirmar com minha senha"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
