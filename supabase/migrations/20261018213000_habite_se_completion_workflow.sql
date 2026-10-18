-- SIGAPRO — workflow final do Habite-se.
-- Vistoria -> Financeiro -> envio ao profissional -> pagamento -> Analista ->
-- Alvará de Habite-se -> assinatura da Diretoria -> conclusão do processo.

begin;

create table if not exists public.process_habite_se_permits (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  permit_number text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando_diretor','emitido')),
  form_data jsonb not null default '{}'::jsonb,
  analyst_profile_id uuid,
  analyst_user_id uuid,
  analyst_name text,
  director_profile_id uuid,
  director_user_id uuid,
  director_name text,
  director_requested_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(process_id)
);

create index if not exists ix_process_habite_se_permits_process
  on public.process_habite_se_permits(process_id,status,updated_at desc);

revoke all on public.process_habite_se_permits from public;

create or replace function public.can_manage_habite_se_permit_v1(_process_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _profile_id uuid := public.current_profile_id();
  _role text := lower(coalesce(public.current_role_code(),''));
  _process public.processes%rowtype;
  _profile_municipality uuid;
begin
  if public.is_master() then return true; end if;
  if _profile_id is null or _role not in ('analista','analyst','prefeitura_supervisor') then
    return false;
  end if;

  select * into _process from public.processes where id=_process_id;
  if _process.id is null or not public.has_process_access(_process_id) then
    return false;
  end if;

  select municipality_id into _profile_municipality
  from public.profiles
  where id=_profile_id and deleted_at is null and account_status='active';

  if _profile_municipality is distinct from coalesce(_process.municipality_id,_process.tenant_id) then
    return false;
  end if;

  if _role in ('analista','analyst')
     and _process.analysis_assigned_to_profile_id is not null
     and _process.analysis_assigned_to_profile_id is distinct from _profile_id then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.get_habite_se_permit_v1(_process_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _permit public.process_habite_se_permits%rowtype;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  limit 1;

  return jsonb_build_object(
    'permit',case when _permit.id is null then null else to_jsonb(_permit) end,
    'can_manage',public.can_manage_habite_se_permit_v1(_process_id)
  );
end;
$$;

create or replace function public.save_habite_se_permit_v1(
  _process_id uuid,
  _form_data jsonb,
  _permit_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _number text;
  _protocol_digits text;
begin
  if not public.can_manage_habite_se_permit_v1(_process_id) then
    raise exception 'Somente o Analista responsável pode elaborar ou retificar o Alvará de Habite-se.';
  end if;

  select * into _process from public.processes where id=_process_id for update;
  if _process.id is null then raise exception 'Processo não encontrado.'; end if;
  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'Este documento é exclusivo de processo de Habite-se.';
  end if;

  if not exists(
    select 1 from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='habite_se'
      and (coalesce(g.paid,false)=true or g.status in ('compensada','paid','confirmed'))
  ) then
    raise exception 'O Alvará de Habite-se só pode ser elaborado após a confirmação do pagamento.';
  end if;

  select * into _profile from public.profiles where id=public.current_profile_id();
  _protocol_digits := regexp_replace(coalesce(_process.protocol_number,_process.id::text),'[^0-9]','','g');
  _number := nullif(btrim(coalesce(_permit_number,'')),'');
  if _number is null then
    _number := 'HAB-'||extract(year from current_date)::int::text||'-'||
      right(lpad(coalesce(nullif(_protocol_digits,''),'0'),5,'0'),5);
  end if;

  insert into public.process_habite_se_permits(
    tenant_id,municipality_id,process_id,permit_number,status,form_data,
    analyst_profile_id,analyst_user_id,analyst_name,updated_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
    _process.id,_number,'rascunho',coalesce(_form_data,'{}'::jsonb),
    _profile.id,_profile.user_id,
    coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Analista Técnico'),
    clock_timestamp()
  )
  on conflict(process_id)
  do update set
    permit_number=excluded.permit_number,
    status='rascunho',
    form_data=excluded.form_data,
    analyst_profile_id=excluded.analyst_profile_id,
    analyst_user_id=excluded.analyst_user_id,
    analyst_name=excluded.analyst_name,
    director_profile_id=null,
    director_user_id=null,
    director_name=null,
    director_requested_at=null,
    issued_at=null,
    updated_at=clock_timestamp()
  where public.process_habite_se_permits.status <> 'emitido'
  returning * into _permit;

  if _permit.id is null then
    raise exception 'O Alvará de Habite-se já foi emitido e não pode ser sobrescrito.';
  end if;

  update public.processes
     set status='analise_tecnica'::public.process_status,
         current_department='Análise Urbanística',
         current_queue='Emissão do Alvará de Habite-se',
         sla_stage='Elaboração do Alvará de Habite-se',
         process_checkpoint='Pagamento do Habite-se confirmado — elaboração do Alvará',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _profile.user_id,_profile.id,'habite_se',
    'Alvará de Habite-se salvo',
    'Rascunho '||_number||' salvo/retificado pelo Analista Técnico. Nova assinatura é exigida para qualquer conteúdo alterado.',
    false,clock_timestamp()
  );

  return jsonb_build_object('permit',to_jsonb(_permit),'can_manage',true);
end;
$$;

create or replace function public.set_habite_se_permit_awaiting_director_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _profile public.profiles%rowtype;
  _block_id uuid;
begin
  if not public.can_manage_habite_se_permit_v1(_process_id) then
    raise exception 'Somente o Analista responsável pode encaminhar o Alvará de Habite-se à Diretoria.';
  end if;

  select * into _process from public.processes where id=_process_id for update;
  select * into _permit from public.process_habite_se_permits where process_id=_process_id for update;
  select * into _profile from public.profiles where id=public.current_profile_id();

  if _permit.id is null then raise exception 'Salve o Alvará de Habite-se antes de solicitar assinatura.'; end if;
  if _permit.status='emitido' then raise exception 'O Alvará de Habite-se já foi emitido.'; end if;

  select b.id into _block_id
  from public.signature_blocks b
  where b.process_id=_process_id
    and b.document_id is null
    and b.artifact_type='habite_se_permit'
    and b.artifact_key='habite-se-permit'
    and b.status='concluido'
    and exists(
      select 1 from public.signatures s
      where s.signature_block_id=b.id
        and s.signer_slot='analise_tecnica'
        and s.status='concluido'
    )
  order by b.artifact_version desc
  limit 1;

  if _block_id is null then
    raise exception 'O Analista Técnico precisa assinar eletronicamente a versão atual antes do envio à Diretoria.';
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
         process_checkpoint='Alvará de Habite-se assinado pelo Analista — aguardando Diretoria',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _profile.user_id,_profile.id,'habite_se',
    'Alvará de Habite-se encaminhado à Diretoria',
    'Documento '||_permit.permit_number||' assinado pelo Analista Técnico e encaminhado para assinatura final da Diretoria.',
    true,clock_timestamp()
  );

  return jsonb_build_object('permit',to_jsonb(_permit),'signature_block_id',_block_id);
end;
$$;

create or replace function public.finalize_habite_se_permit_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
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

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  for update;

  if _permit.id is null then raise exception 'Alvará de Habite-se não encontrado.'; end if;
  if _permit.status='emitido' then
    return jsonb_build_object('permit',to_jsonb(_permit),'already_finalized',true);
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
    and exists(
      select 1 from public.signatures s
      where s.signature_block_id=b.id
        and s.signer_slot='analise_tecnica'
        and s.status='concluido'
    )
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

  update public.process_habite_se_permits
     set status='emitido',
         director_profile_id=_director.signer_profile_id,
         director_user_id=_director.signer_user_id,
         director_name=_director.signer_name,
         issued_at=coalesce(_director.signed_at,clock_timestamp()),
         updated_at=clock_timestamp()
   where id=_permit.id
   returning * into _permit;

  update public.processes
     set status='deferido'::public.process_status,
         current_department='Processo concluído',
         current_queue='Alvará de Habite-se emitido',
         sla_stage='Habite-se concluído',
         process_checkpoint='Alvará de Habite-se emitido e assinado pela Diretoria',
         sla_breached=false,
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id,created_at
  )
  values(
    _process.tenant_id,_process_id,_director.signer_user_id,_director.signer_profile_id,
    'habite_se_permit_issued',_from_status,'deferido'::public.process_status,
    'Alvará de Habite-se '||_permit.permit_number||' assinado pela Diretoria e processo finalizado.',
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
      coalesce(_block.verification_code,'')||'. Processo concluído.',
    true,clock_timestamp()
  );

  return jsonb_build_object(
    'permit',to_jsonb(_permit),
    'verification_code',_block.verification_code,
    'already_finalized',false
  );
