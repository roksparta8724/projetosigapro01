-- SIGAPRO: sincroniza no código a confirmação de pagamento já validada em produção.
create or replace function public.confirm_process_payment_guide(_process_id uuid, _guide_kind text)
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
  _from_status public.process_status;
  _to_status public.process_status;
  _guide public.payment_guides%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido';
  end if;

  select p.tenant_id,p.municipality_id,p.status
    into _tenant_id,_municipality_id,_from_status
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para confirmar pagamento';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
  limit 1;

  if _guide.id is null then
    raise exception 'Guia nao encontrada para este processo';
  end if;

  if coalesce(_guide.paid,false)=true
     or coalesce(_guide.status,'') in ('compensada','confirmed','paid') then
    raise exception 'Guia ja esta paga';
  end if;

  _to_status :=
    case _guide_kind
      when 'protocolo' then 'analise_tecnica'::public.process_status
      when 'iss_obra' then 'analise_tecnica'::public.process_status
      when 'aprovacao_final' then 'deferido'::public.process_status
    end;

  update public.payment_guides
     set paid=true,
         paid_at=now(),
         status='compensada'
   where id=_guide.id
   returning * into _guide;

  update public.processes
     set status=_to_status,
         triage_status=
           case
             when _guide_kind='protocolo' then 'concluido'
             else triage_status
           end,
         current_department=
           case
             when _guide_kind in ('protocolo','iss_obra') then 'Análise Técnica'
             else 'Processo concluído'
           end,
         current_queue=
           case
             when _guide_kind in ('protocolo','iss_obra') then 'Análise Técnica'
             else 'Concluído'
           end,
         sla_stage=
           case
             when _guide_kind='protocolo' then 'analise tecnica'
             when _guide_kind='iss_obra' then 'analise tecnica apos issqn'
             else 'habite-se e aprovacao final'
           end,
         sla_breached=false,
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'payment_confirmed',
    _from_status,_to_status,
    'Pagamento confirmado: '||_guide_kind,
    now(),true,_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'financeiro',
    'Pagamento confirmado',
    'Guia '||_guide_kind||' confirmada e compensada.',
    true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'from_status',_from_status::text,
    'to_status',_to_status::text,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.confirm_process_payment_guide(uuid,text) from public;
grant execute on function public.confirm_process_payment_guide(uuid,text) to authenticated;
