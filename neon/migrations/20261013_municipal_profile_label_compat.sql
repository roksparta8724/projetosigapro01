-- Compatibility persistence for municipal visible profiles.
-- profiles.professional_type is already exposed by Neon Data API and is used
-- only as a read-through mirror for internal municipal profile labels.
begin;

update public.profiles p
set professional_type = tm.profile_label,
    updated_at = now()
from public.tenant_memberships tm
join public.roles r on r.id=tm.role_id
where tm.profile_id=p.id
  and tm.is_active=true
  and tm.deleted_at is null
  and tm.profile_label is not null
  and trim(tm.profile_label)<>''
  and r.code::text not in ('profissional_externo','property_owner','proprietario_consulta');

commit;
