-- SIGAPRO: autoria do Alvará vinculada ao Analista responsável.
-- O Analista prepara e solicita a assinatura; a Diretoria apenas supervisiona
-- e assina eletronicamente quando houver solicitação formal.
-- Após a assinatura da Diretoria, o documento se torna imutável.

create or replace function public.guard_construction_permit_analysis_owner()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _role text;
  _actor_name text;
  _assigned_profile uuid;
  _assigned_name text;
  _director_signature_completed boolean := false;
  _normalize_actor text;
  _normalize_assigned text;
begin
  -- Rotinas internas sem sessão e operadores master permanecem autorizados.
  if _actor is null or public.is_master() then
    return new;
  end if;

  select lower(coalesce(p.role,'')),
         coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''))
    into _role,_actor_name
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _role is null then
    raise exception 'Perfil municipal inválido para operar o Alvará.';
  end if;

  -- A única alteração permitida pela Diretoria nesta tabela é a transição
  -- automática para "signed", feita depois que a assinatura eletrônica oficial
  -- já foi gravada em signatures/signature_blocks.
  if tg_op='UPDATE'
     and old.status='awaiting_director'
     and new.status='signed'
     and new.signature_mode='electronic'
     and new.process_id=old.process_id
     and new.permit_number is not distinct from old.permit_number
     and new.form_data is not distinct from old.form_data then

    select exists (
      select 1
      from public.signature_blocks b
      join public.signatures s on s.signature_block_id=b.id
      where b.process_id=new.process_id
        and b.artifact_type='construction_permit'
        and b.artifact_key='construction-permit'
        and s.signer_slot='diretoria'
        and s.status='concluido'
    )
    into _director_signature_completed;

    if _director_signature_completed then
      return new;
    end if;
  end if;

  if tg_op='UPDATE' and old.status='signed' then
    raise exception 'O Alvará já foi assinado eletronicamente pela Diretoria e é imutável. Gere nova versão somente por fluxo formal de revisão.';
  end if;

  select p.analysis_assigned_to_profile_id,
         p.analysis_assigned_to
    into _assigned_profile,_assigned_name
  from public.processes p
  where p.id=new.process_id;

  if _role not in ('analista','analyst') then
    raise exception 'Somente o Analista Técnico responsável pode preparar o Alvará ou solicitar a assinatura da Diretoria.';
  end if;

  if _assigned_profile is not null then
    if _assigned_profile is distinct from _actor then
      raise exception 'Este Alvará pertence ao Analista Técnico responsável pelo processo.';
    end if;
    return new;
  end if;

  _normalize_actor := regexp_replace(
    translate(lower(coalesce(_actor_name,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'
  );
  _normalize_assigned := regexp_replace(
    translate(lower(coalesce(_assigned_name,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'
  );

  if btrim(_normalize_assigned)='' then
    raise exception 'O processo precisa ser atribuído a um Analista antes da preparação do Alvará.';
  end if;

  if btrim(_normalize_actor)<>btrim(_normalize_assigned) then
    raise exception 'Este Alvará pertence ao Analista Técnico responsável pelo processo.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_construction_permit_analysis_owner
  on public.process_construction_permits;

create trigger trg_guard_construction_permit_analysis_owner
before insert or update on public.process_construction_permits
for each row
execute function public.guard_construction_permit_analysis_owner();
