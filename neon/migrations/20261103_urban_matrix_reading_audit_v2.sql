-- SIGAPRO IA | Conferencia individual dos Quadros I/II em homologacao.
-- Mantem o lote original imutavel e NAO libera nenhuma regra urbanistica.
-- O arquivamento e um evento auditavel: jamais exclui o documento historico.
BEGIN;

CREATE TABLE IF NOT EXISTS public.urban_matrix_reading_audit_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.urban_matrix_batch_staging_v1(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('reading_verified', 'needs_correction', 'archive', 'restore')),
  row_index integer,
  page_number integer,
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 20 AND 1200),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT urban_matrix_reading_audit_shape_v2 CHECK (
    (action IN ('reading_verified', 'needs_correction')
      AND row_index BETWEEN 0 AND 499 AND page_number BETWEEN 1 AND 10000)
    OR
    (action IN ('archive', 'restore') AND row_index IS NULL AND page_number IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS urban_matrix_reading_audit_tenant_batch_v2
  ON public.urban_matrix_reading_audit_v2(municipality_id, batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS urban_matrix_reading_audit_rows_v2
  ON public.urban_matrix_reading_audit_v2(municipality_id, batch_id, row_index, created_at DESC)
  WHERE row_index IS NOT NULL;

ALTER TABLE public.urban_matrix_reading_audit_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.urban_matrix_reading_audit_v2 FROM PUBLIC;
REVOKE ALL ON TABLE public.urban_matrix_reading_audit_v2 FROM authenticated;

-- Somente o admin da mesma Prefeitura pode listar a trilha.
CREATE OR REPLACE FUNCTION public.list_urban_matrix_reading_audit_v2(_municipality_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public' SET row_security TO 'off'
AS $fn$
BEGIN
  IF public.current_profile_id() IS NULL OR
     NOT public.is_urban_regulation_admin_v1(_municipality_id) THEN
    RAISE EXCEPTION 'Sem acesso a conferencia municipal.';
  END IF;
  RETURN jsonb_build_object(
    'row_reviews', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id DESC)
      FROM (
        SELECT DISTINCT ON (batch_id, row_index)
          id,batch_id,row_index,page_number,action,note,created_at,actor_profile_id
        FROM public.urban_matrix_reading_audit_v2
        WHERE municipality_id=_municipality_id AND row_index IS NOT NULL
        ORDER BY batch_id,row_index,created_at DESC,id DESC
      ) r
    ), '[]'::jsonb),
    'batch_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC, b.id DESC)
      FROM (
        SELECT DISTINCT ON (batch_id)
          id,batch_id,action,note,created_at,actor_profile_id
        FROM public.urban_matrix_reading_audit_v2
        WHERE municipality_id=_municipality_id AND row_index IS NULL
        ORDER BY batch_id,created_at DESC,id DESC
      ) b
    ), '[]'::jsonb)
  );
END;
$fn$;

-- Registro novo, sem editar/regravar a importacao nem validar vigencia.
CREATE OR REPLACE FUNCTION public.record_urban_matrix_reading_action_v2(
  _municipality_id uuid,
  _batch_id uuid,
  _document_sha256 text,
  _action text,
  _row_index integer,
  _page_number integer,
  _note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public' SET row_security TO 'off'
AS $fn$
DECLARE
  _actor uuid:=public.current_profile_id();
  _batch public.urban_matrix_batch_staging_v1%rowtype;
  _source jsonb;
  _last_batch_action text;
  _id uuid;
BEGIN
  IF _actor IS NULL OR NOT public.is_urban_regulation_admin_v1(_municipality_id) THEN
    RAISE EXCEPTION 'Somente administrador municipal autenticado pode revisar este lote.';
  END IF;
  IF _action NOT IN ('reading_verified','needs_correction','archive','restore') OR
     length(btrim(COALESCE(_note,''))) NOT BETWEEN 20 AND 1200 THEN
    RAISE EXCEPTION 'Informe a decisao e justificativa da conferencia (20 a 1200 caracteres).';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_municipality_id::text),hashtext(_batch_id::text));
  SELECT * INTO _batch FROM public.urban_matrix_batch_staging_v1
    WHERE id=_batch_id AND municipality_id=_municipality_id
      AND status='pending_legal_review' FOR SHARE;
  IF NOT FOUND OR _batch.document_sha256 IS DISTINCT FROM _document_sha256 THEN
    RAISE EXCEPTION 'Lote ou SHA-256 nao corresponde ao documento original desta prefeitura.';
  END IF;
  SELECT action INTO _last_batch_action
    FROM public.urban_matrix_reading_audit_v2
    WHERE municipality_id=_municipality_id AND batch_id=_batch_id
      AND row_index IS NULL
    ORDER BY created_at DESC,id DESC LIMIT 1;

  IF _action IN ('reading_verified','needs_correction') THEN
    IF _last_batch_action='archive' THEN
      RAISE EXCEPTION 'Reative o lote arquivado antes de conferir a leitura.';
    END IF;
    IF _row_index IS NULL OR _row_index < 0 OR
       _row_index >= jsonb_array_length(_batch.source_rows) THEN
      RAISE EXCEPTION 'Indice de linha fora do documento de origem.';
    END IF;
    _source:=_batch.source_rows->_row_index;
    IF _page_number IS DISTINCT FROM (_source->>'pagina_pdf')::integer THEN
      RAISE EXCEPTION 'Pagina nao coincide com a fonte original da linha.';
    END IF;
    -- Trecho ilegivel ou duvidoso permanece pendente ate nova fonte conferivel.
    IF _action='reading_verified' AND
       length(btrim(COALESCE(_source->>'pendencias_de_leitura',''))) > 0 THEN
      RAISE EXCEPTION 'Leitura inconclusiva: registrar divergencia e pedir fonte legivel.';
    END IF;
    -- Recuos condicionais podem ter transcricao conferida; a excecao legal
    -- continua obrigatoria e este registro NUNCA libera a norma.
  ELSE
    IF _row_index IS NOT NULL OR _page_number IS NOT NULL THEN
      RAISE EXCEPTION 'Arquivamento/restauracao nao usa indice de linha.';
    END IF;
    IF (_action='archive' AND _last_batch_action='archive') OR
       (_action='restore' AND _last_batch_action IS DISTINCT FROM 'archive') THEN
      RAISE EXCEPTION 'O lote ja esta no estado solicitado.';
    END IF;
  END IF;

  INSERT INTO public.urban_matrix_reading_audit_v2 (
    municipality_id,batch_id,document_sha256,action,row_index,
    page_number,note,actor_profile_id
  ) VALUES (
    _municipality_id,_batch_id,_document_sha256,_action,
    _row_index,_page_number,btrim(_note),_actor
  ) RETURNING id INTO _id;

  RETURN jsonb_build_object('id',_id,'status','recorded',
    'action',_action,'legal_status','pending_legal_review');
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_urban_matrix_reading_audit_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_urban_matrix_reading_action_v2(uuid,uuid,text,text,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_urban_matrix_reading_audit_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_urban_matrix_reading_action_v2(uuid,uuid,text,text,integer,integer,text) TO authenticated;
COMMIT;
