-- Keep municipal department separate from job/profession.
-- Urbanismo e Obras is the organizational unit; Técnico em Edificações is the function.

begin;

update public.tenant_memberships tm
set department='Urbanismo e Obras',
    position_title='Técnico em Edificações',
    updated_at=now()
from public.profiles p
where tm.profile_id=p.id
  and lower(p.email)=lower('jonattasengenheiroeletrico@gmail.com')
  and tm.tenant_id='49dac0b6-6352-4744-9aab-9ff91c59d970'::uuid
  and tm.is_active=true
  and tm.deleted_at is null;

commit;
