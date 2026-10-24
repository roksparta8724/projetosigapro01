# SIGAPRO IA Urbanismo — diagnóstico de fechamento (24/10/2026)

> Auditoria executada com SQL **somente leitura**, sem alterar processos ou dados de produção. Não é homologação de navegador autenticado.

## Ambiente efetivamente localizado

- Projeto Neon: `red-sunset-21120522`
- Branch isolada que possui o módulo: `qa-dam-original-isolado-20261021` (`br-solitary-sound-b4xlbvs6`)
- Banco correto: `sigapro_migration_stage_20260923`
- Branch `staging` (`br-holy-bird-b4mgv1vy`): as tabelas e RPCs de urbanismo verificadas **não** estavam presentes; não usá-la como prova da integração.

## Resultados de SQL executados

Arquivos auditados:
- `scripts/urban-neon-readiness.sql`
- `scripts/urban-neon-operational-gate.sql`
- `scripts/urban-neon-public-permissions-gate.sql`

| Porta / resultado | Valor observado |
|---|---|
| database_gate | OK |
| rpc_gate | OK |
| rls_gate | OK |
| authenticated_rpcs | 7 |
| rls_tables | 4 |
| urban_functions | 15 |
| exposed_to_public | 0 |
| exposed_privileged_functions | 0 |
| static_security_gate | PASS_STATIC_SECURITY_AUDIT |
| active_laws | 0 |
| legal_evidence | 0 |
| precheck_runs | 0 |
| assigned_processes | 3 |
| active_profiles | 8 |
| process_tenants | 1 |
| e2e_preparation_gate | BLOCKED_MISSING_TEST_FIXTURES |
| cross_tenant_gate | BLOCKED_SECOND_TENANT_PROCESS_FIXTURE |
| actual_e2e_gate | NOT_VERIFIED_REQUIRES_AUTHENTICATED_BROWSER_TEST |

## O que falta para concluir (sem atalhos)

1. Manter a branch e banco isolados; não executar a aceitação em `production` nem modificar processos preexistentes.
2. Criar por meio dos fluxos normais da aplicação normas claramente **FICTÍCIAS / QA / SEM VALIDADE LEGAL**, evidências sintéticas, dois processos fictícios e usuários autorizados de **duas prefeituras** distintas.
3. Executar `scripts/urban-neon-integrated-acceptance.sql` apenas no banco isolado, respeitando os pré-requisitos e auditando reversibilidade.
4. Executar navegação autenticada U01–U16 de `docs/urban-ia-homologacao-final.md`, preservando evidências e verificando isolamento real por prefeitura, persistência e responsividade.
5. Verificar CI no **SHA final**, migrar apenas mediante aprovação, revisar diferenças e obter autorização para publicar.

**Situação de liberação: BLOQUEADO** até testes autenticados e dados fictícios. Os gates SQL aprovados não autorizam promoção a produção.

## Validação SQL adicional — execução integrada em 24/10/2026

Ambiente exclusivamente isolado: `br-solitary-sound-b4xlbvs6`, banco `sigapro_migration_stage_20260923`.

- `scripts/urban-neon-integrated-acceptance.sql`: **executado sem erro reportado**. O roteiro testa gravação e leitura controlada, recusa de acesso entre prefeituras, reenvio idempotente e rejeição de registros inválidos; seu bloco sintético usa rollback deliberado. A execução retornou `[]` (sem linhas; notificações SQL não foram expostas pela integração).
- `scripts/urban-neon-negative-rpc-smoke.sql`: **executado sem erro reportado**; cobre três requisições inválidas.
- `scripts/urban-neon-cross-tenant-authorization-smoke.sql`: **executado sem erro reportado**; verifica bloqueio de acesso entre municípios com claims simuladas.
- Verificação independente após aceitação: `process_urban_precheck_runs=0`, `urban_regulation_versions=0`, processos com protocolo `QA-ISOLAMENTO-% = 0`.

**Importante:** sucesso de SQL com JWT simulado não é teste de sessão real no navegador. Não criar afirmação de homologação E2E ou autorização de deploy com base nesses resultados. Continuam faltando dados fictícios persistentes para as rotas normais da aplicação e evidências U01–U16.
