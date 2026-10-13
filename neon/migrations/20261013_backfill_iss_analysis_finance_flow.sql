-- SIGAPRO: corrige histórico de tramitação para guias ISS já emitidas
-- e mantém dados da guia ocultos do acesso externo até liberação manual.

insert into public.interdepartmental_dispatches(
  tenant_id,municipality_id,process_id,from_department,to_department,
  subject,due_at,status,visibility,priority,created_by,created_by_profile_id,created_at
)
select
  p.tenant_id,
  coalesce(p.municipality_id,p.tenant_id),
  p.id,
  'Análise Urbanística',
  'Financeiro',
  'Guia de ISSQN / Projeto emitida — controle financeiro',
  coalesce(g.due_date::timestamptz,g.created_at::timestamptz + interval '2 days'),
  'aguardando',
  'interno',
  'media',
  pr.user_id,
  p.analysis_assigned_to_profile_id,
  g.created_at::timestamptz
from public.processes p
join public.payment_guides g on g.process_id=p.id and g.guide_kind='iss_obra'
left join public.profiles pr on pr.id=p.analysis_assigned_to_profile_id
where p.analysis_started_at is not null
  and not exists(
    select 1 from public.interdepartmental_dispatches d
    where d.process_id=p.id
      and lower(coalesce(d.to_department,'')) like '%financ%'
  );

update public.process_audit_entries a
set visible_to_external=false
where a.title ilike '%Guia ISSQN / Projeto emitida%'
  and exists(
    select 1 from public.payment_guides g
    where g.process_id=a.process_id and g.guide_kind='iss_obra'
  )
  and not exists(
    select 1 from public.process_messages m
    join public.payment_guides g on g.process_id=m.process_id and g.guide_kind='iss_obra'
    where m.process_id=a.process_id
      and m.audience in ('externo','misto')
      and position(coalesce(g.guide_number,'') in coalesce(m.message,'')) > 0
  );

update public.process_movements mv
set visible_to_external=false
where mv.movement_type='guia_emitida'
  and mv.description ilike '%ISSQN / Projeto%'
  and not exists(
    select 1 from public.process_messages m
    join public.payment_guides g on g.process_id=m.process_id and g.guide_kind='iss_obra'
    where m.process_id=mv.process_id
      and m.audience in ('externo','misto')
      and position(coalesce(g.guide_number,'') in coalesce(m.message,'')) > 0
  );
