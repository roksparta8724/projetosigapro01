-- SIGAPRO QA-only: clarify E1 institutional scope and exact excerpt in quarantined suggestions.
-- No legal validation or activation; isolated by municipality, batch, and source PDF hash.
UPDATE public.urban_quadro_ii_source_evidence_v1 AS evidence
SET proposals=(
 SELECT jsonb_agg(
    CASE WHEN item.obj->>'category_code' LIKE 'E1.%'
      THEN jsonb_set(
         CASE WHEN item.obj->>'category_code'='E1.1'
           THEN jsonb_set(
             jsonb_set(item.obj,'{example_activities_text}',to_jsonb('Ensino Fundamental; Ensino Infantil; Creches; e similares.'::text),true),
             '{literal_source_excerpt}',to_jsonb('1 vaga para cada 50m2, ou fração, de sala de aula'::text),true
           )
           ELSE item.obj END,
         '{group_scope_text}',
         to_jsonb('E1: instituições de âmbito local, área construída de até 250 m² e lotação máxima de até 100 pessoas.'::text),
         true
       )
      ELSE item.obj END ORDER BY item.ordinality)
 FROM jsonb_array_elements(evidence.proposals) WITH ORDINALITY AS item(obj,ordinality)
)
WHERE evidence.municipality_id='49dac0b6-6352-4744-9aab-9ff91c59d970'::uuid
 AND evidence.batch_id='343fd95a-f95d-4633-8b31-7c628e30527e'::uuid
 AND evidence.document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1'
 AND evidence.page_number=38
 AND evidence.source_quality='machine_unverified';
