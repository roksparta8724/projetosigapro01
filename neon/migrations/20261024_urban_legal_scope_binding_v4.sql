-- SIGAPRO IA / QA only: legal evidence applies ONLY to reviewed zone, use, dates.
-- Original evidence stays immutable and can be scoped to several legal contexts.
begin;
create table if not exists public.urban_legal_evidence_scopes (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.urban_legal_evidence_catalog(id) on delete restrict,
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  zone_code text not null check(length(zone_code) between 1 and 40),
  use_code text not null check(length(use_code) between 1 and 60),
  effective_from date not null,
  effective_until date,
  confirmed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint urban_legal_scope_dates check(effective_until is null or effective_until >= effective_from),
  constraint urban_legal_scope_unique unique(evidence_id,municipality_id,zone_code,use_code,effective_from)
);
create index if not exists urban_legal_scope_lookup on public.urban_legal_evidence_scopes
  (municipality_id,zone_code,use_code,effective_from);
alter table public.urban_legal_evidence_scopes enable row level security;
revoke all on public.urban_legal_evidence_scopes from public,authenticated;

create or replace function public.list_urban_legal_evidence_v2(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
begin
  if _municipality_id is null or not (
    public.is_master() or
    (public.has_tenant_access(_municipality_id) and public.is_internal_municipality_role())
  ) then raise exception 'Acesso negado ao acervo legal municipal.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (
      select s.id,s.evidence_id,s.municipality_id,e.document_title,
        e.document_sha256,e.page_number,e.metric,e.excerpt,
        s.zone_code,s.use_code,s.effective_from,s.effective_until,
        s.created_at
      from public.urban_legal_evidence_scopes s
      join public.urban_legal_evidence_catalog e
        on e.id=s.evidence_id and e.municipality_id=s.municipality_id
      where s.municipality_id=_municipality_id
      order by s.created_at desc limit 250
    ) t
  ),'[]'::jsonb);
end; $$;
revoke all on function public.list_urban_legal_evidence_v2(uuid) from public;
grant execute on function public.list_urban_legal_evidence_v2(uuid) to authenticated;

create or replace function public.save_urban_legal_evidence_scoped_v2(
  _municipality_id uuid,_document_title text,_document_sha256 text,
  _page_number integer,_metric text,_excerpt text,
  _zone_code text,_use_code text,_effective_from date,_effective_until date
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare _evidence jsonb;_evidence_id uuid;_id uuid;_zone text;_use text;
begin
  if _municipality_id is null or not public.is_urban_regulation_admin_v1(_municipality_id)
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
end; $$;
revoke all on function public.save_urban_legal_evidence_scoped_v2(
  uuid,text,text,integer,text,text,text,text,date,date) from public;
grant execute on function public.save_urban_legal_evidence_scoped_v2(
  uuid,text,text,integer,text,text,text,text,date,date) to authenticated;
-- All new associations require zone/use/date. Previous unscoped rows remain
-- preserved but no longer appear in analytical queries.
revoke execute on function public.save_urban_legal_evidence_v1(
  uuid,text,text,integer,text,text) from authenticated;

create or replace function public.save_urban_precheck_run_v4(
  _process_id uuid,_regulation_version_id uuid,_reference_date date,
  _measurements jsonb,_legal_review jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare _municipality uuid;_zone text;_use text;_legacy_ids jsonb;_saved jsonb;
begin
  if _legal_review is null or jsonb_typeof(_legal_review)<>'object' or
      jsonb_typeof(_legal_review->'evidence_ids')<>'array' or
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
end; $$;
revoke all on function public.save_urban_precheck_run_v4(uuid,uuid,date,jsonb,jsonb) from public;
grant execute on function public.save_urban_precheck_run_v4(uuid,uuid,date,jsonb,jsonb) to authenticated;
revoke execute on function public.save_urban_precheck_run_v3(uuid,uuid,date,jsonb,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
