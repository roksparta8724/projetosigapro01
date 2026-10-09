-- SIGAPRO: normaliza aliases históricos de papel sem excluir contas.
-- Mantém tenant_memberships como fonte canônica de autorização.

with normalized as (
  select
    p.id as profile_id,
    p.user_id,
    p.municipality_id,
    case lower(coalesce(p.role,''))
      when 'admin_master' then 'master_admin'
      when 'master' then 'master_admin'
      when 'master_admin' then 'master_admin'
      when 'master_ops' then 'master_ops'
      when 'prefeitura_admin' then 'prefeitura_admin'
      when 'admin_municipality' then 'prefeitura_admin'
      when 'prefeitura_supervisor' then 'prefeitura_supervisor'
      when 'analista' then 'analista'
      when 'analyst' then 'analista'
      when 'financeiro' then 'financeiro'
      when 'financial' then 'financeiro'
      when 'setor_intersetorial' then 'setor_intersetorial'
      when 'fiscal' then 'fiscal'
      when 'professional' then 'profissional_externo'
      when 'profissional' then 'profissional_externo'
      when 'professional_external' then 'profissional_externo'
      when 'profissional_externo' then 'profissional_externo'
      when 'property_owner' then 'property_owner'
      when 'proprietario_consulta' then 'proprietario_consulta'
      else null
    end as canonical_role
  from public.profiles p
  where p.deleted_at is null
)
update public.profiles p
   set role=n.canonical_role,
       updated_at=now()
  from normalized n
 where p.id=n.profile_id
   and n.canonical_role is not null
   and p.role is distinct from n.canonical_role;

-- Reativa ou cria membership apenas quando o perfil tem município
-- e ainda não possui nenhum membership ativo.
with normalized as (
  select
    p.id as profile_id,
    p.user_id,
    p.municipality_id,
    p.role as canonical_role
  from public.profiles p
  where p.deleted_at is null
    and p.municipality_id is not null
    and p.role in (
      'master_admin','master_ops','prefeitura_admin','prefeitura_supervisor',
      'analista','financeiro','setor_intersetorial','fiscal',
      'profissional_externo','property_owner','proprietario_consulta'
    )
),
missing as (
  select n.*,r.id as role_id
  from normalized n
  join public.roles r on r.code=n.canonical_role
  where not exists (
    select 1
    from public.tenant_memberships tm
    where tm.profile_id=n.profile_id
      and tm.is_active=true
      and tm.deleted_at is null
  )
)
insert into public.tenant_memberships(
  tenant_id,user_id,profile_id,role_id,is_active,deleted_at,created_at,updated_at
)
select
  m.municipality_id,m.user_id,m.profile_id,m.role_id,true,null,now(),now()
from missing m
where not exists (
  select 1
  from public.tenant_memberships tm
  where tm.tenant_id=m.municipality_id
    and tm.profile_id=m.profile_id
    and tm.role_id=m.role_id
);

-- Caso o membership canônico exista, mas esteja inativo, reativa-o somente
-- se o perfil não possui outro membership ativo.
with desired as (
  select p.id profile_id,p.municipality_id,r.id role_id
  from public.profiles p
  join public.roles r on r.code=p.role
  where p.deleted_at is null
    and p.municipality_id is not null
)
update public.tenant_memberships tm
   set is_active=true,
       deleted_at=null,
       updated_at=now()
  from desired d
 where tm.profile_id=d.profile_id
   and tm.tenant_id=d.municipality_id
   and tm.role_id=d.role_id
   and not exists (
     select 1
     from public.tenant_memberships active_tm
     where active_tm.profile_id=d.profile_id
       and active_tm.is_active=true
       and active_tm.deleted_at is null
   );

-- Remove apenas o conflito conhecido de signup externo: um membership
-- profissional_externo coexistindo com papel administrativo canônico
-- no mesmo perfil e município.
with privileged as (
  select
    p.id profile_id,
    p.municipality_id,
    p.role canonical_role
  from public.profiles p
  where p.deleted_at is null
    and p.role in (
      'master_admin','master_ops','prefeitura_admin','prefeitura_supervisor',
      'analista','financeiro','setor_intersetorial','fiscal'
    )
),
external_role as (
  select id from public.roles where code='profissional_externo' limit 1
)
update public.tenant_memberships tm
   set is_active=false,
       deleted_at=coalesce(tm.deleted_at,now()),
       updated_at=now()
  from privileged p, external_role er
 where tm.profile_id=p.profile_id
   and tm.tenant_id=p.municipality_id
   and tm.role_id=er.id
   and tm.is_active=true
   and exists (
     select 1
     from public.tenant_memberships canonical_tm
     join public.roles canonical_r on canonical_r.id=canonical_tm.role_id
     where canonical_tm.profile_id=p.profile_id
       and canonical_tm.tenant_id=p.municipality_id
       and canonical_tm.is_active=true
       and canonical_tm.deleted_at is null
       and canonical_r.code=p.canonical_role
   );
