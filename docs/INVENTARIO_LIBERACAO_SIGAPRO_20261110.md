# SIGAPRO — Inventário verificável para liberação comercial (10/11/2026)

Esta é uma medição de **estado atual**, não um aceite de operação pública. Consultas SQL foram feitas em modo de leitura, com verificação do HEAD de PR #118, deployment Vercel e quality gate. Não alterar dados de produção para produzir um status favorável.

## Identidade e entrega técnica

- Repositório: roksparta8724/projetosigapro01.
- Branch única QA: fix/qa-triagem-analise-pagamento-20261101; PR #118 aberta, draft, sem merge para main.
- Preview auditado antes deste inventário: commit 392b1272aa4048c0e7eb0e85912835ffcf963b6e, deployment Vercel dpl_98q4uQCqoPVyjs91RhRAZm6gnioE READY.
- Quality Gate desse SHA: 1.839 testes aprovados em 337 arquivos. CI, build, testes e preview não provam pagamento real ou cadastro jurídico oficial.
- Gate de aceite: docs/QA_COMMERCIAL_ACCEPTANCE.json registra 10 itens pendentes. A única autorização de release aceita evidências revisadas para o SHA exato, conforme docs/QA_COMMERCIAL_ACCEPTANCE.md.

## Neon QA — medições efetivas

Branch Neon: br-solitary-sound-b4xlbvs6 / DB sigapro_migration_stage_20260923.

| Indicador | Resultado |
|---|---:|
| Municípios cadastrados | 2 (Campo Limpo Paulista e SIGAPRO Plataforma; isto não equivale a duas prefeituras reais) |
| Processos | 8 |
| Guias | 11 |
| Guias marcadas paid=true | 8 |
| Guias paid=true com bank_authenticated_at informado | 1 |
| Guias com referência e SHA do PDF original | 1 |
| Fichas técnicas em process_analysis_sheets | 0 |
| Pré-análises em process_urban_precheck_runs | 2 |
| Evidências jurídicas catalogadas | 0 |
| Escopos jurídicos de evidência | 0 |
| Importações de matrizes jurídicas | 0 |
| Normas urbanísticas ativas sem prefixo QA- | 0 |
| Normas QA-URBAN-E2E-20261024 com status active | 2 |

A função vigente save_urban_precheck_run_v7 rejeita zone_code com prefixo QA-, inclusive as duas regras fictícias, e get_urban_process_legal_baseline_v1 exclui essas normas da contagem real. Nenhuma deve respaldar pareceres oficiais.

A guia antiga em QA com referência de PDF original continua sem comprovação de leitura do arquivo físico e SHA; a auditoria anterior identificou NOT_VERIFIED_ORIGINAL_OBJECT_MISSING. Não regenerar o documento alegando ser o original.

## Neon produção — medições efetivas (SOMENTE SELECT)

Branch Neon production: br-summer-surf-b4s88rv5 / mesma denominação de database, mas branch distinta.

| Indicador | Resultado |
|---|---:|
| Municípios | 2 |
| Processos | 3 |
| Guias | 6 |
| Guias marcadas como pagas | 5 |
| Guias com referência e SHA do PDF original | 0 |
| Versões urbanísticas cadastradas | 0 |

Esses registros legados não são evidências de arrecadação real; NÃO modificar, reemitir guias, dar baixa ou cancelar processos sem validação institucional.

## Bloqueadores REAIS, agrupados para uma única homologação geral

**P0 — dinheiro e protocolo (caminho comercial):**
Mercado Pago QA possui emissor de sandbox e worker com baixa assinada no código; ainda falta demonstrar um pedido realmente criado no provedor, webhook HMAC real, autenticação da ordem, valor exato, idempotência, original PDF e protocolo em sessão real. Produção não tem conta arrecadadora integrada e aprovada. GOVBR/AR só oferece preparação de consulta GET; emissão e conciliação dependem de documentação e autorização do fornecedor. Não prometer qualquer banco pronto só pelo cadastro.

**P0 — guarda documental:**
Arquivar o mesmo PDF final no R2 com chave canônica, verificar bytes e SHA, reabrir sem reemitir PIX, e restaurar referência histórica apenas com prova de origem, sem substituição silenciosa. Demonstrar recuperação Neon e R2 em ambiente isolado, incluindo tempo e integridade.

**P0 — IA/lei urbanística:**
Validar planta real e recuos com gabarito humano, zoneamento por endereço/perímetro, Quadro I/II e evidências legais oficiais por artigo/página/versão. As regras QA devem permanecer excluídas e AIU(2) provisória não pode virar lei automaticamente.

**P0 — perfis e jornada:**
Fazer E2E autenticado com Master, Admin Prefeitura em modo leitura de processos, Protocolo, Analista, Financeiro, Diretor e Profissional Externo, incluindo comunique-se, vistoria, assinatura, Habite-se e conclusão. Repetir com outra prefeitura real para isolar visualização/escrita entre tenants. Coletar evidências sanitizadas de interface, login, performance, acessibilidade e histórico de auditoria. Testes estáticos de permissões NÃO substituem sessões reais.

**P1 — lançamento comercial e operação contínua:**
Verificar índices/paginação com milhares de processos, observabilidade, backups com restauração, migrações entre branches, retenção LGPD, regras de incidente/rollback, atendimento e plano comercial. Não publicar main antes do gate de dez evidências ser assinado por responsáveis.

## Avanço defensivo desta revisão

O build gate de Preview foi reforçado para executar, sempre, regressões de conector GOVBR GET, leitura CNAB240/OFX, catálogo de fornecedores e isolamento municipal. Arquivo: scripts/qa-preview-build-gate.mjs. Isto melhora a qualidade da publicação, mas não substitui as provas bancárias, jurídicas, documentais e funcionais exigidas.

## Decisão de liberação

- **Código QA:** evoluindo, com qualidade automatizada verificável.
- **Homologação comercial:** NÃO APROVADA (dez provas oficiais pendentes).
- **Produção:** conservar sem alterações e sem novos pagamentos habilitados.
- **Liberação por prefeitura:** começar com um provedor de pagamento realmente contratado e demonstrado; adicionar bancos e GOVBR/AR por adaptadores certificados, mantendo isolamento e rollback.

Os responsáveis pelas evidências são operação de teste da prefeitura, instituição financeira, fornecedor GOVBR e analista jurídico-urbanístico, com apoio técnico do SIGAPRO. Nenhum assistente ou script deve afirmar aprovação deles sem evento ou documento real.
