-- SIGAPRO — fila própria de pré-protocolos para o Setor de Protocolo.
-- O setor pode conferir/baixar a guia sem receber um processo municipal antes do pagamento.

create or replace function public.list_pending_preprotocol_payments_v1()
returns table(
  process_id uuid,
  pre_protocol_number text,
  title text,
  process_type text,
  created_at timestamptz,
  guide_id uuid,
  guide_number text,
  amount numeric,
  due_date timestamp without time zone,
  guide_status text,
  submitter_name text
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _municipality_id uuid;
  _role_code text := coalesce(public.current_role_code(),'');
  _area text;
begin
  select p.municipality_id
    into _municipality_id
  from public.profiles p
  where p.id=_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _profile_id is null or _municipality_id is null then
    raise exception 'Perfil municipal ativo nao encontrado';
  end if;

  _area := public.profile_operational_area(_profile_id);

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura','setor_intersetorial','counter_service')
    or _area='protocolos'
  ) then
    raise exception 'Somente o Setor de Protocolo pode consultar pre-protocolos aguardando pagamento';
  end if;

  return query
  select
    p.id,
    p.pre_protocol_number,
    p.title,
    p.process_type,
    p.created_at,
    g.id,
    g.guide_number,
    g.amount,
    g.due_date,
    coalesce(g.status,'pendente'),
    coalesce(
      (
        select pp.display_name
        from public.process_parties pp
        where pp.process_id=p.id
          and pp.party_type='profissional_externo'
        order by pp.is_primary desc,pp.id
        limit 1
      ),
      'Profissional externo'
    )
  from public.processes p
  join public.payment_guides g
    on g.process_id=p.id
   and g.guide_kind='protocolo'
  where p.officialized_at is null
    and coalesce(p.municipality_id,p.tenant_id)=_municipality_id
    and not coalesce(g.paid,false)
    and lower(coalesce(g.status,'pendente')) not in ('compensada','confirmed','paid','pago','confirmado')
  order by p.created_at asc,g.created_at asc;
end;
$function$;

create or replace function public.confirm_preprotocol_payment_v1(
  _process_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _profile_municipality uuid;
  _role_code text := coalesce(public.current_role_code(),'');
  _area text;
  _process public.processes%rowtype;
  _guide public.payment_guides%rowtype;
begin
  select p.municipality_id
    into _profile_municipality
  from public.profiles p
  where p.id=_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _profile_id is null or _profile_municipality is null then
    raise exception 'Perfil municipal ativo nao encontrado';
  end if;

  _area := public.profile_operational_area(_profile_id);

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura','setor_intersetorial','counter_service')
    or _area='protocolos'
  ) then
    raise exception 'A baixa da guia inicial pertence ao Setor de Protocolo';
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if coalesce(_process.municipality_id,_process.tenant_id) <> _profile_municipality
     and not public.is_master() then
    raise exception 'O pre-protocolo pertence a outra Prefeitura';
  end if;

  if _process.officialized_at is not null then
    return jsonb_build_object(
      'ok',true,
      'already_official',true,
      'process_id',_process.id,
      'protocol_number',_process.protocol_number,
      'pre_protocol_number',_process.pre_protocol_number,
      'officialized_at',_process.officialized_at
    );
  end if;

  select * into _guide
  from public.payment_guides g
  where g.process_id=_process.id
    and g.guide_kind='protocolo'
  order by g.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia inicial nao encontrada';
  end if;

  if coalesce(_guide.paid,false)
     or lower(coalesce(_guide.status,'')) in ('compensada','confirmed','paid','pago','confirmado') then
    perform public.officialize_preprotocol_v1(_process.id,_guide.id);
  else
    update public.payment_guides
       set paid=true,
           paid_at=now(),
           status='compensada'
     where id=_guide.id
     returning * into _guide;
    -- O trigger aaa_officialize_preprotocol_after_payment_v1 oficializa
    -- o processo dentro da mesma transacao.
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id;

  return jsonb_build_object(
    'ok',true,
    'already_official',false,
    'process_id',_process.id,
    'protocol_number',_process.protocol_number,
    'pre_protocol_number',_process.pre_protocol_number,
    'officialized_at',_process.officialized_at,
    'guide_number',_guide.guide_number
  );
end;
$function$;

grant execute on function public.list_pending_preprotocol_payments_v1() to authenticated;
grant execute on function public.confirm_preprotocol_payment_v1(uuid) to authenticated;
notify pgrst, 'reload schema';
