-- Use only the uniquely identified, completed director issuance for already-issued Habite-se documents.
CREATE OR REPLACE FUNCTION private.issued_habite_se_signature_block_v1(_process_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
 SELECT CASE WHEN count(DISTINCT b.id)=1 THEN min(b.id::text)::uuid ELSE NULL::uuid END
 FROM public.process_habite_se_permits h
 JOIN public.processes p ON p.id=h.process_id
 JOIN public.signature_blocks b ON b.process_id=p.id AND b.document_id IS NULL
 JOIN public.signatures s ON s.signature_block_id=b.id
 WHERE h.process_id=_process_id AND h.status='emitido'
   AND h.tenant_id=p.tenant_id AND h.municipality_id=coalesce(p.municipality_id,p.tenant_id)
   AND b.tenant_id=p.tenant_id AND b.municipality_id=h.municipality_id
   AND b.artifact_type='habite_se_permit' AND b.artifact_key='habite-se-permit'
   AND b.status='concluido' AND b.evidence_version>=4
   AND b.evidence_hash ~ '^[a-f0-9]{64}$' AND nullif(btrim(b.verification_code),'') IS NOT NULL
   AND b.artifact_payload->>'permitNumber'=h.permit_number
   AND jsonb_typeof(b.artifact_payload->'formData')='object'
   AND s.tenant_id=b.tenant_id AND s.municipality_id=b.municipality_id
   AND s.signer_slot='diretoria' AND s.status='concluido'
   AND s.signer_profile_id=h.director_profile_id AND s.signed_at=h.issued_at
   AND s.document_hash=b.evidence_hash AND s.auth_method='password_reauth'
   AND s.reauthenticated_at IS NOT NULL AND s.evidence_version>=4;
$function$;

REVOKE ALL ON FUNCTION private.issued_habite_se_signature_block_v1(uuid) FROM PUBLIC,authenticated,anonymous;
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
  _issued_block uuid;
  _signed_form jsonb;
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
  _issued_block := private.issued_habite_se_signature_block_v1(_process_id);
  _director_signature_valid := _issued_block IS NOT NULL;
  SELECT b.artifact_payload->'formData' INTO _signed_form FROM public.signature_blocks b WHERE b.id=_issued_block;
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

  -- The signed issuance, not mutable historical draft fields, is authoritative.
  -- Record the discrepancy without rewriting a signed artifact or draft.
  IF _signed_form IS DISTINCT FROM _permit.form_data THEN
    INSERT INTO public.process_audit_entries(tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,category,title,detail,visible_to_external,created_at)
    VALUES(_process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,_profile.user_id,_profile.id,'habite_se',
     'Versão assinada do Habite-se preservada',
     'Conclusão vinculada à versão emitida pela Diretoria, identificada pelo signatário e instante de emissão. Rascunho histórico divergente preservado; nenhum conteúdo assinado foi alterado.',false,clock_timestamp());
  END IF;
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

CREATE OR REPLACE FUNCTION public.finalize_habite_se_permit_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _block public.signature_blocks%rowtype;
  _director public.signatures%rowtype;
  _from_status public.process_status;
begin
  select * into _process from public.processes where id=_process_id for update;
  if _process.id is null or not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;
  IF lower(coalesce(_process.process_type,'')) NOT LIKE '%habite%' THEN
    RAISE EXCEPTION 'Este documento é exclusivo do Habite-se.';
  END IF;
  IF lower(coalesce(public.current_role_code(),'')) IN ('prefeitura_admin','admin_prefeitura','admin_municipality') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='A administração municipal possui acesso somente para consulta.';
  END IF;
  PERFORM public.get_process_artifact_signature_context_v1(_process_id,'diretoria');
  _from_status := _process.status;

  select * into _permit from public.process_habite_se_permits where process_id=_process_id for update;
  if _permit.id is null then raise exception 'Alvará de Habite-se não encontrado.'; end if;

  if _permit.status='emitido' then
    SELECT b.* INTO _block FROM public.signature_blocks b
    WHERE b.id=private.issued_habite_se_signature_block_v1(_process_id);
    IF _block.id IS NULL THEN
      RAISE EXCEPTION 'Alvará histórico sem comprovação verificável da Diretoria.';
    END IF;
    return jsonb_build_object('permit',jsonb_set(to_jsonb(_permit),'{form_data}',_block.artifact_payload->'formData',true),'verification_code',_block.verification_code,'already_finalized',true);
  end if;

  if _permit.status<>'aguardando_diretor' then
    raise exception 'O Alvará ainda não está na etapa de assinatura da Diretoria.';
  end if;

  select b.* into _block
  from public.signature_blocks b
  where b.process_id=_process_id
    and b.document_id is null
    and b.artifact_type='habite_se_permit'
    and b.artifact_key='habite-se-permit'
    and b.status='concluido'
    and b.tenant_id=_process.tenant_id
    and b.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and b.evidence_hash ~ '^[a-f0-9]{64}$'
    and b.evidence_version>=4
    and nullif(btrim(b.verification_code),'') is not null
    and b.artifact_payload->>'permitNumber'=_permit.permit_number
    and b.artifact_payload->'formData'=_permit.form_data
    and b.artifact_payload->>'permitNumber'=_permit.permit_number
    and coalesce(b.artifact_payload->'formData','{}'::jsonb)=coalesce(_permit.form_data,'{}'::jsonb)
    and exists(
      select 1 from public.signatures s
      where s.signature_block_id=b.id
        and s.signer_slot='diretoria'
        and s.status='concluido'
        and s.tenant_id=b.tenant_id
        and s.municipality_id=b.municipality_id
        and s.document_hash=b.evidence_hash
        and s.signer_profile_id is not null
        and s.signed_at is not null
        and s.auth_method='password_reauth'
        and s.reauthenticated_at is not null
        and s.evidence_version>=4
    )
  order by b.artifact_version desc
  limit 1;

  if _block.id is null then
    raise exception 'A assinatura eletrônica da Diretoria ainda não foi confirmada.';
  end if;

  select * into _director
  from public.signatures s
  where s.signature_block_id=_block.id
    and s.signer_slot='diretoria'
    and s.status='concluido'
    and s.tenant_id=_block.tenant_id
        and s.municipality_id=_block.municipality_id
        and s.document_hash=_block.evidence_hash
        and s.signer_profile_id is not null
        and s.signed_at is not null
        and s.auth_method='password_reauth'
        and s.reauthenticated_at is not null
        and s.evidence_version>=4
  order by s.signed_at desc
  limit 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_guides g
    WHERE g.process_id=_process_id AND g.guide_kind='habite_se'
      AND g.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
      AND g.paid IS TRUE AND lower(coalesce(g.status,'')) IN ('compensada','confirmed','paid')
      AND ((coalesce(g.payment_provider,'') IN ('','manual','municipal_system')
        AND lower(coalesce(g.provider_environment,'')) NOT IN ('qa','test','sandbox','hml'))
      OR (lower(coalesce(g.provider_environment,'')) IN ('production','prod','live')
        AND nullif(btrim(coalesce(g.bank_reference,'')),'') IS NOT NULL
        AND nullif(btrim(coalesce(g.bank_payment_id,'')),'') IS NOT NULL
        AND lower(coalesce(g.bank_status,''))='processed'
        AND lower(coalesce(g.bank_status_detail,''))='accredited'
        AND g.bank_authenticated_at IS NOT NULL
        AND nullif(btrim(coalesce(g.original_pdf_key,'')),'') IS NOT NULL
        AND coalesce(g.original_pdf_sha256,'') ~ '^[0-9a-f]{64}$'))
  ) THEN
    RAISE EXCEPTION 'Emissão bloqueada: guia de Habite-se sem confirmação financeira válida.';
  END IF;

  update public.process_habite_se_permits
     set status='emitido',
         director_profile_id=_director.signer_profile_id,
         director_user_id=_director.signer_user_id,
         director_name=_director.signer_name,
         issued_at=coalesce(_director.signed_at,clock_timestamp()),
         updated_at=clock_timestamp()
   where id=_permit.id
   returning * into _permit;

  update public.process_signature_requests
     set status='completed',
         completed_at=coalesce(_director.signed_at,clock_timestamp()),
         completed_by_profile_id=_director.signer_profile_id
   where process_id=_process_id
     and artifact_key='habite-se-permit'
     and artifact_hash=_block.evidence_hash
     and signer_slot='diretoria'
     and status='pending';

  update public.processes
     set status='deferido'::public.process_status,
         current_department='Diretoria',
         current_queue='Alvará de Habite-se emitido',
         sla_stage='Decisão / emissão concluída',
         process_checkpoint='Alvará de Habite-se emitido e assinado pela Diretoria',
         sla_breached=false,
         updated_at=clock_timestamp()
   where id=_process_id
     and status <> 'arquivado'::public.process_status;

  if _from_status is distinct from 'deferido'::public.process_status
     and _from_status is distinct from 'arquivado'::public.process_status then
    insert into public.process_movements(
      tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
      from_status,to_status,description,visible_to_external,municipality_id,created_at
    )
    values(
      _process.tenant_id,_process_id,_director.signer_user_id,_director.signer_profile_id,
      'habite_se_permit_issued',_from_status,'deferido'::public.process_status,
      'Alvará de Habite-se '||_permit.permit_number||' assinado pela Diretoria e emitido.',
      true,coalesce(_process.municipality_id,_process.tenant_id),clock_timestamp()
    );

    insert into public.process_audit_entries(
      tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,created_at
    )
    values(
      _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
      _director.signer_user_id,_director.signer_profile_id,'habite_se',
      'Alvará de Habite-se emitido',
      'Documento '||_permit.permit_number||' assinado eletronicamente pela Diretoria. Código de verificação '||
        coalesce(_block.verification_code,'')||'.',
      true,clock_timestamp()
    );
  end if;

  return jsonb_build_object('permit',to_jsonb(_permit),'verification_code',_block.verification_code,'already_finalized',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_habite_se_permit_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET row_security TO 'off'
AS $function$
declare
  _permit public.process_habite_se_permits%rowtype;
  _defaults jsonb;
  _permit_json jsonb;
  _signed_form jsonb;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _defaults := private.habite_se_permit_defaults_v1(_process_id);

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  limit 1;

  if _permit.id is not null then
    -- Após a assinatura conclusiva, NÃO reconstruir o Alvará com os
    -- parâmetros mutáveis da Prefeitura. A versão assinada é a fonte
    -- autoritativa de conteúdo, observações e numeração.
    if _permit.status='emitido' then
      SELECT b.artifact_payload->'formData' INTO _signed_form
      FROM public.signature_blocks b WHERE b.id=private.issued_habite_se_signature_block_v1(_process_id);
      if _signed_form is null then
        raise exception 'Alvará emitido sem cópia assinada e verificável. A impressão está bloqueada para preservar a integridade documental.';
      end if;
      _permit_json := jsonb_set(to_jsonb(_permit),'{form_data}',_signed_form,true);
    else
      _permit_json := jsonb_set(
        to_jsonb(_permit),'{form_data}',
        private.merge_habite_se_permit_form_v1(
          _defaults,coalesce(_permit.form_data,'{}'::jsonb)
        ),true);
    end if;
  end if;

  return jsonb_build_object(
    'permit',case when _permit.id is null then null else _permit_json end,
    'defaults',_defaults,
    'can_manage',public.can_manage_habite_se_permit_v1(_process_id)
  );
end;
$function$;
