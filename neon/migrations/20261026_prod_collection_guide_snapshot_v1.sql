-- SIGAPRO production candidate. REVIEW ONLY: never run automatically.
-- Additive, forward-only: does NOT change existing payment_guides records.
-- Applies only after recording the exact target Neon branch ID externally.
BEGIN;
ALTER TABLE public.payment_guides
  ADD COLUMN IF NOT EXISTS collection_configuration_id uuid
    REFERENCES public.municipal_collection_configurations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS collection_mode_snapshot text,
  ADD COLUMN IF NOT EXISTS collection_provider_snapshot text,
  ADD COLUMN IF NOT EXISTS collection_configuration_version integer,
  ADD COLUMN IF NOT EXISTS collection_capabilities_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS collection_public_parameters_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.snapshot_payment_guide_collection_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET row_security = off AS $function$
DECLARE active_config public.municipal_collection_configurations%ROWTYPE;
BEGIN
  -- Never trust caller-supplied billing mode for a NEW guide.
  -- Always use the active municipality configuration, just like the QA
  -- branch function. Historical guides are untouched (INSERT trigger only).
  SELECT * INTO active_config
    FROM public.municipal_collection_configurations
    WHERE municipality_id = NEW.municipality_id AND status = 'active'
    ORDER BY version DESC LIMIT 1;
  IF active_config.id IS NOT NULL THEN
    NEW.collection_configuration_id := active_config.id;
    NEW.collection_mode_snapshot := active_config.mode;
    NEW.collection_provider_snapshot := active_config.supplier_code;
    NEW.collection_configuration_version := active_config.version;
    NEW.collection_capabilities_snapshot := active_config.capabilities;
    NEW.collection_public_parameters_snapshot := active_config.public_parameters;
  ELSIF NEW.collection_configuration_id IS NOT NULL
      OR NEW.collection_mode_snapshot IS NOT NULL
      OR NEW.collection_provider_snapshot IS NOT NULL
      OR NEW.collection_configuration_version IS NOT NULL
      OR NEW.collection_capabilities_snapshot IS NOT NULL
      OR NEW.collection_public_parameters_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'Sem configuração municipal ativa: modo e provedor não podem ser definidos pelo solicitante';
  END IF;
  RETURN NEW;
END $function$;

DO $install$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.payment_guides'::regclass
      AND tgname = 'snapshot_payment_guide_collection'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER snapshot_payment_guide_collection
      BEFORE INSERT ON public.payment_guides
      FOR EACH ROW EXECUTE FUNCTION public.snapshot_payment_guide_collection_v1();
  END IF;
END $install$;
REVOKE ALL ON FUNCTION public.snapshot_payment_guide_collection_v1() FROM PUBLIC;
COMMIT;
NOTIFY pgrst, 'reload schema';
