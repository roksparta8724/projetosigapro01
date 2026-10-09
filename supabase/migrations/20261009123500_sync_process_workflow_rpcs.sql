-- SIGAPRO: sincroniza RPCs de workflow já validados em produção.

CREATE OR REPLACE FUNCTION public.acknowledge_process_dispatch(_dispatch_id uuid, _unit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _dispatch public.interdepartmental_dispatches%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select * into _dispatch
  from public.interdepartmental_dispatches
  where id=_dispatch_id;

  if _dispatch.id is null then
    raise exception 'Despacho nao encontrado';
  end if;

  if not public.has_process_access(_dispatch.process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para receber despacho';
  end if;

  if _dispatch.status<>'aguardando' then
    raise exception 'Despacho nao esta aguardando recebimento';
  end if;

  update public.interdepartmental_dispatches
     set status='respondido',
         acknowledged_at=now()
   where id=_dispatch_id
   returning * into _dispatch;

  update public.processes
     set current_department=coalesce(nullif(btrim(_unit),''),_dispatch.to_department),
         current_queue=coalesce(nullif(btrim(_unit),''),_dispatch.to_department),
         updated_at=now()
   where id=_dispatch.process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _dispatch.tenant_id,_dispatch.process_id,_legacy_user_id,
    'despacho','Recebimento confirmado',
    'Recebimento confirmado pela unidade '||
      coalesce(nullif(btrim(_unit),''),_dispatch.to_department)||'.',
    false,now(),_dispatch.municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'dispatch',to_jsonb(_dispatch),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.acknowledge_process_dispatch(uuid, text) from public;
grant execute on function public.acknowledge_process_dispatch(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.add_process_document_annotation(_document_id uuid, _x numeric, _y numeric, _note text)
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
  _tenant_id uuid;
  _municipality_id uuid;
  _author text;
  _annotation jsonb;
  _doc public.process_documents%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_note),'') is null then
    raise exception 'Anotacao obrigatoria';
  end if;

  if _x is null or _y is null or _x < 0 or _x > 100 or _y < 0 or _y > 100 then
    raise exception 'Coordenadas invalidas';
  end if;

  select d.process_id,d.tenant_id,d.municipality_id
    into _process_id,_tenant_id,_municipality_id
  from public.process_documents d
  where d.id=_document_id;

  if _process_id is null then
    raise exception 'Documento nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para anotar documento';
  end if;

  select coalesce(p.full_name,'Usuario')
    into _author
  from public.profiles p
  where p.id=_profile_id;

  _annotation := jsonb_build_object(
    'id',gen_random_uuid()::text,
    'x',_x,
    'y',_y,
    'note',btrim(_note),
    'author',coalesce(_author,'Usuario'),
    'authorProfileId',_profile_id,
    'createdAt',now()
  );

  update public.process_documents
     set annotations=coalesce(annotations,'[]'::jsonb) || jsonb_build_array(_annotation)
   where id=_document_id
   returning * into _doc;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'documento','Marcacao tecnica',
    'Anotacao tecnica registrada no documento.',
    false,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'document',to_jsonb(_doc),
    'annotation',_annotation,
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.add_process_document_annotation(uuid, numeric, numeric, text) from public;
grant execute on function public.add_process_document_annotation(uuid, numeric, numeric, text) to authenticated;

CREATE OR REPLACE FUNCTION public.complete_process_dispatch(_dispatch_id uuid, _unit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _dispatch public.interdepartmental_dispatches%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select * into _dispatch
  from public.interdepartmental_dispatches
  where id=_dispatch_id;

  if _dispatch.id is null then
    raise exception 'Despacho nao encontrado';
  end if;

  if not public.has_process_access(_dispatch.process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para concluir despacho';
  end if;

  if _dispatch.status not in ('aguardando','respondido') then
    raise exception 'Despacho nao pode ser concluido neste estado';
  end if;

  update public.interdepartmental_dispatches
     set status='concluido',
         completed_at=now()
   where id=_dispatch_id
   returning * into _dispatch;

  update public.processes
     set current_department=coalesce(nullif(btrim(_unit),''),_dispatch.to_department),
         current_queue=coalesce(nullif(btrim(_unit),''),_dispatch.to_department),
         updated_at=now()
   where id=_dispatch.process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _dispatch.tenant_id,_dispatch.process_id,_legacy_user_id,
    'despacho','Despacho concluido',
    'Conclusao registrada pela unidade '||
      coalesce(nullif(btrim(_unit),''),_dispatch.to_department)||'.',
    false,now(),_dispatch.municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'dispatch',to_jsonb(_dispatch),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.complete_process_dispatch(uuid, text) from public;
grant execute on function public.complete_process_dispatch(uuid, text) to authenticated;

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

  if _process_id is null then
    raise exception 'Exigencia nao encontrada';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para concluir exigencia';
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

revoke all on function public.complete_process_requirement(uuid) from public;
grant execute on function public.complete_process_requirement(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.create_process_dispatch(_process_id uuid, _from_department text, _to_department text, _subject text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _visibility text DEFAULT 'interno'::text, _priority text DEFAULT 'media'::text, _assigned_to text DEFAULT NULL::text)
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
  _dispatch public.interdepartmental_dispatches%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_from_department),'') is null
     or nullif(btrim(_to_department),'') is null
     or nullif(btrim(_subject),'') is null then
    raise exception 'Origem, destino e assunto sao obrigatorios';
  end if;

  if _visibility not in ('interno','externo','misto') then
    raise exception 'Visibilidade invalida';
  end if;

  if _priority not in ('baixa','media','alta','critica') then
    raise exception 'Prioridade invalida';
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
    raise exception 'Sem permissao para despachar processo';
  end if;

  insert into public.interdepartmental_dispatches(
    tenant_id,process_id,from_department,to_department,subject,due_at,
    created_by,created_at,visibility,municipality_id,created_by_profile_id,
    status,priority,assigned_to
  )
  values(
    _tenant_id,_process_id,btrim(_from_department),btrim(_to_department),
    btrim(_subject),_due_at,_legacy_user_id,now(),_visibility,
    _municipality_id,_profile_id,'aguardando',_priority,
    nullif(btrim(_assigned_to),'')
  )
  returning * into _dispatch;

  update public.processes
     set status='despacho_intersetorial'::public.process_status,
         current_department=btrim(_to_department),
         current_queue=btrim(_to_department),
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'dispatch',
    _from_status,'despacho_intersetorial'::public.process_status,
    btrim(_subject)||' -> '||btrim(_to_department),
    now(),(_visibility<>'interno'),_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'despacho','Despacho criado',
    btrim(_subject)||' encaminhado para '||btrim(_to_department)||'.',
    (_visibility<>'interno'),now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'dispatch',to_jsonb(_dispatch),
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit),
    'process_id',_process_id
  );
