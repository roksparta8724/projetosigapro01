-- SIGAPRO: revisão da Guia de ISSQN / Projeto pelo analista responsável.
-- A revisão atualiza a mesma linha de guia; apenas a versão vigente permanece operacional.

CREATE OR REPLACE FUNCTION public.revise_iss_project_guide_v1(_process_id uuid, _area_m2 numeric, _usage text, _work_type text, _due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := coalesce(public.current_role_code(),'');
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _analysis_profile_id uuid;
  _guide public.payment_guides%rowtype;
  _official_amount numeric;
  _settings jsonb := '{}'::jsonb;
  _standard text;
  _base_number text;
  _next_revision integer;
  _new_number text;
  _due date := coalesce(_due_date,current_date + 2);
  _actor_name text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _area_m2 is null or _area_m2 <= 0 then
    raise exception 'Informe uma metragem valida para a obra';
  end if;
  if nullif(btrim(_usage),'') is null then
    raise exception 'Informe o uso da edificacao';
  end if;
  if nullif(btrim(_work_type),'') is null then
    raise exception 'Informe a natureza da obra';
  end if;
  if _due < current_date then
    raise exception 'O vencimento da guia nao pode estar no passado';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id,p.analysis_assigned_to_profile_id
    into _tenant_id,_municipality_id,_property_id,_analysis_profile_id
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null or _property_id is null then
    raise exception 'Processo ou imovel nao encontrado';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura')
    or (
      _role_code in ('analista','analyst','prefeitura_supervisor')
      and (_analysis_profile_id is null or _analysis_profile_id=_profile_id)
    )
  ) then
    raise exception 'Somente o analista responsavel pode revisar esta guia';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind='iss_obra'
  for update;

  if _guide.id is null then
    raise exception 'Guia de ISSQN / Projeto nao encontrada';
  end if;

  if coalesce(_guide.paid,false)=true
     or coalesce(_guide.status,'') in ('compensada','confirmed','paid') then
    raise exception 'Guia ja compensada nao pode ser substituida';
  end if;

  update public.properties
     set area_m2=_area_m2,
         usage_type=btrim(_usage),
         work_type=btrim(_work_type)
   where id=_property_id;

  select pr.construction_standard
    into _standard
  from public.properties pr
  where pr.id=_property_id;

  _official_amount := public.resolve_municipal_guide_amount(
    coalesce(_municipality_id,_tenant_id),
    'iss_obra',
    _area_m2,
    btrim(_usage),
    _standard
  );

  _next_revision := coalesce(_guide.reissue_count,0)+1;
  _base_number := regexp_replace(coalesce(_guide.guide_number,'DAM-ISS'), '-R[0-9]+$', '', 'i');
  _new_number := _base_number || '-R' || _next_revision::text;

  update public.payment_guides
     set guide_number=_new_number,
         amount=_official_amount,
         original_due_date=coalesce(original_due_date,due_date::date),
         due_date=_due,
         status='pendente',
         paid=false,
         paid_at=null,
         reissue_count=_next_revision,
         last_reissued_at=now()
   where id=_guide.id
   returning * into _guide;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Analista')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_legacy_user_id,_profile_id,
    'financeiro','Guia ISSQN / Projeto revisada',
    'O analista '||coalesce(_actor_name,'responsavel')||
      ' revisou os dados e gerou a versao vigente '||_new_number||
      ' no valor de R$ '||to_char(_official_amount,'FM999999990D00')||
      '. A versao anterior deixou de ser a guia vigente.',
    false,now()
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'revision',_next_revision
  );
end;
$function$
;

revoke all on function public.revise_iss_project_guide_v1(uuid,numeric,text,text,date) from public;
grant execute on function public.revise_iss_project_guide_v1(uuid,numeric,text,text,date) to authenticated;

notify pgrst, 'reload schema';
