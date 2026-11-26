-- Canonical municipality scope for process-linked documents.
-- Preserve the historical bytes, review status and audit trail; only normalize
-- null scope when the document and parent process already share their tenant.
DO $repair$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.process_documents d JOIN public.processes p ON p.id=d.process_id
    WHERE d.tenant_id IS DISTINCT FROM p.tenant_id OR
      (d.municipality_id IS NOT NULL AND d.municipality_id IS DISTINCT FROM coalesce(p.municipality_id,p.tenant_id))
  ) THEN RAISE EXCEPTION 'Divergencia de escopo documental: reparo automatico bloqueado'; END IF;
  UPDATE public.process_documents d SET municipality_id=coalesce(p.municipality_id,p.tenant_id)
  FROM public.processes p
  WHERE p.id=d.process_id AND d.municipality_id IS NULL AND d.tenant_id=p.tenant_id
    AND coalesce(p.municipality_id,p.tenant_id) IS NOT NULL;
END $repair$;

CREATE OR REPLACE FUNCTION public.guard_process_document_scope_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE _tenant uuid; _municipality uuid;
BEGIN
  IF NEW.process_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.tenant_id,coalesce(p.municipality_id,p.tenant_id)
    INTO _tenant,_municipality FROM public.processes p WHERE p.id=NEW.process_id;
  IF NOT FOUND OR _municipality IS NULL OR NEW.tenant_id IS DISTINCT FROM _tenant
     OR (NEW.municipality_id IS NOT NULL AND NEW.municipality_id IS DISTINCT FROM _municipality)
  THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Escopo municipal do documento incompativel com o processo.'; END IF;
  NEW.municipality_id := _municipality;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_process_document_scope_v1() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_guard_process_document_scope_v1 ON public.process_documents;
CREATE TRIGGER trg_guard_process_document_scope_v1
BEFORE INSERT OR UPDATE OF process_id,tenant_id,municipality_id ON public.process_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_process_document_scope_v1();
