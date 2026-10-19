-- SIGAPRO — Habite-se: sincronização automática e leitura coerente após assinatura da Diretoria.
-- Corrige quatro pontos:
-- 1) Habite-se não exige guia de aprovação final; exige a guia de Habite-se compensada.
-- 2) Encaminhamento à Diretoria não depende de assinatura técnica do Analista.
-- 3) A assinatura da Diretoria atualiza imediatamente o Alvará e o processo no banco.
-- 4) Solicitações antigas pendentes da Diretoria são encerradas quando a assinatura válida existe.

create or replace function public.guard_process_financial_transition()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _settings jsonb := '{}'::jsonb;
  _final_fee_enabled boolean := true;
  _has_pending_guide boolean := false;
  _protocol_paid boolean := false;
  _final_paid boolean := false;
  _habite_se_paid boolean := false;
  _has_open_requirements boolean := false;
  _is_habite_se boolean := false;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  _is_habite_se :=
    lower(coalesce(new.process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)';

  select coalesce(ms.general_settings,'{}'::jsonb)
    into _settings
  from public.municipality_settings ms
  where ms.municipality_id=coalesce(new.municipality_id,new.tenant_id)
  limit 1;

  _settings := coalesce(_settings,'{}'::jsonb);
  _final_fee_enabled := coalesce((_settings->>'final_approval_fee_enabled')::boolean,true);

  select exists(
    select 1 from public.payment_guides g
    where g.process_id=new.id
      and coalesce(g.paid,false)=false
      and coalesce(g.status,'pendente') not in ('compensada','confirmed','paid')
  ) into _has_pending_guide;

  select exists(
    select 1 from public.payment_guides g
    where g.process_id=new.id
      and g.guide_kind='protocolo'
      and (coalesce(g.paid,false)=true or coalesce(g.status,'') in ('compensada','confirmed','paid'))
  ) into _protocol_paid;

  select exists(
    select 1 from public.payment_guides g
    where g.process_id=new.id
      and g.guide_kind='aprovacao_final'
      and (coalesce(g.paid,false)=true or coalesce(g.status,'') in ('compensada','confirmed','paid'))
  ) into _final_paid;

  select exists(
    select 1 from public.payment_guides g
    where g.process_id=new.id
      and g.guide_kind='habite_se'
      and (coalesce(g.paid,false)=true or coalesce(g.status,'') in ('compensada','confirmed','paid'))
  ) into _habite_se_paid;

  select exists(
    select 1 from public.process_requirements r
    where r.process_id=new.id and r.status in ('aberta','respondida')
  ) into _has_open_requirements;

  if new.status='pagamento_pendente'::public.process_status and not _has_pending_guide then
    raise exception 'Processo nao pode entrar em pagamento pendente sem guia pendente';
  end if;

  if new.status='analise_tecnica'::public.process_status and not _protocol_paid then
    raise exception 'Analise tecnica exige guia de protocolo compensada';
  end if;

  if new.status='deferido'::public.process_status then
    if coalesce(new.is_on_hold,false) then
      raise exception 'Processo sobrestado nao pode ser deferido';
    end if;
    if _has_open_requirements then
      raise exception 'Processo com exigencia aberta ou respondida nao pode ser deferido';
    end if;

    if _is_habite_se then
      if not _habite_se_paid then
        raise exception 'Deferimento do Habite-se exige a guia de Habite-se compensada';
      end if;
    elsif _final_fee_enabled and not _final_paid then
      raise exception 'Deferimento exige guia final de aprovacao compensada';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.set_habite_se_permit_awaiting_director_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _profile public.profiles%rowtype;
begin
  if not public.can_manage_habite_se_permit_v1(_process_id) then
    raise exception 'Somente o Analista responsável pode encaminhar o Alvará de Habite-se à Diretoria.';
  end if;

  select * into _process from public.processes where id=_process_id for update;
  select * into _permit from public.process_habite_se_permits where process_id=_process_id for update;
  select * into _profile from public.profiles where id=public.current_profile_id();

  if _permit.id is null then
    raise exception 'Salve o Alvará de Habite-se antes de solicitar assinatura.';
  end if;
  if _permit.status='emitido' then
    raise exception 'O Alvará de Habite-se já foi emitido.';
  end if;

  update public.process_habite_se_permits
     set status='aguardando_diretor',
         director_requested_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where id=_permit.id
   returning * into _permit;

  update public.processes
     set status='despacho_intersetorial'::public.process_status,
         current_department='Diretoria',
         current_queue='Assinatura da Diretoria — Alvará de Habite-se',
         sla_stage='Assinatura da Diretoria — Alvará de Habite-se',
         process_checkpoint='Alvará de Habite-se encaminhado — aguardando assinatura da Diretoria',
         updated_at=clock_timestamp()
   where id=_process_id;

  update public.process_signature_requests
     set status='stale'
   where process_id=_process_id
     and artifact_key='habite-se-permit'
     and signer_slot='diretoria'
     and status='pending';

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _profile.user_id,_profile.id,'habite_se',
    'Alvará de Habite-se encaminhado à Diretoria',
    'Documento '||_permit.permit_number||' encaminhado para assinatura eletrônica conclusiva da Diretoria.',
    true,clock_timestamp()
  );

  return jsonb_build_object('permit',to_jsonb(_permit));
