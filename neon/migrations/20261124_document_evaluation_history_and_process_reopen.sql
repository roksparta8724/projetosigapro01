-- Reavaliação versionada por eventos imutáveis do histórico oficial.
-- Nenhum documento, guia ou alvará é excluído ou recriado.
BEGIN;
CREATE OR REPLACE FUNCTION public.reopen_process_document_analysis_v1(_document_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _process_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _previous_status text;
  _previous_reviewer text;
  _document_title text;
  _actor_name text;
  _doc public.process_documents%rowtype;
  _audit public.process_audit_entries%rowtype;
  _normalized_reason text := btrim(coalesce(_reason,''));
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if _normalized_reason = '' then
    raise exception 'Informe o motivo da reabertura da análise.';
  end if;

  select
    d.process_id,
    d.tenant_id,
    d.municipality_id,
    coalesce(d.review_status,'pendente'),
    d.reviewed_by,
    d.title
  into
    _process_id,
    _tenant_id,
    _municipality_id,
    _previous_status,
    _previous_reviewer,
    _document_title
  from public.process_documents d
  where d.id=_document_id
    and d.is_valid is true and d.invalidated_at is null
    and nullif(btrim(d.file_path),'') is not null
    and not (coalesce(d.source,'')='prefeitura' and d.title ~* '^Ficha Técnica( de Análise assinada| - assinada)')
  for update;

  if _process_id is null then
    raise exception 'Documento não encontrado.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if not public.can_write_process_analysis(_process_id)
     or not public.process_is_in_analysis_area(_process_id)
     or exists (select 1 from public.processes p where p.id=_process_id and p.status in ('deferido','indeferido','arquivado')) then
    raise exception 'Somente a equipe da Análise Urbanística pode reabrir esta análise.';
  end if;

  if _previous_status not in ('aprovado','rejeitado') then
    raise exception 'Este documento já está disponível para análise.';
  end if;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Servidor da Análise')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  update public.process_documents
     set review_status='pendente',
         reviewed_by=null,
         reviewed_by_profile_id=null
   where id=_document_id
   returning * into _doc;

  update public.processes
     set updated_at=clock_timestamp(),
         process_checkpoint='Documento reaberto para nova análise'
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    category,
    title,
    detail,
    visible_to_external,
    created_at,
    municipality_id
  )
  values(
    _tenant_id,
    _process_id,
    _legacy_user_id,
    _profile_id,
    'documento',
    'Análise documental reaberta',
    '[documento:'||_document_id::text||'] '||
      coalesce(_document_title,'Documento')||'. Decisão anterior: '||_previous_status||
      '. Autor anterior: '||coalesce(nullif(btrim(_previous_reviewer),''),'não identificado no registro histórico')||
      '. Reaberto por '||coalesce(_actor_name,'Servidor da Análise')||
      '. Motivo: '||_normalized_reason,
    true,
    clock_timestamp(),
    _municipality_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'document',to_jsonb(_doc),
    'previous_status',_previous_status,
    'reason',_normalized_reason,
    'audit',to_jsonb(_audit)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.review_process_document(_document_id uuid, _status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _process_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _doc public.process_documents%rowtype;
  _audit public.process_audit_entries%rowtype;
  _title text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _status not in ('aprovado','rejeitado') then
    raise exception 'Status de revisao invalido';
  end if;

  select d.process_id,d.tenant_id,d.municipality_id
    into _process_id,_tenant_id,_municipality_id
  from public.process_documents d
  where d.id=_document_id
    and d.is_valid is true and d.invalidated_at is null
    and nullif(btrim(d.file_path),'') is not null
    and not (coalesce(d.source,'')='prefeitura' and d.title ~* '^Ficha Técnica( de Análise assinada| - assinada)')
  for update;

  if _process_id is null then
    raise exception 'Documento nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not public.can_write_process_analysis(_process_id)
     or not public.process_is_in_analysis_area(_process_id)
     or exists (select 1 from public.processes p where p.id=_process_id and p.status in ('deferido','indeferido','arquivado')) then
    raise exception 'A avaliação exige processo na unidade de análise e perfil técnico autorizado.';
  end if;

  _title :=
    case when _status='aprovado'
      then 'Documento aprovado'
      else 'Documento rejeitado'
    end;

  update public.process_documents
     set review_status=_status,
         reviewed_by=coalesce(
           (select full_name from public.profiles where id=_profile_id),
           'Usuario'
         ),
         reviewed_by_profile_id=_profile_id
   where id=_document_id
   returning * into _doc;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'documento',_title,
    '[documento:'||_document_id::text||'] '||coalesce(_doc.title,'Documento')||
      '. Avaliação registrada: '||case when _status='aprovado' then 'aprovado' else 'rejeitado' end||'.',
    true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'document',to_jsonb(_doc),
    'audit',to_jsonb(_audit)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.reopen_process_for_review_v1(_process_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
  _profile uuid := public.current_profile_id();
  _role text := lower(coalesce(public.current_role_code(),''));
  _process public.processes%rowtype;
  _result jsonb;
BEGIN
  IF _profile IS NULL OR length(btrim(coalesce(_reason,''))) < 8 THEN
    RAISE EXCEPTION 'Informe uma justificativa de pelo menos oito caracteres.';
  END IF;
  SELECT * INTO _process FROM public.processes WHERE id=_process_id FOR UPDATE;
  IF _process.id IS NULL OR NOT public.has_process_access(_process_id)
     OR NOT public.can_write_process_analysis(_process_id)
     OR _role NOT IN ('analista','analyst','prefeitura_supervisor','master_admin','master_ops')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.account_status='active' AND p.deleted_at IS NULL)
     OR (NOT public.is_master() AND public.profile_operational_area(_profile) IS DISTINCT FROM 'analise') THEN
    RAISE EXCEPTION 'A reabertura exige a equipe técnica autorizada do município.';
  END IF;
  IF _process.status NOT IN ('deferido','indeferido','arquivado') THEN
    RAISE EXCEPTION 'Esta ação é destinada a processos concluídos. Utilize a tramitação ou a reavaliação documental na etapa atual.';
  END IF;
  -- Reutiliza a operação formal existente, com histórico, movimento e auditoria.
  -- Nunca recria documentos, pagamentos, assinaturas ou alvarás.
  _result := public.reopen_process(_process_id,btrim(_reason));
  UPDATE public.processes SET current_department='Análise Urbanística',
    current_queue='Análise Urbanística', sla_stage='Reapresentação',
    process_checkpoint='Reaberto para nova avaliação técnica'
    WHERE id=_process_id;
  RETURN _result;
END;
$function$;
REVOKE ALL ON FUNCTION public.reopen_process_for_review_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_process_for_review_v1(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
