-- SIGAPRO — canonical signed Habite-se and atomic administrative closure.
-- Preserves previous issued records. No seed/test data, no production mutation.
-- Grants of both existing SECURITY DEFINER RPCs are preserved by CREATE OR REPLACE.
BEGIN;

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
      select b.artifact_payload->'formData' into _signed_form
      from public.signature_blocks b
      join public.signatures s on s.signature_block_id=b.id
        and s.signer_slot='diretoria' and s.status='concluido'
      where b.process_id=_process_id
        and b.document_id is null
        and b.artifact_type='habite_se_permit'
        and b.artifact_key='habite-se-permit'
        and b.artifact_payload->>'permitNumber'=_permit.permit_number
        and jsonb_typeof(b.artifact_payload->'formData')='object'
        and b.status='concluido'
        and nullif(btrim(b.verification_code),'') is not null
      order by b.artifact_version desc,b.completed_at desc nulls last
      limit 1;
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
$function$
;

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
      and nullif(btrim(b.verification_code),'') is not null
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
    or _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','diretor','director','prefeitura_diretor','prefeitura_diretora')
    or lower(coalesce(_position,'')) ~ '(diretor|diretora)';

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
$function$
;

COMMIT;
