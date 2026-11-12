-- SIGAPRO 2026-11-12: tighten electronic signature roles for municipal documents.
-- A municipal admin is view-only and may NOT sign municipal acts.
-- A master/operator cannot impersonate an assigned technical analyst.
-- Existing signed artifacts, verification codes, contracts and payment rows unchanged.
-- This is a role policy, NOT an ICP-Brasil cryptographic provider.

CREATE OR REPLACE FUNCTION public.get_process_artifact_signature_context_v1(_process_id uuid, _signer_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(),_profile.role,''));

  select coalesce(
      nullif(btrim(tm.position_title),''),
      nullif(btrim(tm.profile_label),''),
      nullif(btrim(r.label),'')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id=tm.role_id
  where tm.profile_id=_profile.id
    and tm.tenant_id=_process.tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last,tm.created_at desc nulls last
  limit 1;

  _position := coalesce(_position,nullif(btrim(_profile.professional_type),''),_role);
  _registration := nullif(btrim(_profile.registration_number),'');

  if _slot='analise_tecnica' then
    -- A assinatura técnica pertence ao Analista responsável atual. A Diretoria
    -- assina no slot próprio "diretoria", nunca se passando pelo Analista.
    _allowed :=
      _role in ('analista','analyst')
      and public.can_write_process_analysis(_process_id);
  elsif _slot='conferencia_fiscal' then
    _allowed :=
      _role not in ('admin_master','master_admin','master_ops','prefeitura_admin','admin_municipality','admin_prefeitura')
      and replace(lower(coalesce(_profile.tipo,'')),'''','') <> 'externo'
      and (
        _role in ('prefeitura_supervisor','fiscal')
        or lower(coalesce(_position,'')) ~ '(fiscal|diretor|diretora|secret[aá]ri)'
      );
  elsif _slot='diretoria' then
    _allowed :=
      replace(lower(coalesce(_profile.tipo,'')),'''','') <> 'externo'
      and _role not in ('profissional_externo','professional_external','professional','profissional')
      and (
        _role in ('diretor','director','prefeitura_diretor','prefeitura_diretora')
        or lower(coalesce(_position,'')) ~ '(diretor|diretora)'
      );
  elsif _slot='secretaria' then
    _allowed :=
      replace(lower(coalesce(_profile.tipo,'')),'''','') <> 'externo'
      and _role not in ('profissional_externo','professional_external','professional','profissional')
      and (
        _role in ('secretario','secretaria','secretary','prefeitura_secretario','prefeitura_secretaria')
        or lower(coalesce(_position,'')) ~ '(secret[aá]ri)'
      );
  elsif _slot='profissional' then
    _allowed := _role in ('profissional_externo','professional_external','professional','profissional');
  end if;

  if not _allowed then
    if _slot='analise_tecnica' then
      raise exception 'Somente o Analista responsável atual pode registrar a assinatura técnica desta versão.';
    end if;
    raise exception 'Este perfil não possui atribuição para esta assinatura.';
  end if;

  return jsonb_build_object(
    'auth_subject',public.current_auth_subject(),
    'profile_id',_profile.id,
    'user_id',_profile.user_id,
    'email',lower(coalesce(_profile.email,'')),
    'name',coalesce(nullif(btrim(_profile.full_name),''),_profile.email,'Usuário'),
    'role',_role,
    'title',_position,
    'registration',_registration,
    'signer_slot',_slot,
    'process_id',_process.id,
    'tenant_id',_process.tenant_id,
    'municipality_id',_process.municipality_id,
    'protocol_number',_process.protocol_number,
    'process_title',_process.title
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_signature_context_v1(_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
    -- Prefeitura Admin é somente leitura; não pode assinar atos/documentos por terceiro.
    'fiscal'
  ) then
    raise exception 'Este perfil não possui permissão para assinar documentos.';
  end if;

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
    'file_path', _document.file_path,
    'document_hash', _document.file_hash,
    'document_version', _document.version,
    'municipality_id', coalesce(_process.municipality_id, _document.municipality_id),
    'tenant_id', _process.tenant_id
  );
end;
$function$;
