-- SIGAPRO: solicitação do proprietário com escopo municipal e idempotência.

create unique index if not exists project_owner_requests_pending_profile_uidx
  on public.project_owner_requests(project_id,owner_profile_id,professional_profile_id)
  where status='pending'
    and owner_profile_id is not null
    and professional_profile_id is not null;

create unique index if not exists project_owner_links_profile_uidx
  on public.project_owner_links(project_id,owner_profile_id,professional_profile_id)
  where owner_profile_id is not null
    and professional_profile_id is not null;

create or replace function public.create_owner_request_by_protocol(
  _protocol text,
  _owner_document text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _owner_profile_id uuid := public.current_profile_id();
  _owner_user_id uuid := public.current_legacy_user_id();
  _municipality_id uuid := public.current_municipality_id();
  _protocol_clean text := nullif(btrim(coalesce(_protocol,'')),'');
  _document_digits text := regexp_replace(coalesce(_owner_document,''),'\D','','g');
  _profile_document_digits text;
  _process public.processes%rowtype;
  _owner_party public.process_parties%rowtype;
  _professional_party public.process_parties%rowtype;
  _request public.project_owner_requests%rowtype;
  _existing_link public.project_owner_links%rowtype;
begin
  if _owner_profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _municipality_id is null then
    raise exception 'Conta sem vinculo ativo com uma Prefeitura';
  end if;

  if _protocol_clean is null then
    raise exception 'Informe o numero do protocolo';
  end if;

  if length(_document_digits) < 4 then
    raise exception 'Informe um CPF ou CNPJ valido';
  end if;

  select regexp_replace(coalesce(nullif(p.cpf_cnpj,''),nullif(p.cpf,''),''),'\D','','g')
    into _profile_document_digits
  from public.profiles p
  where p.id=_owner_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if coalesce(_profile_document_digits,'')='' then
    raise exception 'Atualize o CPF/CNPJ do seu perfil antes de solicitar acompanhamento';
  end if;

  if _profile_document_digits <> _document_digits then
    raise exception 'O documento informado nao corresponde ao documento da sua conta';
  end if;

  select p.*
    into _process
  from public.processes p
  where p.tenant_id=_municipality_id
    and (
      p.protocol_number=_protocol_clean
      or p.external_protocol_number=_protocol_clean
    )
  order by p.created_at desc
  limit 1;

  if _process.id is null then
    raise exception 'Protocolo nao encontrado nesta Prefeitura';
  end if;

  select pp.*
    into _owner_party
  from public.process_parties pp
  where pp.process_id=_process.id
    and pp.party_type='proprietario'
  order by pp.is_primary desc,pp.created_at
  limit 1;

  if _owner_party.id is null then
    raise exception 'Proprietario nao identificado neste processo';
  end if;

  if right(regexp_replace(coalesce(_owner_party.document_masked,''),'\D','','g'),4)
     <> right(_document_digits,4) then
    raise exception 'O documento informado nao corresponde ao proprietario deste processo';
  end if;

  select pp.*
    into _professional_party
  from public.process_parties pp
  where pp.process_id=_process.id
    and pp.party_type='profissional_externo'
  order by pp.is_primary desc,pp.created_at
  limit 1;

  if _professional_party.profile_id is null then
    raise exception 'Profissional responsavel nao possui perfil ativo vinculado ao processo';
  end if;

  select l.*
    into _existing_link
  from public.project_owner_links l
  where l.project_id=_process.id
    and l.owner_profile_id=_owner_profile_id
    and l.professional_profile_id=_professional_party.profile_id
  limit 1;

  if _existing_link.id is not null then
    raise exception 'Este processo ja esta vinculado a sua conta';
  end if;

  select r.*
    into _request
  from public.project_owner_requests r
  where r.project_id=_process.id
    and r.owner_profile_id=_owner_profile_id
    and r.professional_profile_id=_professional_party.profile_id
    and r.status='pending'
  order by r.requested_at desc
  limit 1;

  if _request.id is null then
    insert into public.project_owner_requests(
      project_id,
      owner_user_id,
      professional_user_id,
      owner_profile_id,
      professional_profile_id,
      status,
      requested_at,
      notes
    )
    values(
      _process.id,
      _owner_user_id,
      _professional_party.user_id,
      _owner_profile_id,
      _professional_party.profile_id,
      'pending',
      now(),
      nullif(btrim(_notes),'')
    )
    returning * into _request;
  end if;

  return jsonb_build_object(
    'request',jsonb_build_object(
      'id',_request.id,
      'project_id',_request.project_id,
      'owner_user_id',_request.owner_user_id,
      'professional_user_id',_request.professional_user_id,
      'owner_profile_id',_request.owner_profile_id,
      'professional_profile_id',_request.professional_profile_id,
      'status',_request.status,
      'requested_at',_request.requested_at,
      'responded_at',_request.responded_at,
      'responded_by',_request.responded_by,
      'responded_by_profile_id',_request.responded_by_profile_id,
      'notes',_request.notes
    ),
    'process',jsonb_build_object(
      'id',_process.id,
      'protocol',_process.protocol_number,
      'title',_process.title,
      'status',_process.status::text
    )
  );
end;
$function$;

revoke all on function public.create_owner_request_by_protocol(text,text,text) from public;
grant execute on function public.create_owner_request_by_protocol(text,text,text) to authenticated;
