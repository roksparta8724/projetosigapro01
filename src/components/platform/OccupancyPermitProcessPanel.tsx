import type { ReactNode } from "react";
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Landmark,
  Printer,
  ReceiptText,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HabiteSeInspectionPanel } from "@/components/platform/HabiteSeInspectionPanel";
import { HabiteSePermitPanel } from "@/components/platform/HabiteSePermitPanel";
import {
  type ProcessRecord,
  type SessionUser,
  formatCurrency,
  formatOfficialProcessNumber,
} from "@/lib/platform";

function extractNoteValue(notes: string | undefined, label: string) {
  const prefix = label.toLocaleLowerCase("pt-BR") + ":";
  const part = String(notes || "")
    .split("|")
    .map((item) => item.trim())
    .find((item) => item.toLocaleLowerCase("pt-BR").startsWith(prefix));
  if (!part) return "";
  return part.slice(part.indexOf(":") + 1).trim();
}

export function OccupancyPermitProcessPanel({
  process,
  externalView = false,
  session,
  dataReady = true,
  municipalityName,
  municipalityLogoUrl,
  municipalityAddress,
  municipalityPhone,
  municipalityEmail,
  secretariat,
  directorate,
  onProcessRefresh,
  onViewHabiteSeGuide,
  onPrintHabiteSeGuide,
}: {
  process: ProcessRecord;
  externalView?: boolean;
  session: SessionUser;
  dataReady?: boolean;
  municipalityName?: string | null;
  municipalityLogoUrl?: string | null;
  municipalityAddress?: string | null;
  municipalityPhone?: string | null;
  municipalityEmail?: string | null;
  secretariat?: string | null;
  directorate?: string | null;
  onProcessRefresh?: () => Promise<void> | void;
  onViewHabiteSeGuide?: () => void;
  onPrintHabiteSeGuide?: () => void;
}) {
  const required = process.documents.filter((item) => item.required);
  const uploaded = required.filter((item) => item.uploaded);
  const approved = required.filter(
    (item) => item.uploaded && item.reviewStatus === "aprovado",
  );
  const openRequirements = process.requirements.filter(
    (item) => item.status === "aberta" || item.status === "respondida",
  );
  const protocolGuide = process.payment.guides?.find(
    (guide) => guide.kind === "protocolo",
  );
  const habiteSeGuide = process.payment.guides?.find(
    (guide) => guide.kind === "habite_se",
  );
  const habiteSePaid = habiteSeGuide?.status === "compensada";
  const protocolPaid =
    protocolGuide?.status === "compensada" ||
    process.payment.status === "compensada";
  const documentsComplete =
    required.length > 0 && uploaded.length === required.length;
  const analysisComplete =
    documentsComplete &&
    approved.length === required.length &&
    openRequirements.length === 0;

  const sourceProcess = extractNoteValue(
    process.notes,
    "Processo de aprovação de origem",
  );
  const sourcePermit = extractNoteValue(process.notes, "Alvará de origem");
  const completionDate = extractNoteValue(
    process.notes,
    "Conclusão informada",
  );
  const modality =
    extractNoteValue(process.notes, "Modalidade") ||
    (process.type.toLocaleLowerCase("pt-BR").includes("parcial")
      ? "Habite-se parcial"
      : "Habite-se integral");

  const normalizedFolder = String(
    process.processControl?.currentFolder || process.sla.currentStage || "",
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  const finalStatus = ["deferido", "indeferido", "arquivado"].includes(
    process.status,
  );
  const inspectionStage =
    /fiscal|vistoria|inspec|conferencia/.test(normalizedFolder) ||
    process.tags.some((tag) => /vistoria|fiscal/i.test(tag));
  const analysisStage =
    /analise|urban|obra|engenharia/.test(normalizedFolder) ||
    Boolean(process.analysis?.startedAt || process.analysis?.assignedTo);
  const financeStage =
    /financ|tesour|arrecad/.test(normalizedFolder) ||
    Boolean(habiteSeGuide) ||
    process.dispatches.some(
      (dispatch) =>
        /guia.*habite|habite.*guia/i.test(dispatch.subject) &&
        ["aguardando", "respondido", "concluido"].includes(dispatch.status),
    );
  const permitStage =
    habiteSePaid ||
    /alvara.*habite|emissao.*habite|elaboracao.*habite/.test(normalizedFolder);
  const directorStage =
    /diretoria|assinatura.*diretor/.test(normalizedFolder) || finalStatus;

  const stages = [
    {
      label: "Novo protocolo",
      detail: formatOfficialProcessNumber(process.protocol),
      done: true,
      current: !protocolPaid,
    },
    {
      label: "Triagem e pagamento inicial",
      detail: protocolPaid
        ? "Pagamento inicial compensado"
        : "Aguardando conferência/compensação",
      done: protocolPaid,
      current: protocolPaid && !analysisStage && !analysisComplete,
    },
    {
      label: "Análise documental",
      detail:
        String(approved.length) +
        "/" +
        String(required.length) +
        " obrigatório(s) aprovado(s)",
      done: analysisComplete,
      current: analysisStage && !analysisComplete,
    },
    {
      label: "Vistoria / conferência",
      detail: inspectionStage
        ? "Etapa registrada no fluxo atual"
        : financeStage
          ? "Vistoria concluída e encaminhada"
          : "Etapa prevista após a análise, conforme procedimento municipal",
      done: financeStage || permitStage,
      current: inspectionStage && !financeStage,
    },
    {
      label: "Financeiro",
      detail: habiteSeGuide
        ? habiteSeGuide.status === "compensada"
          ? `Guia ${habiteSeGuide.code} compensada`
          : `Guia ${habiteSeGuide.code} aguardando pagamento`
        : financeStage
          ? "Aguardando emissão da Guia de Habite-se"
          : "Etapa posterior à vistoria / conferência",
      done: habiteSePaid || finalStatus,
      current: financeStage && !habiteSePaid && !finalStatus,
    },
    {
      label: "Alvará de Habite-se",
      detail: finalStatus
        ? "Alvará emitido"
        : habiteSePaid
          ? "Pagamento confirmado — Analista elabora e assina"
          : "Aguardando pagamento",
      done: directorStage || finalStatus,
      current: permitStage && !directorStage && !finalStatus,
    },
    {
      label: "Assinatura da Diretoria",
      detail: finalStatus
        ? "Assinatura final concluída"
        : directorStage
          ? "Aguardando assinatura final"
          : "Após assinatura do Analista",
      done: finalStatus,
      current: directorStage && !finalStatus,
    },
    {
      label: "Concluído",
      detail: finalStatus
        ? "Alvará de Habite-se emitido e processo finalizado"
        : "Finaliza após a assinatura da Diretoria",
      done: finalStatus,
      current: false,
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-[24px] border-sky-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-sky-500/30 dark:bg-slate-900">
        <CardHeader className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#eef7ff_55%,#f7fbff_100%)] dark:border-sky-500/20 dark:bg-[linear-gradient(135deg,#0f172a_0%,#10283c_100%)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                <CardTitle className="text-slate-950 dark:text-white">
                  Processo independente de Habite-se
                </CardTitle>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Este protocolo analisa a conclusão da obra. Ele não continua o
                processo de aprovação e não reutiliza a guia de aprovação/Alvará
                nem o ISSQN do processo anterior.
              </p>
            </div>
            <Badge
              variant="outline"
              className="w-fit rounded-full border-sky-300 bg-white px-3 py-1 font-semibold text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-200"
            >
              {modality}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoBox label="Processo de origem" value={sourceProcess || "Não informado"} />
            <InfoBox label="Alvará de origem" value={sourcePermit || "Não informado"} />
            <InfoBox
              label="Área concluída"
              value={
                Number(process.property.area || 0).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) + " m²"
              }
            />
            <InfoBox
              label="Conclusão informada"
              value={completionDate || "Não informada"}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StatusBox
              done={documentsComplete}
              icon={<FileCheck2 className="h-4 w-4" />}
              title="Documentação"
              detail={
                String(uploaded.length) +
                "/" +
                String(required.length) +
                " obrigatório(s) enviado(s)"
              }
            />
            <StatusBox
              done={analysisComplete}
              icon={<ClipboardCheck className="h-4 w-4" />}
              title="Análise"
              detail={
                String(approved.length) +
                "/" +
                String(required.length) +
                " aprovado(s) • " +
                String(openRequirements.length) +
                " exigência(s) aberta(s)"
              }
            />
            <StatusBox
              done={protocolPaid}
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Protocolo próprio"
              detail={
                protocolPaid
                  ? "Pagamento inicial deste protocolo compensado"
                  : "Cobrança inicial exclusiva deste novo protocolo"
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            <CardTitle className="text-slate-950 dark:text-white">
              Workflow do Habite-se
            </CardTitle>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Etapas deste protocolo, totalmente separadas da aprovação do projeto.
          </p>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            {stages.map((stage, index) => (
              <div
                key={stage.label}
                className={cn(
                  "rounded-2xl border p-4",
                  stage.done
                    ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                    : stage.current
                      ? "border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-950/30"
                      : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-current text-xs font-black">
                    {index + 1}
                  </span>
                  {stage.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-bold text-slate-950 dark:text-white">
                  {stage.label}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {stage.detail}
                </p>
              </div>
            ))}
          </div>

          {!externalView && inspectionStage && !financeStage ? (
            <div
              data-habite-se-inspection-gate="true"
              className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-500/30 dark:bg-sky-950/25"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950 dark:text-white">
                    Vistoria / conferência em andamento
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    A conclusão do Termo de Vistoria libera o encaminhamento formal do processo para a etapa financeira.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!externalView && habiteSeGuide ? (
        <Card
          data-habite-se-guide-analyst="true"
          className="overflow-hidden rounded-[24px] border-sky-200 bg-white shadow-sm dark:border-sky-500/30 dark:bg-slate-900"
        >
          <CardHeader className="border-b border-sky-100 bg-sky-50/70 dark:border-sky-500/20 dark:bg-sky-950/25">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                  <CardTitle className="text-slate-950 dark:text-white">
                    Guia de Habite-se vinculada ao processo
                  </CardTitle>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  O Analista mantém acesso à guia emitida pelo Financeiro para conferir valor, situação e documento durante todo o fluxo.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  habiteSePaid
                    ? "w-fit border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "w-fit border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
                }
              >
                {habiteSePaid ? "Pagamento confirmado" : "Aguardando pagamento"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoBox label="Guia" value={habiteSeGuide.code} />
              <InfoBox label="Valor" value={formatCurrency(habiteSeGuide.amount)} />
              <InfoBox label="Vencimento" value={habiteSeGuide.dueDate || "Não informado"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {onViewHabiteSeGuide ? (
                <Button type="button" variant="outline" className="rounded-full" onClick={onViewHabiteSeGuide}>
                  <Eye className="mr-2 h-4 w-4" />
                  Visualizar guia
                </Button>
              ) : null}
              {onPrintHabiteSeGuide ? (
                <Button type="button" variant="outline" className="rounded-full" onClick={onPrintHabiteSeGuide}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <HabiteSeInspectionPanel
        process={process}
        session={session}
        externalView={externalView}
        dataReady={dataReady}
        onProcessRefresh={onProcessRefresh}
      />

      <HabiteSePermitPanel
        process={process}
        session={session}
        externalView={externalView}
        municipalityName={municipalityName}
        municipalityLogoUrl={municipalityLogoUrl}
        municipalityAddress={municipalityAddress}
        municipalityPhone={municipalityPhone}
        municipalityEmail={municipalityEmail}
        secretariat={secretariat}
        directorate={directorate}
        onProcessRefresh={onProcessRefresh}
      />

      <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-slate-500">
              <Landmark className="h-4 w-4" />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]">
                Imóvel
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
              {process.address || "Endereço não informado"}
            </p>
          </div>
          <InfoText label="Proprietário" value={process.ownerName || "Não informado"} />
          <InfoText
            label="Responsável técnico"
            value={process.technicalLead || "Não informado"}
          />
        </CardContent>
      </Card>

      {!externalView ? (
        <div
          data-habite-se-governance-note="true"
          className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/70 px-5 py-4 text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">
                Integridade processual
              </p>
              <p className="mt-1 max-w-4xl text-xs leading-5">
                As movimentações deste Habite-se são registradas por etapa, responsável e data, preservando a rastreabilidade administrativa do processo.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function InfoText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusBox({
  done,
  icon,
  title,
  detail,
}: {
  done: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-5">{detail}</p>
    </div>
  );
}
