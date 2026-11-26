ALTER TABLE public.municipal_authority_designations ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS urbanism_authorized boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS municipal_authority_primary_one_v1 ON public.municipal_authority_designations(municipality_id,profile_id) WHERE is_primary AND is_active;

ALTER TABLE public.municipal_authority_designation_audit DROP CONSTRAINT IF EXISTS municipal_authority_designation_audit_event_check;

ALTER TABLE public.municipal_authority_designation_audit ADD CONSTRAINT municipal_authority_designation_audit_event_check CHECK(event IN ('grant','revoke','preferences'));

ALTER TABLE public.municipal_authority_designation_audit ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.list_municipal_authority_designations_v1(_municipality_id uuid, _profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE actor public.profiles%rowtype;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.municipality_id IS DISTINCT FROM _municipality_id OR (actor.role<>'prefeitura_admin' AND actor.id<>_profile_id) THEN RAISE EXCEPTION 'Sem autorização para consultar designações.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile_id AND p.municipality_id=_municipality_id AND p.deleted_at IS NULL) THEN RAISE EXCEPTION 'Perfil fora da Prefeitura.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'profileId',a.profile_id,'municipalityId',a.municipality_id,'departmentId',a.department_id,'kind',a.authority_kind,'isPrimary',a.is_primary,'urbanismAuthorized',a.urbanism_authorized,'departmentName',d.name,'departmentCode',d.code,'isActive',a.is_active AND d.is_active AND d.unit_type=a.authority_kind AND p.account_status='active' AND p.deleted_at IS NULL) ORDER BY d.name,a.id),'[]'::jsonb)
 FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id JOIN public.profiles p ON p.id=a.profile_id AND p.municipality_id=a.municipality_id WHERE a.municipality_id=_municipality_id AND a.profile_id=_profile_id AND a.is_active);
END $function$;

