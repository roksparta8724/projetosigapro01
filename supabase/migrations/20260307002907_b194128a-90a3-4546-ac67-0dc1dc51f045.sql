
-- Ensure triggers are attached (drop if exist, then create)

-- 1. Protocol number generation on insert
DROP TRIGGER IF EXISTS trigger_generate_protocol_number ON public.projects;
CREATE TRIGGER trigger_generate_protocol_number
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_protocol_number();

-- 2. Auto generate payment guide when project is submitted
DROP TRIGGER IF EXISTS trigger_auto_generate_payment_guide ON public.projects;
CREATE TRIGGER trigger_auto_generate_payment_guide
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_payment_guide();

-- 3. Log project status changes (must be AFTER because we need the row saved)
DROP TRIGGER IF EXISTS trigger_log_project_status_change ON public.projects;
CREATE TRIGGER trigger_log_project_status_change
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.log_project_status_change();

-- 4. Updated_at triggers
DROP TRIGGER IF EXISTS trigger_update_updated_at_projects ON public.projects;
CREATE TRIGGER trigger_update_updated_at_projects
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trigger_update_updated_at_profiles ON public.profiles;
CREATE TRIGGER trigger_update_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trigger_update_updated_at_analysis ON public.project_analysis;
CREATE TRIGGER trigger_update_updated_at_analysis
  BEFORE UPDATE ON public.project_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 5. Handle new user (create profile + default role)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Ensure sequences exist for protocol and guide numbers
CREATE SEQUENCE IF NOT EXISTS public.protocol_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.guide_number_seq START 1;
