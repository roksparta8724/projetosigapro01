-- Read-side indexes for municipal portfolios and process history.
-- No change to data, RLS policies, grants, or workflow rules.
CREATE INDEX IF NOT EXISTS idx_municipalities_created_id_desc ON public.municipalities (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_processes_active_municipality_created ON public.processes (municipality_id, created_at DESC, id DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_documents_process_created ON public.process_documents (process_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_process_audit_entries_process_created ON public.process_audit_entries (process_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_process_movements_process_created ON public.process_movements (process_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_live_email ON public.profiles (email) WHERE deleted_at IS NULL;
