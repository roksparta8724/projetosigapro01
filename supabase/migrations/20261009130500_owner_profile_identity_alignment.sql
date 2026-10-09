-- SIGAPRO: alinha vínculos de proprietário ao modelo Neon baseado em profile_id.

alter table public.project_owner_requests
  add column if not exists owner_profile_id uuid,
  add column if not exists professional_profile_id uuid,
  add column if not exists responded_by_profile_id uuid;

alter table public.project_owner_links
  add column if not exists owner_profile_id uuid,
  add column if not exists professional_profile_id uuid,
  add column if not exists linked_by_profile_id uuid;

update public.project_owner_requests r
set owner_profile_id=p.id
from public.profiles p
where r.owner_profile_id is null
  and r.owner_user_id is not null
  and p.user_id=r.owner_user_id
  and p.deleted_at is null;

update public.project_owner_requests r
set professional_profile_id=p.id
from public.profiles p
where r.professional_profile_id is null
  and r.professional_user_id is not null
  and p.user_id=r.professional_user_id
  and p.deleted_at is null;

update public.project_owner_requests r
set responded_by_profile_id=p.id
from public.profiles p
where r.responded_by_profile_id is null
  and r.responded_by is not null
  and p.user_id=r.responded_by
  and p.deleted_at is null;

update public.project_owner_links l
set owner_profile_id=p.id
from public.profiles p
where l.owner_profile_id is null
  and l.owner_user_id is not null
  and p.user_id=l.owner_user_id
  and p.deleted_at is null;

update public.project_owner_links l
set professional_profile_id=p.id
from public.profiles p
where l.professional_profile_id is null
  and l.professional_user_id is not null
  and p.user_id=l.professional_user_id
  and p.deleted_at is null;

update public.project_owner_links l
set linked_by_profile_id=p.id
from public.profiles p
where l.linked_by_profile_id is null
  and l.linked_by is not null
  and p.user_id=l.linked_by
  and p.deleted_at is null;

alter table public.project_owner_requests
  drop constraint if exists project_owner_requests_owner_profile_id_fkey,
  add constraint project_owner_requests_owner_profile_id_fkey
    foreign key (owner_profile_id) references public.profiles(id) on delete cascade,
  drop constraint if exists project_owner_requests_professional_profile_id_fkey,
  add constraint project_owner_requests_professional_profile_id_fkey
    foreign key (professional_profile_id) references public.profiles(id) on delete cascade,
  drop constraint if exists project_owner_requests_responded_by_profile_id_fkey,
  add constraint project_owner_requests_responded_by_profile_id_fkey
    foreign key (responded_by_profile_id) references public.profiles(id) on delete set null;

alter table public.project_owner_links
  drop constraint if exists project_owner_links_owner_profile_id_fkey,
  add constraint project_owner_links_owner_profile_id_fkey
    foreign key (owner_profile_id) references public.profiles(id) on delete cascade,
  drop constraint if exists project_owner_links_professional_profile_id_fkey,
  add constraint project_owner_links_professional_profile_id_fkey
    foreign key (professional_profile_id) references public.profiles(id) on delete cascade,
  drop constraint if exists project_owner_links_linked_by_profile_id_fkey,
  add constraint project_owner_links_linked_by_profile_id_fkey
    foreign key (linked_by_profile_id) references public.profiles(id) on delete set null;

create index if not exists idx_project_owner_requests_owner_profile_id
  on public.project_owner_requests(owner_profile_id);
create index if not exists idx_project_owner_requests_prof_profile_id
  on public.project_owner_requests(professional_profile_id);
create index if not exists idx_project_owner_requests_responded_by_profile_id
  on public.project_owner_requests(responded_by_profile_id);

create index if not exists idx_project_owner_links_owner_profile_id
  on public.project_owner_links(owner_profile_id);
create index if not exists idx_project_owner_links_prof_profile_id
  on public.project_owner_links(professional_profile_id);
create index if not exists idx_project_owner_links_linked_by_profile_id
  on public.project_owner_links(linked_by_profile_id);
