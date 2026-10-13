-- SIGAPRO: Análise Urbanística confirma metragem/tipo da obra antes da geração automática da guia.
-- O cálculo financeiro continua server-authoritative em issue_process_payment_guide_v2.

begin;

create or replace function public.update_process_construction_data_v1(
  _process_id uuid,
  _area_m2 numeric,
  _usage text,
  _construction_standard text default 'medio'
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _current_department text;
  _actor_name text;
  _document_count integer := 0;
  _not_approved_count integer := 0;
  _open_requirements integer := 0;
  _existing_guide integer := 0;
  _property public.properties%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not (
    public.is_master()
    or _role_code in (
      'prefeitura_admin',
      'admin_municipality',
      'admin_prefeitura',
      'prefeitura_supervisor',
      'analista',
      'analyst'
    )
  ) then
    raise exception 'Somente a Analise Urbanistica pode informar os dados para calculo da guia da obra';
  end if;

  if _area_m2 is null or _area_m2 <= 0 then
    raise exception 'Informe uma metragem valida para a obra';
  end if;

  if nullif(btrim(_usage),'') is null then
    raise exception 'Informe o tipo da obra';
  end if;

  select
    p.tenant_id,
    p.municipality_id,
    p.property_id,
    coalesce(nullif(btrim(p.current_department),''),'Analise Urbanistica')
  into
    _tenant_id,
    _municipality_id,
    _property_id,
    _current_department
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null or _property_id is null then
    raise exception 'Processo ou imovel nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if lower(coalesce(_current_department,'')) not like '%anal%'
     and lower(coalesce(_current_department,'')) not like '%urban%'
     and lower(coalesce(_current_department,'')) not like '%obra%' then
    raise exception 'Os dados da obra so podem ser confirmados enquanto o processo estiver na Analise Urbanistica';
  end if;

  select
    count(*),
    count(*) filter (where coalesce(d.review_status,'pendente') <> 'aprovado')
  into _document_count,_not_approved_count
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true;

  if _document_count = 0 or _not_approved_count > 0 then
    raise exception 'Todos os documentos e projetos devem estar aprovados antes de gerar a guia da obra';
  end if;

  select count(*)
    into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id
    and r.status in ('aberta','respondida');

  if _open_requirements > 0 then
    raise exception 'Existem Comunique-se ou exigencias pendentes no processo';
  end if;

  select count(*)
    into _existing_guide
  from public.payment_guides g
  where g.process_id=_process_id
    and g.guide_kind in ('aprovacao_final','final_approval');

  if _existing_guide > 0 then
    raise exception 'A Guia de Recolhimento da Obra ja foi gerada e os dados financeiros nao podem ser alterados por esta etapa';
  end if;

  update public.properties
     set area_m2=_area_m2,
         usage_type=btrim(_usage),
         construction_standard=coalesce(nullif(btrim(_construction_standard),''),'medio')
   where id=_property_id
   returning * into _property;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Analista')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Dados da obra confirmados para calculo',
    'Analise Urbanistica confirmou '||
      to_char(_area_m2,'FM999999990D00')||' m2, tipo '||btrim(_usage)||
      ' e padrao '||coalesce(nullif(btrim(_construction_standard),''),'medio')||
      ' para geracao automatica da Guia de Recolhimento da Obra.',
    false,now(),coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'property',to_jsonb(_property),
    'confirmed_by',coalesce(_actor_name,'Analista')
  );
end;
$function$;

revoke all on function public.update_process_construction_data_v1(uuid,numeric,text,text) from public;
grant execute on function public.update_process_construction_data_v1(uuid,numeric,text,text) to authenticated;

commit;

notify pgrst, 'reload schema';
