-- SIGAPRO — assinatura eletrônica com reautenticação obrigatória.
-- Neon-first. A senha nunca entra no banco: a API revalida no Neon Auth e
-- entrega ao PostgreSQL apenas uma prova HMAC curta, de uso único.

begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anonymous;
revoke all on schema private from authenticated;

create table if not exists private.system_secrets (
  key text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.signature_reauth_nonces (
  nonce text primary key,
  used_at timestamptz not null default now()
);

alter table public.signature_blocks
  add column if not exists verification_code text,
  add column if not exists completed_at timestamptz;

alter table public.signatures
  add column if not exists signer_title text,
  add column if not exists signer_registration text,
  add column if not exists auth_method text,
  add column if not exists reauthenticated_at timestamptz,
  add column if not exists evidence_version integer not null default 1;

create unique index if not exists ux_signature_blocks_verification_code
  on public.signature_blocks (verification_code)
  where verification_code is not null;

create unique index if not exists ux_signature_blocks_document
  on public.signature_blocks (document_id)
  where document_id is not null;

create unique index if not exists ux_signatures_block_profile
  on public.signatures (signature_block_id, signer_profile_id)
  where signer_profile_id is not null;

create or replace function private.block_signature_mutation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
begin
  raise exception 'Assinatura eletrônica concluída é imutável.';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'signatures_immutable_guard'
      and tgrelid = 'public.signatures'::regclass
      and not tgisinternal
  ) then
    create trigger signatures_immutable_guard
    before update or delete on public.signatures
    for each row execute function private.block_signature_mutation();
  end if;
end;
$$;

alter table public.signature_blocks enable row level security;
alter table public.signatures enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='signature_blocks'
      and policyname='signature_blocks_select_scoped'
  ) then
    create policy signature_blocks_select_scoped
      on public.signature_blocks
      for select
      to authenticated
      using (public.has_process_access(process_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='signatures'
      and policyname='signatures_select_scoped'
  ) then
    create policy signatures_select_scoped
      on public.signatures
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.signature_blocks sb
          where sb.id = signatures.signature_block_id
            and public.has_process_access(sb.process_id)
        )
      );
  end if;
end;
$$;

revoke insert, update, delete on public.signature_blocks from authenticated, anonymous;
revoke insert, update, delete on public.signatures from authenticated, anonymous;
grant select on public.signature_blocks to authenticated;
grant select on public.signatures to authenticated;

