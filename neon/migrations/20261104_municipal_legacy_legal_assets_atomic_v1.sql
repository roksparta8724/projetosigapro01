-- The municipal administrator maintains the four legacy PDF references.
-- Incrementally patch ONLY legal keys. No bank/payment/fee/branding changes.
-- Preserve an append-only record of old/new values when a link changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.municipal_legacy_legal_asset_events_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 slot text NOT NULL CHECK(slot IN ('plano_diretor','uso_solo','zoneamento','leis_complementares')),
 old_file_name text, old_file_ref text,
 new_file_name text NOT NULL, new_file_ref text NOT NULL,
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(municipality_id,slot,request_id)
);
ALTER TABLE public.municipal_legacy_legal_asset_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_legacy_legal_asset_events_v1 FROM PUBLIC,authenticated;
CREATE INDEX IF NOT EXISTS municipal_legacy_legal_events_lookup_v1
 ON public.municipal_legacy_legal_asset_events_v1(municipality_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.save_municipal_legacy_legal_assets_v1(
 _municipality_id uuid,_changes jsonb,_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE
 _actor uuid:=public.current_profile_id();
 _old jsonb;
 _delta jsonb:='{}'::jsonb;
 _change jsonb;
 _slot text;
 _file text;
 _ref text;
 _path text;
 _name_key text;
 _ref_key text;
 _changed integer:=0;
 _idx integer;
 _seen text[]:='{}';
BEGIN
 IF _municipality_id IS NULL OR _request_id IS NULL OR _actor IS NULL OR
   public.current_role_code() IS DISTINCT FROM 'prefeitura_admin' OR
   NOT public.has_tenant_access(_municipality_id) OR
   NOT public.can_manage_urban_legislation_registry_v1(_municipality_id)
 THEN RAISE EXCEPTION 'Somente o Admin desta Prefeitura pode alterar a legislação.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR
   jsonb_array_length(_changes) NOT BETWEEN 1 AND 4
 THEN RAISE EXCEPTION 'Informe entre 1 e 4 documentos legais para salvar.'; END IF;
 IF EXISTS(SELECT 1 FROM public.municipal_legacy_legal_asset_events_v1
   WHERE municipality_id=_municipality_id AND request_id=_request_id)
 THEN RETURN jsonb_build_object('ok',true,'changed',0,'replayed',true); END IF;
 SELECT general_settings INTO _old FROM public.municipality_settings
   WHERE municipality_id=_municipality_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configuração da Prefeitura ainda não foi provisionada.'; END IF;
 _old:=coalesce(_old,'{}'::jsonb);
 FOR _idx IN 0..jsonb_array_length(_changes)-1 LOOP
  _change:=_changes->_idx;
  IF jsonb_typeof(_change) IS DISTINCT FROM 'object' OR
     jsonb_typeof(_change->'slot') IS DISTINCT FROM 'string' OR
     jsonb_typeof(_change->'fileName') IS DISTINCT FROM 'string' OR
     jsonb_typeof(_change->'fileRef') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'Campos de documento legal inválidos.'; END IF;
  _slot:=_change->>'slot';
  _file:=btrim(_change->>'fileName');
  _ref:=btrim(_change->>'fileRef');
  IF _slot=ANY(_seen) THEN RAISE EXCEPTION 'Documento legal repetido na mesma solicitação.'; END IF;
  _seen:=array_append(_seen,_slot);
  CASE _slot
    WHEN 'plano_diretor' THEN
      _path:='plano-diretor'; _name_key:='plano_diretor_arquivo_nome'; _ref_key:='plano_diretor_arquivo_url';
    WHEN 'uso_solo' THEN
      _path:='uso-solo'; _name_key:='uso_solo_arquivo_nome'; _ref_key:='uso_solo_arquivo_url';
    WHEN 'zoneamento' THEN
      _path:='zoneamento'; _name_key:='zoneamento_arquivo_nome'; _ref_key:='zoneamento_arquivo_url';
    WHEN 'leis_complementares' THEN
      _path:='leis-complementares'; _name_key:='leis_arquivo_nome'; _ref_key:='leis_arquivo_url';
    ELSE RAISE EXCEPTION 'Tipo de documento legal não permitido.';
  END CASE;
  IF (_file='' AND _ref<>'') OR (_file<>'' AND _ref='') OR
     length(_file)>255 OR length(_ref)>1200 OR
     (_file<>'' AND (lower(_file) NOT LIKE '%.pdf' OR length(_file)<5))
  THEN RAISE EXCEPTION 'Informe um PDF válido ou remova ambos os campos.'; END IF;
  IF _ref<>'' AND NOT (
    _ref LIKE ('r2:municipalities/'||_municipality_id::text||'/legislation-'||_path||'/%')
    AND _ref ~ ('^r2:municipalities/'||_municipality_id::text||'/legislation-'||_path||
      '/[A-Za-z0-9_-]{3,128}/[0-9a-f-]{36}-[A-Za-z0-9._-]+[.]pdf$')
  ) THEN RAISE EXCEPTION 'Arquivo legal fora do armazenamento desta Prefeitura.'; END IF;
  IF coalesce(_old->>_name_key,'') IS DISTINCT FROM _file OR
     coalesce(_old->>_ref_key,'') IS DISTINCT FROM _ref THEN
    INSERT INTO public.municipal_legacy_legal_asset_events_v1(
      municipality_id,slot,old_file_name,old_file_ref,new_file_name,new_file_ref,
      actor_profile_id,request_id
    ) VALUES(
      _municipality_id,_slot,_old->>_name_key,_old->>_ref_key,_file,_ref,_actor,_request_id
    );
    _changed:=_changed+1;
  END IF;
  _delta:=_delta||jsonb_build_object(_name_key,_file,_ref_key,_ref);
  CASE _slot
   WHEN 'plano_diretor' THEN
     _delta:=_delta||jsonb_build_object('plan_file_name',_file,'plan_file_url',_ref);
   WHEN 'zoneamento' THEN
     _delta:=_delta||jsonb_build_object('zoning_map_file_name',_file,'zoning_map_file_url',_ref);
   WHEN 'leis_complementares' THEN
     _delta:=_delta||jsonb_build_object('complementary_laws_file_name',_file,'complementary_laws_file_url',_ref);
   ELSE NULL;
  END CASE;
 END LOOP;
 IF _changed>0 THEN
  UPDATE public.municipality_settings SET
   general_settings=coalesce(general_settings,'{}'::jsonb)||_delta,
   updated_at=now()
  WHERE municipality_id=_municipality_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'changed',_changed);
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_municipal_legacy_legal_assets_v1(uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_municipal_legacy_legal_assets_v1(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
