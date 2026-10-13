-- Keep municipal visible profile independent from operational permission role.
begin;

alter table public.tenant_memberships
  add column if not exists profile_label text;

create or replace function public.manage_municipal_user_access_v2(
  _user_id uuid,
  _municipality_id uuid,
  _role_code text default null::text,
  _full_name text default null::text,
  _title text default null::text,
  _profile_label text default null::text,
  _access_level integer default null::integer,
  _account_status text default null::text,
  _reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _saved jsonb;
  _profile_id uuid;
  _role text;
begin
  _saved := public.manage_municipal_user_access(
    _user_id,
    _municipality_id,
    _role_code,
    _full_name,
    _title,
    _access_level,
    _account_status,
    _reason
  );

  _profile_id := nullif(_saved->>'profile_id','')::uuid;
  _role := nullif(_saved->>'role','');

  if _profile_id is null then
    raise exception 'O banco nao confirmou o perfil municipal';
  end if;

  update public.tenant_memberships tm
     set profile_label = case
           when _profile_label is null then tm.profile_label
           else nullif(trim(_profile_label),'')
         end,
         updated_at = now()
    from public.roles r
   where tm.tenant_id = _municipality_id
     and tm.profile_id = _profile_id
     and tm.role_id = r.id
     and r.code::text = _role
     and tm.is_active = true
     and tm.deleted_at is null;

  return _saved || jsonb_build_object(
    'profile_label',
    (
      select tm.profile_label
      from public.tenant_memberships tm
      join public.roles r on r.id=tm.role_id
      where tm.tenant_id=_municipality_id
        and tm.profile_id=_profile_id
        and r.code::text=_role
        and tm.is_active=true
        and tm.deleted_at is null
      order by tm.updated_at desc nulls last
      limit 1
    )
  );
end;
$function$;

grant execute on function public.manage_municipal_user_access_v2(
  uuid,uuid,text,text,text,text,integer,text,text
) to authenticated;

commit;
