-- Only Prefeitura Admin may modify legal parameters, reviews, and versions.
-- Master retains the existing READ-ONLY RPCs. Do not change processes or existing
-- versions. Prevent direct activation bypass through v1 API.
BEGIN;
CREATE OR REPLACE FUNCTION public.activate_urban_regulation_v1(_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _row public.urban_regulation_versions%rowtype;
begin
  select * into _row from public.urban_regulation_versions where id=_version_id;
  if _row.id is null then raise exception 'Versao nao encontrada.'; end if;
  if (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_row.municipality_id)) then
    raise exception 'Sem permissao para validar normas.';
  end if;
  perform pg_advisory_xact_lock(hashtext(_row.municipality_id::text),
    hashtext(_row.zone_code||'/'||_row.use_code));
  select * into _row from public.urban_regulation_versions
    where id=_version_id for update;
  if _row.status <> 'draft' then
    raise exception 'Apenas rascunhos ainda nao aprovados podem ser ativados.';
  end if;
  if _row.effective_from > current_date then
    raise exception 'Norma com vigencia futura: mantenha como rascunho ate a data de inicio.';
  end if;
  -- Do not supersede a newer rule with an older/equal effective date.
  -- Historical checks depend on strict chronology of activated versions.
  if exists (
    select 1 from public.urban_regulation_versions existing
    where existing.municipality_id=_row.municipality_id
      and existing.zone_code=_row.zone_code and existing.use_code=_row.use_code
      and existing.status='active'
      and existing.effective_from >= _row.effective_from
  ) then
    raise exception 'A nova vigencia deve ser posterior à versao atualmente ativa.';
  end if;
  update public.urban_regulation_versions set status='superseded'
  where municipality_id=_row.municipality_id
    and zone_code=_row.zone_code and use_code=_row.use_code and status='active';
  update public.urban_regulation_versions
    set status='active',activated_by_profile_id=public.current_profile_id(),
        activated_at=clock_timestamp()
    where id=_row.id;
  return jsonb_build_object('id',_row.id,'status','active');
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_urban_regulation_v2(_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE _v public.urban_regulation_versions%rowtype;
BEGIN
 SELECT * INTO _v FROM public.urban_regulation_versions
 WHERE id=_version_id AND status='draft' FOR SHARE;
 IF NOT FOUND OR _v.municipality_id IS NULL OR
    (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_v.municipality_id)) OR
    public.current_profile_id() IS NULL THEN
  RAISE EXCEPTION 'Regra inexistente ou perfil sem permissão municipal para ativar.';
 END IF;
 IF jsonb_typeof(_v.rules)<>'array' OR jsonb_array_length(_v.rules)<1 THEN
  RAISE EXCEPTION 'Regras vazias: não é possível ativar.';
 END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(_v.rules) r(rule)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.urban_legal_evidence_scopes s
    JOIN public.urban_legal_evidence_catalog e
      ON e.id=s.evidence_id AND e.municipality_id=s.municipality_id
    WHERE s.municipality_id=_v.municipality_id
      AND upper(btrim(s.zone_code))=upper(btrim(_v.zone_code))
      AND upper(btrim(s.use_code))=upper(btrim(_v.use_code))
      AND e.metric=r.rule->>'metric'
      AND s.effective_from<=_v.effective_from
      AND (s.effective_until IS NULL OR s.effective_until>=_v.effective_from)
      AND s.verification_method IN ('text_layer_verified','visual_double_transcription')
      AND e.document_sha256 ~* '^[0-9a-f]{64}$'
      AND e.page_number>0 AND length(btrim(e.excerpt))>=15
  )
 ) THEN RAISE EXCEPTION 'EVIDENCIA_LEGAL_INCOMPLETA: vincule a fonte original, página e vigência para todos os índices antes de ativar.'; END IF;
 -- Recheck lock, chronology, status and actor in the official activation writer.
 RETURN public.activate_urban_regulation_v1(_version_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_urban_matrix_reading_action_v2(_municipality_id uuid, _batch_id uuid, _document_sha256 text, _action text, _row_index integer, _page_number integer, _note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _actor uuid:=public.current_profile_id();
  _batch public.urban_matrix_batch_staging_v1%rowtype;
  _source jsonb;
  _last_batch_action text;
  _id uuid;
BEGIN
  IF _actor IS NULL OR (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) THEN
    RAISE EXCEPTION 'Somente administrador municipal autenticado pode revisar este lote.';
  END IF;
  IF _action NOT IN ('reading_verified','needs_correction','archive','restore') OR
     length(btrim(COALESCE(_note,''))) NOT BETWEEN 20 AND 1200 THEN
    RAISE EXCEPTION 'Informe a decisao e justificativa da conferencia (20 a 1200 caracteres).';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_municipality_id::text),hashtext(_batch_id::text));
  SELECT * INTO _batch FROM public.urban_matrix_batch_staging_v1
    WHERE id=_batch_id AND municipality_id=_municipality_id
      AND status='pending_legal_review' FOR SHARE;
  IF NOT FOUND OR _batch.document_sha256 IS DISTINCT FROM _document_sha256 THEN
    RAISE EXCEPTION 'Lote ou SHA-256 nao corresponde ao documento original desta prefeitura.';
  END IF;
  SELECT action INTO _last_batch_action
    FROM public.urban_matrix_reading_audit_v2
    WHERE municipality_id=_municipality_id AND batch_id=_batch_id
      AND row_index IS NULL
    ORDER BY created_at DESC,id DESC LIMIT 1;

  IF _action IN ('reading_verified','needs_correction') THEN
    IF _last_batch_action='archive' THEN
      RAISE EXCEPTION 'Reative o lote arquivado antes de conferir a leitura.';
    END IF;
    IF _row_index IS NULL OR _row_index < 0 OR
       _row_index >= jsonb_array_length(_batch.source_rows) THEN
      RAISE EXCEPTION 'Indice de linha fora do documento de origem.';
    END IF;
    _source:=_batch.source_rows->_row_index;
    IF _page_number IS DISTINCT FROM (_source->>'pagina_pdf')::integer THEN
      RAISE EXCEPTION 'Pagina nao coincide com a fonte original da linha.';
    END IF;
    -- Trecho ilegivel ou duvidoso permanece pendente ate nova fonte conferivel.
    IF _action='reading_verified' AND
       length(btrim(COALESCE(_source->>'pendencias_de_leitura',''))) > 0 THEN
      RAISE EXCEPTION 'Leitura inconclusiva: registrar divergencia e pedir fonte legivel.';
    END IF;
    -- Recuos condicionais podem ter transcricao conferida; a excecao legal
    -- continua obrigatoria e este registro NUNCA libera a norma.
  ELSE
    IF _row_index IS NOT NULL OR _page_number IS NOT NULL THEN
      RAISE EXCEPTION 'Arquivamento/restauracao nao usa indice de linha.';
    END IF;
    IF (_action='archive' AND _last_batch_action='archive') OR
       (_action='restore' AND _last_batch_action IS DISTINCT FROM 'archive') THEN
      RAISE EXCEPTION 'O lote ja esta no estado solicitado.';
    END IF;
  END IF;

  INSERT INTO public.urban_matrix_reading_audit_v2 (
    municipality_id,batch_id,document_sha256,action,row_index,
    page_number,note,actor_profile_id
  ) VALUES (
    _municipality_id,_batch_id,_document_sha256,_action,
    _row_index,_page_number,btrim(_note),_actor
  ) RETURNING id INTO _id;

  RETURN jsonb_build_object('id',_id,'status','recorded',
    'action',_action,'legal_status','pending_legal_review');
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_legal_evidence_scoped_v2(_municipality_id uuid, _document_title text, _document_sha256 text, _page_number integer, _metric text, _excerpt text, _zone_code text, _use_code text, _effective_from date, _effective_until date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _evidence jsonb;_evidence_id uuid;_id uuid;_zone text;_use text;
begin
  if _municipality_id is null or (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id))
      or public.current_profile_id() is null then
    raise exception 'Apenas a administracao municipal pode vincular legislacao.';
  end if;
  _zone:=upper(btrim(coalesce(_zone_code,'')));
  _use:=upper(btrim(coalesce(_use_code,'')));
  if _zone !~ '^[A-Z0-9_-]{1,40}$' or _use !~ '^[A-Z0-9_ -]{1,60}$'
      or _effective_from is null or
      (_effective_until is not null and _effective_until < _effective_from) then
    raise exception 'Informe zona, uso e periodo de vigencia verificaveis.';
  end if;
  _evidence:=public.save_urban_legal_evidence_v1(
    _municipality_id,_document_title,_document_sha256,_page_number,_metric,_excerpt
  );
  _evidence_id:=(_evidence->>'id')::uuid;
  if _evidence_id is null then raise exception 'Falha ao localizar referencia original.';end if;
  insert into public.urban_legal_evidence_scopes(
    evidence_id,municipality_id,zone_code,use_code,effective_from,effective_until,
    confirmed_by_profile_id
  )values(
    _evidence_id,_municipality_id,_zone,_use,_effective_from,_effective_until,
    public.current_profile_id()
  )
  on conflict(evidence_id,municipality_id,zone_code,use_code,effective_from)
  do update set effective_until=excluded.effective_until,
    confirmed_by_profile_id=excluded.confirmed_by_profile_id
  returning id into _id;
  return jsonb_build_object('id',_id,'scope_confirmed',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.save_urban_legal_evidence_scoped_v3(_municipality_id uuid, _document_title text, _document_sha256 text, _page_number integer, _metric text, _excerpt text, _zone_code text, _use_code text, _effective_from date, _effective_until date, _verification_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _saved jsonb;_id uuid;
begin
  if (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) or
      _verification_method not in (
        'text_layer_verified','visual_double_transcription','browser_ocr_human_verified'
      ) then
    raise exception 'Metodo de verificacao ou permissao municipal invalida.';
  end if;
  _saved:=public.save_urban_legal_evidence_scoped_v2(
    _municipality_id,_document_title,_document_sha256,
    _page_number,_metric,_excerpt,_zone_code,_use_code,_effective_from,_effective_until
  );
  _id:=(_saved->>'id')::uuid;
  update public.urban_legal_evidence_scopes
    set verification_method=_verification_method
    where id=_id and municipality_id=_municipality_id;
  if not found then raise exception 'Falha no registro do metodo de verificacao.';end if;
  return _saved || jsonb_build_object('verification_method',_verification_method);
end; $function$;

CREATE OR REPLACE FUNCTION public.save_urban_legal_evidence_scoped_v4(_regulation_version_id uuid, _document_title text, _document_sha256 text, _page_number integer, _metric text, _excerpt text, _effective_from date, _effective_until date, _verification_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 _version public.urban_regulation_versions%rowtype;
 _evidence jsonb;
 _evidence_id uuid;
 _scope_id uuid;
 _zone text;
 _use text;
BEGIN
 SELECT * INTO _version FROM public.urban_regulation_versions
 WHERE id=_regulation_version_id AND status IN ('draft','active') FOR SHARE;
 IF NOT FOUND OR _version.municipality_id IS NULL OR
    (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_version.municipality_id)) OR
    public.current_profile_id() IS NULL THEN
  RAISE EXCEPTION 'Somente o administrador desta prefeitura pode registrar evidências de uma versão válida.';
 END IF;
 _zone:=upper(btrim(_version.zone_code));
 _use:=upper(btrim(_version.use_code));
 -- The previous v2 regex rejected genuine parenthesized zones.
 -- Never accept comma-separated/composite zones or free-form punctuation.
 IF _zone !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}(\([A-Z0-9]{1,12}\))?$'
   OR length(_zone)>40
   OR _use !~ '^[A-Z0-9][A-Z0-9_ -]{0,59}$'
   OR _verification_method NOT IN
     ('text_layer_verified','visual_double_transcription')
   OR _effective_from IS NULL
   OR (_effective_until IS NOT NULL AND _effective_until<_effective_from)
   OR NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(_version.rules) r(rule)
     WHERE r.rule->>'metric'=_metric
   ) THEN
  RAISE EXCEPTION 'Zona individual, uso, métrica, método ou vigência incompatíveis com a regra.';
 END IF;
 _evidence:=public.save_urban_legal_evidence_v1(
  _version.municipality_id,_document_title,_document_sha256,
  _page_number,_metric,_excerpt
 );
 _evidence_id:=(_evidence->>'id')::uuid;
 IF _evidence_id IS NULL THEN RAISE EXCEPTION 'Documento não registrado no acervo.'; END IF;
 INSERT INTO public.urban_legal_evidence_scopes(
   evidence_id,municipality_id,zone_code,use_code,effective_from,effective_until,
   confirmed_by_profile_id,verification_method
 ) VALUES (
   _evidence_id,_version.municipality_id,_zone,_use,
   _effective_from,_effective_until,public.current_profile_id(),_verification_method
 )
 ON CONFLICT (evidence_id,municipality_id,zone_code,use_code,effective_from)
 DO UPDATE SET
   effective_until=excluded.effective_until,
   verification_method=excluded.verification_method,
   confirmed_by_profile_id=excluded.confirmed_by_profile_id
 RETURNING id INTO _scope_id;
 IF _scope_id IS NULL THEN RAISE EXCEPTION 'Falha ao vincular fonte legal à versão.'; END IF;
 RETURN jsonb_build_object(
   'id',_scope_id,'status','verified_evidence',
   'municipality_id',_version.municipality_id,
   'metric',_metric,'zone_code',_zone,'use_code',_use,
   'document_sha256',_document_sha256,'page_number',_page_number,
   'automated_approval',false
 );