create or replace function public.get_signature_context_v1(_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _profile public.profiles%rowtype;
  _document public.process_documents%rowtype;
  _process public.processes%rowtype;
  _role text;
  _position text;
  _registration text;
begin
  select * into _profile
  from public.profiles
  where id = public.current_profile_id()
    and deleted_at is null
    and account_status = 'active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _document
  from public.process_documents
  where id = _document_id
    and is_valid = true;

  if _document.id is null then
    raise exception 'Documento válido não encontrado.';
  end if;

  select * into _process from public.processes where id = _document.process_id;
  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao documento.';
  end if;

  _role := coalesce(public.current_role_code(), _profile.role, '');

  if _role not in (
    'profissional_externo','professional_external','professional','profissional',
    'analista','analyst',
    'prefeitura_supervisor','diretor','secretario',
    'prefeitura_admin','admin_municipality','admin_prefeitura'
  ) then
    raise exception 'Este perfil não possui permissão para assinar documentos.';
  end if;

  select coalesce(nullif(btrim(tm.position_title), ''), nullif(btrim(r.label), ''))
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id = tm.role_id
  where tm.profile_id = _profile.id
    and tm.tenant_id = _process.tenant_id
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  _registration := nullif(btrim(_profile.registration_number), '');

  return jsonb_build_object(
    'auth_subject', public.current_auth_subject(),
    'profile_id', _profile.id,
    'email', lower(coalesce(_profile.email, '')),
    'name', coalesce(nullif(btrim(_profile.full_name), ''), _profile.email, 'Usuário'),
    'role', _role,
    'title', coalesce(_position, nullif(btrim(_profile.professional_type), ''), _role),
    'registration', _registration,
    'process_id', _process.id,
    'document_id', _document.id,
    'document_title', _document.title,
    'document_hash', _document.file_hash,
    'document_version', _document.version,
    'municipality_id', coalesce(_process.municipality_id, _document.municipality_id),
    'tenant_id', _process.tenant_id
  );
end;
$$;

create or replace function public.sign_process_document_v1(
  _document_id uuid,
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
set search_path to 'pg_catalog', 'public', 'private'
set row_security to 'off'
as $$
declare
  _ctx jsonb;
  _subject text;
  _secret text;
  _canonical text;
  _expected_proof text;
  _profile_id uuid;
  _process_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _document_hash text;
  _document_version integer;
  _block_id uuid;
  _signature_id uuid;
  _verification_code text;
  _signed_at timestamptz := clock_timestamp();
  _ua_hash text;
  _ip_inet inet;
begin
  if coalesce(length(_server_proof),0) < 32 or coalesce(length(_nonce),0) < 16 then
    raise exception 'Prova de reautenticação inválida.';
  end if;

  if abs(extract(epoch from (clock_timestamp() - to_timestamp(_reauthenticated_at_epoch)))) > 120 then
    raise exception 'A confirmação de senha expirou. Informe a senha novamente.';
  end if;

  _ctx := public.get_signature_context_v1(_document_id);
  _subject := nullif(_ctx->>'auth_subject','');
  _profile_id := (_ctx->>'profile_id')::uuid;
  _process_id := (_ctx->>'process_id')::uuid;
  _tenant_id := (_ctx->>'tenant_id')::uuid;
  _municipality_id := nullif(_ctx->>'municipality_id','')::uuid;
  _document_hash := nullif(btrim(_ctx->>'document_hash'),'');
  _document_version := coalesce((_ctx->>'document_version')::integer,1);

  if _subject is null or _document_hash is null then
    raise exception 'Documento sem identidade ou hash íntegro para assinatura.';
  end if;

  select secret_value into _secret
  from private.system_secrets
  where key = 'esign_hmac_v1';

  if _secret is null then
    raise exception 'Assinatura eletrônica ainda não foi habilitada no ambiente.';
  end if;

  _ua_hash := encode(digest(convert_to(coalesce(_user_agent,''),'UTF8'),'sha256'),'hex');
  _canonical := concat_ws('|',
    _subject,
    _document_id::text,
    _reauthenticated_at_epoch::text,
    _nonce,
    coalesce(_ip,''),
    _ua_hash
  );
  _expected_proof := encode(
    hmac(convert_to(_canonical,'UTF8'), convert_to(_secret,'UTF8'), 'sha256'),
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

  insert into public.signature_blocks(
    tenant_id, municipality_id, process_id, document_id, title, status,
    evidence, evidence_version, evidence_hash, evidence_ip,
    evidence_user_agent, evidence_timestamp_authority,
    verification_code, completed_at
  )
  values(
    _tenant_id,
    _municipality_id,
    _process_id,
    _document_id,
    coalesce(_ctx->>'document_title','Documento'),
    'concluido',
    jsonb_build_object(
      'document_hash', _document_hash,
      'document_version', _document_version,
      'auth_method', coalesce(nullif(_auth_method,''),'password_reauth'),
      'reauthenticated_at', to_timestamp(_reauthenticated_at_epoch),
      'evidence_version', 1
    ),
    1,
    _document_hash,
    _ip_inet,
    left(coalesce(_user_agent,''), 1000),
    'SIGAPRO/Neon Auth',
    upper(substr(encode(gen_random_bytes(12),'hex'),1,20)),
    _signed_at
  )
  on conflict (document_id) where document_id is not null
  do update set
    completed_at = greatest(public.signature_blocks.completed_at, excluded.completed_at)
  returning id, verification_code into _block_id, _verification_code;

  if exists (
    select 1 from public.signatures
    where signature_block_id = _block_id
      and signer_profile_id = _profile_id
  ) then
    raise exception 'Você já assinou eletronicamente esta versão do documento.';
  end if;

  insert into public.signatures(
    tenant_id, municipality_id, signature_block_id,
    signer_user_id, signer_profile_id, signer_name, signer_role,
    signer_title, signer_registration, signer_order, status,
    signed_at, ip_address, user_agent, document_hash,
    auth_method, reauthenticated_at, evidence_version
  )
  values(
    _tenant_id,
    _municipality_id,
    _block_id,
    (select user_id from public.profiles where id=_profile_id),
    _profile_id,
    coalesce(_ctx->>'name','Usuário'),
    coalesce(_ctx->>'role','usuario'),
    nullif(_ctx->>'title',''),
    nullif(_ctx->>'registration',''),
    coalesce((select max(signer_order)+1 from public.signatures where signature_block_id=_block_id),1),
    'concluido',
    _signed_at,
    _ip_inet,
    left(coalesce(_user_agent,''),1000),
    _document_hash,
    coalesce(nullif(_auth_method,''),'password_reauth'),
    to_timestamp(_reauthenticated_at_epoch),
    1
  )
  returning id into _signature_id;

  update public.signature_blocks
  set evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object(
        'last_signature_id', _signature_id,
        'last_signed_at', _signed_at,
        'signature_count', (
          select count(*) from public.signatures where signature_block_id=_block_id
        )
      ),
      completed_at = _signed_at
  where id=_block_id;

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id, actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _tenant_id,
    _municipality_id,
    _process_id,
    (select user_id from public.profiles where id=_profile_id),
    _profile_id,
    'assinatura',
    'Documento assinado eletronicamente',
    concat(
      coalesce(_ctx->>'document_title','Documento'),
      ' • SHA-256 ', _document_hash,
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
    'document_hash', _document_hash
  );
end;
$$;

create or replace function public.verify_signature_receipt_v1(_verification_code text)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
  select jsonb_build_object(
    'valid', true,
    'verification_code', sb.verification_code,
    'document', jsonb_build_object(
      'title', pd.title,
      'version', pd.version,
      'hash', sb.evidence_hash
    ),
    'process', jsonb_build_object(
      'protocol', pr.protocol_number,
      'title', pr.title
    ),
    'municipality', jsonb_build_object(
      'name', m.name
    ),
    'signed_at', sb.completed_at,
    'signers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', s.signer_name,
        'role', s.signer_role,
        'title', s.signer_title,
        'registration', s.signer_registration,
        'signed_at', s.signed_at,
        'document_hash', s.document_hash,
        'auth_method', s.auth_method
      ) order by s.signer_order)
      from public.signatures s
      where s.signature_block_id = sb.id
        and s.status = 'concluido'
    ), '[]'::jsonb)
  )
  from public.signature_blocks sb
  join public.process_documents pd on pd.id = sb.document_id
  join public.processes pr on pr.id = sb.process_id
  left join public.municipalities m on m.id = sb.municipality_id
  where upper(sb.verification_code) = upper(btrim(_verification_code))
    and sb.status = 'concluido'
  limit 1
$$;

revoke all on function public.get_signature_context_v1(uuid) from public;
revoke all on function public.sign_process_document_v1(uuid,text,text,bigint,text,text,text) from public;
grant execute on function public.get_signature_context_v1(uuid) to authenticated;
grant execute on function public.sign_process_document_v1(uuid,text,text,bigint,text,text,text) to authenticated;

revoke all on function public.verify_signature_receipt_v1(text) from public;
grant execute on function public.verify_signature_receipt_v1(text) to anonymous, authenticated;

commit;

notify pgrst, 'reload schema';
