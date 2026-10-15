import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileSignature,
  Loader2,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Signature,
} from "lucide-react";
import { ElectronicSignatureDialog } from "@/components/platform/ElectronicSignatureDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  executeRemoteSuperiorApprovalWithSignature,
  finalizeRemoteApprovedProcess,
  getRemoteFinalApprovalContext,
  getRemoteSuperiorTechnicalConclusion,
  getRemoteTechnicalConclusionWorkspace,
  listRemoteRequiredProcessDocumentsForSignature,
  listRemoteSuperiorApprovalActions,
  signAndFinalizeRemoteTechnicalConclusion,
  signRemoteRequiredProcessDocument,
  startRemoteTechnicalConclusion,
  submitRemoteTechnicalConclusionForApproval,
  updateRemoteTechnicalConclusion,
} from "@/integrations/backend/platform";

type ConclusionType = { id: string; code: string; label: string; version: number };
type Conclusion = {
  id: string;
  status: string;
  typeId?: string | null;
  typeLabel?: string | null;
  conclusionText?: string | null;
  technicalBasis?: string | null;
  internalNotes?: string | null;
  finalizedAt?: string | null;
  finalizedByName?: string | null;
};
type AnalystWorkspace = {
  conclusion?: Conclusion | null;
  types?: ConclusionType[];
};
type RequiredDocument = {
  requirementId: string;
  documentId: string;
  documentVersion: number;
  documentHash: string;
  requiredRoleCode: string;
  status: string;
  title: string;
  fileName?: string;
  alreadySigned?: boolean;
};
type SuperiorAction = {
  transition_id: string;
  action_code: string;
  action_label: string;
  to_stage_code: string;
  to_stage_label: string;
  to_queue_code: string;
  to_queue_label: string;
  requires_reason?: boolean;
  signature_required?: boolean;
};
type SignatureIntent =
  | { kind: "analyst" }
  | { kind: "required-document"; item: RequiredDocument }
  | { kind: "superior-action"; action: SuperiorAction }
  | null;

const cardShell =
  "rounded-[24px] border border-slate-200/90 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]";

function messageFrom(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/not in superior approval|PROCESS_NOT_IN_SUPERIOR_APPROVAL/i.test(raw)) {
    return "Este processo ainda não está em uma etapa de decisão superior.";
  }
  if (/technical.*context|ACTIVE_TECHNICAL_ASSIGNMENT_REQUIRED/i.test(raw)) {
    return "A conclusão técnica está disponível somente para o analista atualmente responsável pelo processo.";
  }
  if (/workflow.*not installed|ainda nao instalado/i.test(raw)) {
    return "O workflow assinado ainda não está habilitado neste banco de teste.";
  }
  return raw || "Não foi possível carregar o workflow de assinatura.";
}

