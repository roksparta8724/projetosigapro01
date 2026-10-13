-- SIGAPRO: a Guia de ISSQN / Projeto só fica visível ao profissional após liberação manual do analista.

CREATE OR REPLACE FUNCTION public.share_iss_project_guide_v1(_process_id uuid)
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
  _analysis_profile_id uuid;
  _professional_name text;
  _sender_name text;
  _sender_role text;
  _guide public.payment_guides%rowtype;
  _message public.process_messages%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select p.tenant_id,p.municipality_id,p.analysis_assigned_to_profile_id
    into _tenant_id,_municipality_id,_analysis_profile_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura')
    or (
      _role_code in ('analista','analyst','prefeitura_supervisor')
      and (_analysis_profile_id is null or _analysis_profile_id=_profile_id)
    )
  ) then
    raise exception 'Somente o analista responsavel pode enviar esta guia ao profissional';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind='iss_obra'
  limit 1;

  if _guide.id is null then
    raise exception 'Guia de ISSQN / Projeto nao encontrada';
  end if;

  if exists(
    select 1
    from public.process_messages m
    where m.process_id=_process_id
      and m.audience in ('externo','misto')
      and position(coalesce(_guide.guide_number,'') in coalesce(m.message,'')) > 0
  ) then
    return jsonb_build_object('process_id',_process_id,'already_shared',true,'guide_number',_guide.guide_number);
  end if;

  select pp.display_name
    into _professional_name
  from public.process_parties pp
  where pp.process_id=_process_id
    and pp.party_type='profissional_externo'
  limit 1;

  select
    coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Usuario'),
    coalesce(public.current_role_code(),p.role,'usuario')
    into _sender_name,_sender_role
  from public.profiles p
  where p.id=_profile_id;

  insert into public.process_messages(
    tenant_id,municipality_id,process_id,sender_user_id,sender_profile_id,
    sender_name,sender_role,audience,recipient_name,message,created_at
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_legacy_user_id,_profile_id,
    _sender_name,_sender_role,'externo',nullif(btrim(_professional_name),''),
    'Guia de ISSQN / Projeto revisada e liberada pelo analista: '||
      coalesce(_guide.guide_number,'')||', valor R$ '||
      to_char(_guide.amount,'FM999999990D00')||', vencimento '||
      to_char(_guide.due_date,'DD/MM/YYYY')||'.',
    now()
  )
  returning * into _message;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_legacy_user_id,_profile_id,
    'mensagem','Guia ISSQN / Projeto enviada ao profissional',
    'A versao vigente '||coalesce(_guide.guide_number,'')||
      ' foi liberada manualmente pelo analista responsavel.',
    true,now()
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'already_shared',false,
    'guide_number',_guide.guide_number,
    'message',to_jsonb(_message)
  );
end;
$function$
;

revoke all on function public.share_iss_project_guide_v1(uuid) from public;
grant execute on function public.share_iss_project_guide_v1(uuid) to authenticated;

notify pgrst, 'reload schema';
