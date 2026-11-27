-- A superseded, invalidated PDF remains part of audit history, not an active missing document.
-- Required document TYPES must still have active (is_valid=true) PDF files.
-- Applies to protocol triage and formal dispatch without bypassing payment or urban analysis gating.
CREATE OR REPLACE FUNCTION public.set_process_triage(_process_id uuid, _triage_status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _process_status public.process_status;
  _previous_triage text;
  _process_type text;
  _missing_docs boolean := false;
  _present_types integer := 0;
  _has_required_doc boolean := false;
  _protocol_paid boolean := false;
  _actor_name text;
  _effective_status text := lower(trim(coalesce(_triage_status,'')));
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _effective_status NOT IN ('recebido','em_triagem','concluido') THEN
    RAISE EXCEPTION 'Status de triagem invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status,p.process_type
    INTO _tenant_id,_municipality_id,_process_status,_previous_triage,_process_type
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF NOT (
    public.is_master()
    OR _role_code='prefeitura_admin'
    OR _role_code='setor_intersetorial'
  ) THEN
    RAISE EXCEPTION 'Somente o Setor de Protocolo pode executar a triagem';
  END IF;

  SELECT exists(
    select 1
    from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='protocolo'
      and (
        coalesce(g.paid,false)=true
        or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
      )
  ) into _protocol_paid;

  -- Triage is a RECEIPT check, not the analyst's later urbanistic judgment.
  -- Never require review_status='aprovado' at protocol stage.
  IF _effective_status='concluido' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.process_documents d
      WHERE d.process_id=_process_id AND d.is_required IS TRUE
        AND coalesce(d.is_valid,true)=true
        AND nullif(btrim(coalesce(d.file_path,'')),'') IS NULL
        AND nullif(btrim(coalesce(d.preview_url,'')),'') IS NULL
    ) INTO _missing_docs;
    IF _missing_docs THEN
      RAISE EXCEPTION 'Conclua a entrega dos arquivos obrigatorios antes da triagem.';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.process_documents d WHERE d.process_id=_process_id
        AND d.is_required IS TRUE AND coalesce(d.is_valid,true)=true
        AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
          OR nullif(btrim(coalesce(d.preview_url,'')),'') IS NOT NULL)
    ) INTO _has_required_doc;

    IF lower(coalesce(_process_type,'')) ~ '(aprov|licenciament|arquitet|projeto)'
       AND lower(coalesce(_process_type,'')) NOT LIKE '%habite%' THEN
      SELECT COUNT(DISTINCT CASE
        WHEN lower(d.title) ~ 'projeto arquitet[oô]nico' THEN 'projeto'
        WHEN lower(d.title) ~ 'memorial descritivo' THEN 'memorial'
        WHEN lower(d.title) ~ 'art|rrt' THEN 'art_rrt'
        WHEN lower(d.title) ~ 'matr[ií]cula|escritura' THEN 'matricula'
        ELSE null END)
      INTO _present_types
      FROM public.process_documents d
      WHERE d.process_id=_process_id AND d.is_required IS TRUE
        AND coalesce(d.is_valid,true)=true
        AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
          OR nullif(btrim(coalesce(d.preview_url,'')),'') IS NOT NULL);
      IF _present_types < 4 THEN
        RAISE EXCEPTION 'Triagem: anexe Projeto Arquitetonico, Memorial, ART/RRT e Escritura/Matricula.';
      END IF;
    ELSIF lower(coalesce(_process_type,'')) LIKE '%habite%'
      AND NOT _has_required_doc THEN
      RAISE EXCEPTION 'Triagem do Habite-se: anexe os documentos obrigatorios.';
    END IF;
  END IF;

  SELECT coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Funcionario do Protocolo')
    INTO _actor_name
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  UPDATE public.processes
     SET triage_status=_effective_status,
         status=CASE
           WHEN _effective_status='concluido' and _protocol_paid
             THEN 'pagamento_confirmado'::public.process_status
           WHEN _effective_status='concluido'
             THEN 'pagamento_pendente'::public.process_status
           ELSE 'triagem'::public.process_status
         END,
         triage_assigned_to=CASE
           WHEN _effective_status='recebido' THEN NULL
           ELSE _actor_name
         END,
         triage_notes=coalesce(nullif(trim(_notes),''),triage_notes),
         current_department='Setor de Protocolo',
         current_queue=CASE
           WHEN _effective_status='recebido' THEN 'Recepção'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE case when _protocol_paid then 'Pronto para Despacho' else 'Pagamento do Protocolo' end
         END,
         sla_stage=CASE
           WHEN _effective_status='recebido' THEN 'Recepção de Protocolo'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE case
             when _protocol_paid then 'Triagem concluida — pronto para despacho'
             else 'Aguardando pagamento do protocolo'
           end
         END,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'triage',
    _process_status,
    CASE
      WHEN _effective_status='concluido' and _protocol_paid
        THEN 'pagamento_confirmado'::public.process_status
      WHEN _effective_status='concluido'
        THEN 'pagamento_pendente'::public.process_status
      ELSE 'triagem'::public.process_status
    END,
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada pelo Setor de Protocolo'
      WHEN 'concluido' THEN 'Triagem concluida pelo Setor de Protocolo'
      ELSE 'Processo devolvido para recepcao do Protocolo'
    END,
    now(),true,_municipality_id,_profile_id
  )
  RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'protocolo',
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada'
      WHEN 'concluido' THEN 'Triagem concluida'
      ELSE 'Triagem redefinida'
    END,
    coalesce(nullif(trim(_notes),''),
      CASE _effective_status
        WHEN 'em_triagem' THEN 'Conferencia documental iniciada pelo Protocolo.'
        WHEN 'concluido' THEN case
          when _protocol_paid
            then 'Conferencia documental concluida. Pagamento ja compensado; processo liberado para despacho.'
          else 'Conferencia documental concluida. O fluxo aguarda a baixa da guia inicial quando aplicavel.'
        end
        ELSE 'Processo retornado para a recepcao.'
      END
    ),
    true,now(),_municipality_id,_profile_id
  )
  RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,
    'previous_triage_status',_previous_triage,
    'triage_status',_effective_status,
    'assigned_to',CASE WHEN _effective_status='recebido' THEN NULL ELSE _actor_name END,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
