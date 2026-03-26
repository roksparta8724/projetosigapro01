
-- Add property cadastral fields to projects
ALTER TABLE public.projects
  ADD COLUMN owner_name text,
  ADD COLUMN owner_cpf_cnpj text,
  ADD COLUMN lot_number text,
  ADD COLUMN block_number text,
  ADD COLUMN property_registration text,
  ADD COLUMN property_zone text,
  ADD COLUMN property_usage text;

-- Add professional fields to projects (stored at submission time)
ALTER TABLE public.projects
  ADD COLUMN professional_name text,
  ADD COLUMN professional_cpf_cnpj text,
  ADD COLUMN professional_registration text,
  ADD COLUMN professional_type text;

-- Create sequence for guide numbers if not exists
CREATE SEQUENCE IF NOT EXISTS guide_number_seq START 1;

-- Function to auto-generate payment guide after project submission
CREATE OR REPLACE FUNCTION public.auto_generate_payment_guide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  guide_num text;
  base_amount numeric;
BEGIN
  -- Only generate when project is first submitted
  IF NEW.status = 'submitted' AND (OLD IS NULL OR OLD.status = 'draft' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Calculate amount based on project type
    base_amount := CASE
      WHEN NEW.project_type = 'Residencial Unifamiliar' THEN 150.00
      WHEN NEW.project_type = 'Residencial Multifamiliar' THEN 350.00
      WHEN NEW.project_type = 'Comercial' THEN 450.00
      WHEN NEW.project_type = 'Industrial' THEN 550.00
      WHEN NEW.project_type = 'Reforma' THEN 120.00
      WHEN NEW.project_type = 'Regularização' THEN 200.00
      WHEN NEW.project_type = 'Demolição' THEN 100.00
      ELSE 200.00
    END;

    guide_num := 'GR-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('guide_number_seq')::TEXT, 4, '0');

    INSERT INTO public.payment_guides (project_id, guide_number, amount, due_date, status, pix_code, payment_method)
    VALUES (
      NEW.id,
      guide_num,
      base_amount,
      (CURRENT_DATE + INTERVAL '15 days')::date,
      'pending',
      'PIX-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8)),
      'pix'
    );

    -- Update project status to payment_pending
    NEW.status := 'payment_pending';
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for auto payment guide generation
DROP TRIGGER IF EXISTS trg_auto_payment_guide ON public.projects;
CREATE TRIGGER trg_auto_payment_guide
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_payment_guide();
