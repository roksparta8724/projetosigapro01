import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileText,
  PenLine,
  Route,
  Save,
  Signature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatOfficialProcessNumber,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

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
};

const STATUS_META: Record<Exclude<ChecklistStatus, "">, { label: string; short: string; classes: string }> = {
  A: {
    label: "De acordo",
    short: "A",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/45 dark:text-emerald-200",
  },
  AP: {
    label: "Apresentar",
    short: "AP",
    classes: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/50 dark:bg-sky-950/45 dark:text-sky-200",
  },
  C: {
    label: "Corrigir",
    short: "C",
    classes: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/45 dark:text-amber-200",
  },
  NA: {
    label: "Não se aplica",
    short: "N/A",
    classes: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
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
}: UrbanAnalysisChecklistPanelProps) {
  const key = storageKey(municipalityId, process.id);
  const [state, setState] = useState<AnalysisChecklistState>(() => makeInitialState(process, session));
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(key) ||
        window.localStorage.getItem(legacyStorageKey(process.id, session.id));
      if (!raw) {
        setState(makeInitialState(process, session));
        return;
      }
      const parsed = JSON.parse(raw) as Partial<AnalysisChecklistState>;
      setState({
        ...makeInitialState(process, session),
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
      });
    } catch {
      setState(makeInitialState(process, session));
    }
  }, [key, process.id, session.id, session.name, session.title]);

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
    ["master_admin", "master_ops", "prefeitura_supervisor", "analista"].includes(session.role);
  const canSignFiscal =
    ["master_admin", "master_ops", "prefeitura_supervisor", "fiscal"].includes(session.role);
  const isFullySigned = Boolean(state.technicalSignature && state.fiscalSignature);

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

  const signTechnicalEvaluation = () => {
    if (!canSignTechnical) {
      setNotice("Este perfil não possui atribuição para assinar a análise técnica.");
      return;
    }
    if (counts.evaluated === 0) {
      setNotice("Avalie pelo menos um item antes de assinar.");
      return;
    }

    const now = new Date().toISOString();
    const signature: ChecklistSignature = {
      userId: session.id,
      name: session.name,
      title: session.title || "Analista Técnico",
      signedAt: now,
    };
    const next = {
      ...state,
      analystId: session.id,
      analystName: session.name,
      analystTitle: session.title || "Analista Técnico",
      technicalSignature: signature,
      fiscalSignature: null,
      signedBy: session.name,
      signedAt: now,
      savedAt: now,
    };
    persistState(next);
    setNotice("Análise técnica assinada. A ficha agora pode seguir para conferência e assinatura fiscal.");
  };

  const signFiscalReview = () => {
    if (!canSignFiscal) {
      setNotice("Este perfil não possui atribuição para assinar a conferência fiscal.");
      return;
    }
    if (!state.technicalSignature) {
      setNotice("A assinatura técnica precisa ser registrada antes da conferência fiscal.");
      return;
    }

    const now = new Date().toISOString();
    const signature: ChecklistSignature = {
      userId: session.id,
      name: session.name,
      title: session.title || "Fiscal de Obras",
      signedAt: now,
    };
    const next = {
      ...state,
      fiscalSignature: signature,
      savedAt: now,
    };
    persistState(next);
    setNotice("Conferência fiscal assinada. A ficha técnica está concluída e pronta para gerar o PDF final.");
  };

  const generatePdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 12;
    const contentW = pageW - margin * 2;

    const drawHeader = (pageNumber: number) => {
      doc.setFillColor(8, 47, 73);
      doc.roundedRect(margin, 10, contentW, 32, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.text((municipalityName || "Prefeitura Municipal").toUpperCase(), margin + 6, 17);
      doc.setFontSize(8.4);
      doc.setFont("helvetica", "normal");
      doc.text((secretariat || "Secretaria responsável").toUpperCase(), margin + 6, 22);
      doc.text((directorate || departmentLabel || "Diretoria de Urbanismo").toUpperCase(), margin + 6, 27);
      doc.setFont("helvetica", "bold");
      doc.text("FICHA OFICIAL DE ANÁLISE DE PROCESSO", margin + 6, 33);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const contact = [municipalityPhone, municipalityEmail, municipalityAddress].filter(Boolean).join(" • ");
      if (contact) doc.text(contact.slice(0, 105), margin + 6, 38);
      doc.text(`Folha ${state.sheetNumber || "1"} · Página ${pageNumber}`, pageW - margin - 6, 38, { align: "right" });

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(formatOfficialProcessNumber(process.protocol), margin, 49);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Projeto: ${process.title}`, margin, 54);
      doc.text(`Proprietário: ${process.ownerName}`, margin, 59);
      doc.text(`Responsável técnico: ${process.technicalLead || "Não informado"}`, margin, 64);
      doc.text(`Imóvel: ${process.address || "Não informado"}`, margin, 69);

      doc.setDrawColor(203, 213, 225);
      doc.line(margin, 73, pageW - margin, 73);
    };

    let pageNumber = 1;
    drawHeader(pageNumber);
    let y = 79;

    const statusWidths = { item: 9, desc: 82, a: 10, ap: 10, c: 10, na: 12 };
    const obsW = contentW - statusWidths.item - statusWidths.desc - statusWidths.a - statusWidths.ap - statusWidths.c - statusWidths.na;

    const drawTableHeader = (sectionTitle: string) => {
      doc.setFillColor(226, 232, 240);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.rect(margin, y, contentW, 8, "F");
      doc.text(sectionTitle.toUpperCase(), margin + 2, y + 5.2);
      y += 8;

      const headers = [
        ["Item", statusWidths.item],
        ["Documentação", statusWidths.desc],
        ["A", statusWidths.a],
        ["AP", statusWidths.ap],
        ["C", statusWidths.c],
        ["N/A", statusWidths.na],
        ["Observações", obsW],
      ] as const;
      let x = margin;
      doc.setFillColor(248, 250, 252);
      doc.setFontSize(6.5);
      headers.forEach(([label, width]) => {
        doc.rect(x, y, width, 7, "FD");
        doc.text(label, x + width / 2, y + 4.7, { align: "center" });
        x += width;
      });
      y += 7;
    };

    const ensureRoom = (height: number, sectionTitle?: string) => {
      if (y + height <= pageH - 24) return;
      doc.addPage();
      pageNumber += 1;
      drawHeader(pageNumber);
      y = 79;
      if (sectionTitle) drawTableHeader(sectionTitle);
    };

    const drawSection = (title: string, items: ChecklistTemplateItem[]) => {
      ensureRoom(18);
      drawTableHeader(title);
      for (const item of items) {
        const itemState = state.items[item.id] ?? { status: "", observation: "" };
        const descLines = doc.splitTextToSize(item.label, statusWidths.desc - 4) as string[];
        const obsLines = doc.splitTextToSize(itemState.observation || "", obsW - 4) as string[];
        const rowH = Math.max(8, (Math.max(descLines.length, obsLines.length) * 3.8) + 3);
        ensureRoom(rowH, title);

        let x = margin;
        doc.setDrawColor(203, 213, 225);
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.6);

        doc.rect(x, y, statusWidths.item, rowH);
        doc.text(String(item.order), x + statusWidths.item / 2, y + 5, { align: "center" });
        x += statusWidths.item;

        doc.rect(x, y, statusWidths.desc, rowH);
        doc.text(descLines, x + 2, y + 4.3);
        x += statusWidths.desc;

        for (const status of ["A", "AP", "C", "NA"] as const) {
          const width = status === "A" ? statusWidths.a : status === "AP" ? statusWidths.ap : status === "C" ? statusWidths.c : statusWidths.na;
          doc.rect(x, y, width, rowH);
          if (itemState.status === status) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("X", x + width / 2, y + 5.1, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.6);
          }
          x += width;
        }

        doc.rect(x, y, obsW, rowH);
        if (obsLines.length > 0) doc.text(obsLines, x + 2, y + 4.3);
        y += rowH;
      }
      y += 5;
    };

    drawSection("Engenharia", ENGINEERING_ITEMS);
    drawSection("Aprovações externas", EXTERNAL_ITEMS);

    ensureRoom(68);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentW, 60, 2, 2, "FD");
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("RESULTADO DA ANÁLISE", margin + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`A = De acordo: ${counts.a}`, margin + 4, y + 12);
    doc.text(`AP = Apresentar: ${counts.ap}`, margin + 42, y + 12);
    doc.text(`C = Corrigir: ${counts.c}`, margin + 84, y + 12);
    doc.text(`N/A: ${counts.na}`, margin + 122, y + 12);

    const conclusionLines = doc.splitTextToSize(state.conclusion || "Sem conclusão complementar.", contentW - 8) as string[];
    doc.text("Conclusão / observações gerais:", margin + 4, y + 19);
    doc.text(conclusionLines.slice(0, 4), margin + 4, y + 24);

    const routingLabel =
      state.routing === "expediente"
        ? "Expediente"
        : state.routing === "topografia"
          ? "Topografia"
          : state.routing === "outro"
            ? state.routingOther || "Outro"
            : "Não definido";
    doc.text(`Encaminhar: ${routingLabel}`, margin + 4, y + 39);
    doc.text(`Folhas do Comunique-se: ${state.communiquePages || "Não informado"}`, margin + 80, y + 39);

    doc.setDrawColor(203, 213, 225);
    doc.line(margin + 4, y + 44, pageW - margin - 4, y + 44);

    doc.setFont("helvetica", "bold");
    doc.text("ANÁLISE TÉCNICA", margin + 4, y + 49);
    doc.text("CONFERÊNCIA FISCAL", margin + 98, y + 49);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(
      state.technicalSignature
        ? `${state.technicalSignature.name} · ${state.technicalSignature.title}`
        : "Pendente de assinatura técnica",
      margin + 4,
      y + 54,
    );
    doc.text(
      state.fiscalSignature
        ? `${state.fiscalSignature.name} · ${state.fiscalSignature.title}`
        : "Pendente de assinatura fiscal",
      margin + 98,
      y + 54,
    );
    doc.text(
      state.technicalSignature
        ? new Date(state.technicalSignature.signedAt).toLocaleString("pt-BR")
        : "",
      margin + 4,
      y + 58,
    );
    doc.text(
      state.fiscalSignature
        ? new Date(state.fiscalSignature.signedAt).toLocaleString("pt-BR")
        : "",
      margin + 98,
      y + 58,
    );

    if (!isFullySigned) {
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.text("RASCUNHO", pageW / 2, pageH - 12, { align: "center" });
    }

    const fileName = `analise-${normalizeFilePart(process.protocol)}.pdf`;
    doc.save(fileName);
    setNotice(isFullySigned ? "PDF final assinado gerado." : "PDF de rascunho gerado.");
  };

  const renderSection = (title: string, subtitle: string, items: ChecklistTemplateItem[]) => (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_16px_38px_rgba(0,0,0,0.20)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
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
            <div key={item.id} className="grid gap-3 px-4 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/35 xl:grid-cols-[minmax(0,1.45fr)_auto_minmax(280px,0.9fr)] xl:items-center">
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
                      onClick={() => updateItem(item.id, { status: selected ? "" : status })}
                      className={cn(
                        "inline-flex h-8 items-center justify-center rounded-xl border px-2.5 text-[10px] font-bold transition",
                        selected
                          ? STATUS_META[status].classes
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800",
                      )}
                      title={STATUS_META[status].label}
                    >
                      {STATUS_META[status].short}
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
    <Card className="overflow-hidden rounded-[28px] border-slate-200 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <CardHeader className="border-b border-white/10 bg-[linear-gradient(135deg,#071525_0%,#0d3b5e_54%,#0f628f_100%)] px-5 py-5 text-white md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-inner">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] !text-sky-100">Guia técnica do analista</p>
              <CardTitle className="mt-1 text-xl font-bold !text-white">Avaliação Urbanística do Processo</CardTitle>
              <p className="mt-1 max-w-3xl text-sm leading-6 !text-slate-200">
                Checklist digital inspirado na ficha oficial de análise: cada analista registra A, AP, C ou N/A, inclui observações, assina e gera o relatório em PDF.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[430px]">
            <div className="rounded-2xl border border-white/15 bg-white/[0.10] px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-sky-100">Avaliados</p>
              <p className="mt-1 text-xl font-bold !text-white">{counts.evaluated}/{counts.total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.12] px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-emerald-100">De acordo</p>
              <p className="mt-1 text-xl font-bold !text-emerald-50">{counts.a}</p>
            </div>
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.12] px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-amber-100">Pendências</p>
              <p className="mt-1 text-xl font-bold !text-amber-50">{pendingCorrectionCount}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/[0.10] px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-sky-100">Progresso</p>
              <p className="mt-1 text-xl font-bold !text-white">{progress}%</p>
            </div>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_100%)] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 bg-[linear-gradient(180deg,#fbfdff_0%,#f5f8fc_100%)] p-5 dark:bg-[linear-gradient(180deg,#0f172a_0%,#0b1320_100%)] md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Processo</p>
            <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{formatOfficialProcessNumber(process.protocol)}</p>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{process.title}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Analista</p>
            <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{session.name}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{session.title || "Analista"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Data da análise</p>
            <Input
              type="date"
              value={state.analysisDate}
              onChange={(event) => setState((current) => invalidateSignature({ ...current, analysisDate: event.target.value }))}
              className="mt-2 h-9 rounded-xl border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Folha / revisão</p>
            <Input
              value={state.sheetNumber}
              onChange={(event) => setState((current) => invalidateSignature({ ...current, sheetNumber: event.target.value }))}
              placeholder="1"
              className="mt-2 h-9 rounded-xl border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="font-bold text-slate-700 dark:text-slate-200">Legenda:</span>
          {(Object.keys(STATUS_META) as Array<Exclude<ChecklistStatus, "">>).map((status) => (
            <span key={status} className={cn("rounded-full border px-2.5 py-1 font-semibold", STATUS_META[status].classes)}>
              {STATUS_META[status].short} = {STATUS_META[status].label}
            </span>
          ))}
        </div>

        {renderSection("Engenharia", "Conferência documental e técnica do projeto.", ENGINEERING_ITEMS)}
        {renderSection("Aprovações externas", "Órgãos e documentos complementares exigidos conforme o caso.", EXTERNAL_ITEMS)}

        <section className="grid gap-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
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

        <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                state.signedAt ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
              )}>
                {state.signedAt ? <CheckCircle2 className="h-5 w-5" /> : <Signature className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950 dark:text-white">
                  {state.signedAt ? "Avaliação assinada eletronicamente" : "Assinatura do responsável pela análise"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {state.signedAt
                    ? `${state.signedBy} · ${new Date(state.signedAt).toLocaleString("pt-BR")}. Qualquer alteração invalida a assinatura.`
                    : "A assinatura usa o usuário autenticado e a data/hora da sessão. Depois você pode gerar o PDF final."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={saveDraft}>
                <Save className="mr-2 h-4 w-4" />
                Salvar rascunho
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                onClick={signEvaluation}
              >
                <PenLine className="mr-2 h-4 w-4" />
                {state.signedAt ? "Assinar novamente" : "Assinar avaliação"}
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[linear-gradient(135deg,#082f49_0%,#075985_48%,#0f78b8_100%)] px-5 font-bold !text-white shadow-[0_10px_24px_rgba(7,89,133,0.24)] hover:brightness-110 [&_*]:!text-white"
                onClick={generatePdf}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Gerar PDF
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
      </CardContent>
    </Card>
  );
}
