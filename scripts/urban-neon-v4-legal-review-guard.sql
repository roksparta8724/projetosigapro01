-- Migration: prevent SQL NULL from bypassing required legal evidence array.
-- Applies to QA first; production deployment requires separate approval.
-- This function preserves existing RPC signature, write authorization and v3 audit semantics.
CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v4(_process_id uuid, _regulation_version_id uuid, _reference_date date, _measurements jsonb, _legal_review jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _municipality uuid;_zone text;_use text;_legacy_ids jsonb;_saved jsonb;
begin
  if _legal_review is null or jsonb_typeof(_legal_review)<>'object' or
      jsonb_typeof(_legal_review->'evidence_ids') IS DISTINCT FROM 'array' or
      jsonb_array_length(_legal_review->'evidence_ids')>50 then
    raise exception 'Conferencia das referencias legais invalida.';
  end if;
  select municipality_id,zone_code,use_code into _municipality,_zone,_use
  from public.urban_regulation_versions where id=_regulation_version_id;
  if _municipality is null or _reference_date is null then
    raise exception 'Versao normativa ou data de referencia nao identificada.';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(_legal_review->'evidence_ids') requested(value)
    where requested.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then raise exception 'Identificador de referencia invalido.'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(_legal_review->'evidence_ids') requested(value)
    left join public.urban_legal_evidence_scopes s on s.id=requested.value::uuid
      and s.municipality_id=_municipality
      and s.zone_code=upper(btrim(_zone)) and s.use_code=upper(btrim(_use))
      and s.effective_from<=_reference_date
      and (s.effective_until is null or s.effective_until>=_reference_date)
    left join public.urban_legal_evidence_catalog e on e.id=s.evidence_id
      and e.municipality_id=s.municipality_id
      and exists(
        select 1 from jsonb_array_elements(
          (select rules from public.urban_regulation_versions where id=_regulation_version_id)
        ) rule where rule->>'metric'=e.metric
      )
    where e.id is null
  )then raise exception 'Referencia legal nao confirmada para zona, uso ou vigencia deste processo.'; end if;
  -- Translate validated scope IDs into immutable underlying document evidence,
  -- so the existing v3 writer retains its assignment and version protections.
  select coalesce(jsonb_agg(to_jsonb(s.evidence_id::text)),'[]'::jsonb)
    into _legacy_ids
  from jsonb_array_elements_text(_legal_review->'evidence_ids') requested(value)
  join public.urban_legal_evidence_scopes s on s.id=requested.value::uuid;
  _saved:=public.save_urban_precheck_run_v3(
    _process_id,_regulation_version_id,_reference_date,_measurements,
    jsonb_set(_legal_review,'{evidence_ids}',_legacy_ids)
  );
  update public.process_urban_precheck_runs
    set legal_review=jsonb_set(legal_review,'{evidence_ids}',_legal_review->'evidence_ids')
    where id=(_saved->>'id')::uuid and municipality_id=_municipality;
  if not found then raise exception 'Falha ao associar evidencias legais ao registro.';end if;
  return _saved || jsonb_build_object('scoped_legal_review',true);
end; $function$
;