END
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_legal_evidence_v1(_municipality_id uuid, _document_title text, _document_sha256 text, _page_number integer, _metric text, _excerpt text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _id uuid;
begin
  if _municipality_id is null or
     (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) then
    raise exception 'Apenas a administracao municipal pode confirmar referencias legais.';
  end if;
  if public.current_profile_id() is null then
    raise exception 'Perfil municipal nao identificado.';
  end if;
  if length(btrim(coalesce(_document_title,''))) not between 1 and 180
    or coalesce(_document_sha256,'') !~ '^[a-f0-9]{64}$'
    or coalesce(_page_number,0) not between 1 and 10000
    or coalesce(_metric,'') not in
      ('front_setback_m','side_setback_m','rear_setback_m','permeability_percent',
       'occupancy_percent','floor_area_ratio','floor_area_ratio_min','lot_area_m2','lot_frontage_m','height_m','floor_count')
    or length(btrim(coalesce(_excerpt,''))) not between 15 and 500 then
    raise exception 'Documento, hash, pagina, parametro ou trecho invalido.';
  end if;
  insert into public.urban_legal_evidence_catalog(
    municipality_id,document_title,document_sha256,page_number,metric,
    excerpt,confirmed_by_profile_id
  ) values(
    _municipality_id,btrim(_document_title),_document_sha256,
    _page_number,_metric,btrim(_excerpt),public.current_profile_id()
  )
  on conflict do nothing returning id into _id;
  if _id is null then
    select id into _id from public.urban_legal_evidence_catalog
    where municipality_id=_municipality_id
      and document_sha256=_document_sha256 and page_number=_page_number
      and metric=_metric and excerpt=btrim(_excerpt)
    limit 1;
  end if;
  return jsonb_build_object('id',_id,'confirmed',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.save_urban_legal_matrix_import_v1(_municipality_id uuid, _document_title text, _document_sha256 text, _page_number integer, _quadro text, _zone_code text, _use_code text, _effective_from date, _source_excerpt text, _reviewed_entries jsonb, _verification_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _zone text := upper(btrim(coalesce(_zone_code,'')));
  _use text := upper(btrim(coalesce(_use_code,'')));
  _ver integer;
  _new_id uuid;
  _actor uuid := public.current_profile_id();
begin
  if (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) or _actor is null then
    raise exception 'Somente administração municipal autenticada pode revisar importações.';
  end if;
  if char_length(btrim(coalesce(_document_title,''))) not between 4 and 180
    or coalesce(_document_sha256,'') !~ '^[0-9a-f]{64}$'
    or coalesce(_page_number,0) not between 1 and 10000
    or _quadro not in ('I','II') or _zone !~ '^[A-Z0-9_()/.-]{1,40}$'
    or _use !~ '^[A-Z0-9_ -]{1,60}$' or _effective_from is null
    or char_length(btrim(coalesce(_source_excerpt,''))) not between 20 and 6000
    or _verification_method not in ('text_layer_verified','visual_double_transcription')
    or coalesce(jsonb_typeof(_reviewed_entries),'null') <> 'array'
    or jsonb_array_length(_reviewed_entries) not between 1 and 16
    or pg_column_size(_reviewed_entries)>20000 then
    raise exception 'Fonte oficial, data, hash, transcrição e parâmetros conferidos são obrigatórios.';
  end if;
  -- Refuse arbitrary JSON that could be interpreted downstream as approval.
  if exists (select 1 from jsonb_array_elements(_reviewed_entries) e
    where jsonb_typeof(e)<>'object'
      or coalesce(e->>'source_excerpt','')=''
      or char_length(e->>'source_excerpt')>500
      or position(e->>'source_excerpt' in _source_excerpt) = 0
      or coalesce(e->>'kind','') not in ('numeric_index','use_condition')
      or (_quadro='I' and e->>'kind'<>'numeric_index')
      or (_quadro='II' and e->>'kind'<>'use_condition')
  ) then
    raise exception 'Cada linha da matriz deve conter citação literal do trecho original.';
  end if;
  perform pg_advisory_xact_lock(hashtext(_municipality_id::text),hashtext(_zone||'/'||_use||'/'||_quadro));
  select coalesce(max(version),0)+1 into _ver
    from public.urban_legal_matrix_imports
    where municipality_id=_municipality_id and zone_code=_zone and use_code=_use and quadro=_quadro;
  insert into public.urban_legal_matrix_imports (
    municipality_id,document_title,document_sha256,page_number,quadro,
    zone_code,use_code,effective_from,source_excerpt,reviewed_entries,
    verification_method,version,reviewed_by_profile_id
  ) values (
    _municipality_id,btrim(_document_title),_document_sha256,_page_number,_quadro,
    _zone,_use,_effective_from,btrim(_source_excerpt),_reviewed_entries,
    _verification_method,_ver,_actor
  ) returning id into _new_id;
  return jsonb_build_object('id',_new_id,'version',_ver,'status','reviewed_draft');
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_matrix_batch_staging_v1(_municipality_id uuid, _document_title text, _document_sha256 text, _source_municipality text, _source_rows jsonb, _reviewed_indexes jsonb, _legal_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
 _actor uuid:=public.current_profile_id();
 _fingerprint text;
 _existing record;
 _version integer;
 _id uuid;
 _row jsonb;
 _selected jsonb;
 _i integer;
begin
 if (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) or _actor is null then
   raise exception 'Somente administrador municipal autenticado pode arquivar lotes em QA.';
 end if;
 if _legal_status is distinct from 'pending_legal_review' or
   length(btrim(coalesce(_document_title,''))) not between 4 and 180 or
   coalesce(_document_sha256,'') !~ '^[a-f0-9]{64}$' or
   length(btrim(coalesce(_source_municipality,''))) not between 2 and 120 or
   coalesce(jsonb_typeof(_source_rows),'null') <> 'array' or
   coalesce(jsonb_typeof(_reviewed_indexes),'null') <> 'array' then
   raise exception 'Pacote QA sem fonte, hash, município ou status seguro.';
 end if;
 if jsonb_array_length(_source_rows) not between 1 and 500 or
   pg_column_size(_source_rows)>250000 or
   jsonb_array_length(_reviewed_indexes)>jsonb_array_length(_source_rows) then
   raise exception 'Quantidade ou tamanho de linhas inválido.';
 end if;
 for _row in select value from jsonb_array_elements(_source_rows) loop
   if jsonb_typeof(_row)<>'object' or
    coalesce(jsonb_typeof(_row->'pagina_pdf'),'null')<>'number' or
    coalesce((_row->>'pagina_pdf')::integer,0) not between 1 and 10000 or
    length(btrim(coalesce(_row->>'zona_conforme_tabela',''))) not between 1 and 40 or
    length(btrim(coalesce(_row->>'uso_predominante_conforme_tabela',''))) not between 1 and 60
   then raise exception 'Linha de origem inválida.'; end if;
 end loop;
 for _selected in select value from jsonb_array_elements(_reviewed_indexes) loop
   if jsonb_typeof(_selected)<>'number' or
     _selected::text !~ '^[0-9]+$' or
     (_selected::text)::integer >= jsonb_array_length(_source_rows) or
     (select count(*) from jsonb_array_elements(_reviewed_indexes) e where e.value=_selected)>1
   then raise exception 'Seleção de conferência inválida ou duplicada.'; end if;
   _i:=(_selected::text)::integer;
   _row:=_source_rows->_i;
   -- Never permit bulk attestation for an incomplete or special-case row.
   if coalesce(_row->>'pendencias_de_leitura','')<>'' or
     coalesce(_row->>'observacoes_especificas','')<>'' or
     coalesce(_row->>'ca_minimo_original','')='' or
     coalesce(_row->>'ca_minimo_original','') !~ '^[0-9]+([,.][0-9]+)?$' or
     coalesce(_row->>'ca_basico_original','') !~ '^[0-9]+([,.][0-9]+)?$' or
     coalesce(_row->>'ca_maximo_original','') !~ '^[0-9]+([,.][0-9]+)?$' or
     coalesce(_row->>'recuo_lateral_m','') !~ '^[0-9]+([.][0-9]+)?$' then
     raise exception 'Linha com índices/observações especiais não pode ser atestada em lote.';
   end if;
 end loop;
 perform pg_advisory_xact_lock(hashtext(_municipality_id::text),hashtext(_document_sha256));
 _fingerprint:=md5(_source_rows::text||'|'||_reviewed_indexes::text);
 select id,version into _existing from public.urban_matrix_batch_staging_v1
  where municipality_id=_municipality_id and document_sha256=_document_sha256
    and fingerprint=_fingerprint;
 if found then
   return jsonb_build_object('id',_existing.id,'version',_existing.version,
    'status','pending_legal_review','idempotent',true,
    'rows',jsonb_array_length(_source_rows),'reviewed',jsonb_array_length(_reviewed_indexes));
 end if;
 select coalesce(max(version),0)+1 into _version
  from public.urban_matrix_batch_staging_v1
  where municipality_id=_municipality_id and document_sha256=_document_sha256;
 insert into public.urban_matrix_batch_staging_v1
  (municipality_id,document_title,document_sha256,source_municipality,source_rows,
   reviewed_indexes,version,fingerprint,reviewed_by_profile_id)
 values(_municipality_id,btrim(_document_title),_document_sha256,
  btrim(_source_municipality),_source_rows,_reviewed_indexes,_version,_fingerprint,_actor)
 returning id into _id;
 return jsonb_build_object('id',_id,'version',_version,'status','pending_legal_review',
  'idempotent',false,'rows',jsonb_array_length(_source_rows),
  'reviewed',jsonb_array_length(_reviewed_indexes));
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_quadro_ii_draft_entry_v1(_municipality_id uuid, _batch_id uuid, _document_sha256 text, _page_number integer, _category_code text, _use_description text, _permitted_zones_text text, _road_hierarchy_text text, _parking_requirement_text text, _special_conditions_text text, _source_excerpt text, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 _actor uuid:=public.current_profile_id();
 _batch public.urban_matrix_batch_staging_v1%rowtype;
 _last_action text;
 _saved_id uuid;
BEGIN
 IF _actor IS NULL OR (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id))
 THEN RAISE EXCEPTION 'Somente administrador municipal pode registrar transcricoes.'; END IF;
 IF _request_id IS NULL OR
    _page_number NOT BETWEEN 38 AND 51 OR
    length(btrim(coalesce(_category_code,''))) NOT BETWEEN 1 AND 32 OR
    length(btrim(coalesce(_use_description,''))) NOT BETWEEN 5 AND 200 OR
    length(coalesce(_permitted_zones_text,'')) > 600 OR
    length(coalesce(_road_hierarchy_text,'')) > 600 OR
    length(coalesce(_parking_requirement_text,'')) > 600 OR
    length(coalesce(_special_conditions_text,'')) > 800 OR
    length(btrim(coalesce(_source_excerpt,''))) NOT BETWEEN 20 AND 1600
 THEN RAISE EXCEPTION 'Preencha categoria, descricao, trecho literal e pagina do Quadro II.'; END IF;
 SELECT * INTO _batch FROM public.urban_matrix_batch_staging_v1
 WHERE id=_batch_id AND municipality_id=_municipality_id
   AND document_sha256=_document_sha256 AND status='pending_legal_review';
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento nao pertence ao municipio ou SHA incorreto.'; END IF;
 SELECT action INTO _last_action FROM public.urban_matrix_reading_audit_v2
 WHERE municipality_id=_municipality_id AND batch_id=_batch_id AND row_index IS NULL
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF _last_action='archive' THEN RAISE EXCEPTION 'Documento arquivado: restaure antes de transcrever.'; END IF;
 INSERT INTO public.urban_quadro_ii_draft_entries_v1 (
   municipality_id,batch_id,document_sha256,page_number,category_code,
   use_description,permitted_zones_text,road_hierarchy_text,
   parking_requirement_text,special_conditions_text,source_excerpt,
   request_id,created_by_profile_id
 ) VALUES (
   _municipality_id,_batch_id,_document_sha256,_page_number,
   btrim(_category_code),btrim(_use_description),
   btrim(coalesce(_permitted_zones_text,'')),btrim(coalesce(_road_hierarchy_text,'')),
   btrim(coalesce(_parking_requirement_text,'')),btrim(coalesce(_special_conditions_text,'')),
   btrim(_source_excerpt),_request_id,_actor
 ) ON CONFLICT (municipality_id,request_id) DO NOTHING RETURNING id INTO _saved_id;
 IF _saved_id IS NULL THEN
   SELECT id INTO _saved_id FROM public.urban_quadro_ii_draft_entries_v1
   WHERE municipality_id=_municipality_id AND request_id=_request_id
     AND batch_id=_batch_id AND page_number=_page_number;
 END IF;
 IF _saved_id IS NULL THEN RAISE EXCEPTION 'Idempotencia recusada: identificador utilizado em outra fonte.'; END IF;
 RETURN jsonb_build_object('id',_saved_id,'status','draft_unverified',
   'ready_for_ai',false,'legal_approval',false);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.activate_urban_regulation_v1(uuid) FROM authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
