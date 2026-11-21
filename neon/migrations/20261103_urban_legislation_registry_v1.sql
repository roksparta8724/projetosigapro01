-- SIGAPRO | Cadastro multi-tenant, imutavel e auditavel de normas urbanisticas.
-- Registros nao ativam nem alimentam a IA; apenas armazenam PDFs originais.
BEGIN;
CREATE TABLE IF NOT EXISTS public.urban_legislation_documents_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 document_kind text NOT NULL CHECK(document_kind IN
 ('lei_complementar','lei_ordinaria','decreto','plano_diretor','mapa','anexo','portaria','projeto_de_lei','outro')),
 document_number text NOT NULL CHECK(length(btrim(document_number)) BETWEEN 1 AND 50),
 document_year integer NOT NULL CHECK(document_year BETWEEN 1900 AND 2100),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100000),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 8 AND 250),
 legal_scope text NOT NULL CHECK(legal_scope IN
 ('geral','aprovacao_ordinaria','habite_se','parcelamento','regularizacao','direito_real_laje','zoneamento','plano_diretor','historico')),
 official_source_url text CHECK(official_source_url IS NULL OR
 (length(official_source_url)<=1200 AND official_source_url ~ '^https://[^[:space:]]+$')),
 publication_date date,
 effective_from date,
 related_document_id uuid,
 relation_type text CHECK(relation_type IS NULL OR
 relation_type IN ('altera','revoga','regulamenta','complementa','consolida','substitui')),
 storage_bucket text NOT NULL DEFAULT 'process-documents'
 CHECK(storage_bucket='process-documents'),
 storage_key text NOT NULL CHECK(length(storage_key) BETWEEN 90 AND 1200 AND
 storage_key LIKE ('municipalities/' || municipality_id::text || '/legislation-registry/%')),
 file_name text NOT NULL CHECK(length(btrim(file_name)) BETWEEN 5 AND 255 AND
 lower(file_name) LIKE '%.pdf'),
 file_size_bytes bigint NOT NULL CHECK(file_size_bytes BETWEEN 1 AND 104857600),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 verification_status text NOT NULL DEFAULT 'pending_legal_review'
 CHECK(verification_status IN ('pending_legal_review','proposal_not_enacted')),
 ready_for_ai boolean NOT NULL DEFAULT false CHECK(ready_for_ai=false),
 request_id uuid NOT NULL,
 created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,municipality_id),
 UNIQUE(municipality_id,document_kind,document_number,document_year,revision),
 UNIQUE(municipality_id,storage_key),
 UNIQUE(municipality_id,request_id),
 CONSTRAINT urban_legal_document_same_tenant_relation_v1
 FOREIGN KEY(related_document_id,municipality_id)
 REFERENCES public.urban_legislation_documents_v1(id,municipality_id),
 CONSTRAINT urban_legal_document_relation_pair_v1
 CHECK((relation_type IS NULL AND related_document_id IS NULL) OR
 (relation_type IS NOT NULL AND related_document_id IS NOT NULL)),
 CONSTRAINT urban_legal_document_dates_v1
 CHECK((publication_date IS NULL OR publication_date>=DATE '1900-01-01') AND
 (effective_from IS NULL OR effective_from>=DATE '1900-01-01'))
);
CREATE UNIQUE INDEX IF NOT EXISTS urban_legal_document_hash_dedup_v1
 ON public.urban_legislation_documents_v1
 (municipality_id,document_kind,document_number,document_year,sha256);
CREATE INDEX IF NOT EXISTS urban_legal_document_list_v1
 ON public.urban_legislation_documents_v1(municipality_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS public.urban_legislation_events_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL,
 document_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('archive','restore')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 12 AND 1000),
 request_id uuid NOT NULL,
 created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,municipality_id)
 REFERENCES public.urban_legislation_documents_v1(id,municipality_id),
 UNIQUE(municipality_id,request_id)
);
CREATE INDEX IF NOT EXISTS urban_legislation_events_lookup_v1
 ON public.urban_legislation_events_v1(municipality_id,document_id,created_at DESC,id DESC);
