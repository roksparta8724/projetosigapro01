import type { ReactNode } from "react";
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Landmark,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type ProcessRecord, formatOfficialProcessNumber } from "@/lib/platform";

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
}: {
  process: ProcessRecord;
  externalView?: boolean;
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
        : "Etapa prevista após a análise, conforme procedimento municipal",
      done: inspectionStage && finalStatus,
      current: inspectionStage && !finalStatus,
    },
    {
      label: "Decisão e emissão",
      detail: finalStatus
        ? "Decisão final registrada"
        : "Aguardando etapas anteriores",
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
          <div className="grid gap-3 xl:grid-cols-5">
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

          {!externalView ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100">
              A vistoria e a decisão só aparecem como concluídas quando houver
              registro real no processo. O sistema não avança essas etapas
              artificialmente.
            </div>
          ) : null}
        </CardContent>
      </Card>

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
