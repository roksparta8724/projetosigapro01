-- SIGAPRO: alinha a estrutura operacional de despachos entre ambientes.
alter table public.interdepartmental_dispatches
  add column if not exists created_by_profile_id uuid,
  add column if not exists status text not null default 'aguardando',
  add column if not exists priority text not null default 'media',
  add column if not exists assigned_to text,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists returned_at timestamptz;

alter table public.interdepartmental_dispatches
  alter column created_by drop not null;

alter table public.interdepartmental_dispatches
  drop constraint if exists interdepartmental_dispatches_status_check,
  add constraint interdepartmental_dispatches_status_check
    check (status in ('aguardando','respondido','concluido','devolvido'));

alter table public.interdepartmental_dispatches
  drop constraint if exists interdepartmental_dispatches_priority_check,
  add constraint interdepartmental_dispatches_priority_check
    check (priority in ('baixa','media','alta','critica'));

alter table public.interdepartmental_dispatches
  drop constraint if exists interdepartmental_dispatches_created_by_profile_id_fkey,
  add constraint interdepartmental_dispatches_created_by_profile_id_fkey
    foreign key (created_by_profile_id)
    references public.profiles(id)
    on delete restrict;
