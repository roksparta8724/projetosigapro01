-- SIGAPRO: vínculo permanente entre protocolo e profissional requerente.
-- Um processo protocolado pelo profissional não pode desaparecer do portal
-- quando muda de departamento, fila, status ou etapa interna.

update public.processes p
set created_by_profile_id = pr.id
from public.profiles pr
where p.created_by_profile_id is null
  and p.created_by is not null
  and pr.user_id = p.created_by
  and pr.deleted_at is null;

insert into public.process_parties(
  process_id,tenant_id,municipality_id,user_id,profile_id,party_type,
  display_name,document_masked,is_primary,created_at
)
select
  p.id,
  p.tenant_id,
  coalesce(p.municipality_id,p.tenant_id),
  pr.user_id,
  pr.id,
  'profissional_externo',
  coalesce(nullif(btrim(pr.full_name),''),nullif(btrim(pr.email),''),'Profissional externo'),
  case
    when length(regexp_replace(coalesce(pr.cpf_cnpj,''),'\D','','g')) < 4 then null
    else '***' || right(regexp_replace(pr.cpf_cnpj,'\D','','g'),4)
  end,
  true,
  coalesce(p.created_at,now())
from public.processes p
join public.profiles pr on pr.id=p.created_by_profile_id
where pr.deleted_at is null
  and (
    lower(coalesce(pr.role::text,'')) in ('professional','profissional','profissional_externo','professional_external')
    or exists(
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id=tm.role_id
      where tm.profile_id=pr.id
        and tm.tenant_id=p.tenant_id
        and tm.is_active=true
        and tm.deleted_at is null
        and lower(coalesce(r.code::text,'')) in ('profissional_externo','professional_external','professional','profissional')
    )
  )
  and not exists(
    select 1
    from public.process_parties pp
    where pp.process_id=p.id
      and pp.party_type='profissional_externo'
      and (
        pp.profile_id=pr.id
        or (pr.user_id is not null and pp.user_id=pr.user_id)
      )
  );

notify pgrst, 'reload schema';
