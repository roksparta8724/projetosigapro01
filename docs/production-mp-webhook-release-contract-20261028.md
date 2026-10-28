# SIGAPRO — Conciliação Mercado Pago: contrato de produção (preparação QA)
Esta migração é **forward-only** e foi projetada para novos pagamentos. Não atualiza nem reemite guias anteriores.
Para ser operacional necessita do worker `sigapro_prod_webhook_worker` com conexão **somente ao Neon oficial**, endpoint de webhook implementado e segredos municipais ativos na conta Vercel **production**. Sem esses itens, ela permanece bloqueada de forma segura.

## Condições indispensáveis
- HMAC Mercado Pago, `x-request-id`, `data.id` e `order` válidos; `live_mode=true`.
- GET autenticado `/v1/orders/{orderId}` usando **a credencial da prefeitura** que consta na URL do webhook, sem fallback global.
- Comparação de mesmo município, guia, process_id, id da ordem, payment_id, moeda BRL, valor total e detalhe `processed/accredited` da ordem e transação; sem reembolso/chargeback.
- Original PDF com `document_snapshot`, hash SHA-256 e caminho imutável vinculados ao processo no Neon.
- Confirmação atômica da prova, `payment_guides.paid` e triggers de oficialização, transação rollback em falhas; repetição idempotente.
- Uma prefeitura `municipal_system` não pode receber baixa pelo Mercado Pago do SIGAPRO.
- Eventual webhook que chegue **antes do PDF** fica auditado como `awaiting_original_pdf`, e deve passar por revalidação posterior da mesma ordem, sem nova cobrança.
- A aplicação em produção só deve entrar em uso após o ensaio de webhook real, PDF assinado e sessões de dois municípios.

**Status:** contrato preparado; nenhuma declaração de produção homologada sem o serviço autenticado e testes reais positivos.
