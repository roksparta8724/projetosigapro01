-- SIGAPRO: authoritative, tenant-scoped municipal user registry.
-- Read-only; no account, payment, protocol, or membership is changed.
CREATE OR REPLACE FUNCTION public.list_municipal_user_registry_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $registry$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _municipality_id uuid;
  _users jsonb := '[]'::jsonb;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object('verified', false, 'municipalityId', NULL, 'users', '[]'::jsonb);
  END IF;

  SELECT p.municipality_id INTO _municipality_id
  FROM public.profiles p
  WHERE p.id = _profile_id AND p.account_status = 'active' AND p.deleted_at IS NULL;

  -- Master has a separate, municipality-selected administration experience.
  -- External professionals and staff cannot enumerate colleagues.
  IF _municipality_id IS NULL
     OR NOT public.can_manage_municipality(_municipality_id) THEN
    RETURN jsonb_build_object('verified', false, 'municipalityId', NULL, 'users', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', p.id,
      'municipalityId', _municipality_id,
      'name', COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.email), ''), 'Usuário'),
      'email', COALESCE(p.email, ''),
      'role', COALESCE(member.role_code, p.role, 'proprietario_consulta'),
      'accessLevel', CASE
        WHEN COALESCE(member.role_code, p.role) = 'prefeitura_admin' THEN 3
        WHEN member.level_name IN ('1', '2', '3') THEN member.level_name::integer
        WHEN COALESCE(member.role_code, p.role) = 'prefeitura_supervisor' THEN 2
        ELSE 1
      END,
      'title', COALESCE(NULLIF(member.position_title, ''), member.role_label, ''),
      'profileLabel', COALESCE(member.profile_label, ''),
      'department', COALESCE(NULLIF(member.department, ''), d.name, ''),
      'accountStatus', CASE
        WHEN p.account_status IN ('blocked', 'inactive') THEN p.account_status
        WHEN member.id IS NOT NULL AND member.is_active = false THEN 'inactive'
        ELSE 'active'
      END,
      'createdAt', p.created_at,
      'lastAccessAt', p.last_access_at,
      'blockedAt', p.blocked_at,
      'blockReason', p.block_reason
    ) ORDER BY lower(COALESCE(p.full_name, p.email, '')), p.id),
    '[]'::jsonb
  ) INTO _users
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT tm.id, tm.department, tm.position_title, tm.profile_label,
           tm.level_name, tm.is_active, r.code::text AS role_code,
           r.label AS role_label
    FROM public.tenant_memberships tm
    JOIN public.roles r ON r.id = tm.role_id
    WHERE tm.profile_id = p.id
      AND tm.tenant_id = _municipality_id
      AND tm.deleted_at IS NULL
    ORDER BY tm.is_active DESC, tm.updated_at DESC NULLS LAST, tm.id
    LIMIT 1
  ) member ON TRUE
  LEFT JOIN public.departments d
    ON d.id = p.department_id AND d.municipality_id = _municipality_id
  WHERE p.municipality_id = _municipality_id
    AND p.deleted_at IS NULL
    AND COALESCE(member.role_code, p.role, '') NOT IN ('master_admin', 'master_ops', 'admin_master');

  RETURN jsonb_build_object(
    'verified', true,
    'municipalityId', _municipality_id,
    'users', _users
  );
END;
$registry$;

REVOKE ALL ON FUNCTION public.list_municipal_user_registry_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_municipal_user_registry_v1() TO authenticated;
NOTIFY pgrst, 'reload schema';
