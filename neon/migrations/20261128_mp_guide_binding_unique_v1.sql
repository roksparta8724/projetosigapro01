-- A signed bank receipt can still arrive concurrently for two guides.
-- Enforce uniqueness in PostgreSQL, not merely in a read-before-write RPC.
-- Existing data is not rewritten. Index creation fails if there is ambiguity.
CREATE UNIQUE INDEX IF NOT EXISTS payment_guides_mp_order_unique_v1
 ON public.payment_guides (municipality_id, (btrim(bank_reference)))
 WHERE payment_provider='mercado_pago' AND nullif(btrim(bank_reference),'') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_guides_mp_payment_unique_v1
 ON public.payment_guides (municipality_id, (btrim(bank_payment_id)))
 WHERE payment_provider='mercado_pago' AND nullif(btrim(bank_payment_id),'') IS NOT NULL;

-- Prevent a later provider response from silently replacing an already-bound
-- order, payment, environment or tenant. A first asynchronous response may
-- omit payment ID; the first verified ID can still be registered subsequently.
CREATE OR REPLACE FUNCTION public.guard_mp_guide_binding_v1()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
 IF OLD.payment_provider='mercado_pago' AND nullif(btrim(OLD.bank_reference),'') IS NOT NULL THEN
  IF NEW.bank_reference IS DISTINCT FROM OLD.bank_reference
     OR NEW.payment_provider IS DISTINCT FROM OLD.payment_provider
     OR NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
     OR NEW.process_id IS DISTINCT FROM OLD.process_id
     OR (OLD.provider_environment IN ('test','production') AND NEW.provider_environment IS DISTINCT FROM OLD.provider_environment)
     OR (nullif(btrim(OLD.bank_payment_id),'') IS NOT NULL AND NEW.bank_payment_id IS DISTINCT FROM OLD.bank_payment_id)
  THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Vínculo bancário Mercado Pago imutável'; END IF;
 END IF;
 RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_guard_mp_guide_binding_v1 ON public.payment_guides;
CREATE TRIGGER trg_guard_mp_guide_binding_v1 BEFORE UPDATE ON public.payment_guides
 FOR EACH ROW EXECUTE FUNCTION public.guard_mp_guide_binding_v1();
REVOKE ALL ON FUNCTION public.guard_mp_guide_binding_v1() FROM PUBLIC;
