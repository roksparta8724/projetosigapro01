-- Resolve the CURRENT authenticated lotação, never the generic operational role.
BEGIN;
CREATE OR REPLACE FUNCTION public.municipal_ti_login_context_v1(m uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%rowtype; is_ti boolean; allowed boolean;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=public.current_profile_id() AND municipality_id=m AND deleted_at IS NULL AND account_status='active';
 IF p.id IS NULL THEN RAISE EXCEPTION 'Vínculo municipal não confirmado.' USING ERRCODE='42501'; END IF;
 is_ti:=coalesce(public.is_municipal_ti_department_v1(m,p.department_id),false);
 allowed:=NOT is_ti OR p.role='prefeitura_admin' OR public.municipal_ti_support_v1(m,p.id);
 RETURN jsonb_build_object('isTi',is_ti,'allowed',allowed);
END $$;
REVOKE ALL ON FUNCTION public.municipal_ti_login_context_v1(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.municipal_ti_login_context_v1(uuid) TO authenticated;
COMMIT;
