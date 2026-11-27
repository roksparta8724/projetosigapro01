# SIGAPRO QA — integridade real de documentos e prova PIX de sandbox (11/11/2026)

## Causa raiz corrigida em lote
As funções Neon `sync_process_documents` e `upgrade_qa04_architectural_plan_v2` gravavam um falso SHA-256 derivado de `file_path + file_name` quando não recebiam o hash dos bytes. Por isso `process_documents.file_hash` podia ser formalmente SHA-256 sem corresponder ao PDF no Cloudflare R2. Este era um defeito sistêmico, não mero erro de configuração da IA.

### Código integrado
- `server/api/r2-upload.ts`: calcula SHA-256 dos bytes de upload recebidos, grava metadados para documentos R2 e devolve SHA/tamanho.
- `src/integrations/r2/processChunkUpload.ts`: propaga o hash já verificado na finalização das partes de anexos maiores.
- `src/integrations/r2/client.ts` / `src/integrations/r2/storage.ts`: conservam hash e tamanho na resposta de upload.
- `src/pages/saas/ProcessDetailPage.tsx`: transmite `fileHash` em cada novo anexo e na atualização do QA04; recuperações de uploads antigos exigem hash calculado de novo pelo servidor.
- `server/api/r2-list-user-files.ts`: conferência por GET dos bytes R2 com autenticação, escopo estrito do profissional/processo/município e limite de 40 MB; retorna SHA calculado, não inventado.
- `server/ai-project-extract.ts` já nega acesso à IA se bytes R2, tamanho e SHA do documento no Neon divergem.
- Migrações `20261111_document_hash_true_bytes_guard_qa.sql` e `20261111_qa04_upgrade_sha_true_bytes_v1.sql` aplicadas no Neon QA sem alteração de registros existentes. Validado por SQL: a RPC principal não contém mais `digest(_file_path`; a assinatura antiga de 4 argumentos do QA04 não é executável por `authenticated` ou `anonymous`, a nova assinatura com `_file_hash` é permitida ao perfil autenticado somente sob suas condições de autorização.
- Teste de regressão obrigatório `src/test/processDocumentCanonicalShaRegressionQa.test.ts`.

### Banco Mercado Pago
- `server/qa-mercadopago-pix.ts` agora utiliza `payer.first_name = APRO` **somente** no sandbox TEST da Order PIX, conforme guia oficial https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/integration-test/pix . Isto oferece um evento de aprovação de pagamento controlado e não movimenta dinheiro real. Mantidas idempotência, referência da DAM exata, ambiente TEST e assinatura obrigatória no webhook antes da baixa; `server/qa-mercadopago-pix.test.ts` verifica payload.
- A mudança **NÃO equivale** a uma nova ordem emitida ou webhook comprovado; exige sessão autorizada de QA, DAM congelada no R2 e evento real assinado do Mercado Pago após o deploy e testes.

### Limites de homologação que não podem ser encobertos
- O QA04 V2 histórico ainda possui SHA no Neon incompatível com os bytes reais do R2. Não reescrever o histórico; anexar nova versão corretamente versionada para testar o novo caminho. O endpoint antigo falha corretamente com 409.
- Original PDF histórico de DAM sem objeto recuperável com hash exato, não fabricar um novo original.
- Não existe fornecedor bancário habilitado em production no Neon; é obrigatória integração contratada e verificada com credenciais e titularidade da prefeitura. GOVBR/AR só diagnóstico GET, sem conciliação.
- Testes de OCR visual, legislação conferida por município, sessões reais dos perfis, nova assinatura legal e aceite comercial continuam distintos. Não marcar `QA_COMMERCIAL_ACCEPTANCE.json` como aprovado sem evidências.
- Main, Neon PROD, credenciais reais, dinheiro real e documentos históricos preservados. Todo deploy via branch QA e prefixo [deploy-qa].

Este arquivo documenta **trabalho executado e condições objetivas**, não um certificado de liberação comercial.
