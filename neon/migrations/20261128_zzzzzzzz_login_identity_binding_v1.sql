-- Bind the resolved business profile to the actual verified Neon JWT subject.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_current_profile_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'neon_auth'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _subject text := public.current_auth_subject();
  _auth_email text;
  _profile_municipality_id uuid;
  _profile_role text;
  _result jsonb;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.municipality_id,p.role
    INTO _profile_municipality_id,_profile_role
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  SELECT lower(u.email) INTO _auth_email
  FROM neon_auth."user" u
  WHERE u.id::text=_subject
  LIMIT 1;

  WITH ranked_membership AS (
    SELECT
      tm.tenant_id,
      tm.level_name,
      r.code::text AS role_code,
      CASE
        WHEN r.code IN ('master_admin','master_ops') THEN 100
        WHEN r.code='prefeitura_admin' THEN 90
        WHEN r.code='prefeitura_supervisor' THEN 80
        WHEN r.code IN ('analista','financeiro','setor_intersetorial','fiscal') THEN 50
        ELSE 10
      END AS role_rank
    FROM public.tenant_memberships tm
    JOIN public.roles r ON r.id=tm.role_id
    WHERE tm.is_active=true
      AND tm.deleted_at IS NULL
      AND (
        tm.profile_id=_profile_id
        OR (
          tm.profile_id IS NULL
          AND tm.user_id=(SELECT p.user_id FROM public.profiles p WHERE p.id=_profile_id)
        )
      )
      AND (
        _profile_role IN ('admin_master','master_admin','master_ops')
        OR tm.tenant_id=_profile_municipality_id
      )
    ORDER BY role_rank DESC,tm.updated_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'auth_subject',_subject,
    'profile_id',p.id,
    'legacy_user_id',p.user_id,
    'email',coalesce(_auth_email,p.email),
    'profile_email',p.email,
    'full_name',p.full_name,
    'role',coalesce((SELECT role_code FROM ranked_membership),public.current_role_code(),p.role),
    'profile_role',p.role,
    'municipality_id',CASE
      WHEN p.role IN ('admin_master','master_admin','master_ops') THEN NULL
      ELSE coalesce(p.municipality_id,(SELECT tenant_id FROM ranked_membership))
    END,
    'tenant_id',CASE
      WHEN p.role IN ('admin_master','master_admin','master_ops') THEN NULL
      ELSE (SELECT tenant_id FROM ranked_membership)
    END,
    'access_level',
      CASE
        WHEN coalesce((SELECT level_name FROM ranked_membership),'') ~ '(^|[^0-9])3([^0-9]|$)' THEN 3
        WHEN coalesce((SELECT level_name FROM ranked_membership),'') ~ '(^|[^0-9])2([^0-9]|$)' THEN 2
        WHEN coalesce((SELECT level_name FROM ranked_membership),'') ~ '(^|[^0-9])1([^0-9]|$)' THEN 1
        ELSE NULL
      END,
    'account_status',p.account_status,
    'professional_type',p.professional_type,
    'registration_number',p.registration_number,
    'company_name',p.company_name,
    'phone',p.phone,
    'deleted_at',p.deleted_at,
    'is_master',public.is_master()
  )
  INTO _result
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  RETURN _result;
END;
$function$;
COMMIT;
