-- QA only: public verification must reject completed blocks with no actual authenticated SHA-matching signature.
CREATE OR REPLACE FUNCTION public.verify_process_artifact_signature_public_v1(_verification_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _code text := upper(regexp_replace(coalesce(_verification_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _block public.signature_blocks%rowtype;
  _protocol text := '';
  _municipality_name text := 'Prefeitura Municipal';
begin
  if length(_code) < 12 or length(_code) > 64 then
    return jsonb_build_object('valid', false, 'code', _code);
  end if;

  select *
    into _block
  from public.signature_blocks
  where upper(coalesce(verification_code, '')) = _code
    and status = 'concluido'
    and document_id is null
    and artifact_key is not null
    and evidence_hash ~ '^[0-9a-f]{64}$'
    and exists (
      select 1 from public.signatures sig
      where sig.signature_block_id = public.signature_blocks.id
        and sig.status = 'concluido'
        and sig.tenant_id = public.signature_blocks.tenant_id
        and sig.municipality_id = public.signature_blocks.municipality_id
        and sig.document_hash = public.signature_blocks.evidence_hash
        and sig.reauthenticated_at is not null
        and sig.signer_profile_id is not null
    )
  order by completed_at desc nulls last, created_at desc
  limit 1;

  if _block.id is null then
    return jsonb_build_object('valid', false, 'code', _code);
  end if;

  select
    coalesce(
      nullif(_block.artifact_payload->>'protocol', ''),
      nullif(to_jsonb(p)->>'protocol_number', ''),
      ''
    ),
    coalesce(
      nullif(to_jsonb(m)->>'display_name', ''),
      nullif(to_jsonb(m)->>'official_name', ''),
      nullif(to_jsonb(m)->>'name', ''),
      'Prefeitura Municipal'
    )
  into _protocol, _municipality_name
  from public.processes p
  left join public.municipalities m on m.id = _block.municipality_id
  where p.id = _block.process_id
  limit 1;

  return jsonb_build_object(
    'valid', true,
    'verification_code', _block.verification_code,
    'artifact_type', _block.artifact_type,
    'artifact_key', _block.artifact_key,
    'artifact_version', _block.artifact_version,
    'artifact_hash', _block.evidence_hash,
    'completed_at', _block.completed_at,
    'protocol', _protocol,
    'permit_number', coalesce(_block.artifact_payload->>'permitNumber', ''),
    'municipality_name', _municipality_name,
    'signers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', s.signer_name,
          'title', coalesce(nullif(s.signer_title, ''), nullif(s.signer_role, ''), 'Autoridade municipal'),
          'registration', s.signer_registration,
          'slot', s.signer_slot,
          'signed_at', s.signed_at
        )
        order by s.signer_order
      )
      from public.signatures s
      where s.signature_block_id = _block.id
        and s.status = 'concluido'
    ), '[]'::jsonb)
  );
end;
$function$
