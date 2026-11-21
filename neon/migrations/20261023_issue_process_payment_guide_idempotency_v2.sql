-- SIGAPRO: re-issue is a separate operation; repeated issuance returns the exact existing guide.
-- Authentication and municipal process access are checked before lookup.
CREATE OR REPLACE FUNCTION public.issue_process_payment_guide_v2(_process_id uuid, _guide_kind text, _due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _role_code text := coalesce(public.current_role_code(),'');
  _issuer_mode text := 'analise';
  _tenant_id uuid;
  _municipality_id uuid;
  _status public.process_status;
  _current_department text;
  _current_queue text;
  _is_on_hold boolean;
  _settings jsonb := '{}'::jsonb;
  _iss_enabled boolean := true;
  _protocol_paid boolean := false;
  _iss_paid boolean := false;
  _routed_to_fiscal boolean := false;
  _has_open_requirements boolean := false;
  _has_unapproved_documents boolean := false;
  _prior_guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date,current_date + 2);
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido para emissao por etapa';
  end if;

  if _due < current_date then
    raise exception 'O vencimento da guia nao pode estar no passado';
  end if;

  select
    p.tenant_id,
    p.municipality_id,
    p.status,
    p.current_department,
    p.current_queue,
    coalesce(p.is_on_hold,false)
  into
    _tenant_id,
    _municipality_id,
    _status,
    _current_department,
    _current_queue,
    _is_on_hold
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para emitir guia';
  end if;

  -- Idempotence after authentication and tenant access checks:
  -- Never generate a second guide or recalculate an original issue when one
  -- already exists. Explicit reissue uses the separate approved RPC.
  select g.* into _prior_guide
    from public.payment_guides g
   where g.process_id = _process_id and g.guide_kind = _guide_kind
   order by g.created_at desc, g.id desc
   limit 1;
  if _prior_guide.id is not null then
    return jsonb_build_object(
      'process_id', _process_id,
      'guide', to_jsonb(_prior_guide),
      'existing', true
    );
  end if;

  select coalesce(ms.general_settings,'{}'::jsonb)
    into _settings
  from public.municipality_settings ms
  where ms.municipality_id=coalesce(_municipality_id,_tenant_id)
  limit 1;

  _settings := coalesce(_settings,'{}'::jsonb);
  _iss_enabled := coalesce((_settings->>'iss_stage_enabled')::boolean,true);
  _issuer_mode := lower(coalesce(nullif(btrim(_settings->>'construction_guide_issuer_mode'),''),'analise'));
  if _issuer_mode not in ('analise','financeiro','ambos') then
    _issuer_mode := 'analise';
  end if;

  select exists(
    select 1
    from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='protocolo'
      and (
        coalesce(g.paid,false)=true
        or coalesce(g.status,'') in ('compensada','confirmed','paid')
      )
  ) into _protocol_paid;

  select exists(
    select 1
    from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='iss_obra'
      and (
        coalesce(g.paid,false)=true
        or coalesce(g.status,'') in ('compensada','confirmed','paid')
      )
  ) into _iss_paid;

  select exists(
    select 1
    from public.process_requirements r
    where r.process_id=_process_id
      and r.status in ('aberta','respondida')
  ) into _has_open_requirements;

  select exists(
    select 1
    from public.process_documents d
    where d.process_id=_process_id
      and coalesce(d.is_valid,true)=true
      and coalesce(d.review_status,'pendente') <> 'aprovado'
  ) into _has_unapproved_documents;

  _routed_to_fiscal :=
    lower(coalesce(_current_department,'')) like '%iptu%'
    or lower(coalesce(_current_department,'')) like '%fiscal%'
    or lower(coalesce(_current_queue,'')) like '%iptu%'
    or lower(coalesce(_current_queue,'')) like '%fiscal%'
    or exists(
      select 1
      from public.interdepartmental_dispatches d
      where d.process_id=_process_id
        and d.status not in ('concluido','devolvido')
        and (
          lower(coalesce(d.to_department,'')) like '%iptu%'
          or lower(coalesce(d.to_department,'')) like '%fiscal%'
        )
    );

  if _guide_kind='iss_obra' then
    if not _iss_enabled then
      raise exception 'A etapa de ISSQN / Projeto esta desativada para esta Prefeitura';
    end if;

    if not _protocol_paid then
      raise exception 'A guia de protocolo precisa estar compensada antes da emissao do ISSQN / Projeto';
    end if;

    if _status not in (
      'analise_tecnica'::public.process_status,
      'despacho_intersetorial'::public.process_status
    ) then
      raise exception 'A Guia de ISSQN / Projeto so pode ser emitida depois da analise tecnica';
    end if;

    if _is_on_hold then
      raise exception 'Processo sobrestado nao pode receber a Guia de ISSQN / Projeto';
    end if;

    if _has_open_requirements then
      raise exception 'Existem Comunique-se ou exigencias pendentes aguardando conclusao';
    end if;

    if _has_unapproved_documents then
      raise exception 'Todos os documentos e projetos precisam estar aprovados antes da emissao do ISSQN / Projeto';
    end if;

    if not (
      public.is_master()
      or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura')
    ) then
      if _issuer_mode='analise' then
        if _role_code not in ('analista','analyst','prefeitura_supervisor') then
          raise exception 'Nesta Prefeitura, a Guia de ISSQN / Projeto deve ser emitida pela Analise Urbanistica';
        end if;
        if lower(coalesce(_current_department,'')) not like '%analis%'
           and lower(coalesce(_current_department,'')) not like '%urban%'
           and lower(coalesce(_current_department,'')) not like '%obra%' then
          raise exception 'O processo precisa estar na Analise Urbanistica para emissao do ISSQN / Projeto';
        end if;
      elsif _issuer_mode='financeiro' then
        if _role_code not in ('financeiro','financial') then
          raise exception 'Nesta Prefeitura, a Guia de ISSQN / Projeto deve ser emitida pelo Setor Financeiro';
        end if;
        if lower(coalesce(_current_department,'')) not like '%financ%'
           and lower(coalesce(_current_queue,'')) not like '%financ%' then
          raise exception 'O processo precisa ser encaminhado ao Financeiro antes da emissao do ISSQN / Projeto';
        end if;
      else
        if _role_code in ('financeiro','financial') then
          if lower(coalesce(_current_department,'')) not like '%financ%'
             and lower(coalesce(_current_queue,'')) not like '%financ%' then
            raise exception 'O Financeiro so pode emitir o ISSQN / Projeto depois do encaminhamento formal da Analise Urbanistica';
          end if;
        elsif _role_code in ('analista','analyst','prefeitura_supervisor') then
          if lower(coalesce(_current_department,'')) not like '%analis%'
             and lower(coalesce(_current_department,'')) not like '%urban%'
             and lower(coalesce(_current_department,'')) not like '%obra%' then
            raise exception 'A Analise Urbanistica so pode emitir o ISSQN / Projeto enquanto o processo estiver sob sua responsabilidade';
          end if;
        else
          raise exception 'Este perfil nao esta autorizado a emitir a Guia de ISSQN / Projeto';
        end if;
      end if;
    end if;
  end if;

  if _guide_kind='aprovacao_final' then
    if _status not in (
      'analise_tecnica'::public.process_status,
      'despacho_intersetorial'::public.process_status
    ) then
      raise exception 'A Guia de Recolhimento da Obra so pode ser emitida apos a conclusao da analise tecnica';
    end if;

    if _is_on_hold then
      raise exception 'Processo sobrestado nao pode receber taxa final';
    end if;

    if _has_open_requirements then
      raise exception 'Existem exigencias abertas ou respondidas aguardando conclusao';
    end if;

    if not _protocol_paid then
      raise exception 'A guia de protocolo precisa estar compensada antes da taxa final';
    end if;

    if _iss_enabled and not _iss_paid then
      raise exception 'A guia de ISSQN precisa estar compensada antes da taxa final';
    end if;

  end if;

  return public.issue_process_payment_guide(
    _process_id,
    _guide_kind,
    0::numeric,
    'DAM'::text,
    _due
  );
end;
$function$

