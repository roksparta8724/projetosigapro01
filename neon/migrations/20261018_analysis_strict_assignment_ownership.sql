-- SIGAPRO — propriedade técnica exclusiva da análise.
-- Um processo possui um único Analista responsável por vez.
-- A Diretoria pode supervisionar/retificar e redistribuir; a redistribuição
-- revoga imediatamente o direito do Analista anterior e transfere ao novo.

begin;

create or replace function public.can_write_process_analysis(_process_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text := lower(coalesce(public.current_role_code(),''));
  _actor_municipality uuid;
  _actor_name text;
  _actor_area text;
  _process public.processes%rowtype;
  _assigned_name text;
begin
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.municipality_id,
         lower(btrim(coalesce(p.full_name,'')))
    into _actor_municipality,_actor_name
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_municipality is null then return false; end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null then return false; end if;

  if _actor_municipality is distinct from coalesce(_process.municipality_id,_process.tenant_id) then
    return false;
  end if;

  _actor_area := public.profile_operational_area(_actor);

  -- A Diretoria de Urbanismo pode supervisionar e retificar.
  if _actor_role='prefeitura_supervisor' and _actor_area='analise' then
    return true;
  end if;

  if _actor_role not in ('analista','analyst') or _actor_area<>'analise' then
    return false;
  end if;

  -- Quando existe vínculo por profile_id, ele é a fonte de verdade. Assim,
  -- ao redistribuir o processo o antigo Analista perde acesso no mesmo instante.
  if _process.analysis_assigned_to_profile_id is not null then
    return _process.analysis_assigned_to_profile_id=_actor;
  end if;

  -- Compatibilidade apenas para processos antigos sem profile_id.
  _assigned_name := lower(btrim(coalesce(_process.analysis_assigned_to,'')));
  return _assigned_name<>'' and _actor_name<>'' and _assigned_name=_actor_name;
end;
$function$;

create or replace function public.get_process_artifact_signature_context_v1(
  _process_id uuid,
  _signer_slot text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
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
      public.is_master()
      or (
        _role in ('analista','analyst')
        and public.can_write_process_analysis(_process_id)
      );
  elsif _slot='conferencia_fiscal' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','fiscal')
      or lower(coalesce(_position,'')) ~ '(fiscal|diretor|diretora|secret[aá]ri)';
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

revoke all on function public.can_write_process_analysis(uuid) from public;
revoke all on function public.get_process_artifact_signature_context_v1(uuid,text) from public;
grant execute on function public.can_write_process_analysis(uuid) to authenticated;
grant execute on function public.get_process_artifact_signature_context_v1(uuid,text) to authenticated;

comment on function public.can_write_process_analysis(uuid)
is 'Autoriza escrita técnica somente ao Analista atualmente atribuído ou à Diretoria da Análise; redistribuição transfere a titularidade imediatamente.';

commit;

notify pgrst, 'reload schema';
