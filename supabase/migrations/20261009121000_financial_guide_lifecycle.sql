-- SIGAPRO: ciclo financeiro oficial por processo.
-- Guias futuras só existem quando explicitamente emitidas.

create or replace function public.issue_process_payment_guide(
  _process_id uuid,
  _guide_kind text,
  _amount numeric,
  _guide_prefix text default 'DAM',
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _protocol_number text;
  _guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date, current_date + 2);
  _prefix text := upper(regexp_replace(coalesce(nullif(_guide_prefix,''),'DAM'), '[^A-Za-z0-9]', '', 'g'));
  _kind_code text;
  _guide_number text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido para emissao por etapa';
  end if;

  if _amount is null or _amount < 0 then
    raise exception 'Valor da guia invalido';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id,p.protocol_number
    into _tenant_id,_municipality_id,_property_id,_protocol_number
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para emitir guia';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
  limit 1;

  if _guide.id is not null then
    return jsonb_build_object(
      'process_id',_process_id,
      'guide',to_jsonb(_guide),
      'existing',true
    );
  end if;

  _kind_code := case _guide_kind when 'iss_obra' then 'ISS' else 'APR' end;
  _guide_number := _prefix || '-' || _kind_code || '-' ||
                   regexp_replace(_protocol_number, '^[^-]+-', '');

  insert into public.payment_guides(
    tenant_id,municipality_id,process_id,property_id,
    guide_number,amount,due_date,status,paid,paid_at,guide_kind
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_property_id,
    _guide_number,_amount,_due,'pendente',false,null,_guide_kind
  )
  returning * into _guide;

  update public.processes
     set status='pagamento_pendente',
         current_department=case
           when _guide_kind='iss_obra' then 'Setor de IPTU / Fiscal'
           else 'Financeiro'
         end,
         current_queue=case
           when _guide_kind='iss_obra' then 'Setor de IPTU / Fiscal'
           else 'Financeiro'
         end,
         sla_stage=case
           when _guide_kind='iss_obra' then 'ISSQN aguardando pagamento'
           else 'Taxa final aguardando pagamento'
         end,
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_emitida',
    null,'pagamento_pendente',
    case
      when _guide_kind='iss_obra' then 'Guia de ISSQN da obra emitida.'
      else 'Guia final de aprovacao emitida.'
    end,
    true,coalesce(_municipality_id,_tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    case
      when _guide_kind='iss_obra' then 'Guia ISSQN emitida'
      else 'Guia final de aprovacao emitida'
    end,
    'Guia '||_guide_number||' emitida no valor de R$ '||to_char(_amount,'FM999999990D00')||'.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'existing',false
  );
end;
$function$;

create or replace function public.reissue_process_payment_guide(
  _process_id uuid,
  _guide_kind text,
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date,current_date + 2);
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido';
  end if;

  select p.tenant_id,p.municipality_id
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para reemitir guia';
  end if;

  update public.payment_guides
     set due_date=_due,
         status='pendente',
         paid=false,
         paid_at=null,
         created_at=now()
   where process_id=_process_id
     and guide_kind=_guide_kind
   returning * into _guide;

  if _guide.id is null then
    raise exception 'Guia nao encontrada para reemissao';
  end if;

  update public.processes
     set status='pagamento_pendente',
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia reemitida',
    'Segunda via da guia '||coalesce(_guide.guide_number,'')||
      ' emitida com vencimento em '||to_char(_due,'DD/MM/YYYY')||'.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide)
  );
end;
$function$;

revoke all on function public.issue_process_payment_guide(uuid,text,numeric,text,date) from public;
grant execute on function public.issue_process_payment_guide(uuid,text,numeric,text,date) to authenticated;

revoke all on function public.reissue_process_payment_guide(uuid,text,date) from public;
grant execute on function public.reissue_process_payment_guide(uuid,text,date) to authenticated;
