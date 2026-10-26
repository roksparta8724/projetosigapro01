-- SIGAPRO production candidate. REVIEW ONLY: apply after DAM migration and
-- collection snapshot migration. No historical payment or process rows changed.
-- Prevent SIGAPRO issuing a parallel bank charge when the municipality owns billing.
BEGIN;
CREATE OR REPLACE FUNCTION public.assert_dam_writer_v1(_guide public.payment_guides)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
BEGIN
  IF public.current_profile_id() IS NULL OR NOT (
    public.is_master() OR (
      public.has_tenant_access(_guide.municipality_id)
      AND public.has_process_access(_guide.process_id)
      AND public.is_internal_municipality_role()
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para preparar a guia municipal';
  END IF;

  -- Historical guides with NULL snapshot must never be rewritten. If this
  -- municipality currently uses its own provider, fail closed on unknown
  -- historical mode instead of creating a second boleto.
  IF coalesce(_guide.collection_mode_snapshot,'') = 'municipal_system' OR (
    _guide.collection_mode_snapshot IS NULL AND EXISTS(
      SELECT 1 FROM public.municipal_collection_configurations c
      WHERE c.municipality_id = _guide.municipality_id
        AND c.status = 'active' AND c.mode = 'municipal_system'
    )
  ) THEN
    RAISE EXCEPTION 'Guia vinculada à arrecadação própria da Prefeitura; o SIGAPRO não emitirá uma segunda cobrança';
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.assert_dam_writer_v1(public.payment_guides) FROM PUBLIC;
COMMIT;
NOTIFY pgrst, 'reload schema';
