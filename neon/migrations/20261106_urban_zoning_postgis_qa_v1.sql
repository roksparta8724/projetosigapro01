-- SIGAPRO | GIS de zoneamento | QA 2026-11-06
-- Não transportar para a Neon production antes de aceite específico.
-- GeoJSON sempre EPSG:4326, validação oficial humana e isolamento municipal.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.urban_zoning_map_versions_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
  version_label text NOT NULL CHECK(length(version_label) BETWEEN 3 AND 100),
  legal_reference text NOT NULL CHECK(length(legal_reference) BETWEEN 8 AND 400),
  official_source_url text NOT NULL CHECK(official_source_url ~ '^https://[^ ]+$'),
  official_source_sha256 text NOT NULL CHECK(official_source_sha256 ~ '^[0-9a-f]{64}$'),
  effective_from date NOT NULL,
  effective_until date,
  status text NOT NULL DEFAULT 'draft_unverified'
    CHECK(status IN ('draft_unverified','verified','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  verified_at timestamptz,
  verified_by_profile_id uuid REFERENCES public.profiles(id),
  verification_note text,
  CONSTRAINT urban_zoning_map_date_order CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CONSTRAINT urban_zoning_verified_metadata CHECK(status <> 'verified' OR
    (verified_at IS NOT NULL AND verified_by_profile_id IS NOT NULL AND length(verification_note) >= 40)),
  UNIQUE(municipality_id, version_label)
);

CREATE TABLE IF NOT EXISTS public.urban_zoning_zone_geometries_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.urban_zoning_map_versions_v1(id),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
  zone_code text NOT NULL CHECK(zone_code ~ '^[A-Z0-9][A-Z0-9_(). /-]{0,79}$'),
  feature_key text NOT NULL CHECK(length(feature_key) BETWEEN 1 AND 120),
  footprint public.geometry(MultiPolygon,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT urban_zoning_zone_geometry_is_valid CHECK (
    ST_IsValid(footprint) AND NOT ST_IsEmpty(footprint) AND ST_NPoints(footprint) BETWEEN 4 AND 20000
  ),
  UNIQUE(map_id,feature_key)
);
CREATE INDEX IF NOT EXISTS urban_zoning_zone_gist_v1
  ON public.urban_zoning_zone_geometries_v1 USING gist(footprint);
CREATE INDEX IF NOT EXISTS urban_zoning_zone_map_idx_v1
  ON public.urban_zoning_zone_geometries_v1(map_id);

CREATE TABLE IF NOT EXISTS public.urban_zoning_parcel_geometries_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  footprint public.geometry(MultiPolygon,4326) NOT NULL,
  cadastral_source text NOT NULL CHECK(length(cadastral_source) BETWEEN 12 AND 400),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft_unverified'
    CHECK(status IN ('draft_unverified','verified','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  verified_at timestamptz,
  verified_by_profile_id uuid REFERENCES public.profiles(id),
  verification_note text,
  CONSTRAINT urban_zoning_parcel_geometry_is_valid CHECK (
    ST_IsValid(footprint) AND NOT ST_IsEmpty(footprint) AND ST_NPoints(footprint) BETWEEN 4 AND 20000
  ),
  CONSTRAINT urban_zoning_parcel_verified_metadata CHECK(status <> 'verified' OR
    (verified_at IS NOT NULL AND verified_by_profile_id IS NOT NULL AND length(verification_note) >= 40)),
  UNIQUE(municipality_id,property_id)
);
CREATE INDEX IF NOT EXISTS urban_zoning_parcel_gist_v1
  ON public.urban_zoning_parcel_geometries_v1 USING gist(footprint);

-- Nenhuma tabela espacial tem API de leitura/gravação direta: acesso somente por RPC.
ALTER TABLE public.urban_zoning_map_versions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urban_zoning_zone_geometries_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urban_zoning_parcel_geometries_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urban_zoning_map_versions_v1 FROM PUBLIC,authenticated;
REVOKE ALL ON public.urban_zoning_zone_geometries_v1 FROM PUBLIC,authenticated;
REVOKE ALL ON public.urban_zoning_parcel_geometries_v1 FROM PUBLIC,authenticated;

-- Entradas GeoJSON candidatas só poderão ser criadas por admin legal de sua própria Prefeitura.
CREATE OR REPLACE FUNCTION public.urban_zoning_create_map_draft_v1(
  _municipality_id uuid,_version_label text,_legal_reference text,
  _source_url text,_source_sha256 text,_effective_from date,_effective_until date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.can_manage_urban_legislation_registry_v1(_municipality_id)
    OR public.current_profile_id() IS NULL THEN
    RAISE EXCEPTION 'Cadastro cartografico nao autorizado';
  END IF;
  IF length(btrim(coalesce(_version_label,''))) NOT BETWEEN 3 AND 100
    OR length(btrim(coalesce(_legal_reference,''))) NOT BETWEEN 8 AND 400
    OR coalesce(_source_url,'') !~ '^https://[^ ]+$'
    OR coalesce(_source_sha256,'') !~ '^[0-9a-f]{64}$'
    OR _effective_from IS NULL
    OR (_effective_until IS NOT NULL AND _effective_until < _effective_from) THEN
    RAISE EXCEPTION 'Fonte legal, SHA256, versao e vigencia do mapa sao obrigatorios';
  END IF;
  INSERT INTO public.urban_zoning_map_versions_v1(
    municipality_id,version_label,legal_reference,official_source_url,
    official_source_sha256,effective_from,effective_until,created_by_profile_id
  ) VALUES(_municipality_id,btrim(_version_label),btrim(_legal_reference),_source_url,
    _source_sha256,_effective_from,_effective_until,public.current_profile_id())
  RETURNING id INTO _id;
  RETURN _id;
END;$$;

CREATE OR REPLACE FUNCTION public.urban_zoning_append_features_v1(
  _map_id uuid,_features jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _map public.urban_zoning_map_versions_v1%rowtype;
  _feature jsonb;_geometry public.geometry;_shape public.geometry;
  _zone text;_key text;_count int :=0;
BEGIN
  SELECT * INTO _map FROM public.urban_zoning_map_versions_v1 WHERE id=_map_id FOR UPDATE;
  IF _map.id IS NULL OR _map.status <> 'draft_unverified'
    OR NOT public.can_manage_urban_legislation_registry_v1(_map.municipality_id) THEN
    RAISE EXCEPTION 'Mapa nao editavel ou acesso negado';
  END IF;
  IF jsonb_typeof(_features) <> 'array'
    OR jsonb_array_length(_features) NOT BETWEEN 1 AND 100
    OR octet_length(_features::text) > 750000 THEN
    RAISE EXCEPTION 'Lote de geometrias invalido (maximo 100 e 750 KB)';
  END IF;
  FOR _feature IN SELECT value FROM jsonb_array_elements(_features) LOOP
    _zone := upper(btrim(_feature->>'zone_code'));
    _key := btrim(_feature->>'feature_key');
    IF _zone IS NULL OR _zone !~ '^[A-Z0-9][A-Z0-9_(). /-]{0,79}$'
      OR _key IS NULL OR length(_key) NOT BETWEEN 1 AND 120
      OR jsonb_typeof(_feature->'geometry') <> 'object'
      OR octet_length((_feature->'geometry')::text)>220000 THEN
      RAISE EXCEPTION 'Zona, identificador ou GeoJSON ausente/invalido';
    END IF;
    BEGIN
      _geometry := ST_GeomFromGeoJSON((_feature->'geometry')::text);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Geometria GeoJSON nao reconhecida na camada de zoneamento';
    END;
    IF ST_SRID(_geometry)<>4326 OR ST_GeometryType(_geometry) NOT IN ('ST_Polygon','ST_MultiPolygon')
      OR NOT ST_IsValid(_geometry) OR ST_IsEmpty(_geometry) OR ST_NPoints(_geometry)>20000
      OR ST_XMin(_geometry)<-75 OR ST_XMax(_geometry)>-30
      OR ST_YMin(_geometry)<-35 OR ST_YMax(_geometry)>6 THEN
      RAISE EXCEPTION 'Geometria fora do Brasil, invalida ou em CRS diferente de EPSG:4326';
    END IF;
    _shape:=ST_Multi(_geometry);
    -- Idempotent recovery: a replayed same file is allowed; any modified
    -- geometry under the same key fails instead of rewriting a legal source.
    IF EXISTS(SELECT 1 FROM public.urban_zoning_zone_geometries_v1 z
      WHERE z.map_id=_map.id AND z.feature_key=_key
        AND (z.zone_code<>_zone OR NOT ST_Equals(z.footprint,_shape))) THEN
      RAISE EXCEPTION 'Feicao existente diferente do original: revisao necessaria';
    END IF;
    INSERT INTO public.urban_zoning_zone_geometries_v1(
      map_id,municipality_id,zone_code,feature_key,footprint
    ) VALUES(_map.id,_map.municipality_id,_zone,_key,_shape)
    ON CONFLICT (map_id,feature_key) DO NOTHING;
    _count:=_count+1;
  END LOOP;
  RETURN _count;
END;$$;

CREATE OR REPLACE FUNCTION public.urban_zoning_verify_map_v1(
  _map_id uuid,_verification_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _map public.urban_zoning_map_versions_v1%rowtype;
BEGIN
  SELECT * INTO _map FROM public.urban_zoning_map_versions_v1 WHERE id=_map_id FOR UPDATE;
  IF _map.id IS NULL OR _map.status<>'draft_unverified'
    OR NOT public.can_manage_urban_legislation_registry_v1(_map.municipality_id)
    OR length(btrim(coalesce(_verification_note,'')))<40 THEN
    RAISE EXCEPTION 'Conferencia juridico-cartografica insuficiente ou nao autorizada';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.urban_zoning_zone_geometries_v1 WHERE map_id=_map.id)
    THEN RAISE EXCEPTION 'Mapa sem poligonos, nao pode ser homologado'; END IF;
  UPDATE public.urban_zoning_map_versions_v1
    SET status='verified',verified_by_profile_id=public.current_profile_id(),
    verified_at=clock_timestamp(),verification_note=btrim(_verification_note)
    WHERE id=_map.id;
  RETURN true;
END;$$;

CREATE OR REPLACE FUNCTION public.urban_zoning_stage_parcel_v1(
  _property_id uuid,_geojson jsonb,_cadastral_source text,_sha256 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _property public.properties%rowtype;_geom public.geometry;_result uuid;
BEGIN
  SELECT * INTO _property FROM public.properties WHERE id=_property_id;
  IF _property.id IS NULL OR _property.municipality_id IS NULL
    OR _property.tenant_id <> _property.municipality_id
    OR NOT public.can_manage_urban_legislation_registry_v1(_property.municipality_id)
    OR length(btrim(coalesce(_cadastral_source,'')))<12
    OR coalesce(_sha256,'') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(_geojson)<>'object'
    OR octet_length(_geojson::text)>220000 THEN
    RAISE EXCEPTION 'Imovel, fonte cartografica e inscricao municipal nao validados';
  END IF;
  BEGIN _geom:=ST_GeomFromGeoJSON(_geojson::text);
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'GeoJSON do lote invalido'; END;
  IF ST_SRID(_geom)<>4326 OR ST_GeometryType(_geom) NOT IN ('ST_Polygon','ST_MultiPolygon')
    OR NOT ST_IsValid(_geom) OR ST_IsEmpty(_geom) OR ST_NPoints(_geom)>20000
    OR ST_XMin(_geom)<-75 OR ST_XMax(_geom)>-30
    OR ST_YMin(_geom)<-35 OR ST_YMax(_geom)>6 THEN
    RAISE EXCEPTION 'Perimetro do lote invalido ou fora de EPSG:4326';
  END IF;
  IF EXISTS(SELECT 1 FROM public.urban_zoning_parcel_geometries_v1
    WHERE property_id=_property_id AND status='verified') THEN
    RAISE EXCEPTION 'Lote ja homologado: nova versao exige procedimento de revisao';
  END IF;
  INSERT INTO public.urban_zoning_parcel_geometries_v1(
    property_id,municipality_id,footprint,cadastral_source,source_sha256,created_by_profile_id
  ) VALUES(_property.id,_property.municipality_id,ST_Multi(_geom),
    btrim(_cadastral_source),_sha256,public.current_profile_id())
  ON CONFLICT (municipality_id,property_id) DO UPDATE SET
    footprint=EXCLUDED.footprint,cadastral_source=EXCLUDED.cadastral_source,
    source_sha256=EXCLUDED.source_sha256,created_by_profile_id=EXCLUDED.created_by_profile_id,
    created_at=clock_timestamp()
  RETURNING id INTO _result;
  RETURN _result;
END;$$;

CREATE OR REPLACE FUNCTION public.urban_zoning_verify_parcel_v1(
  _property_id uuid,_verification_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _parcel public.urban_zoning_parcel_geometries_v1%rowtype;
BEGIN
  SELECT * INTO _parcel FROM public.urban_zoning_parcel_geometries_v1
    WHERE property_id=_property_id FOR UPDATE;
  IF _parcel.id IS NULL OR _parcel.status <> 'draft_unverified'
    OR NOT public.can_manage_urban_legislation_registry_v1(_parcel.municipality_id)
    OR length(btrim(coalesce(_verification_note,'')))<40 THEN
    RAISE EXCEPTION 'Perimetro cadastral ainda nao revisado ou sem autorizacao';
  END IF;
  UPDATE public.urban_zoning_parcel_geometries_v1
    SET status='verified',verified_at=clock_timestamp(),
      verified_by_profile_id=public.current_profile_id(),verification_note=btrim(_verification_note)
    WHERE id=_parcel.id;
  RETURN true;
END;$$;

-- Read-only cadastral determination. Only municipality with authorized process access.
-- A zone is resolved only when the entire verified parcel is covered by exactly one
-- verified valid layer/zone. Boundary overlap or missing geometry always blocks.
CREATE OR REPLACE FUNCTION public.urban_zoning_resolve_process_v1(
  _process_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _process public.processes%rowtype;
  _property public.properties%rowtype;
  _parcel public.urban_zoning_parcel_geometries_v1%rowtype;
  _map public.urban_zoning_map_versions_v1%rowtype;
  _reference_date date;_map_count int;_overlap_count int;
  _zone text;_covered boolean;_touches int;
BEGIN
  IF public.current_profile_id() IS NULL
    OR lower(coalesce(public.current_role_code(),'')) NOT IN ('analista','analyst','prefeitura_supervisor') THEN
    RETURN jsonb_build_object('status','access_denied','zoneVerified',false);
  END IF;
  SELECT * INTO _process FROM public.processes WHERE id=_process_id;
  IF _process.id IS NULL OR NOT public.has_process_access(_process_id)
    OR _process.municipality_id IS NULL
    OR _process.tenant_id IS DISTINCT FROM _process.municipality_id
    OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=public.current_profile_id()
      AND p.municipality_id=_process.municipality_id
      AND p.account_status='active' AND p.deleted_at IS NULL)
    THEN RETURN jsonb_build_object('status','access_denied','zoneVerified',false); END IF;
  IF _process.property_id IS NULL THEN
    RETURN jsonb_build_object('status','missing_property','zoneVerified',false);
  END IF;
  SELECT * INTO _property FROM public.properties WHERE id=_process.property_id
    AND municipality_id=_process.municipality_id AND tenant_id=_process.tenant_id;
  IF _property.id IS NULL THEN
    RETURN jsonb_build_object('status','unverified_property','zoneVerified',false);
  END IF;
  SELECT * INTO _parcel FROM public.urban_zoning_parcel_geometries_v1
    WHERE property_id=_property.id AND municipality_id=_process.municipality_id AND status='verified';
  IF _parcel.id IS NULL THEN
    RETURN jsonb_build_object('status','missing_verified_parcel_geometry','zoneVerified',false);
  END IF;
  _reference_date:=COALESCE((_process.officialized_at AT TIME ZONE 'America/Sao_Paulo')::date,
    (_process.created_at AT TIME ZONE 'America/Sao_Paulo')::date);
  SELECT count(*) INTO _map_count FROM public.urban_zoning_map_versions_v1
    WHERE municipality_id=_process.municipality_id AND status='verified'
      AND effective_from<=_reference_date
      AND (effective_until IS NULL OR effective_until>=_reference_date);
  IF _map_count<>1 THEN
    RETURN jsonb_build_object('status',CASE WHEN _map_count=0 THEN 'missing_verified_map' ELSE 'ambiguous_map_versions' END,
      'zoneVerified',false,'asOf',_reference_date);
  END IF;
  SELECT * INTO _map FROM public.urban_zoning_map_versions_v1
    WHERE municipality_id=_process.municipality_id AND status='verified'
      AND effective_from<=_reference_date
      AND (effective_until IS NULL OR effective_until>=_reference_date);
  SELECT count(DISTINCT z.zone_code) INTO _overlap_count
  FROM public.urban_zoning_zone_geometries_v1 z
    WHERE z.map_id=_map.id AND z.municipality_id=_process.municipality_id
      AND ST_Intersects(z.footprint,_parcel.footprint);
  IF _overlap_count<>1 THEN
    RETURN jsonb_build_object('status',CASE WHEN _overlap_count=0 THEN 'outside_zoning_map' ELSE 'multiple_zones_or_boundary' END,
      'zoneVerified',false,'asOf',_reference_date,'mapVersion',_map.version_label);
  END IF;
  SELECT z.zone_code,ST_CoveredBy(_parcel.footprint,ST_UnaryUnion(ST_Collect(z.footprint)))
    INTO _zone,_covered
    FROM public.urban_zoning_zone_geometries_v1 z
    WHERE z.map_id=_map.id AND z.municipality_id=_process.municipality_id
      AND ST_Intersects(z.footprint,_parcel.footprint)
    GROUP BY z.zone_code;
  IF NOT coalesce(_covered,false) THEN
    RETURN jsonb_build_object('status','partially_outside_zone','zoneVerified',false,
      'asOf',_reference_date,'mapVersion',_map.version_label);
  END IF;
  RETURN jsonb_build_object(
    'status','verified','zoneVerified',true,'zoneCode',_zone,
    'asOf',_reference_date,'mapId',_map.id,'mapVersion',_map.version_label,
    'legalReference',_map.legal_reference,'sourceUrl',_map.official_source_url,
    'mapSha256',_map.official_source_sha256,'mapVerifiedAt',_map.verified_at,
    'parcelSha256',_parcel.source_sha256,'parcelVerifiedAt',_parcel.verified_at,
    'legalConformity','not_evaluated');
END;$$;

REVOKE ALL ON FUNCTION public.urban_zoning_create_map_draft_v1(uuid,text,text,text,text,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.urban_zoning_append_features_v1(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.urban_zoning_verify_map_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.urban_zoning_stage_parcel_v1(uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.urban_zoning_verify_parcel_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.urban_zoning_resolve_process_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.urban_zoning_create_map_draft_v1(uuid,text,text,text,text,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urban_zoning_append_features_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urban_zoning_verify_map_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urban_zoning_stage_parcel_v1(uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urban_zoning_verify_parcel_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urban_zoning_resolve_process_v1(uuid) TO authenticated;


-- Painel legal: leitura do catálogo e busca cadastral restritas à própria Prefeitura.
CREATE OR REPLACE FUNCTION public.urban_zoning_list_maps_v1(_municipality_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO pg_catalog,public SET row_security TO off AS $$
BEGIN
  IF NOT public.can_manage_urban_legislation_registry_v1(_municipality_id) THEN
    RAISE EXCEPTION 'Consulta cartografica nao autorizada';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',m.id,'version_label',m.version_label,'legal_reference',m.legal_reference,
      'status',m.status,'official_source_url',m.official_source_url,
      'official_source_sha256',m.official_source_sha256,
      'effective_from',m.effective_from,'effective_until',m.effective_until,
      'feature_count',(SELECT count(*) FROM public.urban_zoning_zone_geometries_v1 z WHERE z.map_id=m.id),
      'verified_at',m.verified_at
    ) ORDER BY m.created_at DESC)
    FROM public.urban_zoning_map_versions_v1 m WHERE m.municipality_id=_municipality_id
  ),'[]'::jsonb);
END;$$;

CREATE OR REPLACE FUNCTION public.urban_zoning_lookup_properties_v1(
 _municipality_id uuid,_search text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE _like text;
BEGIN
  IF NOT public.can_manage_urban_legislation_registry_v1(_municipality_id) THEN
    RAISE EXCEPTION 'Consulta cadastral nao autorizada';
  END IF;
  IF length(btrim(coalesce(_search,'')))<3 OR length(_search)>90 THEN
    RETURN '[]'::jsonb;
  END IF;
  _like:='%'||replace(replace(replace(btrim(_search),E'\\',E'\\\\'),'%','\%'),'_','\_')||'%';
  RETURN COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
    'id',q.id,'address',q.address,'iptu_code',q.iptu_code,
    'registry_code',q.registry_code,'lot',q.lot,'block',q.block
   ) ORDER BY q.address)
   FROM (
     SELECT p.id,p.address,p.iptu_code,p.registry_code,p.lot,p.block
     FROM public.properties p
     WHERE p.municipality_id=_municipality_id AND p.tenant_id=_municipality_id
       AND (p.iptu_code ILIKE _like ESCAPE '\' OR
            coalesce(p.registry_code,'') ILIKE _like ESCAPE '\' OR
            p.address ILIKE _like ESCAPE '\')
     ORDER BY p.address LIMIT 30
   ) q
  ),'[]'::jsonb);
END;$$;

REVOKE ALL ON FUNCTION public.urban_zoning_list_maps_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.urban_zoning_lookup_properties_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.urban_zoning_list_maps_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urban_zoning_lookup_properties_v1(uuid,text) TO authenticated;
