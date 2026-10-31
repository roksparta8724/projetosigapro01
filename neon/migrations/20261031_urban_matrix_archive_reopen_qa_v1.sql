-- SIGAPRO QA only: retrieve an existing historical matrix draft for the same municipality.
-- Read-only, tenant-guarded, no legal rule activation, no PDF bytes.
create or replace function public.get_urban_matrix_batch_staging_v1(
  _municipality_id uuid, _batch_id uuid
) returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' set row_security to 'off'
as $function$
declare _saved public.urban_matrix_batch_staging_v1%rowtype;
begin
  if public.current_profile_id() is null or
     not public.is_urban_regulation_admin_v1(_municipality_id) then
    raise exception 'Acesso ao rascunho histórico não autorizado.';
  end if;
  select * into _saved from public.urban_matrix_batch_staging_v1
    where id=_batch_id and municipality_id=_municipality_id
    and status='pending_legal_review';
  if not found then return null; end if;
  return jsonb_build_object(
    'id',_saved.id,'municipality_id',_saved.municipality_id,
    'document_title',_saved.document_title,
    'document_sha256',_saved.document_sha256,
    'source_municipality',_saved.source_municipality,
    'source_rows',_saved.source_rows,
    'reviewed_indexes',_saved.reviewed_indexes,
    'version',_saved.version,
    'status',_saved.status,'created_at',_saved.created_at
  );
end;
$function$;
revoke all on function public.get_urban_matrix_batch_staging_v1(uuid,uuid) from public;
grant execute on function public.get_urban_matrix_batch_staging_v1(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
