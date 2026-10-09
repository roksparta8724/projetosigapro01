-- SIGAPRO: preferências de menu passam a usar profile_id canônico no Neon.

drop index if exists public.uq_user_menu_preferences_profile_id;

create or replace function public.save_user_menu_preferences(_hidden_items text[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _row public.user_menu_preferences%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  insert into public.user_menu_preferences(profile_id,user_id,hidden_items,updated_at)
  values(_profile_id,public.current_legacy_user_id(),coalesce(_hidden_items,'{}'::text[]),now())
  on conflict (profile_id) where profile_id is not null
  do update
    set hidden_items=excluded.hidden_items,
        updated_at=now()
  returning * into _row;

  return to_jsonb(_row);
end;
$function$;

revoke all on function public.save_user_menu_preferences(text[]) from public;
grant execute on function public.save_user_menu_preferences(text[]) to authenticated;
