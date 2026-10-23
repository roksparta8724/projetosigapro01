-- SIGAPRO IA: v2 audit trail. Homologate in a separate Neon branch first.
-- Follows 20261023_urban_ai_rule_versions_and_prechecks_v1.sql.
begin;

alter table public.process_urban_precheck_runs
  add column if not exists reference_date date;

-- Preserve legacy records without inventing an original reference date.
create or replace function public.list_urban_prechecks_v1(_process_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
begin
  if not public.has_process_access(_process_id) or not (
    public.is_master() or public.is_internal_municipality_role()
  ) then raise exception 'Sem acesso ao historico de analises.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (select id,municipality_id,process_id,regulation_version_id,
      measurements,reference_date,reviewer_profile_id,created_at
      from public.process_urban_precheck_runs
      where process_id=_process_id order by created_at desc limit 100) t
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.list_urban_prechecks_v1(uuid) from public;
grant execute on function public.list_urban_prechecks_v1(uuid) to authenticated;

create or replace function public.save_urban_precheck_run_v2(
  _process_id uuid,
  _regulation_version_id uuid,
  _reference_date date,
  _measurements jsonb
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare
  _process public.processes%rowtype;
  _regulation public.urban_regulation_versions%rowtype;
  _actor uuid;
  _id uuid;
begin
  if not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente o analista responsavel ou Diretoria pode registrar a conferencia.';
  end if;
  if _reference_date is null or _reference_date > current_date then
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
    or (select count(*) from jsonb_each(_measurements)) not between 1 and 8 then
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
$$;

revoke all on function public.save_urban_precheck_run_v2(uuid,uuid,date,jsonb) from public;
grant execute on function public.save_urban_precheck_run_v2(uuid,uuid,date,jsonb) to authenticated;

-- Replace the provisional writer: the v2 writer is the only authorized path
-- because v1 cannot record reference_date / historical regulation identity.
revoke execute on function public.save_urban_precheck_run_v1(uuid,uuid,jsonb) from authenticated;
notify pgrst, 'reload schema';
commit;
