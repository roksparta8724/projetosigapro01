-- Separate municipal responsibilities:
-- Administração/Protocolo = intake, triage, assisted protocol creation, initial guide confirmation.
-- Urbanismo = technical analysis.
-- Financeiro = ISSQN, final fees and financial reconciliation.

begin;

CREATE OR REPLACE FUNCTION public.set_process_triage(_process_id uuid, _triage_status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _process_status public.process_status;
  _previous_triage text;
  _actor_name text;
  _effective_status text := lower(trim(coalesce(_triage_status,'')));
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _effective_status NOT IN ('recebido','em_triagem','concluido') THEN
    RAISE EXCEPTION 'Status de triagem invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status
    INTO _tenant_id,_municipality_id,_process_status,_previous_triage
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF NOT (
    public.is_master()
    OR _role_code='prefeitura_admin'
    OR _role_code='setor_intersetorial'
  ) THEN
    RAISE EXCEPTION 'Somente o Setor de Protocolo pode executar a triagem';
  END IF;

  SELECT coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Funcionario do Protocolo')
    INTO _actor_name
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  UPDATE public.processes
     SET triage_status=_effective_status,
         triage_assigned_to=CASE
           WHEN _effective_status='recebido' THEN NULL
           ELSE _actor_name
         END,
         triage_notes=coalesce(nullif(trim(_notes),''),triage_notes),
         current_department=CASE
           WHEN _effective_status IN ('recebido','em_triagem') THEN 'Setor de Protocolo'
           ELSE current_department
         END,
         current_queue=CASE
           WHEN _effective_status='recebido' THEN 'Recepcao'
           WHEN _effective_status='em_triagem' THEN 'Triagem'
           ELSE current_queue
         END,
         sla_stage=CASE
           WHEN _effective_status='recebido' THEN 'Recepcao de Protocolo'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           WHEN _effective_status='concluido' AND _process_status='pagamento_pendente'::public.process_status
             THEN 'Aguardando pagamento do protocolo'
           ELSE sla_stage
         END,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'triage',
    _process_status,_process_status,
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada pelo Setor de Protocolo'
      WHEN 'concluido' THEN 'Triagem concluida pelo Setor de Protocolo'
      ELSE 'Processo devolvido para recepcao do Protocolo'
    END,
    now(),true,_municipality_id,_profile_id
  )
  RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'protocolo',
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada'
      WHEN 'concluido' THEN 'Triagem concluida'
      ELSE 'Triagem redefinida'
    END,
    coalesce(nullif(trim(_notes),''),
      CASE _effective_status
        WHEN 'em_triagem' THEN 'Conferencia documental iniciada pelo Protocolo.'
        WHEN 'concluido' THEN 'Conferencia documental concluida. O fluxo aguarda a baixa da guia inicial quando aplicavel.'
        ELSE 'Processo retornado para a recepcao.'
      END
    ),
    true,now(),_municipality_id,_profile_id
  )
  RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,
    'previous_triage_status',_previous_triage,
    'triage_status',_effective_status,
    'assigned_to',CASE WHEN _effective_status='recebido' THEN NULL ELSE _actor_name END,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
END;
$function$;

grant execute on function public.set_process_triage(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.confirm_process_payment_guide(_process_id uuid, _guide_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _guide_kind NOT IN ('protocolo','iss_obra','aprovacao_final') THEN
    RAISE EXCEPTION 'Tipo de guia invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status
    INTO _tenant_id,_municipality_id,_from_status,_triage_status
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF _guide_kind='protocolo' THEN
    IF _triage_status <> 'concluido' THEN
      RAISE EXCEPTION 'Conclua a triagem documental antes de confirmar a guia inicial';
    END IF;

    IF NOT (
      public.is_master()
      OR _role_code='prefeitura_admin'
      OR _role_code='setor_intersetorial'
    ) THEN
      RAISE EXCEPTION 'A baixa da guia inicial pertence ao Setor de Protocolo';
    END IF;
    _audit_category := 'protocolo';
  ELSE
    IF NOT (
      public.is_master()
      OR _role_code='prefeitura_admin'
      OR _role_code='financeiro'
      OR _role_code='fiscal'
    ) THEN
      RAISE EXCEPTION 'Esta baixa pertence ao Setor Financeiro';
    END IF;
    _audit_category := 'financeiro';
  END IF;

  SELECT pg.*
    INTO _guide
  FROM public.payment_guides pg
  WHERE pg.process_id=_process_id
    AND pg.guide_kind=_guide_kind
  LIMIT 1
  FOR UPDATE;

  IF _guide.id IS NULL THEN
    RAISE EXCEPTION 'Guia nao encontrada para este processo';
  END IF;

  IF coalesce(_guide.paid,false)=true
     OR coalesce(_guide.status,'') IN ('compensada','confirmed','paid') THEN
    RAISE EXCEPTION 'Guia ja esta paga';
  END IF;

  _to_status :=
    CASE _guide_kind
      WHEN 'protocolo' THEN 'analise_tecnica'::public.process_status
      WHEN 'iss_obra' THEN 'analise_tecnica'::public.process_status
      WHEN 'aprovacao_final' THEN 'deferido'::public.process_status
    END;

  UPDATE public.payment_guides
     SET paid=true,
         paid_at=now(),
         status='compensada'
   WHERE id=_guide.id
   RETURNING * INTO _guide;

  UPDATE public.processes
     SET status=_to_status,
         triage_status=CASE
           WHEN _guide_kind='protocolo' THEN 'concluido'
           ELSE triage_status
         END,
         current_department=CASE
           WHEN _guide_kind='protocolo' THEN 'Análise Urbanística'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           ELSE 'Processo concluído'
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN 'Análise Urbanística'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           ELSE 'Concluído'
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN 'Análise Urbanística'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística após ISSQN'
           ELSE 'habite-se e aprovacao final'
         END,
         sla_breached=false,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'payment_confirmed',
    _from_status,_to_status,
    CASE WHEN _guide_kind='protocolo'
      THEN 'Pagamento inicial confirmado pelo Setor de Protocolo'
      ELSE 'Pagamento confirmado pelo Setor Financeiro: '||_guide_kind
    END,
    now(),true,_municipality_id,_profile_id
  )
  RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,_audit_category,
    CASE WHEN _guide_kind='protocolo'
      THEN 'Pagamento do protocolo confirmado'
      ELSE 'Pagamento confirmado'
    END,
    'Guia '||_guide_kind||' confirmada e compensada.',
    true,now(),_municipality_id,_profile_id
  )
  RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'from_status',_from_status::text,
    'to_status',_to_status::text,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