ALTER TABLE public.urban_legislation_documents_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urban_legislation_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urban_legislation_documents_v1 FROM PUBLIC, authenticated;
REVOKE ALL ON public.urban_legislation_events_v1 FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.list_urban_legislation_documents_v1(
 _municipality_id uuid,_offset integer DEFAULT 0,_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE _items jsonb; _total integer;
BEGIN
 IF _municipality_id IS NULL OR public.current_profile_id() IS NULL OR NOT
  (public.is_master() OR (public.has_tenant_access(_municipality_id)
   AND public.is_internal_municipality_role()))
 THEN RAISE EXCEPTION 'Acervo legislativo nao autorizado para esta prefeitura.'; END IF;
 IF _offset NOT BETWEEN 0 AND 100000 OR _limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Paginacao invalida.'; END IF;
 SELECT count(*) INTO _total FROM public.urban_legislation_documents_v1
 WHERE municipality_id=_municipality_id;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id DESC),'[]'::jsonb)
 INTO _items FROM (
  SELECT d.id,d.municipality_id,d.document_kind,d.document_number,d.document_year,
   d.revision,d.title,d.legal_scope,d.official_source_url,d.publication_date,
   d.effective_from,d.related_document_id,d.relation_type,d.storage_key,d.file_name,
   d.file_size_bytes,d.sha256,d.verification_status,d.ready_for_ai,
   d.created_by_profile_id,d.created_at,
   coalesce((SELECT e.action='archive' FROM public.urban_legislation_events_v1 e
    WHERE e.municipality_id=d.municipality_id AND e.document_id=d.id
    ORDER BY e.created_at DESC,e.id DESC LIMIT 1),false) AS archived
  FROM public.urban_legislation_documents_v1 d
  WHERE d.municipality_id=_municipality_id
  ORDER BY d.created_at DESC,d.id DESC LIMIT _limit OFFSET _offset
 ) t;
 RETURN jsonb_build_object('items',_items,'total',_total,
  'next_offset',CASE WHEN _offset+_limit<_total THEN _offset+_limit ELSE NULL END);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.register_urban_legislation_document_v1(
 _municipality_id uuid,_payload jsonb,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE
 _actor uuid:=public.current_profile_id();
 _kind text:=btrim(coalesce(_payload->>'documentKind',''));
 _number text:=btrim(coalesce(_payload->>'documentNumber',''));
 _year integer; _title text:=btrim(coalesce(_payload->>'title',''));
 _scope text:=btrim(coalesce(_payload->>'legalScope',''));
 _url text:=nullif(btrim(coalesce(_payload->>'officialSourceUrl','')),'');
 _publication date; _effective date;
 _related uuid; _relation text:=nullif(btrim(coalesce(_payload->>'relationType','')),'');
 _key text:=btrim(coalesce(_payload->>'storageKey',''));
 _file text:=btrim(coalesce(_payload->>'fileName',''));
 _size bigint; _hash text:=lower(btrim(coalesce(_payload->>'sha256','')));
 _revision integer; _id uuid; _existing public.urban_legislation_documents_v1%rowtype;
BEGIN
 IF _actor IS NULL OR _municipality_id IS NULL OR _request_id IS NULL OR NOT
  (public.is_master() OR (public.has_tenant_access(_municipality_id)
   AND public.current_role_code()='prefeitura_supervisor'))
 THEN RAISE EXCEPTION 'Somente Master ou supervisor autorizado pode cadastrar normas.'; END IF;
 IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR
  coalesce(_payload->>'documentYear','') !~ '^[0-9]{4}$' OR
  coalesce(_payload->>'fileSizeBytes','') !~ '^[0-9]{1,9}$'
 THEN RAISE EXCEPTION 'Dados, ano ou tamanho invalidos.'; END IF;
 _year:=(_payload->>'documentYear')::integer;
 _size:=(_payload->>'fileSizeBytes')::bigint;
 IF coalesce(_payload->>'publicationDate','')<>'' THEN
  _publication:=(_payload->>'publicationDate')::date; END IF;
 IF coalesce(_payload->>'effectiveFrom','')<>'' THEN
  _effective:=(_payload->>'effectiveFrom')::date; END IF;
 IF coalesce(_payload->>'relatedDocumentId','')<>'' THEN
  _related:=(_payload->>'relatedDocumentId')::uuid; END IF;
 IF _kind NOT IN ('lei_complementar','lei_ordinaria','decreto','plano_diretor',
  'mapa','anexo','portaria','projeto_de_lei','outro') OR
  length(_number) NOT BETWEEN 1 AND 50 OR _year NOT BETWEEN 1900 AND 2100 OR
  length(_title) NOT BETWEEN 8 AND 250 OR
  _scope NOT IN ('geral','aprovacao_ordinaria','habite_se','parcelamento',
   'regularizacao','direito_real_laje','zoneamento','plano_diretor','historico') OR
  (_url IS NOT NULL AND (length(_url)>1200 OR _url !~ '^https://[^[:space:]]+$')) OR
  _size NOT BETWEEN 1 AND 104857600 OR _hash !~ '^[0-9a-f]{64}$' OR
  length(_file) NOT BETWEEN 5 AND 255 OR lower(_file) NOT LIKE '%.pdf' OR
  length(_key) NOT BETWEEN 90 AND 1200 OR
  _key NOT LIKE ('municipalities/'||_municipality_id::text||'/legislation-registry/%') OR
  ((_related IS NULL)<>(_relation IS NULL)) OR
  (_relation IS NOT NULL AND _relation NOT IN
   ('altera','revoga','regulamenta','complementa','consolida','substitui')) OR
  (_publication IS NOT NULL AND _publication<DATE '1900-01-01') OR
  (_effective IS NOT NULL AND _effective<DATE '1900-01-01')
 THEN RAISE EXCEPTION 'Confira lei, escopo, PDF, fonte, vigencia e SHA-256.'; END IF;
 IF _related IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.urban_legislation_documents_v1
  WHERE id=_related AND municipality_id=_municipality_id)
 THEN RAISE EXCEPTION 'Lei relacionada pertence a outro municipio ou nao existe.'; END IF;
 SELECT * INTO _existing FROM public.urban_legislation_documents_v1
 WHERE municipality_id=_municipality_id AND request_id=_request_id;
 IF FOUND THEN
  IF _existing.storage_key<>_key OR _existing.sha256<>_hash
  THEN RAISE EXCEPTION 'Requisicao repetida com PDF diferente.'; END IF;
  RETURN jsonb_build_object('id',_existing.id,'revision',_existing.revision,
   'ready_for_ai',false);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  _municipality_id::text||'|'||_kind||'|'||upper(_number)||'|'||_year::text,0));
 IF EXISTS(SELECT 1 FROM public.urban_legislation_documents_v1
  WHERE municipality_id=_municipality_id AND document_kind=_kind
   AND document_number=_number AND document_year=_year AND sha256=_hash)
 THEN RAISE EXCEPTION 'PDF ja registrado nesta lei. Consulte o historico.'; END IF;
 SELECT coalesce(max(revision),0)+1 INTO _revision
 FROM public.urban_legislation_documents_v1
 WHERE municipality_id=_municipality_id AND document_kind=_kind
  AND document_number=_number AND document_year=_year;
 INSERT INTO public.urban_legislation_documents_v1(
  municipality_id,document_kind,document_number,document_year,revision,title,
  legal_scope,official_source_url,publication_date,effective_from,
  related_document_id,relation_type,storage_key,file_name,file_size_bytes,
  sha256,verification_status,ready_for_ai,request_id,created_by_profile_id)
 VALUES(_municipality_id,_kind,_number,_year,_revision,_title,_scope,_url,
  _publication,_effective,_related,_relation,_key,_file,_size,_hash,
  CASE WHEN _kind='projeto_de_lei' THEN 'proposal_not_enacted'
   ELSE 'pending_legal_review' END,false,_request_id,_actor)
 RETURNING id INTO _id;
 RETURN jsonb_build_object('id',_id,'revision',_revision,'ready_for_ai',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_urban_legislation_archive_v1(
 _municipality_id uuid,_document_id uuid,_action text,_reason text,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE _actor uuid:=public.current_profile_id(); _id uuid;
BEGIN
 IF _actor IS NULL OR _municipality_id IS NULL OR _request_id IS NULL OR NOT
  (public.is_master() OR (public.has_tenant_access(_municipality_id)
   AND public.current_role_code()='prefeitura_supervisor'))
 THEN RAISE EXCEPTION 'Sem permissao para arquivar leis.'; END IF;
 IF _action NOT IN ('archive','restore') OR
  length(btrim(coalesce(_reason,''))) NOT BETWEEN 12 AND 1000
 THEN RAISE EXCEPTION 'Justificativa de 12 a 1000 caracteres obrigatoria.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.urban_legislation_documents_v1
  WHERE id=_document_id AND municipality_id=_municipality_id)
 THEN RAISE EXCEPTION 'Lei nao pertence a esta prefeitura.'; END IF;
 INSERT INTO public.urban_legislation_events_v1(
  municipality_id,document_id,action,reason,request_id,created_by_profile_id)
 VALUES(_municipality_id,_document_id,_action,btrim(_reason),_request_id,_actor)
 ON CONFLICT(municipality_id,request_id) DO NOTHING RETURNING id INTO _id;
 IF _id IS NULL THEN
  SELECT id INTO _id FROM public.urban_legislation_events_v1
  WHERE municipality_id=_municipality_id AND request_id=_request_id
   AND document_id=_document_id AND action=_action; END IF;
 IF _id IS NULL THEN RAISE EXCEPTION 'Requisicao de auditoria duplicada.'; END IF;
 RETURN jsonb_build_object('event_id',_id,'action',_action,'ready_for_ai',false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_urban_legislation_documents_v1(uuid,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_urban_legislation_document_v1(uuid,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_urban_legislation_archive_v1(uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_urban_legislation_documents_v1(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_urban_legislation_document_v1(uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_urban_legislation_archive_v1(uuid,uuid,text,text,uuid) TO authenticated;
COMMIT;
