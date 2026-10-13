-- Canonicaliza aliases legados de perfis profissionais externos.
-- O vínculo do processo permanece em process_parties; esta migração só normaliza
-- o rótulo de role para impedir que a sessão externa seja tratada como funcionário municipal.

update public.profiles p
set role='profissional_externo',
    updated_at=now()
where lower(coalesce(p.role,'')) in ('professional','profissional','professional_external')
  and (
    lower(trim(both '''' from coalesce(p.tipo,'')))='externo'
    or exists (
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id=tm.role_id
      where tm.profile_id=p.id
        and tm.is_active=true
        and tm.deleted_at is null
        and r.code='profissional_externo'
    )
  );

notify pgrst, 'reload schema';
