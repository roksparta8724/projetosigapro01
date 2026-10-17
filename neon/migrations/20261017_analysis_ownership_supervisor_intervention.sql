-- SIGAPRO: bloqueio de autoria da análise + supervisão auditada.
-- Regra:
-- 1) Analista escreve somente no processo atribuído ao próprio profile_id.
-- 2) Outro analista acompanha em leitura, mas não altera.
-- 3) Diretor/supervisor do setor acompanha toda a fila e assina normalmente.
-- 4) Para editar análise alheia, a Diretoria precisa iniciar intervenção explícita,
--    com motivo, prazo e auditoria; a titularidade do analista não é sobrescrita.
-- 5) Reatribuição é uma ação separada e auditada.

alter table public.processes
  add column if not exists analysis_override_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists analysis_override_reason text,
  add column if not exists analysis_override_started_at timestamptz,
  add column if not exists analysis_override_expires_at timestamptz;

create index if not exists idx_processes_analysis_override_profile_id
  on public.processes(analysis_override_profile_id)
  where analysis_override_profile_id is not null;

create or replace function public.operational_area_from_label(_value text)
returns text
language sql
immutable
as $function$
  select case
    when regexp_replace(
      translate(lower(coalesce(_value,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+',' ','g'
    ) ~ '(protocolo|protocol|triagem|recepcao|administracao|administrativo|expediente|atendimento)'
      then 'protocolos'
    when regexp_replace(
      translate(lower(coalesce(_value,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+',' ','g'
    ) ~ '(finance|financa|fazenda|tribut|arrecad)'
      then 'financeiro'
    when regexp_replace(
      translate(lower(coalesce(_value,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+',' ','g'
    ) ~ '(analise|urbanismo|urbanistic|obra|engenharia|planejamento|licenciamento|aprovacao|fiscal|fiscalizacao|postura|topografia|cadista)'
      then 'analise'
    else regexp_replace(
      translate(lower(coalesce(_value,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+',' ','g'
    )
  end;
$function$;

create or replace function public.profile_operational_area(_profile_id uuid)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select coalesce(
    nullif(public.operational_area_from_label(d.name),''),
    nullif(public.operational_area_from_label(tm.department),''),
    nullif(public.operational_area_from_label(tm.position_title),''),
    case
      when p.role='analista' then 'analise'
      when p.role in ('financeiro') then 'financeiro'
      when p.role='setor_intersetorial' then 'protocolos'
      else ''
    end
  )
  from public.profiles p
  left join public.departments d on d.id=p.department_id
  left join lateral (
    select m.department,m.position_title
    from public.tenant_memberships m
    where m.profile_id=p.id
      and m.is_active=true
      and m.deleted_at is null
    order by m.updated_at desc nulls last,m.created_at desc
    limit 1
  ) tm on true
  where p.id=_profile_id
    and p.deleted_at is null;
$function$;

create or replace function public.process_is_in_analysis_area(_process_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select coalesce((
    select
      public.operational_area_from_label(
        coalesce(nullif(p.current_department,''),nullif(p.current_queue,''),nullif(p.sla_stage,''))
      )='analise'
      or (
        coalesce(nullif(p.current_department,''),nullif(p.current_queue,''),nullif(p.sla_stage,'')) is null
        and p.status in (
          'distribuicao'::public.process_status,
          'analise_tecnica'::public.process_status,
          'exigencia'::public.process_status,
          'reapresentacao'::public.process_status
        )
      )
    from public.processes p
    where p.id=_process_id
  ),false);
$function$;

create or replace function public.can_supervise_process_analysis(_process_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text;
  _actor_municipality uuid;
  _process_municipality uuid;
begin
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.role,p.municipality_id
    into _actor_role,_actor_municipality
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_role <> 'prefeitura_supervisor' then return false; end if;
  if public.profile_operational_area(_actor) <> 'analise' then return false; end if;

  select coalesce(p.municipality_id,p.tenant_id)
    into _process_municipality
  from public.processes p
  where p.id=_process_id;

  return _process_municipality is not null
     and _actor_municipality=_process_municipality;
end;
$function$;

create or replace function public.can_write_process_analysis(_process_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text;
  _actor_municipality uuid;
  _process_municipality uuid;
  _assignee uuid;
  _override_profile uuid;
  _override_expires timestamptz;
begin
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.role,p.municipality_id
    into _actor_role,_actor_municipality
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  select coalesce(p.municipality_id,p.tenant_id),
         p.analysis_assigned_to_profile_id,
         p.analysis_override_profile_id,
         p.analysis_override_expires_at
    into _process_municipality,_assignee,_override_profile,_override_expires
  from public.processes p
  where p.id=_process_id;

  if _process_municipality is null
     or _actor_municipality is distinct from _process_municipality then
    return false;
  end if;

  if _actor_role='analista' then
    return _assignee=_actor;
  end if;

  if _actor_role='prefeitura_supervisor'
     and public.can_supervise_process_analysis(_process_id) then
    return _override_profile=_actor
       and _override_expires is not null
       and _override_expires>now();
  end if;

  return false;
end;
$function$;

create or replace function public.begin_analysis_supervisor_intervention(
  _process_id uuid,
  _reason text,
  _minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_name text;
  _tenant_id uuid;
  _municipality_id uuid;
  _assignee_name text;
  _expires timestamptz;
begin
  if _actor is null then raise exception 'Usuario nao autenticado'; end if;
  if not public.can_supervise_process_analysis(_process_id) and not public.is_master() then
    raise exception 'Somente a Diretoria responsável pode intervir nesta análise';
  end if;
  if nullif(btrim(_reason),'') is null or length(btrim(_reason))<8 then
    raise exception 'Informe um motivo objetivo para a intervenção (mínimo 8 caracteres)';
  end if;

  _minutes := greatest(5,least(coalesce(_minutes,30),60));
  _expires := now()+make_interval(mins=>_minutes);

  select p.tenant_id,p.municipality_id,p.analysis_assigned_to
    into _tenant_id,_municipality_id,_assignee_name
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then raise exception 'Processo nao encontrado'; end if;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Diretoria')
    into _actor_name
  from public.profiles p
  where p.id=_actor;

  update public.processes
     set analysis_override_profile_id=_actor,
         analysis_override_reason=btrim(_reason),
         analysis_override_started_at=now(),
         analysis_override_expires_at=_expires,
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,category,title,detail,visible_to_external,
    created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,'supervisao','Intervenção da Diretoria iniciada',
    coalesce(_actor_name,'Diretoria')||
      ' iniciou intervenção auditada sem alterar o responsável técnico'||
      case when nullif(btrim(coalesce(_assignee_name,'')),'') is not null
           then ' ('||_assignee_name||')' else '' end||
      '. Motivo: '||btrim(_reason)||'. Prazo: '||_minutes||' min.',
    false,now(),_municipality_id,_actor
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'profile_id',_actor,
    'reason',btrim(_reason),
    'started_at',now(),
    'expires_at',_expires,
    'minutes',_minutes
  );
end;
$function$;

create or replace function public.end_analysis_supervisor_intervention(
  _process_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _override_profile uuid;
  _reason text;
begin
  if _actor is null then raise exception 'Usuario nao autenticado'; end if;

  select p.tenant_id,p.municipality_id,p.analysis_override_profile_id,p.analysis_override_reason
    into _tenant_id,_municipality_id,_override_profile,_reason
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then raise exception 'Processo nao encontrado'; end if;

  if not public.is_master() and _override_profile is distinct from _actor then
    raise exception 'Somente quem iniciou a intervenção pode encerrá-la';
  end if;

  update public.processes
     set analysis_override_profile_id=null,
         analysis_override_reason=null,
         analysis_override_started_at=null,
         analysis_override_expires_at=null,
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,category,title,detail,visible_to_external,
    created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,'supervisao','Intervenção da Diretoria encerrada',
    'Intervenção auditada encerrada. Motivo original: '||coalesce(_reason,'não informado')||'.',
    false,now(),_municipality_id,_actor
  );

  return jsonb_build_object('process_id',_process_id,'ended',true);
end;
$function$;

create or replace function public.reassign_process_analysis(
  _process_id uuid,
  _target_profile_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _old_profile uuid;
  _old_name text;
  _target_name text;
  _target_role text;
  _target_municipality uuid;
begin
  if _actor is null then raise exception 'Usuario nao autenticado'; end if;
  if not public.can_supervise_process_analysis(_process_id) and not public.is_master() then
    raise exception 'Somente a Diretoria responsável pode redistribuir esta análise';
  end if;
  if nullif(btrim(_reason),'') is null or length(btrim(_reason))<8 then
    raise exception 'Informe o motivo da redistribuição (mínimo 8 caracteres)';
  end if;

  select p.tenant_id,p.municipality_id,p.analysis_assigned_to_profile_id,p.analysis_assigned_to
    into _tenant_id,_municipality_id,_old_profile,_old_name
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then raise exception 'Processo nao encontrado'; end if;

  select p.full_name,p.role,p.municipality_id
    into _target_name,_target_role,_target_municipality
  from public.profiles p
  where p.id=_target_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _target_name is null then raise exception 'Analista de destino nao encontrado ou inativo'; end if;
  if _target_role <> 'analista' then raise exception 'A análise técnica só pode ser atribuída a perfil Analista'; end if;
  if _target_municipality is distinct from _municipality_id then
    raise exception 'O analista pertence a outra Prefeitura';
  end if;
  if public.profile_operational_area(_target_profile_id) <> 'analise' then
    raise exception 'O analista não pertence à unidade de Urbanismo/Análise';
  end if;

  update public.processes
     set analysis_assigned_to_profile_id=_target_profile_id,
         analysis_assigned_to=_target_name,
         analysis_started_at=coalesce(analysis_started_at,now()),
         analysis_override_profile_id=null,
         analysis_override_reason=null,
         analysis_override_started_at=null,
         analysis_override_expires_at=null,
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,category,title,detail,visible_to_external,
    created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,'supervisao','Análise redistribuída pela Diretoria',
    'Responsável alterado de '||coalesce(nullif(_old_name,''),'não atribuído')||
      ' para '||_target_name||'. Motivo: '||btrim(_reason)||'.',
    false,now(),_municipality_id,_actor
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'previous_profile_id',_old_profile,
    'assigned_profile_id',_target_profile_id,
    'assigned_to',_target_name
  );
end;
$function$;

create or replace function public.guard_analysis_document_write()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and (
       public.process_is_in_analysis_area(new.process_id)
       or exists (
         select 1
         from public.processes p
         where p.id=new.process_id
           and p.analysis_assigned_to_profile_id is not null
       )
     )
     and (
       new.review_status is distinct from old.review_status
       or new.annotations is distinct from old.annotations
     )
     and not public.can_write_process_analysis(new.process_id) then
    raise exception 'Processo em análise por outro servidor. Abra em modo acompanhamento ou use intervenção auditada da Diretoria.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_analysis_document_write on public.process_documents;
create trigger trg_guard_analysis_document_write
before update of review_status,annotations on public.process_documents
for each row execute function public.guard_analysis_document_write();

create or replace function public.guard_analysis_requirement_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and public.process_is_in_analysis_area(new.process_id)
     and not public.can_write_process_analysis(new.process_id) then
    raise exception 'Somente o analista responsável ou a Diretoria em intervenção auditada pode criar exigência nesta análise.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_analysis_requirement_insert on public.process_requirements;
create trigger trg_guard_analysis_requirement_insert
before insert on public.process_requirements
for each row execute function public.guard_analysis_requirement_insert();

create or replace function public.guard_analysis_dispatch_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and public.process_is_in_analysis_area(new.process_id)
     and not public.can_write_process_analysis(new.process_id) then
    raise exception 'Somente o analista responsável ou a Diretoria em intervenção auditada pode despachar este processo.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_analysis_dispatch_insert on public.interdepartmental_dispatches;
create trigger trg_guard_analysis_dispatch_insert
before insert on public.interdepartmental_dispatches
for each row execute function public.guard_analysis_dispatch_insert();

create or replace function public.guard_analysis_process_update()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  -- A assunção inicial usa start_process_analysis e grava o próprio responsável
  -- no mesmo UPDATE; ela continua permitida quando o processo ainda não tem dono.
  if public.current_profile_id() is not null
     and old.analysis_assigned_to_profile_id is not null
     and public.process_is_in_analysis_area(old.id)
     and (
       new.status is distinct from old.status
       or new.current_department is distinct from old.current_department
       or new.current_queue is distinct from old.current_queue
       or new.analysis_assigned_to_profile_id is distinct from old.analysis_assigned_to_profile_id
     )
     and not public.can_write_process_analysis(old.id)
     and not (
       public.can_supervise_process_analysis(old.id)
       and new.analysis_assigned_to_profile_id is distinct from old.analysis_assigned_to_profile_id
     ) then
    raise exception 'Este processo pertence a outro analista. Para alterar o fluxo, use intervenção ou redistribuição auditada.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_analysis_process_update on public.processes;
create trigger trg_guard_analysis_process_update
before update of status,current_department,current_queue,analysis_assigned_to_profile_id
on public.processes
for each row execute function public.guard_analysis_process_update();

grant execute on function public.operational_area_from_label(text) to authenticated;
grant execute on function public.profile_operational_area(uuid) to authenticated;
grant execute on function public.process_is_in_analysis_area(uuid) to authenticated;
grant execute on function public.can_supervise_process_analysis(uuid) to authenticated;
grant execute on function public.can_write_process_analysis(uuid) to authenticated;
grant execute on function public.begin_analysis_supervisor_intervention(uuid,text,integer) to authenticated;
grant execute on function public.end_analysis_supervisor_intervention(uuid) to authenticated;
grant execute on function public.reassign_process_analysis(uuid,uuid,text) to authenticated;
