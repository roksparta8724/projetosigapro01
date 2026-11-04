-- SIGAPRO IA | Quadro II, LC 379/2009: staging and page provenance only.
-- No automatic zoning decisions, no effective-date inference and no activation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.urban_quadro_ii_draft_entries_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.urban_matrix_batch_staging_v1(id) ON DELETE RESTRICT,
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  page_number integer NOT NULL CHECK (page_number BETWEEN 38 AND 51),
  category_code text NOT NULL CHECK (length(btrim(category_code)) BETWEEN 1 AND 32),
  use_description text NOT NULL CHECK (length(btrim(use_description)) BETWEEN 5 AND 200),
  permitted_zones_text text NOT NULL DEFAULT '' CHECK (length(permitted_zones_text) <= 600),
  road_hierarchy_text text NOT NULL DEFAULT '' CHECK (length(road_hierarchy_text) <= 600),
  parking_requirement_text text NOT NULL DEFAULT '' CHECK (length(parking_requirement_text) <= 600),
  special_conditions_text text NOT NULL DEFAULT '' CHECK (length(special_conditions_text) <= 800),
  source_excerpt text NOT NULL CHECK (length(btrim(source_excerpt)) BETWEEN 20 AND 1600),
  status text NOT NULL DEFAULT 'draft_unverified' CHECK (status = 'draft_unverified'),
  request_id uuid NOT NULL,
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (municipality_id, request_id)
);
CREATE INDEX IF NOT EXISTS urban_quadro_ii_draft_lookup_v1 ON public.urban_quadro_ii_draft_entries_v1
 (municipality_id,batch_id,page_number,created_at DESC);
ALTER TABLE public.urban_quadro_ii_draft_entries_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urban_quadro_ii_draft_entries_v1 FROM PUBLIC;
REVOKE ALL ON public.urban_quadro_ii_draft_entries_v1 FROM authenticated;

