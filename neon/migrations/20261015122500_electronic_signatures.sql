-- SIGAPRO electronic signatures
-- Password is never stored. A signature requires a recently revalidated auth token.

create table if not exists public.electronic_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  municipality_id uuid null references public.municipalities(id) on delete set null,
  process_id uuid not null references public.processes(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  document_version integer null,
  signer_profile_id uuid not null references public.profiles(id) on delete restrict,
  signer_user_id uuid null,
  signer_name text not null,
  signer_role text null,
  signer_profile_label text null,
  signer_title text null,
  department_id uuid null references public.departments(id) on delete set null,
  department_code text null,
  department_name text null,
  auth_method text not null default 'password',
  assurance_level text not null default 'simple_password',
  content_sha256 text not null,
  signature_code text not null unique,
  signature_fingerprint text not null,
  statement text null,
  auth_iat timestamptz not null,
  signed_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by_profile_id uuid null references public.profiles(id) on delete set null,
  revocation_reason text null,
  constraint electronic_signatures_entity_type_check
    check (entity_type in ('process_document_review','payment_guide_issue','process_dispatch','analysis_conclusion','official_document')),
  constraint electronic_signatures_sha_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint electronic_signatures_assurance_check
    check (assurance_level in ('simple_password','advanced_govbr','qualified_icp_brasil'))
);

create index if not exists idx_electronic_signatures_process
  on public.electronic_signatures(process_id,signed_at desc);
create index if not exists idx_electronic_signatures_entity
  on public.electronic_signatures(entity_type,entity_id);
create index if not exists idx_electronic_signatures_signer
  on public.electronic_signatures(signer_profile_id,signed_at desc);

alter table public.electronic_signatures enable row level security;
revoke all on table public.electronic_signatures from authenticated;

create or replace function public.current_auth_iat_v1()
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _claims jsonb := '{}'::jsonb;
  _raw text;
  _epoch bigint;
begin
  _raw := nullif(current_setting('request.jwt.claims',true),'');
  if _raw is not null then
    begin
      _claims := _raw::jsonb;
    exception when others then
      _claims := '{}'::jsonb;
    end;
  end if;

  begin
    _epoch := nullif(coalesce(_claims->>'auth_time',_claims->>'iat',current_setting('request.jwt.claim.iat',true)),'')::bigint;
  exception when others then
    _epoch := null;
  end;

  if _epoch is null then return null; end if;
  return to_timestamp(_epoch);
end;
$$;

create or replace function public.require_recent_password_auth_v1(_max_seconds integer default 180)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _iat timestamptz := public.current_auth_iat_v1();
  _window integer := greatest(30,least(coalesce(_max_seconds,180),600));
begin
  if _iat is null then
    raise exception 'Confirme novamente sua senha antes de assinar';
  end if;

  if _iat < now() - make_interval(secs => _window) then
    raise exception 'Sua confirmação de senha expirou. Digite a senha novamente para assinar';
  end if;

  if _iat > now() + interval '60 seconds' then
    raise exception 'Sessao de autenticacao invalida para assinatura';
  end if;

  return _iat;
end;
$$;

