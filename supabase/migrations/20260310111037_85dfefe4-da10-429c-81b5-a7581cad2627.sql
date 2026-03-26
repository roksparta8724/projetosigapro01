
-- Create prefeituras (city halls / clients) table
CREATE TABLE public.prefeituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text NOT NULL,
  endereco text NOT NULL,
  cidade text NOT NULL,
  estado text NOT NULL DEFAULT 'SP',
  cep text,
  telefone text,
  email text,
  site text,
  responsavel_nome text,
  responsavel_cargo text,
  responsavel_telefone text,
  responsavel_email text,
  horario_atendimento text,
  secretarias text,
  logo_url text,
  taxas_servicos jsonb DEFAULT '[]'::jsonb,
  data_contrato date,
  valor_contrato numeric,
  vigencia_inicio date,
  vigencia_fim date,
  status text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prefeituras ENABLE ROW LEVEL SECURITY;

-- Only admins can manage
CREATE POLICY "Admins can manage prefeituras" ON public.prefeituras
  FOR ALL TO public USING (public.has_role(auth.uid(), 'admin'));

-- All authenticated users can read (for project select dropdown)
CREATE POLICY "Authenticated users can read prefeituras" ON public.prefeituras
  FOR SELECT TO authenticated USING (true);

-- Add prefecture_id to projects
ALTER TABLE public.projects ADD COLUMN prefecture_id uuid REFERENCES public.prefeituras(id);

-- Update trigger
CREATE TRIGGER update_prefeituras_updated_at
  BEFORE UPDATE ON public.prefeituras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