export function SignedApprovalWorkflowPanel({
  processId,
  onChanged,
}: {
  processId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const { session } = usePlatformSession();
  const isAnalyst = session.role === "analista";
  const isSupervisor = session.role === "prefeitura_supervisor";
  const eligible = isAnalyst || isSupervisor;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [workspace, setWorkspace] = useState<AnalystWorkspace | null>(null);
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredDocument[]>([]);
  const [superiorActions, setSuperiorActions] = useState<SuperiorAction[]>([]);
  const [superiorConclusion, setSuperiorConclusion] = useState<Record<string, unknown> | null>(null);
  const [finalContext, setFinalContext] = useState<Record<string, unknown> | null>(null);
  const [intent, setIntent] = useState<SignatureIntent>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [typeId, setTypeId] = useState("");
  const [conclusionText, setConclusionText] = useState("");
  const [technicalBasis, setTechnicalBasis] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const load = useCallback(async () => {
    if (!eligible || !processId) return;
    setLoading(true);
    setStatus("");
    try {
      if (isAnalyst) {
        const data = await getRemoteTechnicalConclusionWorkspace(processId) as AnalystWorkspace;
        setWorkspace(data);
        const conclusion = data.conclusion ?? null;
        setTypeId(conclusion?.typeId || "");
        setConclusionText(conclusion?.conclusionText || "");
        setTechnicalBasis(conclusion?.technicalBasis || "");
        setInternalNotes(conclusion?.internalNotes || "");
      } else if (isSupervisor) {
        const results = await Promise.allSettled([
          getRemoteSuperiorTechnicalConclusion(processId),
          listRemoteRequiredProcessDocumentsForSignature(processId),
          listRemoteSuperiorApprovalActions(processId),
          getRemoteFinalApprovalContext(processId),
        ]);
        const [conclusionResult, docsResult, actionsResult, finalResult] = results;
        setSuperiorConclusion(
          conclusionResult.status === "fulfilled" ? conclusionResult.value : null,
        );
        setRequiredDocuments(
          docsResult.status === "fulfilled" ? (docsResult.value as RequiredDocument[]) : [],
        );
        setSuperiorActions(
          actionsResult.status === "fulfilled" ? (actionsResult.value as SuperiorAction[]) : [],
        );
        setFinalContext(finalResult.status === "fulfilled" ? finalResult.value : null);

        const firstError = results.find((result) => result.status === "rejected");
        if (
          firstError &&
          conclusionResult.status === "rejected" &&
          docsResult.status === "rejected" &&
          actionsResult.status === "rejected"
        ) {
          setStatus(messageFrom((firstError as PromiseRejectedResult).reason));
        }
      }
    } catch (error) {
      setStatus(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, [eligible, isAnalyst, isSupervisor, processId]);

  useEffect(() => {
    void load();
  }, [load]);

  const conclusionFinalized = workspace?.conclusion?.status === "finalized";
  const allRequiredSigned =
    requiredDocuments.length === 0 || requiredDocuments.every((item) => item.alreadySigned);
  const finalReady = Boolean(finalContext?.ready);

  const saveConclusion = async () => {
    if (!typeId) throw new Error("Selecione o tipo da conclusão técnica.");
    if (!conclusionText.trim()) throw new Error("Preencha a conclusão técnica antes de salvar.");

    setBusy("save-conclusion");
    try {
      if (!workspace?.conclusion) {
        await startRemoteTechnicalConclusion(processId);
      }
      await updateRemoteTechnicalConclusion({
        processId,
        conclusionTypeId: typeId,
        conclusionText: conclusionText.trim(),
        technicalBasis: technicalBasis.trim(),
        internalNotes: internalNotes.trim(),
      });
      setStatus("Conclusão técnica salva como rascunho.");
      await load();
    } finally {
      setBusy("");
    }
  };

  const confirmSignature = async (password: string) => {
    if (!intent) return;
    setBusy("signature");
    setStatus("");
    try {
      if (intent.kind === "analyst") {
        await saveConclusion();
        await signAndFinalizeRemoteTechnicalConclusion({
          processId,
          password,
          statement: "Conclusão técnica assinada eletronicamente pelo analista responsável.",
        });
        await submitRemoteTechnicalConclusionForApproval(
          processId,
          `technical-submit-${crypto.randomUUID()}`,
        );
        setStatus("Conclusão técnica assinada e encaminhada para aprovação superior.");
      } else if (intent.kind === "required-document") {
        await signRemoteRequiredProcessDocument({
          processId,
          requirementId: intent.item.requirementId,
          password,
          statement: `Assinatura obrigatória do documento ${intent.item.title}, versão ${intent.item.documentVersion}.`,
        });
        setStatus(`Documento "${intent.item.title}" assinado eletronicamente.`);
      } else if (intent.kind === "superior-action") {
        if (intent.action.requires_reason && !decisionNote.trim()) {
          throw new Error("Informe a justificativa exigida para esta decisão excepcional.");
        }
        await executeRemoteSuperiorApprovalWithSignature({
          processId,
          transitionId: intent.action.transition_id,
          decisionNote: decisionNote.trim(),
          idempotencyKey: `superior-${crypto.randomUUID()}`,
          password,
          statement: `${intent.action.action_label} — decisão administrativa assinada eletronicamente.`,
        });
        setStatus(`${intent.action.action_label} registrada e assinada.`);
      }
      setIntent(null);
      await load();
      await onChanged?.();
    } catch (error) {
      throw new Error(messageFrom(error));
    } finally {
      setBusy("");
    }
  };

  const finalize = async () => {
    setBusy("finalize");
    setStatus("");
    try {
      await finalizeRemoteApprovedProcess(processId, `finalize-${crypto.randomUUID()}`);
      setStatus("Processo aprovado concluído após validação de todas as assinaturas obrigatórias.");
      await load();
      await onChanged?.();
    } catch (error) {
      setStatus(messageFrom(error));
    } finally {
      setBusy("");
    }
  };

  const dialogCopy = useMemo(() => {
    if (!intent) return null;
    if (intent.kind === "analyst") {
      return {
        title: "Assinar conclusão técnica",
        subject: "A conclusão será imutabilizada, assinada pelo analista responsável e encaminhada para aprovação superior.",
        statement: "Confirmo a conclusão técnica, sua fundamentação e o conteúdo exibido neste processo.",
      };
    }
    if (intent.kind === "required-document") {
      return {
        title: "Assinar documento obrigatório",
        subject: `${intent.item.title} • versão ${intent.item.documentVersion}`,
        statement: "Confirmo que analisei o documento e assino exatamente esta versão e este hash SHA-256.",
      };
    }
    return {
      title: "Assinar decisão superior",
      subject: intent.action.action_label,
      statement: "Confirmo esta decisão administrativa e autorizo seu registro eletrônico no workflow do processo.",
    };
  }, [intent]);

  if (!eligible) return null;

  return (
    <>
      <Card className={cardShell}>
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Signature className="h-5 w-5 text-sky-700" />
                Assinatura e decisão eletrônica
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                O SIGAPRO mostra somente os atos permitidos para seu perfil, sua lotação e a etapa atual do workflow.
              </p>
            </div>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          {status ? (
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {status}
            </div>
          ) : null}

          {isAnalyst ? (
            <>
              {loading && !workspace ? (
                <div className="rounded-[18px] border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                  Carregando contexto técnico...
                </div>
              ) : workspace ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-sky-800">
                      Analista responsável
                    </span>
                    {conclusionFinalized ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-800">
                        Conclusão assinada
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-amber-800">
                        Rascunho técnico
                      </span>
                    )}
                  </div>

                  {!conclusionFinalized ? (
                    <>
                      <div className="space-y-2">
                        <Label>Tipo de conclusão *</Label>
                        <Select value={typeId || "__none"} onValueChange={(value) => setTypeId(value === "__none" ? "" : value)}>
                          <SelectTrigger className="h-11 rounded-2xl">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Selecione</SelectItem>
                            {(workspace.types ?? []).map((type) => (
                              <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Conclusão técnica *</Label>
                        <Textarea value={conclusionText} onChange={(event) => setConclusionText(event.target.value)} className="min-h-28 rounded-2xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>Fundamentação técnica</Label>
                        <Textarea value={technicalBasis} onChange={(event) => setTechnicalBasis(event.target.value)} className="min-h-24 rounded-2xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>Notas internas</Label>
                        <Textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} className="min-h-20 rounded-2xl" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(busy)} onClick={() => void saveConclusion().catch((error) => setStatus(messageFrom(error)))}>
                          <Save className="mr-2 h-4 w-4" />
                          Salvar rascunho
                        </Button>
                        <Button type="button" className="rounded-full bg-slate-950 px-5 !text-white" disabled={Boolean(busy)} onClick={() => setIntent({ kind: "analyst" })}>
                          <FileSignature className="mr-2 h-4 w-4" />
                          Assinar e encaminhar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
                      <div className="flex items-center gap-2 font-semibold">
                        <BadgeCheck className="h-4 w-4" />
                        Conclusão finalizada e protegida contra edição.
                      </div>
                      {workspace.conclusion?.finalizedAt ? (
                        <p className="mt-1 text-xs">Finalizada em {new Date(workspace.conclusion.finalizedAt).toLocaleString("pt-BR")}.</p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {isSupervisor ? (
            <div className="space-y-5">
              {superiorConclusion ? (
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Conclusão técnica recebida</p>
                  <p className="mt-2 font-semibold text-slate-950">{String(superiorConclusion.type_label || "Conclusão técnica")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{String(superiorConclusion.conclusion_text || "")}</p>
                  {superiorConclusion.technical_basis ? (
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">{String(superiorConclusion.technical_basis)}</p>
                  ) : null}
                </div>
              ) : null}

              {requiredDocuments.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Documentos obrigatórios para sua decisão</p>
                      <p className="mt-1 text-xs text-slate-500">A assinatura é vinculada à versão e ao SHA-256 exatos do documento.</p>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {requiredDocuments.filter((item) => item.alreadySigned).length}/{requiredDocuments.length} assinados
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {requiredDocuments.map((item) => (
                      <div key={item.requirementId} className="flex flex-col gap-3 rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-950">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">Versão {item.documentVersion} • {item.requiredRoleCode}</p>
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-400" title={item.documentHash}>{item.documentHash}</p>
                        </div>
                        {item.alreadySigned ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Assinado
                          </span>
                        ) : (
                          <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(busy)} onClick={() => setIntent({ kind: "required-document", item })}>
                            <Signature className="mr-2 h-4 w-4" /> Assinar documento
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {superiorActions.length > 0 ? (
                <div className="space-y-3 border-t border-slate-200 pt-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Decisão superior</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Somente ações liberadas pelo workflow atual são exibidas.</p>
                  </div>
                  {superiorActions.some((action) => action.requires_reason) ? (
                    <div className="space-y-2">
                      <Label>Justificativa da decisão excepcional</Label>
                      <Textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} className="min-h-20 rounded-2xl" />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {superiorActions.map((action) => (
                      <Button
                        key={action.transition_id}
                        type="button"
                        className="rounded-full bg-slate-950 px-5 !text-white"
                        disabled={Boolean(busy) || !allRequiredSigned}
                        onClick={() => setIntent({ kind: "superior-action", action })}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {action.action_label}
                      </Button>
                    ))}
                  </div>
                  {!allRequiredSigned ? (
                    <p className="text-xs text-amber-700">Assine todos os documentos obrigatórios antes de registrar a decisão.</p>
                  ) : null}
                </div>
              ) : null}

              {finalReady ? (
                <div className="flex flex-col gap-3 rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-emerald-950">Todas as assinaturas obrigatórias foram validadas</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">O processo pode ser concluído sem criar nova assinatura redundante.</p>
                  </div>
                  <Button type="button" className="rounded-full bg-emerald-700 px-5 !text-white hover:bg-emerald-800" disabled={Boolean(busy)} onClick={() => void finalize()}>
                    <Send className="mr-2 h-4 w-4" />
                    Concluir processo aprovado
                  </Button>
                </div>
              ) : null}

              {!loading && !superiorConclusion && requiredDocuments.length === 0 && superiorActions.length === 0 && !finalReady ? (
                <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                  Não há ato superior pendente para este perfil na etapa atual.
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {dialogCopy ? (
        <ElectronicSignatureDialog
          open={Boolean(intent)}
          onOpenChange={(open) => !open && setIntent(null)}
          title={dialogCopy.title}
          subject={dialogCopy.subject}
          statement={dialogCopy.statement}
          busy={busy === "signature"}
          onConfirm={confirmSignature}
        />
      ) : null}
    </>
  );
}
