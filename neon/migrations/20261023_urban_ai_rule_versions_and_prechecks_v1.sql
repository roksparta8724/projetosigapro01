-- SIGAPRO IA Urbanismo — piloto seguro, versionado e somente consultivo.
-- PREPARADO, NAO EXECUTADO EM PRODUCAO. Testar em branch isolada Neon.
-- Nao muda processos, fichas oficiais, pagamentos, assinaturas nem R2.
begin;

create table if not exists public.urban_regulation_versions (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  zone_code text not null,
  use_code text not null,
  effective_from date not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','superseded')),
  rules jsonb not null check (jsonb_typeof(rules) = 'array'),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  activated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  unique(municipality_id,zone_code,use_code,version),
  check (length(btrim(zone_code)) between 1 and 40),
  check (length(btrim(use_code)) between 1 and 60)
);
create unique index if not exists urban_regulation_one_active_scope
  on public.urban_regulation_versions(municipality_id,zone_code,use_code)
  where status='active';
create index if not exists urban_regulation_by_municipality
  on public.urban_regulation_versions(municipality_id,created_at desc);
alter table public.urban_regulation_versions enable row level security;
revoke all on public.urban_regulation_versions from public, anon, authenticated;

create table if not exists public.process_urban_precheck_runs (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  process_id uuid not null references public.processes(id) on delete restrict,
  regulation_version_id uuid not null references public.urban_regulation_versions(id) on delete restrict,
  measurements jsonb not null check (jsonb_typeof(measurements)='object'),
  reviewer_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists process_urban_prechecks_by_process
  on public.process_urban_precheck_runs(process_id,created_at desc);
alter table public.process_urban_precheck_runs enable row level security;
revoke all on public.process_urban_precheck_runs from public, anon, authenticated;

create or replace function public.is_urban_regulation_admin_v1(_municipality_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
  select public.is_master() or (
    public.has_tenant_access(_municipality_id) and
    public.current_role_code()='prefeitura_admin'
  );
$$;
revoke all on function public.is_urban_regulation_admin_v1(uuid) from public, anon;
grant execute on function public.is_urban_regulation_admin_v1(uuid) to authenticated;

create or replace function public.list_urban_regulation_versions_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
begin
  if _municipality_id is null or not (
    public.is_master() or (
      public.has_tenant_access(_municipality_id) and
      public.is_internal_municipality_role()
    )
  ) then
    raise exception 'Sem permissao para consultar normas urbanisticas municipais.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.version desc)
    from (select id,municipality_id,zone_code,use_code,effective_from,version,
                 status,rules,created_at,activated_at
          from public.urban_regulation_versions
          where municipality_id=_municipality_id
          order by created_at desc limit 200) t
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.list_urban_regulation_versions_v1(uuid) from public,anon;
grant execute on function public.list_urban_regulation_versions_v1(uuid) to authenticated;

create or replace function public.save_urban_regulation_draft_v1(
  _municipality_id uuid, _zone_code text, _use_code text,
  _effective_from date, _rules jsonb
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare
  _zone text := upper(btrim(coalesce(_zone_code,'')));
  _use text := upper(btrim(coalesce(_use_code,'')));
  _next integer;
  _id uuid;
  _actor uuid;
begin
  if not public.is_urban_regulation_admin_v1(_municipality_id) then
    raise exception 'Apenas a administracao municipal pode cadastrar normas.';
  end if;
  _actor := public.current_profile_id();
  if _actor is null then raise exception 'Perfil nao identificado.'; end if;
  if length(_zone) not between 1 and 40 or length(_use) not between 1 and 60
     or _effective_from is null then
    raise exception 'Zona, uso e inicio de vigencia sao obrigatorios.';
  end if;
  if _rules is null or jsonb_typeof(_rules)<>'array'
    or jsonb_array_length(_rules) not between 1 and 8 or pg_column_size(_rules)>20000 then
    raise exception 'Parametros legais incompletos ou acima do limite.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(_rules) x(rule)
    where jsonb_typeof(x.rule)<>'object'
       or coalesce(x.rule->>'metric','') not in
         ('front_setback_m','side_setback_m','rear_setback_m',
          'permeability_percent','occupancy_percent','floor_area_ratio','height_m','floor_count')
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
$$;
revoke all on function public.save_urban_regulation_draft_v1(uuid,text,text,date,jsonb) from public,anon;
grant execute on function public.save_urban_regulation_draft_v1(uuid,text,text,date,jsonb) to authenticated;

create or replace function public.activate_urban_regulation_v1(_version_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare _row public.urban_regulation_versions%rowtype;
begin
  select * into _row from public.urban_regulation_versions where id=_version_id;
  if _row.id is null then raise exception 'Versao nao encontrada.'; end if;
  if not public.is_urban_regulation_admin_v1(_row.municipality_id) then
    raise exception 'Sem permissao para validar normas.';
  end if;
  perform pg_advisory_xact_lock(hashtext(_row.municipality_id::text),
    hashtext(_row.zone_code||'/'||_row.use_code));
  select * into _row from public.urban_regulation_versions
    where id=_version_id for update;
  if _row.status <> 'draft' then
    raise exception 'Apenas rascunhos ainda nao aprovados podem ser ativados.';
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
$$;
revoke all on function public.activate_urban_regulation_v1(uuid) from public,anon;
grant execute on function public.activate_urban_regulation_v1(uuid) to authenticated;

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
      measurements,reviewer_profile_id,created_at
      from public.process_urban_precheck_runs
      where process_id=_process_id order by created_at desc limit 100) t
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.list_urban_prechecks_v1(uuid) from public,anon;
grant execute on function public.list_urban_prechecks_v1(uuid) to authenticated;

create or replace function public.save_urban_precheck_run_v1(
  _process_id uuid,_regulation_version_id uuid,_measurements jsonb
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
    or (select count(*) from jsonb_each(_measurements)) not between 1 and 8 then
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
$$;
revoke all on function public.save_urban_precheck_run_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_urban_precheck_run_v1(uuid,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
