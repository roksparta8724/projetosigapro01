
-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analyst';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'fiscal';

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  related_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Create project_history table (audit trail)
CREATE TABLE public.project_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all history" ON public.project_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own project history" ON public.project_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE projects.id = project_history.project_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can insert history" ON public.project_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create trigger to auto-log project status changes
CREATE OR REPLACE FUNCTION public.log_project_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.project_history (project_id, user_id, action, description, old_status, new_status)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_change',
      'Status alterado de ' || COALESCE(OLD.status::text, 'novo') || ' para ' || NEW.status::text,
      OLD.status::text,
      NEW.status::text
    );
    
    -- Create notification for project owner
    INSERT INTO public.notifications (user_id, title, message, type, related_project_id)
    VALUES (
      NEW.user_id,
      CASE NEW.status::text
        WHEN 'under_analysis' THEN 'Projeto em análise'
        WHEN 'corrections_requested' THEN 'Correção solicitada'
        WHEN 'approved' THEN 'Projeto aprovado!'
        WHEN 'rejected' THEN 'Projeto indeferido'
        WHEN 'payment_confirmed' THEN 'Pagamento confirmado'
        ELSE 'Atualização do projeto'
      END,
      'O projeto ' || NEW.protocol_number || ' teve seu status atualizado para ' || NEW.status::text,
      CASE 
        WHEN NEW.status::text = 'approved' THEN 'success'
        WHEN NEW.status::text = 'rejected' THEN 'error'
        WHEN NEW.status::text = 'corrections_requested' THEN 'warning'
        ELSE 'info'
      END,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_status_change_trigger
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.log_project_status_change();
