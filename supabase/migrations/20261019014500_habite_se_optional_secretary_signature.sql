-- SIGAPRO — Habite-se: assinatura complementar opcional da Secretaria.
-- A assinatura obrigatória e conclusiva continua sendo a da Diretoria.
-- Esta RPC só cria a solicitação depois de localizar a mesma versão do Alvará
-- já assinada pela Diretoria e notifica perfis municipais de Secretaria.

create or replace function public.request_habite_se_secretary_signature_v1(
  _process_id uuid,
  _artifact_key text,
  _artifact_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _block public.signature_blocks%rowtype;
  _request public.process_signature_requests%rowtype;
  _role text;
  _position text;
  _candidate_count integer := 0;
begin
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
      nullif(btrim(tm.position_title),''),
      nullif(btrim(tm.profile_label),''),
      nullif(btrim(r.label),'')
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

  if not (
    _role in (
      'master_admin','master_ops','prefeitura_admin','prefeitura_supervisor',
      'diretor','director','prefeitura_diretor','prefeitura_diretora'
    )
    or lower(coalesce(_position,'')) ~ '(diretor|diretora)'
  ) then
    raise exception 'Somente a Diretoria ou a administração pode solicitar a assinatura complementar da Secretaria.';
  end if;

  select * into _block
  from public.signature_blocks
  where process_id = _process_id
    and document_id is null
    and artifact_key = lower(btrim(coalesce(_artifact_key,'')))
    and evidence_hash = lower(btrim(coalesce(_artifact_hash,'')))
    and artifact_type = 'habite_se_permit'
    and status = 'concluido'
  order by artifact_version desc
  limit 1;

  if _block.id is null then
    raise exception 'A versão oficial do Alvará de Habite-se não foi localizada.';
  end if;

  if not exists (
    select 1
    from public.signatures
    where signature_block_id = _block.id
      and signer_slot = 'diretoria'
      and status = 'concluido'
  ) then
    raise exception 'A Diretoria precisa assinar o Alvará antes da solicitação complementar à Secretaria.';
  end if;

  if exists (
    select 1
    from public.signatures
    where signature_block_id = _block.id
      and signer_slot = 'secretaria'
      and status = 'concluido'
  ) then
    raise exception 'A Secretaria já assinou eletronicamente esta versão.';
  end if;

  update public.process_signature_requests
  set status = 'stale'
  where process_id = _process_id
    and artifact_key = lower(btrim(coalesce(_artifact_key,'')))
    and signer_slot = 'secretaria'
    and status = 'pending'
    and artifact_hash <> lower(btrim(coalesce(_artifact_hash,'')));

  insert into public.process_signature_requests(
    tenant_id, municipality_id, process_id, artifact_key, artifact_hash,
    signer_slot, status, requested_by_profile_id, requested_by_user_id, note
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    lower(btrim(coalesce(_artifact_key,''))),
    lower(btrim(coalesce(_artifact_hash,''))),
    'secretaria', 'pending', _profile.id, _profile.user_id,
    'Assinatura complementar opcional da Secretaria'
  )
  on conflict do nothing
  returning * into _request;

  if _request.id is null then
    select * into _request
    from public.process_signature_requests
    where process_id = _process_id
      and artifact_key = lower(btrim(coalesce(_artifact_key,'')))
      and artifact_hash = lower(btrim(coalesce(_artifact_hash,'')))
      and signer_slot = 'secretaria'
      and status = 'pending'
    order by requested_at desc
    limit 1;
  end if;

  select count(distinct p.id)::int into _candidate_count
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id = p.id
   and tm.tenant_id = _process.tenant_id
   and tm.is_active = true
   and tm.deleted_at is null
  left join public.roles r on r.id = tm.role_id
  where p.municipality_id = _process.municipality_id
    and p.deleted_at is null
    and p.account_status = 'active'
    and replace(lower(coalesce(p.tipo,'')), '''', '') <> 'externo'
    and lower(coalesce(p.role,'')) not in ('profissional_externo','professional_external','professional','profissional')
    and (
      lower(coalesce(tm.position_title,'')) ~ '(secret[aá]ri)'
      or lower(coalesce(tm.profile_label,'')) ~ '(secret[aá]ri)'
      or lower(coalesce(r.code::text,'')) ~ '(secretar|secretary)'
      or lower(coalesce(p.role,'')) ~ '(secretar|secretary)'
    );

  if _candidate_count = 1 then
    update public.process_signature_requests req
    set assigned_profile_id = candidate.profile_id
    from (
      select p.id as profile_id
      from public.profiles p
      left join public.tenant_memberships tm
        on tm.profile_id = p.id
       and tm.tenant_id = _process.tenant_id
       and tm.is_active = true
       and tm.deleted_at is null
      left join public.roles r on r.id = tm.role_id
      where p.municipality_id = _process.municipality_id
        and p.deleted_at is null
        and p.account_status = 'active'
        and (
          lower(coalesce(tm.position_title,'')) ~ '(secret[aá]ri)'
          or lower(coalesce(tm.profile_label,'')) ~ '(secret[aá]ri)'
          or lower(coalesce(r.code::text,'')) ~ '(secretar|secretary)'
          or lower(coalesce(p.role,'')) ~ '(secretar|secretary)'
        )
      limit 1
    ) candidate
    where req.id = _request.id;
  end if;

  insert into public.notifications(
    user_id, profile_id, municipality_id, process_id,
    title, message, type, is_read, created_at, category, priority, action_url, metadata
  )
  select
    p.user_id, p.id, _process.municipality_id, _process.id,
    'Assinatura complementar do Habite-se',
    concat(
      'O processo ',
      coalesce(_process.protocol_number, _process.id::text),
      ' possui Alvará de Habite-se assinado pela Diretoria e aguarda assinatura complementar opcional da Secretaria.'
    ),
    'assinatura', false, clock_timestamp(), 'assinatura', 'normal',
    concat('/processos/', _process.id::text, '?tab=alvara'),
    jsonb_build_object(
      'artifact_key', lower(btrim(coalesce(_artifact_key,''))),
      'signer_slot', 'secretaria'
    )
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id = p.id
   and tm.tenant_id = _process.tenant_id
   and tm.is_active = true
   and tm.deleted_at is null
  left join public.roles r on r.id = tm.role_id
  where p.municipality_id = _process.municipality_id
    and p.deleted_at is null
    and p.account_status = 'active'
    and (
      lower(coalesce(tm.position_title,'')) ~ '(secret[aá]ri)'
      or lower(coalesce(tm.profile_label,'')) ~ '(secret[aá]ri)'
      or lower(coalesce(r.code::text,'')) ~ '(secretar|secretary)'
      or lower(coalesce(p.role,'')) ~ '(secretar|secretary)'
    );

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id,
    actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    _profile.user_id, _profile.id,
    'assinatura',
    'Assinatura complementar da Secretaria solicitada',
    'Solicitação opcional enviada à Secretaria após a assinatura conclusiva da Diretoria.',
    false, clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', _request.id,
      'status', _request.status,
      'signer_slot', _request.signer_slot,
      'artifact_key', _request.artifact_key,
      'artifact_hash', _request.artifact_hash,
      'requested_at', _request.requested_at,
      'assigned_profile_id', _request.assigned_profile_id
    ),
    'candidate_count', _candidate_count
  );
end;
$function$;

grant execute on function public.request_habite_se_secretary_signature_v1(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
