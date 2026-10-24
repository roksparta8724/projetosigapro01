-- SIGAPRO IA / legally traceable PDF excerpts — QA FIRST, do NOT deploy automatically.
-- Contains ONLY excerpts explicitly confirmed by a municipal administrator.
-- No PDF bytes, payment, signatures, process changes or rule activation.
begin;
create table if not exists public.urban_legal_evidence_catalog (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  document_title text not null check (length(btrim(document_title)) between 1 and 180),
  document_sha256 text not null check (document_sha256 ~ '^[a-f0-9]{64}$'),
  page_number integer not null check (page_number between 1 and 10000),
  metric text not null check (metric in
    ('front_setback_m','side_setback_m','rear_setback_m','permeability_percent',
     'occupancy_percent','floor_area_ratio','height_m','floor_count')),
  excerpt text not null check (length(btrim(excerpt)) between 15 and 500),
  confirmed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists urban_legal_evidence_dedup
  on public.urban_legal_evidence_catalog(
    municipality_id,document_sha256,page_number,metric,md5(excerpt)
  );
create index if not exists urban_legal_evidence_scope
  on public.urban_legal_evidence_catalog(municipality_id,created_at desc);
alter table public.urban_legal_evidence_catalog enable row level security;
revoke all on public.urban_legal_evidence_catalog from public, authenticated;

create or replace function public.list_urban_legal_evidence_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
begin
  if _municipality_id is null or not (
    public.is_master() or
    (public.has_tenant_access(_municipality_id) and public.is_internal_municipality_role())
  ) then
    raise exception 'Acesso negado ao acervo legal municipal.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (select id,municipality_id,document_title,document_sha256,
      page_number,metric,excerpt,created_at
      from public.urban_legal_evidence_catalog
      where municipality_id=_municipality_id
      order by created_at desc limit 250) t
  ), '[]'::jsonb);
end; $$;
revoke all on function public.list_urban_legal_evidence_v1(uuid) from public;
grant execute on function public.list_urban_legal_evidence_v1(uuid) to authenticated;

create or replace function public.save_urban_legal_evidence_v1(
  _municipality_id uuid, _document_title text, _document_sha256 text,
  _page_number integer, _metric text, _excerpt text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
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
       'occupancy_percent','floor_area_ratio','height_m','floor_count')
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
end; $$;
revoke all on function public.save_urban_legal_evidence_v1(uuid,text,text,integer,text,text) from public;
grant execute on function public.save_urban_legal_evidence_v1(uuid,text,text,integer,text,text) to authenticated;
commit;
