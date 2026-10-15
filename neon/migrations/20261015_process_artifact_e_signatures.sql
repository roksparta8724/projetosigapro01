-- SIGAPRO — assinatura eletrônica de artefatos do processo (ficha de análise, fiscal, diretoria, secretaria e profissional).
-- Reautenticação por senha ocorre no servidor. PostgreSQL recebe somente prova HMAC curta e payload assinado.

begin;

alter table public.signature_blocks
  add column if not exists artifact_type text,
  add column if not exists artifact_key text,
  add column if not exists artifact_version integer,
  add column if not exists artifact_payload jsonb;

alter table public.signatures
  add column if not exists signer_slot text;

create unique index if not exists ux_signature_blocks_artifact_version
  on public.signature_blocks(process_id, artifact_key, artifact_version)
  where document_id is null and artifact_key is not null and artifact_version is not null;

create index if not exists ix_signature_blocks_artifact_lookup
  on public.signature_blocks(process_id, artifact_key, completed_at desc)
  where document_id is null and artifact_key is not null;

create index if not exists ix_signatures_slot
  on public.signatures(signature_block_id, signer_slot)
  where signer_slot is not null;

create or replace function public.get_process_artifact_signature_context_v1(
  _process_id uuid,
  _signer_slot text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _role text;
  _position text;
  _registration text;
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _allowed boolean := false;
begin
  if _slot not in ('analise_tecnica','conferencia_fiscal','diretoria','secretaria','profissional') then
    raise exception 'Tipo de assinatura inválido.';
  end if;

  select * into _profile
  from public.profiles
  where id = public.current_profile_id()
    and deleted_at is null
    and account_status = 'active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id = _process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  select coalesce(
      nullif(btrim(to_jsonb(tm)->>'position_title'), ''),
      nullif(btrim(to_jsonb(tm)->>'profile_label'), ''),
      nullif(btrim(r.label), '')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id = tm.role_id
  where tm.profile_id = _profile.id
    and tm.tenant_id = _process.tenant_id
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  _position := coalesce(_position, nullif(btrim(_profile.professional_type), ''), _role);
  _registration := nullif(btrim(_profile.registration_number), '');

  if _slot = 'analise_tecnica' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst')
      or lower(coalesce(_position,'')) ~ '(diretor|diretora|secret[aá]ri)';
  elsif _slot = 'conferencia_fiscal' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','fiscal')
      or lower(coalesce(_position,'')) ~ '(fiscal|diretor|diretora|secret[aá]ri)';
  elsif _slot = 'diretoria' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor')
      and lower(coalesce(_position,'')) ~ '(diretor|diretora)';
  elsif _slot = 'secretaria' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor')
      and lower(coalesce(_position,'')) ~ '(secret[aá]ri)';
  elsif _slot = 'profissional' then
    _allowed :=
      _role in ('profissional_externo','professional_external','professional','profissional');
  end if;

  if not _allowed then
    raise exception 'Este perfil não possui atribuição para esta assinatura.';
  end if;

  return jsonb_build_object(
    'auth_subject', public.current_auth_subject(),
    'profile_id', _profile.id,
    'user_id', _profile.user_id,
    'email', lower(coalesce(_profile.email,'')),
    'name', coalesce(nullif(btrim(_profile.full_name),''), _profile.email, 'Usuário'),
    'role', _role,
    'title', _position,
    'registration', _registration,
    'signer_slot', _slot,
    'process_id', _process.id,
    'tenant_id', _process.tenant_id,
    'municipality_id', _process.municipality_id,
    'protocol_number', _process.protocol_number,
    'process_title', _process.title
  );
end;
$$;

create or replace function public.sign_process_artifact_v1(
  _process_id uuid,
  _artifact_type text,
  _artifact_key text,
  _artifact_hash text,
  _artifact_payload jsonb,
  _signer_slot text,
  _server_proof text,
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
  _subject text;
  _secret text;
  _canonical text;
  _expected_proof text;
  _profile_id uuid;
  _user_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _type text := lower(btrim(coalesce(_artifact_type,'')));
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _hash text := lower(btrim(coalesce(_artifact_hash,'')));
  _title text;
  _version integer;
  _block_id uuid;
  _signature_id uuid;
  _verification_code text;
  _signed_at timestamptz := clock_timestamp();
  _ua_hash text;
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

  if coalesce(length(_server_proof),0) < 32 or coalesce(length(_nonce),0) < 16 then
    raise exception 'Prova de reautenticação inválida.';
  end if;

  if abs(extract(epoch from (clock_timestamp() - to_timestamp(_reauthenticated_at_epoch)))) > 120 then
    raise exception 'A confirmação de senha expirou. Informe a senha novamente.';
  end if;

  _ctx := public.get_process_artifact_signature_context_v1(_process_id, _slot);
  _subject := nullif(_ctx->>'auth_subject','');
  _profile_id := (_ctx->>'profile_id')::uuid;
  _user_id := nullif(_ctx->>'user_id','')::uuid;
  _tenant_id := (_ctx->>'tenant_id')::uuid;
  _municipality_id := nullif(_ctx->>'municipality_id','')::uuid;

  if _subject is null then
    raise exception 'Identidade autenticada inválida.';
  end if;

  select secret_value into _secret
  from private.system_secrets
  where key = 'esign_hmac_v1';

  if _secret is null then
    raise exception 'Assinatura eletrônica ainda não foi habilitada no ambiente.';
  end if;

  _ua_hash := encode(extensions.digest(convert_to(coalesce(_user_agent,''),'UTF8'),'sha256'),'hex');
  _canonical := concat_ws('|',
    _subject,
    _process_id::text,
    _type,
    _key,
    _hash,
    _slot,
    _reauthenticated_at_epoch::text,
    _nonce,
    coalesce(_ip,''),
    _ua_hash
  );

  _expected_proof := encode(
    extensions.hmac(convert_to(_canonical,'UTF8'), convert_to(_secret,'UTF8'), 'sha256'),
    'hex'
  );

  if _expected_proof <> lower(_server_proof) then
    raise exception 'Prova de reautenticação rejeitada.';
  end if;

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

  perform 1 from public.processes where id=_process_id for update;

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
      when 'process_document' then 'Documento do processo'
      else 'Artefato eletrônico do processo'
    end;

    insert into public.signature_blocks(
      tenant_id, municipality_id, process_id, document_id, title, status,
      evidence, evidence_version, evidence_hash, evidence_ip,
      evidence_user_agent, evidence_timestamp_authority,
      verification_code, completed_at,
      artifact_type, artifact_key, artifact_version, artifact_payload
    )
    values(
      _tenant_id, _municipality_id, _process_id, null, _title, 'concluido',
      jsonb_build_object(
        'artifact_type', _type,
        'artifact_key', _key,
        'artifact_version', _version,
        'artifact_hash', _hash,
        'auth_method', coalesce(nullif(_auth_method,''),'password_reauth'),
        'hash_source', 'server_canonical_json',
        'reauthenticated_at', to_timestamp(_reauthenticated_at_epoch),
        'evidence_version', 3
      ),
      3, _hash, _ip_inet, left(coalesce(_user_agent,''),1000),
      'SIGAPRO/Neon Auth', upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,20)),
      _signed_at, _type, _key, _version, _artifact_payload
    )
    returning id, verification_code into _block_id, _verification_code;
  else
    if (select artifact_payload from public.signature_blocks where id=_block_id) is distinct from _artifact_payload then
      raise exception 'O conteúdo recebido diverge do artefato já assinado com este hash.';
    end if;
  end if;

  if exists (
    select 1
    from public.signatures
    where signature_block_id = _block_id
      and signer_profile_id = _profile_id
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
    tenant_id, municipality_id, signature_block_id,
    signer_user_id, signer_profile_id, signer_name, signer_role,
    signer_title, signer_registration, signer_order, signer_slot, status,
    signed_at, ip_address, user_agent, document_hash,
    auth_method, reauthenticated_at, evidence_version
  )
  values(
    _tenant_id, _municipality_id, _block_id,
    _user_id, _profile_id, coalesce(_ctx->>'name','Usuário'), coalesce(_ctx->>'role','usuario'),
    nullif(_ctx->>'title',''), nullif(_ctx->>'registration',''),
    coalesce((select max(signer_order)+1 from public.signatures where signature_block_id=_block_id),1),
    _slot, 'concluido', _signed_at, _ip_inet, left(coalesce(_user_agent,''),1000), _hash,
    coalesce(nullif(_auth_method,''),'password_reauth'), to_timestamp(_reauthenticated_at_epoch), 3
  )
  returning id into _signature_id;

  update public.signature_blocks
  set evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object(
        'last_signature_id', _signature_id,
        'last_signed_at', _signed_at,
        'signature_count', (select count(*) from public.signatures where signature_block_id=_block_id)
      ),
      completed_at = _signed_at
  where id=_block_id;

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id, actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _tenant_id, _municipality_id, _process_id, _user_id, _profile_id,
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
    true, _signed_at
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

