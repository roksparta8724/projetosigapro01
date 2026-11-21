-- QA only. Technical 1,00 is NOT the legally certified CA minimum.
INSERT INTO public.urban_matrix_analyst_provisional_criteria_v1 (
 guidance_id,municipality_id,batch_id,document_sha256,version,provisional_value,status,decision_note
)
SELECT g.id,g.municipality_id,g.batch_id,g.document_sha256,1,1.0000,
 'manual_only_pending_concidade',
 'Em 04/11/2026 o usuário confirmou que o analista municipal utiliza CA mínimo 1 na AIU(2) em análises técnicas provisórias. O CONCIDADE não está ativado; a legislação será revista futuramente. O número não equivale à leitura validada do PDF, não aprova projetos nem constitui regra jurídica ativada. Revisar e versionar após deliberação oficial.'
FROM public.urban_matrix_analyst_guidance_v1 g
JOIN public.urban_matrix_batch_staging_v1 b
 ON b.id=g.batch_id AND b.municipality_id=g.municipality_id AND b.document_sha256=g.document_sha256
WHERE g.id='5366b0a0-c126-49b6-b45a-86479703054a'::uuid
 AND g.municipality_id='49dac0b6-6352-4744-9aab-9ff91c59d970'::uuid
 AND g.document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1'
 AND g.row_index=21 AND g.field_code='ca_minimo_original'
 AND g.proposed_value=1 AND g.original_ocr_text='01'
 AND b.source_rows->21->>'zona_conforme_tabela'='AIU(2)'
 AND b.source_rows->21->>'ca_minimo_original' IS NULL
ON CONFLICT(guidance_id,version) DO NOTHING;
