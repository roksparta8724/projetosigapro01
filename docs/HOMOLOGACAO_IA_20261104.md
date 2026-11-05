# SIGAPRO — Homologação IA urbanística | ciclo pós-release de 04/11/2026

> **AMBIENTE QA EXCLUSIVO.** Não mesclar em `main` e **não publicar em `sigapromunicipal.com.br`** neste ciclo. O site oficial está no commit de release `0c23d52ab8a066fc6b19fb93c556fabfe77f60cb`. Todas as próximas melhorias e regressões devem ficar nesta branch `fix/qa-triagem-analise-pagamento-20261101`, com PR **draft** contra `main`. O domínio oficial, suas credenciais e o banco Neon branch `production` não devem ser modificados durante os testes.

## Fonte documental real preservada

- PDF original da LC 379/2009 fornecido pelo usuário: `quadros.pdf`, SHA-256 `68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1`.
- Quadro I nas **páginas 36 e 37** do PDF. Quadro II nas **páginas 38–51**.
- Há também JSON histórico de transcrição `SIGAPRO_LC379_2009_matriz_para_conferencia.json`, marcado expressamente como **rascunho de conferência, não legislação ativa**. Não sobrescrever o arquivo nem os dados brutos; sempre versionar correções.
- A validade em 2026 e as modificações legislativas posteriores não foram verificadas; não aplicar automaticamente as regras como lei vigente.

## Auditoria read-only no Neon QA em 04/11/2026

- Projeto Neon `red-sunset-21120522`, branch QA `br-solitary-sound-b4xlbvs6`, database `sigapro_migration_stage_20260923`. **Nunca executar SQL de correção na branch production.**
- `urban_matrix_batch_staging_v1`: **1 lote**, 23 linhas do Quadro I, status `pending_legal_review`. O **snapshot legado** `reviewed_indexes` tem 16 de 23, mas **não representa o progresso final**. Consultado também o histórico imutável `urban_matrix_reading_audit_v2`: seis `reading_verified` adicionais e uma `needs_correction`. **Progresso consolidado real: 22 leituras conferidas, 1 ressalva (AIU(2)), 0 sem tratamento.** Não repetir as conferências antigas.
- **Histórico de índices adicionais, base zero:** 12 ZM-MA comercial, 13 ZM-MA residencial (p.36); 16 ZC residencial, 17 ZC comercial, 20 AIU(1) e 22 ZI (p.37) têm registros posteriores de leitura conferida. O **índice 21, AIU(2), p.37** tem registro explícito `needs_correction` e permanece juridicamente pendente. Nos recuos únicos/exceções, ler notas 1–4 da página 37. A leitura assinada NÃO equivale a homologação da lei.
- **AIU(2), índice 21:** OCR original insuficiente para confirmar CA mínimo; registro de orientação de analista `proposed_value=1`, status `pending_documentary_confirmation`; ato provisório `manual_only_pending_concidade`, versão 1, valor 1. **Não alterar a transcrição, não transformar em lei, não ativar para IA**, até confirmação documental/CONCIDADE.
- `urban_quadro_ii_source_evidence_v1`: **14 páginas**, da 38 à 51, status de origem `machine_unverified` ou `visual_required`; página 43 com orientação girada e leitura insuficiente. `urban_quadro_ii_draft_entries_v1` = **0** e `urban_legal_matrix_imports` = **0**.
- `urban_legislation_documents_v1` = **0**, `urban_legal_evidence_scopes` = **0**. Os documentos jurídicos precisam ser registrados e conferidos por pessoa habilitada antes de permitir comparação urbanística.
- `urban_regulation_versions` QA = **2 registros `active` fictícios** (zona `QA-URBAN-E2E-20261024`, uso `QA_RES`, lei fictícia). São fixtures sintéticos **sem validade legal**: os filtros `isUrbanTestFixtureRule` e `summarizeUrbanLegalReadiness` devem continuar excluindo-os das conclusões reais. **Nunca migrar dados QA para produção.**
- Processo QA `PM-2026-00004`: permanece `triagem`. Planta arquitetônica V1 invalidada e V2 válida (PDF de 16.575 bytes), outros três documentos obrigatórios presentes. Pagamento sintético QA NÃO equivale a confirmação bancária. **Não desbloquear análise técnica apenas para executar a IA**: primeiro concluir fluxo de triagem de modo autorizado ou usar teste isolado sem efeito no processo.

