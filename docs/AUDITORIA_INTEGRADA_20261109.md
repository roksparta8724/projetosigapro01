# SIGAPRO — Auditoria integrada de homologação, 09/11/2026

> Fonte de continuidade técnica, **somente QA**. Não é aprovação de liberação comercial, nem licença para modificar banco Neon `production`, branch `main` ou domínio `sigapromunicipal.com.br`. A PR #118 permanece em rascunho.

## Origem e integridade
- Repositório `roksparta8724/projetosigapro01`.
- Branch única de homologação `fix/qa-triagem-analise-pagamento-20261101`.
- Código testado: `1582932b202bd5258f6af2e7ff15c3559b9669bb` (alteração funcional em `993fbd3211213a6afff812b4fb3cc4844d9ea995`).
- GitHub Actions: Quality Gate run **42664673008 = SUCCESS**; Neon migration validation run **42664673009 = SUCCESS**; OCR QA isolado run **42664673014 = SUCCESS**.
- Prévia estável: https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app/acesso. Confirmar commit **READY** após a publicação desta documentação; o build não equivale a teste de usuário autenticado.

## Evidência read-only da Neon QA neste ciclo
Projeto `red-sunset-21120522`, branch `br-solitary-sound-b4xlbvs6`, database `sigapro_migration_stage_20260923`. As consultas foram apenas `SELECT`; nenhuma correção foi gravada diretamente em dados de processos ou leis.

| Frente | Evidência medida | Decisão |
| --- | --- | --- |
| Municípios | 2 municípios cadastrados como `active` | Cadastro existente, **não** comprova fluxo E2E entre tenants |
| Lei LC 379/2009 | 1 PDF original `quadros.pdf`, tamanho 2.456.674 bytes, SHA-256 iniciando `68c85d879011`, `pending_legal_review`, `ready_for_ai=false`, datas jurídicas não confirmadas | **Preservar arquivo**, não pedir reupload; confirmar versão e vigência oficialmente |
| Quadro I | 22 de 23 leituras conferidas; 1 ressalva AIU(2), valor operacional provisório `1,00` | Não tornar parâmetro legal ativo até ato/documento e CONCIDADE |
| Quadro II | 45 linhas `draft_unverified` de 14 páginas, 45 trechos-candidatos, nenhum `permitted_zones_text`, 38 vias e 38 requisitos de vagas propostos | OCR não equivale a zonas permitidas; verificar tabela e texto, inclusive página 43 girada |
| Registro jurídico | 0 importações jurídicas versionadas em `urban_legal_matrix_imports`; 0 escopos de evidência em `urban_legal_evidence_scopes` | Sem ativação de regra real na IA; dois registros existentes são fixtures QA |
| Zoneamento | 0 geometrias em `urban_zoning_zone_geometries_v1` e 0 lotes em `urban_zoning_parcel_geometries_v1` | Proibir conclusão territorial automatizada; requer mapa municipal georreferenciado e vínculo com lote |
| Pagamentos QA | 1 conexão de Mercado Pago: `environment=test`, `status=active`, `last_test_status=ok`; 11 guias, das quais 1 com `bank_authenticated_at` e `bank_status=processed` | Existem testes bancários registrados, porém **não** comprovam conciliação real para todos os provedores |
| Webhooks bancários | 0 linhas em `municipal_collection_webhook_events` | **Falta evidência persistida** de webhook assinado, processado e idempotente no fluxo escolhido |

## Avanço funcional entregue
Antes, o botão **Revisar próxima categoria** atravessava todos os 45 rascunhos igualmente, sem distinguir os rascunhos que já possuíam uma revisão jurídica preliminar. A correção consulta `list_urban_legal_matrix_imports_v1` e associa `reviewed_draft` ao mesmo município, SHA-256, página, categoria, zona e data informada, descartando revisões alheias/incompletas. O botão percorre as categorias **sem primeira revisão**, preservando listagem completa para novas zonas; gravação refaz a leitura do banco. Revisão preliminar não é lei ativa nem dispensa revisão das demais zonas.

Arquivos: `src/components/platform/UrbanQuadroIIWorkspacePanel.tsx`, `src/lib/urbanQuadroIIReviewProgress.ts` e testes específicos/legados da bancada jurídica. Correção de mocks e testes sem remover controles de autenticação, origem documental, evidências humanas ou multi-tenant.

## Critérios reais de liberação (não confundir CI com aceite)
1. **Legislação** — revisões específicas do Quadro II por zona/uso/vigência, evidências SHA/artigo/página, mapeamento das alterações, decisão municipal; AIU(2)=1 somente se ato adequado confirmar.
2. **Zoneamento territorial** — fonte GIS oficial homologada, lote cadastral vinculado e teste de zona de cada imóvel, incluindo imóveis nos limites de polígonos.
3. **IA arquitetônica** — leitura HTTP autenticada do PDF atual no R2; teste real de texto versus página e de visão para desenhos; recuos observados com página/unidade/citação; sem inferir por pixel nem emitir parecer legal sem base vigente.
4. **Fluxo administrativo** — processo completo com profissional, protocolo condicionado à guia, triagem, analista designado, comunique-se, assinatura autorizada e habite-se; auditar cada transição. Não destravar o processo QA04 com guia sintética.
5. **Financeiro** — pagamento controlado real sob autorização municipal, verificação de assinatura do webhook, repetição idempotente, baixa automática e reabertura do DAM imutável; testar as alternativas bancárias por prefeitura, sem presumir que o Mercado Pago configure todos os bancos.
6. **Segurança e escala** — testes de duas prefeituras e de permissão por perfil, RLS/API/storage, rate limit, sessões, inspeção de telas com milhares de processos, contraste, acessibilidade e navegação.
7. **Operação e recuperação** — backup do banco efetivo, restore ensaiado, recuperabilidade R2, observabilidade, monitoração, CI + E2E privado e rollback preparado.

O repositório já possui um gate de aceite com provas privadas (`scripts/qa-commercial-acceptance.mjs`), que exige 10 evidências vinculadas ao SHA da release e revisão humana. **Não substituir essas provas por esta documentação ou pelo sucesso da build**.

## Publicação
O próximo commit da mesma branch inclui `[deploy-qa]` para atualizar somente o Preview Vercel. O alias deve ser confirmado em estado READY apontando ao SHA correto. PR #118 permanece DRAFT, nenhuma promoção de preview para produção e nenhuma migração/atualização da Neon `production`.
