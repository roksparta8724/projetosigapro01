-- SIGAPRO Municipal: o identificador legado opcional nunca substitui
-- a identidade proveniente do Neon Auth. A função permanece disponível
-- aos chamadores autenticados para manter a compatibilidade do RPC.
-- Sem essa trava, qualquer usuário autenticado poderia informar o ID de
-- um criador/parte legada de outro município.
--
-- Segurança: _user_id só pode estar ausente ou ser igual ao ID legado
-- do perfil autenticado, obtido internamente de current_profile_id().
CREATE OR REPLACE FUNCTION public.has_process_access(_process_id uuid, _user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
  with cp as (
    select
      p.id as profile_id,
      p.user_id as legacy_user_id,
      p.municipality_id,
      coalesce(public.current_role_code(),p.role,'') as role_code
    from public.profiles p
    where p.id=public.current_profile_id()
      and p.deleted_at is null
      and p.account_status='active'
    limit 1
  ),
  effective as (
    select
      cp.*,
      cp.legacy_user_id as effective_legacy_user_id
    from cp
    -- The supplied legacy ID may never impersonate another auth subject.
    where _user_id is null or _user_id=cp.legacy_user_id
  )
  select exists (
    select 1
    from public.processes pr
    cross join effective e
    where pr.id=_process_id
      and (
        (
          pr.officialized_at is null
          and (
            pr.created_by_profile_id=e.profile_id
            or (e.effective_legacy_user_id is not null and pr.created_by=e.effective_legacy_user_id)
            or exists (
              select 1 from public.process_parties pp
              where pp.process_id=pr.id
                and (
                  pp.profile_id=e.profile_id
                  or (e.effective_legacy_user_id is not null and pp.user_id=e.effective_legacy_user_id)
                )
            )
          )
        )
        or
        (
          pr.officialized_at is not null
          and (
            public.is_master()
            or (
              pr.municipality_id is not null
              and e.municipality_id=pr.municipality_id
              and e.role_code in (
                'prefeitura_admin','prefeitura_supervisor','analista','financeiro',
                'setor_intersetorial','fiscal','admin_municipality','analyst',
                'financial','counter_service','topography','expedient'
              )
            )
            or pr.created_by_profile_id=e.profile_id
            or (e.effective_legacy_user_id is not null and pr.created_by=e.effective_legacy_user_id)
            or exists (
              select 1 from public.process_parties pp
              where pp.process_id=pr.id
                and (
                  pp.profile_id=e.profile_id
                  or (e.effective_legacy_user_id is not null and pp.user_id=e.effective_legacy_user_id)
                )
            )
            or exists (
              select 1 from public.project_owner_links pol
              where pol.project_id=pr.id
                and e.profile_id in (pol.owner_profile_id,pol.professional_profile_id)
            )
          )
        )
      )
  )
$function$;
REVOKE ALL ON FUNCTION public.has_process_access(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_process_access(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
