# SIGAPRO — Auditoria de abertura documental R2 e cobertura de testes backend
**Data:** 07/11/2026 · **Escopo:** branch QA `fix/qa-triagem-analise-pagamento-20261101` · PR #118 DRAFT.

## Falhas estruturais encontradas

1. A consulta de `process_documents` em `server/api/r2-sign-get.ts` conferia SELECT por RLS e a RPC `authorize_technical_document_signing_v1`, mas **não confirmava explicitamente** `is_valid`, `invalidated_at`, `version`, `tenant_id`, `municipality_id` e `file_path`. A RPC existente no Neon QA autoriza acesso ao processo; não valida todos esses atributos do documento. Isso poderia gerar URL assinada de arquivo invalidado se a linha permanecesse acessível. Não há evidência de exploração.
2. A função assinava diretamente no S3 específico da prefeitura sem verificar a existência do objeto. Uma URL presigned tecnicamente válida podia apontar a um objeto ausente; ausência de dados se manifestava só depois, ao abrir o PDF.
3. O endpoint podia processar corpo JSON sem limite e emitir erros brutos do SDK R2 (`UnknownError` registrado uma vez na produção), em vez de um código diagnóstico seguro. O TTL padrão de documento permitia links de seis horas.
4. `api/legislation-open.ts` e a rota equivalente do `vite.config.ts` duplicavam código, usavam políticas de chave distintas, assinavam antes de conferir o objeto e podiam mostrar `error.message` do fornecedor.
5. `vitest.config.ts` executava **somente `src/**`**. Testes já existentes em `server/**/*.test.ts` (incluindo integridade bancária e menor privilégio do webhook) não eram descobertos pelo Quality Gate. Isso enfraquecia a prevenção contra regressões.

## Correções aplicadas na branch QA

- **Autorização de documentos privados:** `authorizePrivateR2DocumentRead` exige agora linha única de `process_documents` filtrada por token/RLS; confere documento vigente, versão positiva, inexistência de invalidação, chave idêntica, município do path, tenant e vínculo com processo, **antes** de chamar `authorize_technical_document_signing_v1`. Chave ou vínculo malformados não são aceitos. A guia DAM original continua usando sua RPC específica `authorize_payment_guide_original_read_v1`; nenhuma cobrança ou documento original foi alterado.
- **Assinatura robusta:** o mesmo `HeadObject` é feito em R2 e no backend S3 próprio da prefeitura; falhas não retornam um link falso. Clientes S3 são liberados no `finally`. Erros são classificados como `R2_OBJECT_NOT_FOUND`, `R2_STORAGE_AUTH_FAILED`, `R2_CONFIG_UNAVAILABLE`, `R2_UNAVAILABLE`, `R2_REQUEST_INVALID` ou `R2_REQUEST_TOO_LARGE`, sem ecoar URL assinada, token ou mensagem interna de provedor.
- **Entrada e links:** corpo do endpoint limitado a 4 KiB; validação compartilhada de chaves rejeita `../`, `//`, barras codificadas, caracteres de controle, paths não canônicos e tamanho excessivo. URLs de documentos privados com duração máxima de 900 s; outros ativos com duração máxima de 3.600 s.
- **Legislação:** `isPublicLegislationPdfKey` reconhece somente PDFs nos diretórios municipais previstos. O handler público usa `getR2EndpointCandidates`, `HeadObject` antes de presign de 900 s, erro seguro e `client.destroy()`. O Vite local invoca **o mesmo handler** da Vercel, sem implementação paralela. Isso melhora consistência, mas não constitui auditoria de publicação jurídica de cada lei.
- **Cobertura de CI:** Vitest agora inclui `src/**/*` e `server/**/*` nos arquivos de teste. Foram atualizadas as fixtures legadas que supunham autorização sem versão/validade do documento, e os testes bancários receberam segredo **fictício de QA**, sem credencial real.

## Evidências automatizadas e limites

- Commit do último lote funcional testado: `d158e6324b29f28622a38d920fae1d7040864b5c`.
- SIGAPRO Quality Gate: **SUCCESS**, 271 arquivos e **1.530 testes aprovados**, TypeScript, ESLint, suite de API privada e build.
- Neon migration validation: **SUCCESS**.
- SIGAPRO OCR isolado - QA: **SUCCESS**, somente ensaio sem integração comercial.
- Novos testes: `src/test/r2DocumentSignedUrlGateQa.test.ts`, `src/test/r2PrivateAuthorizedReadQa.test.ts`; estendidos `src/test/r2PrivateDocumentAuthorization.test.ts`, `src/test/municipalLegislationAssets.test.ts` e suite `server/guide-persistence.test.ts`.
- **Não há smoke de uso autenticado em navegador real neste lote.** A existência de um objeto no R2 é confirmada por HEAD; legibilidade e correspondência jurídica/visual do PDF continuam requerendo inspeção. O erro `UnknownError` não foi reproduzido em produção; o tratamento e o diagnóstico foram corrigidos preventivamente com teste. Os 10 itens de `docs/QA_COMMERCIAL_ACCEPTANCE.json` permanecem pendentes.

## Critérios de liberação municipal ainda bloqueados

1. Dois municípios de ensaio com sessões reais e tentativas de acesso cruzado por ID, arquivo, guia e URL assinada.
2. Guia A4/PIX e boleto, reabertura do **mesmo PDF original** no R2, baixa em sandbox com duplicidade de webhook e sequência oficial do processo.
3. OCR integrado ao SIGAPRO, planta real e escaneada com gabarito técnico, provas de cotas/páginas e conformidade jurídica revisada.
4. Recuperação completa e cronometrada do Neon e dos arquivos R2, política de retenção e controle de acessos.
5. Fluxos Master/Prefeitura/Analista/Externo testados no portal QA com responsividade, assinatura, login e parecer.

**Não houve modificação na produção:** nenhum merge em `main`, migração do Neon PROD, pagamento verdadeiro, troca de credencial, exclusão de arquivos ou alteração de domínio. O release marcado `[deploy-qa]` publica apenas Preview QA, sujeito à confirmação exata de SHA e `READY`.
