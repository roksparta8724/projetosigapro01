-- QA-only interpretation notices. Source OCR, source pages and rule activation unchanged.
-- E1 art. 43, IV(a): "ou". E2 grouping spans pages 39-40.
WITH scope_notes(page_number,group_scope,provenance_notice) AS (
 VALUES
 (38,'E1: instituições de âmbito local; a LC 379/2009, art. 43, IV(a), utiliza área construída máxima de 250 m² OU lotação máxima de 100 pessoas. Conferir aplicação no Quadro II e na legislação alterada.','A coluna de zonas no PDF usa grafia pouco nítida (ZM B); conferir nomenclatura do art. 42 e mapa de zoneamento.'),
 (39,'E2: instituições diversificadas; o Quadro II mostra faixa de área construída acima de 250 até 2.500 m² e lotação de 100 a 500 pessoas. Conferir os critérios e exceções do art. 43 e demais alterações.','A tabela de usos começa na página 39 e as exigências de vagas continuam na página 40; não aprovar apenas uma página.'),
 (40,'E3: instituições especiais com lotação acima de 500 pessoas e/ou área construída acima de 2.500 m², segundo a tabela do Quadro II, página 40.','Exigências de vagas podem usar razão por pessoas, área computável ou capacidade; unidade e denominador precisam de revisão visual.')
),
prepared AS (
 SELECT e.municipality_id,e.batch_id,e.page_number,
  COALESCE(jsonb_agg(
    jsonb_set(
      jsonb_set(item.p,'{group_scope_text}',to_jsonb(s.group_scope),true),
      '{field_warnings}',
      COALESCE(item.p->'field_warnings','[]'::jsonb)||jsonb_build_array(s.provenance_notice),
      true
    ) ORDER BY item.ord), '[]'::jsonb) AS proposals
 FROM public.urban_quadro_ii_source_evidence_v1 e
 JOIN scope_notes s ON s.page_number=e.page_number
 CROSS JOIN LATERAL jsonb_array_elements(e.proposals) WITH ORDINALITY item(p,ord)
 WHERE e.municipality_id='49dac0b6-6352-4744-9aab-9ff91c59d970'::uuid
  AND e.batch_id='343fd95a-f95d-4633-8b31-7c628e30527e'::uuid
  AND e.document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1'
  AND e.page_number IN (38,39,40)
 GROUP BY e.municipality_id,e.batch_id,e.page_number
)
UPDATE public.urban_quadro_ii_source_evidence_v1 e
SET proposals=p.proposals
FROM prepared p
WHERE e.municipality_id=p.municipality_id AND e.batch_id=p.batch_id
 AND e.page_number=p.page_number
 AND e.document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1';