create or replace function public.create_electronic_signature_v1(
  _process_id uuid,
  _entity_type text,
  _entity_id text,
  _content_sha256 text,
  _document_version integer default null,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _auth_iat timestamptz;
  _tenant_id uuid;
  _municipality_id uuid;
  _profile public.profiles%rowtype;
  _department public.departments%rowtype;
  _membership jsonb := '{}'::jsonb;
  _signed_at timestamptz := now();
  _signature_code text;
  _fingerprint text;
  _record public.electronic_signatures%rowtype;
  _entity_exists boolean := false;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _entity_type not in ('process_document_review','payment_guide_issue','process_dispatch','analysis_conclusion','official_document') then
    raise exception 'Tipo de assinatura nao suportado';
  end if;

  if coalesce(_content_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash SHA-256 invalido para assinatura';
  end if;

  select p.tenant_id,coalesce(p.municipality_id,p.tenant_id)
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Somente perfil municipal autorizado pode assinar este ato';
  end if;

  _auth_iat := public.require_recent_password_auth_v1(180);

  if _entity_type='process_document_review' then
    select exists(
      select 1 from public.process_documents d
      where d.id::text=_entity_id
        and d.process_id=_process_id
        and coalesce(d.is_valid,true)=true
        and (_document_version is null or d.version=_document_version)
    ) into _entity_exists;
  elsif _entity_type='payment_guide_issue' then
    select exists(
      select 1 from public.payment_guides g
      where g.id::text=_entity_id and g.process_id=_process_id
    ) into _entity_exists;
  elsif _entity_type='process_dispatch' then
    select exists(
      select 1 from public.interdepartmental_dispatches d
      where d.id::text=_entity_id and d.process_id=_process_id
    ) into _entity_exists;
  elsif _entity_type='analysis_conclusion' then
    _entity_exists := (_entity_id=_process_id::text);
  else
    _entity_exists := true;
  end if;

  if not _entity_exists then
    raise exception 'Objeto da assinatura nao pertence ao processo ou nao existe';
  end if;

  select * into _profile from public.profiles where id=_profile_id;
  if _profile.id is null or _profile.account_status<>'active' then
    raise exception 'Perfil do assinante inativo ou nao encontrado';
  end if;

  if _profile.department_id is not null then
    select * into _department from public.departments where id=_profile.department_id;
  end if;

  select to_jsonb(tm) into _membership
  from public.tenant_memberships tm
  where tm.profile_id=_profile_id
    and tm.tenant_id=_tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last,tm.created_at desc nulls last
  limit 1;

  _signature_code :=
    'SIG-'||to_char(_signed_at,'YYYYMMDD')||'-'||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));

  _fingerprint := encode(
    extensions.digest(
      concat_ws('|',
        _signature_code,
        lower(_content_sha256),
        _process_id::text,
        _entity_type,
        _entity_id,
        _profile_id::text,
        _signed_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.electronic_signatures(
    tenant_id,municipality_id,process_id,entity_type,entity_id,document_version,
    signer_profile_id,signer_user_id,signer_name,signer_role,signer_profile_label,
    signer_title,department_id,department_code,department_name,auth_method,
    assurance_level,content_sha256,signature_code,signature_fingerprint,statement,
    auth_iat,signed_at
  )
  values(
    _tenant_id,_municipality_id,_process_id,_entity_type,_entity_id,_document_version,
    _profile_id,_legacy_user_id,coalesce(nullif(btrim(_profile.full_name),''),'Usuario'),
    coalesce(public.current_role_code(),_profile.role),
    nullif(btrim(_membership->>'profile_label'),''),
    coalesce(nullif(btrim(_membership->>'position_title'),''),nullif(btrim(_profile.professional_type),'')),
    _department.id,nullif(btrim(_department.code),''),nullif(btrim(_department.name),''),
    'password','simple_password',lower(_content_sha256),_signature_code,_fingerprint,
    nullif(btrim(_statement),''),_auth_iat,_signed_at
  )
  returning * into _record;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _tenant_id,_municipality_id,_process_id,_legacy_user_id,_profile_id,
    'assinatura','Assinatura eletrônica registrada',
    'Ato '||_entity_type||' assinado eletronicamente. Código de verificação '||_signature_code||'.',
    true,_signed_at
  );

  return jsonb_build_object(
    'id',_record.id,
    'processId',_record.process_id,
    'entityType',_record.entity_type,
    'entityId',_record.entity_id,
    'documentVersion',_record.document_version,
    'signerProfileId',_record.signer_profile_id,
    'signerName',_record.signer_name,
    'signerRole',_record.signer_role,
    'signerProfileLabel',_record.signer_profile_label,
    'signerTitle',_record.signer_title,
    'departmentId',_record.department_id,
    'departmentCode',_record.department_code,
    'departmentName',_record.department_name,
    'authMethod',_record.auth_method,
    'assuranceLevel',_record.assurance_level,
    'contentSha256',_record.content_sha256,
    'signatureCode',_record.signature_code,
    'signatureFingerprint',_record.signature_fingerprint,
    'statement',_record.statement,
    'signedAt',_record.signed_at
  );
end;
$$;

create or replace function public.list_process_electronic_signatures_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
begin
  if public.current_profile_id() is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',s.id,
      'processId',s.process_id,
      'entityType',s.entity_type,
      'entityId',s.entity_id,
      'documentVersion',s.document_version,
      'signerProfileId',s.signer_profile_id,
      'signerName',s.signer_name,
      'signerRole',s.signer_role,
      'signerProfileLabel',s.signer_profile_label,
      'signerTitle',s.signer_title,
      'departmentId',s.department_id,
      'departmentCode',s.department_code,
      'departmentName',s.department_name,
      'authMethod',s.auth_method,
      'assuranceLevel',s.assurance_level,
      'contentSha256',s.content_sha256,
      'signatureCode',s.signature_code,
      'signatureFingerprint',s.signature_fingerprint,
      'statement',s.statement,
      'signedAt',s.signed_at,
      'revokedAt',s.revoked_at,
      'revocationReason',s.revocation_reason
    ) order by s.signed_at desc)
    from public.electronic_signatures s
    where s.process_id=_process_id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.approve_process_document_signed_v1(
  _document_id uuid,
  _content_sha256 text,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _process_id uuid;
  _version integer;
  _signature jsonb;
  _review jsonb;
begin
  select d.process_id,d.version into _process_id,_version
  from public.process_documents d
  where d.id=_document_id and coalesce(d.is_valid,true)=true;

  if _process_id is null then raise exception 'Documento nao encontrado'; end if;

  _signature := public.create_electronic_signature_v1(
    _process_id,'process_document_review',_document_id::text,_content_sha256,_version,
    coalesce(_statement,'Aprovação documental')
  );
  _review := public.review_process_document(_document_id,'aprovado');

  return jsonb_build_object('signature',_signature,'review',_review);
end;
$$;

create or replace function public.issue_process_payment_guide_signed_v1(
  _process_id uuid,
  _guide_kind text,
  _due_date date,
  _content_sha256 text,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _issued jsonb;
  _guide_id text;
  _signature jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  _issued := public.issue_process_payment_guide_v2(_process_id,_guide_kind,_due_date);
  _guide_id := coalesce(
    _issued->'guide'->>'id',
    _issued->>'guide_id',
    _issued->>'id'
  );

  if nullif(_guide_id,'') is null then
    select g.id::text into _guide_id
    from public.payment_guides g
    where g.process_id=_process_id and g.guide_kind=_guide_kind
    order by g.created_at desc
    limit 1;
  end if;

  if nullif(_guide_id,'') is null then
    raise exception 'Guia emitida sem identificador persistido';
  end if;

  _signature := public.create_electronic_signature_v1(
    _process_id,'payment_guide_issue',_guide_id,_content_sha256,null,
    coalesce(_statement,'Emissão de guia municipal')
  );

  return _issued || jsonb_build_object('electronic_signature',_signature);
end;
$$;

create or replace function public.create_process_dispatch_signed_v1(
  _process_id uuid,
  _from_department text,
  _to_department text,
  _subject text,
  _due_at timestamptz,
  _visibility text,
  _priority text,
  _assigned_to text,
  _content_sha256 text,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _dispatch_result jsonb;
  _dispatch_id text;
  _signature jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  _dispatch_result := public.create_process_dispatch(
    _process_id,_from_department,_to_department,_subject,_due_at,
    _visibility,_priority,_assigned_to
  );
  _dispatch_id := _dispatch_result->'dispatch'->>'id';

  if nullif(_dispatch_id,'') is null then
    raise exception 'Despacho criado sem identificador persistido';
  end if;

  _signature := public.create_electronic_signature_v1(
    _process_id,'process_dispatch',_dispatch_id,_content_sha256,null,
    coalesce(_statement,'Despacho interdepartamental')
  );

  return _dispatch_result || jsonb_build_object('electronic_signature',_signature);
end;
$$;

create or replace function public.issue_process_payment_guide_signed_v2(
  _process_id uuid,
  _guide_kind text,
  _due_date date,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
set row_security to 'off'
as $
declare
  _issued jsonb;
  _guide_id text;
  _guide_hash text;
  _signature jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  _issued := public.issue_process_payment_guide_v2(_process_id,_guide_kind,_due_date);
  _guide_id := coalesce(_issued->'guide'->>'id',_issued->>'guide_id',_issued->>'id');

  if nullif(_guide_id,'') is null then
    select g.id::text into _guide_id
    from public.payment_guides g
    where g.process_id=_process_id and g.guide_kind=_guide_kind
    order by g.created_at desc
    limit 1;
  end if;

  select encode(extensions.digest(to_jsonb(g)::text,'sha256'),'hex')
    into _guide_hash
  from public.payment_guides g
  where g.id::text=_guide_id and g.process_id=_process_id;

  if nullif(_guide_id,'') is null or nullif(_guide_hash,'') is null then
    raise exception 'Guia emitida sem registro oficial para assinatura';
  end if;

  _signature := public.create_electronic_signature_v1(
    _process_id,'payment_guide_issue',_guide_id,_guide_hash,null,
    coalesce(_statement,'Emissão de guia municipal')
  );

  return _issued || jsonb_build_object('electronic_signature',_signature);
end;
$;

create or replace function public.create_process_dispatch_signed_v2(
  _process_id uuid,
  _from_department text,
  _to_department text,
  _subject text,
  _due_at timestamptz,
  _visibility text,
  _priority text,
  _assigned_to text,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
set row_security to 'off'
as $
declare
  _dispatch_result jsonb;
  _dispatch_id text;
  _dispatch_hash text;
  _signature jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  _dispatch_result := public.create_process_dispatch(
    _process_id,_from_department,_to_department,_subject,_due_at,
    _visibility,_priority,_assigned_to
  );
  _dispatch_id := _dispatch_result->'dispatch'->>'id';

  select encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex')
    into _dispatch_hash
  from public.interdepartmental_dispatches d
  where d.id::text=_dispatch_id and d.process_id=_process_id;

  if nullif(_dispatch_id,'') is null or nullif(_dispatch_hash,'') is null then
    raise exception 'Despacho criado sem registro oficial para assinatura';
  end if;

  _signature := public.create_electronic_signature_v1(
    _process_id,'process_dispatch',_dispatch_id,_dispatch_hash,null,
    coalesce(_statement,'Despacho interdepartamental')
  );

  return _dispatch_result || jsonb_build_object('electronic_signature',_signature);
end;
$;

grant execute on function public.create_electronic_signature_v1(uuid,text,text,text,integer,text) to authenticated;
grant execute on function public.list_process_electronic_signatures_v1(uuid) to authenticated;
grant execute on function public.approve_process_document_signed_v1(uuid,text,text) to authenticated;
grant execute on function public.issue_process_payment_guide_signed_v1(uuid,text,date,text,text) to authenticated;
grant execute on function public.create_process_dispatch_signed_v1(uuid,text,text,text,timestamptz,text,text,text,text,text) to authenticated;
grant execute on function public.issue_process_payment_guide_signed_v2(uuid,text,date,text) to authenticated;
grant execute on function public.create_process_dispatch_signed_v2(uuid,text,text,text,timestamptz,text,text,text,text) to authenticated;
