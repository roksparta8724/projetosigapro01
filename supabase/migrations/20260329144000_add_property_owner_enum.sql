do $$
begin
  alter type public.platform_role add value if not exists 'property_owner';
exception
  when duplicate_object then null;
end $$;
