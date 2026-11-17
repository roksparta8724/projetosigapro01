-- Corrective, additive QA migration for local SEI-style closure.
-- Does not change municipal status, processes, dispatches, or existing rows.
-- Limits alias handling to the authenticated author of a prior dispatch.
CREATE OR REPLACE FUNCTION public.set_my_process_unit_completion_v1(
  _process_id uuid, _completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _area text;
  _stage_area text;
  _key text;
  _unit_name text;
  _old public.process_unit_completions%rowtype;
  _saved public.process_unit_completions%rowtype;
BEGIN
  IF _completed IS NULL THEN RAISE EXCEPTION 'Ação de unidade inválida.'; END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id=_profile_id
    AND deleted_at IS NULL AND account_status='active';
  IF _profile.id IS NULL OR
     lower(coalesce(public.current_role_code(),_profile.role,'')) IN
       ('prefeitura_admin','admin_municipality','profissional_externo','professional_external','property_owner','proprietario_consulta')
     OR NOT public.is_internal_municipality_role() THEN
    RAISE EXCEPTION 'Sem permissão para concluir processos na unidade.';
  END IF;
  _area := nullif(public.profile_operational_area(_profile_id),'');
  IF _area IS NULL THEN
    RAISE EXCEPTION 'Seu perfil precisa estar associado a uma unidade operacional.';
  END IF;
  _key := coalesce('departamento:' || _profile.department_id::text,'legado:' || _area);
  SELECT coalesce(d.name,initcap(_area)) INTO _unit_name
    FROM (SELECT 1) dummy LEFT JOIN public.departments d ON d.id=_profile.department_id;
  SELECT * INTO _process FROM public.processes WHERE id=_process_id FOR UPDATE;
  IF _process.id IS NULL OR _process.tenant_id IS NULL
     OR coalesce(_process.municipality_id,_process.tenant_id)
         IS DISTINCT FROM _profile.municipality_id
     OR NOT public.profile_has_process_access(_process_id,_profile_id) THEN
    RAISE EXCEPTION 'Processo fora do município ou sem acesso.';
  END IF;
  SELECT * INTO _old FROM public.process_unit_completions
    WHERE process_id=_process_id AND unit_key=_key FOR UPDATE;
  IF _completed THEN
    _stage_area := nullif(public.operational_area_from_label(_process.current_department),'');
    -- After an official dispatch, the originating unit must still be able
    -- to close its OWN attendance. This is not a municipal conclusion.
    -- Scope to the exact department for configured accounts; use the
    -- operational area only for legacy staff without a department_id.
    IF _stage_area IS NOT NULL AND _stage_area IS DISTINCT FROM _area
       AND NOT EXISTS (
         SELECT 1
         FROM public.interdepartmental_dispatches d
         WHERE d.process_id=_process_id
           AND d.tenant_id=_process.tenant_id
           AND (
             (_profile.department_id IS NOT NULL
               AND lower(btrim(d.from_department))=lower(btrim(_unit_name)))
             -- The sender is still authorized to close their own unit's
             -- attendance when an organogram label differs from the
             -- administrative name, but NEVER another author's dispatch.
             OR (_profile.department_id IS NOT NULL
               AND d.created_by_profile_id=_profile_id
               AND public.operational_area_from_label(d.from_department)=_area)
             OR (_profile.department_id IS NULL
               AND public.operational_area_from_label(d.from_department)=_area)
           )
       ) THEN
      RAISE EXCEPTION 'Esta unidade não é a responsável e não encaminhou este processo.';
    END IF;
  ELSIF _old.process_id IS NULL OR _old.status <> 'concluido' THEN
    RAISE EXCEPTION 'Este processo não está concluído na sua unidade.';
  END IF;
  IF _old.process_id IS NOT NULL
    AND _old.status = (CASE WHEN _completed THEN 'concluido' ELSE 'reaberto' END) THEN
    RETURN jsonb_build_object('process_id',_old.process_id,'status',_old.status,
      'unit_name',_old.unit_name,'updated_at',_old.updated_at,'unchanged',true);
  END IF;
  INSERT INTO public.process_unit_completions(
    process_id,tenant_id,municipality_id,unit_key,unit_name,status,
    completed_at,reopened_at,updated_at,updated_by_profile_id
  ) VALUES (
    _process_id,_process.tenant_id,_process.municipality_id,_key,_unit_name,
    CASE WHEN _completed THEN 'concluido' ELSE 'reaberto' END,
    CASE WHEN _completed THEN clock_timestamp() ELSE NULL END,
    CASE WHEN NOT _completed THEN clock_timestamp() ELSE NULL END,
    clock_timestamp(),_profile_id
  )
  ON CONFLICT (process_id,unit_key) DO UPDATE SET
    status=excluded.status,unit_name=excluded.unit_name,
    completed_at=CASE WHEN _completed THEN clock_timestamp()
      ELSE public.process_unit_completions.completed_at END,
    reopened_at=CASE WHEN NOT _completed THEN clock_timestamp()
      ELSE public.process_unit_completions.reopened_at END,
    updated_at=clock_timestamp(),updated_by_profile_id=_profile_id
  RETURNING * INTO _saved;
  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  ) VALUES (
    _process.tenant_id,_process_id,_legacy_user_id,'unidade',
    CASE WHEN _completed THEN 'Concluído nesta unidade' ELSE 'Reaberto nesta unidade' END,
    CASE WHEN _completed THEN 'Atendimento concluído na unidade '
      ELSE 'Atendimento reaberto na unidade ' END || _unit_name ||
      '. O processo municipal permanece com seu status e trâmite oficiais inalterados.',
    false,clock_timestamp(),_process.municipality_id,_profile_id
  );
  RETURN jsonb_build_object(
    'process_id',_saved.process_id,'status',_saved.status,
    'unit_name',_saved.unit_name,'updated_at',_saved.updated_at,
    'municipal_status_unchanged',true
  );
END;
$$;

NOTIFY pgrst,'reload schema';
