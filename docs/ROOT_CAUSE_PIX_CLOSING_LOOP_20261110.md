# SIGAPRO QA — causa raiz da impossibilidade de conciliar PIX (10/11/2026)

**Correção de código e banco efetivamente realizada, sem produção**. Este registro substitui os diagnósticos genéricos repetidos da integração de PIX de homologação.

## Defeito comprovado — três contradições entre módulos

1. `server/qa-mercadopago-pix.ts` armazenava a ordem de emissão hospedada em `qa_pix_sandbox_orders_v1`, mas `mp_qa_webhook_settle_v1` exigia uma ordem já existente em **`mp_qa_pix_orders_v1`**. Não havia sincronismo entre os livros.
2. `qa_pix_sandbox_order_v1` exigia que `payment_guides.bank_reference` **já existisse para reservar** uma ordem de PIX, impossível para uma guia nova sem ordem emitida.
3. `external_reference` enviada ao Mercado Pago adicionava o sufixo `-PIX-QA`, mas `mp_qa_webhook_ingest_v1` só conciliava quando `external_reference = payment_guides.guide_number` exatamente.
4. `ExternalPaymentsPage.tsx` visualizava documentos de QA como HTML sem jamais armazenar o PDF no R2; a função `mp_qa_webhook_settle_v1` exige `original_pdf_key`, hash SHA-256 e snapshot imutável antes de qualquer baixa.

A soma desses mecanismos impedia a jornada completa mesmo com testes isolados verdes. **Não era apenas falta de API/credencial do banco**.

## Lote corretivo unificado

- Nova migração QA `neon/migrations/20261110_qa_pix_ledger_canonical_bridge_v2.sql` substitui `qa_pix_sandbox_order_v1` sem excluir tabelas ou ordens existentes. Em uma só transação com lock da guia, registra reserva nos dois livros e, quando há order, paymentId e QR provider válidos, vincula os metadados à guia canônica. Nunca marca `paid=true` nem oficializa processo.
- Proteção por `session_user=sigapro_qa_webhook_worker`, com EXECUTE negado a `authenticated` e `anonymous`. Isolamento municipal, status pendente, convênio de teste ativo, centavos exatos, idempotência e rejeição de boleto concorrente são exigidos. Reserva legada conflitante não é apagada nem substituída por ordem nova.
- `server/qa-mercadopago-pix.ts` envia `external_reference` igual à guia canônica, permitindo que a notificação bancária assinada encontre seu próprio lançamento.
- A visualização do PIX QA usa metadados persistidos no Neon e a ordem consultada no provedor. Se **order + payment + QR** correspondem, a DAM de homologação (com avisos “NÃO PAGAR”) é congelada e arquivada no R2 com SHA, usando `archiveAndOpenGuide`. Qualquer imagem/PIX fictício é recusado; a prévia sem emissão continua apenas HTML não pagável. O PDF já arquivado é reaberto, nunca regenerado.
- Cobertura nova `src/test/qaPixBankEndToEndBridge.test.ts` mais ajustes nos testes `qa-mercadopago-pix.test.ts`, `realBankDamOriginalGate.test.ts` e `isolatedProtocolPaymentFlow.test.ts`. O gate de Vercel QA inclui essa suíte.
- **Banco Neon QA foi migrado por CREATE OR REPLACE + REVOKE/GRANT em transação**, preservando todos os registros. Consulta posterior: o worker executa a função; `authenticated` e `anonymous` não executam; `qa_pix_sandbox_orders_v1` continuou com 0 registros e `mp_qa_pix_orders_v1` com 2, sem dar baixa nem alterar ordem antiga.
- Campo Limpo Paulista tem um guia `DAM-PRE-QA-20261027-PIXHMLG1` de R$ 1,00 pendente, com registro antigo no livro `mp_qa_pix_orders_v1` em `pending`, `provider_post_started_at` não nulo e order id desconhecido. **Não remover ou reiniciar esse registro** sem consulta de reconciliação autenticada ao provedor com a chave original; duplicar a tentativa poderia criar outra ordem. Emissões em guias limpas usam o novo livro espelhado.

## Prova e limite

- Quality Gate, testes bancários e validação de migrações aprovados no SHA corrigido.
- Publicação somente no alias estável Preview da branch QA com o commit correto e flag [deploy-qa]; **main e Neon PROD não modificados**.
- O funcionamento do algoritmo está corrigido em código e em Neon QA. **Não chamar pagamento conciliado nem homologação comercial real sem uma nova order do Mercado Pago e um evento assinado com status de crédito efetivo**, seguido por abertura física do PDF original no R2 e protocolo gerado pelo gatilho.
- As duas ordens QA legadas exigem exame de provedor, não limpeza de dados.

Essa causa raiz e sua correção têm prioridade sobre adicionar novos dashboards, novos fornecedores bancários ou listas de tarefas.
