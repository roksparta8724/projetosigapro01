select
  current_role_code() as current_role_code,
  current_municipality_id() as current_municipality_id,
  is_admin_master() as is_admin_master,
  is_municipality_admin() as is_municipality_admin,
  is_internal_municipality_role() as is_internal_municipality_role;