create or replace function public.get_process_artifact_signatures_v1(
  _process_id uuid,
  _artifact_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _block public.signature_blocks%rowtype;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _block
  from public.signature_blocks
  where process_id=_process_id
    and document_id is null
    and artifact_key=_key
    and status='concluido'
  order by artifact_version desc, completed_at desc
  limit 1;

  if _block.id is null then
    return jsonb_build_object('block', null, 'signers', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'block', jsonb_build_object(
      'id', _block.id,
      'artifact_type', _block.artifact_type,
      'artifact_key', _block.artifact_key,
      'artifact_version', _block.artifact_version,
      'artifact_hash', _block.evidence_hash,
      'verification_code', _block.verification_code,
      'completed_at', _block.completed_at,
      'payload', _block.artifact_payload
    ),
    'signers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'profile_id', s.signer_profile_id,
        'name', s.signer_name,
        'role', s.signer_role,
        'title', s.signer_title,
        'registration', s.signer_registration,
        'slot', s.signer_slot,
        'signed_at', s.signed_at,
        'hash', s.document_hash,
        'auth_method', s.auth_method
      ) order by s.signer_order)
      from public.signatures s
      where s.signature_block_id=_block.id
        and s.status='concluido'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_process_artifact_signature_context_v1(uuid,text) from public;
revoke all on function public.sign_process_artifact_v1(uuid,text,text,text,jsonb,text,text,text,bigint,text,text,text) from public;
revoke all on function public.get_process_artifact_signatures_v1(uuid,text) from public;

grant execute on function public.get_process_artifact_signature_context_v1(uuid,text) to authenticated;
grant execute on function public.sign_process_artifact_v1(uuid,text,text,text,jsonb,text,text,text,bigint,text,text,text) to authenticated;
grant execute on function public.get_process_artifact_signatures_v1(uuid,text) to authenticated;

commit;

notify pgrst, 'reload schema';
