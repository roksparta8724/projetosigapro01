-- SIGAPRO — conclusão do Habite-se usando a RPC estável set_process_status.
-- Mantém o Data API no caminho já consolidado e aplica regra específica:
-- Analista responsável, Diretoria/Administração ou Master podem concluir.
-- O Alvará precisa estar emitido.

create or replace function public.set_process_status(
  _process_id uuid,
  _status_text text,
  _detail text,
  _title text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _to_status public.process_status;
  _process_type text;
  _role text := lower(coalesce(public.current_role_code(),''));
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

  select p.tenant_id,p.municipality_id,p.status,p.process_type
    into _tenant_id,_municipality_id,_from_status,_process_type
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

  if _to_status='arquivado'::public.process_status
     and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)' then
    if not (
      public.can_manage_habite_se_permit_v1(_process_id)
      or public.is_master()
      or _role in (
        'prefeitura_admin','prefeitura_supervisor',
        'diretor','director','prefeitura_diretor','prefeitura_diretora'
      )
    ) then
      raise exception 'Somente o Analista responsável, a Diretoria ou a Administração pode concluir este processo de Habite-se.';
    end if;

    if not exists (
      select 1
      from public.process_habite_se_permits hp
      where hp.process_id=_process_id
        and hp.status='emitido'
    ) then
      raise exception 'O Habite-se só pode ser concluído após a emissão válida do Alvará.';
    end if;
  end if;

  _effective_title := coalesce(nullif(btrim(_title),''),'Status atualizado');

  update public.processes
     set status=_to_status,
         current_department=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='deferido'::public.process_status then 'Processo concluído'
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Processo concluído'
             else current_department
           end,
         current_queue=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='deferido'::public.process_status then 'Concluído'
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Habite-se concluído e arquivado'
             else current_queue
           end,
         sla_stage=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Concluído'
             else replace(_to_status::text,'_',' ')
           end,
         process_checkpoint=
           case
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Processo de Habite-se concluído administrativamente'
             else process_checkpoint
           end,
         archived_at=
           case
             when _to_status='arquivado'::public.process_status
               then coalesce(archived_at,now())
             else archived_at
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
    _tenant_id,_process_id,_legacy_user_id,
    case
      when _to_status='arquivado'::public.process_status
           and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
        then 'habite_se_completed'
      else 'status_change'
    end,
    _from_status,_to_status,btrim(_detail),now(),
    true,_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,
    case
      when _to_status='arquivado'::public.process_status
           and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
        then 'habite_se'
      else 'status'
    end,
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
$function$;

notify pgrst, 'reload schema';
