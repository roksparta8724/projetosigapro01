-- Serialize requirement mutations; retain existing tenant and administrator guards.
CREATE OR REPLACE FUNCTION public.complete_process_requirement(_requirement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _process_id uuid;
  _status text;
  _requirement public.process_requirements%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select pr.process_id,pr.status
    into _process_id,_status
  from public.process_requirements pr
  where pr.id=_requirement_id;

  perform 1 from public.processes p where p.id=_process_id for update;
  select pr.* into _requirement from public.process_requirements pr where pr.id=_requirement_id and pr.process_id=_process_id for update;
  if not found then raise exception 'Exigência não encontrada.'; end if;
  _status:=_requirement.status;

  if _process_id is null then
    raise exception 'Exigencia nao encontrada';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para concluir exigencia';
  end if;

  if exists (select 1 from public.processes p where p.id=_process_id and p.status in ('deferido','indeferido','arquivado')) then
    raise exception 'Processo concluído. Reabra formalmente o processo antes de alterar exigências.' using errcode='42501';
  end if;
  if public.process_is_in_analysis_area(_process_id) and not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente a equipe autorizada da Análise Urbanística pode concluir exigências nesta etapa.' using errcode='42501';
  end if;
  if _status not in ('aberta','respondida') then
    raise exception 'Exigencia nao pode ser concluida neste estado';
  end if;

  update public.process_requirements
     set status='atendida'
   where id=_requirement_id
   returning * into _requirement;

  return jsonb_build_object(
    'requirement',to_jsonb(_requirement),
    'process_id',_process_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_process_requirement(_process_id uuid, _title text, _description text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _target_name text DEFAULT NULL::text, _visibility text DEFAULT 'misto'::text)
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
  _requirement public.process_requirements%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_title),'') is null or nullif(btrim(_description),'') is null then
    raise exception 'Titulo e descricao sao obrigatorios';
  end if;

  if _visibility not in ('interno','externo','misto') then
    raise exception 'Visibilidade invalida';
  end if;

  select p.tenant_id,p.municipality_id
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para criar exigencia';
  end if;

  if exists (select 1 from public.processes p where p.id=_process_id and p.status in ('deferido','indeferido','arquivado')) then
    raise exception 'Processo concluído. Reabra formalmente o processo antes de alterar exigências.' using errcode='42501';
  end if;
  if public.process_is_in_analysis_area(_process_id) and not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente a equipe autorizada da Análise Urbanística pode emitir exigências nesta etapa.' using errcode='42501';
  end if;
  insert into public.process_requirements(
    tenant_id,process_id,title,description,status,visibility,target_name,
    created_by,created_at,due_at,municipality_id,created_by_profile_id
  )
  values(
    _tenant_id,_process_id,btrim(_title),btrim(_description),'aberta',
    _visibility,nullif(btrim(_target_name),''),
    _legacy_user_id,now(),_due_at,_municipality_id,_profile_id
  )
  returning * into _requirement;

  update public.processes
     set status='exigencia'::public.process_status,
         updated_at=now()
   where id=_process_id;

  return jsonb_build_object(
    'requirement',to_jsonb(_requirement),
    'process_id',_process_id,
    'process_status','exigencia'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_process_requirement(_requirement_id uuid, _response text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _process_id uuid;
  _status text;
  _requirement public.process_requirements%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_response),'') is null then
    raise exception 'Resposta obrigatoria';
  end if;

  select pr.process_id,pr.status
    into _process_id,_status
  from public.process_requirements pr
  where pr.id=_requirement_id;

  perform 1 from public.processes p where p.id=_process_id for update;
  select pr.* into _requirement from public.process_requirements pr where pr.id=_requirement_id and pr.process_id=_process_id for update;
  if not found then raise exception 'Exigência não encontrada.'; end if;
  _status:=_requirement.status;

  if _process_id is null then
    raise exception 'Exigencia nao encontrada';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if exists (select 1 from public.processes p where p.id=_process_id and p.status in ('deferido','indeferido','arquivado')) then
    raise exception 'Processo concluído. Reabra formalmente o processo antes de alterar exigências.' using errcode='42501';
  end if;
  if lower(coalesce(public.current_role_code(),'')) in ('profissional_externo','proprietario_consulta') then
    if _requirement.visibility not in ('externo','misto') then
      raise exception 'Exigência interna não admite resposta externa.' using errcode='42501';
    end if;
  elsif public.is_master() or public.is_internal_municipality_role() then
    if public.process_is_in_analysis_area(_process_id) and not public.can_write_process_analysis(_process_id) then
      raise exception 'Somente a equipe autorizada da Análise Urbanística pode responder nesta etapa.' using errcode='42501';
    end if;
  else
    raise exception 'Perfil sem autorização para responder à exigência.' using errcode='42501';
  end if;
  if _status not in ('aberta','respondida') then
    raise exception 'Exigencia nao aceita resposta neste estado';
  end if;

  update public.process_requirements
     set status='respondida',
         response=btrim(_response),
         response_by=_legacy_user_id,
         response_by_profile_id=_profile_id,
         responded_at=now()
   where id=_requirement_id
   returning * into _requirement;

  return jsonb_build_object(
    'requirement',to_jsonb(_requirement),
    'process_id',_process_id
  );
end;
$function$;
