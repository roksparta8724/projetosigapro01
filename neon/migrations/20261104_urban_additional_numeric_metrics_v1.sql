-- SIGAPRO QA -> production candidate: 3 additional evidence-backed numeric comparisons.
-- Adds CA MINIMUM, LOT AREA and LOT FRONTAGE. CA BASIC and conditional
-- exceptions remain contextual and require separate human legal verification.
-- Does not change existing values, status, or activated rules.
BEGIN;
ALTER TABLE public.urban_legal_evidence_catalog DROP CONSTRAINT urban_legal_evidence_catalog_metric_check;
ALTER TABLE public.urban_legal_evidence_catalog
 ADD CONSTRAINT urban_legal_evidence_catalog_metric_check
 CHECK (metric IN ('front_setback_m','side_setback_m','rear_setback_m',
  'permeability_percent','occupancy_percent','floor_area_ratio',
  'floor_area_ratio_min','lot_area_m2','lot_frontage_m','height_m','floor_count'));
CREATE OR REPLACE FUNCTION public.save_urban_regulation_draft_v1(_municipality_id uuid, _zone_code text, _use_code text, _effective_from date, _rules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _zone text := upper(btrim(coalesce(_zone_code,'')));
  _use text := upper(btrim(coalesce(_use_code,'')));
  _next integer;
  _id uuid;
  _actor uuid;
begin
  if (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) then
    raise exception 'Apenas a administracao municipal pode cadastrar normas.';
  end if;
  _actor := public.current_profile_id();
  if _actor is null then raise exception 'Perfil nao identificado.'; end if;
  if length(_zone) not between 1 and 40 or length(_use) not between 1 and 60
     or _effective_from is null then
    raise exception 'Zona, uso e inicio de vigencia sao obrigatorios.';
  end if;
  if _rules is null or jsonb_typeof(_rules)<>'array'
    or jsonb_array_length(_rules) not between 1 and 11 or pg_column_size(_rules)>20000 then
    raise exception 'Parametros legais incompletos ou acima do limite.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(_rules) x(rule)
    where jsonb_typeof(x.rule)<>'object'
       or coalesce(x.rule->>'metric','') not in
         ('front_setback_m','side_setback_m','rear_setback_m',
          'permeability_percent','occupancy_percent','floor_area_ratio','floor_area_ratio_min','lot_area_m2','lot_frontage_m','height_m','floor_count')
       or jsonb_typeof(x.rule->'limit') is distinct from 'number'
       or length(btrim(coalesce(x.rule->>'reference',''))) not between 6 and 500
  ) or (
    select count(*) from (select distinct x.rule->>'metric'
      from jsonb_array_elements(_rules) x(rule)) d
  ) <> jsonb_array_length(_rules) then
    raise exception 'Cada parametro precisa de metrica unica, limite numerico e artigo legal.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(_rules) x(rule)
    where (x.rule->>'limit')::numeric < 0 or (x.rule->>'limit')::numeric > 100000
       or (x.rule->>'metric' in ('occupancy_percent','permeability_percent')
           and (x.rule->>'limit')::numeric > 100)
       or (x.rule->>'metric'='floor_count'
           and mod((x.rule->>'limit')::numeric,1)<>0)
  ) then
    raise exception 'Valores normativos fora dos limites de seguranca.';
  end if;
  -- Serialize numbering even with simultaneous municipal administrators.
  perform pg_advisory_xact_lock(hashtext(_municipality_id::text),hashtext(_zone||'/'||_use));
  select coalesce(max(version),0)+1 into _next
    from public.urban_regulation_versions
    where municipality_id=_municipality_id and zone_code=_zone and use_code=_use;
  insert into public.urban_regulation_versions(
    municipality_id,zone_code,use_code,effective_from,version,status,rules,created_by_profile_id
  ) values (_municipality_id,_zone,_use,_effective_from,_next,'draft',_rules,_actor)
  returning id into _id;
  return jsonb_build_object('id',_id,'version',_next,'status','draft');
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_matrix_numeric_review_v1(_municipality_id uuid, _document_title text, _document_sha256 text, _page_number integer, _zone_code text, _use_code text, _effective_from date, _source_excerpt text, _reviewed_entries jsonb, _verification_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _matrix jsonb;
  _draft jsonb;
  _entry jsonb;
  _metric text;
  _excerpt text;
  _raw text;
  _reference text;
  _rules jsonb := '[]'::jsonb;
  _seen text[] := array[]::text[];
begin
  if (public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR NOT public.has_tenant_access(_municipality_id)) or
      public.current_profile_id() is null then
    raise exception 'Permissao municipal invalida.';
  end if;
  if coalesce(jsonb_typeof(_reviewed_entries),'null')<>'array' or
     jsonb_array_length(_reviewed_entries) not between 1 and 11 then
    raise exception 'Quadro I exige entre 1 e 11 indices revisados.';
  end if;
  for _entry in select value from jsonb_array_elements(_reviewed_entries) loop
    _metric := _entry->>'metric';
    _excerpt := btrim(coalesce(_entry->>'source_excerpt',''));
    _raw := coalesce(_entry->>'rawValue','');
    if _entry->>'kind' <> 'numeric_index'
      or _metric not in ('front_setback_m','side_setback_m','rear_setback_m',
        'permeability_percent','occupancy_percent','floor_area_ratio','floor_area_ratio_min','lot_area_m2','lot_frontage_m','height_m','floor_count')
      or _metric = any(_seen)
      or coalesce(jsonb_typeof(_entry->'limit'),'null') <> 'number'
      or length(_excerpt) not between 20 and 500
      or position(_excerpt in _source_excerpt)=0
      or length(_raw) not between 1 and 30 or position(_raw in _excerpt)=0
    then
      raise exception 'Indice sem fonte literal e numerica conferida.';
    end if;
    _reference := left('Arquivo '||_document_title||', Quadro I, pagina PDF '||
      _page_number::text||' — trecho: '||_excerpt,500);
    _rules := _rules || jsonb_build_array(jsonb_build_object(
      'metric',_metric,'limit',(_entry->>'limit')::numeric,'reference',_reference));
    _seen := array_append(_seen,_metric);
  end loop;
  -- All downstream RPC validations run inside the same transaction.
  _matrix := public.save_urban_legal_matrix_import_v1(
    _municipality_id,_document_title,_document_sha256,_page_number,'I',
    _zone_code,_use_code,_effective_from,_source_excerpt,_reviewed_entries,_verification_method
  );
  for _entry in select value from jsonb_array_elements(_reviewed_entries) loop
    perform public.save_urban_legal_evidence_scoped_v3(
      _municipality_id,_document_title,_document_sha256,_page_number,
      _entry->>'metric',_entry->>'source_excerpt',_zone_code,_use_code,
      _effective_from,null,_verification_method
    );
  end loop;
  _draft := public.save_urban_regulation_draft_v1(
    _municipality_id,_zone_code,_use_code,_effective_from,_rules
  );
  return jsonb_build_object('status','reviewed_draft',
    'matrix_id',_matrix->>'id','numeric_draft',_draft);
end;
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
     not public.is_urban_regulation_admin_v1(_municipality_id) then
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

CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v1(_process_id uuid, _regulation_version_id uuid, _measurements jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _regulation public.urban_regulation_versions%rowtype;
  _actor uuid;
  _id uuid;
begin
  if not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente analista responsavel ou Diretoria pode registrar a conferencia.';
  end if;
  select * into _process from public.processes where id=_process_id;
  select * into _regulation from public.urban_regulation_versions
    where id=_regulation_version_id;
  if _process.id is null or _regulation.id is null
     or coalesce(_process.municipality_id,_process.tenant_id) <> _regulation.municipality_id
     or _regulation.status<>'active' then
    raise exception 'Processo e norma vigente nao pertencem ao mesmo municipio.';
  end if;
  _actor:=public.current_profile_id();
  if _actor is null then raise exception 'Perfil nao identificado.'; end if;
  if _measurements is null or jsonb_typeof(_measurements)<>'object'
    or pg_column_size(_measurements)>16000
    or (select count(*) from jsonb_each(_measurements)) not between 1 and 11 then
    raise exception 'Leituras invalidas ou ausentes.';
  end if;
  if exists(
    select 1 from jsonb_each(_measurements) m(metric,data)
    where not exists (select 1 from jsonb_array_elements(_regulation.rules) r(rule)
                        where r.rule->>'metric'=m.metric)
      or jsonb_typeof(m.data)<>'object'
      or jsonb_typeof(m.data->'value') is distinct from 'number'
      or length(btrim(coalesce(m.data->>'evidence',''))) not between 3 and 500
  ) then raise exception 'Informe apenas metricas vigentes com leitura e referencia da prancha.'; end if;
  if exists(
    select 1 from jsonb_each(_measurements) m(metric,data)
    where (m.data->>'value')::numeric < 0 or (m.data->>'value')::numeric > 100000
       or (m.metric in ('occupancy_percent','permeability_percent') and (m.data->>'value')::numeric >100)
       or (m.metric='floor_count' and mod((m.data->>'value')::numeric,1)<>0)
  ) then raise exception 'Medida fora do intervalo permitido.'; end if;
  insert into public.process_urban_precheck_runs(
    municipality_id,process_id,regulation_version_id,measurements,reviewer_profile_id
  ) values (_regulation.municipality_id,_process_id,_regulation_version_id,_measurements,_actor)
  returning id into _id;
  return jsonb_build_object('id',_id,'status','advisory','signed',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v2(_process_id uuid, _regulation_version_id uuid, _reference_date date, _measurements jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _regulation public.urban_regulation_versions%rowtype;
  _actor uuid;
  _id uuid;
begin
  if not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente o analista responsavel ou Diretoria pode registrar a conferencia.';
  end if;
  if _reference_date is null or _reference_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date then
    raise exception 'Informe data de referencia legal valida (nao futura).';
  end if;

  select * into _process from public.processes where id=_process_id;
  select * into _regulation from public.urban_regulation_versions
    where id=_regulation_version_id;
  if _process.id is null or _regulation.id is null
     or coalesce(_process.municipality_id,_process.tenant_id) <> _regulation.municipality_id
     or _regulation.status not in ('active','superseded')
     or _regulation.effective_from > _reference_date then
    raise exception 'Norma e processo nao correspondem ao mesmo municipio e data de vigencia.';
  end if;

  -- Force the most recent valid activated law for the chosen date. Draft rules
  -- and obsolete versions cannot be deliberately submitted as the reference.
  if exists (
    select 1 from public.urban_regulation_versions newer
    where newer.municipality_id=_regulation.municipality_id
      and newer.zone_code=_regulation.zone_code and newer.use_code=_regulation.use_code
      and newer.status in ('active','superseded')
      and newer.effective_from <= _reference_date
      and (
        newer.effective_from > _regulation.effective_from
        or (newer.effective_from=_regulation.effective_from and newer.version>_regulation.version)
      )
  ) then
    raise exception 'Existe norma mais recente aplicavel a data selecionada.';
  end if;

  _actor := public.current_profile_id();
  if _actor is null then raise exception 'Perfil nao identificado.'; end if;
  if _measurements is null or jsonb_typeof(_measurements)<>'object'
    or pg_column_size(_measurements)>16000
    or (select count(*) from jsonb_each(_measurements)) not between 1 and 11 then
    raise exception 'Leituras invalidas ou ausentes.';
  end if;
  if exists (
    select 1 from jsonb_each(_measurements) m(metric,data)
    where not exists (
      select 1 from jsonb_array_elements(_regulation.rules) r(rule)
      where r.rule->>'metric'=m.metric
    )
    or jsonb_typeof(m.data)<>'object'
    or jsonb_typeof(m.data->'value') is distinct from 'number'
    or length(btrim(coalesce(m.data->>'evidence',''))) not between 3 and 500
  ) then
    raise exception 'Informe somente parametros vigentes com valor e referencia da prancha.';
  end if;
  if exists (
    select 1 from jsonb_each(_measurements) m(metric,data)
    where (m.data->>'value')::numeric<0
      or (m.data->>'value')::numeric>100000
      or (m.metric in ('occupancy_percent','permeability_percent') and (m.data->>'value')::numeric>100)
      or (m.metric='floor_count' and mod((m.data->>'value')::numeric,1)<>0)
  ) then raise exception 'Medida fora do intervalo permitido.'; end if;

  insert into public.process_urban_precheck_runs(
    municipality_id,process_id,regulation_version_id,reference_date,
    measurements,reviewer_profile_id
  ) values(
    _regulation.municipality_id,_process_id,_regulation_version_id,_reference_date,
    _measurements,_actor
  ) returning id into _id;
  return jsonb_build_object('id',_id,'status','advisory','signed',false);
end;
$function$;
NOTIFY pgrst,'reload schema';
COMMIT;
