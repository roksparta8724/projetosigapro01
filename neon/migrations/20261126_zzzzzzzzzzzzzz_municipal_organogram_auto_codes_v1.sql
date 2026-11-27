-- Automatic institutional acronym generation, no changes to existing units or grants.
CREATE OR REPLACE FUNCTION private.municipal_unit_code_base_v1(_name text,_kind text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO pg_catalog AS $$
DECLARE normalized text; words text[]; prefix text; suffix text;
BEGIN
 normalized:=upper(translate(coalesce(_name,''),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));
 prefix:=CASE _kind WHEN 'secretaria' THEN CASE WHEN normalized ~ '\mADJUNT[AO]S?\M' THEN 'SAD' ELSE 'SEC' END WHEN 'diretoria' THEN CASE WHEN normalized ~ '\mADJUNT[AO]S?\M' THEN 'DAD' ELSE 'DIR' END WHEN 'departamento' THEN 'DEP' WHEN 'setor' THEN 'SET' WHEN 'coordenadoria' THEN 'COO' WHEN 'divisao' THEN 'DIV' ELSE 'UNI' END;
 SELECT array_agg(w ORDER BY ord) INTO words FROM regexp_split_to_table(normalized,'[^A-Z0-9]+') WITH ORDINALITY AS t(w,ord)
 WHERE w<>'' AND w NOT IN ('DE','DA','DO','DAS','DOS','E','PARA','POR','EM','NA','NO','SECRETARIA','SECRETARIO','DIRETORIA','DIRETOR','DEPARTAMENTO','SETOR','COORDENADORIA','DIVISAO','UNIDADE','ADJUNTA','ADJUNTO');
 IF coalesce(array_length(words,1),0)>1 THEN SELECT string_agg(left(w,1),'' ORDER BY ord) INTO suffix FROM unnest(words) WITH ORDINALITY AS t(w,ord);
 ELSE suffix:=left(words[1],3); END IF;
 RETURN left(prefix||'-'||coalesce(nullif(suffix,''),'GER'),8);
END $$;
REVOKE ALL ON FUNCTION private.municipal_unit_code_base_v1(text,text) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.upsert_municipal_department_v1(_municipality_id uuid,_department_id uuid DEFAULT NULL::uuid,_name text DEFAULT NULL::text,_code text DEFAULT NULL::text,_description text DEFAULT NULL::text,_email text DEFAULT NULL::text,_phone text DEFAULT NULL::text,_parent_department_id uuid DEFAULT NULL::uuid,_unit_type text DEFAULT 'departamento'::text,_sort_order integer DEFAULT 100,_is_active boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
DECLARE _id uuid; _row public.departments%rowtype; _previous public.departments%rowtype; _kind text; _sigla text; _base text; _n integer:=1; _suffix text;
BEGIN
 IF NOT public.is_master() AND NOT public.can_manage_municipality(_municipality_id) THEN RAISE EXCEPTION 'Sem permissão para administrar o organograma desta Prefeitura.'; END IF;
 IF _municipality_id IS NULL OR nullif(btrim(coalesce(_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe a Prefeitura e o nome da unidade.'; END IF;
 -- One namespace per municipality, including inactive units. Serialize all saves.
 PERFORM pg_advisory_xact_lock(hashtextextended('municipal-organogram:'||_municipality_id::text,0));
 IF _department_id IS NOT NULL THEN
  SELECT * INTO _previous FROM public.departments WHERE id=_department_id AND municipality_id=_municipality_id FOR UPDATE;
  IF _previous.id IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.'; END IF;
 END IF;
 _kind:=coalesce(nullif(btrim(_unit_type),''),'departamento');
 IF _kind NOT IN ('secretaria','diretoria','departamento','setor','coordenadoria','divisao','unidade') AND _kind IS DISTINCT FROM _previous.unit_type THEN RAISE EXCEPTION 'Tipo de unidade inválido.'; END IF;
 IF _parent_department_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.departments WHERE id=_parent_department_id AND municipality_id=_municipality_id) THEN RAISE EXCEPTION 'A unidade superior não pertence a esta Prefeitura.'; END IF;
  IF _department_id IS NOT NULL AND EXISTS(
   WITH RECURSIVE ancestors(id,parent_department_id) AS (
    SELECT id,parent_department_id FROM public.departments WHERE id=_parent_department_id AND municipality_id=_municipality_id
    UNION
    SELECT d.id,d.parent_department_id FROM public.departments d JOIN ancestors a ON d.id=a.parent_department_id WHERE d.municipality_id=_municipality_id
   ) SELECT 1 FROM ancestors WHERE id=_department_id
  ) THEN RAISE EXCEPTION 'A unidade superior criaria um ciclo no organograma.'; END IF;
 END IF;
 _sigla:=nullif(upper(btrim(coalesce(_code,''))),'');
 IF _sigla IS NULL THEN
  _base:=private.municipal_unit_code_base_v1(_name,_kind);
  _sigla:=_base;
  WHILE EXISTS(SELECT 1 FROM public.departments d WHERE d.municipality_id=_municipality_id AND d.id IS DISTINCT FROM _department_id AND upper(btrim(d.code))=_sigla) LOOP
   _n:=_n+1; IF _n>9999 THEN RAISE EXCEPTION 'Não foi possível gerar uma sigla exclusiva.'; END IF;
   _suffix:=_n::text; _sigla:=left(_base,8-length(_suffix))||_suffix;
  END LOOP;
 ELSIF _sigla IS DISTINCT FROM upper(btrim(_previous.code)) THEN
  IF _sigla !~ '^[A-Z0-9][A-Z0-9-]{0,7}$' THEN RAISE EXCEPTION 'Use até oito caracteres: letras, números e hífen.'; END IF;
  IF EXISTS(SELECT 1 FROM public.departments d WHERE d.municipality_id=_municipality_id AND d.id IS DISTINCT FROM _department_id AND upper(btrim(d.code))=_sigla) THEN RAISE EXCEPTION 'Esta sigla já existe nesta Prefeitura. Apague-a para gerar outra automaticamente.'; END IF;
 END IF;
 IF _department_id IS NULL THEN
  INSERT INTO public.departments(municipality_id,code,name,description,email,phone,is_active,parent_department_id,unit_type,sort_order,updated_at)
  VALUES(_municipality_id,_sigla,btrim(_name),nullif(btrim(coalesce(_description,'')),''),nullif(lower(btrim(coalesce(_email,''))),''),nullif(btrim(coalesce(_phone,'')),''),coalesce(_is_active,true),_parent_department_id,_kind,coalesce(_sort_order,100),now()) RETURNING id INTO _id;
 ELSE
  UPDATE public.departments SET code=_sigla,name=btrim(_name),description=nullif(btrim(coalesce(_description,'')),''),email=nullif(lower(btrim(coalesce(_email,''))),''),phone=nullif(btrim(coalesce(_phone,'')),''),is_active=coalesce(_is_active,true),parent_department_id=_parent_department_id,unit_type=_kind,sort_order=coalesce(_sort_order,100),updated_at=now()
  WHERE id=_department_id AND municipality_id=_municipality_id RETURNING id INTO _id;
 END IF;
 SELECT * INTO _row FROM public.departments WHERE id=_id;
 RETURN to_jsonb(_row);
END $$;
REVOKE ALL ON FUNCTION public.upsert_municipal_department_v1(uuid,uuid,text,text,text,text,text,uuid,text,integer,boolean) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.upsert_municipal_department_v1(uuid,uuid,text,text,text,text,text,uuid,text,integer,boolean) TO authenticated;
