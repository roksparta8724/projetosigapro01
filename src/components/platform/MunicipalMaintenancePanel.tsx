import { useRef, useState } from "react";
import { Archive, Database, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backendClient, hasBackendEnv } from "@/integrations/backend/databaseClient";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import type { Institution } from "@/lib/platform";

type MaintenanceResult = {
  municipality_id: string; process_count: number; document_count: number; guide_count: number;
  protected_guides: number; external_guides: number; legacy_links: number;
  backup_id?: string; reset_done?: boolean; reset_allowed: boolean;
  lifecycle_mode: "homologacao" | "producao_protegida";
};
export function MunicipalMaintenancePanel({ institution, onChanged }: {
  institution: Institution; onChanged: () => Promise<void>;
}) {
  const { isAuthenticated, authResolved, authenticatedRole } = useAuthGateway();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MaintenanceResult | null>(null);
  const [backupId, setBackupId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const pending = useRef(false);
  const phrase = "REINICIAR " + institution.subdomain;
  const allowed = isAuthenticated && authResolved && ["master_admin","admin_master"].includes(authenticatedRole || "");
  if (!allowed || !hasBackendEnv) return null;
  async function run(action: "preview" | "backup" | "reset") {
    if (pending.current || !allowed) return;
    if (action === "reset" && (!result?.reset_allowed || !backupId || confirmation !== phrase)) return;
    pending.current = true; setBusy(true); setMessage(""); setMessageTone("info");
    try {
      const { data, error } = await backendClient.rpc("municipal_test_maintenance_v1", {
        _municipality_id: institution.id, _action: action,
        _backup_id: action === "reset" ? backupId : null,
        _confirmation: action === "reset" ? confirmation : "",
      });
      if (error) throw new Error(error.message || "Operação não confirmada.");
      const row = data as unknown as MaintenanceResult;
      if (!row || row.municipality_id !== institution.id || typeof row.process_count !== "number" || typeof row.reset_allowed !== "boolean") throw new Error("Resposta de manutenção não confirmada.");
      if (action === "backup" && !row.backup_id) throw new Error("O banco não confirmou o backup.");
      if (action === "reset" && (row.reset_done !== true || row.process_count !== 0)) throw new Error("O banco não confirmou o reinício.");
      if (!["homologacao","producao_protegida"].includes(row.lifecycle_mode)) throw new Error("O banco não confirmou a modalidade de operação.");
      setResult(row);
      setMessageTone("success");
      if (action === "backup") { setBackupId(row.backup_id || ""); setMessage("Cópia lógica registrada no banco. Arquivos externos não foram copiados."); }
      else if (action === "reset") {
        setBackupId(""); setConfirmation(""); setMessage("Processos de teste removidos. Numeração e cadastro municipal preservados.");
        try { await onChanged(); } catch { setMessage("Reinício confirmado pelo banco. Atualize a página para sincronizar os indicadores."); }
      } else { setBackupId(""); setConfirmation(""); }
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Falha na manutenção.");
      setResult(null);
      setBackupId(""); setConfirmation("");
    } finally { pending.current=false; setBusy(false); }
  }
  return <section data-municipal-maintenance="true" className="mt-4 min-w-0 rounded-2xl border p-4">
    <Button type="button" variant="outline" aria-expanded={open} disabled={busy} onClick={()=>setOpen(v=>!v)} data-maintenance-action="secondary" className="w-full justify-start rounded-xl">
      <Database className="mr-2 h-4 w-4" /> Backup e reinício de testes
    </Button>
    {open && <div className="mt-4 space-y-3">
      <p data-maintenance-text="title" className="text-sm font-semibold">{institution.name}</p>
      <p data-maintenance-text="muted" className="text-sm">Manutenção exclusiva desta Prefeitura. Usuários, organograma, planos, legislação, configurações e numeração serão preservados. A cópia lógica guarda registros e referências, não os arquivos do R2.</p>
      <Button type="button" disabled={busy} onClick={()=>void run("preview")} variant="outline" data-maintenance-action="secondary" className="w-full rounded-xl">Conferir dados e impedimentos</Button>
      {result && <>
        <p data-maintenance-mode={result.lifecycle_mode} className="rounded-xl border px-3 py-2 text-sm font-semibold">{result.lifecycle_mode === "homologacao" ? "Homologação — limpeza restrita" : "Produção protegida — limpeza bloqueada"}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[[result.process_count,"Processos"],[result.document_count,"Documentos"],[result.guide_count,"Guias"]].map(([count,label])=><div key={label} data-maintenance-metric="true" className="min-w-0 rounded-xl border p-3"><p data-maintenance-text="title" className="text-xl font-bold tabular-nums">{count}</p><p data-maintenance-text="muted" className="text-xs">{label}</p></div>)}
        </div>
        <p data-maintenance-tone="warning" className="rounded-xl border p-3 text-sm"><ShieldAlert className="mr-1 inline h-4 w-4"/> Guias protegidas: {result.protected_guides}. Referências bancárias: {result.external_guides}. Vínculos legados: {result.legacy_links}. A limpeza exige homologação autorizada, Prefeitura suspensa, ausência destes impedimentos e backup atual.</p>
        <Button type="button" disabled={busy} onClick={()=>void run("backup")} data-maintenance-action="primary" className="w-full rounded-xl"><Archive className="mr-2 h-4 w-4"/>Registrar backup lógico</Button>
        {backupId && <p data-maintenance-text="muted" className="break-all text-xs">Backup registrado: {backupId}</p>}
        <label data-maintenance-text="title" className="block space-y-1 text-sm">Confirme digitando {phrase}<Input data-maintenance-field="true" value={confirmation} disabled={busy || !backupId || !result.reset_allowed} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
        <Button type="button" variant="destructive" data-maintenance-action="danger" className="w-full rounded-xl" disabled={busy || !backupId || !result.reset_allowed || confirmation!==phrase} onClick={()=>void run("reset")}>Reiniciar processos de teste</Button>
      </>}
      {busy && <p role="status" data-maintenance-text="muted" className="text-sm">Aguardando confirmação do banco…</p>}
      {message && <p role={messageTone === "error" ? "alert" : "status"} data-maintenance-tone={messageTone} className="rounded-xl border p-3 break-words text-sm">{message}</p>}
    </div>}
  </section>;
}
