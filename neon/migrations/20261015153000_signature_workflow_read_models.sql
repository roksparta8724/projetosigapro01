-- Read models for the signed technical/superior workflow.
create or replace function public.get_my_technical_conclusion_editor_v1(
  _process_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _context record;
  _conclusion public.process_technical_conclusions%rowtype;
  _types jsonb := '[]'::jsonb;
begin
  select
    scope_tenant_id as tenant_id,
    scope_municipality_id as municipality_id,
    scope_review_id as review_id,
    scope_assignment_id as assignment_id,
    scope_actor_id as actor_id
  into _context
  from public.assert_technical_conclusion_context(_process_id);

  select * into _conclusion
  from public.process_technical_conclusions c
  where c.process_id=_process_id
    and c.tenant_id=_context.tenant_id
    and c.municipality_id=_context.municipality_id
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,
    'code',t.code,
    'label',t.label,
    'version',t.version
  ) order by t.label,t.version desc),'[]'::jsonb)
  into _types
  from public.municipal_technical_conclusion_types t
  where t.tenant_id=_context.tenant_id
    and t.municipality_id=_context.municipality_id
    and t.is_active=true
    and t.effective_from<=now()
    and (t.effective_to is null or t.effective_to>now());

  return jsonb_build_object(
    'processId',_process_id,
    'assignmentId',_context.assignment_id,
    'reviewId',_context.review_id,
    'actorProfileId',_context.actor_id,
    'conclusion',
      case when _conclusion.id is null then null else jsonb_build_object(
        'id',_conclusion.id,
        'status',_conclusion.status,
        'typeId',_conclusion.conclusion_type_id,
        'typeCode',_conclusion.conclusion_type_code_snapshot,
        'typeLabel',_conclusion.conclusion_type_label_snapshot,
        'conclusionText',_conclusion.conclusion_text,
        'technicalBasis',_conclusion.technical_basis,
        'internalNotes',_conclusion.internal_notes,
        'finalizedAt',_conclusion.finalized_at,
        'finalizedByName',_conclusion.finalized_by_name_snapshot
      ) end,
    'types',_types
  );
end;
$$;

create or replace function public.list_my_required_process_documents_for_signature_v1(
  _process_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _context jsonb := public.assert_superior_approval_context(_process_id);
  _actor uuid := public.current_profile_id();
  _items jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'requirementId',r.id,
    'documentId',r.document_id,
    'documentTypeCode',r.document_type_code_snapshot,
    'documentVersion',r.document_version,
    'documentHash',r.document_hash_snapshot,
    'requiredRoleCode',r.required_role_code,
    'status',r.status,
    'title',d.title,
    'fileName',d.file_name,
    'reviewStatus',d.review_status,
    'alreadySigned',
      r.status='signed'
      and exists(
        select 1
        from public.signature_blocks b
        join public.signatures s on s.signature_block_id=b.id
        where b.id=r.signature_block_id
          and b.status::text='concluido'
          and s.status::text='concluido'
          and s.signer_profile_id=_actor
          and s.document_hash=b.payload_hash
      )
  ) order by d.title,r.document_version),'[]'::jsonb)
  into _items
  from public.process_document_signature_requirements r
  join public.process_documents d
    on d.id=r.document_id
   and d.process_id=_process_id
   and d.is_valid=true
  where r.process_id=_process_id
    and r.tenant_id=(_context->>'tenant_id')::uuid
    and r.municipality_id=(_context->>'municipality_id')::uuid
    and r.status<>'superseded'
    and public.has_active_municipal_role(
      _actor,
      (_context->>'tenant_id')::uuid,
      (_context->>'municipality_id')::uuid,
      array[r.required_role_code]
    );

  return _items;
end;
$$;

grant execute on function public.get_my_technical_conclusion_editor_v1(uuid) to authenticated;
grant execute on function public.list_my_required_process_documents_for_signature_v1(uuid) to authenticated;