end;
$function$;

create or replace function public.finalize_habite_se_permit_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
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
  _from_status := _process.status;

  select * into _permit from public.process_habite_se_permits where process_id=_process_id for update;
  if _permit.id is null then raise exception 'Alvará de Habite-se não encontrado.'; end if;

  select b.* into _block
  from public.signature_blocks b
  where b.process_id=_process_id
    and b.document_id is null
    and b.artifact_type='habite_se_permit'
    and b.artifact_key='habite-se-permit'
    and b.status='concluido'
    and exists(
      select 1 from public.signatures s
      where s.signature_block_id=b.id
        and s.signer_slot='diretoria'
        and s.status='concluido'
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
  order by s.signed_at desc
  limit 1;

  if _permit.status <> 'emitido' then
    update public.process_habite_se_permits
       set status='emitido',
           director_profile_id=_director.signer_profile_id,
           director_user_id=_director.signer_user_id,
           director_name=_director.signer_name,
           issued_at=coalesce(_director.signed_at,clock_timestamp()),
           updated_at=clock_timestamp()
     where id=_permit.id
     returning * into _permit;
  end if;

  update public.process_signature_requests
     set status='completed',
         completed_at=coalesce(_director.signed_at,clock_timestamp()),
         completed_by_profile_id=_director.signer_profile_id
   where process_id=_process_id
     and artifact_key='habite-se-permit'
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

  return jsonb_build_object(
    'permit',to_jsonb(_permit),
    'verification_code',_block.verification_code,
    'already_finalized',_permit.status='emitido'
  );
end;
$function$;

create or replace function private.sync_habite_se_after_director_signature()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $function$
declare
  _block public.signature_blocks%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _process public.processes%rowtype;
  _from_status public.process_status;
begin
  if new.status <> 'concluido' or lower(coalesce(new.signer_slot,'')) <> 'diretoria' then
    return new;
  end if;

  select * into _block from public.signature_blocks where id=new.signature_block_id;
  if _block.id is null
     or _block.artifact_type <> 'habite_se_permit'
     or _block.artifact_key <> 'habite-se-permit' then
    return new;
  end if;

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_block.process_id
  for update;
  if _permit.id is null then return new; end if;

  select * into _process from public.processes where id=_block.process_id for update;
  _from_status := _process.status;

  update public.process_habite_se_permits
     set status='emitido',
         director_profile_id=new.signer_profile_id,
         director_user_id=new.signer_user_id,
         director_name=new.signer_name,
         issued_at=coalesce(new.signed_at,clock_timestamp()),
         updated_at=clock_timestamp()
   where id=_permit.id;

  update public.process_signature_requests
     set status='completed',
         completed_at=coalesce(new.signed_at,clock_timestamp()),
         completed_by_profile_id=new.signer_profile_id
   where process_id=_block.process_id
     and artifact_key='habite-se-permit'
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
   where id=_block.process_id
     and status <> 'arquivado'::public.process_status;

  if _from_status is distinct from 'deferido'::public.process_status
     and _from_status is distinct from 'arquivado'::public.process_status then
    insert into public.process_movements(
      tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
      from_status,to_status,description,visible_to_external,municipality_id,created_at
    )
    values(
      _process.tenant_id,_block.process_id,new.signer_user_id,new.signer_profile_id,
      'habite_se_permit_issued',_from_status,'deferido'::public.process_status,
      'Alvará de Habite-se '||_permit.permit_number||' assinado pela Diretoria e emitido.',
      true,coalesce(_process.municipality_id,_process.tenant_id),clock_timestamp()
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_habite_se_after_director_signature on public.signatures;

create trigger trg_sync_habite_se_after_director_signature
after insert on public.signatures
for each row
execute function private.sync_habite_se_after_director_signature();

update public.process_signature_requests r
   set status='completed',
       completed_at=coalesce(s.signed_at,clock_timestamp()),
       completed_by_profile_id=s.signer_profile_id
from public.signature_blocks b
join public.signatures s
  on s.signature_block_id=b.id
 and s.signer_slot='diretoria'
 and s.status='concluido'
where r.process_id=b.process_id
  and r.artifact_key='habite-se-permit'
  and r.signer_slot='diretoria'
  and r.status='pending'
  and b.artifact_type='habite_se_permit'
  and b.artifact_key='habite-se-permit';

notify pgrst, 'reload schema';
