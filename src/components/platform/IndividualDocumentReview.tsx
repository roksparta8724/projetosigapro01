import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getIndividualDocumentReview, type ProcessRecord, type ProcessDocument } from "@/lib/platform";
import { recordRemoteIndividualDocumentReview } from "@/integrations/backend/platform";

export function IndividualDocumentReview({ process, document, onRefresh, compact = false }: {
  process: ProcessRecord;
  document: ProcessDocument;
  onRefresh: () => Promise<void>;
  compact?: boolean;
}) {
  const latest = getIndividualDocumentReview(process, document.id);
  const pending = latest?.title === "Reavaliação individual aberta";
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (action: "reabrir" | "aprovar" | "ressalvas") => {
    if (busy || reason.trim().length < 8) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await recordRemoteIndividualDocumentReview(document.id, action, reason.trim());
      setReason(""); setFormOpen(false);
      setMessage("Registro salvo no histórico deste documento.");
      try { await onRefresh(); } catch { setMessage("Registro salvo. Atualize a consulta para exibir o histórico."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a reavaliação.");
    } finally { setBusy(false); }
  };
  const reviewPanel = (
    <section data-individual-document-review="true" className="mt-3 min-w-0 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-slate-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-slate-100">
      <p className="text-xs font-semibold">Reavaliação individual</p>
      <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Somente este documento. O processo, os demais arquivos e os atos oficiais já emitidos permanecem inalterados.</p>
      {latest ? <p className="mt-2 break-words text-xs font-semibold [overflow-wrap:anywhere]">{latest.title} · {latest.actor} · {latest.at}</p> : null}
      {!pending && !formOpen && !compact ? (
        <Button type="button" variant="outline" data-document-independent-reopen="true" onClick={() => {setFormOpen(true);setMessage("");}}
          className="mt-3 h-auto min-h-10 w-full whitespace-normal rounded-xl border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200">
          <RotateCcw className="mr-2 h-4 w-4 shrink-0" />Reabrir somente este documento
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold">{pending ? "Parecer da nova avaliação" : "Justificativa da reabertura"}</label>
          <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} disabled={busy}
            placeholder="Descreva o motivo ou parecer (mínimo 8 caracteres)" className="min-h-24 bg-white text-sm text-slate-950 dark:bg-slate-900 dark:text-white" />
          {pending ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void submit("aprovar")} className="h-auto min-h-10 flex-1 whitespace-normal bg-emerald-700 !text-white hover:bg-emerald-800">Confirmar aprovação</Button>
              <Button type="button" variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => void submit("ressalvas")} className="h-auto min-h-10 flex-1 whitespace-normal border-amber-300 text-amber-900 dark:text-amber-200">Registrar ressalvas</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => {setFormOpen(false);setReason("");setError("");}}>Cancelar</Button>
              <Button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void submit("reabrir")} className="h-auto min-h-10 flex-1 whitespace-normal bg-sky-800 !text-white hover:bg-sky-900">{busy ? "Registrando..." : "Confirmar reabertura individual"}</Button>
            </div>
          )}
        </div>
      )}
      {message ? <p role="status" className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">{message}</p> : null}
      {error ? <p role="alert" className="mt-2 break-words text-xs font-semibold text-rose-800 dark:text-rose-300">{error}</p> : null}
    </section>
  );
  if (!compact) return reviewPanel;
  return (
    <>
      <Button type="button" variant="outline" data-document-independent-reopen="true"
        onClick={() => { setFormOpen(true); setMessage(""); setError(""); }}
        className="h-9 max-w-full shrink-0 whitespace-nowrap rounded-full border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-200">
        <RotateCcw className="mr-1.5 h-4 w-4 shrink-0" />{pending ? "Concluir reavaliação" : "Reabrir documento"}
      </Button>
      <Dialog open={formOpen} onOpenChange={open => { if (!busy) { setFormOpen(open); if (!open) { setReason(""); setError(""); } } }}>
        <DialogContent className="max-h-[88vh] max-w-[520px] overflow-y-auto rounded-2xl bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
          <DialogHeader><DialogTitle>Reavaliação individual</DialogTitle>
            <DialogDescription className="break-words [overflow-wrap:anywhere]">{document.label} · somente este arquivo</DialogDescription>
          </DialogHeader>
          {reviewPanel}
        </DialogContent>
      </Dialog>
      {message ? <span role="status" className="sr-only">{message}</span> : null}
    </>
  );
}
