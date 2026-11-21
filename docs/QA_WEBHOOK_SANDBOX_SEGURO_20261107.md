# SIGAPRO — webhook Mercado Pago Orders em homologação QA

**Escopo:** somente Vercel **Preview** da branch
`fix/qa-triagem-analise-pagamento-20261101`, Neon QA
`br-solitary-sound-b4xlbvs6`, database
`sigapro_migration_stage_20260923`. Nada neste fluxo pode usar
`main`, a branch Neon de produção ou credenciais de produção.

## Implementação

O callback é acessível em
`/api/mp-qa-webhook?municipality_id=<uuid>&type=order&data.id=<orderId>`.
A entrada é reescrita em `vercel.json` para
`/api/mercadopago?action=qa-webhook`, compartilhando a função
serverless Mercado Pago existente. Isso mantém o projeto dentro do
limite de **12 funções** no Vercel Hobby, sem introduzir um 13º arquivo
serverless. A regra `git.deploymentEnabled` continua `false` na
branch QA para evitar builds desnecessários.

O handler `server/mp-qa-webhook.ts` exige:

1. **Ambiente restrito:** `VERCEL_ENV=preview` e
   `VERCEL_GIT_COMMIT_REF` igual ao nome exato da branch QA.
2. **Banco fixo:** `SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL` com role
   `sigapro_qa_webhook_worker`, host do endpoint exclusivo
   `ep-misty-breeze-b4ri8ig0[ -pooler]` e banco QA indicado. SSL
   `verify-full`, sem comandos de role/opções extras na string.
3. **Auditoria por conexão:** antes de ler as credenciais municipais,
   executar `assertQaWorkerLeastPrivilege` na própria sessão PG;
   recusar `BYPASSRLS`, superuser, membros privilegiados, acesso
   direto a perfis/documentos/processos ou escrita financeira.
   `sigapro_prod_webhook_worker` **nunca** é aceito na QA.
4. **Credenciais por Prefeitura:** recuperar somente a conexão
   `mercado_pago/test/active` da Prefeitura indicada, por
   `mp_qa_webhook_connection_v1`; decifrar em memória com
   `MUNICIPAL_PAYMENT_MASTER_KEY`. Nunca usar token global.
5. **Assinatura e origem:** aceitar apenas `live_mode=false`, tópico
   Orders e evento HMAC-SHA256 válido com `x-signature`,
   `x-request-id`, `data.id` da URL/corpo e timestamp recente.
   Mercado Pago documenta essa validação. Evento sem prova é
   recusado antes da leitura bancária.
6. **Consulta independente:** refazer GET de Orders na API oficial
   do Mercado Pago com a credencial municipal da QA. O helper existente
   valida identificadores, método PIX/boleto, moeda BRL, centavos,
   estado `processed/accredited`, ausência de estornos e coerência
   da transação.
7. **Recibo e baixa condicionada:** gravar recibo via
   `mp_qa_webhook_ingest_v1`; somente com recibo casado, crédito
   efetivo e dados válidos chamar `mp_qa_webhook_settle_v1`. A
   função do Neon confere Prefeitura, guia, identificadores
   bancários, objeto PDF original/sha256, valores, prova do
   pedido PIX, assinatura e idempotência. Sem PDF original,
   a compensação permanece bloqueada.
8. **Confidencialidade:** logs genéricos, sem registrar corpo,
   dados pessoais, JWT, credenciais, chaves criptográficas ou
   conteúdo do projeto.

## Configuração verificada sem ler segredos

Na Vercel, as três variáveis abaixo foram verificadas como
**Preview / branch QA atual**:

- `SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL`: **criada** para o worker
  restrito do Neon QA, tipo `sensitive`, sem expor a senha.
- `MUNICIPAL_PAYMENT_MASTER_KEY`: escopo da variável **existente**
  movido da branch QA antiga para a branch ativa. O valor foi
  preservado, sem leitura nem troca.
- `SIGAPRO_BANK_CHARGE_SIGNING_SECRET`: escopo da variável
  **existente** movido da branch QA antiga para a branch ativa.
  O valor foi preservado, sem leitura nem troca.

