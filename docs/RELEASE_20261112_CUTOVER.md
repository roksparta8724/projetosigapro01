# SIGAPRO — liberação controlada do site oficial (12/11/2026)

## Escopo solicitado
O proprietário autorizou explicitamente publicar as melhorias verificadas no domínio oficial `sigapromunicipal.com.br`. Não confundir publicação de software com autorização da Prefeitura para arrecadar, aprovar regras ou emitir decisões oficiais automaticamente.

## Origem e infraestrutura
- Repository `roksparta8724/projetosigapro01`; source de homologação `fix/qa-triagem-analise-pagamento-20261101` / PR #118.
- Production Vercel project `prj_2K7GRFtPYzGCEQWnROMkfIPDj1VQ`; production rollback candidate BEFORE release `dpl_sL3xbbPEkq8niJcia6gVtQuug6Py` (SHA `bfd94b6732f0176453672e7e6925d835889c985f`).
- Neon PROD `br-summer-surf-b4s88rv5` database `sigapro_migration_stage_20260923`. Neon QA `br-solitary-sound-b4xlbvs6`, NEVER use as PROD.
- Existing release rehearsal `br-lucky-credit-b4evfnn0` copied from production before this exercise. Before rehearsals it had 312 app functions and 127 application tables, matching production, with 2 pre-existing function definition differences. A fresh Neon branch could not be created because of plan branch limit. Do not delete old backups.
- Rollback SQL `neon/rollback/20261112_production_pre_release_functions.sql` contains ORIGINAL source of 14 functions from current production and DROP of 19 additional triggers (rollback is a maintenance operation, not automated).

## Migration whitelist rehearsed without destructive data writes
Run in the following order after verifying source SHA and production backup, keeping transactions atomic per migration, excluding BEGIN/COMMIT wrappers inside the RPC transaction:
1. `20261106_urban_zoning_postgis_qa_v1.sql` — PostGIS plus municipal GIS tables, RLS and functions
2. `20261105_analyst_start_rpc_trigger_guard_v1.sql` — attribution guard
3. `20261106_urban_existing_work_baseline_qa_v1.sql` — read-only legal baseline
4. `20261106_urban_precheck_geozone_gate_v7_qa.sql` — territorial proof / regulations guard
5. `20261110_closed_process_lifecycle_guard_v1_qa.sql` — lifecycle locks
6. `20261110_document_sync_owner_scope_v1.sql` — tenant-scoped upload
7. `20261110_original_pdf_signing_strict_tenant_v1_qa.sql` — authenticated immutable PDF
8. `20261110_habite_se_signed_document_and_completion.sql` — Habite-se signing
9. `20261110_paid_triage_correction_v1.sql` — authorized paid triage repair
10. `20261110_triage_recovery_authorized_protocol_v1_qa.sql` — safe triage
11. `20261111_director_signature_signed_analysis_evidence_guard_qa.sql` — actual technical signature guard
12. `20261111_document_hash_true_bytes_guard_qa.sql` — real SHA for new documents
13. `20261111_public_signature_verifier_requires_signed_proof_qa.sql` — signed evidence
14. `20261112_prod_admin_readonly_guard_v1.sql` — production-compatible guard, no QA-only provenance table
15. `20261111_municipal_commercial_readiness_v1.sql` — evidence-only scoped readiness panel

Do NOT use `20261109_complete_prefeitura_admin_process_readonly_qa.sql` in PROD: it asserts a synthetic QA provenance table and was rejected in rehearsal. Production-compatible version above passed on rehearsal. Do NOT install `qa_hosted_pix_orders`, `qa_pix_ledger`, `qa_r2_original_probe` or `qa04_upgrade` in production.

## Safety and rollout
- Backup **Vercel production rollback candidate** and pre-release function definitions exist; do not remove them.
- Never issue test PIX to production or migrate QA payment/document/process rows.
- Prod `municipal_payment_provider_connections` has NO active live provider; do not activate credentials or claim bank clearance.
- No official urban regulation/evidence is active in PROD; keep legal evaluation manual and legally unapproved until municipal conference.
- Claude external visual API has billing block; Cloudflare document TEXT is proven, geometry is not proven. No automatic legal approval.
- After deployment verify root, `/acesso`, `/api/health`, tenant authentication and authorization, R2, role-based process restrictions and new readiness screen.
- If checks fail, roll back Vercel to `dpl_sL3xbbPEkq8niJcia6gVtQuug6Py`; then coordinate the compensating database function/trigger restore from saved script, never revert a payment by editing SQL manually.
- This release remains subject to external bank/legal/municipal E2E acceptance; the software release and commercial certification are distinct.

## Rehearsal
- PostGIS GIS migration 37 statements passed in database copy.
- 13 operational migration groups plus the production-compatible municipal-admin guard and commercial readiness function passed in rehearsal.
- Public schema and production data remained untouched in rehearsal stage.
- QA-only payment functions are excluded from PROD and protected in preview via environment checks.
