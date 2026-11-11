# SIGAPRO — Comprovação comercial por evidência técnica (11/11/2026)

## Escopo e separação de provas

**R2 armazenamento:** a prévia Vercel executa `scripts/qa-r2-roundtrip.mjs`: PUT de PDF fictício pequeno sob prefixo descartável `sigapro-qa-e2e-disposable/`, HEAD de tamanho/MIME/SHA, GET com hash SHA-256 de todos os bytes, DELETE e verificação de ausência. Essa é **prova física do transporte R2**, não prova de que um arquivo de um processo municipal foi anexado e interpretado. A rotina só roda na branch QA com VITE_SIGAPRO_NEON_ISOLATED=true; devolve NOT_VERIFIED_CONFIG/SCOPE quando não é possível comprovar. Erro de armazenamento ou exclusão bloqueia a publicação.

**Fluxo do banco:** `neon/qa/rollback_workflow_probe_20261111.sql` passou ao concluir as quatro etapas documentais, triagem, análise e alvará rascunho; registro revertido. Não equivale a arquivos R2 persistidos.

**IA:** benchmark de PDF do SIGAPRO em `api/ai-assistant?action=qa-architectural-benchmark` exige JWT real e função de QA; não substituir por saída sintética de um modelo nem afirmar que um arquivo foi lido sem o hash, página e trecho reconhecidos. O OCR local dos PDFs fictícios não comprova o serviço hospedado.

**Assinaturas:** `request_construction_permit_director_signature_v1` exige agora um `signatures` autenticado do analista responsável, igual hash de documento, município correto e `reauthenticated_at` registrado. Não simular assinatura de pessoa real nem inserir evidências fictícias como válidas. O ensaio de flag falsa foi rejeitado e revertido. A prova fim a fim requer uma sessão do profissional/analista/diretor de homologação e efetiva reautenticação.

## Critério de conclusão

- Só marcar R2 transporte PASS quando log do build retornar literalmente `SIGAPRO_QA_R2_ROUNDTRIP PASS` para o SHA do deploy.
- Só marcar R2 documentos de processo PASS com upload autenticado de cada PDF do kit, GET do mesmo objeto, hash SHA e registro documental pertencente ao processo QA, seguido de exclusão controlada após o ensaio.
- Só marcar IA PASS com saída do SIGAPRO para esses mesmos PDFs, confrontada com gabarito dos recuos e com evidências do endereço/zoneamento.
- Só marcar assinatura PASS com trilha auditável de reautenticação e assinaturas do analista e diretor de homologação e alvará explicitamente não oficial.
- Não promover para `main` por simples CI verde.

## 11/11/2026 — Correção do gate de prova física

O primeiro build de prova R2 sinalizou `NOT_VERIFIED_SCOPE` e mostrou que `vite build` ainda podia passar sem comprovação real. O gate foi alterado para reutilizar `qaDatabaseEndpointMatches`, que identifica a própria base Neon QA sem presumir formato fixo do hostname, e **qualquer resultado diferente de PASS impede a publicação**. A versão deve ser publicada com a marca de commit `[deploy-qa]` exigida pelo projeto e os logs do Vercel precisam mostrar `SIGAPRO_QA_R2_ROUNDTRIP PASS`. Até lá, R2 permanece NÃO COMPROVADO.

## Comprovações reais executadas em 11/11/2026

**R2 — gravar, ler, conferir e apagar:** Build Vercel `dpl_7bEir95RHMUyhPUE2LsVTecfZLAC`, commit `cd7f0f623d5ecd2fda6f4504e625ee5b914eac9a`, log literal `SIGAPRO_QA_R2_ROUNDTRIP PASS`. Foi executada escrita R2 de PDF descartável, HEAD/GET, SHA-256 e DELETE confirmado no prefixo efêmero QA. A leitura histórica de um PDF DAM antigo segue `NOT_VERIFIED_ORIGINAL_OBJECT_MISSING` e NÃO pode ser rotulada de recuperada.

**Leitura de PDF real no SIGAPRO:** GET `/api/ai-assistant?action=qa-r2-reading-proof` na prévia autenticada por Vercel retornou `status=verified`, `r2BytesVerified=true`, `aiLocalReadVerified=true`, `pagesRead=3/3`, `setbacksPassed=3/3`: frente 5 m, lateral 1 m e fundos 12 m, todos iguais ao gabarito da planta QA04. Modo `native_text`, sem chamadas a fornecedor externo, **não é prova de modelo visual IA pago nem aprovação legal**.

**Assinatura:** Neon QA contém `PM-2026-00002` com `process_construction_permits.status=signed`, assinatura eletrônica de Analista e Diretoria, hash SHA idêntico ao dos blocos, identidade municipal consistente e reautenticação registrada. Função pública `verify_process_artifact_signature_public_v1` confirmou alvará assinado. Agregado da base QA: 3 assinaturas técnicas e 4 diretoria, sete com reautenticação+hash. Não se trata de nova cerimônia assinada na sessão do chat.

**Proteção adicional implementada em QA:** `neon/migrations/20261111_public_signature_verifier_requires_signed_proof_qa.sql` agora bloqueia publicamente blocos `concluido` sem assinatura real no livro `signatures` com SHA, tenant, município e `reauthenticated_at`. Exercício transacional de documento forjado foi rejeitado tanto na solicitação de alvará quanto na verificação pública; todos os dados fictícios revertidos.

**O que continua não comprovado:** leitura de um documento novo pelo modelo visual de IA externo após login de Analista; nova cerimônia de assinatura no navegador; PDF DAM histórico ausente. Nenhuma dessas três lacunas deve ser camuflada com testes unitários, dados fabricados ou declarações de liberação comercial integral.
