import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileDown,
  FileText,
  PenLine,
  Route,
  Save,
  Signature,
  ShieldCheck,
  Loader2,
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
  getProcessArtifactSignatures,
  signProcessArtifactWithPassword,
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
  fiscalSignature?: ChecklistSignature | null;
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
  "https://upload.wikimedia.org/wikipedia/commons/c/c9/Bras%C3%A3o_de_Campo_Limpo_Paulista_%28Vetor%29.png";

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
    fiscalSignature: null,
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
      fiscalSignature: parsed.fiscalSignature ?? null,
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
  const [signatureDialog, setSignatureDialog] = useState<"technical" | "fiscal" | null>(null);
  const [signaturePassword, setSignaturePassword] = useState("");
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureStage, setSignatureStage] = useState<SignatureFlowStage>("idle");
  const [signatureError, setSignatureError] = useState<SignatureFlowError>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

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
        const fiscal = snapshot.signers.find((item) => item.slot === "conferencia_fiscal");

        if (!technical && !fiscal) return;

        setState((current) => {
          const currentPayload = buildChecklistSignaturePayload(current, process, municipalityId);
          const signedPayload = snapshot.block?.payload ?? {};
          const payloadMatches =
            stableSignatureStringify(currentPayload) === stableSignatureStringify(signedPayload);

          if (!payloadMatches) {
            const next: AnalysisChecklistState = {
              ...current,
              technicalSignature: null,
              fiscalSignature: null,
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
            fiscalSignature: fiscal
              ? {
                  userId: fiscal.profile_id || "",
                  name: fiscal.name || "Usuário",
                  title: fiscal.title || fiscal.role || "Fiscal de Obras",
                  signedAt: fiscal.signed_at || snapshot.block?.completed_at || new Date().toISOString(),
                  verificationCode,
                  evidenceHash,
                  registration: fiscal.registration ?? null,
                  authMethod: fiscal.auth_method || "password_reauth",
                  official: true,
                }
              : current.fiscalSignature,
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
    ["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor", "analista"].includes(session.role);
  const canSignFiscal =
    ["master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor", "fiscal"].includes(session.role);
  const technicalOfficial = Boolean(
    state.technicalSignature?.official &&
    state.technicalSignature?.verificationCode &&
    state.technicalSignature?.authMethod === "password_reauth",
  );
  const fiscalOfficial = Boolean(
    state.fiscalSignature?.official &&
    state.fiscalSignature?.verificationCode &&
    state.fiscalSignature?.authMethod === "password_reauth",
  );
  const isFullySigned = technicalOfficial && fiscalOfficial;

  const invalidateSignature = (next: AnalysisChecklistState) => ({
    ...next,
    signedAt: "",
    signedBy: "",
    technicalSignature: null,
    fiscalSignature: null,
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
      "Rascunho técnico salvo para este processo. Analista e Fiscal podem continuar a conferência neste ambiente de validação.",
    );
  };

  const openSignatureConfirmation = (kind: "technical" | "fiscal") => {
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
      if (!canSignFiscal) {
        setNotice("Este perfil não possui atribuição para assinar a conferência fiscal.");
        return;
      }
      if (!technicalOfficial) {
        setNotice("A assinatura técnica eletrônica precisa ser concluída antes da conferência fiscal.");
        return;
      }
      if (fiscalOfficial) {
        setNotice("A conferência fiscal já possui assinatura eletrônica oficial nesta versão.");
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
      kind === "technical" ? "analise_tecnica" : "conferencia_fiscal";
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
          (kind === "technical" ? "Analista Técnico" : "Fiscal de Obras"),
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
              fiscalSignature: null,
              signedBy: signature.name,
              signedAt,
              savedAt: now,
            }
          : {
              ...state,
              fiscalSignature: signature,
              savedAt: now,
            };

      persistState(next);
      setSignaturePassword("");
      setSignatureStage("idle");
      setSignatureDialog(null);
      setNotice(
        kind === "technical"
          ? `Análise técnica assinada e confirmada no banco oficial. Código: ${verificationCode}.`
          : `Conferência fiscal assinada e confirmada no banco oficial. Código: ${verificationCode}.`,
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

  const signTechnicalEvaluation = () => openSignatureConfirmation("technical");
  const signFiscalReview = () => openSignatureConfirmation("fiscal");

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

      const logoUrl = resolveMunicipalityLogoUrl(municipalityName, municipalityLogoUrl);
      const logoDataUrl = await loadPdfImageDataUrl(logoUrl);

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
        const headerH = compact ? 26 : 29;
        doc.setFillColor(...navy);
        doc.roundedRect(margin, 8, contentW, headerH, 3, 3, "F");

        if (logoDataUrl) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(margin + 4, 11, 20, 20, 2.2, 2.2, "F");
          try {
            doc.addImage(
              logoDataUrl,
              pdfImageFormat(logoDataUrl),
              margin + 6,
              12.5,
              16,
              17,
              undefined,
              "FAST",
            );
          } catch {
            // O documento continua íntegro mesmo se um navegador não decodificar a imagem.
          }
        }

        const copyX = logoDataUrl ? margin + 28 : margin + 6;
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(compact ? 10.2 : 11);
        doc.text((municipalityName || "Prefeitura Municipal").toUpperCase(), copyX, 15);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text((secretariat || "Secretaria responsável").toUpperCase(), copyX, 20);
        doc.text(
          (directorate || departmentLabel || "Diretoria de Urbanismo").toUpperCase(),
          copyX,
          24.5,
        );

        if (!compact) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.3);
          doc.text("FICHA OFICIAL DE ANÁLISE DE PROCESSO", copyX, 29.5);
        }

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageW - margin - 34, 13, 28, 8.5, 4.2, 4.2, "F");
        doc.setTextColor(...navy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.2);
        doc.text(`PÁGINA ${pageNumber}/${totalPages}`, pageW - margin - 20, 18.4, {
          align: "center",
        });

        doc.setTextColor(226, 232, 240);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.6);
        doc.text(formatOfficialProcessNumber(process.protocol), pageW - margin - 6, 29.3, {
          align: "right",
        });
      };

      const drawProcessSummary = (y: number) => {
        doc.setDrawColor(...line);
        doc.setFillColor(...light);
        doc.roundedRect(margin, y, contentW, 22, 2.2, 2.2, "FD");

        const leftX = margin + 4;
        const rightX = margin + 102;
        doc.setTextColor(...muted);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.3);
        doc.text("PROCESSO", leftX, y + 5);
        doc.text("PROPRIETÁRIO", rightX, y + 5);

        doc.setTextColor(...slate);
        doc.setFontSize(7.2);
        doc.text(formatOfficialProcessNumber(process.protocol), leftX, y + 10);
        doc.text(
          doc.splitTextToSize(process.ownerName || "Não informado", 82).slice(0, 1),
          rightX,
          y + 10,
        );

        doc.setTextColor(...muted);
        doc.setFontSize(5.3);
        doc.text("PROJETO", leftX, y + 15);
        doc.text("RESPONSÁVEL TÉCNICO", rightX, y + 15);

        doc.setTextColor(...slate);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.3);
        doc.text(
          doc.splitTextToSize(process.title || "Não informado", 82).slice(0, 1),
          leftX,
          y + 19.5,
        );
        doc.text(
          doc.splitTextToSize(process.technicalLead || "Não informado", 82).slice(0, 1),
          rightX,
          y + 19.5,
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
        doc.setFillColor(226, 232, 240);
        doc.setTextColor(...slate);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.7);
        doc.roundedRect(margin, y, contentW, 6.5, 1.5, 1.5, "F");
        doc.text(title.toUpperCase(), margin + 3, y + 4.4);
        y += 6.5;

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
        doc.setFillColor(...navy);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.2);
        headers.forEach(([label, width]) => {
          doc.rect(x, y, width, 5.5, "F");
          doc.text(label, x + width / 2, y + 3.7, { align: "center" });
          x += width;
        });

        return y + 5.5;
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
          compact ? 4.9 : 5.4,
        );
        const obs = fitLines(
          itemState.observation || "",
          widths.obs - 3.2,
          compact ? 1 : 2,
          compact ? 4.8 : 5.2,
        );
        const lineCount = Math.max(desc.lines.length, obs.lines.length, 1);
        const rowH = compact ? 5.6 : Math.max(5.8, 2.65 * lineCount + 2.3);

        let x = margin;
        doc.setDrawColor(...line);
        doc.setLineWidth(0.18);
        doc.setFillColor(255, 255, 255);
        doc.setTextColor(...slate);
        doc.setFont("helvetica", "normal");

        doc.rect(x, y, widths.item, rowH, "FD");
        doc.setFontSize(5.2);
        doc.text(String(item.order), x + widths.item / 2, y + rowH / 2 + 1.6, {
          align: "center",
        });
        x += widths.item;

        doc.rect(x, y, widths.desc, rowH, "FD");
        doc.setFontSize(desc.fontSize);
        doc.text(desc.lines, x + 1.6, y + 3.5);
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
          doc.rect(x, y, width, rowH, "FD");

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
              x + width / 2 - 2.2,
              y + rowH / 2 - 2.2,
              4.4,
              4.4,
              1.1,
              1.1,
              "F",
            );
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(5.5);
            doc.text("X", x + width / 2, y + rowH / 2 + 1.6, { align: "center" });
            doc.setTextColor(...slate);
            doc.setFont("helvetica", "normal");
          }
          x += width;
        }

        doc.rect(x, y, widths.obs, rowH, "FD");
        doc.setFontSize(obs.fontSize);
        doc.text(obs.lines, x + 1.6, y + 3.5);

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
          doc.text("ASSINATURA PENDENTE", x + 13, y + 5.7);

          doc.setTextColor(...slate);
          doc.setFontSize(6.2);
          doc.text(label.toUpperCase(), x + 13, y + 9.7);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(...muted);
          doc.setFontSize(5.4);
          const pendingMessage = signature
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
      drawProcessSummary(41);
      let y = drawSectionRows("Engenharia - Itens 1 a 20", ENGINEERING_ITEMS.slice(0, 20), 68);

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
      doc.setFillColor(...light);
      doc.setDrawColor(...line);
      doc.roundedRect(margin, 37, contentW, 10, 2, 2, "FD");
      doc.setTextColor(...slate);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.text(formatOfficialProcessNumber(process.protocol), margin + 4, 43);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...muted);
      doc.text(
        doc.splitTextToSize(process.title || "Projeto", 92).slice(0, 1),
        margin + 50,
        43,
      );

      y = drawSectionRows(
        "Engenharia - Itens 21 a 31",
        ENGINEERING_ITEMS.slice(20),
        51,
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
        ["DE ACORDO", counts.a, emerald],
        ["APRESENTAR", counts.ap, blue],
        ["CORRIGIR", counts.c, amber],
        ["N/A", counts.na, [71, 85, 105] as const],
      ] as const;

      metrics.forEach(([label, value, color], index) => {
        const x = margin + 4 + index * 31;
        doc.setFillColor(...color);
        doc.roundedRect(x, resultY + 8, 28, 8, 2, 2, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4.5);
        doc.text(label, x + 3, resultY + 11.2);
        doc.setFontSize(7.2);
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
      drawSignatureCard(
        margin,
        signatureY,
        92,
        "Análise técnica",
        state.technicalSignature,
        technicalOfficial,
      );
      drawSignatureCard(
        margin + 98,
        signatureY,
        92,
        "Conferência fiscal",
        state.fiscalSignature,
        fiscalOfficial,
      );

      if (!isFullySigned) {
        doc.setFillColor(255, 247, 237);
        doc.setDrawColor(253, 186, 116);
        doc.roundedRect(margin, 273, contentW, 8, 2, 2, "FD");
        doc.setTextColor(...amber);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.text(
          technicalOfficial
            ? "RASCUNHO - aguardando conferência fiscal para emissão final."
            : "RASCUNHO - assinatura técnica eletrônica ainda pendente.",
          pageW / 2,
          278,
          { align: "center" },
        );
      }

      drawFooter(2);

      const fileName = `analise-${normalizeFilePart(process.protocol)}.pdf`;
      doc.save(fileName);
      setNotice(
        isFullySigned
          ? "PDF premium final gerado em 2 páginas com assinaturas eletrônicas."
          : "PDF premium de rascunho gerado em 2 páginas. As assinaturas oficiais aparecem individualmente quando concluídas.",
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
                A ficha municipal foi transformada em uma mesa digital de conferência: análise técnica, observações por item, encaminhamento, assinatura técnica, conferência fiscal e PDF oficial.
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
              {municipalityLogoUrl ? (
                <img src={municipalityLogoUrl} alt="" className="h-full w-full object-contain p-2" />
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
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{formatOfficialProcessNumber(process.protocol)}</p>
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
            <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{formatOfficialProcessNumber(process.protocol)}</p>
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
              <p className="mt-1 text-base font-bold text-slate-950 dark:text-white">Assinatura técnica + conferência fiscal</p>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                O analista conclui a avaliação técnica. Em seguida, o Fiscal de Obras confere a ficha e registra a segunda assinatura. Qualquer alteração posterior invalida as assinaturas e reabre a conferência.
              </p>
            </div>
            <div className={cn(
              "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em]",
              isFullySigned
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-200"
                : state.technicalSignature
                  ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/35 dark:text-sky-200"
                  : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
            )}>
              {isFullySigned ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Signature className="h-3.5 w-3.5" />}
              {isFullySigned ? "Ficha concluída" : state.technicalSignature ? "Aguardando Fiscal" : "Em elaboração"}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className={cn(
              "rounded-[20px] border p-4",
              state.technicalSignature
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40",
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  state.technicalSignature
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  {state.technicalSignature ? <CheckCircle2 className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
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
              state.fiscalSignature
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                : state.technicalSignature
                  ? "border-violet-200 bg-violet-50/70 dark:border-violet-500/30 dark:bg-violet-950/25"
                  : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40",
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  state.fiscalSignature
                    ? "bg-emerald-600 text-white"
                    : state.technicalSignature
                      ? "bg-violet-600 text-white"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  {state.fiscalSignature ? <CheckCircle2 className="h-5 w-5" /> : <Signature className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">2ª assinatura</p>
                  <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">Conferência do Fiscal de Obras</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {state.fiscalSignature
                      ? `${state.fiscalSignature.name} · ${state.fiscalSignature.title} · ${new Date(state.fiscalSignature.signedAt).toLocaleString("pt-BR")}`
                      : technicalOfficial
                        ? "Aguardando conferência e assinatura fiscal."
                        : "Disponível depois da assinatura técnica eletrônica."}
                    {state.fiscalSignature && !fiscalOfficial ? (
                      <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-300">
                        Registro anterior ainda não confirmado eletronicamente com senha.
                      </span>
                    ) : null}
                    {fiscalOfficial && state.fiscalSignature?.verificationCode ? (
                      <span className="mt-1 block font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Código: {state.fiscalSignature.verificationCode}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              {canSignFiscal ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full rounded-xl border-violet-300 bg-violet-50 font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200"
                  disabled={!technicalOfficial || fiscalOfficial}
                  onClick={signFiscalReview}
                >
                  <Signature className="mr-2 h-4 w-4" />
                  {fiscalOfficial
                    ? "Assinatura eletrônica concluída"
                    : state.fiscalSignature
                      ? "Confirmar assinatura com senha"
                      : "Assinar conferência fiscal"}
                </Button>
              ) : null}
            </div>
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
                onClick={generatePdf}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {isFullySigned ? "Gerar PDF final" : "Gerar PDF rascunho"}
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
                    : "Assinatura da conferência fiscal"}
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
