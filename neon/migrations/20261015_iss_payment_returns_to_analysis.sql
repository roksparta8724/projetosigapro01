-- SIGAPRO 2026-10-15
-- A compensacao da Guia ISSQN / Projeto encerra a passagem pelo Financeiro
-- e devolve o processo, de forma atomica e auditavel, para Analise Urbanistica.
-- Migration versionada para o deploy final; o site oficial nao e publicado nesta etapa.

create or replace function public.sync_paid_iss_return_to_analysis_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _tenant_id uuid;
  _municipality_id uuid;
  _analyst text;
  _actor_profile_id uuid := public.current_profile_id();
begin
  if new.process_id is null or coalesce(new.guide_kind,'') <> 'iss_obra' then
    return new;
  end if;

  if not (
    coalesce(new.paid,false) = true
    or coalesce(new.status,'') in ('compensada','confirmed','paid')
  ) then
    return new;
  end if;

  if (
    coalesce(old.paid,false) = true
    or coalesce(old.status,'') in ('compensada','confirmed','paid')
  ) then
    return new;
  end if;

  select p.tenant_id, p.municipality_id, p.analysis_assigned_to
    into _tenant_id, _municipality_id, _analyst
  from public.processes p
  where p.id = new.process_id
  for update;

  if _tenant_id is null then
    return new;
  end if;

  update public.interdepartmental_dispatches
     set status='concluido',
         completed_at=coalesce(completed_at,coalesce(new.paid_at,now())),
         response=coalesce(
           response,
           'Pagamento compensado; processo retornado automaticamente à Análise Urbanística.'
         )
   where process_id=new.process_id
     and to_department='Financeiro'
     and status in ('aguardando','respondido')
     and (
       subject ilike '%ISS%'
       or subject ilike '%Projeto%'
       or subject ilike '%controle financeiro%'
     );

  if not exists (
    select 1
    from public.interdepartmental_dispatches d
    where d.process_id=new.process_id
      and d.from_department='Financeiro'
      and d.to_department='Análise Urbanística'
      and d.subject='Retorno automático após compensação da Guia de ISSQN / Projeto'
      and d.created_at >= coalesce(new.paid_at,now()) - interval '5 minutes'
  ) then
    insert into public.interdepartmental_dispatches(
      tenant_id,
      process_id,
      from_department,
      to_department,
      subject,
      created_by_profile_id,
      created_at,
      visibility,
      municipality_id,
      status,
      priority,
      assigned_to,
      completed_at,
      response
    )
    values(
      _tenant_id,
      new.process_id,
      'Financeiro',
      'Análise Urbanística',
      'Retorno automático após compensação da Guia de ISSQN / Projeto',
      _actor_profile_id,
      coalesce(new.paid_at,now()),
      'interno',
      _municipality_id,
      'concluido',
      'media',
      nullif(btrim(_analyst),''),
      coalesce(new.paid_at,now()),
      'Pagamento compensado. Processo devolvido à mesa técnica para continuidade da análise.'
    );
  end if;

  update public.processes
     set status='analise_tecnica'::public.process_status,
         current_department='Análise Urbanística',
         current_queue='Análise Urbanística',
         sla_stage='Análise Urbanística após ISSQN',
         sla_breached=false,
         updated_at=greatest(updated_at,coalesce(new.paid_at,now()))
   where id=new.process_id;

  if not exists (
    select 1
    from public.process_audit_entries a
    where a.process_id=new.process_id
      and a.title='Retorno automático à Análise Urbanística'
      and a.created_at >= coalesce(new.paid_at,now()) - interval '5 minutes'
  ) then
    insert into public.process_audit_entries(
      tenant_id,
      process_id,
      category,
      title,
      detail,
      visible_to_external,
      created_at,
      municipality_id,
      actor_profile_id
    )
    values(
      _tenant_id,
      new.process_id,
      'financeiro',
      'Retorno automático à Análise Urbanística',
      'Após a compensação da Guia de ISSQN / Projeto, o processo retornou automaticamente à mesa técnica.',
      false,
      coalesce(new.paid_at,now()),
      _municipality_id,
      _actor_profile_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_paid_iss_return_to_analysis_v1() from public;

drop trigger if exists trg_sync_paid_iss_return_to_analysis_v1
  on public.payment_guides;

create trigger trg_sync_paid_iss_return_to_analysis_v1
after update of paid, status on public.payment_guides
for each row
execute function public.sync_paid_iss_return_to_analysis_v1();

notify pgrst, 'reload schema';