END;
$function$;

-- Reconcile existing administrative assistant profiles to the protocol operational role.
with target_role as (
  select id from public.roles where code::text='setor_intersetorial' limit 1
),
source_rows as (
  select distinct on (tm.profile_id)
    tm.id as membership_id,
    tm.profile_id,
    tm.tenant_id,
    tm.department,
    tm.position_title,
    tm.profile_label,
    tm.level_name
  from public.tenant_memberships tm
  join public.profiles p on p.id=tm.profile_id
  where tm.is_active=true
    and tm.deleted_at is null
    and p.deleted_at is null
    and p.account_status='active'
    and lower(coalesce(tm.profile_label,'')) in (
      lower('Assistente Administrativo'),
      lower('Auxiliar Administrativo')
    )
  order by tm.profile_id,tm.updated_at desc nulls last
),
existing_target as (
  select tm.id,tm.profile_id,tm.tenant_id
  from public.tenant_memberships tm
  join target_role tr on tr.id=tm.role_id
  join source_rows sr
    on sr.profile_id=tm.profile_id
   and sr.tenant_id=tm.tenant_id
)
update public.tenant_memberships tm
set department=coalesce(sr.department,tm.department),
    position_title=coalesce(sr.position_title,tm.position_title),
    profile_label=coalesce(sr.profile_label,tm.profile_label),
    level_name=coalesce(sr.level_name,tm.level_name,'Nivel 1'),
    queue_name='Protocolo e Triagem',
    is_active=true,
    deleted_at=null,
    updated_at=now()
from existing_target et
join source_rows sr
  on sr.profile_id=et.profile_id
 and sr.tenant_id=et.tenant_id
where tm.id=et.id;

with target_role as (
  select id from public.roles where code::text='setor_intersetorial' limit 1
),
source_rows as (
  select distinct on (tm.profile_id)
    tm.id as membership_id,
    tm.profile_id,
    tm.tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id=tm.profile_id
  where tm.is_active=true
    and tm.deleted_at is null
    and p.deleted_at is null
    and p.account_status='active'
    and lower(coalesce(tm.profile_label,'')) in (
      lower('Assistente Administrativo'),
      lower('Auxiliar Administrativo')
    )
  order by tm.profile_id,tm.updated_at desc nulls last
),
existing_target as (
  select source.membership_id
  from source_rows source
  join public.tenant_memberships target
    on target.profile_id=source.profile_id
   and target.tenant_id=source.tenant_id
   and target.id<>source.membership_id
  join target_role tr on tr.id=target.role_id
)
update public.tenant_memberships tm
set is_active=false,
    deleted_at=coalesce(tm.deleted_at,now()),
    updated_at=now()
where tm.id in (select membership_id from existing_target);

with target_role as (
  select id from public.roles where code::text='setor_intersetorial' limit 1
),
source_rows as (
  select distinct on (tm.profile_id)
    tm.id as membership_id,
    tm.profile_id,
    tm.tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id=tm.profile_id
  where tm.is_active=true
    and tm.deleted_at is null
    and p.deleted_at is null
    and p.account_status='active'
    and lower(coalesce(tm.profile_label,'')) in (
      lower('Assistente Administrativo'),
      lower('Auxiliar Administrativo')
    )
  order by tm.profile_id,tm.updated_at desc nulls last
)
update public.tenant_memberships tm
set role_id=(select id from target_role),
    queue_name='Protocolo e Triagem',
    level_name=coalesce(tm.level_name,'Nivel 1'),
    updated_at=now()
from source_rows sr
where tm.id=sr.membership_id
  and not exists (
    select 1
    from public.tenant_memberships existing
    join target_role tr on tr.id=existing.role_id
    where existing.profile_id=sr.profile_id
      and existing.tenant_id=sr.tenant_id
      and existing.id<>sr.membership_id
  );

with candidates as (
  select distinct p.id
  from public.profiles p
  join public.tenant_memberships tm
    on tm.profile_id=p.id
   and tm.is_active=true
   and tm.deleted_at is null
  join public.roles r on r.id=tm.role_id
  where r.code::text='setor_intersetorial'
    and lower(coalesce(tm.profile_label,'')) in (
      lower('Assistente Administrativo'),
      lower('Auxiliar Administrativo')
    )
)
update public.profiles p
set role='setor_intersetorial',
    professional_type=coalesce(p.professional_type,'Funcionário Administrativo'),
    updated_at=now()
from candidates c
where p.id=c.id;

commit;

notify pgrst, 'reload schema';