end;
$$;

create or replace function public.share_habite_se_payment_guide_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role text := lower(coalesce(public.current_role_code(),''));
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _guide public.payment_guides%rowtype;
  _professional_name text;
  _message public.process_messages%rowtype;
begin
  if _profile_id is null then raise exception 'Usuário não autenticado ou sem perfil.'; end if;
  if not (public.is_master() or _role in ('financeiro','financial')) then
    raise exception 'Somente o Setor Financeiro pode enviar a Guia de Habite-se ao profissional.';
  end if;

  select * into _process from public.processes where id=_process_id;
  if _process.id is null or not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _guide
  from public.payment_guides
  where process_id=_process_id and guide_kind='habite_se'
  order by created_at desc
  limit 1;

  if _guide.id is null then raise exception 'Guia de Habite-se não encontrada.'; end if;

  if exists(
    select 1 from public.process_messages m
    where m.process_id=_process_id
      and m.audience in ('externo','misto')
      and position(coalesce(_guide.guide_number,'') in coalesce(m.message,'')) > 0
  ) then
    return jsonb_build_object(
      'process_id',_process_id,'already_shared',true,'guide_number',_guide.guide_number
    );
  end if;

  select pp.display_name into _professional_name
  from public.process_parties pp
  where pp.process_id=_process_id and pp.party_type='profissional_externo'
  order by pp.created_at
  limit 1;

  if nullif(btrim(coalesce(_professional_name,'')),'') is null then
    select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''))
      into _professional_name
    from public.profiles p
    where p.id=nullif(to_jsonb(_process)->>'professional_profile_id','')::uuid
    limit 1;
  end if;

  if nullif(btrim(coalesce(_professional_name,'')),'') is null then
    raise exception 'O processo não possui profissional externo responsável identificado.';
  end if;

  select * into _profile from public.profiles where id=_profile_id;

  insert into public.process_messages(
    tenant_id,municipality_id,process_id,sender_user_id,sender_profile_id,
    sender_name,sender_role,audience,recipient_name,message,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _legacy_user_id,_profile_id,
    coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Financeiro'),
    _role,'externo',btrim(_professional_name),
    'Guia de Habite-se enviada pelo Setor Financeiro: '||coalesce(_guide.guide_number,'')||
      ', valor R$ '||to_char(_guide.amount,'FM999999990D00')||
      ', vencimento '||to_char(_guide.due_date,'DD/MM/YYYY')||'.',
    clock_timestamp()
  )
  returning * into _message;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _legacy_user_id,_profile_id,'financeiro',
    'Guia de Habite-se enviada ao profissional',
    'Guia '||coalesce(_guide.guide_number,'')||' enviada pelo Financeiro para '||btrim(_professional_name)||'.',
    true,clock_timestamp()
  );

  return jsonb_build_object(
    'process_id',_process_id,'already_shared',false,'guide_number',_guide.guide_number,'message',to_jsonb(_message)
  );
