-- SIGAPRO — Homologação: matriz de importação assistida de legislação.
-- Nunca ativa normas, não escreve em processos nem nos pagamentos.
-- Só registrar fonte, transcrição e interpretação conferida por administrador autorizado.
create table if not exists public.urban_legal_matrix_imports (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id),
  document_title text not null,
  document_sha256 text not null,
  page_number integer not null,
  quadro text not null check (quadro in ('I','II')),
  zone_code text not null,
  use_code text not null,
  effective_from date not null,
  source_excerpt text not null,
  reviewed_entries jsonb not null default '[]'::jsonb,
  verification_method text not null check (verification_method in ('text_layer_verified','visual_double_transcription')),
  version integer not null,
  status text not null default 'reviewed_draft'
    check (status = 'reviewed_draft'),
  reviewed_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  constraint urban_matrix_title_length check (char_length(document_title) between 4 and 180),
  constraint urban_matrix_hash_valid check (document_sha256 ~ '^[0-9a-f]{64}$'),
  constraint urban_matrix_page_valid check (page_number between 1 and 10000),
  constraint urban_matrix_zone_valid check (zone_code ~ '^[A-Z0-9_-]{1,40}$'),
  constraint urban_matrix_use_valid check (use_code ~ '^[A-Z0-9_ -]{1,60}$'),
  constraint urban_matrix_source_length check (char_length(source_excerpt) between 20 and 6000),
  constraint urban_matrix_entries_valid check (jsonb_typeof(reviewed_entries) = 'array' and jsonb_array_length(reviewed_entries) between 1 and 16
    and pg_column_size(reviewed_entries) <= 20000),
  unique (municipality_id,zone_code,use_code,quadro,version)
);
create index if not exists urban_matrix_by_scope on public.urban_legal_matrix_imports
  (municipality_id,zone_code,use_code,quadro,version desc);
alter table public.urban_legal_matrix_imports enable row level security;
alter table public.urban_legal_matrix_imports force row level security;
revoke all on public.urban_legal_matrix_imports from public;
revoke all on public.urban_legal_matrix_imports from authenticated;

create or replace function public.list_urban_legal_matrix_imports_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' set row_security to 'off'
as $function$
begin
  if not public.is_urban_regulation_admin_v1(_municipality_id) then
    raise exception 'Sem acesso ao acervo de matriz da prefeitura.';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (select * from public.urban_legal_matrix_imports
      where municipality_id = _municipality_id
      order by created_at desc limit 100) t),'[]'::jsonb);
end;
$function$;

create or replace function public.save_urban_legal_matrix_import_v1(
  _municipality_id uuid, _document_title text, _document_sha256 text,
  _page_number integer, _quadro text, _zone_code text, _use_code text,
  _effective_from date, _source_excerpt text, _reviewed_entries jsonb,
  _verification_method text
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' set row_security to 'off'
as $function$
declare
  _zone text := upper(btrim(coalesce(_zone_code,'')));
  _use text := upper(btrim(coalesce(_use_code,'')));
  _ver integer;
  _new_id uuid;
  _actor uuid := public.current_profile_id();
begin
  if not public.is_urban_regulation_admin_v1(_municipality_id) or _actor is null then
    raise exception 'Somente administração municipal autenticada pode revisar importações.';
  end if;
  if char_length(btrim(coalesce(_document_title,''))) not between 4 and 180
    or coalesce(_document_sha256,'') !~ '^[0-9a-f]{64}$'
    or coalesce(_page_number,0) not between 1 and 10000
    or _quadro not in ('I','II') or _zone !~ '^[A-Z0-9_-]{1,40}$'
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

revoke all on function public.list_urban_legal_matrix_imports_v1(uuid) from public;
revoke all on function public.save_urban_legal_matrix_import_v1(uuid,text,text,integer,text,text,text,date,text,jsonb,text) from public;
grant execute on function public.list_urban_legal_matrix_imports_v1(uuid) to authenticated;
grant execute on function public.save_urban_legal_matrix_import_v1(uuid,text,text,integer,text,text,text,date,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
