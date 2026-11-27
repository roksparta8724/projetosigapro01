-- SIGAPRO QA 2026-11-06 — reconnect prepared urban legal work to the
-- authenticated analysis workspace, without treating OCR or draft as law.
-- Read-only RPC: never changes draft matrices, PDFs, zones or process status.
CREATE OR REPLACE FUNCTION public.get_urban_process_legal_baseline_v1(_process_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off
AS $$
DECLARE
  _p public.processes%rowtype;
  _b public.urban_matrix_batch_staging_v1%rowtype;
  _settings jsonb;
  _rows integer:=0;
  _reviewed integer:=0;
  _needs_correction integer:=0;
  _quadro_ii_pages integer:=0;
  _quadro_ii_drafts integer:=0;
  _quadro_ii_unverified integer:=0;
  _active_real integer:=0;
  _legal_evidence integer:=0;
  _documents jsonb:='[]'::jsonb;
BEGIN
  IF _process_id IS NULL OR public.current_profile_id() IS NULL OR
     lower(coalesce(public.current_role_code(),'')) NOT IN
       ('analista','analyst','prefeitura_supervisor') THEN
    RETURN jsonb_build_object('status','access_denied');
  END IF;
  SELECT * INTO _p FROM public.processes WHERE id=_process_id;
  IF _p.id IS NULL OR _p.municipality_id IS NULL OR
     _p.tenant_id IS DISTINCT FROM _p.municipality_id OR
     NOT public.has_process_access(_process_id) OR
     NOT EXISTS(
       SELECT 1 FROM public.profiles pr
       WHERE pr.id=public.current_profile_id()
         AND pr.municipality_id=_p.municipality_id
         AND pr.deleted_at IS NULL AND pr.account_status='active'
     ) THEN
    RETURN jsonb_build_object('status','access_denied');
  END IF;

  SELECT general_settings INTO _settings FROM public.municipality_settings
    WHERE municipality_id=_p.municipality_id;
  _settings:=coalesce(_settings,'{}'::jsonb);

  -- Only filenames from the already recorded institutional slots.
  -- R2 references are not returned to the browser by this diagnostic.
  SELECT coalesce(jsonb_agg(jsonb_build_object('slot',f.slot,'name',f.name)),'[]'::jsonb)
  INTO _documents
  FROM (VALUES
      ('uso_solo',_settings->>'uso_solo_arquivo_nome',_settings->>'uso_solo_arquivo_url'),
      ('zoneamento',_settings->>'zoneamento_arquivo_nome',coalesce(_settings->>'zoneamento_arquivo_url',_settings->>'zoning_map_file_url')),
      ('leis_complementares',_settings->>'leis_arquivo_nome',_settings->>'leis_arquivo_url'),
      ('plano_diretor',_settings->>'plano_diretor_arquivo_nome',_settings->>'plano_diretor_arquivo_url')
  ) AS f(slot,name,ref)
  WHERE nullif(btrim(coalesce(f.name,'')),'') IS NOT NULL AND
        f.name ~* '[.]pdf$' AND
        f.ref LIKE ('r2:municipalities/'||_p.municipality_id::text||'/legislation-%');

  SELECT * INTO _b FROM public.urban_matrix_batch_staging_v1
  WHERE municipality_id=_p.municipality_id AND status='pending_legal_review'
  ORDER BY created_at DESC LIMIT 1;

  IF _b.id IS NOT NULL AND jsonb_typeof(_b.source_rows)='array' AND
    jsonb_typeof(_b.reviewed_indexes)='array' THEN
    _rows:=jsonb_array_length(_b.source_rows);
    SELECT count(*) FILTER (WHERE (
        CASE WHEN audit.action='reading_verified' THEN true
             WHEN audit.action='needs_correction' THEN false
             ELSE _b.reviewed_indexes @> jsonb_build_array(i.n)
        END
      )),
      count(*) FILTER (WHERE audit.action='needs_correction')
    INTO _reviewed,_needs_correction
    FROM generate_series(0,_rows-1) AS i(n)
    LEFT JOIN LATERAL (
      SELECT a.action FROM public.urban_matrix_reading_audit_v2 a
      WHERE a.batch_id=_b.id AND a.municipality_id=_p.municipality_id
        AND a.row_index=i.n
      ORDER BY a.created_at DESC,a.id DESC LIMIT 1
    ) AS audit ON true;
  END IF;

  SELECT count(DISTINCT page_number)
    INTO _quadro_ii_pages
  FROM public.urban_quadro_ii_source_evidence_v1
  WHERE municipality_id=_p.municipality_id;
  SELECT count(*) INTO _quadro_ii_drafts
  FROM public.urban_quadro_ii_draft_entries_v1
  WHERE municipality_id=_p.municipality_id
    AND status='draft_unverified';
  SELECT coalesce(sum(CASE WHEN jsonb_typeof(proposals)='array'
    THEN jsonb_array_length(proposals) ELSE 0 END),0)
  INTO _quadro_ii_unverified
  FROM public.urban_quadro_ii_source_evidence_v1
  WHERE municipality_id=_p.municipality_id;

  SELECT count(*) INTO _active_real
  FROM public.urban_regulation_versions
  WHERE municipality_id=_p.municipality_id AND status='active'
    AND zone_code NOT LIKE 'QA-%'
    AND NOT rules::text ~* 'LEI FICTICIA QA SEM VALIDADE LEGAL';
  SELECT count(*) INTO _legal_evidence
  FROM public.urban_legal_evidence_scopes
  WHERE municipality_id=_p.municipality_id;

  RETURN jsonb_build_object(
    'status','available','municipalityId',_p.municipality_id,
    'documents',_documents,
    'quadroI',jsonb_build_object(
      'sourceDocument',coalesce(_b.document_title,''),
      'sourceSha256',coalesce(_b.document_sha256,''),
      'rows',_rows,'reviewed',_reviewed,
      'needsCorrection',_needs_correction,
      'pending',greatest(0,_rows-_reviewed),
      'legalStatus','pending_legal_review'
    ),
    'quadroII',jsonb_build_object(
      'pages',_quadro_ii_pages,'draftEntries',_quadro_ii_drafts,
      'machineSuggestions',_quadro_ii_unverified,
      'legalStatus','draft_unverified'
    ),
    'activeRealRegulations',_active_real,
    'verifiedLegalScopes',_legal_evidence,
    'automaticallyApproved',false,
    'legalConformity','not_evaluated'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_urban_process_legal_baseline_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_urban_process_legal_baseline_v1(uuid) TO authenticated;
