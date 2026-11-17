-- SIGAPRO / 2026-11-17
-- Personal process markers: at most three per authenticated profile and process.
-- The official situation is derived from ProcessRecord.status, not stored here.
-- Existing data is preserved (even legacy profiles with more than three tags).
-- This trigger is an atomic backstop; application controls enforce the same limit.
CREATE OR REPLACE FUNCTION public.enforce_three_personal_process_markers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $limit$
DECLARE
  _count integer;
BEGIN
  IF NEW.created_by_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize competing inserts for the same profile/process. This is NOT a
  -- global marker limit and does not prevent other profiles from marking.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.process_id::text || ':' || NEW.created_by_profile_id::text, 0)
  );

  -- Updating a marker is never a new marker slot.
  IF TG_OP = 'UPDATE'
     AND NEW.process_id IS NOT DISTINCT FROM OLD.process_id
     AND NEW.created_by_profile_id IS NOT DISTINCT FROM OLD.created_by_profile_id THEN
    RETURN NEW;
  END IF;

  -- upsert_process_marker performs INSERT ... ON CONFLICT DO UPDATE.
  -- BEFORE INSERT runs even for an existing label, so permit that existing row.
  IF EXISTS (
    SELECT 1 FROM public.process_markers m
    WHERE m.process_id = NEW.process_id
      AND m.created_by_profile_id = NEW.created_by_profile_id
      AND lower(m.label) = lower(NEW.label)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO _count
  FROM public.process_markers m
  WHERE m.process_id = NEW.process_id
    AND (
      m.created_by_profile_id = NEW.created_by_profile_id
      OR (m.created_by_profile_id IS NULL AND m.created_by IS NOT DISTINCT FROM NEW.created_by)
    );

  IF _count >= 3 THEN
    RAISE EXCEPTION 'Limite de 3 marcadores individuais por processo. Remova um marcador para aplicar outro.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$limit$;

DROP TRIGGER IF EXISTS process_markers_three_per_profile_guard ON public.process_markers;
CREATE TRIGGER process_markers_three_per_profile_guard
BEFORE INSERT OR UPDATE OF process_id, created_by_profile_id
ON public.process_markers
FOR EACH ROW EXECUTE FUNCTION public.enforce_three_personal_process_markers();

COMMENT ON FUNCTION public.enforce_three_personal_process_markers()
IS 'Guards personal markers per authenticated profile/process; official status is not counted.';

NOTIFY pgrst, 'reload schema';