end;
$$;

-- A baixa do Habite-se só ocorre depois do envio formal ao profissional e
-- retorna o processo ao Analista para emissão do Alvará de Habite-se.
create or replace function public.confirm_process_payment_guide(_process_id uuid, _guide_kind text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _triage_status text;
  _to_status public.process_status;
  _guide public.payment_guides%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
  _audit_category text;
BEGIN
  IF _profile_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil'; END IF;
  IF _guide_kind NOT IN ('protocolo','iss_obra','aprovacao_final','habite_se') THEN
    RAISE EXCEPTION 'Tipo de guia invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status
    INTO _tenant_id,_municipality_id,_from_status,_triage_status
  FROM public.processes p WHERE p.id=_process_id FOR UPDATE;

  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'Processo nao encontrado'; END IF;
  IF NOT public.has_process_access(_process_id) THEN RAISE EXCEPTION 'Sem acesso ao processo'; END IF;

  IF _guide_kind='protocolo' THEN
    IF NOT (public.is_master() OR _role_code='prefeitura_admin' OR _role_code='setor_intersetorial') THEN
      RAISE EXCEPTION 'A baixa da guia inicial pertence ao Setor de Protocolo';
    END IF;
    _audit_category := 'protocolo';
  ELSE
    IF NOT (public.is_master() OR _role_code='prefeitura_admin' OR _role_code='financeiro' OR _role_code='fiscal') THEN
      RAISE EXCEPTION 'Esta baixa pertence ao Setor Financeiro';
    END IF;
    _audit_category := 'financeiro';
  END IF;

  SELECT pg.* INTO _guide
  FROM public.payment_guides pg
  WHERE pg.process_id=_process_id AND pg.guide_kind=_guide_kind
  ORDER BY pg.created_at desc LIMIT 1 FOR UPDATE;

  IF _guide.id IS NULL THEN RAISE EXCEPTION 'Guia nao encontrada para este processo'; END IF;

  IF coalesce(_guide.paid,false)=true OR coalesce(_guide.status,'') IN ('compensada','confirmed','paid') THEN
    RAISE EXCEPTION 'Guia ja esta paga';
  END IF;

  IF _guide_kind='habite_se' AND NOT EXISTS(
    SELECT 1 FROM public.process_messages m
    WHERE m.process_id=_process_id
      AND m.audience IN ('externo','misto')
      AND position(coalesce(_guide.guide_number,'') in coalesce(m.message,'')) > 0
  ) THEN
    RAISE EXCEPTION 'Envie a Guia de Habite-se ao profissional responsável antes de confirmar o pagamento.';
  END IF;

  _to_status := CASE _guide_kind
    WHEN 'protocolo' THEN 'triagem'::public.process_status
    WHEN 'iss_obra' THEN 'analise_tecnica'::public.process_status
    WHEN 'aprovacao_final' THEN 'deferido'::public.process_status
    WHEN 'habite_se' THEN 'analise_tecnica'::public.process_status
  END;

  UPDATE public.payment_guides
     SET paid=true,paid_at=now(),status='compensada'
   WHERE id=_guide.id
   RETURNING * INTO _guide;

  UPDATE public.processes
     SET status=_to_status,
         triage_status=CASE WHEN _guide_kind='protocolo' THEN 'recebido' ELSE triage_status END,
         current_department=CASE
           WHEN _guide_kind='protocolo' THEN 'Setor de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           WHEN _guide_kind='habite_se' THEN 'Análise Urbanística'
           ELSE 'Processo concluído'
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           WHEN _guide_kind='habite_se' THEN 'Emissão do Alvará de Habite-se'
           ELSE 'Concluído'
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem documental apos pagamento'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística após ISSQN'
           WHEN _guide_kind='habite_se' THEN 'Elaboração do Alvará de Habite-se'
           ELSE 'habite-se e aprovacao final'
         END,
         process_checkpoint=CASE
           WHEN _guide_kind='habite_se' THEN 'Pagamento do Habite-se confirmado — aguardando Alvará'
           ELSE process_checkpoint
         END,
         sla_breached=false,updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,from_status,to_status,
    description,created_at,visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'payment_confirmed',_from_status,_to_status,
    CASE
      WHEN _guide_kind='protocolo' THEN 'Pagamento inicial confirmado; pre-protocolo oficializado como processo municipal'
      WHEN _guide_kind='habite_se' THEN 'Pagamento do Habite-se confirmado; processo retornado ao Analista para emissão do Alvará de Habite-se'
      ELSE 'Pagamento confirmado pelo Setor Financeiro: '||_guide_kind
    END,
    now(),true,_municipality_id,_profile_id
  ) RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,_audit_category,
    CASE WHEN _guide_kind='protocolo' THEN 'Pagamento do protocolo confirmado' ELSE 'Pagamento confirmado' END,
    CASE WHEN _guide_kind='habite_se'
      THEN 'Guia de Habite-se '||coalesce(_guide.guide_number,'')||' compensada. Processo encaminhado à Análise Urbanística para emissão do Alvará de Habite-se.'
      ELSE 'Guia '||_guide_kind||' confirmada e compensada.'
    END,
    true,now(),_municipality_id,_profile_id
  ) RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,'guide',to_jsonb(_guide),
    'from_status',_from_status::text,'to_status',_to_status::text,
    'movement',to_jsonb(_movement),'audit',to_jsonb(_audit)
  );
