-- SIGAPRO 2026-10-14
-- Fluxo canonico da Guia ISSQN / Projeto:
-- 1. A Analise Urbanistica pode emitir/revisar a guia internamente.
-- 2. A emissao NAO transfere o processo e NAO libera a cobranca ao externo.
-- 3. Somente a acao explicita "Revisado — enviar ao profissional" libera a guia
--    e transfere a etapa operacional para o Financeiro.
-- 4. A guia de protocolo continua visivel automaticamente ao acesso externo.

drop policy if exists payment_guides_select_scoped on public.payment_guides;

create policy payment_guides_select_scoped
on public.payment_guides
for select
to authenticated
using (
  public.is_master()
  or public.is_internal_municipality_role()
  or (
    public.has_process_access(process_id)
    and (
      coalesce(guide_kind, 'protocolo') = 'protocolo'
      or exists (
        select 1
        from public.process_messages m
        where m.process_id = payment_guides.process_id
          and m.audience in ('externo', 'misto')
          and nullif(btrim(payment_guides.guide_number), '') is not null
          and position(payment_guides.guide_number in coalesce(m.message, '')) > 0
      )
    )
  )
);

create or replace function public.share_iss_project_guide_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := coalesce(public.current_role_code(),'');
  _tenant_id uuid;
  _municipality_id uuid;
  _analysis_profile_id uuid;
  _professional_name text;
  _sender_name text;
  _sender_role text;
  _from_status public.process_status;
  _from_department text;
  _from_queue text;
  _guide public.payment_guides%rowtype;
  _message public.process_messages%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select p.tenant_id,p.municipality_id,p.analysis_assigned_to_profile_id,
         p.status,p.current_department,p.current_queue
    into _tenant_id,_municipality_id,_analysis_profile_id,
         _from_status,_from_department,_from_queue
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura')
    or (
      _role_code in ('analista','analyst','prefeitura_supervisor')
      and (_analysis_profile_id is null or _analysis_profile_id=_profile_id)
    )
  ) then
    raise exception 'Somente o analista responsavel pode enviar esta guia ao profissional';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind='iss_obra'
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia de ISSQN / Projeto nao encontrada';
  end if;

  if exists(
    select 1
    from public.process_messages m
    where m.process_id=_process_id
      and m.audience in ('externo','misto')
      and position(coalesce(_guide.guide_number,'') in coalesce(m.message,'')) > 0
  ) then
    return jsonb_build_object(
      'process_id',_process_id,
      'already_shared',true,
      'guide_number',_guide.guide_number
    );
  end if;

  select pp.display_name
    into _professional_name
  from public.process_parties pp
  where pp.process_id=_process_id
    and pp.party_type='profissional_externo'
  limit 1;

  select
    coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Usuario'),
    coalesce(public.current_role_code(),p.role,'usuario')
    into _sender_name,_sender_role
  from public.profiles p
  where p.id=_profile_id;

  insert into public.process_messages(
    tenant_id,municipality_id,process_id,sender_user_id,sender_profile_id,
    sender_name,sender_role,audience,recipient_name,message,created_at
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_legacy_user_id,_profile_id,
    _sender_name,_sender_role,'externo',nullif(btrim(_professional_name),''),
    'Guia de ISSQN / Projeto revisada e liberada pelo analista: '||
      coalesce(_guide.guide_number,'')||', valor R$ '||
      to_char(_guide.amount,'FM999999990D00')||', vencimento '||
      to_char(_guide.due_date,'DD/MM/YYYY')||'.',
    now()
  )
  returning * into _message;

  if lower(coalesce(_from_department,'')) not like '%financ%' then
    insert into public.interdepartmental_dispatches(
      tenant_id,municipality_id,process_id,from_department,to_department,
      subject,due_at,status,visibility,priority,created_by,created_by_profile_id,created_at
    )
    values(
      _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,
      coalesce(nullif(btrim(_from_department),''),'Análise Urbanística'),
      'Financeiro',
      'Guia de ISSQN / Projeto liberada ao profissional — controle financeiro',
      _guide.due_date::timestamptz,
      'aguardando','interno','media',
      _legacy_user_id,_profile_id,now()
    );
  end if;

  update public.processes
     set status='pagamento_pendente',
         current_department='Financeiro',
         current_queue='Financeiro',
         sla_stage='ISSQN / Projeto aguardando pagamento',
         sla_due_at=coalesce(_guide.due_date::timestamptz,sla_due_at),
         sla_breached=false,
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_liberada',
    _from_status,'pagamento_pendente',
    'Guia de ISSQN / Projeto liberada ao profissional e encaminhada ao Financeiro para controle.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_legacy_user_id,_profile_id,
    'mensagem','Guia ISSQN / Projeto enviada ao profissional',
    'A versao vigente '||coalesce(_guide.guide_number,'')||
      ' foi liberada manualmente pelo analista responsavel.',
    true,now()
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'already_shared',false,
    'guide_number',_guide.guide_number,
    'message',to_jsonb(_message),
    'from_department',_from_department,
    'to_department','Financeiro'
  );
