import { useMemo, useState } from "react";
import { Clock3, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  canSuperviseProcessAnalysis,
  hasActiveAnalysisSupervisorIntervention,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

type AnalysisSupervisorControlProps = {
  process: ProcessRecord;
  session: SessionUser;
  users: SessionUser[];
  busy?: boolean;
  status?: string;
  onBeginIntervention: (reason: string) => Promise<void>;
  onEndIntervention: () => Promise<void>;
  onReassign: (profileId: string, reason: string) => Promise<void>;
};

export function AnalysisSupervisorControl({
  process,
  session,
  users,
  busy = false,
  status = "",
  onBeginIntervention,
  onEndIntervention,
  onReassign,
}: AnalysisSupervisorControlProps) {
  const [interventionReason, setInterventionReason] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [targetProfileId, setTargetProfileId] = useState("");

  const canSupervise = canSuperviseProcessAnalysis(session, process);
  const interventionActive = hasActiveAnalysisSupervisorIntervention(session, process);
  const analysts = useMemo(
    () =>
      users
        .filter(
          (user) =>
            user.role === "analista" &&
            user.accountStatus === "active" &&
            (user.municipalityId || user.tenantId) ===
              (process.municipalityId || process.tenantId),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [process.municipalityId, process.tenantId, users],
  );

  if (!canSupervise) return null;

  const expiresAt = process.analysis?.supervisorOverrideExpiresAt
    ? new Date(process.analysis.supervisorOverrideExpiresAt)
    : null;
  const expiresLabel =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? expiresAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "";

  return (
    <section
      data-analysis-supervisor-control="true"
      className={
        interventionActive
          ? "rounded-[22px] border border-amber-300 bg-amber-50/80 p-5 shadow-[0_12px_30px_rgba(180,83,9,0.08)]"
          : "rounded-[22px] border border-sky-200 bg-sky-50/70 p-5 shadow-[0_12px_30px_rgba(7,89,133,0.06)]"
      }
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-800" />
            <p className="text-sm font-extrabold text-slate-950">Controle da Diretoria</p>
            <Badge
              variant="outline"
              className={
                interventionActive
                  ? "border-amber-300 bg-amber-100 text-amber-900"
                  : "border-sky-300 bg-white text-sky-800"
              }
            >
              {interventionActive ? "Intervenção auditada ativa" : "Modo acompanhamento"}
            </Badge>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
            Responsável técnico: <strong>{process.analysis?.assignedTo || "Ainda não atribuído"}</strong>.
            Somente o Analista atualmente responsável e a Diretoria podem modificar a análise.
            Ao redistribuir, o Analista anterior perde a edição imediatamente e o novo responsável assume a titularidade técnica.
          </p>
          {interventionActive ? (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-amber-900">
              <Clock3 className="h-4 w-4" />
              {expiresLabel
                ? `Permissão excepcional válida até ${expiresLabel}. Todas as alterações ficam registradas no histórico.`
                : "Permissão excepcional ativa. Todas as alterações ficam registradas no histórico."}
            </p>
          ) : null}
        </div>

        {interventionActive ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="shrink-0 rounded-full border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => void onEndIntervention()}
          >
            Encerrar intervenção
          </Button>
        ) : null}
      </div>

      {!interventionActive ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-sky-800" />
              <p className="text-sm font-bold text-slate-950">Intervir sem trocar o analista</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Use somente quando a Diretoria realmente precisar corrigir ou concluir uma ação. A intervenção dura 30 minutos e exige justificativa.
            </p>
            <Input
              value={interventionReason}
              onChange={(event) => setInterventionReason(event.target.value)}
              placeholder="Motivo da intervenção (mínimo 8 caracteres)"
              className="mt-3 h-10 rounded-xl"
            />
            <Button
              type="button"
              disabled={busy || interventionReason.trim().length < 8}
              className="mt-3 w-full rounded-xl bg-[#082f49] !text-white hover:bg-[#0b4568]"
              onClick={() => void onBeginIntervention(interventionReason.trim())}
            >
              {busy ? "Processando..." : "Iniciar intervenção por 30 min"}
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-slate-700" />
              <p className="text-sm font-bold text-slate-950">Redistribuir responsabilidade</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Para troca definitiva de responsável, selecione outro Analista. O histórico mantém quem era o responsável anterior e o motivo da troca.
            </p>
            <Select value={targetProfileId} onValueChange={setTargetProfileId}>
              <SelectTrigger className="mt-3 h-10 rounded-xl">
                <SelectValue placeholder="Selecionar analista" />
              </SelectTrigger>
              <SelectContent>
                {analysts.map((analyst) => (
                  <SelectItem key={analyst.id} value={analyst.id}>
                    {analyst.name}{analyst.department ? ` — ${analyst.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={reassignReason}
              onChange={(event) => setReassignReason(event.target.value)}
              placeholder="Motivo da redistribuição (mínimo 8 caracteres)"
              className="mt-3 h-10 rounded-xl"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || !targetProfileId || reassignReason.trim().length < 8}
              className="mt-3 w-full rounded-xl"
              onClick={() => void onReassign(targetProfileId, reassignReason.trim())}
            >
              {busy ? "Processando..." : "Redistribuir análise"}
            </Button>
          </div>
        </div>
      ) : null}

      {status ? (
        <div
          role="status"
          aria-live="polite"
          className={
            status.startsWith("Não foi possível")
              ? "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
              : "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          }
        >
          {status}
        </div>
      ) : null}
    </section>
  );
}
