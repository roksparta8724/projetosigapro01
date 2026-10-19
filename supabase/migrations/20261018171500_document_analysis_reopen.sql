-- SIGAPRO — reabertura auditada de análise documental.
-- Permite corrigir uma aprovação/rejeição lançada por engano sem apagar histórico.
-- A decisão anterior permanece no audit trail; o documento volta a "pendente".

create or replace function public.reopen_process_document_analysis_v1(
  _document_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _process_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _previous_status text;
  _actor_name text;
  _doc public.process_documents%rowtype;
  _audit public.process_audit_entries%rowtype;
  _normalized_reason text := btrim(coalesce(_reason,''));
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if _normalized_reason = '' then
    raise exception 'Informe o motivo da reabertura da análise.';
  end if;

  select
    d.process_id,
    d.tenant_id,
    d.municipality_id,
    coalesce(d.review_status,'pendente')
  into
    _process_id,
    _tenant_id,
    _municipality_id,
    _previous_status
  from public.process_documents d
  where d.id=_document_id
  for update;

  if _process_id is null then
    raise exception 'Documento não encontrado.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente a equipe da Análise Urbanística pode reabrir esta análise.';
  end if;

  if _previous_status not in ('aprovado','rejeitado') then
    raise exception 'Este documento já está disponível para análise.';
  end if;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Servidor da Análise')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  update public.process_documents
     set review_status='pendente',
         reviewed_by=null,
         reviewed_by_profile_id=null
   where id=_document_id
   returning * into _doc;

  update public.processes
     set updated_at=clock_timestamp(),
         process_checkpoint='Documento reaberto para nova análise'
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    category,
    title,
    detail,
    visible_to_external,
    created_at,
    municipality_id
  )
  values(
    _tenant_id,
    _process_id,
    _legacy_user_id,
    _profile_id,
    'documento',
    'Análise documental reaberta',
    'Decisão anterior: '||_previous_status||
      '. Reaberto por '||coalesce(_actor_name,'Servidor da Análise')||
      '. Motivo: '||_normalized_reason,
    true,
    clock_timestamp(),
    _municipality_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'document',to_jsonb(_doc),
    'previous_status',_previous_status,
    'reason',_normalized_reason,
    'audit',to_jsonb(_audit)
  );
end;
$function$;

grant execute on function public.reopen_process_document_analysis_v1(uuid,text) to authenticated;

notify pgrst, 'reload schema';
