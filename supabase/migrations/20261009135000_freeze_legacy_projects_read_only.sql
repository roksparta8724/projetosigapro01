-- SIGAPRO: congela o modelo histórico "projects" como somente leitura.
-- Preserva os registros antigos, mas remove automações/RPCs que poderiam
-- reativar o fluxo legado em paralelo ao modelo canônico "processes".

drop trigger if exists trigger_generate_payment on public.project_documents;
drop trigger if exists project_status_notification on public.projects;
drop trigger if exists trg_projects_sync_profile on public.projects;
drop trigger if exists trigger_gerar_protocolo on public.projects;

drop function if exists public.confirm_payment(uuid,uuid);
drop function if exists public.generate_payment_guide();
drop function if exists public.gerar_protocolo();
drop function if exists public.notify_project_status();

revoke insert, update, delete, truncate, references, trigger
  on table public.projects, public.project_documents, public.project_payments
  from authenticated;