CREATE OR REPLACE FUNCTION public.list_urban_quadro_ii_workspace_v1(_municipality_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE
 _batch public.urban_matrix_batch_staging_v1%rowtype;
 _last_action text;
 _pages jsonb;
 _entries jsonb;
BEGIN
 IF public.current_profile_id() IS NULL OR NOT public.is_urban_regulation_admin_v1(_municipality_id)
 THEN RAISE EXCEPTION 'Acesso ao Quadro II nao autorizado para esta prefeitura.'; END IF;
 SELECT * INTO _batch FROM public.urban_matrix_batch_staging_v1
 WHERE municipality_id=_municipality_id AND document_sha256 ~ '^[0-9a-f]{64}$'
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('status','no_source','pages','[]'::jsonb,'entries','[]'::jsonb);
 END IF;
 SELECT action INTO _last_action FROM public.urban_matrix_reading_audit_v2
  WHERE municipality_id=_municipality_id AND batch_id=_batch.id AND row_index IS NULL
  ORDER BY created_at DESC,id DESC LIMIT 1;
 IF _last_action='archive' THEN
   RETURN jsonb_build_object('status','archived_source','document_title',_batch.document_title,
     'pages','[]'::jsonb,'entries','[]'::jsonb);
 END IF;
 SELECT jsonb_agg(jsonb_build_object('page_number',p,
   'topic',CASE
     WHEN p BETWEEN 38 AND 40 THEN 'Institucional'
     WHEN p BETWEEN 41 AND 42 THEN 'Industrial'
     WHEN p BETWEEN 43 AND 46 THEN 'Serviços'
     WHEN p BETWEEN 47 AND 50 THEN 'Comercial'
     ELSE 'Parcelamento do solo'
   END,
   'visual_warning',p=43,
   'draft_count',(SELECT COUNT(*) FROM public.urban_quadro_ii_draft_entries_v1 e
     WHERE e.municipality_id=_municipality_id AND e.batch_id=_batch.id
       AND e.page_number=p)
 ) ORDER BY p) INTO _pages FROM generate_series(38,51) p;
 SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.page_number,r.created_at), '[]'::jsonb)
 INTO _entries FROM (
    SELECT id,page_number,category_code,use_description,
     permitted_zones_text,road_hierarchy_text,parking_requirement_text,
     special_conditions_text,source_excerpt,status,created_by_profile_id,created_at
    FROM public.urban_quadro_ii_draft_entries_v1
    WHERE municipality_id=_municipality_id AND batch_id=_batch.id
    ORDER BY page_number,created_at LIMIT 500
 ) r;
 RETURN jsonb_build_object('status','pending_legal_review','batch_id',_batch.id,
  'document_title',_batch.document_title,'document_sha256',_batch.document_sha256,
  'pages',COALESCE(_pages,'[]'::jsonb),'entries',COALESCE(_entries,'[]'::jsonb),
  'legal_approval',false,'ready_for_ai',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_urban_quadro_ii_draft_entry_v1(
  _municipality_id uuid, _batch_id uuid, _document_sha256 text,
  _page_number integer, _category_code text, _use_description text,
  _permitted_zones_text text, _road_hierarchy_text text,
  _parking_requirement_text text, _special_conditions_text text,
  _source_excerpt text, _request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE
 _actor uuid:=public.current_profile_id();
 _batch public.urban_matrix_batch_staging_v1%rowtype;
 _last_action text;
 _saved_id uuid;
BEGIN
 IF _actor IS NULL OR NOT public.is_urban_regulation_admin_v1(_municipality_id)
 THEN RAISE EXCEPTION 'Somente administrador municipal pode registrar transcricoes.'; END IF;
 IF _request_id IS NULL OR
    _page_number NOT BETWEEN 38 AND 51 OR
    length(btrim(coalesce(_category_code,''))) NOT BETWEEN 1 AND 32 OR
    length(btrim(coalesce(_use_description,''))) NOT BETWEEN 5 AND 200 OR
    length(coalesce(_permitted_zones_text,'')) > 600 OR
    length(coalesce(_road_hierarchy_text,'')) > 600 OR
    length(coalesce(_parking_requirement_text,'')) > 600 OR
    length(coalesce(_special_conditions_text,'')) > 800 OR
    length(btrim(coalesce(_source_excerpt,''))) NOT BETWEEN 20 AND 1600
 THEN RAISE EXCEPTION 'Preencha categoria, descricao, trecho literal e pagina do Quadro II.'; END IF;
 SELECT * INTO _batch FROM public.urban_matrix_batch_staging_v1
 WHERE id=_batch_id AND municipality_id=_municipality_id
   AND document_sha256=_document_sha256 AND status='pending_legal_review';
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento nao pertence ao municipio ou SHA incorreto.'; END IF;
 SELECT action INTO _last_action FROM public.urban_matrix_reading_audit_v2
 WHERE municipality_id=_municipality_id AND batch_id=_batch_id AND row_index IS NULL
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF _last_action='archive' THEN RAISE EXCEPTION 'Documento arquivado: restaure antes de transcrever.'; END IF;
 INSERT INTO public.urban_quadro_ii_draft_entries_v1 (
   municipality_id,batch_id,document_sha256,page_number,category_code,
   use_description,permitted_zones_text,road_hierarchy_text,
   parking_requirement_text,special_conditions_text,source_excerpt,
   request_id,created_by_profile_id
 ) VALUES (
   _municipality_id,_batch_id,_document_sha256,_page_number,
   btrim(_category_code),btrim(_use_description),
   btrim(coalesce(_permitted_zones_text,'')),btrim(coalesce(_road_hierarchy_text,'')),
   btrim(coalesce(_parking_requirement_text,'')),btrim(coalesce(_special_conditions_text,'')),
   btrim(_source_excerpt),_request_id,_actor
 ) ON CONFLICT (municipality_id,request_id) DO NOTHING RETURNING id INTO _saved_id;
 IF _saved_id IS NULL THEN
   SELECT id INTO _saved_id FROM public.urban_quadro_ii_draft_entries_v1
   WHERE municipality_id=_municipality_id AND request_id=_request_id
     AND batch_id=_batch_id AND page_number=_page_number;
 END IF;
 IF _saved_id IS NULL THEN RAISE EXCEPTION 'Idempotencia recusada: identificador utilizado em outra fonte.'; END IF;
 RETURN jsonb_build_object('id',_saved_id,'status','draft_unverified',
   'ready_for_ai',false,'legal_approval',false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_urban_quadro_ii_workspace_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_urban_quadro_ii_draft_entry_v1(uuid,uuid,text,integer,text,text,text,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_urban_quadro_ii_workspace_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_urban_quadro_ii_draft_entry_v1(uuid,uuid,text,integer,text,text,text,text,text,text,text,uuid) TO authenticated;
COMMIT;
