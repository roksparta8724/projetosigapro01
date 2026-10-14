-- Private process identity snapshots.
-- Keeps full CPF/CNPJ and professional metadata out of generic process_parties SELECTs.
-- Public/process-facing rows retain only masked document suffixes.

create table if not exists public.process_party_private_data (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  party_id uuid not null unique references public.process_parties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  municipality_id uuid null references public.municipalities(id) on delete set null,
  document_number text null,
  registration_number text null,
  professional_type text null,
  email text null,
  phone text null,
  company_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_process_party_private_process_id
  on public.process_party_private_data(process_id);

create index if not exists idx_process_party_private_scope
  on public.process_party_private_data(municipality_id, process_id);

alter table public.process_party_private_data enable row level security;
revoke all on table public.process_party_private_data from authenticated;

insert into public.process_party_private_data(
  process_id, party_id, tenant_id, municipality_id,
  document_number, registration_number, professional_type,
  email, phone, company_name
)
select
  pp.process_id,
  pp.id,
  pp.tenant_id,
  coalesce(pp.municipality_id, pr.municipality_id, pp.tenant_id),
  case
    when length(regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')) in (11,14)
      then regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')
    else null
  end,
  nullif(btrim(p.registration_number),''),
  nullif(btrim(p.professional_type),''),
  nullif(btrim(p.email),''),
  nullif(btrim(coalesce(p.phone,p.telefone)),''),
  nullif(btrim(p.company_name),'')
from public.process_parties pp
join public.processes pr on pr.id=pp.process_id
left join public.profiles p on p.id=pp.profile_id
where pp.party_type in ('profissional_externo','proprietario')
on conflict (party_id) do update
set
  municipality_id=coalesce(excluded.municipality_id,public.process_party_private_data.municipality_id),
  document_number=coalesce(excluded.document_number,public.process_party_private_data.document_number),
  registration_number=coalesce(excluded.registration_number,public.process_party_private_data.registration_number),
  professional_type=coalesce(excluded.professional_type,public.process_party_private_data.professional_type),
  email=coalesce(excluded.email,public.process_party_private_data.email),
  phone=coalesce(excluded.phone,public.process_party_private_data.phone),
  company_name=coalesce(excluded.company_name,public.process_party_private_data.company_name),
  updated_at=now();

CREATE OR REPLACE FUNCTION public.get_process_private_identity_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _role_code text := coalesce(public.current_role_code(),'');
  _is_internal boolean := public.is_master() or public.is_internal_municipality_role();
  _is_professional boolean := false;
  _is_owner boolean := false;
  _owner jsonb := '{}'::jsonb;
  _professional jsonb := '{}'::jsonb;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  select exists(
    select 1 from public.processes pr
    where pr.id=_process_id and pr.created_by_profile_id=_profile_id
  ) or exists(
    select 1 from public.process_parties pp
    where pp.process_id=_process_id
      and pp.party_type='profissional_externo'
      and pp.profile_id=_profile_id
  ) into _is_professional;

  select exists(
    select 1 from public.process_parties pp
    where pp.process_id=_process_id
      and pp.party_type='proprietario'
      and pp.profile_id=_profile_id
  ) or exists(
    select 1 from public.project_owner_links pol
    where pol.project_id=_process_id and pol.owner_profile_id=_profile_id
  ) into _is_owner;

  if _is_internal or _is_professional or _is_owner then
    select jsonb_build_object(
      'partyId', pp.id,
      'name', pp.display_name,
      'documentNumber',
        case
          when _is_internal or _is_professional or _is_owner then
            coalesce(
              pd.document_number,
              case
                when length(regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')) in (11,14)
                  then regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')
                else ''
              end
            )
          else ''
        end
    )
    into _owner
    from public.process_parties pp
    left join public.process_party_private_data pd on pd.party_id=pp.id
    left join public.profiles p on p.id=pp.profile_id
    where pp.process_id=_process_id and pp.party_type='proprietario'
    order by pp.is_primary desc, pp.created_at
    limit 1;
  end if;

  if _is_internal or _is_professional then
    select jsonb_build_object(
      'partyId', pp.id,
      'name', pp.display_name,
      'documentNumber',
        coalesce(
          pd.document_number,
          case
            when length(regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')) in (11,14)
              then regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')
            else ''
          end
        ),
      'registrationNumber', coalesce(pd.registration_number,p.registration_number,''),
      'professionalType', coalesce(pd.professional_type,p.professional_type,''),
      'email', coalesce(pd.email,p.email,''),
      'phone', coalesce(pd.phone,p.phone,p.telefone,''),
      'companyName', coalesce(pd.company_name,p.company_name,'')
    )
    into _professional
    from public.process_parties pp
    left join public.process_party_private_data pd on pd.party_id=pp.id
    left join public.profiles p on p.id=pp.profile_id
    where pp.process_id=_process_id and pp.party_type='profissional_externo'
    order by pp.is_primary desc, pp.created_at
    limit 1;
  end if;

  return jsonb_build_object(
    'processId',_process_id,
    'owner',coalesce(_owner,'{}'::jsonb),
    'professional',coalesce(_professional,'{}'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_process_private_identity_v1(_process_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _creator_profile_id uuid;
  _professional_party_id uuid;
  _professional_profile_id uuid;
  _professional_user_id uuid;
  _owner_party_id uuid;
  _professional_document text;
  _owner_document text;
  _professional_name text;
  _owner_name text;
  _registration_number text;
  _professional_type text;
  _professional_email text;
  _professional_phone text;
  _professional_company text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select p.tenant_id,coalesce(p.municipality_id,p.tenant_id),p.created_by_profile_id
    into _tenant_id,_municipality_id,_creator_profile_id
  from public.processes p where p.id=_process_id;

  if _tenant_id is null then raise exception 'Processo nao encontrado'; end if;
  if not public.has_process_access(_process_id) then raise exception 'Sem acesso ao processo'; end if;

  if not (
    public.is_master()
    or public.is_internal_municipality_role()
    or _creator_profile_id=_profile_id
    or exists(
      select 1 from public.process_parties pp
      where pp.process_id=_process_id
        and pp.party_type='profissional_externo'
        and pp.profile_id=_profile_id
    )
  ) then
    raise exception 'Sem permissao para atualizar os dados cadastrais deste processo';
  end if;

  _professional_name := nullif(btrim(_payload->>'technicalLead'),'');
  _owner_name := nullif(btrim(_payload->>'ownerName'),'');
  _professional_document := regexp_replace(coalesce(_payload->>'professionalDocument',''),'\D','','g');
  if length(_professional_document) not in (11,14) then _professional_document := null; end if;
  _owner_document := regexp_replace(coalesce(_payload->>'ownerDocument',''),'\D','','g');
  if length(_owner_document) not in (11,14) then _owner_document := null; end if;
  _registration_number := nullif(btrim(_payload->>'professionalRegistration'),'');
  _professional_type := nullif(btrim(_payload->>'professionalType'),'');
  _professional_email := nullif(btrim(_payload->>'professionalEmail'),'');
  _professional_phone := nullif(btrim(_payload->>'professionalPhone'),'');
  _professional_company := nullif(btrim(_payload->>'professionalCompany'),'');

  select pp.id,pp.profile_id,pp.user_id
    into _professional_party_id,_professional_profile_id,_professional_user_id
  from public.process_parties pp
  where pp.process_id=_process_id and pp.party_type='profissional_externo'
  order by pp.is_primary desc,pp.created_at limit 1;

  if _professional_party_id is null then
    _professional_profile_id := _creator_profile_id;
    select p.user_id into _professional_user_id
    from public.profiles p where p.id=_professional_profile_id limit 1;

    insert into public.process_parties(
      process_id,tenant_id,municipality_id,user_id,profile_id,party_type,
      display_name,document_masked,is_primary
    ) values(
      _process_id,_tenant_id,_municipality_id,_professional_user_id,_professional_profile_id,
      'profissional_externo',coalesce(_professional_name,'Profissional externo'),
      case when _professional_document is not null then '***'||right(_professional_document,4) else null end,
      true
    ) returning id into _professional_party_id;
  else
    update public.process_parties
       set municipality_id=coalesce(municipality_id,_municipality_id),
           display_name=coalesce(_professional_name,display_name),
           document_masked=case when _professional_document is not null
             then '***'||right(_professional_document,4) else document_masked end
     where id=_professional_party_id;
  end if;

  if _professional_profile_id is not null then
    select
      coalesce(_professional_document,
        case when length(regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g')) in (11,14)
          then regexp_replace(coalesce(p.cpf_cnpj,p.cpf,''),'\D','','g') else null end),
      coalesce(_registration_number,nullif(btrim(p.registration_number),'')),
      coalesce(_professional_type,nullif(btrim(p.professional_type),'')),
      coalesce(_professional_email,nullif(btrim(p.email),'')),
      coalesce(_professional_phone,nullif(btrim(coalesce(p.phone,p.telefone)),'')),
      coalesce(_professional_company,nullif(btrim(p.company_name),''))
    into _professional_document,_registration_number,_professional_type,
      _professional_email,_professional_phone,_professional_company
    from public.profiles p where p.id=_professional_profile_id;
  end if;

  insert into public.process_party_private_data(
    process_id,party_id,tenant_id,municipality_id,document_number,
    registration_number,professional_type,email,phone,company_name
  ) values(
    _process_id,_professional_party_id,_tenant_id,_municipality_id,_professional_document,
    _registration_number,_professional_type,_professional_email,_professional_phone,_professional_company
  )
  on conflict (party_id) do update set
    document_number=coalesce(excluded.document_number,public.process_party_private_data.document_number),
    registration_number=coalesce(excluded.registration_number,public.process_party_private_data.registration_number),
    professional_type=coalesce(excluded.professional_type,public.process_party_private_data.professional_type),
    email=coalesce(excluded.email,public.process_party_private_data.email),
    phone=coalesce(excluded.phone,public.process_party_private_data.phone),
    company_name=coalesce(excluded.company_name,public.process_party_private_data.company_name),
    municipality_id=coalesce(excluded.municipality_id,public.process_party_private_data.municipality_id),
    updated_at=now();

  select pp.id into _owner_party_id
  from public.process_parties pp
  where pp.process_id=_process_id and pp.party_type='proprietario'
  order by pp.is_primary desc,pp.created_at limit 1;

  if _owner_party_id is null and (_owner_name is not null or _owner_document is not null) then
    insert into public.process_parties(
      process_id,tenant_id,municipality_id,user_id,profile_id,party_type,
      display_name,document_masked,is_primary
    ) values(
      _process_id,_tenant_id,_municipality_id,null,null,'proprietario',
      coalesce(_owner_name,'Proprietario nao informado'),
      case when _owner_document is not null then '***'||right(_owner_document,4) else null end,false
    ) returning id into _owner_party_id;
  elsif _owner_party_id is not null then
    update public.process_parties
       set municipality_id=coalesce(municipality_id,_municipality_id),
           display_name=coalesce(_owner_name,display_name),
           document_masked=case when _owner_document is not null
             then '***'||right(_owner_document,4) else document_masked end
     where id=_owner_party_id;
  end if;

  if _owner_party_id is not null then
    insert into public.process_party_private_data(
      process_id,party_id,tenant_id,municipality_id,document_number
    ) values(_process_id,_owner_party_id,_tenant_id,_municipality_id,_owner_document)
    on conflict (party_id) do update set
      document_number=coalesce(excluded.document_number,public.process_party_private_data.document_number),
      municipality_id=coalesce(excluded.municipality_id,public.process_party_private_data.municipality_id),
      updated_at=now();
  end if;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  ) values(
    _tenant_id,_municipality_id,_process_id,_legacy_user_id,_profile_id,
    'perfil','Dados cadastrais do processo atualizados',
    'Dados cadastrais de proprietario e responsavel tecnico registrados sem expor documentos no historico.',
    true,now()
  );

  return public.get_process_private_identity_v1(_process_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_external_process_v3(_tenant_id uuid, _payload jsonb, _protocol_prefix text DEFAULT 'PM'::text, _requested_protocol_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _result jsonb; _process_id uuid;
begin
  _result := public.create_external_process_v2(
    _tenant_id,_payload,_protocol_prefix,_requested_protocol_number
  );
  _process_id := nullif(_result->>'process_id','')::uuid;
  if _process_id is null then raise exception 'Processo nao retornado pela criacao oficial'; end if;
  perform public.save_process_private_identity_v1(_process_id,_payload);
  return _result || jsonb_build_object('identity_saved',true);
end;
$function$
;


grant execute on function public.get_process_private_identity_v1(uuid) to authenticated;
grant execute on function public.save_process_private_identity_v1(uuid,jsonb) to authenticated;
grant execute on function public.create_external_process_v3(uuid,jsonb,text,text) to authenticated;
