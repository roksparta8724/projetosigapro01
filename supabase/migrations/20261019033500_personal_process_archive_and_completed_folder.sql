-- SIGAPRO — conclusão visível + arquivamento pessoal por perfil.
-- Concluir um Habite-se não remove o processo do registro geral.
-- Arquivar é uma preferência individual: cada perfil oculta/restaura apenas na própria lista.

create table if not exists public.profile_process_archives (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (profile_id, process_id)
);

alter table public.profile_process_archives enable row level security;

drop policy if exists profile_process_archives_select_own on public.profile_process_archives;
create policy profile_process_archives_select_own
on public.profile_process_archives
for select
to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists profile_process_archives_insert_own on public.profile_process_archives;
create policy profile_process_archives_insert_own
on public.profile_process_archives
for insert
to authenticated
with check (
  profile_id = public.current_profile_id()
  and public.has_process_access(process_id)
);

drop policy if exists profile_process_archives_delete_own on public.profile_process_archives;
create policy profile_process_archives_delete_own
on public.profile_process_archives
for delete
to authenticated
using (profile_id = public.current_profile_id());

grant select, insert, delete on table public.profile_process_archives to authenticated;

-- Corrige Habite-ses que já haviam sido concluídos usando arquivamento global.
update public.processes p
set status='deferido'::public.process_status,
    archived_at=null,
    current_department='Processo concluído',
    current_queue='Habite-se concluído',
    sla_stage='Concluído',
    process_checkpoint='Processo de Habite-se concluído administrativamente',
    updated_at=now()
where p.status='arquivado'::public.process_status
  and p.process_checkpoint='Processo de Habite-se concluído administrativamente'
  and exists (
    select 1
    from public.process_habite_se_permits hp
    where hp.process_id=p.id
      and hp.status='emitido'
  );

notify pgrst, 'reload schema';
