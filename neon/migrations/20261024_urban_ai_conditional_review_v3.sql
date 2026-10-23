-- SIGAPRO IA: explicit legal exception review audit stored with advisory precheck.
-- Apply QA only, never alter production processes/permits or signatures.
begin;
alter table public.process_urban_precheck_runs
  add column if not exists legal_review jsonb not null default '{}'::jsonb;
alter table public.process_urban_precheck_runs
  drop constraint if exists process_urban_precheck_legal_review_object;
alter table public.process_urban_precheck_runs
  add constraint process_urban_precheck_legal_review_object
  check (jsonb_typeof(legal_review) = 'object' and pg_column_size(legal_review) < 10000);

create or replace function public.save_urban_precheck_run_v3(
  _process_id uuid,
  _regulation_version_id uuid,
  _reference_date date,
  _measurements jsonb,
  _legal_review jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare
  _saved jsonb;
  _new_id uuid;
  _municipality_id uuid;
  _ids jsonb;
  _note text;
  _scope_confirmed boolean;
begin
  if not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente o analista responsavel ou Diretoria pode registrar a revisao.';
  end if;
  if _legal_review is null or jsonb_typeof(_legal_review) <> 'object'
      or pg_column_size(_legal_review) > 6000 then
    raise exception 'Registro de condicoes legais invalido.';
  end if;
  _ids := _legal_review->'evidence_ids';
  _note := coalesce(_legal_review->>'note','');
  _scope_confirmed := coalesce(_legal_review->>'document_scope_confirmed','false')='true';
  if _ids is null or jsonb_typeof(_ids) <> 'array'
    or jsonb_array_length(_ids) > 50
    or length(_note) > 1200 then
    raise exception 'Revisao legal com referencias excessivas ou invalidas.';
  end if;
  if jsonb_array_length(_ids)>0 and (not _scope_confirmed or length(btrim(_note)) < 20) then
    raise exception 'Registre justificativa e confirme a legislacao para revisoes condicionais.';
  end if;

  select municipality_id into _municipality_id from public.urban_regulation_versions
    where id=_regulation_version_id;
  if _municipality_id is null or exists(
    select 1 from jsonb_array_elements_text(_ids) ident(value)
    where ident.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'Referencia legal invalida.';
  end if;

  if exists(
    select 1 from jsonb_array_elements_text(_ids) ident(value)
    left join public.urban_legal_evidence_catalog evidence
      on evidence.id=ident.value::uuid
      and evidence.municipality_id=_municipality_id
      and exists(
        select 1 from public.urban_regulation_versions version,
          lateral jsonb_array_elements(version.rules) metric(rule)
        where version.id=_regulation_version_id
          and metric.rule->>'metric'=evidence.metric
      )
    where evidence.id is null
  ) then
    raise exception 'Referencia nao pertence a norma/municipio do processo.';
  end if;

  -- The existing writer validates assignment, process, municipality, active
  -- historical rule version, measurements and date. Reuse it atomically.
  _saved := public.save_urban_precheck_run_v2(
    _process_id,_regulation_version_id,_reference_date,_measurements
  );
  _new_id := (_saved->>'id')::uuid;
  update public.process_urban_precheck_runs
    set legal_review=jsonb_build_object(
      'evidence_ids',_ids,
      'note',btrim(_note),
      'document_scope_confirmed',_scope_confirmed,
      'reviewed_by_profile_id',public.current_profile_id(),
      'reviewed_at',clock_timestamp()
    )
    where id=_new_id and municipality_id=_municipality_id;
  if not found then raise exception 'Falha ao associar revisao legal ao historico.'; end if;
  return _saved || jsonb_build_object('legal_review_recorded',true);
end; $$;
revoke all on function public.save_urban_precheck_run_v3(uuid,uuid,date,jsonb,jsonb) from public;
grant execute on function public.save_urban_precheck_run_v3(uuid,uuid,date,jsonb,jsonb) to authenticated;

create or replace function public.list_urban_prechecks_v1(_process_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
begin
  if not public.has_process_access(_process_id) or not (
    public.is_master() or public.is_internal_municipality_role()
  ) then
    raise exception 'Sem acesso ao historico de analises.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (select id,municipality_id,process_id,regulation_version_id,
      measurements,reference_date,reviewer_profile_id,created_at,legal_review
      from public.process_urban_precheck_runs
      where process_id=_process_id order by created_at desc limit 100) t
  ),'[]'::jsonb);
end; $$;
revoke all on function public.list_urban_prechecks_v1(uuid) from public;
grant execute on function public.list_urban_prechecks_v1(uuid) to authenticated;
revoke execute on function public.save_urban_precheck_run_v2(uuid,uuid,date,jsonb) from authenticated;
notify pgrst, 'reload schema';
commit;
