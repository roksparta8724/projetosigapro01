-- SIGAPRO QA only. Bind newly registered draft document references to the
-- municipality + current authenticated profile and a normal upload folder.
-- The official ProtocolarProjetoPage uploads into:
-- municipalities/{municipality}/{protocols|habite-se}/{profileId}/{uuid}-file
-- Existing stored document rows are unchanged; nothing is backfilled.
-- This is a metadata ownership check, not proof that storage bytes exist.
DO $qa$
DECLARE _sql text;
  _anchor text := E'      else\n        insert into public.process_documents(';
  _patched text := $replacement$
      else
        -- A client may only link a newly uploaded document from its own
        -- municipality and profile; reject foreign city and pending paths.
        -- Signed storage upload/read continue to enforce byte-level access.
        if nullif(btrim(coalesce(_doc->>'filePath','')),'') is null
           or not (
             (_doc->>'filePath') like
               'municipalities/'||coalesce(_process.municipality_id,_process.tenant_id)::text
                 ||'/protocols/'||_profile_id::text||'/%'
             or (_doc->>'filePath') like
               'municipalities/'||coalesce(_process.municipality_id,_process.tenant_id)::text
                 ||'/habite-se/'||_profile_id::text||'/%'
           )
           or split_part(_doc->>'filePath','/',5) = ''
           or (_doc->>'filePath') like '%..%'
           or nullif(btrim(coalesce(_doc->>'fileName','')),'') is null
           or coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,0) <= 0
        then
          raise exception 'Arquivo do rascunho sem vinculo municipal e de usuario valido';
        end if;
        insert into public.process_documents(
$replacement$;
BEGIN
 IF current_database()<>'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'Only isolated SIGAPRO QA database may be modified';
 END IF;
 SELECT pg_get_functiondef(
   'public.update_external_preprotocol_draft_v1(uuid,jsonb)'::regprocedure
 ) INTO _sql;
 IF _sql IS NULL OR position('review_status=review_status' in _sql)=0
    OR position('and coalesce(d.is_required,false)=false' in _sql)=0
    OR position('Somente o profissional que abriu este pre-protocolo' in _sql)=0
 THEN RAISE EXCEPTION 'Existing document protections not present: abort'; END IF;
 IF (length(_sql)-length(replace(_sql,_anchor,'')))<>length(_anchor)
 THEN RAISE EXCEPTION 'Expected exactly one new-document insertion anchor'; END IF;
 _sql:=replace(_sql,_anchor,_patched);
 EXECUTE _sql;
END $qa$;

NOTIFY pgrst, 'reload schema';