## Critério de aceitação para a IA

1. Diferenciar **o que a planta declara** dos **limites da lei**. Nunca tomar CA máximo da norma como CA medido no projeto.
2. O leitor visual deve devolver cota, unidade, página e citação textual; se medida/locale/unidade/citação não bater, **valor não deve ficar pronto para conferência**. Valores duplicados, sem implantação ou conflitantes são pendência, não média.
3. OCR Cloudflare é texto, não medição geométrica. Recuos exigem planta de implantação e conferência visual real; não calcular por pixels/escala.
4. A IA não aprova nem assina; sem versão legal válida + prova por artigo/página e aceite humano, o resultado deve ser **“não homologado / revisão manual”**.
5. Testar português BR com vírgula decimal, metro/metro quadrado/%, exemplo de unidade errada, valores conflitantes, documentos inválidos e versionamento. Corrigir em QA com testes automatizados e evidência antes de futura release.

## Publicação futura, após vários lotes

- Reusar esta **mesma branch de QA com credenciais isoladas**; manter **uma PR draft**. Push nessa branch pode atualizar preview Vercel automaticamente, o que é autorizado como homologação; **nenhuma publicação em produção**.
- Só preparar novo merge após: CI `Quality Gate` + `Neon migration validation` verdes; testes de múltiplas prefeituras, PDF com recuos reais, segurança, IA visual, leis e fluxo financeiro concluídos; checklist de backup, comparações de banco e rollback.
- O ponto de retomada é **este documento**, `docs/STATUS_UNICO_SIGAPRO.md` e a nova PR draft. A versão oficial `main` fica intocada até nova ordem do usuário.

## Continuação pós-vídeo: Quadro II e índices completos (05/11/2026)
- Vídeo recebido `20261105-0046-11.9595730.mp4` mostra o ambiente de homologação em **Legislação → Quadro I/Quadro II**, navegação por páginas e cards "Pré-preencher e revisar". Não se trata do site oficial.
- Consulta read-only no Neon QA: Quadro I tem **23 linhas** (16 conferidas no snapshot, mais 6 conferências assinadas e **1 ressalva AIU(2)**); Quadro II tem **14 páginas**, **45 sugestões distintas**, mas somente **1** sugestão possui `literal_source_excerpt` de 20 caracteres ou mais e **44** exigem transcrição visual real. **5** sugestões pertencem à página 43, digitalizada lateralmente. Rascunhos jurídicos de categorias `0`, imports jurídicos `0`, escopos de evidência jurídica `0`, regras não fictícias ativas `0`. Não declarar as 45 sugestões como normas.
- Inspeção visual do arquivo original de 110 páginas `quadros.pdf`, SHA-256 já conferido, confirmou que **página 43 está girada** e reúne S1.1 a S1.5; após rotação visual o conteúdo pode ser lido. As exigências de zonas, vias e vagas continuam nas páginas seguintes; não consolidar sem inspeção.
- **Implementado somente em QA:** `src/lib/urbanQuadroIIReviewQueue.ts` com fila desduplicada e estados rascunho, fonte visual, trecho candidato e falta de trecho; interface Quadro II com filtro e botão de revisão da próxima pendência; link do PDF original oficial ancorado na página selecionada, apenas na prefeitura correta. Nenhum desses recursos confirma legalmente o conteúdo.
- **Implementado somente em QA:** `src/lib/urbanPrecheck.ts` passou a rejeitar medição percentual >100% e limites não numéricos; suíte `src/test/urbanAllMetricsQa.test.ts` ensaia as **11 métricas** (mínimo/máximo, evidência e isolamento QA) sem gravação de normas.
- **Implementado somente em QA:** `src/lib/urbanAiReadiness.ts` retorna a cobertura jurídica independente por cada uma das **11 métricas** e só marca disponibilidade quando a versão real ativa contém evidência integral; `UrbanAiReadinessPanel` exibe painel recolhível para acompanhar a prontidão. Não confundir "motor implementado" com "lei vigente já ativada".
- **Fontes públicas verificadas (ainda não importadas e assinadas na prefeitura):** LC 379/2009 (Câmara classifica ativa), LC 440/2011, LC 473/2014, LC 501/2016, LC 566/2022 (restauração/repristinação após revogação de 535/2019 e 548/2019), LC 613/2023 (Plano Diretor atual). O PLC 795/2024 está retirado, não vigente. O catálogo multitenant de leitura foi complementado com LCs **501 e 566**, sem publicar documentos em banco, sem ativar normativas.
- A conversão de PDF da Cloudflare já existente no SIGAPRO usa OCR/texto e **não valida geometria**; eventual uso de modelo com visão exige experimento explícito, guardrails, custos e autorização. Nenhuma credencial visual, pagamento ou flag de produção alterada neste ciclo.
- **Portões para ativação jurídica em QA:** documento oficial com SHA-256, artigo/página/literal por índice, mapa de zoneamento, redação consolidada incluindo alterações vigentes e exceções, vigência aplicável, conferência e autorização por perfil municipal correto, execução de E2E isolada. **Nenhuma dessas condições pode ser substituída por aprovação automática de OCR.**
- Entrega concentrada em **PR draft #118** `https://github.com/roksparta8724/projetosigapro01/pull/118`, branch `fix/qa-triagem-analise-pagamento-20261101`. Não mesclar nem alterar `main`; não tocar no banco Neon `production` nem no domínio `sigapromunicipal.com.br` até ordem explícita. Novas alterações apenas em QA; validar HEAD específico no GitHub Actions.

