-- SIGAPRO — identidade viva das partes vinculadas a perfis.
-- A parte processual continua guardando o snapshot original no payload/auditoria,
-- mas as telas operacionais passam a refletir o último cadastro salvo do perfil
-- quando existe vínculo inequívoco por profile_id.

create or replace function public.hydrate_process_party_identity_from_profile()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile public.profiles%rowtype;
  _digits text;
begin
  if new.profile_id is null then
    return new;
  end if;

  select * into _profile
  from public.profiles p
  where p.id=new.profile_id
    and p.deleted_at is null
  limit 1;

  if _profile.id is null then
    return new;
  end if;

  if nullif(btrim(coalesce(_profile.full_name,'')),'') is not null then
    new.display_name := btrim(_profile.full_name);
  end if;

  _digits := regexp_replace(
    coalesce(nullif(_profile.cpf_cnpj,''),nullif(_profile.cpf,''),''),
    '\D','','g'
  );

  if nullif(btrim(coalesce(_profile.document_masked,'')),'') is not null then
    new.document_masked := _profile.document_masked;
  elsif length(_digits) >= 4 then
    new.document_masked := '***'||right(_digits,4);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_hydrate_process_party_identity_from_profile
  on public.process_parties;

create trigger trg_hydrate_process_party_identity_from_profile
before insert or update of profile_id,display_name,document_masked
on public.process_parties
for each row
execute function public.hydrate_process_party_identity_from_profile();

create or replace function public.hydrate_process_party_private_from_profile()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _party public.process_parties%rowtype;
  _profile public.profiles%rowtype;
  _phone text;
begin
  select * into _party
  from public.process_parties p
  where p.id=new.party_id
  limit 1;

  if _party.profile_id is null then
    return new;
  end if;

  select * into _profile
  from public.profiles p
  where p.id=_party.profile_id
    and p.deleted_at is null
  limit 1;

  if _profile.id is null then
    return new;
  end if;

  _phone := coalesce(nullif(btrim(coalesce(_profile.phone,'')),''),nullif(btrim(coalesce(_profile.telefone,'')),''));

  if _party.party_type='profissional_externo' then
    new.document_number := coalesce(
      nullif(btrim(coalesce(_profile.cpf_cnpj,'')),''),
      nullif(btrim(coalesce(_profile.cpf,'')),''),
      new.document_number
    );
    new.registration_number := coalesce(
      nullif(btrim(coalesce(_profile.registration_number,'')),''),
      new.registration_number
    );
    new.professional_type := coalesce(
      nullif(btrim(coalesce(_profile.professional_type,'')),''),
      new.professional_type
    );
    new.email := coalesce(nullif(btrim(coalesce(_profile.email,'')),''),new.email);
    new.phone := coalesce(_phone,new.phone);
    new.company_name := coalesce(
      nullif(btrim(coalesce(_profile.company_name,'')),''),
      new.company_name
    );
  elsif _party.party_type='proprietario' then
    new.document_number := coalesce(
      nullif(btrim(coalesce(_profile.cpf_cnpj,'')),''),
      nullif(btrim(coalesce(_profile.cpf,'')),''),
      new.document_number
    );
    new.identity_document_number := coalesce(
      nullif(btrim(coalesce(_profile.rg,'')),''),
      new.identity_document_number
    );
    new.email := coalesce(nullif(btrim(coalesce(_profile.email,'')),''),new.email);
    new.phone := coalesce(_phone,new.phone);
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

drop trigger if exists trg_hydrate_process_party_private_from_profile
  on public.process_party_private_data;

create trigger trg_hydrate_process_party_private_from_profile
before insert or update
on public.process_party_private_data
for each row
execute function public.hydrate_process_party_private_from_profile();

create or replace function public.sync_profile_to_linked_process_parties()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _digits text;
  _masked text;
  _phone text;