A branch de Preview antiga
`qa/sigapro-ia-logo-integrado-20261023` deixa de receber essas
duas variáveis nas **novas implantações**; os deployments antigos
já publicados não foram reimplantados nem alterados. As configurações
de **production não foram modificadas**.

O `GET /api/mp-qa-webhook` indica se a URL restrita do worker e a
chave de criptografia estão presentes (`configured`), sem revelar
seus conteúdos; isso não atesta que a Prefeitura possua conexão
`mercado_pago/test/active`, saldo no provedor ou crédito real.

## Testes automáticos

`server/mp-qa-webhook.test.ts` valida: gate de branch/ambiente,
URL fixa de banco, role QA específico, SSL, recusa de opções de
conexão privilegiadas, falta de credencial, proibição de `live_mode`
produtivo, validação HMAC e reconsulta ao provedor por contrato,
campos obrigatórios para liquidação, health fail-closed,
roteamento no mesmo endpoint e não ultrapassar 12 funções.
`server/mp-webhook-signature.test.ts` e os testes existentes de
centavos e integridade cobrem partes adicionais.

## Critérios ainda não comprovados

- **Webhook realmente enviado pelo Mercado Pago em sandbox**,
  assinado pela conta municipal, com observação de uma ordem
  `processed/accredited` e nova baixa `pending -> paid`.
  Exige credencial de teste ativa e notificação real.
- Reenvio de evento assinado duplicado, estorno e falhas de rede,
  verificados contra a API real e o recibo no banco.
- PDF original R2 existente e recuperável, não apenas metadados.
- Confirmar que as duas variáveis de criptografia preservadas
  correspondem às credenciais já cifradas na QA por meio de
  um ensaio efetivo. Sem esse teste, não afirmar funcionamento.
- Rolagem do endpoint em Preview **READY** do SHA que inclui
  esta implementação e `GET` de saúde. O Preview anterior
  `b5cc7d1` ainda não contém a rota.

**Não habilitar webhook ou conexão na produção por esta etapa.**
A função `officialize_preprotocol_v1` da produção ainda exige
tratamento P0 controlado, e os dez aceites comerciais não estão
aprovados.

## Verificação adicional: conexão efetiva com o worker QA

Foi executado **SELECT real com login `sigapro_qa_webhook_worker`** no Neon
QA, não apenas consulta de metadados como administrador. O banco retornou
`current_user=sigapro_qa_webhook_worker`, `BYPASSRLS=false`,
`INHERIT=false`, ausência de membro `neon_superuser`, sem acesso direto
a `profiles` ou escrita em `payment_guides`, e `EXECUTE=true`
somente nas RPCs de ingestão e liquidação esperadas. A query **exata**
`MP_WORKER_PRIVILEGE_AUDIT_SQL` do servidor foi executada usando a
mesma credencial de papel e todos os oito controles retornaram `false`
(valor permitido). Isso reduz o bloqueio sobre a conta técnica ativa.
Não regulariza a conta legada de produção copiada na QA.

**Inventário agregado em QA:** uma conexão municipal
`mercado_pago/test/active`, com token cifrado e segredo HMAC cifrado.
Nenhum valor de segredo, CPF ou dado bancário foi lido ou registrado.
O dado indica preparação, **não** que os bytes cifrados já tenham sido
decifrados com sucesso no novo Preview.

**Limite Hobby corrigido:** a primeira entrada independente
`api/mp-qa-webhook.ts` elevaria de 12 para 13 funções e foi
**retirada**; a rota existe agora como rewrite em `vercel.json` para
`api/mercadopago.ts?action=qa-webhook`, sem alterar a API produtiva.
Os testes de regressão de orçamento serverless passaram no commit
que integrou a rota. O código final também inclui testes de
recibo/credito/reenvio/PDF original feitos com objetos simulados;
eles não substituem a conferência pelo próprio Mercado Pago.

**Pendência de operação:** a Vercel só aplica novas variáveis e rotas
em uma **nova versão READY**. O Preview anterior `b5cc7d1` não possui
esta implementação. Conferir CI, publicar somente QA e verificar
`GET /api/mp-qa-webhook` antes de anunciar o endpoint como ativo.
