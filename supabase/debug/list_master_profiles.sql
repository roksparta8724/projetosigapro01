select
  id,
  user_id,
  full_name,
  email,
  role,
  avatar_url,
  created_at
from public.profiles
where role in ('master_admin','master_ops')
order by created_at asc;
