-- SIGAPRO 2026-10-31: QA-only whole-matrix intake. NEVER an active legal rule.
-- Apply to isolated Neon QA branch only; do not migrate production before review.
create table if not exists public.urban_matrix_batch_staging_v1 (
 id uuid primary key default gen_random_uuid(),
 municipality_id uuid not null references public.municipalities(id),
 document_title text not null,
 document_sha256 text not null,
 source_municipality text not null,
 source_rows jsonb not null,
 reviewed_indexes jsonb not null default '[]'::jsonb,
 version integer not null,
 fingerprint text not null,
 status text not null default 'pending_legal_review'
   check (status='pending_legal_review'),
 reviewed_by_profile_id uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check (char_length(document_title) between 4 and 180),
 check (document_sha256 ~ '^[0-9a-f]{64}$'),
 check (char_length(source_municipality) between 2 and 120),
 check (jsonb_typeof(source_rows)='array' and jsonb_array_length(source_rows) between 1 and 500),
 check (jsonb_typeof(reviewed_indexes)='array'),
 check (pg_column_size(source_rows)<=250000),
 unique(municipality_id,document_sha256,version),
 unique(municipality_id,document_sha256,fingerprint)
);
create index if not exists urban_matrix_batch_staging_by_tenant
 on public.urban_matrix_batch_staging_v1(municipality_id,created_at desc);
alter table public.urban_matrix_batch_staging_v1 enable row level security;
alter table public.urban_matrix_batch_staging_v1 force row level security;
revoke all on public.urban_matrix_batch_staging_v1 from public;
revoke all on public.urban_matrix_batch_staging_v1 from authenticated;

create or replace function public.save_urban_matrix_batch_staging_v1(
 _municipality_id uuid,_document_title text,_document_sha256 text,
 _source_municipality text,_source_rows jsonb,_reviewed_indexes jsonb,
 _legal_status text
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public' set row_security to 'off'
as $function$
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
 if not public.is_urban_regulation_admin_v1(_municipality_id) or _actor is null then
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

create or replace function public.list_urban_matrix_batch_staging_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' set row_security to 'off'
as $function$
begin
 if not public.is_urban_regulation_admin_v1(_municipality_id) then
  raise exception 'Acesso ao acervo de lotes não autorizado.';
 end if;
 return coalesce((
 select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
 select id,document_title,document_sha256,source_municipality,version,status,
   jsonb_array_length(source_rows) as total_rows,
   jsonb_array_length(reviewed_indexes) as reviewed_rows,created_at
 from public.urban_matrix_batch_staging_v1 where municipality_id=_municipality_id
 order by created_at desc limit 20) t
 ),'[]'::jsonb);
end;
$function$;
revoke all on function public.save_urban_matrix_batch_staging_v1(uuid,text,text,text,jsonb,jsonb,text) from public;
revoke all on function public.list_urban_matrix_batch_staging_v1(uuid) from public;
grant execute on function public.save_urban_matrix_batch_staging_v1(uuid,text,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.list_urban_matrix_batch_staging_v1(uuid) to authenticated;
notify pgrst,'reload schema';
