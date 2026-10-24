-- SIGAPRO IA: at-most-once persistence per client request, in isolated QA first.
-- Each user operation supplies an immutable UUID; retries reuse it.
ALTER TABLE public.process_urban_precheck_runs
  ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS process_urban_precheck_request_id_unique
  ON public.process_urban_precheck_runs(request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v5(
  _process_id uuid, _regulation_version_id uuid, _reference_date date,
  _measurements jsonb, _legal_review jsonb, _request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public
SET row_security TO off
AS $body$
DECLARE _existing public.process_urban_precheck_runs%rowtype;
        _saved jsonb;
BEGIN
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'Identificador unico da solicitacao obrigatorio.';
  END IF;
  IF NOT public.can_write_process_analysis(_process_id) THEN
    RAISE EXCEPTION 'Somente o analista responsavel ou Diretoria pode registrar a revisao.';
  END IF;
  -- Serialize simultaneous retries with the same key before checking history.
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 0));
  SELECT * INTO _existing FROM public.process_urban_precheck_runs
    WHERE request_id = _request_id;
  IF FOUND THEN
    IF _existing.process_id <> _process_id
       OR _existing.regulation_version_id <> _regulation_version_id
       OR _existing.reference_date IS DISTINCT FROM _reference_date
       OR _existing.measurements IS DISTINCT FROM _measurements
       OR (_existing.legal_review - 'reviewed_by_profile_id' - 'reviewed_at')
         IS DISTINCT FROM (
           jsonb_build_object(
             'evidence_ids',_legal_review->'evidence_ids',
             'note',btrim(coalesce(_legal_review->>'note','')),
             'document_scope_confirmed',coalesce(_legal_review->>'document_scope_confirmed','false')='true'
           )
         )
    THEN RAISE EXCEPTION 'Identificador de solicitacao reutilizado com dados diferentes.'; END IF;
    RETURN jsonb_build_object('id',_existing.id,'status','advisory','signed',false,
      'idempotent_replay',true,'scoped_legal_review',true);
  END IF;
  _saved := public.save_urban_precheck_run_v4(
    _process_id,_regulation_version_id,_reference_date,_measurements,_legal_review
  );
  UPDATE public.process_urban_precheck_runs SET request_id=_request_id
    WHERE id=(_saved->>'id')::uuid AND process_id=_process_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Falha ao vincular solicitacao ao historico.'; END IF;
  RETURN _saved || jsonb_build_object('idempotent_replay',false);
END
$body$;