begin
  _digits := regexp_replace(
    coalesce(nullif(new.cpf_cnpj,''),nullif(new.cpf,''),''),
    '\D','','g'
  );
  _masked := coalesce(
    nullif(btrim(coalesce(new.document_masked,'')),''),
    case when length(_digits)>=4 then '***'||right(_digits,4) else null end
  );
  _phone := coalesce(
    nullif(btrim(coalesce(new.phone,'')),''),
    nullif(btrim(coalesce(new.telefone,'')),'')
  );

  update public.process_parties pp
     set display_name=coalesce(nullif(btrim(coalesce(new.full_name,'')),''),pp.display_name),
         document_masked=coalesce(_masked,pp.document_masked)
   where pp.profile_id=new.id;

  update public.process_party_private_data d
     set document_number=coalesce(
           nullif(btrim(coalesce(new.cpf_cnpj,'')),''),
           nullif(btrim(coalesce(new.cpf,'')),''),
           d.document_number
         ),
         registration_number=coalesce(
           nullif(btrim(coalesce(new.registration_number,'')),''),
           d.registration_number
         ),
         professional_type=coalesce(
           nullif(btrim(coalesce(new.professional_type,'')),''),
           d.professional_type
         ),
         email=coalesce(nullif(btrim(coalesce(new.email,'')),''),d.email),
         phone=coalesce(_phone,d.phone),
         company_name=coalesce(
           nullif(btrim(coalesce(new.company_name,'')),''),
           d.company_name
         ),
         updated_at=clock_timestamp()
    from public.process_parties pp
   where pp.id=d.party_id
     and pp.profile_id=new.id
     and pp.party_type='profissional_externo';

  update public.process_party_private_data d
     set document_number=coalesce(
           nullif(btrim(coalesce(new.cpf_cnpj,'')),''),
           nullif(btrim(coalesce(new.cpf,'')),''),
           d.document_number
         ),
         identity_document_number=coalesce(
           nullif(btrim(coalesce(new.rg,'')),''),
           d.identity_document_number
         ),
         email=coalesce(nullif(btrim(coalesce(new.email,'')),''),d.email),
         phone=coalesce(_phone,d.phone),
         updated_at=clock_timestamp()
    from public.process_parties pp
   where pp.id=d.party_id
     and pp.profile_id=new.id
     and pp.party_type='proprietario';

  update public.processes pr
     set updated_at=clock_timestamp()
   where exists (
     select 1
     from public.process_parties pp
     where pp.process_id=pr.id
       and pp.profile_id=new.id
   );

  return new;
end;
$function$;

drop trigger if exists trg_sync_profile_to_linked_process_parties
  on public.profiles;

create trigger trg_sync_profile_to_linked_process_parties
after update of full_name,email,professional_type,cpf_cnpj,cpf,phone,telefone,
  registration_number,document_masked,company_name,rg
on public.profiles
for each row
execute function public.sync_profile_to_linked_process_parties();

-- Backfill seguro: corrige vínculos já existentes sem tocar snapshots históricos
-- como preprotocol_payload, movimentos, auditoria ou PDFs/guias já emitidos.
update public.process_parties pp
set display_name=coalesce(nullif(btrim(p.full_name),''),pp.display_name),
    document_masked=coalesce(
      nullif(btrim(coalesce(p.document_masked,'')),''),
      case
        when length(regexp_replace(coalesce(nullif(p.cpf_cnpj,''),nullif(p.cpf,''),''),'\D','','g'))>=4
          then '***'||right(regexp_replace(coalesce(nullif(p.cpf_cnpj,''),nullif(p.cpf,''),''),'\D','','g'),4)
        else pp.document_masked
      end
    )
from public.profiles p
where pp.profile_id=p.id
  and p.deleted_at is null;

update public.process_party_private_data d
set document_number=coalesce(nullif(btrim(coalesce(p.cpf_cnpj,'')),''),nullif(btrim(coalesce(p.cpf,'')),''),d.document_number),
    registration_number=coalesce(nullif(btrim(coalesce(p.registration_number,'')),''),d.registration_number),
    professional_type=coalesce(nullif(btrim(coalesce(p.professional_type,'')),''),d.professional_type),
    email=coalesce(nullif(btrim(coalesce(p.email,'')),''),d.email),
    phone=coalesce(nullif(btrim(coalesce(p.phone,'')),''),nullif(btrim(coalesce(p.telefone,'')),''),d.phone),
    company_name=coalesce(nullif(btrim(coalesce(p.company_name,'')),''),d.company_name),
    updated_at=clock_timestamp()
from public.process_parties pp
join public.profiles p on p.id=pp.profile_id and p.deleted_at is null
where d.party_id=pp.id
  and pp.party_type='profissional_externo';

update public.process_party_private_data d
set document_number=coalesce(nullif(btrim(coalesce(p.cpf_cnpj,'')),''),nullif(btrim(coalesce(p.cpf,'')),''),d.document_number),
    identity_document_number=coalesce(nullif(btrim(coalesce(p.rg,'')),''),d.identity_document_number),
    email=coalesce(nullif(btrim(coalesce(p.email,'')),''),d.email),
    phone=coalesce(nullif(btrim(coalesce(p.phone,'')),''),nullif(btrim(coalesce(p.telefone,'')),''),d.phone),
    updated_at=clock_timestamp()
from public.process_parties pp
join public.profiles p on p.id=pp.profile_id and p.deleted_at is null
where d.party_id=pp.id
  and pp.party_type='proprietario';

update public.processes pr
set updated_at=clock_timestamp()
where exists (
  select 1
  from public.process_parties pp
  join public.profiles p on p.id=pp.profile_id and p.deleted_at is null
  where pp.process_id=pr.id
);

notify pgrst, 'reload schema';
