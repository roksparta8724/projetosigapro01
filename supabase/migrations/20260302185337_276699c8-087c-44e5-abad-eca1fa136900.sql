
-- Enum para roles
CREATE TYPE public.app_role AS ENUM ('professional', 'admin');

-- Enum para status do projeto
CREATE TYPE public.project_status AS ENUM ('draft', 'submitted', 'payment_pending', 'payment_confirmed', 'documents_pending', 'under_analysis', 'corrections_requested', 'approved', 'rejected');

-- Enum para status de pagamento
CREATE TYPE public.payment_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  professional_type TEXT, -- Engenheiro, Arquiteto, etc.
  registration_number TEXT, -- CREA/CAU
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  address TEXT NOT NULL,
  neighborhood TEXT,
  total_area NUMERIC,
  floors INTEGER,
  description TEXT,
  status project_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payment guides (guias de pagamento)
CREATE TABLE public.payment_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  guide_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'pix',
  pix_code TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project documents
CREATE TABLE public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL, -- Projeto Arquitetônico, Memorial, ART, etc.
  file_path TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project analysis (análise do projeto)
CREATE TABLE public.project_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  analyst_id UUID REFERENCES auth.users(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, corrections_needed, rejected
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analysis items (checklist items for analysis)
CREATE TABLE public.analysis_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES public.project_analysis(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  is_compliant BOOLEAN,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_items ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-generate protocol number
CREATE OR REPLACE FUNCTION public.generate_protocol_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.protocol_number := 'PRJ-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('protocol_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS protocol_seq START 1;

CREATE TRIGGER set_protocol_number
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  WHEN (NEW.protocol_number IS NULL OR NEW.protocol_number = '')
  EXECUTE FUNCTION public.generate_protocol_number();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_analysis_updated_at BEFORE UPDATE ON public.project_analysis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, cpf_cnpj, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'cpf_cnpj', ''),
    NEW.email
  );
  -- Default role: professional
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'professional');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles: users see their own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- User roles: viewable by owner and admins
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Projects: professionals see their own, admins see all
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all projects" ON public.projects FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can update all projects" ON public.projects FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Payment guides: linked to project owner and admins
CREATE POLICY "Users can view own payment guides" ON public.payment_guides FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Admins can manage payment guides" ON public.payment_guides FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Documents: linked to project owner and admins
CREATE POLICY "Users can view own documents" ON public.project_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can upload documents" ON public.project_documents FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Admins can view all documents" ON public.project_documents FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Analysis: admins can manage, users can view their own project's analysis
CREATE POLICY "Users can view own analysis" ON public.project_analysis FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Admins can manage analysis" ON public.project_analysis FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Analysis items
CREATE POLICY "Users can view own analysis items" ON public.analysis_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.project_analysis pa 
    JOIN public.projects p ON p.id = pa.project_id 
    WHERE pa.id = analysis_id AND p.user_id = auth.uid()
  )
);
CREATE POLICY "Admins can manage analysis items" ON public.analysis_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for project documents
INSERT INTO storage.buckets (id, name, public) VALUES ('project-documents', 'project-documents', false);

CREATE POLICY "Users can upload to their projects" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all project files" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'admin'));
