-- SIGAPRO 2026-10-27: signed construction permits cannot be rewritten by any role.
-- Tested on isolated QA (signed update denied; assigned analyst draft accepted,
-- synthetic writes rolled back) before applying to official Neon.
-- The function below is the reviewed production/QA guard and is idempotent.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.guard_construction_permit_analysis_owner()') IS NULL THEN
   RAISE EXCEPTION 'Construction permit signing integrity guard not installed';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM pg_trigger t
   WHERE t.tgfoid='public.guard_construction_permit_analysis_owner()'::regprocedure::oid
     AND NOT t.tgisinternal
 ) THEN RAISE EXCEPTION 'Construction permit guard trigger is not connected'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.guard_construction_permit_analysis_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
  -- A signed construction permit is immutable for every role, including master.
  -- Never let administrative bypass disable the already-issued legal artifact guard.
  if tg_op='UPDATE' and old.status='signed' then
    raise exception 'O Alvará já foi assinado eletronicamente pela Diretoria e é imutável. Gere nova versão somente por fluxo formal de revisão.';
  end if;
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
REVOKE EXECUTE ON FUNCTION public.guard_construction_permit_analysis_owner()
  FROM PUBLIC,anonymous,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
