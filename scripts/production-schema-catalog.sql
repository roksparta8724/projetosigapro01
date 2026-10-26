-- READ ONLY. Run on production branch br-summer-surf-b4s88rv5
-- and separately on QA branch br-solitary-sound-b4xlbvs6.
-- Database name is identical on both branches; NEVER use current_database() as branch proof.
WITH funcs(name) AS (
VALUES ('get_payment_guide_original_v1'),('freeze_payment_guide_document_v1'),
('attach_payment_guide_original_v1'),('authorize_payment_guide_original_upload_v2'),
('authorize_payment_guide_original_read_v1'),('persist_payment_guide_provider_charge_v2'),
('save_urban_regulation_draft_v1'),('list_urban_regulation_versions_v1')),
cols(name) AS (
VALUES ('document_snapshot'),('original_pdf_key'),('original_pdf_sha256'),
('collection_mode_snapshot'),('collection_configuration_id')),
tabs(name) AS (
VALUES ('municipal_collection_configurations'),('urban_regulation_versions'),
('process_urban_precheck_runs'),('urban_legal_evidence_catalog'),('urban_legal_evidence_scopes')),
findings AS (
SELECT 'function' kind, f.name, EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname=f.name) installed FROM funcs f
UNION ALL SELECT 'column',c.name, EXISTS(SELECT 1 FROM information_schema.columns i WHERE i.table_schema='public' AND i.table_name='payment_guides' AND i.column_name=c.name) FROM cols c
UNION ALL SELECT 'table',t.name, EXISTS(SELECT 1 FROM information_schema.tables i WHERE i.table_schema='public' AND i.table_name=t.name) FROM tabs t
)
SELECT kind,name,installed FROM findings ORDER BY kind,name;
-- Catalog match does not prove RLS/grants, immutable storage, nor bank/urban E2E.