CREATE OR REPLACE FUNCTION public.set_municipal_authority_designation_v1(_municipality_id uuid, _profile_id uuid, _department_id uuid, _enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE actor public.profiles%rowtype; target public.profiles%rowtype; unit public.departments%rowtype; assignment uuid;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.role<>'prefeitura_admin' OR actor.municipality_id IS DISTINCT FROM _municipality_id OR actor.id=_profile_id THEN RAISE EXCEPTION 'Somente o administrador da Prefeitura pode designar outros servidores.'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=_profile_id AND municipality_id=_municipality_id AND deleted_at IS NULL FOR UPDATE;
 IF target.id IS NULL OR target.role NOT IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial') OR (_enabled AND target.account_status<>'active') THEN RAISE EXCEPTION 'Servidor interno elegível não encontrado.'; END IF;
 SELECT * INTO unit FROM public.departments WHERE id=_department_id AND municipality_id=_municipality_id;
 IF unit.id IS NULL OR (_enabled AND (NOT unit.is_active OR unit.unit_type NOT IN ('secretaria','diretoria'))) THEN RAISE EXCEPTION 'Selecione uma Secretaria ou Diretoria ativa da Prefeitura.'; END IF;
 IF _enabled IS TRUE THEN
 IF EXISTS(SELECT 1 FROM public.municipal_authority_designations WHERE municipality_id=_municipality_id AND profile_id=_profile_id AND department_id=_department_id AND is_active AND authority_kind<>unit.unit_type) THEN RAISE EXCEPTION 'Retire a designação anterior antes de mudar o tipo da unidade.'; END IF;
 INSERT INTO public.municipal_authority_designations(municipality_id,profile_id,department_id,authority_kind,updated_by) VALUES(_municipality_id,_profile_id,_department_id,unit.unit_type,actor.id)
 ON CONFLICT(municipality_id,profile_id,department_id,authority_kind) DO UPDATE SET is_active=true,is_primary=false,urbanism_authorized=false,updated_by=actor.id,updated_at=now()
 WHERE NOT public.municipal_authority_designations.is_active RETURNING id INTO assignment;
 ELSE
 FOR assignment IN UPDATE public.municipal_authority_designations SET is_active=false,is_primary=false,urbanism_authorized=false,updated_by=actor.id,updated_at=now() WHERE municipality_id=_municipality_id AND profile_id=_profile_id AND department_id=_department_id AND is_active RETURNING id LOOP
 INSERT INTO public.municipal_authority_designation_audit(designation_id,municipality_id,actor_profile_id,event) VALUES(assignment,_municipality_id,actor.id,'revoke');
 END LOOP;
 assignment:=NULL;
 END IF;
 IF assignment IS NOT NULL THEN INSERT INTO public.municipal_authority_designation_audit(designation_id,municipality_id,actor_profile_id,event) VALUES(assignment,_municipality_id,actor.id,CASE WHEN _enabled THEN 'grant' ELSE 'revoke' END); END IF;
 RETURN public.list_municipal_authority_designations_v1(_municipality_id,_profile_id);
END $function$;

CREATE OR REPLACE FUNCTION public.set_municipal_authority_preferences_v1(_municipality_id uuid,_profile_id uuid,_designation_id uuid,_make_primary boolean,_urbanism_authorized boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor public.profiles%rowtype; target public.profiles%rowtype; designation public.municipal_authority_designations%rowtype; old_primary boolean;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.role<>'prefeitura_admin' OR actor.municipality_id IS DISTINCT FROM _municipality_id OR actor.id=_profile_id THEN RAISE EXCEPTION 'Somente o administrador da Prefeitura pode definir a competência de outros servidores.'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=_profile_id AND municipality_id=_municipality_id AND deleted_at IS NULL AND account_status='active' FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Servidor ativo não encontrado.'; END IF;
 SELECT a.* INTO designation FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id AND d.unit_type=a.authority_kind WHERE a.id=_designation_id AND a.profile_id=_profile_id AND a.municipality_id=_municipality_id AND a.is_active AND d.is_active FOR UPDATE OF a;
 IF designation.id IS NULL THEN RAISE EXCEPTION 'Designação ativa não encontrada.'; END IF;
 IF _make_primary IS TRUE AND NOT EXISTS(SELECT 1 FROM public.departments d WHERE d.id=designation.department_id AND nullif(btrim(d.code),'') IS NOT NULL) THEN RAISE EXCEPTION 'Cadastre a sigla da unidade antes de fixá-la no nome.'; END IF;
 IF _urbanism_authorized IS TRUE AND target.role<>'prefeitura_supervisor' THEN RAISE EXCEPTION 'A competência urbanística exige o perfil institucional de Supervisão.'; END IF;
 old_primary:=designation.is_primary;
 IF _make_primary IS TRUE THEN
 UPDATE public.municipal_authority_designations SET is_primary=false,updated_by=actor.id,updated_at=now() WHERE municipality_id=_municipality_id AND profile_id=_profile_id AND is_active AND is_primary AND id<>designation.id;
 END IF;
 UPDATE public.municipal_authority_designations SET is_primary=coalesce(_make_primary,is_primary),urbanism_authorized=coalesce(_urbanism_authorized,urbanism_authorized),updated_by=actor.id,updated_at=now() WHERE id=designation.id;
 INSERT INTO public.municipal_authority_designation_audit(designation_id,municipality_id,actor_profile_id,event,details) VALUES(designation.id,_municipality_id,actor.id,'preferences',jsonb_build_object('previousPrimary',old_primary,'primary',coalesce(_make_primary,old_primary),'previousUrbanismAuthorized',designation.urbanism_authorized,'urbanismAuthorized',coalesce(_urbanism_authorized,designation.urbanism_authorized)));
 RETURN public.list_municipal_authority_designations_v1(_municipality_id,_profile_id);
END $$;

REVOKE ALL ON FUNCTION public.set_municipal_authority_preferences_v1(uuid,uuid,uuid,boolean,boolean) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.set_municipal_authority_preferences_v1(uuid,uuid,uuid,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public._municipal_urbanism_authority_title_v1(_profile_id uuid,_municipality_id uuid,_kind text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE result text;
BEGIN
 IF _kind NOT IN ('diretoria','secretaria') OR _municipality_id IS NULL OR _profile_id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile_id AND p.municipality_id=_municipality_id AND p.account_status='active' AND p.deleted_at IS NULL AND p.role='prefeitura_supervisor') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_memberships tm JOIN public.roles r ON r.id=tm.role_id WHERE tm.profile_id=_profile_id AND tm.tenant_id=_municipality_id AND tm.is_active AND tm.deleted_at IS NULL AND r.code::text='prefeitura_supervisor') THEN RETURN NULL; END IF;
 -- Once an administrator uses the new designation registry, free-form title
 -- text can never grant or restore a signing permission, even after revocation.
 IF EXISTS(SELECT 1 FROM public.municipal_authority_designations a WHERE a.profile_id=_profile_id AND a.municipality_id=_municipality_id) THEN
 SELECT (CASE _kind WHEN 'diretoria' THEN 'Diretor(a) — ' ELSE 'Secretário(a) — ' END)||d.name INTO result
 FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id AND d.unit_type=a.authority_kind
 WHERE a.profile_id=_profile_id AND a.municipality_id=_municipality_id AND a.authority_kind=_kind AND a.is_active AND a.urbanism_authorized AND d.is_active
 ORDER BY a.is_primary DESC,a.updated_at DESC,a.id LIMIT 1;
 RETURN result;
 END IF;
 -- Existing urbanism supervisors with formally configured legacy positions
 -- remain compatible until their administrator migrates their designations.
 IF public.profile_operational_area(_profile_id)<>'analise' THEN RETURN NULL; END IF;
 SELECT coalesce(nullif(btrim(tm.position_title),''),nullif(btrim(tm.profile_label),'')) INTO result
 FROM public.tenant_memberships tm WHERE tm.profile_id=_profile_id AND tm.tenant_id=_municipality_id AND tm.is_active AND tm.deleted_at IS NULL
 AND (( _kind='diretoria' AND (lower(coalesce(tm.position_title,'')) ~ '\mdiretor(a)?\M' OR lower(coalesce(tm.profile_label,'')) ~ '\mdiretor(a)?\M'))
 OR (_kind='secretaria' AND (lower(coalesce(tm.position_title,'')) ~ '\msecret[aá]ri[oa]\M' OR lower(coalesce(tm.profile_label,'')) ~ '\msecret[aá]ri[oa]\M'))) ORDER BY tm.updated_at DESC NULLS LAST LIMIT 1;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public._municipal_urbanism_authority_title_v1(uuid,uuid,text) FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.get_process_artifact_signature_context_v1(_process_id uuid, _signer_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _role text;
  _position text;
  _registration text;
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _allowed boolean := false;
begin
  if _slot not in ('analise_tecnica','conferencia_fiscal','diretoria','secretaria','profissional') then
    raise exception 'Tipo de assinatura inválido.';
  end if;

  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(),_profile.role,''));

  select coalesce(
      nullif(btrim(tm.position_title),''),
      nullif(btrim(tm.profile_label),''),
      nullif(btrim(r.label),'')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id=tm.role_id
  where tm.profile_id=_profile.id
    and tm.tenant_id=_process.tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last,tm.created_at desc nulls last
  limit 1;

  _position := coalesce(_position,nullif(btrim(_profile.professional_type),''),_role);
  _registration := nullif(btrim(_profile.registration_number),'');

  if _slot='analise_tecnica' then
    -- A assinatura técnica pertence ao Analista responsável atual. A Diretoria
    -- assina no slot próprio "diretoria", nunca se passando pelo Analista.
    _allowed :=
      public.is_master()
      or (
        _role in ('analista','analyst')
        and public.can_sign_assigned_analysis_v1(_process_id)
      );
  elsif _slot='conferencia_fiscal' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','fiscal')
      or lower(coalesce(_position,'')) ~ '(fiscal|diretor|diretora|secret[aá]ri)';
  elsif _slot in ('diretoria','secretaria') then
    _position := public._municipal_urbanism_authority_title_v1(_profile.id,coalesce(_process.municipality_id,_process.tenant_id),_slot);
    _allowed := _position IS NOT NULL;
  elsif _slot='profissional' then
    _allowed := _role in ('profissional_externo','professional_external','professional','profissional');
  end if;

  if not _allowed then
    if _slot='analise_tecnica' then
      raise exception 'Somente o Analista responsável atual pode registrar a assinatura técnica desta versão.';
    end if;
    raise exception 'Este perfil não possui atribuição para esta assinatura.';
  end if;

  return jsonb_build_object(
    'auth_subject',public.current_auth_subject(),
    'profile_id',_profile.id,
    'user_id',_profile.user_id,
    'email',lower(coalesce(_profile.email,'')),
    'name',coalesce(nullif(btrim(_profile.full_name),''),_profile.email,'Usuário'),
    'role',_role,
    'title',_position,
    'registration',_registration,
    'signer_slot',_slot,
    'process_id',_process.id,
    'tenant_id',_process.tenant_id,
    'municipality_id',_process.municipality_id,
    'protocol_number',_process.protocol_number,
    'process_title',_process.title
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_supervise_process_analysis(_process_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text;
  _actor_municipality uuid;
  _process_municipality uuid;
begin
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.role,p.municipality_id
    into _actor_role,_actor_municipality
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_role <> 'prefeitura_supervisor' then return false; end if;
  -- New designations authorize supervision only for an expressly designated urbanism director.

  select coalesce(p.municipality_id,p.tenant_id)
    into _process_municipality
  from public.processes p
  where p.id=_process_id;

  return _process_municipality is not null AND _actor_municipality=_process_municipality
     AND (CASE WHEN EXISTS(SELECT 1 FROM public.municipal_authority_designations a WHERE a.profile_id=_actor AND a.municipality_id=_actor_municipality) THEN public._municipal_urbanism_authority_title_v1(_actor,_process_municipality,'diretoria') IS NOT NULL ELSE public.profile_operational_area(_actor)='analise' END);
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_construction_permit_director_signature_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _row public.process_construction_permits%rowtype;
  _director record;
  _director_count integer := 0;
  _director_name text := '';
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id;

  if _profile.id is null or _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if not public.is_master() and _role not in ('analista','analyst') then
    raise exception 'Somente o Analista Técnico responsável pode solicitar a assinatura da Diretoria.';
  end if;

  if not public.is_master()
     and _process.analysis_assigned_to_profile_id is not null
     and _process.analysis_assigned_to_profile_id is distinct from _profile.id then
    raise exception 'Somente o Analista responsável por este processo pode solicitar a assinatura da Diretoria.';
  end if;

  -- Never request the director's signature before the official analysis.
  IF _process.status::text IN ('pagamento_pendente','arquivado','indeferido') THEN
    RAISE EXCEPTION 'O processo não está apto para solicitar assinatura do Alvará.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.signature_blocks sb
    JOIN public.signatures sg ON sg.signature_block_id=sb.id
    WHERE sb.process_id=_process_id
      AND sb.tenant_id=_process.tenant_id
      AND sb.municipality_id=_process.municipality_id
      AND sb.artifact_type='urban_analysis_checklist'
      AND sb.artifact_key='urban-analysis-checklist'
      AND sb.status='concluido'
      AND sb.evidence_hash ~ '^[a-f0-9]{64}$'
      AND sg.status='concluido'
      AND sg.signer_slot='analise_tecnica'
      AND sg.signer_profile_id=_process.analysis_assigned_to_profile_id
      AND sg.tenant_id=_process.tenant_id
      AND sg.municipality_id=_process.municipality_id
      AND sg.document_hash=sb.evidence_hash
      AND sg.reauthenticated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A ficha de análise precisa ter assinatura técnica autenticada e hash correspondente antes da solicitação à Diretoria.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.process_documents d
    WHERE d.process_id=_process_id
      AND coalesce(d.is_valid,true)=true
      AND coalesce(d.is_required,false)=true
      AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NULL
           OR coalesce(d.review_status,'pendente')<>'aprovado')
  ) OR EXISTS (
    SELECT 1 FROM public.process_requirements r
    WHERE r.process_id=_process_id AND r.status IN ('aberta','respondida')
  ) THEN
    RAISE EXCEPTION 'Existem documentos obrigatórios ou exigências pendentes; a assinatura da Diretoria não pode ser solicitada.';
  END IF;

  select count(*),min(p.full_name)
    into _director_count,_director_name
  from public.profiles p
  where p.deleted_at is null
    and p.account_status='active'
    and p.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'diretoria') IS NOT NULL;

  if _director_count=0 then
    raise exception 'Nenhum Diretor ativo de Urbanismo/Obras foi localizado no banco oficial desta Prefeitura.';
  end if;

  select * into _row
  from public.process_construction_permits
  where process_id=_process_id
  for update;

  if _row.id is null then
    raise exception 'Salve primeiro o preenchimento do Alvará.';
  end if;

  update public.process_construction_permits
  set status='awaiting_director',
      signature_mode='electronic',
      director_requested_at=clock_timestamp(),
      director_requested_by_profile_id=_profile.id,
      manual_pdf_prepared_at=null,
      manual_pdf_prepared_by_profile_id=null,
      updated_at=clock_timestamp()
  where id=_row.id
  returning * into _row;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,
    actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,_process.municipality_id,_process.id,
    _profile.user_id,_profile.id,
    'assinatura',
    'Assinatura do Alvará solicitada à Diretoria',
    concat(
      'Alvará ',_row.permit_number,
      ' encaminhado pelo Analista ',
      coalesce(nullif(btrim(_profile.full_name),''),_profile.email),
      ' para assinatura eletrônica da Diretoria.'
    ),
    false,clock_timestamp()
  );

  for _director in
    select p.id,p.full_name
    from public.profiles p
    where p.deleted_at is null
      and p.account_status='active'
      and p.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
      and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'diretoria') IS NOT NULL
  loop
    perform public.enqueue_notification_v1(
      _director.id,
      'Alvará aguardando sua assinatura',
      concat(
        'O Alvará ',_row.permit_number,
        ' do processo ',_process.protocol_number,
        ' foi encaminhado pelo Analista para assinatura eletrônica.'
      ),
      'assinatura',
      _process.id,
      '/processos/'||_process.id::text||'?aba=alvara',
      'assinatura',
      'alta',
      _profile.id,
      'permit:director-request:'||_row.id::text||':'||_director.id::text,
      jsonb_build_object(
        'permit_number',_row.permit_number,
        'protocol_number',_process.protocol_number
      )
    );
  end loop;

  return jsonb_build_object(
    'ok',true,
    'director_count',_director_count,
    'director_name',_director_name,
    'permit',jsonb_build_object(
      'id',_row.id,
      'process_id',_row.process_id,
      'municipality_id',_row.municipality_id,
      'permit_number',_row.permit_number,
      'form_data',_row.form_data,
      'status',_row.status,
      'signature_mode',_row.signature_mode,
      'director_requested_at',_row.director_requested_at,
      'director_requested_by_profile_id',_row.director_requested_by_profile_id,
      'manual_pdf_prepared_at',_row.manual_pdf_prepared_at,
      'created_at',_row.created_at,
      'updated_at',_row.updated_at
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_process_artifact_signature_v1(_process_id uuid, _artifact_key text, _artifact_hash text, _signer_slot text DEFAULT 'diretoria'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _block public.signature_blocks%rowtype;
  _request public.process_signature_requests%rowtype;
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _hash text := lower(btrim(coalesce(_artifact_hash,'')));
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _role text;
  _created boolean := false;
  _candidate_count integer := 0;
begin
  if _slot <> 'diretoria' then
    raise exception 'Somente a assinatura da Diretoria pode ser solicitada por este fluxo.';
  end if;

  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  select * into _block
  from public.signature_blocks
  where process_id=_process_id
    and document_id is null
    and artifact_key=_key
    and evidence_hash=_hash
    and status='concluido'
  order by artifact_version desc
  limit 1;

  if _block.id is null then
    raise exception 'A versão assinada da ficha não foi localizada.';
  end if;

  if not exists (
    select 1 from public.signatures
    where signature_block_id=_block.id
      and signer_slot='analise_tecnica'
      and status='concluido'
  ) then
    raise exception 'A análise técnica precisa estar assinada antes de solicitar a Diretoria.';
  end if;

  if not (
    exists (
      select 1 from public.signatures
      where signature_block_id=_block.id
        and signer_slot='analise_tecnica'
        and signer_profile_id=_profile.id
        and status='concluido'
    )
    or _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor')
  ) then
    raise exception 'Somente o analista responsável ou a administração pode solicitar a assinatura da Diretoria.';
  end if;

  if exists (
    select 1 from public.signatures
    where signature_block_id=_block.id
      and signer_slot='diretoria'
      and status='concluido'
  ) then
    raise exception 'A Diretoria já assinou eletronicamente esta versão.';
  end if;

  update public.process_signature_requests
  set status='stale'
  where process_id=_process_id
    and artifact_key=_key
    and signer_slot=_slot
    and status='pending'
    and artifact_hash<>_hash;

  insert into public.process_signature_requests(
    tenant_id, municipality_id, process_id, artifact_key, artifact_hash,
    signer_slot, status, requested_by_profile_id, requested_by_user_id
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id, _key, _hash,
    _slot, 'pending', _profile.id, _profile.user_id
  )
  on conflict do nothing
  returning * into _request;

  if _request.id is not null then
    _created := true;
  else
    select * into _request
    from public.process_signature_requests
    where process_id=_process_id
      and artifact_key=_key
      and artifact_hash=_hash
      and signer_slot=_slot
      and status='pending'
    order by requested_at desc
    limit 1;
  end if;

  select count(distinct p.id)::int
    into _candidate_count
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id=p.id
   and tm.tenant_id=_process.tenant_id
   and tm.is_active=true
   and tm.deleted_at is null
  left join public.roles r on r.id=tm.role_id
  where p.municipality_id=_process.municipality_id
    and p.deleted_at is null
    and p.account_status='active'
    and replace(lower(coalesce(p.tipo,'')), '''', '') <> 'externo'
    and lower(coalesce(p.role,'')) not in ('profissional_externo','professional_external','professional','profissional')
    and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'diretoria') IS NOT NULL;

  if _candidate_count = 1 then
    update public.process_signature_requests r
    set assigned_profile_id = candidate.profile_id
    from (
      select p.id as profile_id
      from public.profiles p
      left join public.tenant_memberships tm
        on tm.profile_id=p.id
       and tm.tenant_id=_process.tenant_id
       and tm.is_active=true
       and tm.deleted_at is null
      left join public.roles rr on rr.id=tm.role_id
      where p.municipality_id=_process.municipality_id
        and p.deleted_at is null
        and p.account_status='active'
        and replace(lower(coalesce(p.tipo,'')), '''', '') <> 'externo'
        and lower(coalesce(p.role,'')) not in ('profissional_externo','professional_external','professional','profissional')
        and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'diretoria') IS NOT NULL
      limit 1
    ) candidate
    where r.id=_request.id;

    select * into _request
    from public.process_signature_requests
    where id=_request.id;
  end if;

  if _created then
    insert into public.process_audit_entries(
      tenant_id, municipality_id, process_id,
      actor_user_id, actor_profile_id,
      category, title, detail, visible_to_external, created_at
    )
    values(
      _process.tenant_id,
      _process.municipality_id,
      _process.id,
      _profile.user_id,
      _profile.id,
      'assinatura',
      'Assinatura da Diretoria solicitada',
      concat(
        'Solicitação enviada para a Diretoria • SHA-256 ',
        _hash
      ),
      false,
      clock_timestamp()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'created', _created,
    'candidate_count', _candidate_count,
    'request', jsonb_build_object(
      'id', _request.id,
      'status', _request.status,
      'signer_slot', _request.signer_slot,
      'artifact_key', _request.artifact_key,
      'artifact_hash', _request.artifact_hash,
      'requested_at', _request.requested_at,
      'requested_by_profile_id', _request.requested_by_profile_id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_habite_se_secretary_signature_v1(_process_id uuid, _artifact_key text, _artifact_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _block public.signature_blocks%rowtype;
  _request public.process_signature_requests%rowtype;
  _role text;
  _position text;
  _candidate_count integer := 0;
begin
  select * into _profile
  from public.profiles
  where id = public.current_profile_id()
    and deleted_at is null
    and account_status = 'active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id = _process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  select coalesce(nullif(btrim(tm.position_title),''), nullif(btrim(tm.profile_label),''), nullif(btrim(r.label),''))
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id = tm.role_id
  where tm.profile_id = _profile.id
    and tm.tenant_id = _process.tenant_id
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  if not (
    _role in ('master_admin','master_ops','prefeitura_admin')
    or public._municipal_urbanism_authority_title_v1(_profile.id,coalesce(_process.municipality_id,_process.tenant_id),'diretoria') IS NOT NULL
  ) then
    raise exception 'Somente a Diretoria ou a administração pode solicitar a assinatura complementar da Secretaria.';
  end if;

  select * into _block
  from public.signature_blocks
  where process_id = _process_id
    and document_id is null
    and artifact_key = lower(btrim(coalesce(_artifact_key,'')))
    and evidence_hash = lower(btrim(coalesce(_artifact_hash,'')))
    and artifact_type = 'habite_se_permit'
    and status = 'concluido'
  order by artifact_version desc
  limit 1;

  if _block.id is null then
    raise exception 'A versão oficial do Alvará de Habite-se não foi localizada.';
  end if;

  if not exists (
    select 1 from public.signatures
    where signature_block_id = _block.id
      and signer_slot = 'diretoria'
      and status = 'concluido'
  ) then
    raise exception 'A Diretoria precisa assinar o Alvará antes da solicitação complementar à Secretaria.';
  end if;

  if exists (
    select 1 from public.signatures
    where signature_block_id = _block.id
      and signer_slot = 'secretaria'
      and status = 'concluido'
  ) then
    raise exception 'A Secretaria já assinou eletronicamente esta versão.';
  end if;

  update public.process_signature_requests
  set status = 'stale'
  where process_id = _process_id
    and artifact_key = lower(btrim(coalesce(_artifact_key,'')))
    and signer_slot = 'secretaria'
    and status = 'pending'
    and artifact_hash <> lower(btrim(coalesce(_artifact_hash,'')));

  insert into public.process_signature_requests(
    tenant_id, municipality_id, process_id, artifact_key, artifact_hash,
    signer_slot, status, requested_by_profile_id, requested_by_user_id, note
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    lower(btrim(coalesce(_artifact_key,''))),
    lower(btrim(coalesce(_artifact_hash,''))),
    'secretaria', 'pending', _profile.id, _profile.user_id,
    'Assinatura complementar opcional da Secretaria'
  )
  on conflict do nothing
  returning * into _request;

  if _request.id is null then
    select * into _request
    from public.process_signature_requests
    where process_id = _process_id
      and artifact_key = lower(btrim(coalesce(_artifact_key,'')))
      and artifact_hash = lower(btrim(coalesce(_artifact_hash,'')))
      and signer_slot = 'secretaria'
      and status = 'pending'
    order by requested_at desc
    limit 1;
  end if;

  select count(distinct p.id)::int into _candidate_count
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id = p.id
   and tm.tenant_id = _process.tenant_id
   and tm.is_active = true
   and tm.deleted_at is null
  left join public.roles r on r.id = tm.role_id
  where p.municipality_id = _process.municipality_id
    and p.deleted_at is null
    and p.account_status = 'active'
    and replace(lower(coalesce(p.tipo,'')), '''', '') <> 'externo'
    and lower(coalesce(p.role,'')) not in ('profissional_externo','professional_external','professional','profissional')
    and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'secretaria') IS NOT NULL;

  if _candidate_count = 1 then
    update public.process_signature_requests req
    set assigned_profile_id = candidate.profile_id
    from (
      select p.id as profile_id
      from public.profiles p
      left join public.tenant_memberships tm
        on tm.profile_id = p.id
       and tm.tenant_id = _process.tenant_id
       and tm.is_active = true
       and tm.deleted_at is null
      left join public.roles r on r.id = tm.role_id
      where p.municipality_id = _process.municipality_id
        and p.deleted_at is null
        and p.account_status = 'active'
        and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'secretaria') IS NOT NULL
      limit 1
    ) candidate
    where req.id = _request.id;
  end if;

  insert into public.notifications(
    user_id, profile_id, municipality_id, process_id,
    title, message, type, is_read, created_at, category, priority, action_url, metadata
  )
  select
    p.user_id, p.id, _process.municipality_id, _process.id,
    'Assinatura complementar do Habite-se',
    concat('O processo ', coalesce(_process.protocol_number, _process.id::text), ' possui Alvará de Habite-se assinado pela Diretoria e aguarda assinatura complementar opcional da Secretaria.'),
    'assinatura', false, clock_timestamp(), 'assinatura', 'normal',
    concat('/processos/', _process.id::text, '?aba=alvara'),
    jsonb_build_object('artifact_key', lower(btrim(coalesce(_artifact_key,''))), 'signer_slot', 'secretaria')
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id = p.id
   and tm.tenant_id = _process.tenant_id
   and tm.is_active = true
   and tm.deleted_at is null
  left join public.roles r on r.id = tm.role_id
  where p.municipality_id = _process.municipality_id
    and p.deleted_at is null
    and p.account_status = 'active'
    and public._municipal_urbanism_authority_title_v1(p.id,coalesce(_process.municipality_id,_process.tenant_id),'secretaria') IS NOT NULL;

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id,
    actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    _profile.user_id, _profile.id,
    'assinatura',
    'Assinatura complementar da Secretaria solicitada',
    'Solicitação opcional enviada à Secretaria após a assinatura conclusiva da Diretoria.',
    false, clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', _request.id,
      'status', _request.status,
      'signer_slot', _request.signer_slot,
      'artifact_key', _request.artifact_key,
      'artifact_hash', _request.artifact_hash,
      'requested_at', _request.requested_at,
      'assigned_profile_id', _request.assigned_profile_id
    ),
    'candidate_count', _candidate_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_habite_se_process_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _position text;
  _authorized boolean := false;
  _director_signature_valid boolean := false;
  _habite_guide_valid boolean := false;
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null or not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  for update;

  if _permit.id is null or _permit.status <> 'emitido' then
    raise exception 'O processo só pode ser concluído após a emissão válida do Alvará de Habite-se.';
  end if;

  -- Status "emitido" isoladamente não comprova assinatura. O documento
  -- deve ter código verificável e assinatura da Diretoria na mesma versão.
  select exists(
    select 1 from public.signature_blocks b
    join public.signatures s on s.signature_block_id=b.id
      and s.signer_slot='diretoria' and s.status='concluido'
    where b.process_id=_process_id
      and b.document_id is null
      and b.artifact_type='habite_se_permit'
      and b.artifact_key='habite-se-permit'
      and b.artifact_payload->>'permitNumber'=_permit.permit_number
      and jsonb_typeof(b.artifact_payload->'formData')='object'
      and b.status='concluido'
      and b.tenant_id=_process.tenant_id
    and b.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and b.evidence_hash ~ '^[a-f0-9]{64}$'
    and b.evidence_version>=4
    and nullif(btrim(b.verification_code),'') is not null
    and b.artifact_payload->>'permitNumber'=_permit.permit_number
    and b.artifact_payload->'formData'=_permit.form_data
      and s.tenant_id=b.tenant_id
        and s.municipality_id=b.municipality_id
        and s.document_hash=b.evidence_hash
        and s.signer_profile_id is not null
        and s.signed_at is not null
        and s.auth_method='password_reauth'
        and s.reauthenticated_at is not null
        and s.evidence_version>=4
  ) into _director_signature_valid;
  if not _director_signature_valid then
    raise exception 'A assinatura eletrônica verificável da Diretoria é obrigatória para concluir o Habite-se.';
  end if;

  -- Confirma a guia municipal desta modalidade. Guias vinculadas ao banco
  -- exigem liquidação acreditada, produção e PDF original arquivado;
  -- códigos de sandbox/QA nunca valem como arrecadação real.
  select exists(
    select 1 from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='habite_se'
      and g.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
      and g.paid=true
      and lower(coalesce(g.status,'')) in ('compensada','confirmed','paid')
      and (
        (coalesce(g.payment_provider,'') in ('','manual','municipal_system')
          and coalesce(g.provider_environment,'') not in ('qa','test','sandbox','hml'))
        or
        (lower(coalesce(g.provider_environment,'')) in ('production','prod','live')
          and nullif(btrim(coalesce(g.bank_reference,'')),'') is not null
          and nullif(btrim(coalesce(g.bank_payment_id,'')),'') is not null
          and lower(coalesce(g.bank_status,''))='processed'
          and lower(coalesce(g.bank_status_detail,''))='accredited'
          and g.bank_authenticated_at is not null
          and nullif(btrim(coalesce(g.original_pdf_key,'')),'') is not null
          and coalesce(g.original_pdf_sha256,'') ~ '^[0-9a-f]{64}$')
      )
  ) into _habite_guide_valid;
  if not _habite_guide_valid then
    raise exception 'Conclusão bloqueada: guia de Habite-se sem confirmação financeira válida ou, no banco, sem comprovante e PDF original arquivado.';
  end if;

  _role := lower(coalesce(public.current_role_code(),_profile.role,''));
  if _role in ('prefeitura_admin','admin_prefeitura','admin_municipality') then
    raise exception 'Administrador da Prefeitura possui somente consulta dos processos; a conclusão compete ao setor técnico ou à Diretoria.';
  end if;

  select coalesce(
      nullif(btrim(tm.position_title),''),
      nullif(btrim(tm.profile_label),''),
      nullif(btrim(r.label),'')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id=tm.role_id
  where tm.profile_id=_profile.id
    and tm.tenant_id=_process.tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  _authorized :=
    public.can_manage_habite_se_permit_v1(_process_id)
    or _role in ('master_admin','master_ops')
    or public._municipal_urbanism_authority_title_v1(_profile.id,coalesce(_process.municipality_id,_process.tenant_id),'diretoria') IS NOT NULL;

  if not _authorized then
    raise exception 'Somente o Analista responsável, a Diretoria ou a Administração pode concluir este processo.';
  end if;

  if _process.status='arquivado'::public.process_status then
    return jsonb_build_object(
      'ok',true,
      'already_completed',true,
      'process_id',_process.id,
      'status',_process.status::text
    );
  end if;

  update public.processes
     set status='arquivado'::public.process_status,
         current_department='Processo concluído',
         current_queue='Habite-se concluído e arquivado',
         sla_stage='Concluído',
         process_checkpoint='Processo de Habite-se concluído administrativamente',
         archived_at=coalesce(archived_at,clock_timestamp()),
         sla_breached=false,
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id,created_at
  )
  values(
    _process.tenant_id,_process.id,_profile.user_id,_profile.id,
    'habite_se_completed',
    _process.status,
    'arquivado'::public.process_status,
    'Processo de Habite-se concluído administrativamente após emissão e assinatura válida da Diretoria.',
    true,
    coalesce(_process.municipality_id,_process.tenant_id),
    clock_timestamp()
  );

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,
    coalesce(_process.municipality_id,_process.tenant_id),
    _process.id,
    _profile.user_id,
    _profile.id,
    'habite_se',
    'Processo de Habite-se concluído',
    'Conclusão administrativa registrada por '||coalesce(_profile.full_name,_profile.email,'usuário autorizado')||'.',
    true,
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok',true,
    'already_completed',false,
    'process_id',_process.id,
    'status','arquivado'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_municipal_authority_capabilities_v1(_process_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor uuid:=public.current_profile_id(); municipality uuid;
BEGIN
 IF actor IS NULL OR NOT public.has_process_access(_process_id) THEN RETURN jsonb_build_object('director',false,'secretary',false,'supervision',false); END IF;
 SELECT coalesce(p.municipality_id,p.tenant_id) INTO municipality FROM public.processes p WHERE p.id=_process_id;
 RETURN jsonb_build_object('director',public._municipal_urbanism_authority_title_v1(actor,municipality,'diretoria') IS NOT NULL,'secretary',public._municipal_urbanism_authority_title_v1(actor,municipality,'secretaria') IS NOT NULL,'supervision',public.can_supervise_process_analysis(_process_id));
END $$;

REVOKE ALL ON FUNCTION public.get_current_municipal_authority_capabilities_v1(uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.get_current_municipal_authority_capabilities_v1(uuid) TO authenticated;
