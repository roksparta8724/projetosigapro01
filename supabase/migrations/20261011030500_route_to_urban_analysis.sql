-- SIGAPRO: rota oficialmente o protocolo pago para a Análise Urbanística.
-- Mantém status, fila, departamento e SLA coerentes em todos os pontos do fluxo.
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
             when _guide_kind in ('protocolo','iss_obra') then 'Análise Urbanística'
             else 'Processo concluído'
           end,
         current_queue=
           case
             when _guide_kind in ('protocolo','iss_obra') then 'Análise Urbanística'
             else 'Concluído'
           end,
         sla_stage=
           case
             when _guide_kind='protocolo' then 'Análise Urbanística'
             when _guide_kind='iss_obra' then 'Análise Urbanística após ISSQN'
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


-- Corrige processos já posicionados em análise, mas ainda presos à fila antiga do Protocolo.
update public.processes
set current_department = 'Análise Urbanística',
    current_queue = 'Análise Urbanística',
    sla_stage = 'Análise Urbanística',
    updated_at = now()
where status = 'analise_tecnica'::public.process_status
  and (
    current_department is null
    or lower(coalesce(current_department,'')) in ('protocolo','setor de protocolo','análise técnica','analise tecnica')
    or lower(coalesce(current_queue,'')) in ('protocolo','setor de protocolo','análise técnica','analise tecnica')
  );


-- Toda entrada em análise, inclusive por alteração manual de status, deve cair na fila urbanística.
CREATE OR REPLACE FUNCTION public.set_process_status(_process_id uuid, _status_text text, _detail text, _title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _to_status public.process_status;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
  _effective_title text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_status_text),'') is null then
    raise exception 'Status obrigatorio';
  end if;

  if nullif(btrim(_detail),'') is null then
    raise exception 'Detalhe da alteracao e obrigatorio';
  end if;

  begin
    _to_status := btrim(_status_text)::public.process_status;
  exception when invalid_text_representation then
    raise exception 'Status de processo invalido';
  end;

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
    raise exception 'Sem permissao para alterar status do processo';
  end if;

  if _from_status=_to_status then
    raise exception 'Processo ja esta neste status';
  end if;

  _effective_title :=
    coalesce(nullif(btrim(_title),''),'Status atualizado');

  update public.processes
     set status=_to_status,
         current_department=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='deferido'::public.process_status then 'Processo concluído'
             else current_department
           end,
         current_queue=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='deferido'::public.process_status then 'Concluído'
             else current_queue
           end,
         sla_stage=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             else replace(_to_status::text,'_',' ')
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
    _tenant_id,_process_id,_legacy_user_id,'status_change',
    _from_status,_to_status,btrim(_detail),now(),
    true,_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'status',
    _effective_title,btrim(_detail),
    true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'from_status',_from_status::text,
    'to_status',_to_status::text,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$

