
-- Add current_stage to track analysis workflow stage
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'dados_obra';

-- Add correction_reason to track correction requests
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS correction_reason text;

-- Add default checklist items for technical analysis
-- We'll use analysis_items table which already exists, but add a predefined set per analysis

-- Create a table for predefined checklist template items
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

-- Only admins can manage templates
CREATE POLICY "Admins can manage checklist templates" ON public.checklist_templates
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Anyone authenticated can read templates
CREATE POLICY "Authenticated users can read templates" ON public.checklist_templates
FOR SELECT TO authenticated
USING (true);

-- Insert default checklist items
INSERT INTO public.checklist_templates (item_name, category, sort_order) VALUES
  ('Taxa de ocupação', 'Índices Urbanísticos', 1),
  ('Coeficiente de aproveitamento', 'Índices Urbanísticos', 2),
  ('Recuo frontal', 'Recuos', 3),
  ('Recuo lateral', 'Recuos', 4),
  ('Recuo de fundos', 'Recuos', 5),
  ('Altura máxima', 'Gabarito', 6),
  ('Número de pavimentos', 'Gabarito', 7),
  ('Vagas de estacionamento', 'Acessibilidade', 8),
  ('Acessibilidade PCD', 'Acessibilidade', 9),
  ('Área permeável', 'Ambiental', 10),
  ('Projeto de combate a incêndio', 'Segurança', 11),
  ('Memorial descritivo', 'Documentação', 12);