END;
$function$;

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
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _destination public.departments%rowtype;
  _origin_department text;
  _origin_area text;
  _destination_area text;
  _actor_area text;
  _actor_role text;
  _next_status public.process_status;
  _next_triage_status text;
  _protocol_guide_paid boolean := false;
  _required_missing boolean := false;
  _dispatch public.interdepartmental_dispatches%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if nullif(btrim(_to_department),'') is null
     or nullif(btrim(_subject),'') is null then
    raise exception 'Destino e assunto do encaminhamento são obrigatórios.';
  end if;

  if _visibility not in ('interno','externo','misto') then
    raise exception 'Visibilidade inválida.';
  end if;

  if _priority not in ('baixa','media','alta','critica') then
    raise exception 'Prioridade inválida.';
  end if;

  select * into _profile
  from public.profiles
  where id=_profile_id
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissão para encaminhar processo.';
  end if;

  _actor_role := lower(coalesce(public.current_role_code(),_profile.role,''));
  _origin_department := coalesce(
    nullif(btrim(_process.current_department),''),
    nullif(btrim(_process.current_queue),''),
    nullif(btrim(_from_department),''),
    'Unidade não informada'
  );
  _origin_area := public.operational_area_from_label(_origin_department);
  _actor_area := public.profile_operational_area(_profile_id);

  if not public.is_master()
     and _actor_role not in ('prefeitura_admin','prefeitura_supervisor','admin_municipality')
     and coalesce(_origin_area,'') <> ''
     and coalesce(_actor_area,'') <> coalesce(_origin_area,'') then
    raise exception 'Somente a unidade responsável pela etapa atual pode encaminhar este processo.';
  end if;

  select d.* into _destination
  from public.departments d
  where d.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and d.is_active=true
    and (
      lower(btrim(d.name))=lower(btrim(_to_department))
      or lower(btrim(coalesce(d.code,'')))=lower(btrim(_to_department))
    )
  order by
    case when lower(btrim(d.name))=lower(btrim(_to_department)) then 0 else 1 end,
    d.sort_order,
    d.name
  limit 1;

  if _destination.id is null then
    raise exception 'O destino selecionado não pertence ao organograma ativo desta Prefeitura.';
  end if;

  if lower(btrim(_origin_department))=lower(btrim(_destination.name)) then
    raise exception 'O destino selecionado já é a unidade atual do processo.';
  end if;

  if exists (
    select 1
    from public.interdepartmental_dispatches d
    where d.process_id=_process_id
      and d.status in ('aguardando','respondido')
      and lower(btrim(d.to_department))=lower(btrim(_destination.name))
  ) then
    raise exception 'Já existe um encaminhamento ativo deste processo para esta unidade.';
  end if;

  _destination_area := public.operational_area_from_label(_destination.name);
  _next_status := _process.status;
  _next_triage_status := _process.triage_status;

  -- Entrada oficial do Protocolo na fila de distribuição da Análise.
  -- Não cria um status paralelo de "despacho_intersetorial"; preserva o workflow real.
  if coalesce(_origin_area,'')='protocolos'
     and coalesce(_destination_area,'')='analise' then

    select exists (
      select 1
      from public.payment_guides g
      where g.process_id=_process_id
        and coalesce(g.guide_kind,'protocolo')='protocolo'
        and (
          coalesce(g.paid,false)=true
          or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
        )
    ) into _protocol_guide_paid;

    if not _protocol_guide_paid then
      raise exception 'A Guia de Protocolo ainda não está compensada. Confirme o pagamento antes do encaminhamento.';
    end if;

    if coalesce(_process.triage_status,'recebido') <> 'concluido' then
      raise exception 'Conclua a triagem documental antes de encaminhar para a Análise Urbanística.';
    end if;

    select exists (
      select 1
      from public.process_documents doc
      where doc.process_id=_process_id
        and coalesce(doc.is_required,false)=true
        and coalesce(doc.is_valid,true)=true
        and nullif(btrim(coalesce(doc.file_path,'')),'') is null
        and nullif(btrim(coalesce(doc.preview_url,'')),'') is null
    ) into _required_missing;

    if _required_missing then
      raise exception 'Existem documentos obrigatórios pendentes. Conclua a entrega documental antes do encaminhamento.';
    end if;

    -- Não considerar lista vazia de documentos como "nenhuma pendência".
    -- Para aprovação, exigir os quatro tipos mínimos, cada um com anexo real.
    -- Habite-se possui documentos próprios e não usa as quatro categorias da aprovação.
    if lower(coalesce(_process.process_type,'')) like '%habite%' then
      if not exists (
        select 1 from public.process_documents d
        where d.process_id = _process_id
          and d.is_required is true
          and coalesce(d.is_valid,true)=true
          and (
            nullif(btrim(coalesce(d.file_path,'')),'') is not null
            or nullif(btrim(coalesce(d.preview_url,'')),'') is not null
          )
          and coalesce(d.is_valid,true)=true
      ) then
        raise exception 'Habite-se: anexe a documentação obrigatória antes do encaminhamento.';
      end if;
    elsif lower(coalesce(_process.process_type,'')) ~ '(aprov|licenciament|arquitet|projeto)' then
      if (
        select count(distinct case
          when lower(d.title) ~ 'projeto arquitet[oô]nico' then 'projeto'
          when lower(d.title) ~ 'memorial descritivo' then 'memorial'
          when lower(d.title) ~ 'art|rrt' then 'art_rrt'
          when lower(d.title) ~ 'matr[ií]cula|escritura' then 'matricula'
          else null
        end)
        from public.process_documents d
        where d.process_id = _process_id
          and d.is_required is true
          and (
            nullif(btrim(coalesce(d.file_path,'')),'') is not null
            or nullif(btrim(coalesce(d.preview_url,'')),'') is not null
          )
          and coalesce(d.is_valid,true)=true
      ) < 4 then
        raise exception 'Anexe os quatro documentos mínimos: Projeto Arquitetônico, Memorial Descritivo, ART/RRT e Escritura/Matrícula.';
      end if;
    elsif not exists (
      select 1 from public.process_documents d
      where d.process_id=_process_id
        and (
          nullif(btrim(coalesce(d.file_path,'')),'') is not null
          or nullif(btrim(coalesce(d.preview_url,'')),'') is not null
        )
    ) then
      raise exception 'Inclua e confira os documentos pertinentes a este serviço antes do despacho.';
    end if;

    _next_status := 'distribuicao'::public.process_status;
    _next_triage_status := 'concluido';
  end if;

  insert into public.interdepartmental_dispatches(
    tenant_id,process_id,from_department,to_department,subject,due_at,
    created_by,created_at,visibility,municipality_id,created_by_profile_id,
    status,priority,assigned_to
  )
  values(
    _process.tenant_id,_process_id,_origin_department,_destination.name,
    btrim(_subject),_due_at,_legacy_user_id,clock_timestamp(),_visibility,
    _process.municipality_id,_profile_id,'aguardando',_priority,
    nullif(btrim(_assigned_to),'')
  )
  returning * into _dispatch;

  update public.processes
  set status=_next_status,
      triage_status=_next_triage_status,
      current_department=_destination.name,
      current_queue=_destination.name,
      sla_stage=case
        when coalesce(_origin_area,'')='protocolos'
         and coalesce(_destination_area,'')='analise'
          then 'Aguardando distribuição na Análise Urbanística'
        else sla_stage
      end,
      process_checkpoint=case
        when coalesce(_origin_area,'')='protocolos'
         and coalesce(_destination_area,'')='analise'
          then 'Recebido na Análise Urbanística — aguardando distribuição'
        else process_checkpoint
      end,
      updated_at=clock_timestamp()
  where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,'dispatch',
    _process.status,_next_status,
    btrim(_subject)||' — '||_origin_department||' → '||_destination.name,
    clock_timestamp(),(_visibility<>'interno'),_process.municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,'despacho',
    'Processo encaminhado',
    'Encaminhamento oficial de '||_origin_department||' para '||_destination.name||
      '. Assunto: '||btrim(_subject)||'.',
    (_visibility<>'interno'),clock_timestamp(),_process.municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'ok',true,
    'process_id',_process_id,
    'from_department',_origin_department,
    'to_department',_destination.name,
    'previous_status',_process.status::text,
    'current_status',_next_status::text,
    'dispatch',to_jsonb(_dispatch),
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$;
