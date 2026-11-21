import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, FileCheck2, Tag, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Flag as PersonalMarkerIcon } from "@/components/platform/PremiumIcons";
import { buildProcessPath, formatOfficialProcessNumber, type ProcessRecord, type SessionUser } from "@/lib/platform";
import type { ProcessMarkerOption, ProcessWorkspaceAction } from "@/components/platform/ProcessWorkspaceHeader";

export type ProcessBatchPayload = {
  priority?: "normal" | "alta" | "critica";
  analystProfileId?: string;
  reason?: string;
  destination?: string;
  subject?: string;
  dueDate?: string;
  dispatchPriority?: "baixa" | "media" | "alta" | "critica";
  marker?: ProcessMarkerOption;
  markerOperation?: "apply" | "remove";
};

export type ProcessDispatchDepartment = { id: string; name: string; isActive: boolean };

type Props = {
  action: ProcessWorkspaceAction | null;
  selected: ProcessRecord[];
  canOperate: boolean;
  analysts: SessionUser[];
  departments: ProcessDispatchDepartment[];
  markers: ProcessMarkerOption[];
  onClose: () => void;
  onCreateMarker: () => void;
  onSubmit: (payload: ProcessBatchPayload) => Promise<void>;
};

const titles: Record<ProcessWorkspaceAction, string> = {
  prioridade: "Definir prioridade de acompanhamento",
  atribuir: "Atribuir análise técnica",
  encaminhar: "Encaminhar entre unidades",
  decisao: "Abrir decisão oficial",
  etiquetas: "Gerenciar marcadores pessoais",
};

