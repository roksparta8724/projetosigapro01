import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync("src/pages/saas/ProtocolDeskPage.tsx", "utf8");
const sql = readFileSync(
  "neon/migrations/20261110_triage_recovery_authorized_protocol_v1_qa.sql",
  "utf8",
);
const recoveryFilter = ui.slice(
  ui.indexOf("const recoverableTriageCases = useMemo("),
  ui.indexOf("const tenantSettings =", ui.indexOf("const recoverableTriageCases = useMemo(")),
);
const recoveryHandler = ui.slice(
  ui.indexOf("const handleRecoverPrematureAnalysis = async"),
  ui.indexOf("const handleRecoverPrematureAnalysis = async") + 1900,
);
const adminBranch = ui.slice(
  ui.indexOf('if (["prefeitura_admin"].includes(session.role)) {\n    const query = processListQuery'),
  ui.indexOf('return (\n    <PortalFrame eyebrow="SETOR DE PROTOCOLO"'),
);

describe("SIGAPRO QA — desbloqueio auditado da triagem por servidor de Protocolo", () => {
  it("operador do Protocolo vê inconsistência real em sua pasta; Master só em seu escopo", () => {
    expect(recoveryFilter).toContain('["analise_tecnica", "distribuicao"].includes(item.status)');
    expect(recoveryFilter).toContain('item.triage.status !== "concluido"');
    expect(recoveryFilter).toContain("isProcessOwnedBySessionDepartment(session, item)");
    expect(recoveryFilter).toContain('"master_admin", "master_ops"');
    expect(recoveryFilter).toContain('[processes, session]');
  });

  it("a opção de reparo está no componente operacional e não no ramo de consulta municipal", () => {
    expect(ui).toContain('session.role !== "prefeitura_admin" && recoverableTriageCases.length > 0');
    expect(ui.indexOf('session.role !== "prefeitura_admin" && recoverableTriageCases.length > 0'))
      .toBeGreaterThan(ui.indexOf('return (\n    <PortalFrame eyebrow="SETOR DE PROTOCOLO"'));
    expect(adminBranch).not.toContain("handleRecoverPrematureAnalysis(");
    expect(adminBranch).toContain('data-sigapro-prefeitura-admin-readonly="true"');
  });

  it("handler nega chamadas de administrador e exige justificativa e processo selecionado", () => {
    expect(recoveryHandler).toContain('session.role === "prefeitura_admin"');
    expect(recoveryHandler).toContain('!recoverableTriageCases.some((item) => item.id === process.id)');
    expect(recoveryHandler).toContain("reason.length < 15");
    expect(recoveryHandler).toContain("await reconcileRemoteProcessTriage(process.id, reason)");
  });

  it("RPC só autoriza Master ou servidor interno lotado em Protocolo", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reconcile_unreleased_process_triage_v1");
    expect(sql).toContain("'prefeitura_admin','admin_prefeitura','admin_municipality'");
    expect(sql).toContain("public.is_internal_municipality_role()");
    expect(sql).toContain("public.profile_operational_area(_actor)='protocolos'");
    expect(sql).toContain("public.has_process_access(_process_id)");
    expect(sql).not.toContain("Somente o administrador municipal pode solicitar a correção");
  });

  it("não legitima processo que já tenha análise, despacho ou exigências reais", () => {
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("_process.officialized_at IS NULL");
    expect(sql).toContain("public.interdepartmental_dispatches");
    expect(sql).toContain("public.process_analysis_sheets");
    expect(sql).toContain("public.process_requirements");
    expect(sql).toContain("length(_reason_text) < 15");
  });

  it("reconciliação preserva a autoria, as guias e os anexos e cria auditoria", () => {
    expect(sql).toContain("INSERT INTO public.process_audit_entries");
    expect(sql).toContain("INSERT INTO public.process_movements");
    expect(sql).toContain("'payment_modified',false,'documents_modified',false");
    expect(sql).not.toContain("UPDATE public.payment_guides");
    expect(sql).not.toContain("DELETE FROM public.process_documents");
  });
});
