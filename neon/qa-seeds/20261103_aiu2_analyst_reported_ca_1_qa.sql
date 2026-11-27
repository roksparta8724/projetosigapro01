-- QA only: user reports analyst recommended CA minimum 1 in AIU(2).
-- This does NOT revise the original OCR, certify legality, or activate an AI rule.
INSERT INTO public.urban_matrix_analyst_guidance_v1(
  municipality_id,batch_id,document_sha256,row_index,field_code,
  proposed_value,original_ocr_text,attribution,source_note
)
SELECT b.municipality_id,b.id,b.document_sha256,21,'ca_minimo_original',
  1.0000,'01','reported_by_user_as_analyst_guidance',
  'Em 03/11/2026, o solicitante relatou que o analista orientou deixar o CA mínimo da AIU(2) em 1. O PDF original da LC 379/2009, página 37, está digitalizado como "01", com separador incerto. Informação registrada como orientação, sem comprovação documental formal nem vigência legal validada.'
FROM public.urban_matrix_batch_staging_v1 b
WHERE b.id='343fd95a-f95d-4633-8b31-7c628e30527e'::uuid
 AND b.municipality_id='49dac0b6-6352-4744-9aab-9ff91c59d970'::uuid
 AND b.document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1'
 AND b.status='pending_legal_review'
 AND b.source_rows->21->>'zona_conforme_tabela'='AIU(2)'
 AND b.source_rows->21->>'ca_minimo_original' IS NULL
ON CONFLICT (municipality_id,batch_id,row_index,field_code) DO NOTHING;
