-- SIGAPRO: complete a paid, already officialized process returned by automatic
-- documentary triage. No payment update, no fabricated attachment or legal approval.
-- Supports real processes whose preprotocol omitted the property and party rows.
-- SECURITY DEFINER uses authenticated profile + tenant + owner + workflow guards.
CREATE OR REPLACE FUNCTION public.correct_paid_triage_identity_v1(
  _process_id uuid, _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
  _actor uuid := public.current_profile_id();
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _property public.properties%rowtype;
  _address text;
  _owner text;
  _professional text;
  _area_text text;
  _area numeric;
  _party public.process_parties%rowtype;
  _triage jsonb;
BEGIN
  IF _process_id IS NULL OR jsonb_typeof(_payload) IS DISTINCT FROM 'object'
     OR pg_catalog.length(_payload::text)>8000
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(_payload) AS k(name)
       WHERE name NOT IN ('address','area','ownerName','technicalLead')
     )
  THEN RAISE EXCEPTION 'INVALID_TRIAGE_CORRECTION' USING ERRCODE='22023'; END IF;

  SELECT * INTO _profile FROM public.profiles
    WHERE id=_actor AND account_status='active' AND deleted_at IS NULL;
  IF NOT FOUND OR public.current_role_code() IS DISTINCT FROM 'profissional_externo'
  THEN RAISE EXCEPTION 'TRIAGE_CORRECTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;

  SELECT * INTO _process FROM public.processes
    WHERE id=_process_id FOR UPDATE;
  IF NOT FOUND OR _process.officialized_at IS NULL
    OR _process.status IS DISTINCT FROM 'pendencia_documental'::public.process_status
    OR _process.tenant_id IS NULL OR _process.municipality_id IS NULL
    OR _process.tenant_id IS DISTINCT FROM _process.municipality_id
    OR _profile.municipality_id IS DISTINCT FROM _process.municipality_id
    OR NOT public.has_process_access(_process_id)
    OR NOT (
      _process.created_by_profile_id = _actor OR EXISTS (
        SELECT 1 FROM public.process_parties pp
          WHERE pp.process_id=_process_id AND pp.profile_id=_actor
            AND pp.party_type='profissional_externo'
      )
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.payment_guides g
      WHERE g.process_id=_process_id AND g.guide_kind='protocolo'
        AND g.paid IS TRUE AND g.status='compensada'
    )
  THEN RAISE EXCEPTION 'TRIAGE_CORRECTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;

  _address := btrim(coalesce(_payload->>'address',''));
  _owner := btrim(coalesce(_payload->>'ownerName',''));
  _professional := btrim(coalesce(_payload->>'technicalLead',''));
  _area_text := btrim(coalesce(_payload->>'area',''));

  IF length(_address) NOT BETWEEN 10 AND 240 OR
     length(_owner) NOT BETWEEN 3 AND 160 OR
     length(_professional) NOT BETWEEN 3 AND 160 OR
     _area_text !~ '^[0-9]{1,8}([.,][0-9]{1,2})?$' OR
     lower(_address) IN ('não informado','nao informado','endereço não informado') OR
     lower(_owner) IN ('não informado','nao informado') OR
     lower(_professional) IN ('não informado','nao informado')
  THEN RAISE EXCEPTION 'INVALID_TRIAGE_CORRECTION_VALUES' USING ERRCODE='22023'; END IF;
  _area := replace(_area_text,',','.')::numeric;
  IF _area <= 0 OR _area >= 100000000 THEN
    RAISE EXCEPTION 'INVALID_TRIAGE_CORRECTION_AREA' USING ERRCODE='22023';
  END IF;

  -- Never revise an existing financial basis or established identity silently.
  -- This endpoint completes only absent or explicitly unspecified information.
  IF _process.property_id IS NULL THEN
    INSERT INTO public.properties(tenant_id,municipality_id,iptu_code,address,area_m2)
    VALUES(_process.tenant_id,_process.municipality_id,'',_address,_area)
    RETURNING * INTO _property;
    UPDATE public.processes SET property_id=_property.id,updated_at=clock_timestamp()
     WHERE id=_process.id;
  ELSE
    SELECT * INTO _property FROM public.properties
      WHERE id=_process.property_id AND tenant_id=_process.tenant_id
        AND municipality_id=_process.municipality_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROPERTY_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
    IF nullif(btrim(coalesce(_property.address,'')),'') IS NOT NULL AND
       lower(btrim(_property.address)) NOT IN ('não informado','nao informado','endereço não informado') AND
       _property.address IS DISTINCT FROM _address
    THEN RAISE EXCEPTION 'PAID_ADDRESS_REQUIRES_FORMAL_REVISION' USING ERRCODE='42501'; END IF;
    IF coalesce(_property.area_m2,0)>0 AND _property.area_m2 IS DISTINCT FROM _area
    THEN RAISE EXCEPTION 'PAID_AREA_REQUIRES_FINANCIAL_REVIEW' USING ERRCODE='42501'; END IF;
    UPDATE public.properties
      SET address=_address,area_m2=_area WHERE id=_property.id;
  END IF;

  SELECT * INTO _party FROM public.process_parties
    WHERE process_id=_process.id AND party_type='proprietario'
    ORDER BY is_primary DESC,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.process_parties(process_id,tenant_id,municipality_id,
      party_type,display_name,is_primary)
    VALUES(_process.id,_process.tenant_id,_process.municipality_id,
      'proprietario',_owner,true);
  ELSIF lower(btrim(_party.display_name)) IN ('não informado','nao informado','') THEN
    UPDATE public.process_parties SET display_name=_owner WHERE id=_party.id;
  ELSIF _party.display_name IS DISTINCT FROM _owner THEN
    RAISE EXCEPTION 'OWNER_IDENTITY_REQUIRES_FORMAL_REVISION' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _party FROM public.process_parties
    WHERE process_id=_process.id AND party_type='profissional_externo'
    ORDER BY is_primary DESC,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.process_parties(process_id,tenant_id,municipality_id,
      party_type,display_name,is_primary)
    VALUES(_process.id,_process.tenant_id,_process.municipality_id,
      'profissional_externo',_professional,true);
  ELSIF lower(btrim(_party.display_name)) IN ('não informado','nao informado','') THEN
    UPDATE public.process_parties SET display_name=_professional WHERE id=_party.id;
  ELSIF _party.display_name IS DISTINCT FROM _professional THEN
    RAISE EXCEPTION 'TECHNICAL_IDENTITY_REQUIRES_FORMAL_REVISION' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.process_audit_entries (
    tenant_id,municipality_id,process_id,actor_profile_id,actor_user_id,
    category,title,detail,visible_to_external,created_at
  ) VALUES (
    _process.tenant_id,_process.municipality_id,_process.id,
    _actor,public.current_legacy_user_id(),
    'cadastro','Complementação cadastral pós-pagamento',
    'Profissional responsável completou endereço, área e identificação das partes; '||
    'número do protocolo, valores e guia original preservados.',
    true,clock_timestamp()
  );

  -- Same transaction: changed metadata are immediately evaluated by the
  -- existing automatic documentary triage, which still requires real R2 PDFs.
  _triage := public.evaluate_automatic_protocol_triage_v1(_process.id);
  RETURN jsonb_build_object('ok',true,'processId',_process.id,
    'triage',_triage,'paymentModified',false,'guideReissued',false);
END
$function$;

REVOKE ALL ON FUNCTION public.correct_paid_triage_identity_v1(uuid,jsonb)
  FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.correct_paid_triage_identity_v1(uuid,jsonb)
  TO authenticated;
