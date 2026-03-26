-- Add DELETE policy for project_documents so users can delete their own docs
CREATE POLICY "Users can delete own documents"
ON public.project_documents
FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by);

-- Storage RLS policies for project-documents bucket
CREATE POLICY "Users can upload project documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own project documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own project documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'project-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can manage all project documents storage"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'admin'::public.app_role));