## Endereço canônico e correção do login QA (05/11/2026)
- **Endereço ÚNICO da homologação para uso humano:** https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app/acesso
- O endereço acima é o **alias estável de branch** Vercel, atualmente vinculado ao deployment QA `dpl_7vcv8eGNnWHR8dVT7Ch3TyctqPMy` (commit `0bbe1b7cd688701ab4a0c34fc82a186133a6f467`). A Vercel move o alias para novos deployments READY da mesma branch sem trocar a URL visível ao usuário.
- **Não compartilhar com o usuário a URL de deployment por commit** `projetosigapro01-<hash>-roksparta8724s-projects.vercel.app` como link primário. Ela pode dar `Invalid origin` caso não esteja na whitelist Neon Auth, além de fragmentar histórico de sessão no navegador.
- **Diagnóstico reproduzido pelo usuário:** navegador em `https://projetosigapro01-384z9arcf-roksparta8724s-projects.vercel.app/acesso` exibia `Invalid origin`. A consulta read-only confirmou que o domínio temporário não constava nos trusted domains Neon Auth QA. Foi adicionado à whitelist do provedor `better_auth` **somente na branch QA** `br-solitary-sound-b4xlbvs6` e conferido como presente. O alias estável também já consta da mesma lista.
- O endpoint `/acesso` no alias estável respondeu **HTTP 200** via Vercel. Isso prova a entrega da página, não um login autenticado completo; aguarda teste pelo usuário, sem coletar sua senha.
- **Banco QA:** `red-sunset-21120522` / `br-solitary-sound-b4xlbvs6` / `sigapro_migration_stage_20260923`. Nenhum registro ou tabela foi copiado, excluído ou modificado nesta correção. O login com a mesma conta e o mesmo banco deve preservar dados do servidor; sessões em cookies/localStorage são ligadas ao domínio e podem exigir nova autenticação ao trocar de host.
- Não alterar `main`, banco Neon `production` ou `sigapromunicipal.com.br` neste ciclo. Toda publicação permanece somente em preview com PR draft #118.
- Validação final a fazer na interface autenticada: abrir alias estável em aba comum, entrar com a conta QA existente, conferir dados do Quadro I e Quadro II antes de salvar alterações.
