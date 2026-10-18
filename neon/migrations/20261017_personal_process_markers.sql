-- SIGAPRO: marcadores de processo são preferências pessoais.
-- Cada usuário interno/externo vê somente os próprios marcadores.
-- Marcadores não alteram o workflow e não entram no histórico operacional.

drop index if exists public.process_markers_process_label_uidx;

create unique index if not exists process_markers_process_profile_label_uidx
  on public.process_markers(process_id,created_by_profile_id,lower(label))
  where created_by_profile_id is not null;

drop policy if exists process_markers_select_scoped on public.process_markers;
drop policy if exists process_markers_select_own on public.process_markers;

create policy process_markers_select_own
on public.process_markers
for select
to authenticated
using (
  created_by_profile_id=public.current_profile_id()
  or (
    created_by_profile_id is null
    and created_by=public.current_legacy_user_id()
  )
);

create or replace function public.upsert_process_marker(
  _process_id uuid,
  _label text,
  _color text default '#2563eb'::text
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
  _tenant_id uuid;
  _municipality_id uuid;
  _marker public.process_markers%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if nullif(btrim(_label),'') is null then
    raise exception 'Marcador obrigatório.';
  end if;

  if char_length(btrim(_label)) > 80 then
    raise exception 'Marcador excede 80 caracteres.';
  end if;

  if _color is null or _color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Cor inválida.';
  end if;

  select p.tenant_id,p.municipality_id
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo não encontrado.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  insert into public.process_markers(
    tenant_id,process_id,label,color,created_by_profile_id,
    created_by,created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,btrim(_label),_color,_profile_id,
    _legacy_user_id,clock_timestamp(),_municipality_id
  )
  on conflict (process_id,created_by_profile_id,lower(label))
    where created_by_profile_id is not null
  do update
    set color=excluded.color
  returning * into _marker;

  return jsonb_build_object(
    'marker',to_jsonb(_marker),
    'personal',true
  );
end;
$function$;

create or replace function public.remove_process_marker(
  _marker_id uuid
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
  _marker public.process_markers%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  select * into _marker
  from public.process_markers
  where id=_marker_id;

  if _marker.id is null then
    raise exception 'Marcador não encontrado.';
  end if;

  if not public.has_process_access(_marker.process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if _marker.created_by_profile_id is distinct from _profile_id
     and not (
       _marker.created_by_profile_id is null
       and _marker.created_by is not distinct from _legacy_user_id
     ) then
    raise exception 'Este marcador pertence a outro usuário.';
  end if;

  delete from public.process_markers
  where id=_marker_id;

  return jsonb_build_object(
    'marker_id',_marker_id,
    'process_id',_marker.process_id,
    'personal',true
  );
end;
$function$;

-- Limpa apenas registros antigos de auditoria gerados por marcadores pessoais.
-- O histórico oficial do processo não deve revelar preferências particulares.
delete from public.process_audit_entries
where category='perfil'
  and title in ('Marcador atualizado','Marcador removido');

grant execute on function public.upsert_process_marker(uuid,text,text) to authenticated;
grant execute on function public.remove_process_marker(uuid) to authenticated;

notify pgrst, 'reload schema';