END;
$function$;

-- Mantém o título institucional correto também na verificação pública.
create or replace function private.normalize_habite_se_signature_title_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
begin
  if new.artifact_type='habite_se_permit' and new.artifact_key='habite-se-permit' then
    new.title := 'Alvará de Habite-se';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_habite_se_signature_title_v1 on public.signature_blocks;
create trigger trg_normalize_habite_se_signature_title_v1
before insert or update on public.signature_blocks
for each row execute function private.normalize_habite_se_signature_title_v1();

revoke all on function public.can_manage_habite_se_permit_v1(uuid) from public;
revoke all on function public.get_habite_se_permit_v1(uuid) from public;
revoke all on function public.save_habite_se_permit_v1(uuid,jsonb,text) from public;
revoke all on function public.set_habite_se_permit_awaiting_director_v1(uuid) from public;
revoke all on function public.finalize_habite_se_permit_v1(uuid) from public;
revoke all on function public.share_habite_se_payment_guide_v1(uuid) from public;

grant execute on function public.can_manage_habite_se_permit_v1(uuid) to authenticated;
grant execute on function public.get_habite_se_permit_v1(uuid) to authenticated;
grant execute on function public.save_habite_se_permit_v1(uuid,jsonb,text) to authenticated;
grant execute on function public.set_habite_se_permit_awaiting_director_v1(uuid) to authenticated;
grant execute on function public.finalize_habite_se_permit_v1(uuid) to authenticated;
grant execute on function public.share_habite_se_payment_guide_v1(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
