import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "neon/migrations/20261110_closed_process_lifecycle_guard_v1_qa.sql",
  "utf8",
);

const genericStatus = migration.split(
  "CREATE OR REPLACE FUNCTION public.set_process_status",
)[1]?.split("CREATE OR REPLACE FUNCTION public.reopen_process")[0] ?? "";
const formalReopen = migration.split(
  "CREATE OR REPLACE FUNCTION public.reopen_process",
)[1]?.split("CREATE OR REPLACE FUNCTION public.guard_archived_process_transition_v1")[0] ?? "";
const guard = migration.split(
  "CREATE OR REPLACE FUNCTION public.guard_archived_process_transition_v1",
)[1] ?? "";

describe("SIGAPRO — proteção transacional de processo encerrado", () => {
  it("impede downgrade silencioso de arquivado via RPC genérica", () => {
    expect(genericStatus).toContain("for update;");
    expect(genericStatus).toContain("_from_status='arquivado'::public.process_status");
    expect(genericStatus).toContain("_to_status<>'arquivado'::public.process_status");
    expect(genericStatus).toContain("Processo arquivado somente pode mudar de estado");
  });

  it("a conclusão de Habite-se exige a RPC que valida assinatura, guia e audita", () => {
    expect(genericStatus).toContain("Use complete_habite_se_process_v1");
    expect(genericStatus).not.toContain("hp.status='emitido'");
    const signedMigration = readFileSync(
      "neon/migrations/20261110_habite_se_signed_document_and_completion.sql",
      "utf8",
    );
    expect(signedMigration).toContain("b.artifact_type='habite_se_permit'");
    expect(signedMigration).toContain("g.original_pdf_sha256");
    expect(signedMigration).toContain("insert into public.process_movements");
    expect(signedMigration).toContain("insert into public.process_audit_entries");
  });

  it("admin municipal não fecha e não reabre nenhum processo via estas RPCs", () => {
    for (const rpc of [genericStatus, formalReopen]) {
      expect(rpc).toContain("'prefeitura_admin','admin_prefeitura','admin_municipality'");
      expect(rpc).toContain("possui acesso somente de leitura");
    }
    expect(formalReopen).not.toContain("'prefeitura_admin','prefeitura_supervisor'");
  });

  it("reabertura exige motivo, autorização, controle de concorrência e evento auditável", () => {
    expect(formalReopen).toContain("for update;");
    expect(formalReopen).toContain("Motivo da reabertura e obrigatorio");
    expect(formalReopen).toContain("public.has_process_access(_process_id)");
    expect(formalReopen).toContain("perform set_config('sigapro.authorized_reopen_process',_process_id::text,true)");
    expect(formalReopen).toContain("perform set_config('sigapro.authorized_reopen_process','',true)");
    expect(formalReopen).toContain("insert into public.process_reopen_history");
    expect(formalReopen).toContain("insert into public.process_movements");
    expect(formalReopen).toContain("insert into public.process_audit_entries");
  });

  it("trigger veta arquivamento sem data e reversão fora da reabertura formal", () => {
    expect(guard).toContain("BEFORE UPDATE OF status,archived_at");
    expect(guard).toContain("NEW.status<>'reapresentacao'::public.process_status");
    expect(guard).toContain("current_setting('sigapro.authorized_reopen_process',true)");
    expect(guard).toContain("public.current_profile_id() IS NULL");
    expect(guard).toContain("NEW.archived_at IS NOT NULL");
    expect(guard).toContain("NEW.archived_at IS NULL");
    expect(guard).toContain("CREATE TRIGGER trg_guard_archived_process_transition_v1");
  });

  it("não reescreve historico, pagamentos ou processo legado na migração", () => {
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).not.toMatch(/\bUPDATE public\.processes\s+SET\s+status\s*=\s*'arquivado'/i);
    expect(migration).not.toContain("TRUNCATE ");
    expect(migration).not.toContain("DELETE FROM public.processes");
    expect(migration).not.toContain("INSERT INTO public.payment_guides");
  });
});
