-- SIGAPRO: permitir que cada perfil exclua somente as próprias notificações.
grant delete on table public.notifications to authenticated;

drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_delete_own
on public.notifications
for delete
to authenticated
using (profile_id = public.current_profile_id());