end;
$function$;

-- Compatibilidade segura com a funcao de emissao ja validada:
-- a v3 reaproveita todas as validacoes da v2, mas restaura a etapa operacional
-- quando a guia ISS acabou de ser apenas emitida internamente.
create or replace function public.issue_process_payment_guide_v3(
  _process_id uuid,
  _guide_kind text,
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _before_status public.process_status;
  _before_department text;
  _before_queue text;
  _before_sla_stage text;
  _before_sla_due_at timestamptz;
  _before_sla_breached boolean;
  _result jsonb;
begin
  select status,current_department,current_queue,sla_stage,sla_due_at,sla_breached
    into _before_status,_before_department,_before_queue,_before_sla_stage,_before_sla_due_at,_before_sla_breached
  from public.processes
  where id=_process_id
  for update;

  if _before_status is null then
    raise exception 'Processo nao encontrado';
  end if;

  _result := public.issue_process_payment_guide_v2(_process_id,_guide_kind,_due_date);

  if _guide_kind='iss_obra'
     and coalesce((_result->>'existing')::boolean,false)=false then
    update public.processes
       set status=_before_status,
           current_department=_before_department,
           current_queue=_before_queue,
           sla_stage=_before_sla_stage,
           sla_due_at=_before_sla_due_at,
           sla_breached=_before_sla_breached,
           updated_at=now()
     where id=_process_id;

    delete from public.interdepartmental_dispatches
     where process_id=_process_id
       and subject='Guia de ISSQN / Projeto emitida — controle financeiro'
       and status='aguardando'
       and created_at >= now() - interval '2 minutes';

    delete from public.process_movements
     where process_id=_process_id
       and movement_type='guia_emitida'
       and visible_to_external=false
       and created_at >= now() - interval '2 minutes';
  end if;

  return _result;
end;
$function$;

-- Remove o despacho/movimento tecnico criado pelo comportamento antigo apenas
-- quando a guia ainda nao foi liberada ao profissional.
delete from public.interdepartmental_dispatches d
where d.subject='Guia de ISSQN / Projeto emitida — controle financeiro'
  and d.status in ('aguardando','respondido')
  and exists (
    select 1
    from public.payment_guides g
    join public.processes p on p.id=g.process_id
    where g.process_id=d.process_id
      and g.guide_kind='iss_obra'
      and coalesce(g.paid,false)=false
      and lower(coalesce(p.process_checkpoint,'')) like '%an%lise%urban%'
      and not exists (
        select 1
        from public.process_messages m
        where m.process_id=p.id
          and m.audience in ('externo','misto')
          and nullif(btrim(g.guide_number),'') is not null
          and position(g.guide_number in coalesce(m.message,'')) > 0
      )
  );

delete from public.process_movements pm
where pm.movement_type='guia_emitida'
  and pm.visible_to_external=false
  and exists (
    select 1
    from public.payment_guides g
    join public.processes p on p.id=g.process_id
    where g.process_id=pm.process_id
      and g.guide_kind='iss_obra'
      and coalesce(g.paid,false)=false
      and lower(coalesce(p.process_checkpoint,'')) like '%an%lise%urban%'
      and not exists (
        select 1
        from public.process_messages m
        where m.process_id=p.id
          and m.audience in ('externo','misto')
          and nullif(btrim(g.guide_number),'') is not null
          and position(g.guide_number in coalesce(m.message,'')) > 0
      )
  );

-- Repara apenas processos que comprovadamente foram deslocados cedo demais:
-- ISS pendente + checkpoint de Analise Urbanistica + nenhuma liberacao externa.
update public.processes p
set status='analise_tecnica',
    current_department='Análise Urbanística',
    current_queue='Análise Urbanística',
    sla_stage='Análise Urbanística em andamento',
    sla_breached=false,
    updated_at=now()
where p.status='pagamento_pendente'
  and lower(coalesce(p.current_department,'')) like '%financ%'
  and lower(coalesce(p.process_checkpoint,'')) like '%an%lise%urban%'
  and exists (
    select 1 from public.payment_guides g
    where g.process_id=p.id
      and g.guide_kind='iss_obra'
      and coalesce(g.paid,false)=false
  )
  and not exists (
    select 1
    from public.payment_guides g
    join public.process_messages m on m.process_id=p.id
    where g.process_id=p.id
      and g.guide_kind='iss_obra'
      and m.audience in ('externo','misto')
      and nullif(btrim(g.guide_number),'') is not null
      and position(g.guide_number in coalesce(m.message,'')) > 0
  );

notify pgrst, 'reload schema';