end;
$function$;

revoke all on function public.create_process_dispatch(uuid, text, text, text, timestamp with time zone, text, text, text) from public;
grant execute on function public.create_process_dispatch(uuid, text, text, text, timestamp with time zone, text, text, text) to authenticated;

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
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para criar exigencia';
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

revoke all on function public.create_process_requirement(uuid, text, text, timestamp with time zone, text, text) from public;
grant execute on function public.create_process_requirement(uuid, text, text, timestamp with time zone, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.remove_process_marker(_marker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _marker public.process_markers%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select * into _marker
  from public.process_markers
  where id=_marker_id;

  if _marker.id is null then
    raise exception 'Marcador nao encontrado';
  end if;

  if not public.has_process_access(_marker.process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  delete from public.process_markers
  where id=_marker_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _marker.tenant_id,_marker.process_id,_legacy_user_id,'perfil',
    'Marcador removido',
    'Marcador '||_marker.label||' removido do processo.',
    true,now(),_marker.municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'marker_id',_marker_id,
    'process_id',_marker.process_id,
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.remove_process_marker(uuid) from public;
grant execute on function public.remove_process_marker(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.reopen_process(_process_id uuid, _reason text)
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
  _reopen public.process_reopen_history%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_reason),'') is null then
    raise exception 'Motivo da reabertura e obrigatorio';
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
    raise exception 'Sem permissao para reabrir processo';
  end if;

  if _from_status='reapresentacao'::public.process_status then
    raise exception 'Processo ja esta em reapresentacao';
  end if;

  update public.processes
     set status='reapresentacao'::public.process_status,
         sla_stage='reapresentacao',
         sla_breached=false,
         updated_at=now()
   where id=_process_id;

  insert into public.process_reopen_history(
    tenant_id,process_id,actor_user_id,reason,created_at,
    municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,btrim(_reason),now(),
    _municipality_id,_profile_id
  )
  returning * into _reopen;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'reopen',
    _from_status,'reapresentacao'::public.process_status,
    btrim(_reason),now(),true,_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'status','Processo reaberto',
    btrim(_reason),true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'from_status',_from_status::text,
    'to_status','reapresentacao',
    'reopen',to_jsonb(_reopen),
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.reopen_process(uuid, text) from public;
grant execute on function public.reopen_process(uuid, text) to authenticated;

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

  if _process_id is null then
    raise exception 'Exigencia nao encontrada';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
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

revoke all on function public.respond_process_requirement(uuid, text) from public;
grant execute on function public.respond_process_requirement(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.return_process_dispatch(_dispatch_id uuid, _unit text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _dispatch public.interdepartmental_dispatches%rowtype;
  _return_dispatch public.interdepartmental_dispatches%rowtype;
  _audit public.process_audit_entries%rowtype;
  _subject text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select * into _dispatch
  from public.interdepartmental_dispatches
  where id=_dispatch_id;

  if _dispatch.id is null then
    raise exception 'Despacho nao encontrado';
  end if;

  if not public.has_process_access(_dispatch.process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para devolver despacho';
  end if;

  if _dispatch.status in ('concluido','devolvido') then
    raise exception 'Despacho nao pode ser devolvido neste estado';
  end if;

  update public.interdepartmental_dispatches
     set status='devolvido',
         returned_at=now(),
         response=nullif(btrim(_reason),'')
   where id=_dispatch_id
   returning * into _dispatch;

  _subject :=
    case
      when nullif(btrim(_reason),'') is null
        then 'Devolucao para unidade de origem'
      else 'Devolucao: '||btrim(_reason)
    end;

  insert into public.interdepartmental_dispatches(
    tenant_id,process_id,from_department,to_department,subject,due_at,
    response,created_by,created_at,visibility,municipality_id,
    created_by_profile_id,status,priority,assigned_to
  )
  values(
    _dispatch.tenant_id,_dispatch.process_id,
    coalesce(nullif(btrim(_unit),''),_dispatch.to_department),
    _dispatch.from_department,
    _subject,
    now(),
    nullif(btrim(_reason),''),
    _legacy_user_id,now(),'interno',
    _dispatch.municipality_id,_profile_id,
    'devolvido',_dispatch.priority,_dispatch.assigned_to
  )
  returning * into _return_dispatch;

  update public.processes
     set current_department=_dispatch.from_department,
         current_queue=_dispatch.from_department,
         updated_at=now()
   where id=_dispatch.process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _dispatch.tenant_id,_dispatch.process_id,_legacy_user_id,
    'despacho','Processo devolvido',
    'O processo retornou para '||_dispatch.from_department||'.',
    false,now(),_dispatch.municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'dispatch',to_jsonb(_dispatch),
    'return_dispatch',to_jsonb(_return_dispatch),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.return_process_dispatch(uuid, text, text) from public;
grant execute on function public.return_process_dispatch(uuid, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.review_process_document(_document_id uuid, _status text)
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
  _tenant_id uuid;
  _municipality_id uuid;
  _doc public.process_documents%rowtype;
  _audit public.process_audit_entries%rowtype;
  _title text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _status not in ('aprovado','rejeitado') then
    raise exception 'Status de revisao invalido';
  end if;

  select d.process_id,d.tenant_id,d.municipality_id
    into _process_id,_tenant_id,_municipality_id
  from public.process_documents d
  where d.id=_document_id;

  if _process_id is null then
    raise exception 'Documento nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para revisar documento';
  end if;

  _title :=
    case when _status='aprovado'
      then 'Documento aprovado'
      else 'Documento rejeitado'
    end;

  update public.process_documents
     set review_status=_status,
         reviewed_by=coalesce(
           (select full_name from public.profiles where id=_profile_id),
           'Usuario'
         ),
         reviewed_by_profile_id=_profile_id
   where id=_document_id
   returning * into _doc;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'documento',_title,
    'Revisao documental concluida com status '||_status||'.',
    true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'document',to_jsonb(_doc),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.review_process_document(uuid, text) from public;
grant execute on function public.review_process_document(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.send_process_message(_process_id uuid, _audience text, _recipient_name text, _message text)
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
  _sender_name text;
  _sender_role text;
  _row public.process_messages%rowtype;
  _audit public.process_audit_entries%rowtype;
  _is_internal boolean;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _audience not in ('interno','externo','misto') then
    raise exception 'Audiencia invalida';
  end if;

  if nullif(btrim(_message),'') is null then
    raise exception 'Mensagem obrigatoria';
  end if;

  if char_length(btrim(_message)) > 4000 then
    raise exception 'Mensagem excede 4000 caracteres';
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

  _is_internal :=
    public.is_master()
    or public.is_internal_municipality_role();

  if not _is_internal and _audience='interno' then
    raise exception 'Usuario externo nao pode enviar mensagem interna';
  end if;

  select
    coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Usuario'),
    coalesce(public.current_role_code(),p.role,'usuario')
    into _sender_name,_sender_role
  from public.profiles p
  where p.id=_profile_id;

  insert into public.process_messages(
    tenant_id,process_id,sender_user_id,sender_profile_id,
    sender_name,sender_role,audience,recipient_name,message,
    created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,
    _sender_name,_sender_role,_audience,
    nullif(btrim(_recipient_name),''),
    btrim(_message),now(),_municipality_id
  )
  returning * into _row;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,
    'mensagem','Mensagem registrada',
    'Nova mensagem enviada com visibilidade '||_audience||'.',
    (_audience<>'interno'),now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'message',to_jsonb(_row),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.send_process_message(uuid, text, text, text) from public;
grant execute on function public.send_process_message(uuid, text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.set_process_checkpoint(_process_id uuid, _checkpoint text)
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
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_checkpoint),'') is null then
    raise exception 'Checkpoint obrigatorio';
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
    raise exception 'Sem permissao para definir checkpoint';
  end if;

  update public.processes
     set process_checkpoint=btrim(_checkpoint),
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'despacho',
    'Ponto de controle',
    'Checkpoint institucional definido como '||btrim(_checkpoint)||'.',
    false,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'checkpoint',btrim(_checkpoint),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.set_process_checkpoint(uuid, text) from public;
grant execute on function public.set_process_checkpoint(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.set_process_hold(_process_id uuid, _on_hold boolean, _reason text DEFAULT NULL::text)
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
  _effective_reason text;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
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
    raise exception 'Sem permissao para alterar sobrestamento';
  end if;

  _effective_reason :=
    case
      when _on_hold then coalesce(nullif(btrim(_reason),''),'Sobrestamento administrativo.')
      else null
    end;

  update public.processes
     set is_on_hold=_on_hold,
         hold_reason=_effective_reason,
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'despacho',
    case when _on_hold then 'Processo sobrestado' else 'Sobrestamento removido' end,
    case
      when _on_hold then 'Sobrestamento registrado. '||_effective_reason
      else 'O processo foi reativado no fluxo.'
    end,
    false,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'on_hold',_on_hold,
    'reason',_effective_reason,
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.set_process_hold(uuid, boolean, text) from public;
grant execute on function public.set_process_hold(uuid, boolean, text) to authenticated;

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
         sla_stage=replace(_to_status::text,'_',' '),
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
$function$;

revoke all on function public.set_process_status(uuid, text, text, text) from public;
grant execute on function public.set_process_status(uuid, text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.set_process_transit_visibility(_process_id uuid, _visibility text)
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
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _visibility not in ('completo','restrito') then
    raise exception 'Visibilidade invalida';
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
    raise exception 'Sem permissao para alterar visibilidade';
  end if;

  update public.processes
     set external_transit_view=_visibility,
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'despacho',
    'Visibilidade do fluxo atualizada',
    case
      when _visibility='completo'
        then 'A visualizacao externa do fluxo foi liberada para acompanhamento completo.'
      else 'A visualizacao externa do fluxo foi restringida, ocultando tramitacoes internas.'
    end,
    false,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'visibility',_visibility,
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.set_process_transit_visibility(uuid, text) from public;
grant execute on function public.set_process_transit_visibility(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.upsert_process_marker(_process_id uuid, _label text, _color text DEFAULT '#2563eb'::text)
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
  _marker public.process_markers%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_label),'') is null then
    raise exception 'Marcador obrigatorio';
  end if;

  if char_length(btrim(_label)) > 80 then
    raise exception 'Marcador excede 80 caracteres';
  end if;

  if _color is null or _color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Cor invalida';
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

  insert into public.process_markers(
    tenant_id,process_id,label,color,created_by_profile_id,
    created_by,created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,btrim(_label),_color,_profile_id,
    _legacy_user_id,now(),_municipality_id
  )
  on conflict (process_id,lower(label))
  do update set color=excluded.color
  returning * into _marker;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'perfil',
    'Marcador atualizado',
    'Marcador '||btrim(_label)||' salvo no processo.',
    true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'marker',to_jsonb(_marker),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.upsert_process_marker(uuid, text, text) from public;
grant execute on function public.upsert_process_marker(uuid, text, text) to authenticated;

