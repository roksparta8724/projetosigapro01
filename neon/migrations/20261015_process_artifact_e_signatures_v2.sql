-- SIGAPRO electronic signatures v2
-- Password is validated in the canonical server API.
-- Database verifies that the request came from that server by hashing a high-entropy
-- server key. Only its SHA-256 fingerprint is stored in SQL; the key itself stays in Vercel.

begin;

create or replace function public.sign_process_artifact_v2(
  _process_id uuid,
  _artifact_type text,
  _artifact_key text,
  _artifact_hash text,
  _artifact_payload jsonb,
  _signer_slot text,
  _server_secret text,
  _nonce text,
  _reauthenticated_at_epoch bigint,
  _ip text,
  _user_agent text,
  _auth_method text default 'password_reauth'
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'extensions'
set row_security to 'off'
as $$
declare
  _ctx jsonb;
  _profile_id uuid;
  _user_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _type text := lower(btrim(coalesce(_artifact_type,'')));
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _hash text := lower(btrim(coalesce(_artifact_hash,'')));
  _secret_hash text;
  _title text;
  _version integer;
  _block_id uuid;
  _signature_id uuid;
  _verification_code text;
  _signed_at timestamptz := clock_timestamp();
  _ip_inet inet;
begin
  if _type = '' or _key = '' or length(_key) > 160 then
    raise exception 'Artefato inválido para assinatura.';
  end if;

  if _hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash SHA-256 do artefato inválido.';
  end if;

  if _artifact_payload is null or jsonb_typeof(_artifact_payload) <> 'object' then
    raise exception 'Conteúdo do artefato inválido.';
  end if;

  if coalesce(length(_server_secret),0) < 32 then
    raise exception 'Origem segura da assinatura não foi comprovada.';
  end if;

  _secret_hash := encode(
    extensions.digest(convert_to(_server_secret,'UTF8'),'sha256'),
    'hex'
  );

  if _secret_hash <> 'b90c8fd07d7b6232b4043961d8b9cb65e289628ce7b6b759fc7997d93c0533cd' then
    raise exception 'Origem segura da assinatura não foi comprovada.';
  end if;

  if coalesce(length(_nonce),0) < 16 then
    raise exception 'Confirmação de assinatura inválida.';
  end if;

  if abs(extract(epoch from (clock_timestamp() - to_timestamp(_reauthenticated_at_epoch)))) > 120 then
    raise exception 'A confirmação de senha expirou. Informe a senha novamente.';
  end if;

  _ctx := public.get_process_artifact_signature_context_v1(_process_id, _slot);
  _profile_id := (_ctx->>'profile_id')::uuid;
  _user_id := nullif(_ctx->>'user_id','')::uuid;
  _tenant_id := (_ctx->>'tenant_id')::uuid;
  _municipality_id := nullif(_ctx->>'municipality_id','')::uuid;

  begin
    insert into private.signature_reauth_nonces(nonce) values (_nonce);
  exception when unique_violation then
    raise exception 'Esta confirmação de senha já foi utilizada.';
  end;

  begin
    _ip_inet := nullif(btrim(_ip),'')::inet;
  exception when others then
    _ip_inet := null;
  end;

  perform 1
  from public.processes
  where id = _process_id
  for update;

  select id, artifact_version, verification_code
    into _block_id, _version, _verification_code
  from public.signature_blocks
  where process_id = _process_id
    and document_id is null
    and artifact_key = _key
    and artifact_type = _type
    and evidence_hash = _hash
    and status = 'concluido'
  order by artifact_version desc
  limit 1;

  if _block_id is null then
    select coalesce(max(artifact_version),0) + 1
      into _version
    from public.signature_blocks
    where process_id = _process_id
      and document_id is null
      and artifact_key = _key;

    _title := case _type
      when 'urban_analysis_checklist' then 'Ficha de análise técnica municipal'
      when 'construction_permit' then 'Alvará de Construção'
      when 'process_document' then 'Documento do processo'
      else 'Artefato eletrônico do processo'
    end;

    insert into public.signature_blocks(
      tenant_id,
      municipality_id,
      process_id,
      document_id,
      title,
      status,
      evidence,
      evidence_version,
      evidence_hash,
      evidence_ip,
      evidence_user_agent,
      evidence_timestamp_authority,
      verification_code,
      completed_at,
      artifact_type,
      artifact_key,
      artifact_version,
      artifact_payload
    )
    values(
      _tenant_id,
      _municipality_id,
      _process_id,
      null,
      _title,
      'concluido',
      jsonb_build_object(
        'artifact_type', _type,
        'artifact_key', _key,
        'artifact_version', _version,
        'artifact_hash', _hash,
        'auth_method', coalesce(nullif(_auth_method,''),'password_reauth'),
        'reauthenticated_at', to_timestamp(_reauthenticated_at_epoch),
        'server_attestation', 'sha256-key-v2',
        'evidence_version', 4
      ),
      4,
      _hash,
      _ip_inet,
      left(coalesce(_user_agent,''),1000),
      'SIGAPRO/Neon Auth',
      upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,20)),
      _signed_at,
      _type,
      _key,
      _version,
      _artifact_payload
    )
    returning id, verification_code
      into _block_id, _verification_code;
  else
    if (
      select artifact_payload
      from public.signature_blocks
      where id = _block_id
    ) is distinct from _artifact_payload then
      raise exception 'O conteúdo recebido diverge do artefato já assinado com este hash.';
    end if;
  end if;

  if exists (
    select 1
    from public.signatures
    where signature_block_id = _block_id
      and signer_profile_id = _profile_id
      and status = 'concluido'
  ) then
    raise exception 'Você já assinou eletronicamente esta versão.';
  end if;

  if exists (
    select 1
    from public.signatures
    where signature_block_id = _block_id
      and signer_slot = _slot
      and status = 'concluido'
  ) then
    raise exception 'Esta etapa já possui assinatura eletrônica concluída.';
  end if;

  insert into public.signatures(
    tenant_id,
    municipality_id,
    signature_block_id,
    signer_user_id,
    signer_profile_id,
    signer_name,
    signer_role,
    signer_title,
    signer_registration,
    signer_order,
    signer_slot,
    status,
    signed_at,
    ip_address,
    user_agent,
    document_hash,
    auth_method,
    reauthenticated_at,
    evidence_version
  )
  values(
    _tenant_id,
    _municipality_id,
    _block_id,
    _user_id,
    _profile_id,
    coalesce(_ctx->>'name','Usuário'),
    coalesce(_ctx->>'role','usuario'),
    nullif(_ctx->>'title',''),
    nullif(_ctx->>'registration',''),
    coalesce(
      (
        select max(signer_order) + 1
        from public.signatures
        where signature_block_id = _block_id
      ),
      1
    ),
    _slot,
    'concluido',
    _signed_at,
    _ip_inet,
    left(coalesce(_user_agent,''),1000),
    _hash,
    coalesce(nullif(_auth_method,''),'password_reauth'),
    to_timestamp(_reauthenticated_at_epoch),
    4
  )
  returning id into _signature_id;

  update public.signature_blocks
  set evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object(
        'last_signature_id', _signature_id,
        'last_signed_at', _signed_at,
        'signature_count', (
          select count(*)
          from public.signatures
          where signature_block_id = _block_id
            and status = 'concluido'
        )
      ),
      completed_at = _signed_at
  where id = _block_id;

  insert into public.process_audit_entries(
    tenant_id,
    municipality_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    category,
    title,
    detail,
    visible_to_external,
    created_at
  )
  values(
    _tenant_id,
    _municipality_id,
    _process_id,
    _user_id,
    _profile_id,
    'assinatura',
    'Assinatura eletrônica registrada',
    concat(
      case _slot
        when 'analise_tecnica' then 'Análise técnica'
        when 'conferencia_fiscal' then 'Conferência fiscal'
        when 'diretoria' then 'Diretoria'
        when 'secretaria' then 'Secretaria'
        when 'profissional' then 'Profissional responsável'
        else _slot
      end,
      ' • SHA-256 ', _hash,
      ' • código ', _verification_code
    ),
    true,
    _signed_at
  );

  delete from private.signature_reauth_nonces
  where used_at < clock_timestamp() - interval '1 day';

  return jsonb_build_object(
    'ok', true,
    'signature_id', _signature_id,
    'signature_block_id', _block_id,
    'verification_code', _verification_code,
    'signed_at', _signed_at,
    'artifact_hash', _hash,
    'artifact_version', _version,
    'signer', jsonb_build_object(
      'profile_id', _profile_id,
      'name', _ctx->>'name',
      'role', _ctx->>'role',
      'title', _ctx->>'title',
      'registration', _ctx->>'registration',
      'slot', _slot
    )
  );
end;
$$;

revoke all on function public.sign_process_artifact_v2(
  uuid,text,text,text,jsonb,text,text,text,bigint,text,text,text
) from public;

grant execute on function public.sign_process_artifact_v2(
  uuid,text,text,text,jsonb,text,text,text,bigint,text,text,text
) to authenticated;

commit;

notify pgrst, 'reload schema';
