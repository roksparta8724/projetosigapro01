-- SIGAPRO QA: prevent external applicants from approving their own
-- preprotocol attachments, falsifying document provenance or bypassing
-- mandatory checklist requirements. Isolated database only.
-- Preserve the current function's tenant, profile, draft, and write logic.
-- This migration changes FUNCTION SOURCE only; no process/document rows.
DO $qa$
DECLARE
  _definition text;
  _old text;
  _new text;
BEGIN
  IF current_database()<>'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'QA-only preprotocol-document hardening refused on another DB';
  END IF;
  SELECT pg_get_functiondef('public.update_external_preprotocol_draft_v1(uuid,jsonb)'::regprocedure)
    INTO _definition;
  IF _definition IS NULL OR position('SECURITY DEFINER' IN _definition)=0
     OR position('if not public.has_process_access(_process.id)' IN lower(_definition))=0
  THEN RAISE EXCEPTION 'Unexpected preprotocol draft function: refusing rewrite'; END IF;
  -- Protected edit 1/8 (exact source fingerprint).
  _old := $old0$is_required=coalesce(nullif(_doc->>'required','')::boolean,is_required)$old0$;
  _new := $new0$is_required=is_required$new0$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 1'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 2/8 (exact source fingerprint).
  _old := $old1$review_status=coalesce(nullif(_doc->>'reviewStatus',''),review_status)$old1$;
  _new := $new1$review_status=review_status$new1$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 2'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 3/8 (exact source fingerprint).
  _old := $old2$annotations=coalesce(_doc->'annotations',annotations)$old2$;
  _new := $new2$annotations=annotations$new2$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 3'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 4/8 (exact source fingerprint).
  _old := $old3$is_valid=true,
            invalidated_at=null$old3$;
  _new := $new3$is_valid=is_valid,
            invalidated_at=invalidated_at$new3$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 4'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 5/8 (exact source fingerprint).
  _old := $old4$coalesce(nullif(_doc->>'source',''),'profissional')$old4$;
  _new := $new4$'profissional'$new4$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 5'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 6/8 (exact source fingerprint).
  _old := $old5$coalesce(nullif(_doc->>'reviewStatus',''),'pendente')$old5$;
  _new := $new5$'pendente'$new5$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 6'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 7/8 (exact source fingerprint).
  _old := $old6$coalesce(_doc->'annotations','[]'::jsonb)$old6$;
  _new := $new6$'[]'::jsonb$new6$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 7'; END IF;
  _definition:=replace(_definition,_old,_new);
  -- Protected edit 8/8 (exact source fingerprint).
  _old := $old7$and d.source='profissional'
      and not exists ($old7$;
  _new := $new7$and d.source='profissional'
      and coalesce(d.is_required,false)=false
      and not exists ($new7$;
  IF (length(_definition)-length(replace(_definition,_old,'')))<>length(_old)
  THEN RAISE EXCEPTION 'QA preprotocol function changed: expected exactly one match at guard 8'; END IF;
  _definition:=replace(_definition,_old,_new);
  EXECUTE _definition;
END $qa$;

NOTIFY pgrst, 'reload schema';
