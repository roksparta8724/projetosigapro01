-- Foundation missing from the older production Neon branch. All tables are PRIVATE and RLS-FORCED.
-- Only municipal verified drafts; no activated rules, QA payments or test data are inserted.
BEGIN;
CREATE TABLE IF NOT EXISTS public.urban_matrix_batch_staging_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 document_title text NOT NULL CHECK(char_length(document_title) BETWEEN 4 AND 180),
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
 source_municipality text NOT NULL CHECK(char_length(source_municipality) BETWEEN 2 AND 120),
 source_rows jsonb NOT NULL CHECK(jsonb_typeof(source_rows)='array'
  AND jsonb_array_length(source_rows) BETWEEN 1 AND 500
  AND pg_column_size(source_rows)<=250000),
 reviewed_indexes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reviewed_indexes)='array'),
 version integer NOT NULL,
 fingerprint text NOT NULL,
 status text NOT NULL DEFAULT 'pending_legal_review' CHECK(status='pending_legal_review'),
 reviewed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(municipality_id,document_sha256,version),
 UNIQUE(municipality_id,document_sha256,fingerprint)
);

CREATE INDEX IF NOT EXISTS urban_matrix_batch_staging_by_tenant ON public.urban_matrix_batch_staging_v1(municipality_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.urban_legal_matrix_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 document_title text NOT NULL CHECK(char_length(document_title) BETWEEN 4 AND 180),
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
 page_number integer NOT NULL CHECK(page_number BETWEEN 1 AND 10000),
 quadro text NOT NULL CHECK(quadro IN ('I','II')),
 zone_code text NOT NULL CONSTRAINT urban_matrix_zone_valid CHECK(zone_code ~ '^[A-Z0-9_()/.-]{1,40}$'),
 use_code text NOT NULL CONSTRAINT urban_matrix_use_valid CHECK(use_code ~ '^[A-Z0-9_. -]{1,60}$'),
 effective_from date NOT NULL,
 source_excerpt text NOT NULL CHECK(char_length(source_excerpt) BETWEEN 20 AND 6000),
 reviewed_entries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reviewed_entries)='array' AND jsonb_array_length(reviewed_entries) BETWEEN 1 AND 16 AND pg_column_size(reviewed_entries)<=20000),
 verification_method text NOT NULL CHECK(verification_method IN ('text_layer_verified','visual_double_transcription')),
 version integer NOT NULL,
 status text NOT NULL DEFAULT 'reviewed_draft' CHECK(status='reviewed_draft'),
 reviewed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(municipality_id,zone_code,use_code,quadro,version)
);

CREATE INDEX IF NOT EXISTS urban_matrix_by_scope ON public.urban_legal_matrix_imports(municipality_id,zone_code,use_code,quadro,version DESC);

ALTER TABLE public.urban_matrix_batch_staging_v1 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.urban_matrix_batch_staging_v1 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.urban_legal_matrix_imports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.urban_legal_matrix_imports FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.urban_matrix_batch_staging_v1,public.urban_legal_matrix_imports FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.list_urban_legal_matrix_imports_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
begin
  if not public.is_urban_regulation_admin_v1(_municipality_id) then
    raise exception 'Sem acesso ao acervo de matriz da prefeitura.';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (select * from public.urban_legal_matrix_imports
      where municipality_id = _municipality_id
      order by created_at desc limit 100) t),'[]'::jsonb);
end;
$function$;;

CREATE OR REPLACE FUNCTION public.list_urban_matrix_batch_staging_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
$function$;;

REVOKE ALL ON FUNCTION public.list_urban_legal_matrix_imports_v1(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_urban_legal_matrix_imports_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_urban_matrix_batch_staging_v1(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_urban_matrix_batch_staging_v1(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
