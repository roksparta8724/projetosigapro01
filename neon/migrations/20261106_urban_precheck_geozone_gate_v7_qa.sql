-- SIGAPRO QA | v7: competência municipal + GIS real + mesma zona/uso + evidência legal.
-- Nunca promover sem aceitação E2E e mapa oficial georreferenciado.
CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v7(
  _process_id uuid,_regulation_version_id uuid,_reference_date date,
  _measurements jsonb,_legal_review jsonb,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _geo jsonb;_rule public.urban_regulation_versions%rowtype;
  _municipality uuid;_map_date date;
BEGIN
  IF _process_id IS NULL OR _regulation_version_id IS NULL OR _reference_date IS NULL THEN
    RAISE EXCEPTION 'Processo, norma e data legal são obrigatórios';
  END IF;
  _geo:=public.urban_zoning_resolve_process_v1(_process_id);
  IF _geo->>'status'<>'verified' OR coalesce((_geo->>'zoneVerified')::boolean,false)<>true
    OR (_geo->>'mapSha256') !~ '^[0-9a-f]{64}$'
    OR (_geo->>'parcelSha256') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Gravação bloqueada: perímetro, mapa municipal e zona ainda não homologados';
  END IF;
  _map_date:=(_geo->>'asOf')::date;
  IF _reference_date IS DISTINCT FROM _map_date THEN
    RAISE EXCEPTION 'Data de referência não corresponde à data municipal usada no mapa';
  END IF;
  SELECT municipality_id INTO _municipality FROM public.processes WHERE id=_process_id;
  SELECT * INTO _rule FROM public.urban_regulation_versions WHERE id=_regulation_version_id;
  IF _rule.id IS NULL OR _rule.municipality_id IS DISTINCT FROM _municipality
    OR upper(btrim(_rule.zone_code)) IS DISTINCT FROM upper(btrim(_geo->>'zoneCode'))
    OR upper(btrim(_rule.zone_code)) LIKE 'QA-%'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(_rule.rules) r
      WHERE r->>'reference' ~* 'LEI[[:space:]]+FICT[IÍ]CIA[[:space:]]+QA') THEN
    RAISE EXCEPTION 'Norma fictícia ou zona incompatível com mapa municipal verificado';
  END IF;
  -- v6 continua validando toda evidência legal (uso, índice, artigo, página,
  -- vigência, isolamento, dupla conferência) e v5 garante a assinatura consultiva.
  RETURN public.save_urban_precheck_run_v6(
    _process_id,_regulation_version_id,_reference_date,
    _measurements,_legal_review,_request_id
  );
END;$$;

REVOKE ALL ON FUNCTION public.save_urban_precheck_run_v7(uuid,uuid,date,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_urban_precheck_run_v7(uuid,uuid,date,jsonb,jsonb,uuid) TO authenticated;
-- Entrada antiga sem GIS não pode ser chamada diretamente pela UI/Neon Data API.
REVOKE EXECUTE ON FUNCTION public.save_urban_precheck_run_v6(uuid,uuid,date,jsonb,jsonb,uuid) FROM PUBLIC,authenticated;
