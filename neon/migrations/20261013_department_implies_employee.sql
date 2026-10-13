-- Department assignment is the canonical signal that the account is municipal staff.
-- Profession/function stays separate from operational access role.

begin;

CREATE OR REPLACE FUNCTION public.assign_profile_department_v1(_municipality_id uuid, _profile_id uuid, _department_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _department_name text;
  _normalized_department text;
  _profile public.profiles%rowtype;
  _resolved_role text;
  _resolved_role_id uuid;
  _existing_target_membership uuid;
BEGIN
  IF NOT public.is_master() AND NOT public.can_manage_municipality(_municipality_id) THEN
    RAISE EXCEPTION 'Sem permissão para administrar a equipe desta Prefeitura.';
  END IF;

  IF _department_id IS NOT NULL THEN
    SELECT name INTO _department_name
    FROM public.departments
    WHERE id=_department_id
      AND municipality_id=_municipality_id
      AND is_active;

    IF _department_name IS NULL THEN
      RAISE EXCEPTION 'Departamento inválido ou inativo.';
    END IF;
  END IF;

  SELECT * INTO _profile
  FROM public.profiles
  WHERE id=_profile_id
    AND municipality_id=_municipality_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF _profile.id IS NULL THEN
    RAISE EXCEPTION 'Usuário não pertence a esta Prefeitura.';
  END IF;

  _resolved_role := _profile.role;

  IF _department_id IS NOT NULL
     AND coalesce(_profile.role,'') NOT IN ('admin_master','master_admin','master_ops','prefeitura_admin','prefeitura_supervisor') THEN
    _normalized_department := lower(
      translate(
        trim(_department_name),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      )
    );

    IF _normalized_department ~ '(urbanismo|obras|engenharia|planejamento|licenciamento|aprovacao)' THEN
      _resolved_role := 'analista';
    ELSIF _normalized_department ~ '(finance|financa|fazenda|tesour|arrecad|tribut)' THEN
      _resolved_role := 'financeiro';
    ELSIF _normalized_department ~ '(fiscaliz|postura)' THEN
      _resolved_role := 'fiscal';
    ELSIF _normalized_department ~ '(administracao|administrativo|protocolo|triagem|recepcao|expediente|atendimento)' THEN
      _resolved_role := 'setor_intersetorial';
    ELSE
      _resolved_role := 'setor_intersetorial';
    END IF;
  END IF;

  IF _department_id IS NULL THEN
    UPDATE public.profiles
       SET department_id=NULL,
           updated_at=now()
     WHERE id=_profile_id
     RETURNING * INTO _profile;

    UPDATE public.tenant_memberships
       SET department=NULL,
           updated_at=now()
     WHERE tenant_id=_municipality_id
       AND profile_id=_profile_id
       AND is_active=true
       AND deleted_at IS NULL;

    RETURN jsonb_build_object(
      'profile_id',_profile.id,
      'municipality_id',_profile.municipality_id,
      'department_id',NULL,
      'department_name',NULL,
      'role',_profile.role,
      'user_type',CASE
        WHEN _profile.role IN ('profissional_externo','property_owner','proprietario_consulta') THEN 'Externo'
        ELSE 'Interno'
      END
    );
  END IF;

  SELECT id INTO _resolved_role_id
  FROM public.roles
  WHERE code::text=_resolved_role
  LIMIT 1;

  IF _resolved_role_id IS NULL THEN
    RAISE EXCEPTION 'Perfil interno não encontrado para o departamento.';
  END IF;

  SELECT tm.id INTO _existing_target_membership
  FROM public.tenant_memberships tm
  WHERE tm.tenant_id=_municipality_id
    AND tm.profile_id=_profile_id
    AND tm.role_id=_resolved_role_id
  ORDER BY tm.updated_at DESC NULLS LAST
  LIMIT 1;

  IF _existing_target_membership IS NOT NULL THEN
    UPDATE public.tenant_memberships
       SET is_active=false,
           deleted_at=coalesce(deleted_at,now()),
           updated_at=now()
     WHERE tenant_id=_municipality_id
       AND profile_id=_profile_id
       AND id<>_existing_target_membership
       AND is_active=true
       AND deleted_at IS NULL;

    UPDATE public.tenant_memberships
       SET department=_department_name,
           is_active=true,
           deleted_at=NULL,
           updated_at=now()
     WHERE id=_existing_target_membership;
  ELSE
    UPDATE public.tenant_memberships
       SET role_id=_resolved_role_id,
           department=_department_name,
           is_active=true,
           deleted_at=NULL,
           updated_at=now()
     WHERE tenant_id=_municipality_id
       AND profile_id=_profile_id
       AND is_active=true
       AND deleted_at IS NULL;
  END IF;

  UPDATE public.profiles
     SET department_id=_department_id,
         role=_resolved_role,
         updated_at=now()
   WHERE id=_profile_id
   RETURNING * INTO _profile;

  RETURN jsonb_build_object(
    'profile_id',_profile.id,
    'municipality_id',_profile.municipality_id,
    'department_id',_profile.department_id,
    'department_name',_department_name,
    'role',_resolved_role,
    'user_type','Interno'
  );
END;
$function$
;

grant execute on function public.assign_profile_department_v1(uuid,uuid,uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
