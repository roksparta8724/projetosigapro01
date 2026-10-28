# SIGAPRO — webhook Orders: moeda e conciliação QA (28/10/2026)

Somente branch `qa/sigapro-ia-logo-integrado-20261023` e banco Neon QA `br-solitary-sound-b4xlbvs6`. Não é autorização para alterar produção.

## Correção
O GET oficial `/v1/orders/{id}` do Mercado Pago contém `currency: "BRL"`. A versão anterior lia só `currency_id`, registrando moeda vazia e classificando eventos assinados, associados à ordem e valor corretos, como `unmatched_manual_review`.

O worker agora prefere `currency`, mantém compatibilidade com `currency_id` e falha fechado se os dois campos divergirem. Os eventos continuam exigindo assinatura HMAC, município, referência, valor, moeda, ambiente sandbox e consulta do provedor. A RPC continua apenas registrando `verified_manual_review`: **não há baixa automática**.

## Verificação e limites
- Registros anteriores de webhook com moeda vazia permanecem como evidência histórica. Não editar, apagar nem reinterpretar eventos antigos sem nova consulta ao provedor com credenciais da prefeitura e trilha de auditoria.
- A função de baixa real não pode ser homologada usando uma cobrança de teste que não está bancariamente quitada. `status=processed` da ordem isoladamente não é prova universal de crédito municipal. Validar pagamento efetivamente acreditado, valor recebido e conta titular pelo provedor.
- Histórico de produção: seis guias quitadas sem original PDF permanente; uma com `paid=false` e status quitado, e uma sem vínculo completo de município/processo. A consulta `scripts/production-legacy-guide-inventory.sql` confirma bloqueio; preservar originais e comprovantes externos, nunca fabricá-los.
- Guia QA `DAM-PRE-QA-20261028-PIXHMLG2`: snapshot e PIX canônicos persistidos; PDF original real requer upload e leitura com JWT autorizado. CI com PDF sintético não substitui o teste autenticado.
- Aceite multi-prefeitura precisa de dois usuários reais de teste e provas de negação/permitido. Somente a aprovação dessas etapas habilita decisão de liberar produção.

Referências: documentação Mercado Pago API Orders `GET /v1/orders/{id}` e notificações Orders.
