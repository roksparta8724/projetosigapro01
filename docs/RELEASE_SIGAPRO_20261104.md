# SIGAPRO — manifesto de publicação controlada (04/11/2026)

**Não é autorização para rodar em produção:** este documento registra o ensaio executado e o procedimento seguro de publicação. Antes de alterar o banco de produção, confirmar a autorização específica da migração, o plano de reversão e o resultado dos testes.

## Destino e pontos preservados

- GitHub único: [PR 117](https://github.com/roksparta8724/projetosigapro01/pull/117), branch `fix/qa-triagem-analise-pagamento-20261101`.
- Site público atual: `sigapromunicipal.com.br` na `main`, **não alterado neste ensaio**.
- Vercel produção anterior: SHA `0b1eefb3a455fcb3ebc6ae66253f63d96de3aa91`; deployment READY anterior permanece disponível.
- Neon produção: projeto `red-sunset-21120522`, branch `br-summer-surf-b4s88rv5`, banco `sigapro_migration_stage_20260923`.
- Neon **backup pré-release preservado**: `br-small-silence-b40dbpym` (`sigapro-backup-pre-release-20261104`), sem compute, clonado da produção em 04/11.
- Neon **ensaio separado**: `br-lucky-credit-b4evfnn0` (`sigapro-release-migration-rehearsal-20261104`), derivado do backup.
- Foram excluídas **somente após autorização explícita** as branches antigas descartáveis `r2-auth-test-20261004` e `baseline-boot-dataapi-20261003`; a branch histórica `staging`, a QA atual e as cópias de recuperação permaneceram intactas.

## Resultado da execução em cópia de produção

- Início: **117 tabelas, 280 funções, 3 processos**.
- Final no ensaio: **127 tabelas, 312 funções, 3 processos**.
- Diferenças frente à QA `br-solitary-sound-b4xlbvs6`: **4 tabelas e 24 funções exclusivamente de testes/QA**, deliberadamente não migradas para produção.
- Provas read-only entre produção e cópia **idênticas**: 3 processos, 6 guias, 16 documentos, 18 movimentações, 70 eventos de auditoria, 2 municípios. Fingerprints de IDs+status dos processos e guias iguais antes/depois do ensaio.
- Smoke test como `authenticated` sem perfil: acesso à matriz jurídica **bloqueado**; `save_urban_precheck_run_v6` com permissão, `v5` sem permissão; consulta não autenticada de guia retorna nulo.
- Nenhum processo/guia foi alterado no ensaio; nenhum SQL aplicado ao banco oficial; produção Vercel permanece na versão antiga.
- A migração de histórico dos documentos recebeu **dois terminadores SQL faltantes**. Foram adicionadas a fundação da matriz, RPCs operacionais/triggers com isolamento e controles de pagamento/identidade que faltavam na produção.
- Preservadas as versões mais novas do banco de produção para conciliação e atestado bancário; não sobrescrever com rotinas QA antigas.
- Quality Gate aprovado [CI 41922656299](https://github.com/roksparta8724/projetosigapro01/actions/runs/41922656299) e validação de migrações aprovada [CI 41922656301](https://github.com/roksparta8724/projetosigapro01/actions/runs/41922656301) no SHA `651b5fb0028f40240e8087ab8d0607ef24909c95`.

## Sequência exata de migrações validada no ensaio

**A ordem alfabética NÃO serve:** o `quadro_ii_workspace` precisa existir ANTES de `quadro_ii_source_evidence`. Aplicar cada arquivo do GitHub em uma transação, separando instruções SQL respeitando blocos PL/pgSQL com aspas `$tag$`; filtrar `BEGIN` e `COMMIT` exteriores; interromper e não publicar ao primeiro erro. **Não executar seeds `neon/qa-seeds` nem scripts `neon/qa`.**

1. `neon/migrations/20261101_payment_triage_state_preservation.sql`
2. `neon/migrations/20261101_protocol_triage_document_receipt_guard.sql`
3. `neon/migrations/20261101_technical_analysis_protocol_release_gate.sql`
4. `neon/migrations/20261102_archived_document_history_protocol_guard.sql`
5. `neon/migrations/20261102_plan_usage_dashboard_v1.sql`
6. `neon/migrations/20261103_000_urban_matrix_foundation_v1.sql`
7. `neon/migrations/20261103_aiu2_analyst_guidance_qa_v1.sql`
8. `neon/migrations/20261103_urban_legislation_registry_v1.sql`
9. `neon/migrations/20261103_urban_legislation_registry_writer_permission_v1.sql`
10. `neon/migrations/20261103_urban_matrix_reading_audit_v2.sql`
11. `neon/migrations/20261103_urban_quadro_ii_workspace_v1.sql`
12. `neon/migrations/20261103_quadro_ii_source_evidence_qa_v1.sql`
13. `neon/migrations/20261103_zz_production_operational_rpc_parity_v1.sql`
14. `neon/migrations/20261104_aiu2_manual_provisional_criterion_v1.sql`
15. `neon/migrations/20261104_municipal_legacy_legal_assets_atomic_v1.sql`
16. `neon/migrations/20261104_municipal_urban_writer_authorization_v1.sql`
17. `neon/migrations/20261104_quadro_ii_reviewed_draft_category_codes_v1.sql`
18. `neon/migrations/20261104_urban_additional_numeric_metrics_v1.sql`
19. `neon/migrations/20261104_urban_legislation_admin_only_v1.sql`
20. `neon/migrations/20261104_urban_legislation_prefeitura_admin_writer_v2.sql`
21. `neon/migrations/20261104_zz_security_parity_production_v1.sql`
22. `neon/migrations/20261104_precheck_v6_only_auth.sql`

## Gate de mudança do banco oficial

1. Validar autorização explícita para **substituir/criar funções e triggers** no Neon de produção; a autorização anterior para excluir duas branches cobria apenas essas exclusões.
2. Confirmar estado atual do backup e contagens/fingerprints do banco de produção antes da transação.
3. Aplicar os arquivos acima ao **banco de produção** na ordem testada. Cada arquivo deve ser uma transação atômica; parada imediata em erro. Conferir integridade/fingerprints e políticas RLS no final.
4. Fazer smoke tests da API e perfis com conexão **de produção**; não reaproveitar contas/PIX de testes. Garantir rollback de esquema (backup Neon) e de aplicação (Vercel).
5. Somente após schema e smoke OK, retirar PR 117 do rascunho, integrar à `main`, aguardar Vercel produção READY no commit esperado e verificar `sigapromunicipal.com.br`.
6. Continuar a homologação funcional no **mesmo ambiente oficial**, porém funcionalidades não validadas devem permanecer em estado consultivo/bloqueado: pagamento real com baixa, análise geométrica IA, Quadro I/II e AIU(2)=1 provisório aguardando CONCIDADE.

## Pendências funcionais que a publicação do código não certifica

- A conversão textual Workers AI/R2 não comprova recuos geométricos da planta; precisa teste real com imagens e checagem do analista.
- Regras urbanísticas não podem ser ativadas com OCR impreciso ou sem referência legal validada, mesmo que a interface de cadastro esteja publicada.
- Mercado Pago é apenas ambiente de teste; a certificação bancária depende de webhook real, idempotência e acordo com cada banco municipal.
- Os dados de teste na QA não devem ser importados para produção; por exemplo, Processo 04 e o CA provisório de AIU(2) não viram automaticamente fatos legais oficiais.

**Fonte de continuidade:** `docs/STATUS_UNICO_SIGAPRO.md` e esta ordem versionada. Nunca trabalhar a partir de URLs efêmeras ou da memória de uma conversa.
