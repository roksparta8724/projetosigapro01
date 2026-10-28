-- QA EXCLUSIVE: Neon branch br-solitary-sound-b4xlbvs6 ONLY.
-- SIGAPRO: preserve existing process document tenant provenance without altering
-- payment guides, original PDF keys, hashes or any official production records.
BEGIN;

-- Existing documents can be completed only when both recorded tenant and the
-- immutable parent process agree. Never guess a municipality or move documents.
UPDATE public.process_documents d
SET municipality_id = p.municipality_id
FROM public.processes p
WHERE d.process_id = p.id
  AND d.municipality_id IS NULL
  AND p.municipality_id IS NOT NULL
  AND p.tenant_id = p.municipality_id
  AND d.tenant_id = p.tenant_id;

CREATE OR REPLACE FUNCTION public.qa_guard_process_document_tenant_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE process_municipality uuid; process_tenant uuid;
BEGIN
  SELECT p.municipality_id,p.tenant_id
    INTO process_municipality,process_tenant
    FROM public.processes p WHERE p.id=NEW.process_id;
  IF NOT FOUND OR process_municipality IS NULL OR process_tenant IS NULL
     OR process_municipality IS DISTINCT FROM process_tenant THEN
    RAISE EXCEPTION 'QA documento: processo sem municipio consistente';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM process_tenant THEN
    RAISE EXCEPTION 'QA documento: tenant divergente do processo';
  END IF;
  IF NEW.municipality_id IS NULL THEN
    NEW.municipality_id := process_municipality;
  ELSIF NEW.municipality_id IS DISTINCT FROM process_municipality THEN
    RAISE EXCEPTION 'QA documento: municipio divergente do processo';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_qa_guard_process_document_tenant_v1 ON public.process_documents;
CREATE TRIGGER trg_qa_guard_process_document_tenant_v1
BEFORE INSERT OR UPDATE OF process_id,tenant_id,municipality_id
ON public.process_documents FOR EACH ROW
EXECUTE FUNCTION public.qa_guard_process_document_tenant_v1();

-- Hard fail when any older row cannot be traced to the same municipality.
DO $check$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.process_documents d
    JOIN public.processes p ON p.id=d.process_id
    WHERE p.municipality_id IS NULL
      OR p.tenant_id IS DISTINCT FROM p.municipality_id
      OR d.tenant_id IS DISTINCT FROM p.tenant_id
      OR d.municipality_id IS DISTINCT FROM p.municipality_id
  ) THEN
    RAISE EXCEPTION 'QA documento: existe vinculo municipal inconsistente';
  END IF;
END
$check$;
COMMIT;