export function ProcessBatchActionDialog({
  action, selected, canOperate, analysts, departments, markers,
  onClose, onCreateMarker, onSubmit,
}: Props) {
  const [priority, setPriority] = useState<"normal" | "alta" | "critica">("alta");
  const [analystProfileId, setAnalystProfileId] = useState("");
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dispatchPriority, setDispatchPriority] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [markerIndex, setMarkerIndex] = useState("");
  const [markerOperation, setMarkerOperation] = useState<"apply" | "remove">("apply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setError(""); }, [action]);
  const hasReassignment = selected.some(p => Boolean(p.analysis?.assignedProfileId || p.analysis?.assignedTo));
  const availableDepartments = useMemo(() => departments.filter(d => d.isActive), [departments]);
  const canSubmit = Boolean(canOperate && selected.length && !busy &&
    (action === "prioridade" ||
      (action === "atribuir" && analystProfileId && (!hasReassignment || reason.trim().length >= 8)) ||
      (action === "encaminhar" && destination && subject.trim().length >= 8 && dueDate) ||
      (action === "etiquetas" && markerIndex !== "")));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    try {
      const marker = markerIndex === "" ? undefined : markers[Number(markerIndex)];
      await onSubmit({
        priority, analystProfileId, reason: reason.trim(),
        destination, subject: subject.trim(), dueDate, dispatchPriority,
        marker, markerOperation,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar esta operação.");
    } finally { setBusy(false); }
  };
  const labelClass = "block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-200";
  const selectClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  return (
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-[560px] overflow-y-auto rounded-2xl border-sky-100 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-lg">{action ? titles[action] : "Ação do processo"}</DialogTitle>
          <DialogDescription className="text-xs">
            {selected.length} processo(s) selecionado(s). Operações oficiais preservam unidade, perfil e histórico.
          </DialogDescription>
        </DialogHeader>
        {selected.length ? (
          <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            {selected.map(p => <p key={p.id} className="truncate py-0.5 text-xs font-semibold" title={p.title}>
              {formatOfficialProcessNumber(p.protocol)} · {p.title}
            </p>)}
          </div>
        ) : null}
        {!canOperate && action !== "decisao" ? (
          <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
            <CircleAlert className="h-4 w-4 shrink-0" />
{action === "atribuir"
              ? "A atribuição exige o gestor autorizado da unidade de análise. O analista pode consultar, mas não redistribuir processos."
              : action === "encaminhar"
              ? "Este processo não pertence à unidade operacional desta conta ou o perfil está somente em consulta. Despachos exigem a unidade responsável."
              : "O perfil atual está em modo de consulta. Apenas profissionais internos autorizados podem gravar marcadores e prioridades. Nenhuma alteração foi realizada."}
          </div>
        ) : null}

        {action === "decisao" ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-medium leading-5 text-slate-800">
              A decisão exige conferência individual do processo e assinatura pelo perfil competente. Selecione um item para abrir sua ficha oficial.
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {selected.map(p => (
                <Link key={p.id} to={buildProcessPath(p, p.status === "deferido" ? "alvara" : "analise")}
                  onClick={onClose}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-sky-900 hover:border-sky-300 hover:bg-sky-50">
                  <span className="min-w-0 truncate"><FileCheck2 className="mr-1 inline h-4 w-4" />{formatOfficialProcessNumber(p.protocol)}</span>
                  Abrir ficha <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {action === "prioridade" ? (
              <div className="space-y-3">
                <label className={labelClass}>Nível de acompanhamento
                  <select className={selectClass} value={priority}
                    onChange={e => setPriority(e.target.value as "normal" | "alta" | "critica")}>
                    <option value="normal">Normal · azul</option>
                    <option value="alta">Alta · âmbar</option>
                    <option value="critica">Crítica · vermelho</option>
                  </select>
                </label>
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-slate-700">
                  Prioridade operacional pessoal, registrada como marcador na cor escolhida. Não altera o prazo legal ou SLA oficial.
                </p>
              </div>
            ) : null}
            {action === "atribuir" ? (
              <div className="space-y-3">
                <label className={labelClass}>Analista ativo da prefeitura
                  <select className={selectClass} value={analystProfileId}
                    onChange={e => setAnalystProfileId(e.target.value)}>
                    <option value="">Escolha o analista responsável</option>
                    {analysts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.department || a.title}</option>)}
                  </select>
                </label>
                {hasReassignment ? (
                  <label className={labelClass}>Justificativa da redistribuição
                    <Input value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="Informe o motivo (mín. 8 caracteres)" maxLength={320} />
                  </label>
                ) : null}
                {analysts.length === 0 ? <p role="alert" className="text-xs font-semibold text-amber-800">
                  Nenhum analista ativo disponível neste município. Verifique o cadastro de usuários e a unidade de análise.
                </p> : null}
              </div>
            ) : null}
            {action === "encaminhar" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>Unidade de destino
                  <select className={selectClass} value={destination} onChange={e => setDestination(e.target.value)}>
                    <option value="">Selecione a unidade</option>
                    {availableDepartments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </label>
                {availableDepartments.length === 0 ? (
                  <p role="alert" className="sm:col-span-2 text-xs font-semibold text-amber-800">
                    Nenhuma unidade ativa foi carregada. Confira o organograma municipal antes de encaminhar.
                  </p>
                ) : null}
                <label className={labelClass}>Prazo da tramitação
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </label>
                <label className={labelClass + " sm:col-span-2"}>Assunto / motivação do encaminhamento
                  <Input maxLength={220} value={subject} onChange={e => setSubject(e.target.value)}
                    placeholder="Motivo formal do envio (mín. 8 caracteres)" />
                </label>
                <label className={labelClass + " sm:col-span-2"}>Prioridade do despacho
                  <select className={selectClass} value={dispatchPriority}
                    onChange={e => setDispatchPriority(e.target.value as "baixa" | "media" | "alta" | "critica")}>
                    <option value="baixa">Baixa</option><option value="media">Média</option>
                    <option value="alta">Alta</option><option value="critica">Crítica</option>
                  </select>
                </label>
                <p className="sm:col-span-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-slate-700">
                  O despacho será registrado no fluxo oficial, com origem, destino e autor. A prefeitura valida as permissões e as regras da etapa.
                </p>
              </div>
            ) : null}
            {action === "etiquetas" ? (
              <div className="space-y-3">
                <label className={labelClass}>Operação
                  <select className={selectClass} value={markerOperation}
                    onChange={e => setMarkerOperation(e.target.value as "apply" | "remove")}>
                    <option value="apply">Aplicar marcador pessoal</option>
                    <option value="remove">Remover marcador pessoal</option>
                  </select>
                </label>
                <label className={labelClass}>Marcador da pasta
                  <select className={selectClass} value={markerIndex}
                    onChange={e => setMarkerIndex(e.target.value)}>
                    <option value="">Escolha um marcador</option>
                    {markers.map((m, i) => <option key={i} value={String(i)}>{m.label}</option>)}
                  </select>
                </label>
                <Button type="button" size="sm" variant="outline" onClick={() => { onClose(); onCreateMarker(); }}>
                  <PersonalMarkerIcon className="mr-2 h-4 w-4" />Criar novo marcador
                </Button>
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  A situação oficial do processo permanece automática e independente. Limite de três marcadores individuais por profissional.
                </p>
              </div>
            ) : null}
            {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-bold text-red-800">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={!canSubmit}>
                {busy ? "Registrando..." : <><Tag className="mr-1.5 h-4 w-4" />Confirmar operação</>}
              </Button>
            </DialogFooter>
          </form>
        )}
        {action === "decisao" ? <div className="flex justify-end"><Button type="button" variant="outline" onClick={onClose}>Fechar</Button></div> : null}
        {action === "atribuir" ? <span className="sr-only"><UsersRound />Distribuição técnica</span> : null}
      </DialogContent>
    </Dialog>
  );
}
