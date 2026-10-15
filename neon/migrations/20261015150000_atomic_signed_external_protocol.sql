-- Atomic external protocol creation with authenticated professional signatures.
create or replace function public.create_signed_external_process_v1(
  _tenant_id uuid,
  _payload jsonb,
  _documents jsonb,
  _protocol_prefix text default 'PM'::text,
  _requested_protocol_number text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _safe_payload jsonb;
  _process jsonb;
  _process_id uuid;
  _synced jsonb;
  _doc jsonb;
  _signatures jsonb := '[]'::jsonb;
  _signature jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  if jsonb_typeof(_documents)<>'array' or jsonb_array_length(_documents)=0 then
    raise exception 'O protocolo deve possuir documentos para assinatura';
  end if;

  -- Never let the legacy creation RPC create document rows with provisional hashes.
  _safe_payload := jsonb_set(
    coalesce(_payload,'{}'::jsonb),
    '{documents}',
    '[]'::jsonb,
    true
  );

  _process := public.create_external_process_v3(
    _tenant_id,
    _safe_payload,
    _protocol_prefix,
    _requested_protocol_number
  );

  _process_id := nullif(_process->>'process_id','')::uuid;
  if _process_id is null then
    raise exception 'Processo nao retornado pela criacao oficial';
  end if;

  _synced := public.append_process_documents_v2(_process_id,_documents);

  if coalesce((_synced->>'synced')::integer,0)<>jsonb_array_length(_documents) then
    raise exception 'Nem todos os documentos foram sincronizados com integridade';
  end if;

  for _doc in
    select value
    from jsonb_array_elements(coalesce(_synced->'documents','[]'::jsonb))
  loop
    _signature := public.sign_professional_process_document_v1(
      (_doc->>'id')::uuid,
      'Declaro que este arquivo integra a documentacao apresentada por mim neste protocolo e corresponde integralmente ao conteudo enviado.'
    );
    _signatures := _signatures || jsonb_build_array(_signature);
  end loop;

  if jsonb_array_length(_signatures)<>jsonb_array_length(_documents) then
    raise exception 'Nem todos os documentos receberam assinatura eletronica';
  end if;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _tenant_id,_tenant_id,_process_id,public.current_legacy_user_id(),public.current_profile_id(),
    'assinatura','Protocolo apresentado com documentos assinados eletronicamente',
    jsonb_array_length(_signatures)::text||
      ' documento(s) apresentados com SHA-256 e assinatura eletronica do profissional responsavel.',
    true,now()
  );

  return _process || jsonb_build_object(
    'documents',coalesce(_synced->'documents','[]'::jsonb),
    'signatures',_signatures,
    'professional_signature_complete',true
  );
end;
$$;

grant execute on function public.create_signed_external_process_v1(uuid,jsonb,jsonb,text,text) to authenticated;
