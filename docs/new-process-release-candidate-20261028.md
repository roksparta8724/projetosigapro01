# SIGAPRO — aceite de uma prefeitura nova (28/10/2026)
Este é o escopo de liberação para **processos futuros**. Os processos e guias antigos eram testes e não bloqueiam o lançamento, mas nenhum pagamento atual poderá ser declarado sem crédito verificado.

## Provas concluídas
- QA `ba6efb8a0944e8f68dc96839e06fd4d35fd084e2`: GitHub Quality Gate SUCCESS e Neon Migration SUCCESS; Vercel preview READY.
- Testes de SQL reversíveis em QA: recuperação de documentos negada entre prefeituras, contrato e processos de dois municípios revertidos, análise urbanística por perfil e isolamento, Habite-se/assinatura com papel `authenticated`, DAM congelado e original imutável, rollback.
- Esquemas e RPCs essenciais de pagamento/PDF, análise, Habite-se e aprovação existem em QA e produção.
- QA: primeira prefeitura tem contrato, analista, financeiro, administrador, lei ativa e Mercado Pago TEST ativo; segunda ainda sem arrecadação, financeiro e admin ativos.
- Produção: nenhuma prefeitura possui arrecadação ativa; leis urbanísticas ativas ausentes; segunda prefeitura não tem contrato ativo. Isso é condição de configuração do município, não falha automática do código.

## Gate único de onboarding
Rodar `scripts/municipal-new-process-activation-gate.sql` explicitamente na branch Neon desejada. A consulta é somente leitura e não acessa guias antigas. `READY_FOR_AUTHENTICATED_PAYMENT_AND_PERMIT_E2E` significa **apenas** que a configuração existe, não que o banco creditou um PIX nem que o PDF foi arquivado.

## Aceite positivo indispensável antes da publicação oficial
1. Município com contrato, admin, analista, financeiro, diretor designado no organograma e legislação própria ativada.
2. Provedor real da prefeitura: SIGAPRO com Mercado Pago ou integração municipal com conexão homologada. Webhook de conciliação de crédito real deve operar **em produção**, ser multi-tenant, verificar HMAC, valor, payment_id, status `processed/accredited` e ser idempotente. **Hoje o reconciliador automático validado é exclusivo QA**.
3. Um protocolo completamente novo com os quatro documentos obrigatórios, DAM válida, upload+reabertura autenticados do PDF original (SHA-256), pagamento creditado pelo provedor, oficialização única e recibo auditável. Não usar guia legada.
4. Encaminhamento, comunique-se, análise checklist, assinatura eletrônica do diretor e alvará de aprovação; Habite-se independente com vistoria, fotografias, taxas e assinatura.
5. Sessões reais de duas prefeituras, papéis externos/internos, tentativas cruzadas negadas e sem registros ou documentos compartilhados.
6. Migrations revisadas em clone/teste da produção (a branch QA está 743 commits à frente de `main`; não fazer merge em massa), backup/rollback comprovado e deploy do SHA aceito.

**Situação:** QA apto aos testes finais; produção bloqueada até os aceites acima e ativação bancária individual. Nenhuma alteração de dados financeiros oficiais é autorizada por este documento.
