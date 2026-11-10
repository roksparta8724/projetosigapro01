# SIGAPRO — STATUS ÚNICO E PLANO DE ENTREGA
> Linha-base inicial de **04/11/2026**; continuidade da QA atualizada até **08/11/2026**. Este documento é a **fonte oficial de continuidade do desenvolvimento**. Mantenha-o sincronizado após cada alteração relevante. Nunca dependa exclusivamente do histórico de conversas do ChatGPT.

## Ambientes, links e escopo
- **Repositório:** https://github.com/roksparta8724/projetosigapro01
- **Ramificação ÚNICA de trabalho e homologação:** `fix/qa-triagem-analise-pagamento-20261101`
- **Pull request central de integração e entrega:** https://github.com/roksparta8724/projetosigapro01/pull/118 (**draft**, NÃO mesclar automaticamente). PR #117 é histórico; as alterações atuais permanecem na PR #118.
- **ENDEREÇO ESTÁVEL da homologação (alias automático da Vercel, acompanha os novos commits da mesma branch):** https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app
- **Projeto Vercel:** `projetosigapro01`; produção oficial `main` → `sigapromunicipal.com.br`.
- **Neon QA usado nas conferências e migrações:** projeto `red-sunset-21120522`; branch `br-solitary-sound-b4xlbvs6`; banco `sigapro_migration_stage_20260923`. **NÃO confundir com Neon de produção sem verificar a conexão.**
- **Ponto de partida desta consolidação:** `main` em `0b1eefb3a455fcb3ebc6ae66253f63d96de3aa91`; branch QA em `e187f5f6e8f20a09d0b0fc1db99e2b6159e5631e`, **174 commits à frente, 0 atrás**. Nenhuma alteração de produção foi feita nesta consolidação.
- **Última validação do código funcional anterior ao documento:** Quality Gate https://github.com/roksparta8724/projetosigapro01/actions/runs/41908345230 (aprovado), Neon migration validation https://github.com/roksparta8724/projetosigapro01/actions/runs/41908345438 (aprovado); Vercel preview READY. **CI não é teste E2E do provedor/banco.**

## Decisão principal
1. **Não abrir mais branches de funcionalidades paralelas.** Todas as correções entram na branch QA acima, com Quality Gate e teste na URL estável.
2. **Não pedir novas credenciais sem verificar as antigas.** Cloudflare R2 armazena PDFs; Workers AI REST é um provedor de IA. **Não são Claude**. O leitor de plantas foi adaptado para Workers AI com extração textual + origem citada, e Claude/OpenAI opcionais quando configurados.
3. **Configuração Cloudflare reaproveitada em 04/11:** `SIGAPRO_AI_PROVIDER`, `SIGAPRO_CF_ACCOUNT_ID`, `SIGAPRO_CF_API_TOKEN` foram transferidas de escopo da branch antiga `workbench/sigapro-matriz-urbanistica-importacao-20261030` para a branch QA atual **preservando os valores**. Produção não foi alterada. Nenhum token deve ser colado em conversas, issues, logs ou commits. O **redeploy posterior a essa alteração** deve ser verificado com conta autenticada antes de declarar Workers AI funcional.
4. **Produção somente quando pronta para pessoas reais:** backup, identificação inequívoca de banco de produção, plano de migrações, integrações financeiras, permissões e 2 prefeituras QA + rollback. **Não promover preview diretamente** nem apontar dados de QA para produção.

## Implementado no código de QA (não implica homologação funcional)
- Protocolo/triagem/análise e gates de pagamento, despacho e versões de documentos; histórico e autorização municipal.
- Legislação: cadastro individual de PDF/versão pelo **Admin da Prefeitura**; Master somente consulta; revisão de Quadro I e Quadro II, transcrições, provas por artigo/página/hash, rascunhos versionados, parâmetros técnicos e checklist de prontidão.
- Comparação numérica de **11 métricas** com resultados consultivos, sujeito a normas oficiais ativadas e evidências válidas.
- **AIU(2) CA mínimo = 1,00** exclusivamente como **critério técnico operacional provisório**, conforme analista informado pelo usuário, **pendente de CONCIDADE**; original OCR `01` preservado. **NÃO ativar como lei/decisão automática.**
- R2 municipal privado, upload/download PDF; leitura de projeto na Análise Técnica com conferência de página/trecho, seleção humana, rejeição de PDF invalidado ou substituído; Workers AI PDF Markdown = **LEITURA TEXTUAL**, não medição confiável de recuos. Desenho visual exige leitor visual adequadamente habilitado, testes reais e prova das cotas; nunca inferir medidas por escala ou pixel.
- Quality Gate, TypeScript e build Vercel aprovados. **Vercel preview serve somente como QA.**

## Evidências de banco QA (04/11/2026)
- Processo fictício **04 / PM-2026-00004**: em **Triagem**; planta arquitetônica V2 com implantação/recuos **válida**, V1 **invalidada**; guia de QA fictícia **não comprova pagamento bancário**. Não furar triagem para acelerar o teste.
- Município Campo Limpo Paulista: **sem regras urbanísticas oficiais completas ativadas**; histórico contém regra de QA que deve ser excluída dos diagnósticos. Sem evidências jurídicas completas, **não declarar conformidade legal**.
- Quadro I contém pendências de conferência; Quadro II requer revisão individual de categorias e vigência, não ativação em massa.

## Bloqueios para declarar SIGAPRO 100% homologado
1. **Workers AI / R2:** testar, com sessão autorizada no alias QA, leitura do PDF real V2 armazenado; confirmar resultado completo, citação literal, versão de arquivo e erros seguros; comparar contra o PDF visualmente. A liberação de Workers AI em QA estava ausente e a configuração foi reatribuída nesta consolidação, mas **não houve ainda teste real de chamada com arquivo na prévia reimplantada**.
2. **Leitura de geometria:** conversão de PDF para Markdown não comprova recuos. Validar leitor multimodal real e **revisão humana do projeto arquitetônico** antes de usar recuos, TO, permeabilidade ou CA em parecer.
3. **Legislação oficial:** preencher e conferir Quadro I/II, registros jurídicos individuais e evidências, validar uso/zoneamento e datas de vigência e só ativar versões comprovadas. **CONCIDADE pendente para revisão de AIU(2).**
4. **Processo administrativo:** concluir triagem de processo elegível, despacho e análise como perfis autorizados, registrar auditoria e simular correção documental.
5. **Financeiro real:** pagamento PIX/boleto, webhook idempotente, baixa automática e arquivo DAM imutável com **cada banco por prefeitura**, sem confundir pagamento fictício com homologação.
6. **Produção:** identificar banco de produção (NÃO presumir que `sigapro_migration_stage_20260923` seja o mesmo), backup/rollback, executar migrações necessárias após validação em cópia de produção, checklist de acesso de 2 prefeituras e aceites funcionais. Só então integrar a PR #117 à `main`.

## Processo operacional para quem retomar depois desta conversa
1. Abrir **este documento** + PR #117 e consultar commits mais recentes na branch QA. Identificar o que efetivamente mudou depois de 04/11.
2. Verificar CI por SHA exato (quality-gate + migration validation), Vercel preview e conexão Neon QA. **Nunca confundir build aprovado com homologação E2E**.
3. Corrigir na **mesma branch** e atualizar este status e a PR. Evitar múltiplos ambientes temporários, novos modelos pagos ou alteração na produção sem os gates acima.
4. No ChatGPT, iniciar nova conversa com: **“Continue o SIGAPRO a partir do arquivo `docs/STATUS_UNICO_SIGAPRO.md` e da PR #117, no repositório `roksparta8724/projetosigapro01`. Execute na branch QA consolidada e me diga o próximo bloqueio verificável.”**
5. Ao concluir o aceite, fazer merge seguro e implantar **uma única release de produção** com rollback documentado. Depois usar `main` como ramo único contínuo e uma branch QA apenas para testes controlados.

**Regra do produto:** nunca inventar valores urbanísticos nem afirmar 100% de aprovação sem evidência, nunca dar permissão de escrita ao Master em normas municipais, nem conceder assinatura/baixa financeira automática com dados fictícios.


## Ensaio de publicação 04/11/2026

Foi obtida autorização para excluir **somente duas branches descartáveis**, e elas foram excluídas com verificação prévia. Backup oficial criado no Neon: `br-small-silence-b40dbpym`; ensaio da produção: `br-lucky-credit-b4evfnn0`. O ensaio comprovou 117→127 tabelas e 280→312 funções, sem alterar os 3 processos, as 6 guias, os 16 documentos nem seus status. Migrações registradas e ensaiadas; Quality Gate e validação Neon aprovados no SHA `651b5fb0028f40240e8087ab8d0607ef24909c95`.

**Consulte a ordem exata, a estratégia de segurança e o rollback:** [RELEASE_SIGAPRO_20261104.md](./RELEASE_SIGAPRO_20261104.md). Não alterar a branch Neon `production` ou mesclar na `main` antes da autorização de migração de funções/triggers e dos gates de integridade. Site oficial permanece anterior.

## ✅ Migrações APLICADAS à produção Neon (04/11/2026, continuação)
- **Autorização explícita do usuário:** resposta “sim” para aplicação das 22 migrações previamente ensaiadas, inclusive alterações de funções e triggers, preservando backup, verificando integridade e condicionando publicação no site aos gates.
- **Executadas agora, de fato:** 22 de 22 migrações, exatamente na ordem de `docs/RELEASE_SIGAPRO_20261104.md`, obtidas do SHA funcional `534ed10414ec8bb95707c4e4df81ff5aa42149c9`, cada arquivo em uma transação própria; comandos exteriores BEGIN/COMMIT tratados pelo executor. Todas as transações retornaram sucesso.
- **Destino confirmado:** projeto Neon `red-sunset-21120522`, branch **production** `br-summer-surf-b4s88rv5`, banco `sigapro_migration_stage_20260923`. A cópia QA `br-solitary-sound-b4xlbvs6` não foi alterada por esta operação.
- **Backup conservado:** branch `br-small-silence-b40dbpym` (sem compute, portanto uma consulta SQL direta nela retorna endpoint inexistente); cópia de ensaio `br-lucky-credit-b4evfnn0` também conservada. **Não apagar nenhuma delas.**
- **Verificação read-only pós-migração:** produção agora tem **127 tabelas públicas e 312 funções públicas**, idênticas à cópia do ensaio. Preservados **3 processos, 6 guias, 16 documentos, 18 movimentações, 70 auditorias, 2 municípios e 26 triggers operacionais**. Fingerprints de ID+status para processos e guias e ID+hash+versão+validade dos documentos coincidem com os valores anteriores e com a cópia do ensaio.
- **Verificação de acesso:** RLS ativada nas tabelas centrais e jurídicos sensíveis; writer `save_urban_precheck_run_v6` executável por `authenticated`, sem grant de `anonymous`; funções v4/v5 sem grant de `authenticated`; `authorize_technical_document_signing_v1` restrita a `authenticated`. O role PostgreSQL correto é `anonymous` (não `anon`).
- **Observação adicional de hardening:** `save_urban_legal_matrix_import_v1` e outras rotinas legadas com SECURITY DEFINER preservam EXECUTE implícito de PUBLIC, mas o código da primeira verifica `current_role_code()`, `current_profile_id()` e `has_tenant_access()` antes de inserir. Revogar EXECUTE público e regravar grants individualmente deve ser tratado como melhoria versionada/testada, não como prova automática de vulnerabilidade. Testes live como `anonymous` não ocorreram porque a conexão disponível não fornece senha desse role; não afirmar smoke de sessão anônima.
- **Nenhuma norma ativada:** `public.urban_regulation_versions` continua sem versões (0 ativadas). AIU(2) segue provisório até CONCIDADE; sem emissão de parecer legal automatizado.
- **Release da aplicação:** PR #117 permanece **draft**; `main` e o domínio `sigapromunicipal.com.br` **não foram publicados nesta etapa**. O código visual da PR está em QA e o leitor PDF em produção depende de habilitação explícita `SIGAPRO_PDF_AI_PROD_ENABLED=true` (ausente por padrão). O commit funcional anterior `534ed104` passou Quality Gate + Neon migration validation. O deploy QA correspondente está READY.
- **Próximas verificações antes da publicação:** autenticação/smoke em produção com perfis reais sem alterar processos, autorização de 2 municípios, leitura assistida do Projeto V2 do processo QA 04, sem furar triagem, conferência do Quadro I/II, transação PIX/boleto real com webhook idempotente, logs/rollback. Não declarar homologação funcional sem essas evidências. Não promover preview diretamente nem importar dados QA ao banco oficial.

## Endereço canônico e correção do login QA (05/11/2026)
- **Endereço ÚNICO da homologação para uso humano:** https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app/acesso
- O endereço acima é o **alias estável de branch** Vercel, atualmente vinculado ao deployment QA `dpl_7vcv8eGNnWHR8dVT7Ch3TyctqPMy` (commit `0bbe1b7cd688701ab4a0c34fc82a186133a6f467`). A Vercel move o alias para novos deployments READY da mesma branch sem trocar a URL visível ao usuário.
- **Não compartilhar com o usuário a URL de deployment por commit** `projetosigapro01-<hash>-roksparta8724s-projects.vercel.app` como link primário. Ela pode dar `Invalid origin` caso não esteja na whitelist Neon Auth, além de fragmentar histórico de sessão no navegador.
- **Diagnóstico reproduzido pelo usuário:** navegador em `https://projetosigapro01-384z9arcf-roksparta8724s-projects.vercel.app/acesso` exibia `Invalid origin`. A consulta read-only confirmou que o domínio temporário não constava nos trusted domains Neon Auth QA. Foi adicionado à whitelist do provedor `better_auth` **somente na branch QA** `br-solitary-sound-b4xlbvs6` e conferido como presente. O alias estável também já consta da mesma lista.
- O endpoint `/acesso` no alias estável respondeu **HTTP 200** via Vercel. Isso prova a entrega da página, não um login autenticado completo; aguarda teste pelo usuário, sem coletar sua senha.
- **Banco QA:** `red-sunset-21120522` / `br-solitary-sound-b4xlbvs6` / `sigapro_migration_stage_20260923`. Nenhum registro ou tabela foi copiado, excluído ou modificado nesta correção. O login com a mesma conta e o mesmo banco deve preservar dados do servidor; sessões em cookies/localStorage são ligadas ao domínio e podem exigir nova autenticação ao trocar de host.
- Não alterar `main`, banco Neon `production` ou `sigapromunicipal.com.br` neste ciclo. Toda publicação permanece somente em preview com PR draft #118.
- Validação final a fazer na interface autenticada: abrir alias estável em aba comum, entrar com a conta QA existente, conferir dados do Quadro I e Quadro II antes de salvar alterações.

## Diagnóstico da marcação documental — 05/11/2026 (continuação)

- **Ambiente:** somente branch QA `fix/qa-triagem-analise-pagamento-20261101`, PR #118 em draft. A PR #117 já havia sido mesclada na `main` em 04/11; não confundir com autorização para publicar as alterações atuais da PR #118.
- **Evidência visual:** vídeo `20261105-2051-52.3723300(1).mp4` mostra o Processo nº 000004/2026 na Análise Urbanística e abertura do Projeto Arquitetônico no Visualizador Documental, sem a bancada de marcação.
- **Causa concreta conferida em SQL somente de leitura no Neon QA:** processo `PM-2026-00004` está com `status=distribuicao`, `triage_status=concluido`, 4 documentos válidos, guia protocolo `compensada` **sintética** (`bank_status=QA_SYNTHETIC_NOT_BANK_PAID`), `analysis_assigned_to_profile_id=NULL` e `analysis_started_at=NULL`. Encaminhamento do Protocolo para a Análise Urbanística registrado às 19:56:46 UTC. **A guia sintética não comprova compensação financeira real.**
- **Gate preservado:** o visualizador pode ser aberto apenas com acesso legítimo, mas o editor depende de `canAnalyzeProcessDocument`, que exige analista designado ou supervisor autorizado, triagem e pagamento conforme o fluxo. Nunca marcar como analista por alteração SQL direta ou abrir edição para o Admin da Prefeitura.
- **UX nova, somente QA:** `DocumentViewerPage` agora oferece **Assumir análise e marcar PDF** no topo (e na área lateral) para analista autorizado da área quando não houver responsável, invocando a mesma ação autenticada `startProcessAnalysis` da fila e abrindo `/analisar?ferramenta=highlight` somente após sucesso. Erros são exibidos, com caminho alternativo para fila/distribuição. Teste de regressão adicionado a `analystDocumentAssignmentGateQa.test.ts`.
- **Por que a tela antiga permanecia:** alias Vercel QA apontava para deployment READY `dpl_5XSdg3BhVxAquzzmPjuF7ZTwdQu7`, commit `84ce1432`. Commits seguintes, inclusive `f044d6c3`, foram corretamente **CANCELED pela configuração de Ignored Build Step**, que só constrói quando a mensagem do commit termina com `[deploy-qa]`. Isso não comprova falha de compilação. Este registro aciona a publicação seletiva QA.
- **Validação pendente após a construção da prévia:** conferir CI por SHA e Vercel READY no alias estável; com sessão de analista real, assumir o Processo 04 pelo botão e validar marca-texto, anotação, histórico, vínculo municipal, navegação e IA; com supervisor, validar distribuição; com Admin Prefeitura, confirmar consulta sem escrita. Não iniciar análise em nome do usuário nem alterar o estado do processo sem uma sessão funcional autorizada.
- **Produção protegida:** não mexer na Neon `production`, não ativar legislação sem evidência, não publicar a PR #118 em `main` e não tratar o pagamento fictício como homologação bancária.


## Correção QA — erro P0001 ao assumir análise e transbordamento no visualizador (05/11/2026)

- **Evidência fornecida:** vídeo `20261105-2213-20.7467371.mp4` (1876×850, 4s): botão `Assumir análise e marcar PDF` retorna `P0001` / “Somente a equipe da Análise Urbanística desta Prefeitura pode alterar o fluxo desta etapa.”; no card lateral amarelo, botão secundário e mensagem extrapolavam a largura.
- **Raiz do erro, confirmada pelo código SQL QA:** `start_process_analysis(uuid)` atualiza o processo para `analise_tecnica` e insere `analysis_assigned_to_profile_id`, mas o gatilho BEFORE UPDATE `guard_analysis_process_update()` chama `can_write_process_analysis(OLD.id)` ainda com assignee NULL, rejeitando o próprio primeiro início legítimo. Não era caso de conceder permissão ampla ao papel analista.
- **Correção versionada e aplicada somente em Neon QA** `br-solitary-sound-b4xlbvs6`: `neon/migrations/20261105_analyst_start_rpc_trigger_guard_v1.sql`. O RPC autenticado, após verificar processo, município, pagamento/triagem/encaminhamento, ativa contexto `set_config(..., true)` apenas durante a atualização e o limpa imediatamente. O gatilho aceita **somente** transição inicial à Análise, com autor, município, vigência técnica e estágio conferidos. O predicado `NOT COALESCE(..., FALSE)` impede bypass quando falta contexto. Operações diretas e perfis de outra Prefeitura continuam bloqueados.
- **Teste integrado transacional no banco QA:** simulação de sessão do perfil `analista` do mesmo município, chamada ao RPC, atribuição e auditoria verificadas; sentinela excepcional força rollback da simulação, deixando processo 04 inalterado. `UPDATE` direto rejeitado. `prefeitura_admin` e analista de outra municipalidade também rejeitados. Nenhuma senha foi acessada ou exposta.
- **UI do visualizador corrigida na mesma branch** `src/pages/saas/DocumentViewerPage.tsx`: card lateral com largura limitada, text wrapping real, botões `h-auto`, textos em `span min-w-0`, erros amigáveis e responsivos inclusive com a lateral oculta. Evita exibir mensagem técnica inteira dentro do CTA; mantém navegação ao editor e à fila autorizada. Testes de regressão em `src/test/analystDocumentAssignmentGateQa.test.ts`.
- **Dados preservados:** `PM-2026-00004` segue em `distribuicao`, ainda não atribuído, pois a sessão real do usuário deve assumir o caso; guia continua sintética QA e **não é comprovação bancária**. **Neon production, `main` e `sigapromunicipal.com.br` não alterados**.
- **Aceite ainda necessário:** build + CI deste HEAD, Vercel READY no alias QA, assumir com sessão humana de analista, abrir editor PDF, criar marcação/apontamento, recarregar e conferir histórico e isolamento. Teste transacional não substitui E2E autenticado completo e não homologa IA geométrica.


## QA — acesso à IA e localização dos recuos no processo 04 (05/11/2026)

- Vídeo `20261105-2236-20.2164419.mp4`: mesa de marcações **funcionando**, aberta em `SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf`, página 1/3. O texto “RECUOS DESENHADOS NA PRANCHA 02” consta da página 1. A página 2/3 mostra **implantação com recuo frontal 5,00 m, lateral esquerdo/direito 1,00 m cada, fundos 12,00 m**; valores são dados sintéticos, não limites da LC 379/2009.
- Consulta Neon QA read-only confirmou `PM-2026-00004` agora em `analise_tecnica`, atribuído ao analista da mesma prefeitura e com PDF V2 válido vinculado (V1 preservado). Não foi preciso reanexar documento ou alterar status manualmente.
- A IA **já está implementada** em `UrbanPrecheckPanel` → `ArchitecturalPdfAiPanel`, **aba Análise do processo**, não na tela de edição de anotações. O leitor chama `GET/POST /api/ai-assistant?action=project-extract` com JWT autenticado, escopo municipal, documento original no R2, aceite antes do envio, leitura de PDF e conferência humana. Nenhuma regra municipal é aprovada automaticamente.
- Vercel Preview, configuração consultada **sem revelar valores secretos**: `SIGAPRO_AI_PDF_PROVIDER=claude`; `SIGAPRO_AI_PDF_ENABLED=true`; há `ANTHROPIC_API_KEY` registrada como **sensitive**, mas não foi feito teste tarifado e **não há comprovação de saldo**. Assistente conversacional `SIGAPRO_AI_PROVIDER=cloudflare` com token e account ID de Workers AI cadastrados. R2 armazena PDFs, não faz inferência de IA. Workers AI no pipeline atual consegue leitura textual de PDF, não mede geometricamente recuos.
- **UX implementada QA** em `DocumentAnalysisPage.tsx`: botão `Analisar com IA` leva ao painel existente, na aba Análise e na âncora `#sigapro-urban-precheck`, preservando rascunho de anotações e exigindo concluir o apontamento em edição. Atalho `Ver prancha 02 · Recuos` só aparece no PDF V2 e com `VITE_SIGAPRO_NEON_ISOLATED=true`. Botões têm quebra de texto para preservar layout premium.
- Regra de crédito: Anthropic API geralmente exige créditos próprios ou acordo de faturamento; chave presente não confirma saldo. Nenhuma tentativa de leitura com custo foi executada. Não trocar para Cloudflare nem expor documentação municipal ao modelo automaticamente; o modo Cloudflare é só texto e não equivale à validação visual dos recuos.
- Testes de regressão `src/test/projectAiEntryQa.test.ts`; aguardar CI e deployment [deploy-qa]. PR #118 continua draft, sem merge, sem tocar produção. Teste real de saída do provedor PDF, precisão da leitura e regras legais oficiais **pendente**.

## QA — vídeo do bloqueio de crédito Anthropic e leitor textual opcional (05/11/2026)

- Vídeo `20261105-2255-34.5332982.mp4` (13,83 s, 1918×996) mostra `SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf` corretamente identificado e liberado; após envio autorizado, a IA visual do Claude retorna aviso financeiro `AI_PROVIDER_BILLING`. Não foi aplicada medida. Aviso adicional: nenhuma norma oficial ativa para município/zona/uso/data, sem simular conformidade.
- Raiz: **R2 é armazenamento S3 de PDFs**, não motor IA; `SIGAPRO_AI_PDF_PROVIDER=claude` seleciona Anthropic com credencial presente, mas conta sem saldo/limite de gastos recusa inferência. Não tentar contornar cobrança, não confundir token válido com crédito disponível.
- Novo fallback de uso **EXPLÍCITO, QA-only**: `resolveVisualPdfProvider(readEnv,"cloudflare_text")` só selecionado por `POST /api/ai-assistant?action=project-extract` com `readingMode:"cloudflare_text"`, em `VERCEL_ENV=preview` e novo `confirmedTransfer:true`. Checagens de sessão JWT, município, função, versão vigente do PDF e revisão pós-inferência permanecem idênticas. O GET não transmite PDF; informa `textAlternativeAvailable` sem divulgar credenciais. Claude visual continua como padrão, sem fallback automático.
- `ArchitecturalPdfAiPanel` tem dois cartões acessíveis e responsivos (Claude visual / Cloudflare texto); trocar fornecedor limpa aceite prévio e raschunho de extração, exige novo consentimento nominativo, não altera o processo e mantém cards com texto contido. Se Claude acusar faturamento, orienta seleção da opção Cloudflare em vez de sugerir que PDF/R2 falhou.
- A alternativa Cloudflare usa **Workers AI com cota da conta**, podendo falhar por limite/quota; não se promete gratuidade universal. Conversão PDF→Markdown com extração textual, seguida de modelo textual. Setbacks e `has_site_plan` permanecem explicitamente não verificados; **nenhuma geometria ou aprovação é inferida**. O Cloudflare `toMarkdown` segue documentação oficial https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/rest-api/ e franquia está sujeita aos limites https://developers.cloudflare.com/workers-ai/platform/pricing/.
- Testes unitários/regressão em `src/test/architecturalPdfPreflightQa.test.ts` para seleção explícita, opt-out, isolamento preview, consentimento, modo textual, compatibilidade com Claude e contenção dos cards. Ainda precisa validar CI/preview e sessão humana: seleção Cloudflare, novo aceite, chamada real, fidelidade de texto. Não transmitir PDF a provedor novo sem decisão do usuário.
- **Sem mudanças em Neon QA/production, Vercel Production, `main` ou site oficial**. PR #118 segue draft; nenhuma lei municipal passa a válida.

## Homologação QA — identidade visual SIGAPRO para serviços integrados (05/11/2026)

- Interface funcional renovada como **SIGAPRO IA · Leitura Visual**, **SIGAPRO IA · Leitura Documental** e **SIGAPRO IA · Leitura Técnica do Projeto**, além de **SIGAPRO IA · Assistente**, **SIGAPRO Nuvem · Arquivos Oficiais**, **Banco/Núcleo de Dados SIGAPRO**, **SIGAPRO Pagamentos** e **SIGAPRO · Ambiente de Testes**. Mensagens operacionais de status, erro, PDFs, protocolos e bancos substituem marca de infraestrutura por serviço SIGAPRO, sem tocar identificadores de integração, chave, rota API, regras de negócio ou banco.
- **Transparência mantida**: a tela de consentimento do PDF inclui `Informações sobre o processamento` expansível com o prestador real (Anthropic/Claude visual ou Cloudflare Workers AI textual); a tela de armazenamento inclui informação da infraestrutura contratada sob detalhes expansíveis; configurações técnicas de meios de pagamento ainda mostram o nome real do gateway/banco para evitar vínculo financeiro incorreto.
- Sem promessa de software próprio, saldo de IA ou leitura homologada; Cloudflare textual não verifica geometria e Claude visual exige créditos. Não realizar leitura tarifada, não transmitir arquivos e não habilitar produção automaticamente.
- Revisão de regressão em `src/test/projectAiEntryQa.test.ts`, prévia QA na branch única `fix/qa-triagem-analise-pagamento-20261101`; PR #118 draft, sem merge; Neon produção e domínio oficial intocados. Confirmar checks, build READY e teste humano após publicação.

- Publicação final desta revisão inclui também rótulos SIGAPRO no dashboard, cadastro, perfil, protocolo, processo 04, guias, páginas de armazenamento, configuração financeira e respostas do assistente. Identificações técnicas de gateways permanecem selecionáveis no painel administrativo e nos documentos de cobrança; prestadores de tratamento de PDF continuam visíveis nos detalhes de consentimento. Build/QA dedicados com marcador de implantação da branch; produção permanece bloqueada.

- Revisão final de CI: os três testes que comparavam literalmente mensagens antigas foram atualizados para os novos textos da marca SIGAPRO (autorização da IA e preservação da data original das guias). O código funcional e as proteções do banco não foram alterados nesta correção; reexecutar TypeScript, testes e build da QA. [deploy-qa]

## Homologação QA — leitor SIGAPRO IA dentro do Projeto Arquitetônico (05/11/2026)

- Vídeo `20261105-2350-59.3809732.mp4` (47,73 segundos) demonstrou que o analista ainda utilizava SIGAPRO IA no painel da **Pré-conferência Urbanística**, longe da prancha do projeto. O requisito é iniciar a leitura diretamente em **Documentos → Projeto Arquitetônico**, com PDF e leitor assistido próximos. A leitura textual Cloudflare do vídeo anterior ainda não foi homologada ponta a ponta; esta intervenção é posicionamento e fluxo.
- `ProcessDetailPage.tsx`: atalho `data-sigapro-ai-review-shortcut` no cartão do Projeto Arquitetônico agora abre `openDocumentWorkspace(document.id,true,true)`, a mesma mesa documental já autorizada, com `?ferramenta=navigate&painel=ia`. Continua exigindo analista atribuído, arquivo presente e permissões; não envia documento ao provedor sozinho. Os demais documentos não exibem o comando de IA.
- `DocumentAnalysisPage.tsx`: visualizador mantém a planta aberta, e botão `SIGAPRO IA · Ler projeto` alterna a barra de inspeção para `ArchitecturalPdfAiPanel` com o PDF vigente selecionado e painel responsivo compacto. Mantém ferramentas de marcação no botão `Anotações` sem destruir rascunhos. Consentimento explícito por provedor preservado; pré-conferência não aparece nesse leitor.
- `UrbanPrecheckPanel.tsx`: retirado `ArchitecturalPdfAiPanel`, substituído por orientação para documentos e exclusivamente pré-conferência legal. Quando o analista revisa individualmente medidas na planta e confirma o envio à pré-conferência, medidas entram **somente no estado de navegação de mesma origem**, com identificador e versão do documento, processo, município e validade curta (15 min), via `createReviewedDrawingHandoff` e `readReviewedDrawingHandoff`. Valores sem fonte/página, texto inválido, outra versão, outro município ou processo são recusados; o payload é consumido uma vez. Nenhum cadastro de lei, parecer ou aprovação automática.
- A matrícula, ART/RRT, memorial e demais arquivos não disparam leitura arquitetônica. O administrador somente visualização não ganhou botão de leitura. Testes de navegação e validade do handoff atualizados em `architecturalAiNavigationQa.test.ts`, `projectAiEntryQa.test.ts`, `architecturalPdfAiExtraction.test.ts`.
- Publicação **somente QA**, branch única `fix/qa-triagem-analise-pagamento-20261101`, PR #118 ainda DRAFT. Banco e domínio oficial intocados. Verificar CI verde, prévia READY e aceitação humana do fluxo. [deploy-qa]

- Verificação adicional da migração de UX: roteamento histórico de marcações segue intacto, enquanto o atalho de IA do Projeto Arquitetônico abre o inspetor lateral; duas asserções de regressão foram atualizadas para verificar as duas rotas, sem alterar comportamento financeiro, permissões ou banco. Também corrigido o tipo de `fileName` opcional dos documentos existentes (falha fechada) e layout em duas linhas com rolagem separada em telas estreitas. [deploy-qa]

## QA — SIGAPRO IA: contraste, Cloudflare e leitura visual avançada (06/11/2026)

- Vídeo `20261106-0022-36.0288979.mp4` (~16,2s) mostrou o processo 04 fictício, com prancha de implantação e recuos visíveis na página 2 e painel lateral SIGAPRO IA. Solicitado contraste alto e leitura de qualidade com zoneamento. O vídeo não mostra uma nova resposta de erro do provedor; não atribuir uma falha específica a esse vídeo. Evidências anteriores: a chave Claude em QA não possui crédito de inferência; a alternativa Cloudflare PDF textual não comprova geometria.
- Correção de UI em `ArchitecturalPdfAiPanel.tsx`: textos e títulos explícitos em cards selecionados/inativos, modo claro e escuro; superfícies azuis/escuras contrastadas, bordas, alertas e medidas com textos legíveis, quebra segura de palavras.
- Cloudflare Workers AI: o `glm-4.7-flash` **não integra a lista oficial de modelos JSON Mode** da documentação atual. Retirado o `response_format:json_schema` incompatível; solicitado JSON explicitamente e processado somente com validação local, inclusive JSON cercado de bloco markdown. Sem retry, fallback pago ou transmissão adicional automática. A procedência textual exige citação literal e marcador de página inequívoco no PDF convertido; recuos continuam bloqueados em modo textual. Mensagens por falha específicas, sem impressão de credenciais ou conteúdo de PDF em logs. Docs: https://developers.cloudflare.com/workers-ai/features/json-mode/ e https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/rest-api/.
- `OpenAI Responses PDF`: alternativa **SIGAPRO IA · Leitura Avançada** apenas quando `OPENAI_API_KEY` foi configurada no servidor Preview e a opção foi explicitamente escolhida pelo analista. Suporta `SIGAPRO_OPENAI_PDF_MODEL=gpt-6.1-sol` opcional ou `gpt-4.1` por padrão, PDF `input_file.detail=high` para enviar texto e imagens de páginas, JSON estruturado, recusa de citações inconsistentes e conferência humana. Independente do ChatGPT Plus, que NÃO concede automaticamente API/creditos. Não criar credencial, não comprar créditos, não chamar API real sem consentimento; o projeto QA não tem `OPENAI_API_KEY` configurada nesta ramificação na inspeção. Docs: https://developers.openai.com/api/docs/guides/file-inputs e https://help.openai.com/pt-br/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform.
- Falhas por saldo da OpenAI/Anthropic distinguíveis de limite de requisição; controles de tenant, JWT, versão do arquivo, consentimento a cada mudança de prestador e nenhuma gravação automatizada preservados. Leis locais não verificadas, zoneamento do processo 04 sem prova legal vigente — não afirmar aprovação.
- Testes novos/atualizados: `architecturalPdfPreflightQa.test.ts`, `architecturalPdfClaudeProvider.test.ts`, `architecturalPdfCloudflareReuse.test.ts`. Exigem compatibilidade PDF, contraste e bloqueio de medidas sem fonte; CI e Vercel Preview devem aprovar antes de homologar a interface. Somente branch QA, PR #118 DRAFT, sem alterações no Neon e no domínio oficial.
[deploy-qa]

- QA CI após a primeira rodada identificou quatro asserções de regressão relacionadas ao novo contrato: amostras Cloudflare simulavam caracteres \\n literais em vez de quebras de página, o leitor exige paginação verdadeira, e testes antigos conferiam textos/rotas substituídos. Corrigidos **dados dos testes** e respectivas expectativas; a exigência de página e a autorização por provedor permanecem. Reexecutar suíte completa e Vercel Preview antes de afirmar qualquer homologação real de leitura. [deploy-qa]

## QA — contraste do atalho azul SIGAPRO IA no cartão do projeto (06/11/2026)

- Print do analista documentou o botão azul **SIGAPRO IA · Ler projeto** com texto e ícone pretos, embora o botão vizinho estivesse legível. Trata-se do **atalho do card do Projeto Arquitetônico em `src/pages/saas/ProcessDetailPage.tsx`**, não do comando interno do `ArchitecturalPdfAiPanel.tsx`. Não solicitar edição manual ao usuário.
- Causa localizada: estilos de `src/index.css` para `[data-surface="adaptive-card"] span` com `!important` e especificidade superior à classe Tailwind `!text-white`. Corrigido no próprio componente com `sig-primary-document-action`, `data-sigapro-ai-review-label` e `data-sigapro-ai-review-icon` e no final de `src/styles/surface-polarity.css` com seletor específico do card e do atalho em ambas as modalidades, impondo `color:#fff`, `-webkit-text-fill-color:#fff` e `stroke:currentColor`, incluindo estados hover/focus/disabled. Não muda o layout de card, outros botões nem fluxo documental.
- Teste de regressão adicionado a `src/test/premiumSurfaceAndPdfRegression.test.ts`; exige correspondência entre seletor CSS e atributos do botão e prioridade sobre estilos globais.
- **Apenas QA**, branch `fix/qa-triagem-analise-pagamento-20261101`, PR #118 DRAFT sem merge; Vercel Preview deve completar build e CI antes de considerar publicada. Produção, pagamentos, leis e Neon não alterados.

## QA — Leitura visual gratuita somente do projeto fictício 04

- Pesquisa técnica (novembro/2026): **Google Gemini 2.5 Flash** possui quota gratuita com entrada de PDF visual nativa e texto/estrutura JSON; a política gratuita permite utilização do conteúdo para melhoria do fornecedor. **Somente o PDF sintético** `SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf` pode ser enviado por este modo; NUNCA PDF real de Prefeitura no nível gratuito. Consulte: https://ai.google.dev/gemini-api/docs/pricing?hl=pt-br e https://ai.google.dev/gemini-api/docs/generate-content/document-processing?hl=pt-br.
- Nova modalidade `gemini_qa`, rotulada **SIGAPRO IA · Ensaio Visual Gratuito**, está disponível na mesa documental somente após **habilitação explícita de preview** `SIGAPRO_GEMINI_QA_ENABLED=true` e credencial de servidor `SIGAPRO_GEMINI_QA_API_KEY`. Não cria credenciais, não habilita billing, não usa conta ChatGPT Plus. Nunca troca automaticamente de Claude, Cloudflare ou OpenAI: exige seleção e aceite novos.
- Proteções adicionais: produção barrada; endpoint de entrada fixo Google; analista e município autorizados via JWT/RPC, documento atual e versão válida; bloqueio se `process_id` não for exatamente `915e1c63-ebda-4cdd-8e95-34316d9e0089` ou nome não coincidir com fixture QA04; conteúdo do PDF também deve conter as duas marcas literais `FICTICIO / QA` e `PROCESSO FICTICIO 000004/2026` antes de qualquer transmissão. Falhar fechado se fixture estiver comprimida, substituída ou ilegível.
- Extrator PDF Gemini usa `generateContent` com PDF `inline_data`, JSON solicitado, validação `normalizeArchitecturalPdfExtraction` em cada cota: unidade, valor, trecho literal, página, confiança e conferência humana. Nunca aprova a obra, nem infere norma municipal. Resposta de teste simulada é coberta em `src/test/architecturalPdfClaudeProvider.test.ts` e preflight de dados/privacidade em `src/test/architecturalPdfPreflightQa.test.ts`. **Mock não comprova leitura real**; ensaio ponta a ponta depende de chave gratuita do próprio titular e autorização pelo analista.
- Leitores existentes Cloudflare textual, Claude visual e OpenAI visual preservados. Para futuro servidor próprio, a seleção de provedor permanece isolada de fluxos urbanísticos e de arquivamento. Instalação de motor local multimodal deve passar por homologação independente com amostras sintéticas e normas oficiais.
- Somente branch `fix/qa-triagem-analise-pagamento-20261101`, PR #118 DRAFT, Neon QA/produção e domínio oficial intocados. Confirmar CI/testes/build antes de considerar a alteração de código pronta. [deploy-qa]

- Ajustado o estado de preflight no React para incluir os campos do ensaio visual gratuito durante a consulta inicial; isso preserva a compilação TypeScript sem habilitar envio automático. Teste por solicitação na QA, sem credenciais Gemini disponíveis nesta etapa. [deploy-qa]

- **Benchmark QA04 no leitor:** `benchmarkQa04ArchitecturalReadings` compara recuos frontal = 5 m, lateral = 1 m, fundos = 12 m, todos na prancha 02 com citações verificáveis; painel `data-sigapro-qa04-benchmark` exibe 0–3 resultados e divergências. Não certifica exatidão em projetos reais nem conformidade legal. Testes mock de aceitação e rejeição incluídos.
- **Bloqueio externo verificado:** Vercel API de deploy retornou HTTP 402 `api-deployments-free-per-day` indicando mais de 100 implantações em um dia e recomendando aguardar 24h. O último deploy QA Ready continua numa revisão anterior; os novos commits de Gemini/benchmark **NÃO estão publicados no site QA** até que limite seja liberado e revisão seja implantada. Não forçar outro projeto, produção ou conta. Não criar/ativar chave de fornecedor sem vínculo do titular.
- Gemini Free usa conteúdo para melhoria dos produtos conforme os termos do Google; proteção de QA aceita exclusivamente o PDF sintético do processo 04. Resultado de CI sem inferência real não substitui o aceite humano.


## Ciclo QA — relatório rastreável e bloqueio de publicação (06/11/2026)

- Vídeo `20261106-1401-52.0045091.mp4` (9 s) mostra rolagem na conversa anterior, não o portal autenticado. Não comprova resposta atual do backend ou execução de leitura.
- O leitor local `server/native-architectural-pdf.ts` já havia passado 1.376 testes no commit `4159dbfb`, inclusive 3 cotas do PDF QA04 gerado. Continua **sem demonstração de leitura do PDF efetivamente arquivado no R2** e não interpreta desenhos digitalizados/CAD sem texto.
- Frontend `ArchitecturalPdfAiPanel.tsx`: a verificação de disponibilidade agora considera `nativeTextAvailable` mesmo sem provedor externo configurado. Após uma extração vinculada ao documento e à versão, botão **Gerar relatório da leitura (PDF)** produz relatório A4 local com evidências, medidas, páginas, lacunas e avisos. Nenhum envio de documento ou gravação no processo ocorre durante o download.
- Novo helper `architecturalReadingReportPdf.ts` e testes `architecturalReadingReportPdf.test.ts`: relatório **preliminar, não parecer urbanístico**. Sem matriz legal municipal ativa validada por artigo/página, o resultado jurídico segue **NÃO AVALIADO**. Não inventar conformidade, tampouco aproveitar medidas sem conferência humana.
- Commits QA `f558818f`, `27b2affd`, `9fd7fa27`: GitHub Actions `Typecheck, tests and build` e `validate` concluíram com **success** em `9fd7fa27`.
- Auditoria do Vercel Preview: o alias estável apontava para `503ced80`, e builds de novos commits foram marcados **CANCELED** porque o `Ignored Build Step` requer marcador `[deploy-qa]` no assunto do commit. Exemplo: deployment `dpl_Gf6sxZK3FJLWk8iBFcrMd5z53nux` explicitou `exit code 0` no comando de ignore, logo não se pode chamar isso de build publicado. Bloqueio por quota diária foi observado em etapa anterior, mas é distinto do ignore atual.
- Esta revisão documental leva o marcador de deploy exclusivamente para **Preview** e branch autorizada. Validar READY, alias, commit exato, build e resposta com analista antes de declarar teste E2E. Manter PR #118 DRAFT; nenhuma alteração em main, site oficial ou banco Neon produção.


## QA — verificação de endereço, imóvel e zoneamento após vídeo (06/11/2026)

- Analisado o vídeo `20261106-1446-08.2694124.mp4` (123,33 s): relatório PDF baixado corretamente, com três recuos QA04 na página 2 (frontal 5 m, lateral 1 m, fundos 12 m), ocupação 26,67%; relatório marca conformidade urbanística como NÃO AVALIADA. A modalidade Cloudflare textual foi acionada em outro trecho, mas não demonstrou entrega conclusiva durante o vídeo. Leitura textual e relatório NÃO demonstram verificação do cadastro georreferenciado ou lei oficial.
- Verificação somente de leitura no Neon QA (`red-sunset-21120522/br-solitary-sound-b4xlbvs6`): processo `915e1c63-ebda-4cdd-8e95-34316d9e0089` possui `property_id IS NULL`, documento vigente `SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf` válido, **0** escopos de evidência legal e **0** normas urbanísticas reais ativas; existe regra sintética QA-URBAN-E2E sem validade. A pré-conferência inicia zona vazia e depende de digitação pelo analista, não busca mapa oficial.
- A legislação de Campo Limpo Paulista LC 379/2009 exige Quadro I, Quadro II e mapa de zoneamento; a Prefeitura mantém processo de revisão em 2026. Minutas de consulta NÃO são normas vigentes automaticamente. Fontes: https://campolimpopaulista.sp.gov.br/leis-urbanisticas e https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1830/ .
- Implementada auditoria **somente de leitura** `server/urban-territorial-context.ts`, depois de autenticação do analista e documento vigente: consulta `processes.property_id`, vínculo municipal com `properties`, endereço e código de zona **apenas declarados**, sem geocodificação nem presunção cartográfica. Devolve sempre `zoneVerified:false`, `legalConformity:not_evaluated`, com razões e falha fechada em RLS/tenant/consulta.
- Novo contrato `src/lib/urbanTerritorialReadiness.ts`, painel de leitura e relatório PDF exibem “imóvel não vinculado” ou “zona declarada, ainda não verificada”; `UrbanPrecheckPanel` diferencia endereço informado e prova de zoneamento e preserva trava jurídica; testes QA cobrem ausência do vínculo, zona declarada e bloqueio de outra prefeitura. Nenhuma matrícula/zoneamento foi inventado nem gravado em nome do usuário.
- Próxima homologação real: sessão autenticada no novo Preview -> abrir Processo 04 -> Leitura Local -> gerar novo PDF -> conferir aviso de imóvel sem cadastro; depois associar imóvel fictício pela interface cadastradora própria, importar mapa oficial georreferenciado com proveniência e vigência, criar evidência jurídica por índice/zona/uso e comparar manualmente. **Não desbloquear automaticamente conformidade.**
- Esta documentação solicita deploy exclusivo na branch QA, sem merge, sem banco de produção, sem publicar site oficial. PR #118 mantém DRAFT. [deploy-qa]


## Núcleo GIS de zoneamento PostGIS — QA 06/11/2026

- Fonte única de implementação e homologação: `docs/HOMOLOGACAO_GIS_SIGAPRO_20261106.md` e `neon/migrations/20261106_urban_zoning_postgis_qa_v1.sql`. PostGIS **3.6.4** instalado **somente na Neon QA** (`br-solitary-sound-b4xlbvs6`). Sem merge na main e sem dados do Neon production.
- Três tabelas protegidas por RLS e sem permissão direta: mapas oficiais versionados, zonas vetoriais georreferenciadas (EPSG:4326) e perímetros cadastrados de imóveis; fontes URL+SHA-256, vigência, autor e assinatura humana. Dados atuais: **0 mapas, 0 geometrias de zonas, 0 perímetros importados**, pois não foi localizado arquivo vetorial oficial vigente e comprovado entre os anexos públicos da LC 379/2009.
- Resolvedor `urban_zoning_resolve_process_v1` por PostGIS: lote inteiro contido em uma única zona do único mapa efetivo validado, isolado por município, com bloqueio de divisas, superposição, geometrias/parcela não homologadas ou versão de mapa ambígua. Caso QA04 histórico permanece com `property_id NULL` e **sem zona fictícia**. Checagens SQL: PostGIS ativo, condições espaciais de controle e chamada sem sessão `access_denied`.
- Backend `server/urban-territorial-context.ts` retorna dados do resolver exclusivamente após autorização documental; tela de leitura e PDF distinguem zona cartograficamente verificada, código, versão e SHA, de lei urbanística legalmente aplicável. Relatório de cotas não vira parecer ou alvará.
- Painel de `Configurações → Legislação` oferece importação de GeoJSON oficial, revisão de mapa e cadastro do perímetro cadastral por IPTU, em rascunhos. Permite retomada do mesmo arquivo com SHA e identificadores de feições, sem sobrescrever polígonos divergentes. A Prefeitura deve confirmar integridade, publicação e vigência no painel antes da classificação; arquivos PDF de mapa e textos de propostas 2026 **não comprovam perímetro válido**.
- Defesa em profundidade: `save_urban_precheck_run_v7` verifica **no banco** perímetro GIS, mapa, única zona, data de oficialização, mesma versão de lei por município/zona, e então aciona `v6` com revisão legal por artigo/página/índice. `v6` perdeu EXECUTE para authenticated; `v7` é a única entrada da UI. Sem mapa e evidência jurídica a gravação é barrada, mesmo se tentarem forçar o frontend.
- QA tests: parser GeoJSON reprova CRS não EPSG4326, feições sem zone_code, duplicatas e associações forâneas; casos da geometria, RLS e controle de declaração. Teste real **autenticado e assinado com arquivo vetorial oficial e imóvel cadastrado**, confrontação jurídica por índice e regras vigentes **ainda pendente**.
- PR #118 permanece DRAFT. A implantação desta revisão é apenas Preview, não domínio oficial. [deploy-qa]


## QA — Reaproveitamento integral da base anterior e correção da continuidade (06/11/2026)

**Origem da verdade, confirmada por SQL READ-ONLY na Neon QA:** projeto `red-sunset-21120522`, branch `br-solitary-sound-b4xlbvs6`, banco `sigapro_migration_stage_20260923`. Município `49dac0b6-6352-4744-9aab-9ff91c59d970` (Campo Limpo Paulista).

**IMPORTANTE: Não declarar perda de PDFs por consultar `tenant_settings` ou `urban_legislation_documents_v1`.** O acervo já carregado por usuário está em `municipality_settings.general_settings`, com referências R2 restritas ao município:
- `uso_solo_arquivo_nome = quadros.pdf` (ref `r2:municipalities/<municipio>/legislation-uso-solo/...`)
- `zoneamento_arquivo_nome = zoneamento clp.pdf` (ref `r2:municipalities/<municipio>/legislation-zoneamento/...`)
- `leis_arquivo_nome = 440-2011.pdf` (ref `r2:municipalities/<municipio>/legislation-leis-complementares/...`)
- Eventos de troca do acervo: 2 registros `municipal_legacy_legal_asset_events_v1`, incluindo substituição de `lei complementar.pdf` por `quadros.pdf` em 04/11/2026.
- Vínculos salvos NÃO equivalem à comprovação da existência física dos bytes do R2. O teste autenticado de abertura precisa ser realizado no SIGAPRO.

**Matriz jurídica histórica, confirmada:**
- `urban_matrix_batch_staging_v1`: 1 lote `quadros.pdf`, SHA-256 começa com `68c85d879011dbb323e2`, 23 linhas Quadro I, status `pending_legal_review`, 16 índices antigos conferidos.
- `urban_matrix_reading_audit_v2`: 6 `reading_verified` adicionais (linhas 12,13,16,17,20,22) e 1 `needs_correction` (linha 21) = **22/23 leituras conferidas** e **1 pendência AIU(2)**.
- `urban_matrix_analyst_guidance_v1` e `urban_matrix_analyst_provisional_criteria_v1`: CA mínimo AIU(2) 1, status `manual_only_pending_concidade`, NÃO convertido para regra vigente, sem CONCIDADE ainda regulamentado.
- `urban_quadro_ii_draft_entries_v1`: **45** categorias não verificadas, páginas 38–50.
- `urban_quadro_ii_source_evidence_v1`: **14 páginas (38–51)**, com OCR `machine_unverified`, página 43 `visual_required`.
- `zonas_urbanisticas`: 8 linhas de cadastro LEGADO, sem versão jurídica/auditoria para serem reativadas silenciosamente.
- `urban_regulation_versions`: uma regra sintética `QA-URBAN-E2E-20261024`, 0 reais ativas; `urban_legal_evidence_scopes`: 0. Não presumir que parâmetros históricos estejam perdidos nem que estejam homologados.

**Implementação corrigida nesta PR #118:**
- Migração `neon/migrations/20261106_urban_existing_work_baseline_qa_v1.sql` cria RPC autenticada READ-ONLY `get_urban_process_legal_baseline_v1`: valida analista, processo, municipalidade, perfil ativo e acesso, busca PDF legados nos campos CORRETOS de `municipality_settings.general_settings`; devolve somente filenames, totais e hashes de matriz, sem R2 keys, sem modificar processo/regras. Consulta anônima testada: `access_denied`.
- `server/ai-project-extract.ts` retorna `legalBaseline` APENAS após autorização do documento vigente. A interface `ArchitecturalPdfAiPanel` exibe os PDFs existentes, 22/23 e 45 rascunhos, quantidade de regras realmente ativas e provas legais, sem repetir upload e sem confundir leitura com conformidade.
- `architecturalReadingReportPdf.ts` inclui essa origem histórica e a ressalva legal, sem modificar registros. Proteções de PDF/tenant/versão e conferência humana preservadas.
- `UrbanQuadroIIWorkspacePanel.tsx`: removido `useEffect` que rolava automaticamente a tela ao abrir categorias; botão explícito “Abrir formulário de conferência desta página”; área paginada desliga ancoragem automática para evitar salto de posição. A navegação 38→39→40 permanece na mesma faixa.
- Teste `urbanExistingLegalBaseline.test.ts` cobre origem municipal, rejeição de dados contraditórios, hierarquia de autorização, UI e navegação.
- **NÃO significa leitura visual CAD de plantas reais**: leitor local extrai apenas texto selecionável. Prova de geometria precisa de provedor visual autorizado e teste HTTP autenticado. A base geográfica PostGIS permanece vazia (0 mapas e perímetros homologados); sem cadastro do lote do processo QA04 e fonte cartográfica válida, conformidade deve continuar `not_evaluated`.
- Ao mudar de conversa, usar SEMPRE esta documentação + PR #118 + branch QA como estado persistente; não criar novamente matrizes, tabelas, PDFs ou parâmetros que já existem.
- Esta revisão será publicada **somente Preview QA**, com commit marcador `[deploy-qa]`. Não mesclar na `main` ou atualizar produção automaticamente. O aceite final exige ensaio autenticado da abertura R2, leitura real, geometria e confronto legal pelo analista.



### Conciliação com produção — somente leitura (06/11/2026)

Confirmação na Neon branch `br-summer-surf-b4s88rv5` (produção), sem qualquer escrita: o cadastro de arquivos municipais **também usa `municipality_settings.general_settings`**, e não a tabela legada `tenant_settings`:
- Produção: `uso_solo_arquivo_nome = lei complementar.pdf`; `zoneamento_arquivo_nome = zoneamento clp.pdf`; `plano_diretor_arquivo_nome = lei complementar 613.pdf`; `leis_arquivo_nome` vazio.
- QA: `uso_solo_arquivo_nome = quadros.pdf`; `zoneamento_arquivo_nome = zoneamento clp.pdf`; `leis_arquivo_nome = 440-2011.pdf`; `plano_diretor_arquivo_nome` vazio.
- As referências possuem formatos históricos diferentes, inclusive URL de visualização antiga e `r2:`; isso NÃO significa perda do arquivo. Necessário comprovar o acesso aos bytes antes de migrar/restaurar um vínculo; não copiar nem sobrescrever entre produção/QA automaticamente.
- **Fonte única de continuidade para próximas conversas:** esta seção, PR #118, commit de publicação QA `ca7654d82674cd5ae06f51b782eb1f1673d97b91`. Os materiais já estão salvos em locais distintos; NÃO solicitar novamente upload ou preenchimento dos 23 índices sem confirmar a necessidade exata.

## Upgrade consolidado do leitor de projetos — 06/11/2026 (QA)

**Prioridades:** aproveitar matriz histórica Quadro I 22/23, Quadro II 45 rascunhos e PDFs R2 existentes, impedir diagnósticos baseados em PDFs truncados e explicitar paginação do projeto.

- Nova auditoria independente `src/lib/architecturalPdfPageAudit.ts` valida o número de páginas contra o dicionário `/Pages /Count` do PDF clássico. Se não for possível confirmar (PDF com objetos comprimidos, estruturas ambíguas etc.), retorna `count=null`; **não inventa total** e **não equivale a inspeção visual**.
- Após a extração, `server/ai-project-extract.ts` aplica `auditArchitecturalPdfPages` antes de enviar qualquer cota à tela. Citações a páginas além do total comprovado são recusadas (medida, página, uso na pré-análise), com aviso. O `pageAudit` apresenta o total verificável, páginas que sustentam medidas e páginas sem evidência de cotas. Ausência de cota não significa ausência de desenho.
- `ArchitecturalPdfAiPanel.tsx` mostra Inventário de páginas do projeto. `architecturalReadingReportPdf.ts` imprime o mesmo inventário e suas limitações no relatório preliminar.
- **Falha de origem corrigida no Cloudflare:** `server/architectural-pdf-provider.ts` fazia `.slice(0,24000)` após converter o PDF, com risco de omissão silenciosa de páginas finais. Agora recusa `CLOUDFLARE_PDF_TEXT_PARTIAL` sem segunda chamada ao modelo e sem registrar dados. O servidor informa claramente que não houve leitura integral. Um leitor de PDFs longos exige paginação rastreável e tratamento explícito de todas as partes, não truncamento.
- Testes `architecturalPdfPageAuditQa.test.ts` e `architecturalPdfCloudflareReuse.test.ts` cobrem PDF QA04 de três pranchas, citações inválidas, contagem inconclusiva e corte de texto longo sem nova inferência paga. Esses testes não são aceite visual com planta real.
- O modo `native_text` permanece textual e limitado: não interpreta CAD nem prova geometria. Análise visual real exige provedor habilitado, consentimento e ensaio autorizado; zoneamento e normas jurídicas homologados são verificações independentes. A conformidade continua `not_evaluated`.
- A release segue somente Vercel Preview QA. Produção, main e Neon production não são alterados; PR #118 DRAFT. Próximo commit de preview identificado com `[deploy-qa]` depois dos testes.

## Revisão do vídeo QA04 — 06/11/2026, 18h43 (mesa de análise e IA)

**Vídeo inspecionado**: `20261106-1843-36.7254133.mp4`, 98.8 segundos, mesa documental do processo QA04. Imagens mostram a prancha de implantação aberta, relatório preliminar em PDF, Quadro I 22/23, Quadro II 45 rascunhos, ausência de imóvel cadastral ligado e zona real não validada. Exibiram-se cards muito extensos, fontes pequenas, aviso do saldo de provedor não confirmado e a tentativa da Leitura Documental demorando sem cancelamento pelo analista.

**Correções exclusivas na branch QA e PR #118 (nunca main/produção)**:
- `DocumentAnalysisPage.tsx`: **raiz encontrada após inspeção do código completo:** `previewUrl` já incluía `#page=N&zoom=P`, mas `iframe key={previewUrl}` forçava desmontar/remontar o PDF a cada página/zoom e outro fragmento acrescentava `toolbar` e `view=FitH` (duplicação/conflito). Corrigido para `key={accessUrl}` e `src={previewUrl}`, mantendo um só fragmento e o visualizador estável. O botão de medida abre a página citada via `onGoToPage`. O PDF nativo não envia de volta mudanças de rolagem manual: NÃO alegar sincronização bidirecional.
- `ArchitecturalPdfAiPanel.tsx`: cabeçalho premium azul-marinho com contraste branco; formulário compactado em seleção de método expansível; zona, documentação histórica e alertas técnicos ficam em cards expansíveis, resumo visível. Os cards de medida permitem abrir a prancha referida e expandir a citação; fontes, botões e estados desativados com contraste. A UI mantém identificadores de QA e segurança existentes.
- Operações de IA externas usam `AbortController`, cancelamento manual, limite cliente de 67 s, proteção por sequência de execução e mensagem de timeout. Preflight GET tem limite de 18 s e limpeza do pedido na desmontagem. Em erro/cancelamento, resultado anterior e seleções verificadas são preservados; nenhum processo, norma, protocolo ou assinatura é alterado.
- `DocumentAnalysisPage.tsx`: ajuste do contraste do botão 'Enviar apontamentos' quando desabilitado; observações e demais decisões não foram modificadas.
- Novo `architecturalPremiumReaderControlsQa.test.ts` cobre existência dos controles, estados, contrastes e travas de segurança. Testes são estáticos de regressão; exigem comprovação visual posterior do Chrome e ensaio autenticado com uma planta real.
- O leitor gratuito nativo lê texto e páginas, não mede geometria CAD. Claude visual continua configurado, mas saldo/créditos não verificados e sem aceitação E2E com planta real. Nenhum novo provedor, chamada de crédito pago ou IA gratuita não autorizada foi ativado. A avaliação jurídica permanece `not_evaluated` até localizar o terreno e homologar os parâmetros por zona e uso.
- A versão pública de QA estava em `ca7654d8` antes desta revisão. A Vercel recusou deploy no turno anterior com `402 api-deployments-free-per-day` por exceder 100 deploys em 24 horas; não disparar novas builds repetidas nem alterar plano. Registrar os SHAs dos commits e publicar uma única versão QA quando quota permitir, após CI aprovado.

### Diagnóstico provado nos logs QA — Cloudflare PDF (06/11/2026)

- Registro Vercel da tentativa mostrada no vídeo, às 18:44:58.937 UTC (15:44:58 Brasília): `POST /api/ai-assistant`, código sanitizado `CLOUDFLARE_MODEL_INVALID_JSON`, após 46.507 ms (~46,5 s), etapa `interpretation`. Não atribuir erro a R2, ao mapa, a créditos nem às cotas do projeto sem evidência: a resposta do modelo não era JSON interpretável pelo parser antigo.
- Novo `src/lib/aiStructuredJson.ts` aceita **um único JSON sintaticamente válido** mesmo dentro de uma cerca markdown ou acompanhado de uma explicação; jamais tenta completar JSON truncado, escolher entre duas respostas, adivinhar cotas ou executar strings. Valida chaves de documento, valores e tamanho; o controle de procedência textual, página e revisão humana permanece no pipeline existente.
- `server/architectural-pdf-provider.ts` usa parser estrito, prompt compacto e identifica `finish_reason=length` como `CLOUDFLARE_MODEL_INCOMPLETE` em vez de um erro genérico. Sem retries ou chamadas pagas adicionais. No frontend, erro Cloudflare oferece botão explícito para tentar **Leitura Local** (troca de modo por ação do analista).
- `src/test/aiStructuredJsonQa.test.ts` cobre resposta pura, cercada, JSON em texto explicativo, múltiplos objetos, truncamento, limite de tamanho, citações e `finish_reason=length` sem segunda chamada à IA.
- `src/test/architecturalPremiumReaderControlsQa.test.ts` confere `iframe key={accessUrl}` e fragmento `src={previewUrl}` sem remontagem de página nem `view=FitH` duplicado.
- **Continuam obrigatórios**: validação E2E autenticada com modelo real e créditos próprios; inspeção visual de toda prancha, imóvel cadastral, mapa GIS oficial e parâmetros jurídicos vigentes. Não publicar em produção sem essa comprovação.


## Release QA — consolidação após revisão do vídeo (06/11/2026)

- Branch: `fix/qa-triagem-analise-pagamento-20261101` · PR #118 DRAFT.
- SHA de código validado: `afb466e0638924a9b3fc1d4535dcd955779037e8`.
- GitHub: Quality Gate sucesso, **245 arquivos de teste e 1.406 testes aprovados**, validação Neon sucesso. Deploy de homologação só com commit contendo `[deploy-qa]`, em razão do Ignored Build Step do Vercel.
- Melhorias: cartas/cards premium na Leitura Técnica, PDF com fragmento único e chave estável ao mudar de prancha/zoom, botão para abrir prancha citada, cancelamento e timeout da IA e parser de resposta JSON única, estrita e rastreável para Cloudflare. Não há alteração de processo, produção, permissões, regras legais ou cadastro municipal.
- Leitura de projeto REAL: **não homologada**. Claude visual pode exigir saldo externo; Cloudflare retornou `CLOUDFLARE_MODEL_INVALID_JSON` no vídeo; parser foi corrigido em código, mas chamadas remotas após essa correção ainda exigem teste autenticado. Documentos legais continuam em `municipality_settings.general_settings` na QA. Sem perímetros GIS, vínculo cadastral QA04 e regulações reais ativas, nenhum parecer legal deve ser apresentado como conformidade.
- O primeiro deploy manual do SHA validado foi cancelado apenas porque o commit não tinha `[deploy-qa]` (mensagem Vercel: Ignored Build Step returned exit code 0). O próximo commit de release usa o marcador correto. Não confundir cancelamento com erro de build.


## UX de aceite e extração — revisão do vídeo de 06/11/2026 às 19h38

- Vídeo do usuário `20261106-1938-23.9206183.mp4` (117,7 s, mesa documental QA04). O aceite para provedor externo aparecia sem caixa de seleção perceptível, como bloco de texto longo. O botão de extração ficava abaixo de muitos avisos e cards; o relatório listava índices não identificados em massa.
- **Correção raiz na mesma branch QA e PR #118:** `ArchitecturalPdfAiPanel.tsx` exibe, na primeira dobra, métodos compactos **Leitura Local / IA Visual / IA Documental** (quando este serviço estiver configurado); modos de QA adicionais ficam em `Outras modalidades de teste`. Um checkbox real, acessível por teclado e com **indicador quadrado de alto contraste**, identificado por `data-sigapro-ai-consent-checkbox`, fica imediatamente acima do botão principal de extração. O rótulo clicável é `ACEITO o envio deste PDF à IA externa`, inclui o prestador correspondente, e nunca inicia uma transmissão por marcar a caixa.
- Somente depois da interação o botão permite iniciar POST externo, exigindo `confirmedTransfer:true` e verificando sessão/documento. O aceite é zerado ao selecionar outra modalidade, outro arquivo ou processo. Leitura Local não exige aceite externo. Sem provedor, sem documento liberado, sem versão vigente ou sem autorização de analista, o botão permanece bloqueado com **causa visível** (`data-sigapro-ai-disabled-reason`); a caixa de aceite NÃO contorna autorização de backend, saldo ou habilitação de fornecedor.
- O CTA agora aparece imediatamente junto à autorização (`data-sigapro-ai-primary-action`). Disponibilidade, cadastro do lote, histórico de lei, alertas e detalhes de créditos ficam em uma área técnica recolhível (`data-sigapro-ai-diagnostics-details`), preservando auditoria sem poluir a tela. Medidas comprovadas aparecem primeiro; ausentes/pendentes recolhidas em `data-sigapro-ai-unidentified-measures`. Páginas e relatório preliminar foram compactados, sem ocultar a rastreabilidade. Checkboxes de conferência por cota ganharam indicador real com contraste.
- A comparação automática com a QA04 só aparece quando `VITE_SIGAPRO_NEON_ISOLATED=true` e o documento selecionado é **a planta fictícia oficial QA04**, evitando exibir benchmark de teste em projetos reais.
- `src/test/architecturalAiConsentFlowQa.test.tsx` executa interações React/JSDOM: local sem consentimento externo, Cloudflare bloqueado até checkbox marcado, POST com modo/documento/consentimento correto, zero tentativas POST antes do aceite, troca de modo revoga consentimento e triagem impede extração mesmo com consentimento. Testes antigos de rótulo e contraste atualizados para o novo padrão sem retirar travas.
- Quality Gate do commit de implementação `4a24ddce3e1ce714fe3381ea8415d0407ef3c2f3` aprovado: 246 arquivos e 1.410 testes, build, TypeScript, lint e auditoria npm sem vulnerabilidades conhecidas. Confirmar separadamente Neon migration validation e release Preview QA antes de declarar publicação.
- **Restrições externas já conhecidas:** GitHub CI não valida a integração real com o provedor nem demonstra que uma planta é corretamente interpretada; Vercel Hobby relatou limite 100 deploys/24h (HTTP 402). Não editar produção, não mesclar `main`, não mascarar falta de créditos; homologação territorial e legal continuam separadas do UX. A automação existente de publicação pendente deve apontar para o SHA de release mais recente, nunca tentar publicar uma versão anterior.

### Publicação consolidada do aceite na homologação

- Último código validado com Quality Gate e Neon migration validation aprovados: `4a24ddce3e1ce714fe3381ea8415d0407ef3c2f3` (246 arquivos / 1410 testes). Alteração documental intermediária preservada na mesma branch.
- O novo commit de publicação contém o marcador `[deploy-qa]` exigido pelo Ignored Build Step da Vercel. Publicar APENAS preview branch QA; PR #118 permanece DRAFT; produção inalterada.
- Antes do aceite final, verificar que o alias de homologação serve o mesmo SHA do release e executar teste autenticado de aceite → extração com uma modalidade habilitada; cartão visual validado por CI não é prova de deploy.
- Existe automação de publicação previamente criada para 07/11/2026. O SHA-alvo precisa ser atualizado para ESTE commit de release, nunca para `4ba64935` anterior. Não criar automação duplicada.

## QA — identidade do PDF, diferenciação das modalidades e cadastro territorial (06/11/2026, 20h34)

**Evidência de vídeo**: `20261106-2034-06.9862100.mp4` mostra dois downloads `SIGAPRO-leitura-915e1c63-v2 (5).pdf` e `(6).pdf` de cerca de duas páginas, usados nas modalidades leitura local e interpretação textual, com cabeçalho igual, protocolo UUID e sem identificação de Prefeitura/proprietário/responsável técnico. Ambas reportam `property_id` ausente e zona oficial não comprovada. Screenshot `image(20261106-203853).png` mostra bloco de aceite antigo, porque o alias QA público ainda serve `ca7654d8`, enquanto o código novo de aceite está somente na branch.

**Corrigido no código QA**:
- `architecturalReadingReportPdf.ts` incorpora identificação `municipalityId`, `municipalityName`, protocolo oficial, proprietário, documento do proprietário, responsável técnico, endereço, inscrição, lote/quadra e uso **somente conforme campos declarados do processo**. Dados ausentes aparecem como não informados. Tais campos não provam titularidade, autenticidade ou localização georreferenciada.
- Cabeçalhos separados conforme método: EXTRAÇÃO LOCAL DE COTAS, INTERPRETAÇÃO DE TEXTO POR IA e LEITURA VISUAL POR IA. `ArchitecturalPdfAiPanel.tsx` salva com nomes de arquivo **diferentes por método**, protocolo e versão: `SIGAPRO-extracao-local-...`, `SIGAPRO-interpretacao-texto-ia-...` ou `SIGAPRO-leitura-visual-ia-...`; métodos podem identificar as mesmas cotas em um PDF e continuam sujeitos a revisão humana.
- Relatório reorganizado: identificação das partes, documento e método, evidências com página e trecho, índices sem leitura agrupados; `NAO AVALIADO` é distinto de `NAO CONFORME`, e falta de cadastro do imóvel ou polígono legal NÃO é reprovação. O panel exibe aviso compacto de ausência de vínculo cadastral e protocolo + prefeitura.
- A entidade municipal é usada somente se `municipality.id` coincide com o tenant/município do processo. Sem fonte municipal confirmada não há fallback inventado.
- `src/test/architecturalReadingIdentityQa.test.ts` executa PDF com jsPDF real e confere os campos declarados, cabeçalhos distintos, estado não avaliado sem imóvel e que código usa a fonte processual. Os nomes de partes no teste são 100% fictícios.
- SIGAPRO QA04 `915e1c63-ebda-4cdd-8e95-34316d9e0089` permanece com `property_id=NULL`. As tabelas de mapas, geometrias zonais e lotes oficiais na Neon QA continuam zeradas, assim como as regras legais reais ativas. Este bloqueio não pode ser sanado por inferência de endereço da planta: exige cadastro oficial do imóvel e mapa georreferenciado/homologado. A IA pode ler o PDF, mas **não pode concluir conformidade jurídica**.
- A seleção de IA visual e de modalidades extras depende de credenciais/saldo do provedor contratado, teste visual real e aceite explícito. O painel de aceite de checkbox grande foi implementado em commit QA anterior `1b87fd6c...` e o código atual o preserva; a versão do vídeo é anterior, não a UI nova.
- Quality Gate da implementação `247c27b38b0fd389dec0ec896c1b59b471db672e` aprovado: **247 arquivos de teste / 1.414 testes**, build, TS, lint e zero vulnerabilidades npm conhecidas. Validação Neon aprovada. Próximo commit é apenas documento de release `[deploy-qa]`. Publicar Preview, nunca main nem produção; conferir SHA do alias na Vercel antes de declarar interface publicada.

### Publicação QA — atualização institucional do PDF (06/11/2026)

- SHA do código com fallback de município por tenant e relatório por modalidade: `af2887323a173baf25dc20a64dc6da464cb44efb`.
- O primeiro Quality Gate/Neon aprovado desta atualização foi `247c27b38b0fd389dec0ec896c1b59b471db672e` (247 arquivos / 1.414 testes). Validar novamente QA/Neon no SHA final desta publicação; document-only commit não promove regra.
- Esta publicação inclui o aceite visível com checkbox e CTA, relatórios separados para leitura local/documental/visual, dados do município e partes processuais quando existem e separação de conformidade **não avaliada** versus não conforme.
- A Vercel Preview usa `[deploy-qa]` no commit, somente branch `fix/qa-triagem-analise-pagamento-20261101`. Não mesclar PR #118 na main, não publicar produção. O alias QA atual precisa apontar para este SHA antes do aceite. Se o limite 402 persistir, a verificação programada deve tentar uma vez após liberar a cota.
- Evidências oficiais cartográficas, perímetro do lote e regras legais reais ativas ainda ausentes na Neon QA: não fingir homologação de parecer jurídico. Nenhuma mutação em produção.

## QA - Relatório A4 premium e maior cobertura de cotas do Projeto Arquitetônico (06/11/2026, vídeo 21h24)

**Fonte do diagnóstico:** vídeo `20261106-2124-03.2006416.mp4` de 119,4s. O usuário ainda visualizou dois PDFs antigos com a mesma diagramação genérica e vários índices não comprovados. Alias QA Vercel ainda apontava para `ca7654d82674cd5ae06f51b782eb1f1673d97b91`, enquanto as melhorias anteriores existiam apenas no código da branch.

### Implementado e preservado nesta branch

- `src/lib/architecturalReadingReportPdf.ts` foi **redesenhado**: A4 com faixa institucional azul-marinho, cor de identificação do método, hierarquia tipográfica, campos em cartões claros, resumo executivo de quantidade de cotas com evidências, inventário de páginas, tabela de métricas com valor/página/trecho, pendências categorizadas, cadastro/zoneamento, leis não validadas, alertas limitados, rodapé com protocolo, número da página e ressalva de não aprovação. Fonte da identidade é o `ProcessRecord`, sem criar dados artificiais de CPF, profissional ou imóvel. Métodos LOCAL, TEXTUAL IA e VISUAL IA têm títulos, detalhes de escopo e prova de cobertura distintos.
- Inserção **opcional** de logo/brasão real da prefeitura, apenas do branding que corresponde ao mesmo tenant do processo; PNG/JPEG, tamanho e timeout limitados, dimensões proporcionais, falha de carregamento não impede o relatório. Nunca inventar imagem/brasão.
- `ArchitecturalPdfAiPanel.tsx` busca a imagem já cadastrada com tamanho controlado, e repassa os dados oficiais/declarações do processo ao gerador; download continua identificado por método e versão. `DocumentAnalysisPage.tsx` valida o município do branding ao passar a imagem.
- `server/native-architectural-pdf.ts`: as expressões de leitura local não estão mais restritas a cinco medidas. Acrescentadas verificações de PAVIMENTOS (declarados), taxa de permeabilidade (somente se numérica e expressa), testada, altura e CA do próprio projeto quando literalmente declarados. **Não inferir CA mínimo legal** nem calcular permeabilidade sem área permeável declarada. Conflitos rejeitados. Leitura continua TEXTUAL, não CAD.
- `DrawingExtraction.textCoverage` comprova quantas páginas tinham camada textual e quantas foram percorridas; é diferente de inspeção visual. `supplementaryFacts` conserva área construída, área descoberta e recuos laterais esquerdo/direito com página/citação, apenas como **informações auxiliares sem efeito legal**; não são transportadas automaticamente aos parâmetros legais.
- `architecturalReadingReportPdf.ts` agrupa índices não localizados, evidências incompletas e contagem de páginas. `NAO AVALIADA` continua distinto de `NAO CONFORME`; processo QA04 não tem lote espacial cadastrado nem mapa oficial georreferenciado, portanto parecer legal permanece bloqueado.
- Testes ampliados de PDF fictício QA04: verificação de 3 páginas de texto, quantidade de pavimentos explícita na prancha 1, medidas de recuo na 2 e área do lote na 3, dados complementares e PDF com nomes longos. `architecturalPremiumPdfLayoutQa.test.ts` gera documentos reais via jsPDF e confere marcação, campos, distinção de métodos e rodapés em todas as páginas. Não é validação visual em navegador nem certificado de conformidade urbana.
- Quality Gate do commit de código `92789a8d9511b19d183c5f95f6d25878657b6173` **aprovado**: 248 arquivos, 1418 testes, TypeScript, ESLint, build e auditoria npm sem vulnerabilidades conhecidas. Conferir workflow Neon completo e o Quality Gate do release antes de publicar.

### Bloqueios que permanecem reais

- Código não equivale a publicação. Preview QA só pode apontar a este commit (release contém `[deploy-qa]`) quando o limite diário Vercel permitir. Não tocar na main/produção; PR #118 DRAFT.
- Leitura de gráficos/cotas desenhadas sem texto exige provedor visual externo com créditos e teste HTTP autenticado; `ChatGPT Plus` não inclui créditos de API no SIGAPRO. Não afirmar que o leitor textual inspecionou todas as cotas CAD.
- GIS oficial (geometria de zonas e lotes), vinculação de imóvel no processo QA04 e lei vigente com regras ativas seguem pendentes de validação documental. Sem esses elementos, o sistema pode extrair cotas candidatas, mas não emitir parecer urbanístico conclusivo.
- Conservar este status como fonte única para retomada entre chats, em conjunto com PR #118 e a branch QA. Não repetir upload dos PDFs oficiais antes de consultar os vínculos reais no Neon/R2.

## Revisão QA — guia fictícia, nova guia documental e IA white-label (06/11/2026, vídeo 22h02)

**Evidências recebidas:** vídeo `20261106-2202-11.2231719.mp4`, imagem `image(20261106-220637).png`. Na QA04, a tela da etapa documental abre em nova guia com botão redundante `Voltar ao processo`, o card superior mostra a guia `QA-FICTICIA-SEM-COBRANCA-20261024` R$0,00 que falhava ao abrir, o aceite da IA exibe `ANTHROPIC CLAUDE` no card verde, e a IA visual requer crédito de terceiros. Verificação read-only Neon QA: guia de protocolo vinculada ao processo `915e1c63-ebda-4cdd-8e95-34316d9e0089`, `status=compensada`, `amount=0`, `original_pdf_key IS NULL`, `document_snapshot IS NULL`, não representando recolhimento bancário.

**Causas identificadas:** `ProcessDetailPage.printGuide` tentava executar `openLegacyGuideOriginal`, `readGuideOriginal` e fluxo de emissão/arquivamento bancário mesmo para guia explicitamente sintética, que por construção não tem PIX nem PDF original. `DocumentAnalysisPage` mostra `Voltar ao processo` também nas guias abertas separadamente. `ArchitecturalPdfAiPanel` mostrava marca de terceiros dentro do resumo principal de aceite.

**Correções da mesma branch QA, sem tocar produção:**
- `ProcessDetailPage.printGuide`: antes de abrir janela de preparo ou chamar banco, quando **somente** `VITE_SIGAPRO_NEON_ISOLATED=true`, `guide.kind=protocolo`, prefixo `QA-FICTICIA-SEM-COBRANCA` e `amount=0`, montar um `GuiaRecolhimentoOficialProps` de PRÉVIA ADMINISTRATIVA, com município, proprietário, CPF/CNPJ, profissional, endereço, inscrição e protocolo a partir dos campos efetivamente cadastrados. `nonPayablePreview=true`, valor zero, sem PIX, boleto, linha digitável, código de barras ou credenciais bancárias. Abrir pela janela HTML A4 preparada para imprimir/salvar PDF; não grava original, não emite cobrança, não executa Mercado Pago nem altera o estado `compensada` fictício. Dados ausentes não são inventados.
- Na visão-resumo do processo, `QA-FICTICIA...` identifica `Prévia de protocolo — homologação`, com texto `Prévia sem cobrança — não pagar`, botões `Visualizar prévia` e `Imprimir prévia`. O restante dos títulos e todas as guias reais permanecem intactos.
- `GuiaRecolhimentoOficial.tsx` oculta o nome do provedor e detalhes de cobrança na prévia `nonPayablePreview`; autenticação declara NÃO EMITIDA, sem banco ou pagamentos. O fluxo oficial continua com QR/PIX reais e não é afetado.
- `ProcessDetailPage.openDocumentWorkspace` acrescenta `janela=1` à rota que abre em outra guia. `DocumentAnalysisPage` mantém o botão `Voltar ao processo` somente quando a rota NÃO foi aberta como guia avulsa. A navegação interna/segurança e os comentários existentes permanecem.
- `ArchitecturalPdfAiPanel`: mantém as modalidades técnicas e códigos internos de fornecedor para o backend, mas a interface principal exibe exclusivamente a marca SIGAPRO e textos genéricos para opções pagas ou de teste. **Privacidade e condições do processamento** continua identificando o real fornecedor selecionado, porque o analista deve saber o destinatário ao autorizar o envio do PDF. O relatório `architecturalReadingReportPdf.ts` não imprime nome de provedor terceiro na superfície principal. Nunca enviar documento ao fornecedor sem aceite específico.
- `Leitura Local · Grátis` fica destacada e continua sendo de texto/cotas declaradas, sem token/IA externa. Não prometer OCR visual gratuito ilimitado: o Cloudflare Workers AI permite quota diária gratuita limitada, e Gemini Free pode reutilizar dados para melhorar produtos. Não habilitar uso de PDFs reais de prefeitura em provedores gratuitos sujeitos a tratamento de dados sem base contratual e consentimento apropriados.
- Novo `qaNonPayableGuideAndWhiteLabel.test.tsx` cobre guia R$0 sem cobrança, HTML institucional sem QR/boleto/PIX, roteamento direto sem cartão de retorno e white-label com identificação na seção de privacidade. Teste antigo `projectAiEntryQa.test.ts` atualizado apenas para a nova localização do nome do fornecedor.
- **Quality Gate aprovado** no SHA de código `88635c72013171ec9aa00ff66ce8742fea960f90`: 249 arquivos/1422 testes, TypeScript, lint, build e auditoria npm sem vulnerabilidades conhecidas. **Neon migration validation aprovado**, sem novos SQL nem alterações de dados. Publicar APENAS branch QA via commit `[deploy-qa]`; PR #118 continua DRAFT.

**Critérios pendentes:** confirmar alias Vercel aponta o novo SHA e executar clique autenticado na prévia QA04 e no leitor gratuito. Validação do parecer urbanístico legal e leitura visual integral ainda não está homologada, pois faltam vínculo cadastral do imóvel, geometrias oficiais de zoneamento e créditos/provedor visual operacional. Não indicar conclusão funcional sem esses ensaios.


## QA — alinhamento integral das bordas da guia (06/11/2026)

- Pedido e imagem: `image(20261106-232424).png`, comprovante inferior do documento fictício QA04; cabeçalho e linhas do bloco direito (vencimento, número, valores) quebravam a grade vertical e os limites horizontais da parte esquerda.
- **Causa exata no código anterior:** `dam-receipt-header` tinha lado direito `22mm` para o rótulo, enquanto `dam-receipt-body` renderizava duas grades isoladas de alturas variáveis, usando rótulos `28mm`. Isso interrompia o mesmo divisor vertical e deixava linhas horizontais desencontradas.
- **Correção aplicada** em `src/components/GuiaRecolhimentoOficial.tsx`: 6 linhas de informação com contêiner comum `dam-receipt-body-row`, cada qual pareando campos municipais e financeiros; colunas de recibo `minmax(0,1fr) 58mm` e trilha direita `26mm minmax(0,1fr)` iguais no cabeçalho e no corpo; largura do brasão/labels esquerda `28mm`; altura mínima 7,6mm, borda inferior única, alinhamento vertical central e quebra controlada em nome, endereço e número longo. A natureza da guia substitui repetição desnecessária do código no corpo.
- A observação foi deslocada a **uma faixa de largura inteira** (`dam-receipt-note-full`), mantendo uma linha de borda contínua; autenticação e eventuais campos PIX/QR permanecem abaixo em duas colunas com divisor vertical consistente. Impressão A4 e outros dados de guia real preservados.
- Novos testes `src/test/qaGuideReceiptAlignment.test.tsx`: comprovante renderizado real, 6 pares com 6 lados esquerdo/direito, malha de 26mm compartilhada, cabeçalho de 58mm, observação em largura inteira, código longo não truncado e ausência de pagamento/PIX na prévia QA04.
- **Qualidade do código**: commit `65e5b6b7823aea5778f725a4d93ef6af3cc5213d`, Quality Gate **SUCCESS**, Neon migration validation **SUCCESS**. Não houve SQL, mudança de valores, alteração de regras de pagamento nem impacto em produção. A correção deverá ser publicada só em Preview QA usando commit com marcador `[deploy-qa]`, PR #118 DRAFT; depois confirmar alias QA e testar visualmente impressão. A passagem dos testes estruturais não substitui auditoria visual com navegador.


## QA — logotipo Master sem encolhimento entre páginas (06/11/2026, vídeo 00h22)

- **Reprodução:** vídeo `20261107-0022-47.5006756.mp4`, 9,83s: o mesmo logotipo no cabeçalho Master é renderizado pequeno e grande ao alternar entre Protocolo, Planos e Guias, Carteira institucional e retorno; a moldura não muda, o conteúdo visual varia.
- **Bloqueio de publicação encontrado:** alias fixo QA `projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app` ainda servia `02efd4593b0e8a8e658bd5602b685e0642c97cfa` enquanto os commits anteriores de correção do Master `ae98ceac` / `3eb04317` foram ignorados pelo build automático (marcador `[deploy-qa]` ausente). Código no Git não deve ser apresentado como interface já publicada.
- **Correção da raiz, sem editar CSS global:** `src/hooks/useInstitutionBranding.ts` retém em memória por 60s o branding remoto de plataforma entre montagens do `PortalFrame`, sem passar por `null`/placeholder ao clicar em outra rota; renova após o TTL e imediatamente após edição explícita; ignora respostas assíncronas R2 de componentes desmontados ou de solicitações obsoletas e reage a mudanças de URLs independentes de cabeçalho/rodapé. Preserva configurações específicas de cada variante; sem acoplar marca municipal e Master.
- **Regressões:** `src/test/masterLogoFrameStabilityQa.test.ts` cobre nenhuma normalização automática `-enquadrado.png`, escala/offset próprios, cache remoto entre rotas, descarte de resposta assinada atrasada e reatividade às edições.
- **Gates do último commit de código `6f7c0f75ea55d063da61b4a1495441ed92cdf769`:** SIGAPRO Quality Gate **SUCCESS** (251 arquivos de teste, 1.429 testes, TS, lint, build, npm audit) e Neon migration validation **SUCCESS**. Zero SQL, zero alterações de pagamentos/processos/IA e zero mudanças na `main` ou banco de produção.
- **Publicação:** este commit documental autoriza somente **Preview QA** via marcador `[deploy-qa]`; não realizar merge da PR #118 (DRAFT), não promover ao domínio de produção. Conferir SHA efetivo do alias após Vercel READY e validar em sessão Master autenticada navegação rápida /master → /master/planos → /prefeitura/protocolos → /master. Não declarar aceite visual antes desse teste. A leitura visual de PDF, a vinculação GIS oficial e o parecer urbanístico legal seguem dependentes de evidências/autorização, não desbloquear automaticamente.


## QA — correção da raiz do logo Master ao mudar de página (07/11/2026, vídeo 00h53)

- Vídeo `20261107-0053-34.4064127.mp4` de 5s inspecionado quadro a quadro: ao alternar /prefeitura/organograma, /master e /dashboard, o logo do cabeçalho institucional aparece menor e em seguida cresce, sem ação no editor. Não é apenas largura de CSS; fonte da imagem é temporariamente substituída.
- Confirmação read-only: Neon QA, banco `sigapro_migration_stage_20260923` da branch `br-solitary-sound-b4xlbvs6`, possui `public.platform_branding` do SIGAPRO, cabeçalho `master-header-logo-enquadrado.png` e escala 1. Nenhuma atualização ou migração de banco é necessária para este defeito.
- **Raiz adicional corrigida em `src/components/platform/InstitutionalLogo.tsx`:** quando o componente Master era remontado e `branding.logoUrl` ainda estava vazio, ele mantinha uma imagem personalizada válida do cache da sessão, mas ao mesmo tempo tratava o logo genérico `sigapro-logo.png` como `pendingUrl` prioritário e o pré-carregava/promovia, rebaixando a identidade para a versão visualmente menor até o R2 voltar. Agora uma fonte personalizada já validada no MESMO contexto Master não é substituída por fallback genérico durante hidratação. Troca explícita para logo padrão continua permitida; erro real de imagem ainda pode usar fallback; prefetch, src e estilos municipais permanecem intactos.
- `src/components/platform/InstitutionalLogo.test.tsx` acrescenta ensaio com a imagem real do componente React: cache após load, desmontagem, remontagem com branding ainda ausente, garantia de nenhuma promoção do fallback, apenas 1 `img` e permanência da imagem ao chegar a URL configurada. Todos os testes existentes permanecem. Os commits anteriores de `useInstitutionBranding` mantêm escala/offset oficial entre páginas, cache de metadata e cancelamento de respostas R2 obsoletas.
- **Gates do commit de código `862685d600ac3faef52a909781b97f3c7dfc0d6e`:** SIGAPRO Quality Gate **SUCCESS** e Neon migration validation **SUCCESS**. Zero alteração de processo, pagamento, regra legal, schema ou produção.
- **Bloqueio da interface:** o alias QA ainda servia o SHA antigo `02efd4593b0e8a8e658bd5602b685e0642c97cfa`. Vercel Hobby respondeu HTTP 402 por limite diário (100 deploys/24h) à tentativa anterior. Este commit documental contém o marcador `[deploy-qa]` somente para Preview; não mesclar PR #118, não publicar main ou domínio oficial. Após READY do release, conferir SHA do alias e testar navegação Master autenticada antes de declarar aceite visual.


## QA — foto do perfil Master recuperada de R2/Neon (06/11/2026)

- **Diagnóstico comprovado read-only:** banco Neon QA `sigapro_migration_stage_20260923`, branch `br-solitary-sound-b4xlbvs6`: há um perfil `admin_master` com `avatar_url` no formato `r2:platform/profiles/avatars/<id>/<arquivo>` (estrutura verificada sem expor identificadores). Fotos dos perfis municipais usam `r2:municipalities/<id>/profiles/avatars/...`.
- **Falha-raiz:** `src/lib/profileAvatarDisplay.ts` e `server/api/profile-avatar-open.ts` aceitavam apenas prefixo `municipalities/<uuid>`. Assim, um Master com foto já salva no Neon recebia URL vazia/HTTP 400 e a topbar mostrava apenas as iniciais. Paralelamente, `src/integrations/r2/storage.ts` bloqueava novos uploads quando `tenantId` era nulo (legítimo no Master).
- **Correção isolada:** as duas whitelists de imagens autorizam somente as pastas `platform/profiles/avatars/<user>/<arquivo>` e `municipalities/<uuid>/profiles/avatars/<user>/<arquivo>`, rejeitando caminhos fora da pasta e traversal. `PerfilPage.tsx` especifica `platformScope: isMasterRole` no upload; `storage.ts` escreve Master em `platform/profiles/avatars` sem criar prefeitura fictícia. Backend `r2-upload.ts` permanece com o gate `is_master` para uploads sem município. Nenhum dado da conta foi alterado, nem se migrou foto automaticamente.
- **Supabase:** a conexão do projeto legado consultada na auditoria reportou status `INACTIVE`. O Preview atual usa Neon QA, não é correto prometer espelhamento automático Supabase→Neon. A foto R2 já referenciada no Neon é a origem correta para o Master.
- **Regressões reais:** `src/lib/profileAvatarDisplay.test.ts` verifica exibição do Master, compatibilidade municipal e bloqueio de caminhos ilegais. `src/test/masterAvatarStorageQa.test.ts` testa parser HTTP, payload e chave R2 do upload Master, não conversão implícita municipal→Master e autorização server-side conservada.
- **CI do SHA `3e161c323d4d96c6ee383f685089227f29a0713a`:** SIGAPRO Quality Gate SUCCESS (252 arquivos, 1.437 testes, TypeScript, lint, npm audit e build), Neon migration validation SUCCESS. Zero SQL, zero alterações de pagamentos/processos/regras/produção.
- **Publicação:** marcador `[deploy-qa]` habilita apenas Preview da branch QA isolada. PR #118 deve continuar DRAFT, sem merge ou produção. Após Vercel READY, conferir alias e SHA servido, testar sessão Master real com foto após F5 e nova navegação; não afirmar leitura do arquivo físico R2 comprovada pelo CI até ensaio autenticado.


## QA — Dashboard: hover dos gráficos de rosca sem quebra visual (07/11/2026)

- Evidência: vídeo `20261107-0123-14.0683448.mp4` de 6,3s. Ao passar mouse sobre as roscas em Dashboard > Processos, o tooltip aparecia comprimido em uma coluna de poucos pixels, quebrando texto letra a letra e sendo cortado por `overflow-hidden`.
- Raiz: `DashboardHomePage.tsx` tinha `xl:grid-cols-[minmax(0,0.95fr)_minmax(220px,0.85fr)]` baseado no viewport, apesar de cards de distribuição individuais estreitos em grade de três. Isso reservava 220px+gap à legenda e quase nada ao donut; `Recharts Tooltip` acoplava-se a esse tamanho e ainda era recortado pelo `TableCard`.
- Correção visual pontual: `DistributionCard` agora usa `container-type: inline-size` e CSS `@container` em `src/index.css`; uma coluna em painéis estreitos e duas somente quando há largura física suficiente para gráfico de no mínimo 150px e legenda de 190px. Removido apenas o tooltip flutuante das roscas; hover em fatia/legenda mostra valor selecionado no centro e detalhes (rótulo, quantidade, percentual) em barra interna de altura fixa 68px. Legendas são acessíveis por foco e clique; cores contrastam em tema claro/escuro. Gráficos de linhas/barras, fluxo de processos, IA e arrecadação não foram alterados.
- Regressões: `src/pages/saas/DashboardHomePage.distribution.test.tsx` cobre markup real, hover, foco, vazio, CSS responsivo e ausência do balão. O teste simula `ResizeObserver`, ausente no jsdom mas presente no navegador; não adiciona polyfill em produção. O tamanho do número central também foi calibrado para painéis pequenos.
- **Qualidade do commit de código `fd91096d3b1d97523da235ebe681d6a331961c47`:** SIGAPRO Quality Gate SUCCESS (**253 arquivos, 1.440 testes**), TypeScript, ESLint, build e npm audit sem vulnerabilidades conhecidas; Neon migration validation SUCCESS. Não houve modificação de tabela, perfil, prefeitura, pagamento, processo ou domínio oficial.
- **Publicação QA:** commit desta documentação usa marcador `[deploy-qa]` para Preview isolado. Conferir Vercel READY, SHA exato do alias QA e validar hover com usuário autenticado e zoom normal antes de homologação visual definitiva. Não mesclar PR #118, não promover main ou alterar produção.


## QA — revisão complementar Dashboard Master (07/11/2026)

- Vídeo `20261107-0143-59.1314802.mp4`: roscas extremamente pequenas e tooltip com texto quebrado letra a letra em Dashboard > Processos, tema escuro Master. Verificação de deploy comprovou que o alias QA ainda servia SHA `61a8c3edd0617ff40caace8553b43f1ed535c5a2`, anterior ao patch CSS/hover `fd91096d3b1d97523da235ebe681d6a331961c47` e release anterior `eda97d2ca7f19470a4dbae1a834d20ddb5a0405f`. Logo, o vídeo prova a versão antiga em execução, não uma falha reproduzida na alteração ainda não publicada.
- Mantida correção de roscas pela largura real do card (CSS `@container`), removido tooltip flutuante cortado, apresentação interna de valor/percentual/legenda legível, acessibilidade por hover/foco/clique. O layout não muda contagens nem regras.
- Polimento complementar específico do vídeo: `src/lib/dashboardPresentation.ts` formata valores internos `aprovacao_projeto`, `licenciamento`, `habite_se`, etc. exclusivamente para exibição, preservando o armazenamento e a contagem; títulos e descrições dos gráficos de status, tipo, etapa crítica e evolução receberam acentuação PT-BR. `src/lib/dashboardPresentation.test.ts` garante o comportamento e preservação de rótulos já conferidos.
- **Código `d424c1ba30c384a1614ced5837facb5a16ae7759` com CI verde:** SIGAPRO Quality Gate SUCCESS, **1.442 testes em 254 arquivos**, TypeScript, ESLint, npm audit e build PASS; Neon migration validation SUCCESS. Sem alterações em banco, processo, pagamentos, lei, IA ou produção.
- **Bloqueio de publicação Vercel:** tentativa anterior do release `eda97d2c` retornou HTTP 402 `api-deployments-free-per-day` (>100 deploys em 24 h). Não repetir deploys até liberação da cota. A tarefa de publicação QA deve utilizar SOMENTE o novo release desta nota, checando HEAD exato, os dois gates, cota, SHA servido e estado READY do alias. Enquanto alias ainda for `61a8c3ed`, não prometer que correção está visível ou validada por pessoa autenticada.
- PR #118 permanece DRAFT, não mesclar em `main`, não implantar no domínio oficial. Publicação via marcador `[deploy-qa]` exclusivamente Preview da branch isolada.


## QA — auditoria transversal premium de todos os Dashboards (07/11/2026)

**Evidência:** vídeo `20261107-0153-26.9636135.mp4` (1806x856) em `/dashboard/processos` com conta Master, mostrando três mini-roscas (aproximadamente 55-75px) espremidas e tooltip quebrando palavras verticalmente. O alias QA fixo ainda estava servindo a revisão antiga `61a8c3edd0617ff40caace8553b43f1ed535c5a2`, anterior à correção de hover; as imagens não comprovam erro na revisão nova porque não estava implantada.

**Correção transversal, sem mexer nas regras de processo:**
- `src/components/ui/chart.tsx`: removido `ResizeObserver` redundante com estado `containerKey` que destruía/remontava `ResponsiveContainer` a cada resize e podia causar pulsação de SVG/hover em qualquer gráfico. Mantido resize nativo do Recharts. Tooltips compartilhados com largura mínima e máxima legíveis, texto normal sem quebra letra a letra, números sem quebra e exibição correta de zero.
- `src/pages/saas/DashboardHomePage.tsx` e `src/index.css`: gráficos de rosca maiores (até 272px), colunas apenas quando largura interna do card é >=520px e cada coluna preserva >=200/250px; informações de hover dentro do card, sem popup flutuante. Grades de Visão geral, Processos, Financeiro, Usuários e Operacional só viram duas colunas a partir de 2150px de viewport, evitando três mini-roscas lado a lado com sidebar a 1806px. Tooltips de gráficos de área/barra ancorados em x=12,y=12, dentro da área visível, sem seguir a seta e serem cortados pelas bordas. Copy corrigida em PT-BR.
- `src/pages/saas/TenantAdminPage.tsx`: Visão geral municipal com grade de três indicadores apenas a partir de 2200px e painel institucional de duas colunas só a partir de 2150px, sem conteúdo espremido com menu lateral. MasterAdminPage e ExternalPortalPage auditadas: usam cards institucionais compartilhados, sem outras roscas Recharts nesta tela.
- Regressores `src/test/dashboardSharedChartPremiumRegression.test.ts`, `src/pages/saas/DashboardHomePage.distribution.test.tsx`, `src/test/dashboardSummaryNavigationRegression.test.tsx`: cobertura para cinco módulos, diferentes perfis, preservação de campos, tooltip, breakpoint real do card e ausência de remount. **SHA de código: `a440fa4b26509dd74d68a813aea106b01e7778bd`; Quality Gate SUCCESS: 1.447 testes em 255 arquivos, TypeScript, ESLint, build e segurança; Neon migration validation SUCCESS.**

**Deploy e segurança:** PR #118 DRAFT, nunca merge em main/produção. A plataforma Vercel impôs limite `402 api-deployments-free-per-day` (mais de 100 deploys/dia), portanto não alegar que QA visual foi corrigido em site antes de Vercel confirmar alias READY servindo exato SHA do release deste registro. O marcador `[deploy-qa]` no commit de documentação identifica próximo release PREVIEW, isolado, quando a cota liberar. Programação deve conferir alias e SHA exato, e tentar apenas uma publicação depois da liberação, sem loops de deploys nem promoção a produção. Inspeção de hover autenticada permanece pendente depois da publicação.


## 07/11/2026 — QA de segurança, IA, DAM e integridade financeira

**Código confirmado:** `497ed1d92ef0cb638887851359178ff881335d9a` — GitHub SIGAPRO Quality Gate **SUCCESS** (1.455 testes em 257 arquivos, TypeScript, ESLint, npm audit e build) e **Neon migration validation SUCCESS**. Os testes são automatizados e não substituem homologação autenticada nem uma transação real. PR #118 continua **DRAFT e sem merge**. Documento de critérios obrigatórios: [MATRIZ_ACEITE_PRODUCAO_SIGAPRO.md](./MATRIZ_ACEITE_PRODUCAO_SIGAPRO.md).

1. **Documentos privados por prefeitura:** `server/architectural-document-guard.ts` é barreira adicional antes do acesso R2/armazenamento municipal e antes de qualquer IA externa. Rejeita `tenant_id` e `municipality_id` divergentes, documento de outro processo, inválido, versão não inteira, path malformado e tipo que não é PDF arquitetônico. `server/ai-project-extract.ts` mantém RLS/RPC `authorize_technical_document_signing_v1` e também limita JSON pré-parseado a 2 KiB. Regressão em `server/architectural-document-guard.test.ts`.
2. **IA sem inventar medida legal:** `src/lib/architecturalPdfReadings.ts` não converte uma citação de limite legal/obrigatório em cota observada no projeto sem indicador explícito de medida proposta/medida. Continua proibida aprovação automática; leituras não verificáveis ficam pendentes. Testes em `src/test/architecturalPdfLegalLimitVsObserved.test.ts`. O motor visual contratado e precisão em plantas reais continuam **não homologados**.
3. **PDF DAM A4:** `src/lib/guidePdfGeometry.ts` e `src/lib/guidePdf.ts` agora preservam proporção da captura, centralizam no papel e mantêm margens A4, evitando esticar QR/brasão. Testes em `src/lib/guidePdfGeometry.test.ts`. Ainda requer abertura e inspeção visual com guia assinada/arquivada real.
4. **Guia e banco:** `server/guide-persistence.ts` bloqueia resposta `ok=false`, valor divergente, guia paga, cobrança de arrecadação municipal, troca da ordem associada, mistura QA/produção e vínculo em ambiente diferente da guia **antes** do RPC. Neon continua decidindo a transação de forma autoritativa. Testes em `server/guide-charge-integrity.test.ts`. Bancos diretos (Itaú/Santander/Caixa/GOVBR etc.) **não são universais**; exigem conector e teste por prestador. Não houve baixa real ou acesso a credencial.
5. **Release e governança:** sem deploy para produção, sem alterações em Neon/R2, sem compra de VPS ou ativação de IA. A versão atualmente servida pelo alias de homologação deve ser verificada por SHA; a última confirmação anterior ao presente release era `61a8c3edd0617ff40caace8553b43f1ed535c5a2`, anterior às melhorias e bloqueada pelo limite diário `api-deployments-free-per-day` da Vercel. Publicar em **Preview QA somente** a revisão exata identificada pelo commit `[deploy-qa]`, com uma tentativa após liberação da cota; confirmar SHA e READY antes de alegar resultado visual.

**Faltam para habilitar comercialização:** (a) dois municípios com testes IDOR/RLS reais; (b) bateria de plantas e escaneados com gabarito conferido; (c) relatório e guias A4/PIX abertos e arquivados; (d) webhook/baixa idempotente em ambiente bancário autorizado; (e) MFA/gestão de chaves/retencão LGPD; (f) backup/restauração testada; (g) teste visual autenticado com a versão correta. Nenhum desses itens foi falsamente marcado como concluído.


## 07/11/2026 — entrega consolidada: leitor documental nativo + integridade financeira

**Objetivo:** evitar correções pequenas e publicações repetitivas; implementar, testar e liberar um lote com escopo delimitado, sem alterar produção.

**Código validado:** \`01f7f23bfc682c78d24b9797364ec7e18f38ceff\` (Quality Gate SUCCESS: **1.463 testes em 259 arquivos**, TypeScript, lint, npm audit e build; Neon migration validation SUCCESS).

1. \`server/native-architectural-pdf.ts\`: ordenação comprovada de pranchas pela árvore real \`/Catalog → /Pages → /Kids\`, detecção de árvores inválidas/cíclicas/contagens divergentes sem inventar página; suporte a texto hexadecimal ASCII/UTF-16BE em \`Tj\` e \`TJ\`, rejeitando glifos inseguros; interpretação dos milhares BR em áreas como \`1.200,00 m²\`; reconhecimento parcial de planta de implantação com apenas uma cota explicitamente citada sem preencher outras por inferência.
2. \`server/guide-persistence.ts\`: comparação financeira estrita de valores de provedor em **centavos**, recusando \`1.001\`, \`1e0\`, decimais com três casas, zero, formatos ambíguos e valores de guia que precisariam de arredondamento; mantém todas as restrições já implementadas de prefeitura, ordem, ambiente e guia quitada.
3. Novos testes em \`src/test/nativeArchitecturalPdfExtendedCoverage.test.ts\` e \`src/test/bankChargeExactCentavosQa.test.ts\`: numeração alterada de Kids, PDF inválido, texto hex/UTF-16/TJ, cotas faltantes, números localizados e vínculo monetário; nenhum documento municipal real transmitido a IA durante testes.
4. Documentação detalhada em \`docs/LOTE_QA_INTEGRIDADE_PDF_FINANCEIRO.md\`. A matriz \`docs/MATRIZ_ACEITE_PRODUCAO_SIGAPRO.md\` continua a fonte de critérios de aceite.

**Limites da entrega:** leitor local gratuito não reconhece desenhos puramente raster, geometrias sem texto selecionável nem fontes sem mapeamento Unicode; não mede cotas de pixels, não aprova obras, não prova legislação municipal por si só. Bancos diretos dependem de conector/convênio e teste financeiro real autorizado; não houve movimentação bancária. Backups/RTO, auditoria externa LGPD e teste visual autenticado ainda pendentes.

**Publicação:** este commit de documentação com \`[deploy-qa]\` marca **uma única versão Preview QA**; confirmar \`READY\` + SHA exato no alias fixo antes de afirmar que o código está visível. PR #118 deve permanecer DRAFT; não dar merge em main nem mexer no domínio oficial.


## 07/11/2026 — QA consolidada: OCR raster gratuito, privilégios bancários, histórico Neon

**Código exato** \`71e814361947eedcfb1034392f5c4e9ac342f0ef\`. Confirmado em GitHub Actions: SIGAPRO Quality Gate **SUCCESS** (1.463 testes em 259 arquivos, TypeScript, lint, npm audit, build); Neon migration validation **SUCCESS**; **SIGAPRO OCR isolado - QA SUCCESS** (5 testes Python e execução real de Tesseract/Poppler em um PDF raster sintético). Nenhum projeto municipal verdadeiro, cobrança real ou documento sigiloso passou pelo OCR.

1. \`tools/ocr/scan_pdf.py\`, \`tools/ocr/Dockerfile\`, \`tools/ocr/test_scan_pdf.py\`: pipeline OCR português/inglês em arquivo privado, sem chave de IA, sem rede, limite de 8 MiB, até 16 páginas, 150 s, SHA-256, página individual, saída \`automaticallyApproved=false\`/\`measurementsVerified=false\`; formato e isolamento descritos em \`tools/ocr/README.md\`. **Código validado como serviço isolado; NÃO integrado ainda ao site de homologação, sem VPS contratado ou infraestrutura externa.**
2. \`server/mp-webhook-worker-privilege.ts\` e \`server/mp-prod-webhook.ts\`: antes de executar evento/conciliacão financeira, o worker conectado ao PostgreSQL precisa comprovar não ter BYPASSRLS, ser superusuário, herdar \`neon_superuser\` nem ter permissões de escrita/remoção proibidas em perfis e documentos. Caso contrário, falha fechada. Fluxo PROD só mudará quando houver autorização de merge e publicação; nenhum perfil/GRANT do Neon foi alterado. Testes em \`server/mp-webhook-worker-privilege.test.ts\`.
3. **Inspeção Neon de QA apenas leitura** (\`br-solitary-sound-b4xlbvs6\`): conexão MP de \`test\` ativa com \`last_test_status=ok\`, sem comprovar efetiva liquidação. Os índices únicos de webhook, ordem, pagamento e guia existem. **Achado grave:** o role \`sigapro_prod_webhook_worker\` da QA possui \`rolbypassrls=true\` e herda \`neon_superuser\`, com permissões amplas. Precisa de migração de privilégios estritos ensaiada e aprovada antes de operar financeiro real.
4. **Histórico Neon read-only**: ramo QA ativo com 2 municípios, 8 processos, 28 documentos, 11 guias, 10 perfis e 89 eventos de auditoria; ramo de ensaio histórico \`br-lucky-credit-b4evfnn0\` com 2 municípios, 3 processos, 16 documentos, 6 guias, 9 perfis e 70 eventos. Estruturas críticas legíveis com chaves primárias e RLS. Isso NÃO é restauração completa nem validação de backup R2 ou tempos RPO/RTO.
5. Relatório de evidências e limites: \`docs/QA_SEGURANCA_FINANCEIRA_E_RECUPERACAO_20261107.md\`. Matriz de aceite \`docs/MATRIZ_ACEITE_PRODUCAO_SIGAPRO.md\` atualizada. A inspeção visual autenticada dos dashboards, PDFs reais e IA sobre planta escaneada complexa ainda depende de dados/ambiente de teste controlado e de gabarito profissional.

**Liberação:** PR #118 permanecer **DRAFT**. Release \`[deploy-qa]\` autoriza somente Preview; verificar \`READY\` e SHA exato do alias de homologação. NUNCA merge main ou publicação no domínio oficial, NUNCA gravar no Neon de produção, NUNCA autorizar automaticamente bancos/credenciais/IA pagas. A ausência de prova funcional real permanece bloqueio de liberação comercial.


## 07/11/2026 — integridade de DAM/PIX e aceite comercial separado do CI

**QA DRAFT PR #118; produção intocada.** Endurecimento de `src/lib/guideOriginal.ts`: não recria guia após **qualquer status pago** ou `paid=true`; valida em resposta RPC o mesmo município/guia/processo e valor positivo em centavos exatos, inclusive quando NUMERIC chega do Neon como string; rejeita prévia não pagável, valor do PDF diferente do Neon, QR PIX de valor diferente e snapshot congelado inconsistente. `src/lib/pix.ts` passou a analisar os campos estruturais EMV byte a byte, evitar campos duplicados/truncados, verificar GUI Pix, moeda BRL, país, CRC e tag 54 de valor antes da geração oficial. Testes: `src/lib/guideOriginal.test.ts`, `src/lib/pixEmvValidation.test.ts`.

Foi implementado o **aceite comercial fail-closed** em `scripts/qa-commercial-acceptance.mjs`, `scripts/qa-commercial-acceptance.test.mjs`, `docs/QA_COMMERCIAL_ACCEPTANCE.json` e `docs/QA_COMMERCIAL_ACCEPTANCE.md`. Os dez itens seguem `pending` por ausência de prova funcional real. O script só responde `ready=true` quando todas as provas possuem SHA de release, revisor, data e arquivo privado com digest válido. Workflow `SIGAPRO Commercial Acceptance QA` fica manual e **reprova intencionalmente enquanto houver evidências pendentes**, sem alterar Vercel ou Neon. `SIGAPRO Quality Gate` roda os testes do próprio guardião, mas o relatório de prontidão não marca artificialmente sucesso comercial. Para obrigar a aprovação por GitHub Branch Protection, será preciso configurar o check requerido; não foi alterada nenhuma política de branch.

**Ainda não comprovados:** leitura e medição de plantas reais; sandbox bancário com liquidação e baixa; permissões SQL do worker corrigidas; restauração R2+Neon; testes visuais em todas as contas autenticadas. O OCR raster sintético no GitHub é válido como prova técnica restrita, não como aceite de IA.


## 07/11/2026 — QA consolidada de integridade financeira e gate comercial

**Código verificado antes do release:** `e476b5edc726811cfad11eb7803fd0f3a99f01df` — GitHub SIGAPRO Quality Gate **SUCCESS** com **1.477 testes em 260 arquivos**, TypeScript, lint, verificação de segurança e build; `Neon migration validation` **SUCCESS** e `SIGAPRO OCR isolado - QA` **SUCCESS**. Também passaram os testes Node.js do gateway privado e do novo gate de aceite. Produção oficial e banco PROD intocados, PR #118 **DRAFT** e sem merge.

**Integridade DAM:** `src/lib/guideOriginal.ts` agora recusa regenerar PDF original quando qualquer status indicar pagamento confirmado ou `paid=true`; antes de congelar/arquivar confere município, número da guia, processo, valor em centavos exatos (inclusive NUMERIC textual do Neon), modalidade não pagável e Pix. Verifica o snapshot que voltou do banco; se houver divergência, não monta nem envia PDF ao R2. Regressão em `src/lib/guideOriginal.test.ts`.

**BR Code PIX:** `src/lib/pix.ts` valida os campos EMV por comprimento UTF-8, duplicidade, CRC, GUI `br.gov.bcb.pix`, moeda BRL e país BR. Lê o valor da tag 54 em centavos e recusa valor discordante do original. QR dinâmico sem tag 54 só é admissível na emissão oficial quando há cobrança bancária registrada e vinculada; QR falso ou estruturalmente inválido não gera documento oficial. Testes em `src/lib/pixEmvValidation.test.ts`.

**Aceite integral independente:** `scripts/qa-commercial-acceptance.mjs`, `scripts/qa-commercial-acceptance.test.mjs`, `docs/QA_COMMERCIAL_ACCEPTANCE.json`, `docs/QA_COMMERCIAL_ACCEPTANCE.md` e workflow manual `SIGAPRO Commercial Acceptance QA`. Dez verificações exigem evidência de mesmo SHA, revisão, data e arquivo com hash conferido. O estado inicial é **10/10 pendentes**, não comercialmente homologado. O Quality Gate roda os testes do verificador mas não confunde build verde com prova de pagamento, R2, segurança multi-tenant, leitura de planta ou Dashboards com contas reais. O workflow manual deve falhar enquanto faltarem evidências. Ainda não se alterou GitHub branch protection, logo o check não está tornado obrigatório para merges por configuração.

**Pontos impeditivos de aceite comercial:** (1) OCR raster ainda isolado e sem integração autenticada ao portal, com benchmark técnico em plantas reais; (2) webhook bancário real em sandbox, baixa idempotente e correção dos privilégios excessivos do worker; (3) restauração integral Neon + Cloudflare R2 com tempo medido; (4) inspeção visual autenticada de todos os Dashboards; (5) documento original/PIX testado com prestador habilitado, com consentimento e sem cobranças reais sem autorização. Nenhum desses resultados foi inventado.

**Release:** marcador `[deploy-qa]` cria apenas um Preview QA. Confirmar SHA exato e status `READY` no alias de homologação antes de afirmar que o código está publicado. Nunca main, domínio oficial, banco PROD, credenciais ou API paga.

## Continuidade da revisão de 07/11/2026 — privilégios do worker bancário (somente QA)

- Repositório oficial `roksparta8724/projetosigapro01`, PR **#118 DRAFT**, branch única `fix/qa-triagem-analise-pagamento-20261101`; produção segue fora deste lote.
- O vídeo `20261107-1703-15.5073364.mp4` mostra a conversa anterior de arquitetura/segurança, não uma execução recente do aplicativo. O último release QA previamente conferido estava **READY** no SHA `cf8075831fb50ec92ef5ba8b9607ef52dcdf7aa7`.
- Auditoria SQL **somente de leitura** no Neon QA `br-solitary-sound-b4xlbvs6` confirmou `sigapro_prod_webhook_worker` com `BYPASSRLS`, herança administrativa, leitura de perfis/documentos e escrita financeira direta; **não caracteriza invasão**.
- Proteção reforçada em `server/mp-webhook-worker-privilege.ts`: proíbe também acesso direto a dados/colunas sensíveis, escrita nas tabelas financeiras e herança de roles PostgreSQL de leitura/escrita global. Testes regressivos em `server/mp-webhook-worker-privilege.test.ts`; documentação detalhada em `docs/QA_SEGURANCA_FINANCEIRA_E_RECUPERACAO_20261107.md`.
- A consulta de auditoria foi executada no banco QA com conexão proprietária, provando sintaxe SQL, **não comprovando login do worker restrito**. Tentativa de autenticação como o role retornou ausência de credenciais. Sem alterações em `GRANT`, `REVOKE`, `ALTER ROLE`, segredos, dados ou produção; teste autenticado do worker ainda obrigatório.
- **Próximos gates imutáveis:** CI por HEAD e deploy QA específico; em cópia isolada validar role mínimo, leitura PDF real/OCR com gabarito, sandbox bancário idempotente, reabertura de DAM original, restauração de Neon+R2 e telas autenticadas em duas prefeituras. `docs/QA_COMMERCIAL_ACCEPTANCE.json` continua com dez critérios pendentes; não liberar produção por build ou preview READY.

### Consolidação do lote de segurança bancária — 07/11/2026

- O código corrigido no SHA `38c9bff458fd64bef418f9d9ad4158ae9c5eecbf` recebeu Quality Gate **SUCCESS** (260 arquivos, 1.477 testes), Neon migration validation **SUCCESS**, OCR isolado **SUCCESS**, build, TypeScript e lint aprovados.
- Consulta read-only na Neon `production` `br-summer-surf-b4s88rv5` comprovou que o role de webhook de produção **não** possui BYPASSRLS, herança `neon_superuser`/`pg_read_all_data`/`pg_write_all_data`, acesso direto a perfis/documentos/processos nem escrita financeira direta. **A falha de privilégios foi observada na QA, não na produção.** Nada foi modificado no banco oficial.
- O gate financeiro de código ficou mais rigoroso, mas não há autorização para dizer que webhook real está homologado: conexão própria do worker, evento assinado, RPC, idempotência e homologação de pagamento ainda requerem teste autenticado.
- Os dez critérios de `docs/QA_COMMERCIAL_ACCEPTANCE.json` continuam PENDENTES. OCR real ligado ao portal, planta arquitetônica com gabarito, recuperação integral R2/Neon e dashboards autenticados continuam não homologados.
- Esta é a **única publicação de homologação** deste lote, criada por commit `[deploy-qa]` após o CI do código. Confirmar na Vercel se novo deployment fica READY e se o alias da branch foi atualizado; **não confundir envio do commit com publicação confirmada**. PR #118 DRAFT, sem merge em `main`.

## Lote QA — proteção contra confusão entre parâmetro legal e cota de projeto (07/11/2026)

- Escopo somente QA: PR #118 DRAFT, branch `fix/qa-triagem-analise-pagamento-20261101`; **não publicar em `main`, `sigapromunicipal.com.br` ou Neon production**.
- Falha lógica eliminada: `src/lib/architecturalPdfReadings.ts` antes procurava as palavras de projeto (`proposto`/`projetado`) em **qualquer lugar da citação**. Se o trecho contivesse `recuo frontal mínimo legal: 5 m; recuo frontal proposto: 4 m`, havia risco de usar o primeiro valor exigido pela lei como medida observada. A nova lógica verifica o contexto do primeiro número e rejeita **mínimos/máximos/limites legais**, mesmo ao lado de proposta diferente; preserva as cotas efetivamente projetadas.
- Regressão: `src/test/architecturalPdfLegalLimitVsObserved.test.ts` adiciona exemplos de recuos, TO, permeabilidade e CA, incluindo a distinção entre limite legal e valor projetado; não atribui parecer jurídico automático.
- Commit funcional testado `f4fe5619be4e25e051d4514b59c628b8dd6cbaff`: **Quality Gate SUCCESS, 260 arquivos / 1.480 testes aprovados, Neon migration validation SUCCESS, SIGAPRO OCR isolado QA SUCCESS**, TypeScript, lint e build aprovados.
- Estratégia estruturada de entrega às prefeituras: `docs/PLANO_PILOTO_MUNICIPAL_SIGAPRO_20261107.md`, com referência a OWASP ASVS 5, ANPD, manual Pix do BCB, Vercel, R2 e filas Cloudflare. Documento é plano de aceite, **não comprovação de que integrações externas foram executadas**.
- **Não houve teste autenticado com planta real, fonte legal validada nem webhook de liquidação real nesta intervenção**. O OCR raster continua com pipeline isolado de teste, não integrado ao portal de produção. Dez critérios de aceite comercial permanecem `pending`. Nenhuma nova API paga, infraestrutura, token, permissão de banco ou norma legal foi ativada.
- Esta alteração documental com marcador `[deploy-qa]` gera uma **única versão Preview QA** deste lote; verificar Vercel READY e SHA após publicação. Não fazer merge da PR até evidência funcional integral.

## QA — correção real de recuperação de avatares legados e proteção contra SSRF (07/11/2026)

- **Problema confirmado em logs agregados Vercel de produção (somente leitura):** sete ocorrências no período analisado da recuperação de foto antiga, com `fetch failed` / DNS `ENOTFOUND` para domínio histórico Supabase. Isso não comprova perda de foto nem comprometeu a conta municipal por si só.
- **Raiz do problema na aplicação:** recuperação legada buscava `*.supabase.co` indiscriminadamente, seguia redirecionamentos, não verificava a assinatura do formato de imagem e recebia corpo sem limite efetivo de streaming. A conta de produção permaneceu intacta nesta intervenção.
- **Código corrigido somente em QA:** `server/api/profile-avatar-open.ts` prioriza sempre o R2, inclusive cache de fotos legadas; requisição à fonte antiga só ocorre com `SIGAPRO_LEGACY_AVATAR_SOURCE_ORIGIN` explicitamente configurada com origem HTTPS exata. Por padrão, rede legada DESLIGADA; `redirect:"error"`; validação de magic bytes PNG/JPEG/GIF/WebP/AVIF, `nosniff`; leitura em streaming até 12 MiB, aborto em 12 segundos para **todo o corpo**, resposta segura sem log de URL/provedor; nenhuma exclusão, cópia ou atualização de avatares.
- **Testes de segurança no caminho realmente descoberto pelo Vitest:** `src/test/legacyAvatarSecurityQa.test.ts` (domínio, URL, redirecionamentos, MIME, tamanho, timeout e prioridade R2). Um teste inicial falhou por comparar declaração de função em lugar de sua chamada; a regressão foi corrigida e executada novamente. Não confundir a falha intermediária com a validação final.
- **SHA de código integralmente validado:** `26cce0687e23bb529f3c24ed9804a0fb82c7805a` — `SIGAPRO Quality Gate` SUCCESS, **261 arquivos / 1.484 testes aprovados**, build, TS e lint; `Neon migration validation` SUCCESS; `SIGAPRO OCR isolado - QA` SUCCESS. Detalhes e condicionantes em `docs/QA_AVATAR_LEGADO_SEGURANCA_20261107.md`.
- **Estratégia comercial/técnica:** `docs/PLANO_PILOTO_MUNICIPAL_SIGAPRO_20261107.md`; entregas de IA, bancos, restauração, isolamento entre duas prefeituras e interface autenticada continuam sujeitas aos **10 critérios pendentes** de `docs/QA_COMMERCIAL_ACCEPTANCE.json`. Não declarar implementação universal de bancos, OCR integrado ao portal ou IA jurídica automaticamente homologada.
- **Este commit com `[deploy-qa]` solicita apenas uma publicação Vercel Preview na branch QA**; conferir READY e SHA específico. `PR #118` permanece DRAFT, sem merge na `main`, deploy de produção ou alteração do Neon de produção.

## 07/11/2026 — Reforço documental R2, unificação de legislação e testes backend no CI

**Origem e correção:** `server/api/r2-sign-get.ts` consultava o processo via RLS e RPC, mas não barrava de modo independente a linha de documento invalidado ou com vínculo/chave incompatíveis. Agora exige RLS e RPC **mais** verificações do documento atual (`is_valid`, `invalidated_at`, `version`, `file_path`, `tenant_id`, `municipality_id`, `process_id`). Em acesso a DAM arquivado mantém RPC exclusiva da guia, sem gerar novo pagamento. S3 municipal e R2 SIGAPRO confirmam existência do objeto por `HeadObject` antes de emitir URL assinada, com fechamento de clientes e erros normalizados. Solicitações de assinatura limitadas a 4 KiB; chaves canônicas; links privados até 15 min.

**Causa recorrente tratada:** a rota local de abertura de PDFs de legislação no `vite.config.ts` duplicava o código da Vercel. Agora chama o mesmo `api/legislation-open.ts`, com validação compartilhada de chaves, tentativa dos endpoints R2, existência do PDF e erros sanitizados. Não afirma que o documento jurídico já foi validado ou publicado pela Prefeitura.

**Mudança estrutural no Quality Gate:** `vitest.config.ts` agora inclui testes de `server/` além de `src/`. Os testes bancários e de autorização antes invisíveis entram no CI. Os seis problemas expostos inicialmente pela ampliação foram corrigidos nas fixtures, sem afrouxar o código produtivo. Commit funcional `d158e6324b29f28622a38d920fae1d7040864b5c`: GitHub Quality Gate **SUCCESS com 1.530 testes em 271 arquivos**, TypeScript, lint e build; Neon migration validation **SUCCESS** e OCR isolado QA **SUCCESS**. Relatório técnico: `docs/QA_R2_DOCUMENTOS_E_REGRESSAO_BACKEND_20261107.md`.

**Lançamento:** o commit de documentação identificado com `[deploy-qa]` solicita **somente** um Preview Vercel para a branch `fix/qa-triagem-analise-pagamento-20261101`. Verificar SHA exato e `READY`; sem merge da PR #118, sem alteração em `main`, domínio oficial, Neon PROD ou R2 real. **Os dez critérios de `docs/QA_COMMERCIAL_ACCEPTANCE.json` continuam `pending`** até provas reais: duas prefeituras autenticadas, leitura de planta com gabarito, pagamento bancário sandbox e idempotência, PDF DAM original, recuperação completa Neon+R2 e revisão visual dos quatro painéis. Um CI aprovado não é homologação comercial.

## 07/11/2026 — Login mais rápido, bundle segregado e Quality Gate de performance

- **Causas comprovadas no código:** `src/App.tsx` importava eager 40 páginas e `AcessoPage.tsx` esperava `dataReadyForCurrentUser`, ligado a ~31 leituras operacionais remotas, mesmo após autenticação de senha/perfil.
- **Correção no acesso:** 32 páginas restritas migradas para `React.lazy` com identidade estável; acesso público segue leve. O destino correto é pré-carregado apenas para o papel autenticado, durante validação ao vivo de vínculo ativo (`has_tenant_access`) e módulo contratado (`assert_municipality_entitlement_v1`) pelo Neon. Nenhum plano local ou município de outra conta libera a rota. `PermissionRoute`, `PlanModuleRoute` e autorização do servidor permanecem.
- **Segurança e logout:** retirados e-mail/senha de demonstração hardcoded dos campos de login; logs de depuração removidos; temporizador falso de logout cancelado; limpeza local ocorre no `finally` mesmo com falha na revogação remota. Se algum valor de exemplo antigo foi usado em conta real, a senha precisa ser rotacionada.
- **SQL:** via SELECT de metadados **somente leitura**, o papel `authenticated` foi confirmado com EXECUTE nas RPCs necessárias em QA e PROD. Nenhuma migração, GRANT, REVOKE ou escrita em produção ocorreu.
- **Comparação real de builds GitHub:** SHA anterior `23d47c939ff18a29113a36fd6d68eca1215042b8`, entry `4.596,38 kB raw / 1.250,43 kB gzip`; código otimizado `4fc60bc2022dcf0edaf1ec16c41ea2c649937bdf`, entry `1.804,50 kB raw / 514,90 kB gzip`. **Redução ~58,8%** do JavaScript principal compactado (não confundir com tempo real de login).
- **Teste anti-regressão permanente:** `scripts/qa-login-bundle-budget.mjs` mede o artefato gerado; acima de 750 KiB gzip o CI falha. `scripts/qa-login-bundle-budget.test.mjs` verifica o guardião. `.github/workflows/quality-gate.yml` executa ambas as verificações **após** build. Commit funcional `086e1234a3eae2a8fdcf54b61b3513947680f912`: Quality Gate **SUCCESS**, **272 arquivos / 1.539 testes**, TypeScript, ESLint, build; medidor `SIGAPRO_LOGIN_ENTRY_BUDGET_OK`: entry **502 KiB gzip**, teto **750 KiB**. Neon validation e OCR isolado QA **SUCCESS**.
- **Documentação para auditoria:** `docs/QA_LOGIN_PERFORMANCE_20261107.md`. O tempo P50/P95 real de login e o tempo de hidratação do dashboard **ainda não foram medidos** por conta autenticada. Os 10 itens de `docs/QA_COMMERCIAL_ACCEPTANCE.json` continuam `pending`. Não declarar entrega pronta para prefeituras sem pagamento sandbox, IA real, testes cruzados e restauração Neon/R2.
- **Release:** commit documental de fechamento inclui `[deploy-qa]`, *apenas* Preview Vercel na branch `fix/qa-triagem-analise-pagamento-20261101`. Verificar o SHA específico e `READY` antes de afirmar publicação. Na conta atual Hobby a Vercel já retornou HTTP **402 — api-deployments-free-per-day**; se continuar bloqueado, manter anterior READY e **não** promover a produção nem contratar plano automaticamente.

## 07/11/2026 — Estabilidade operacional, cota Vercel e auditoria financeira P0

**Entregas de código na QA:**

- `vercel.json` desativou apenas o auto-deploy da branch `fix/qa-triagem-analise-pagamento-20261101`, após verificação da documentação oficial Vercel. A `main` continua com deployment automático padrão. Daqui em diante, gerar Preview QA **manualmente por SHA único validado**, evitando mais de 100 tentativas por dia e previews cancelados. O bloqueio HTTP 402 não foi contornado.
- Revalidação operacional: `src/hooks/useLivePlatformRefresh.ts` limita a 10 s qualquer polling global e usa 30 s por padrão, preservando `focus`, `visibilitychange` e `sigapro:data-changed`; nas páginas de processo/análise/financeiro/registro o store completo deixou de ser requisitado a cada 1,8–8 s. Detalhe do processo mantém consulta seletiva de status a cada 8 s, sem refazer o store inteiro. Análise e arquivos usam 30 s e eventos; Financeiro 20 s; pagamento externo 15 s, com refresh ao voltar à aba.
- `src/lib/identityScopedSingleFlight.ts` + `usePlatformData.tsx`: solicitações simultâneas do mesmo usuário+processo usam uma única consulta em andamento; uma resposta remota tardia de conta anterior **não atualiza** estado visual/cache da nova conta. Promessas com erro são descartadas para permitir retry. Regressão automatizada cobre troca de identidade, pedidos simultâneos e recuperação após erro.
- `src/test/operationalRefreshStabilityQa.test.ts`, `src/test/identityScopedSingleFlightQa.test.ts` e testes antigos de fluxo atualizados para exigir **eventos reais e polling moderado**, não leituras de 31 tabelas a cada 1,5–5 s.
- **SHA funcional confirmado com os três checks SUCCESS**: `34bb135f93fd8f63323df852e02adf82f5758de3` — GitHub `SIGAPRO Quality Gate` **276 arquivos, 1.552 testes aprovados**, TS, ESLint, build e orçamento do bundle login (502 KiB gzip < 750 KiB); `Neon migration validation` **SUCCESS**; `SIGAPRO OCR isolado - QA` **SUCCESS**. Código está no GitHub, não automaticamente publicado na Vercel.

**Auditoria de banco — exclusivamente SELECT, sem dados pessoais:**

- QA `process_documents` e `payment_guides` com joins de processo: **zero divergências de município**, **zero documentos/guias órfãos**, **zero documento vigente com invalidação** e **zero protocolos oficiais duplicados** nos critérios consultados.
- Foram encontrados **dois processos antigos já oficializados** com `officialized_by_payment_guide_id IS NULL`. Ambos possuem guia marcada paga. Não concluir que houve ausência de pagamento; sem reconciliação por evidência e sem alteração automática do dado histórico. A rotina atual `officialize_preprotocol_v1` grava referência de guia em novos processos.
- Mercado Pago em QA: duas guias registradas; uma `compensada` com `original_pdf_key`, SHA-256 e identificador do provedor; outra `pendente` sem arquivo original. Metadados não comprovam existência/leitura R2, nem conciliação end-to-end.

**Bloqueio P0 de privilégios financeiros:**

- Em QA e PROD, o papel `authenticated` pode executar duas rotinas `SECURITY DEFINER` de confirmação manual de guias. Os corpos aceitam `prefeitura_admin` para marcar pagamentos; essa permissão contraria a regra **Admin Prefeitura = gestão/consulta sem baixa de processos**.
- Na PROD, `officialize_preprotocol_v1(uuid,uuid)` tem `EXECUTE` concedido a `PUBLIC` e `authenticated`; na QA o `authenticated` já não tem. Isso exige limitar o uso da função interna pela política de menor privilégio. **Não há evidência de exploração e não foi aplicada qualquer alteração.**
- Proposta SQL **somente para revisão**, fora do executor de migração, em `docs/QA_P0_FINANCE_HARDENING_REVIEW.sql`. Relatório de evidências e ordem segura de implantação: `docs/QA_P0_FINANCE_PERMISSION_AUDIT_20261107.md`; teste estático `src/test/financeFunctionPrivilegeReviewQa.test.ts`. A mudança exige aprovação explícita para SQL e smoke em cópia isolada antes de produção.

**Limites e entregabilidade:** a PR #118 segue **DRAFT**, sem merge para a `main`. Nenhum R2/Neon de produção, credencial, guia, privilégio ou dado foi modificado neste lote. Os **10 requisitos de `docs/QA_COMMERCIAL_ACCEPTANCE.json` permanecem `pending`**. Login precisa de medida P50/P95 em navegador, webhooks banco de teste, PDF A4 original, IA em planta real, restauração do Neon+R2 e quatro perfis autenticados em duas prefeituras antes da homologação para uso municipal.

## 07/11/2026 — Autorização aplicada: ensaio P0 financeiro isolado com rollback

**Autorização explícita do responsável:** corrigir e testar as permissões financeiras em cópia isolada do Neon, sem tocar produção. A criação de nova branch falhou por limite de **10 branches (HTTP 422)**; nenhuma branch foi apagada. Foi usada **a branch de ensaio já existente** `br-lucky-credit-b4evfnn0` (`sigapro-release-migration-rehearsal-20261104`), que deriva de backup de produção de 04/11 e tinha as mesmas três definições-alvo que a QA, **não** uma nova cópia da QA do dia 07/11.

**Correção executada de forma atômica somente na branch de ensaio:**
- Backup prévio em `sigapro_qa_p0_20261107.function_backup`, 3 definições, proprietário e ACL originais, MD5 conferidos.
- `REVOKE EXECUTE` na oficialização `officialize_preprotocol_v1` para `authenticated`/`PUBLIC`; chamada legítima pelo trigger de pagamento permaneceu operacional.
- `confirm_preprotocol_payment_v1`: baixa inicial só por Setor de Protocolo autorizado e somente quando a guia não tiver vínculo de banco/provedor.
- `confirm_process_payment_guide`: baixa de guia inicial só Protocolo; demais guias só Financeiro; bloqueio conservador de toda `bank_reference` e provedores não manuais, incluindo `bank_direct`, que antes poderia passar por caminho manual.
- Arquivo-fonte: `docs/QA_P0_FINANCE_HARDENING_REVIEW.sql`, revisado. Mudanças **não** foram adicionadas ao executor de migrações automático.

**Ensaios reais na cópia de ensaio:** papel `authenticated` não chama oficialização direta; Admin Prefeitura negado em pré-protocolo, guia inicial e ISS; Financeiro confirma guia manual sintética e escreve histórico; Protocolo confirma guia manual sintética, oficializa e registra trilha; 5 variantes bancárias bloqueadas em Financeiro e 5 em Protocolo; permissão cruzada Protocolo/Financeiro negada; quatro perfis indevidos negados em pré-protocolo; tentativa repetida de pagamento já confirmado negada; chamada idempotente a pré-protocolo já oficializado não gera número novo. Registros sintéticos operaram dentro de subtransações **intencionalmente revertidas**. Após ensaios, cópia manteve 3 processos/6 guias, quantidades pré-teste. O primeiro fixture sintético não tinha pasta técnica e foi corrigido; o primeiro pré-protocolo sintético passou corretamente a `pendencia_documental` por ausência de anexos.

**Isolamento verificado após a alteração:** produção `br-summer-surf-b4s88rv5` e QA principal `br-solitary-sound-b4xlbvs6` preservaram os hashes SQL anteriores. A **produção ainda tem P0 aberto**, pois `officialize_preprotocol_v1` continua executável diretamente por `authenticated` e `PUBLIC`; na QA principal já estava sem esse grant, mas as duas rotinas manuais ainda têm versão anterior. **Não houve merge, deploy de produção, alteração em bancos ativos ou pagamento real.**

Relatório completo com casos, resultados, limitações e reversão: `docs/QA_P0_FINANCE_REHEARSAL_RESULT_20261107.md`. **A reversão também foi ensaiada com sucesso em subtransação:** três corpos originais e ACL restaurados provisoriamente e conferidos por MD5; a subtransação foi abortada intencionalmente e a correção na branch isolada permaneceu aplicada, sem alterar QA/produção. PR #118 permanece DRAFT. Próximos requisitos: promoção controlada à QA principal com rollback, teste HTTP autenticado, webhook real de sandbox e role dedicado sem BYPASSRLS; depois janela de produção aprovada. Os 10 critérios comerciais continuam `pending`.

**Refinamento P0 posterior ao ensaio inicial:** verificados na QA campos bancários preenchidos mesmo quando outras referências podem estar ausentes: `bank_payment_id`, `bank_status`, `bank_status_detail`, `bank_authenticated_at`, `provider_charge_saved_at`, `ticket_url`, `barcode`, `digitable_line`, `provider_environment`. Os dois procedimentos foram endurecidos **somente na branch de ensaio** para negar baixa manual quando qualquer indício bancário estiver presente, além de `bank_reference` ou `payment_provider`. **Mais 18 testes de banco real em SQL contra registros sintéticos** (9 indícios por 2 rotinas) passaram; os dois caminhos manuais autorizados foram testados novamente; a reversão/restauração por backup foi repetida com sucesso. Estado final ensaio: **3 processos/6 guias**, 3 backups íntegros, `authenticated` e `PUBLIC` sem EXECUTE direto na oficialização. Hashes finais: pré-protocolo `0d3a524026b165add9e6b20c10691725`; guias `1656ac3eed5cf5e44693340515d1b795`. QA principal e produção mantiveram suas definições anteriores. A produção **continua sem essa correção**. Todos os testes foram em SQL, **não houve webhook real, produção ou pagamento bancário**.

## 07/11/2026 — P0 financeiro promovido à QA principal com backup e autorização testada

**Aplicação efetiva no Neon QA principal** `br-solitary-sound-b4xlbvs6`: funções `confirm_preprotocol_payment_v1` e `confirm_process_payment_guide` substituídas transacionalmente pela versão ensaiada no branch isolado, com guarda bancária antes de qualquer opção de oficializar guia já paga. Revogação de EXECUTE público da oficialização mantida. Na mesma transação foram conferidos os hashes pré-existentes, criados e verificados **3 backups SQL/ACL** em `sigapro_qa_p0_main_20261107.function_backup` e verificados os hashes finais: pré-protocolo `feee1bf8a9831dfb45bd37bc6d7a539a`; guia `1656ac3eed5cf5e44693340515d1b795`; oficialização preservada `4aa2c40884c6c7c0ff1e173b4d46e3a5`.

**Smoke com perfis ativos na QA:** `authenticated` não executa oficialização direta; Admin Prefeitura vê processo próprio mas recebe negação nas três formas de baixa; guia pendente existente do Mercado Pago nega baixa manual e guia Mercado Pago já oficializada permanece idempotente; Protocolo e Financeiro conseguem executar seus caminhos manuais legítimos com trilha de auditoria em registros sintéticos **revertidos por subtransação**; baixa cruzada entre setores negada; Admin, Protocolo e Financeiro negados na leitura de processo do outro município e Protocolo/Financeiro também na alteração cruzada. Ensaio de restauração das três definições do backup passou dentro de subtransação deliberadamente revertida. QA pós-teste **8 processos, 11 guias, 10 perfis**, nenhum dado sintético remanescente, 3/3 backups íntegros. Relatório: `docs/QA_P0_FINANCE_MAIN_QA_RESULTS_20261107.md`.

**Produção intacta** `br-summer-surf-b4s88rv5`: hashes originais das funções de pagamento e `officialize_preprotocol_v1` com EXECUTE direto para `PUBLIC`/`authenticated` continuam **pendência P0 produtiva**. Nenhum merge em `main`, deploy oficial, pagamento real ou mudança de credenciais. Os 10 gates comerciais seguem `pending`.

**Worker legado no Neon QA:** `sigapro_prod_webhook_worker` ainda tem `BYPASSRLS` e herda `neon_superuser` nessa branch, enquanto a conta homônima na produção está restrita e a conta dedicada `sigapro_qa_webhook_worker` também está restrita e possui RPC QA específica. Tentativa de reduzir a conta legada foi negada pelo Neon com **SQLSTATE 42501 — faltam CREATEROLE e ADMIN OPTION**; toda a transação foi revertida, sem modificar papel, senha ou grants. **Bloqueio ainda aberto** para administrador autorizado do Neon; não apagar nem resetar credenciais automaticamente. Webhook de sandbox, prova de crédito com provedor, testes de navegador de duas prefeituras, IA com projeto real e recuperação completa R2/Neon continuam pendentes.

## 07/11/2026 — Preview QA READY após liberação temporária, autodeploy novamente bloqueado

**Versão QA publicada na Vercel:** deployment `dpl_6Djads92pnhGwfTX1hMxDGJdWpM9` em estado **READY**, SHA exato `b5cc7d1df2929fd0ae925133267fb7bdebaece82`, alias estável confirmado pela API da Vercel: `https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app/acesso`. O release inclui login dividido em páginas lazy, proteção documental R2, permissões de interface e demais correções da PR #118, além do endurecimento financeiro já **aplicado separadamente no Neon QA principal**. A produção oficial e `main` permanecem sem merge ou deploy.

**Causa real dos primeiros Previews cancelados:** `vercel.json` configurava `git.deploymentEnabled["fix/qa-triagem-analise-pagamento-20261101"]=false`. Uma tentativa Git manual gerou `CANCELED` com motivo Vercel `Ignored Build Step`. A liberação **temporária** desse único flag no commit `b5cc7d1` criou o Preview READY. O flag foi **restaurado para false no commit `aa931869bdb17ccf452e91dde37139b44ce5bb22`**; o alias foi consultado novamente e continuou apontando ao Preview READY `b5cc7d1`. Nenhuma outra branch foi habilitada.

**Política de CI:** o commit excepcional `b5cc7d1` com autodeploy QA habilitado recebeu duas falhas **previstas** em testes que exigem autodeploy desligado (`operationalRefreshStabilityQa.test.ts` e `qaReleaseDeploymentPolicy.test.ts`); não foram falhas de compilação, interface ou pagamentos. A configuração protegida foi restaurada em `aa931...`. O SHA de código `9aa2ac1e8b34a2120f8241bceaaca757ee59e03c` já tinha Quality Gate, Neon migration validation e OCR isolado **SUCCESS**. O CI de `aa931...` deve ser conferido separadamente como estado final de desenvolvimento.

**Limites do aceite:** estado READY e domínio Preview confirmado não substituem sessão autenticada de dois municípios, medição P50/P95 do login, inspeção visual premium, leitura de projetos reais pela IA, webhook bancário real de sandbox, verificação de existência física dos PDFs no R2, restauração integral Neon/R2 e os 10 critérios comerciais ainda `pending`. A conta legada `sigapro_prod_webhook_worker` na QA permanece privilegiada; correção administrativa bloqueada por SQLSTATE `42501`. O banco de produção mantém a ACL financeira antiga; a operação comercial ainda não está liberada.

## 07/11/2026 — Webhook Orders sandbox seguro e aceite comercial sem SHA circular

**Atenção:** este lote está no repositório da branch QA, **não** na produção nem no Preview antigo `b5cc7d1`, até deploy confirmado por SHA. PR #118 permanece DRAFT.

**Segurança da conciliação de testes:** criado `server/mp-qa-webhook.ts` integrado à função serverless existente `api/mercadopago.ts`, com roteamento `/api/mp-qa-webhook` em `vercel.json`. O projeto continua limitado a **12 funções Vercel Hobby** (a 13ª entrada foi removida após falha de teste). A operação só é habilitada em Preview da branch `fix/qa-triagem-analise-pagamento-20261101`, com DB QA `ep-misty-breeze-b4ri8ig0` e usuário **`sigapro_qa_webhook_worker`**, nunca `neondb_owner` ou o role legado copiado de produção. Antes de ler segredos municipais, executa a auditoria real de privilégios na própria conexão, exigindo ausência de `BYPASSRLS`, superuser, herança elevada e gravação direta de tabelas. Somente notificações Orders `live_mode=false` com HMAC validado, identidade municipal e GET de Orders na API do Mercado Pago podem gerar recibo; a baixa depende exclusivamente de `mp_qa_webhook_settle_v1`, que verifica guia, centavos, prova de evento, PDF original e idempotência. Sem dados/documentos adequados, **falha fechada**.

**Configuração QA verificada na Vercel sem expor valores:** criada variável sensível `SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL` exclusivamente no Preview da branch atual, usando URL retornada pelo Neon para o worker restrito. Os escopos das variáveis protegidas `MUNICIPAL_PAYMENT_MASTER_KEY` e `SIGAPRO_BANK_CHARGE_SIGNING_SECRET` foram **movidos da branch QA antiga** `qa/sigapro-ia-logo-integrado-20261023` para a branch QA ativa, preservando seus valores/criptografia; as configurações de production não foram tocadas. Novos builds da branch antiga não terão essas duas variáveis, devendo usar a branch ativa para o ensaio financeiro. **A disponibilidade das variáveis não equivale a credencial de provedor validada no Preview novo.**

**Prova real da conta bancária QA:** conectado ao Neon com `role_name=sigapro_qa_webhook_worker`, retornou usuário correto, `BYPASSRLS=false`, `INHERIT=false`, não administrador, sem escrita direta de guias e com EXECUTE das RPCs apropriadas. A query **exata** do gate `MP_WORKER_PRIVILEGE_AUDIT_SQL` passou com oito indicadores de risco negativos. Em QA há **uma conexão Mercado Pago de teste ativa com token e segredo HMAC cifrados**, sem leitura de seus conteúdos. A conta LEGADA `sigapro_prod_webhook_worker` nessa QA continua sobreprivilegiada e não é aceita pelo novo handler; correção administrativa ainda pendente.

**Aceite comercial sem ciclo Git:** `scripts/qa-commercial-acceptance.mjs` deixa de considerar o checklist versionado como prova `--enforce`. O aceite agora exige manifesto e dez artefatos privados, sanitizados, com hash SHA-256 e SHA imutável do Preview; o workflow manual exige SHA explícito, identificador de artifact/revisão e branch QA. Isso elimina a dependência circular de atualizar um arquivo versionado depois de fixar o SHA a testar. Os dez itens permanecem `pending`, e a proteção do branch `main` como status requerido ainda depende de configuração administrativa GitHub.

**Documentação canônica:** `docs/QA_WEBHOOK_SANDBOX_SEGURO_20261107.md`, `docs/QA_COMMERCIAL_ACCEPTANCE.md` e este status. **Ainda não homologados:** callback real assinado de sandbox, entrada/baixa com dinheiro de teste atestada pelo provedor, PDF físico no R2, recuperação integral Neon+R2, gabarito IA de projeto real e dashboards autenticados em duas Prefeituras. Produção mantém P0 de EXECUTE direto de oficialização, não alterar sem janela e aceite.

## 07/11/2026 — Retomada: auditoria QA e limite de leitura de avatares R2

**Escopo:** inspeção e correções na branch única de QA; sem merge da PR #118
(DRAFT), sem migração ou alteração de produção, sem deploy Vercel novo.

**Banco Neon QA principal — SELECT read-only:** `br-solitary-sound-b4xlbvs6`,
database `sigapro_migration_stage_20260923`: 8 processos, 11 guias,
10 perfis e 2 municípios. `officialize_preprotocol_v1(uuid,uuid)`
não concede EXECUTE a `authenticated` nem a `PUBLIC` nessa branch.
`sigapro_qa_webhook_worker`: `rolbypassrls=false`;
`sigapro_prod_webhook_worker` legado: `rolbypassrls=true`
(**pendência operacional**, não corrigir automaticamente).
Há 2 versões urbanísticas ativas com zona `QA-URBAN-E2E-20261024` e
uso `QA_RES`: **somente regras fictícias de ensaio**, não aprovação legal.

**Observabilidade Vercel:** relatório agregado de erros de 24 h contém
sete falhas históricas de recuperação de avatar legado Supabase em função
do domínio antigo indisponível por DNS; associadas a deployment da main,
não ao Preview QA recente. O código QA já restringia o fetch legado à
origem HTTPS explicitamente autorizada e evitava redirecionamentos.
Não afirmar que a correção está na produção.

**Correção de defesa em profundidade aplicada à QA:** o cache de foto
R2 carregava `transformToByteArray()` antes de conferir limite de 12 MiB.
`server/api/profile-avatar-open.ts` agora usa leitura em streaming
com rejeição antecipada por `ContentLength` e verificação incremental
mesmo sem metadados. `src/test/legacyAvatarSecurityQa.test.ts` cobre
tamanho, interrupção e imagem válida. Commits de implementação/teste:
`817e6deb` e `f71a203a`. Evidência:
`docs/QA_AVATAR_LEGADO_SEGURANCA_20261107.md`.
Confirmar Quality Gate, migration validation e OCR isolado no HEAD final
antes de considerar o código validado.

**Publicação:** o alias estável da QA continuava apontando ao Preview
READY `bd423ecb8a18b226b474d6c964245f4c56628017`, anterior a este
ajuste. Autodeploy da branch QA permanece desligado em `vercel.json`;
não presumir que o código recém-commitado esteja no site. Nenhum arquivo
ou dado pessoal é incluído neste relatório.

**Gates restantes:** sessão real de login com medição P50/P95, 4 painéis
autenticados e 2 Prefeituras, webhook Orders do Mercado Pago sandbox
assinado com comprovante e baixa, PDF original no R2 e recuperação,
IA em planta real e matriz jurídica com evidências, restauração Neon+R2,
correção P0 financeira de produção sob janela autorizada. Os dez critérios
de aceite comercial continuam pendentes; não liberar produção.

## 07/11/2026 — QA: correção estrutural de upload R2 e proteção de identidade

**Ciclo de continuidade na mesma branch QA**, PR #118 DRAFT. Sem merge em
`main`, sem alteração de dados ou roles Neon, sem pagamento e sem novo
deployment Vercel. Todos os patches abaixo são apenas de código QA até a
publicação explícita de um Preview no SHA exato.

**Vulnerabilidade corrigida no código de escrita:** o endpoint de upload de
avatares exigia associação municipal mas não comparava o identificador da
pasta de foto com `current_profile_id` da sessão autenticada. Agora toda
requisição com bucket `profile-assets` ou chave `/profiles/avatars/` exige
perfil realmente autenticado, independentemente do legado `R2_REQUIRE_AUTH`,
e valida a correspondência exata entre pasta e perfil do usuário, inclusive
Master. Nomes de bucket físicos e aliases não permitem contornar a política.
Arquivos SVG, MIME discordante, chave sem extensão raster válida e imagem
maior que 12 MiB são rejeitados. Nenhuma foto foi sobrescrita.

**Prevenção de vazamento:** `buildPublicUrl` retorna string vazia para
avatares, mesmo quando `R2_PUBLIC_BASE_URL` existe. O upload serverless
passou a limitar corpo JSON a 6 MiB e devolve HTTP 400/413 controlados em
payload inválido ou grande, sem stack, segredo, URL assinada, nome de arquivo,
objeto ou mensagem bruta de S3 nas respostas. Logs operacionais do navegador
deixaram de imprimir nomes, caminhos e payloads inteiros de uploads.
Arquivos alterados:
`server/api/r2-upload.ts`, `src/integrations/r2/client.ts`;
regressão `src/test/r2AvatarUploadOwnershipQa.test.ts`.
Commits deste lote: `8cda7771`, `5087d1f1`, `496377c1`,
`21c2cadf`, `848f3030`, `9d801b50`.

**Compatibilidade:** `useAppBootstrap` define o ID de perfil a partir do
`profile_id` canônico e `usePlatformSession` o prefere ao auth user ID.
Auditoria agregada Neon QA encontrou 10 perfis, sendo 4 com
`profiles.id != profiles.user_id`. Por isso **não** autorizar uploads
comparando cegamente `user_id` legado com o ID do perfil. Exigir prova
autenticada por perfil também na confirmação operacional do Preview.

**Limitação de privacidade ainda aberta:** o endpoint antigo
`GET /api/profile-avatar-open?objectKey=...` não exige token HTTP de leitura;
não declarar as fotos totalmente privadas. Substituir o carregamento direto
por fluxo de assinatura curta com autorização da sessão e só então fechar o
endpoint direto, após teste do `UserAvatar` nas telas Master, Prefeitura,
Analista e Profissional e revisão de política de acesso ao bucket R2/CDN.
Não bloquear esse GET isoladamente antes de migrar os componentes visuais:
isso esconderia as fotos. O novo bloqueio de URL pública em uploads não
equivale a tornar inacessíveis objetos já publicados pelo próprio bucket.

**Auditoria financeira só de leitura no Neon QA:** 11 guias totais;
2 ligadas a Mercado Pago no ambiente `test`: 1 compensada com
metadados de PDF original e 1 pendente sem metadados de PDF original.
Outras guias são registros manuais/QA. Metadado não comprova bytes físicos
em R2, crédito real de provedor ou callback assinado. Não oficializar guias
por inferência, não copiar dados QA para produção.

**Verificação exigida:** só considerar esse lote aprovado no código quando
Quality Gate, validação de migrações e OCR isolado estiverem `success`
no SHA final. Na operação, ainda são exigidos testes autenticados de upload
próprio/caminho de outro perfil, abertura de avatar, login P50/P95, PDF R2,
webhook de sandbox, IA em planta real e restauro. Os dez gates comerciais
seguem pendentes. Nenhum destes dados exige divulgação de documentos
pessoais ou segredos.

## 07/11/2026 — QA: fotos pessoais sem exigência do módulo Configurações; upload local otimizado

**Continuidade técnica após HEAD `1a791ae7`:** as três verificações automáticas
desse commit foram **SUCCESS** (Quality Gate, Neon migration validation, OCR
isolado). A branch QA continua única e a PR #118 continua DRAFT. Nenhum
deploy, alteração de banco ou merge de produção foi realizado.

**Falha funcional descoberta na revisão do servidor:** `r2-upload` verificava
`assert_municipality_entitlement_v1('module:Configurações')` para qualquer
arquivo do bucket compartilhado de logos, inclusive foto pessoal. Uma conta
sem o módulo administrativo da Prefeitura podia, portanto, ser impedida de
atualizar sua própria imagem mesmo com vínculo e identificação válidos.

**Correção aplicada apenas ao código QA:**
- `getR2UploadEntitlement`: fotos pessoais vinculadas ao perfil autenticado
  exigem plano ativo e passam pelo limite contratual de `storage_bytes`,
  com `_increment=buffer.byteLength`. A checagem do proprietário e da
  prefeitura permanece no servidor; o usuário não ganha permissão para
  identidade institucional.
- Brasões, logos e demais arquivos de branding permanecem sujeitos ao
  módulo `Configurações`; documentos e PDFs continuam classificados em
  `storage_bytes`.
- Confirmação read-only da função SQL do Neon QA: a capacidade
  `storage_bytes` verifica `contractActive` e
  `usage.storageBytes + _increment` versus `limits.storageGb`.
  Não houve execução do procedimento para gravar dados nem troca de plano.

**Tratamento automático de fotos grandes:** o arquivo com até 2.500.000 bytes
é mantido íntegro. Imagens estáticas entre esse valor e 12 MiB são
dimensionadas proporcionalmente no navegador e codificadas WebP em tentativas
progressivas de 1800/1450/1100/900 px, com qualidade 0,90/0,84/0,76/0,70;
se o browser não oferecer decodificação/canvas compatíveis, o usuário recebe
erro específico, sem enviar bytes inválidos. O upload base64 foi limitado a
4 MiB de corpo HTTP para permanecer abaixo do teto de ~4,5 MB da Vercel.
Documentos, guias, assinaturas e PDFs NÃO são redimensionados.
Código: `src/lib/profileAvatarUpload.ts`,
`src/integrations/r2/storage.ts`, `server/api/r2-upload.ts`.
Regressões: `src/test/profileAvatarUploadQa.test.ts`,
`src/test/r2AvatarUploadOwnershipQa.test.ts`.
Commits: `d1e425ba`, `ddbb0814`, `6898ff96`,
`ed9a7281`, `15d5f4a4`, `4eedcbf5`, `2c0d1121`.

**Limitações que NÃO podem ser marcadas como homologadas:**
- Necessária prova com login real de Master, profissional, analista e
  funcionário da Prefeitura, incluindo recarga de avatar e consistência
  visual após navegar; testes de Node/Vitest não representam sessão
  autenticada nem upload físico de R2.
- O GET público legado do avatar R2 permanece sem autenticação; foto não
  está provada privada só com a proteção de upload e ausência de CDN na
  resposta. Migrar primeiro o leitor para URL assinada e testar em QA antes
  de bloquear GET, evitando fotos invisíveis.
- O fluxo de PDF técnico maior que o limite inline precisa de via própria de
  upload em partes e prova real; não submeter PDFs via otimizador de avatar.
- Reavaliar cota contratual e contabilização física de avatars do bucket
  logos na prova operacional.
- Os dez gates de aceite comercial continuam `pending` até evidências
  reais, isoladas e autenticadas; não publicar produção.

**Critério de validação de código deste lote:** novo HEAD precisa dos três
workflows bem-sucedidos, incluindo testes Vitest, TypeScript, lint e build.

## 07/11/2026 — QA: causa raiz de avatar que some após salvar no Perfil

**Causa comprovada no código:** `src/pages/saas/PerfilPage.tsx` recebia o
upload do R2 com `persistentRef=r2:...`, mas fazia
`avatarUrl = uploaded.publicUrl || effectiveAvatarFiles[0]?.previewUrl || form.avatarUrl`.
Como foto privada não deve gerar CDN público, `uploaded.publicUrl` vem
vazio e o campo `avatarUrl` passava a conter a prévia local `blob:`.
Uma URL `blob:` não é persistente entre F5/sessões e não prova que o
arquivo está legível no R2. Isso explica um mecanismo real de foto que
parece salva e desaparece depois, sem precisar supor erro no Neon.

**Correção QA:** depois do upload, a página constrói `avatarUrl` a partir
da `persistentRef` do R2 usando
`resolveProfileAvatarDisplayUrl({ avatarStorageRef })` e rejeita chave
inválida em vez de persistir a prévia. Também trata registros antigos com
`avatarStorageRef` e `avatarUrl` vazio/temporário ao montar a imagem,
e reconstrói o endereço de leitura de `savedProfile` priorizando a chave
R2. Quando o avatar for salvo, `confirmSavedAvatarReadable` testa a
URL estável real; uma foto escolhida e exibida apenas via `blob:` deixa
de ser apresentada como prova de gravação. Fotos removidas permanecem
removidas, e outros dados do perfil não são zerados.

**Regressão:** `src/test/profileAvatarPersistenceQa.test.ts` cobre
preferência de R2 ante `blob:`/URL assinada expirada, perfil com somente
`avatarStorageRef` e integração estática da página com a confirmação
real de leitura. Commits: `d423a07c` e `e478916e`.

**Validações e limites:** o código de fotos e permissões do lote anterior
passou Quality Gate em `2c0d1121`: 281 arquivos / 1.585 testes,
TypeScript, lint e build aprovados; os três workflows da documentação
`beb0c0ca` também passaram. Os workflows do novo HEAD ainda precisam
concluir antes de declarar este último ajuste aprovado. Nenhuma sessão
real, upload físico, R2 HEAD ou validação visual Master/Prefeitura foi
executada neste lote; Preview permanece em commit mais antigo. A rota
GET de avatar sem autenticação permanece uma pendência de privacidade
separada, a resolver em migração coordenada de leitor e backend.

## 07/11/2026 — QA: autorização de LEITURA de avatares, não só gravação

**Estado e limites:** Alterações exclusivamente em
`fix/qa-triagem-analise-pagamento-20261101` (PR #118 DRAFT).
Nenhum merge em `main`, implantação em produção ou mutação das bases
Neon foi autorizado neste lote. Preview existente utiliza SHA anterior;
código QA requer publicação controlada no SHA final antes do aceite
operacional. Não chamar essas verificações de teste real no navegador.

**Risco identificado:** A rota antiga
`GET /api/profile-avatar-open?objectKey=...` entregava avatares R2
sem Bearer, embora os uploads já verificassem o proprietário. Também a
assinatura `r2-sign-get` aceitava acesso municipal amplo a qualquer
avatar no bucket compartilhado. Não bastava esconder o link público:
era necessário conferir a sessão antes de ler ou assinar o objeto.

**Proteções implementadas em código:**
- `server/avatar-access.ts`: parser de chaves estritas
  `platform/profiles/avatars/{perfil}/{arquivo}` ou
  `municipalities/{prefeitura}/profiles/avatars/{perfil}/{arquivo}`,
  sem traversal. `authorizePrivateAvatarRead` exige token Bearer e
  `current_profile_id` canônico; autoriza o dono, Master, ou admin
  municipal **com vínculo ativo na prefeitura alvo**. Qualquer falha de
  autenticação/RPC é negada, sem escalar permissões.
- `server/api/r2-sign-get.ts`: assinaturas de fotos privadas usam
  obrigatoriamente esse guard; identidade visual pública e PDF de
  processo conservam verificações próprias. Nenhum outro documento
  torna-se automaticamente visível.
- `server/api/profile-avatar-open.ts`: **em Preview da branch QA exata**,
  GET de objeto R2 exige a política acima antes de abrir o R2. Respostas
  autenticadas não podem ter `Access-Control-Allow-Origin: *`, carregam
  `Cross-Origin-Resource-Policy: same-origin`,
  `Referrer-Policy: no-referrer` e `Cache-Control: private, no-store`.
  Todos os clientes S3 usados na tentativa são destruídos no `finally`,
  evitando acumular sockets por foto. A recuperação pública legada de
  fontes Supabase continua somente com whitelist e não foi reclassificada
  como privacidade de conteúdo que já era público.
- `src/lib/privateAvatarRead.ts` e
  `src/hooks/useAuthorizedAvatarUrl.ts`: busca da imagem usando
  `Authorization: Bearer` **apenas no endpoint relativo same-origin**.
  Não coloca JWT na URL nem guarda o blob no Neon. Valida MIME/tamanho;
  oferece object URL temporária, same-origin (compatível com canvas),
  revogada ao trocar de perfil, sair da tela ou cancelar a leitura.
  O backend de autenticação é importado somente se uma imagem R2 privada
  realmente precisar ser aberta.
- `src/components/platform/UserAvatar.tsx`: não apresenta o avatar de
  outra conta durante a troca de perfil.
  `src/pages/saas/PerfilPage.tsx`: editor e confirmação pós-salvamento
  usam carregamento autorizado e revogam o blob depois da conferência.
  `src/pages/saas/MasterAdminPage.tsx`: lista de funcionários recupera
  a referência permanente R2 mesmo quando o `avatar_url` legado estava
  vazio/expirado; preserva corte e proporções.
- Logs do cache legado deixam de imprimir erros brutos do provedor e chave
  de armazenamento no mesmo evento.

**Testes adicionais:** `src/test/qaAvatarReadAuthorization.test.ts`
(perfil proprietário, Master, admin municipal, vínculo incorreto,
anônimo, serviço indisponível, chaves malformadas e proteção do signer);
`src/test/qaAuthenticatedAvatarBrowser.test.ts` (Bearer apenas no
same-origin, MIME, token fora da URL, revogação, integração de editor e
componentes). A suíte anterior de segurança de avatar permanece ativa.
Os novos testes e os três workflows devem estar concluídos com
`success` no SHA final, sem pular falhas.

**Ativação progressiva deliberada:** a exigência do Bearer no GET
de avatar é automática **somente** quando
`VERCEL_ENV=preview` e
`VERCEL_GIT_COMMIT_REF=fix/qa-triagem-analise-pagamento-20261101`.
Este controle evita quebrar a produção antiga antes de testar o novo
leitor nos perfis Master, Admin prefeitura, Analista e Profissional.
Ao liberar produção posteriormente, a política deve ser ativada nela
depois de comprovar todos os pontos de uso de fotos. Até então a
vulnerabilidade de leitura da versão já publicada não pode ser dada
como resolvida. Igualmente, só o provedor Cloudflare pode comprovar
que bucket/CDN não fornecem acesso público independente da API.

**Aceite operacional que ainda falta:** publicar o Preview do SHA exato;
testar F5 da foto já salva e troca de conta, manutenção do crop, recusa
401/403 a outro usuário, abrir imagem no Master e no Admin da própria
prefeitura, acesso permitido pelo titular, recusa em outro município,
verificar HAR sem JWT em URL e zero cache HTTP para foto protegida,
medir P50/P95 de login e tráfego de avatares. Registro de testes
automatizados não substitui esses ensaios. Os dez gates comerciais
continuam pendentes.

## 07/11/2026 — revisão premium estrutural das visões gerais (QA, sem deploy)

**Origem do pedido:** vídeo da Administração da Prefeitura demonstrando
`/prefeitura?secao=usuarios` com cards grandes por cadastro, coluna lateral
de criação de servidores aberta em tempo integral, indicadores replicados
entre abas e pouco espaço para consultar a listagem. O desenho inicial não
escalaria com 3.000 servidores nem com milhares de processos.

**Arquitetura visual implementada na branch única de QA:**

1. `src/components/platform/CompactUserRegistry.tsx`: tabela de usuários
   com nome/e-mail, perfil/nível, lotação, situação, acesso e botão acessível
   de detalhes; quebra de texto por truncamento com `title`; rolagem
   horizontal em larguras pequenas; paginação em memória de **20 registros**
   por página, limitando o DOM; só instancia a ficha pesada do cadastro
   escolhido. Filtros existentes permanecem funcionando. Teste com 3.000
   usuários, incluindo troca de página, lista vazia e abertura seletiva.
2. `src/pages/saas/TenantAdminPage.tsx`: pasta Usuários ocupa a largura
   principal, sem painel lateral persistente. Criação de servidor acessível
   por botão `Criar servidor`, formulário fechado por padrão. Quadro
   executivo e consumo do plano deixam de se repetir em todas as abas e
   aparecem na `Visão geral`. Nesta, remova repetição visual de contadores
   no cabeçalho, transforme os três indicadores internos em faixa compacta,
   liste apenas três prioridades em linhas acionáveis, mantenha resumo de
   fluxo por linha e troque o grande card de brasão por link direto para
   `/configuracoes?secao=branding`, exibindo o sinal `brasão salvo`.
3. `src/pages/saas/MasterAdminPage.tsx`: aba Usuários usa o mesmo
   `CompactUserRegistry`; carteira de prefeituras usa tabela paginada
   (`CompactPortfolioRegistry`, **12 linhas**), cada ficha expandida só
   quando solicitada. A `Visão geral` Master não coloca três fichas
   institucionais inteiras uma embaixo da outra, mas linhas curtas que levam
   à `Carteira`. Contratos de capacidade: apenas dois cards por página
   com próximo/anterior na Carteira e duas amostras no resumo executivo.
   Seletor de usuário para lotação inclui busca por nome/e-mail, no máximo
   50 sugestões iniciais e preserva o selecionado; datalist de e-mails de
   administradores limita as sugestões a 25 para cada campo, permitindo
   pesquisar todos os registros ao digitar.
4. `src/pages/saas/DashboardHomePage.tsx`: panorama executivo virou
   faixa responsiva de informações resumidas, sem card aninhado por métrica.
   Contratos Master exibem no máximo duas prefeituras em destaque e link
   para `/master?secao=carteira`. Capacidade do plano municipal aparece
   exclusivamente na Visão Geral, não sobre todas as páginas de processo,
   financeiro e usuários.
5. `src/components/platform/CompactProcessRegistry.tsx`: paginação
   em memória de **25 processos** por tela, preservando links ao processo,
   histórico, despacho, marcadores e arquivos. Fila municipal anterior
   permanece paginada em lotes de 20 onde já tinha paginação própria.
   Cenário de regressão com 2.000 processos verifica contagem de linhas.
6. `src/components/platform/CompactPortfolioRegistry.tsx` diferencia
   corretamente `ativo`, `implantacao` e `suspenso`; teste com 240
   municípios verifica 12 por página, uma ficha aberta e paginação.

**Qualidade, limites e riscos:**
- As mudanças são **código de QA em PR #118 DRAFT**, sem merge em main,
  alteração de produção, pagamentos, guias ou banco. O Preview implantado
  ainda pode estar no commit anterior; não confundir CI com aceite visual.
- A paginação de usuários/processos/municipalidades é apenas de **exibição
  de dados já carregados em memória**. Ela evita milhares de elementos
  no DOM, mas **não substitui paginação no servidor** nem testes reais
  de tempo de resposta, índices ou carga no Neon quando as prefeituras
  acumularem milhares de cadastros.
- Acessibilidade e layout móvel devem ser conferidos em navegador real,
  inclusive largura 1280, 1440, tablets e mobile, zoom 125% e 150%,
  textos longos, tema escuro, filtros, troca de aba, edição, bloqueios,
  criação, registros com datas inválidas e contas de outras prefeituras.
- Novos testes Vitest: `CompactUserRegistry.test.tsx` (3 mil usuários),
  `CompactPortfolioRegistry.test.tsx` (240 prefeituras) e
  `CompactProcessRegistry.test.tsx` (2 mil processos). Atualizadas
  regressões de overview e de gerenciamento do brasão. Exigir todos os
  três workflows verdes no SHA final antes de aceite técnico.
- **Não declarar homologação comercial integral**: ainda faltam prova
  de autenticação, pagamento sandbox assinado, PDF original arquivado e
  reaberto no R2, leitura de planta real e zoneamento oficial, testes
  multi-tenant em sessão e recuperação de banco/storage.

## 07/11/2026 — inspeção de captura de tela e causa do cabeçalho duplicado

O usuário enviou captura do Preview de homologação
`projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app/prefeitura`.
Ela mostra dois painéis institucionais consecutivos, o mesmo nome da Prefeitura
repetido, três cards de secretaria/SLA/fluxo e quatro indicadores executivos
antes do conteúdo útil. **A captura refere-se ao Preview implantado no commit
`bd423ecb8a18b226b474d6c964245f4c56628017`**, não ao código recente
da PR #118. Não afirmar visualização atualizada no endereço antigo.

**Correção da raiz na QA:** `PortalFrame.tsx` já fornece o cabeçalho
institucional com brasão, identificação municipal e secretaria. Em
`TenantAdminPage.tsx`, retirar o segundo `section.sig-dark-panel` que
repetia o mesmo título, subtítulo e avatar da sessão. Preservar
`PortalFrame`, identificação oficial, acesso ao perfil pelo topbar, quatro
indicadores de operação e card de capacidade do plano. Teste de regressão
`src/test/municipalOverviewSingleHeader.test.ts` protege a remoção dessa
duplicidade e manutenção de usuários/identidade visual.

**Pendência de conferência visual:** executar deploy controlado de Preview
apenas após CI verde e disponibilidade de quota de Vercel; verificar
a nova URL/SHA, capturar o layout em desktop (1280/1440/1920), tablet,
mobile e zoom 125/150%, e comprovar que o cabeçalho aparece uma única
vez. **Não houve deploy nem alteração da produção nesta etapa.**

## 08/11/2026 — Visão Geral da Prefeitura com subpáginas reais, sem crescimento de cards

**Solicitação:** a visão geral da Prefeitura deve continuar legível mesmo com
milhares de processos, preservando o visual premium e os fluxos municipais
existentes. Não publicar em produção nem alterar dados reais.

**Implementação na PR #118 DRAFT, branch de QA única:**

- `/prefeitura` permanece o **Resumo**, sem quebrar URLs ou permissões
  antigas. Novo `MunicipalOverviewSubnav` apresenta links diretos:
  `/prefeitura/visao-geral/processos`,
  `/prefeitura/visao-geral/pendencias`,
  `/prefeitura/visao-geral/atividades`.
  As três rotas usam o MESMO controle de acesso de `/prefeitura`
  (`manage_tenant_users` e módulo `Configurações`).
  `InternalTabs` permanece para Fila operacional, Usuários, Organograma
  e Histórico; clicar em outra aba desde uma subpágina retorna à rota
  municipal correspondente, e links diretos/voltar/avançar sincronizam
  a subpágina atual. Rota de subpágina desconhecida retorna ao Resumo.
- **Processos:** pesquisa por protocolo, assunto, interessado e responsável;
  filtros Todos, Em andamento, Com pendências e Concluídos.
  `CompactProcessRegistry` monta somente **25 linhas por página**
  com acesso ao processo/histórico; ações de despacho e arquivamento
  da lista estão desligadas na visão da administração. Inclui TODOS os
  processos visíveis no município e permite buscar concluídos;
  estes deixam de contar como fila operacional ativa.
- **Pendências:** processos ativos com prazo urgente/vencido,
  exigências/documentação ou guia não compensada, com busca específica,
  contadores curtos e **25 linhas por página**. Não inclui processos
  concluídos indevidamente nas urgências.
- **Atividades:** últimos movimentos ordenados por data efetiva, com
  **15 linhas por página**, detalhe expandido apenas sob demanda,
  data inválida tratada como "Data não informada" e botão para
  consultar o processo de origem. Não é uma lista infinita de cards.
- **Resumo:** contém apenas os quatro indicadores superiores,
  três prioridades resumidas e três movimentações recentes, com
  atalhos "Ver processos", "Ver todas" e "Todas as atividades".
  O consumo do plano é uma **faixa compacta** com nome do plano,
  limite/consumo de cadastros e percentual disponível; o
  `PlanCapacityCard` completo só aparece quando expandido.
  Indicador de atenção substitui contador duplicado da fila.
- **Desempenho:** removida computação não utilizada `productivity`
  que efetuava duas buscas sobre todos os processos para cada
  servidor (complexidade O(usuários × processos)) em todas as
  visitas da Prefeitura. Para listas exibidas, permanece filtragem
  de dados já carregados em memória e paginação local; **não é
  paginação no servidor** e não comprova capacidade do Neon com
  milhares de processos reais.
- **Código e testes:** `src/lib/municipalOverviewSubpages.ts`,
  `src/components/platform/MunicipalOverviewSubnav.tsx`,
  `src/pages/saas/TenantAdminPage.tsx`,
  `src/App.tsx` e regressões
  `src/test/municipalOverviewSubpagesQa.test.tsx`.
  Testes anteriores de 2.000 processos, 3.000 usuários e
  240 municípios continuam na suíte.
- **Limites:** a versão pública no Preview permanece em commit
  antigo até deploy controlado. Homologação operacional exige
  navegar com conta de prefeitura, voltar/avançar, busca, links,
  visibilidade em 1280/1440/1920, tablets e mobile, tema escuro,
  isolamento entre duas prefeituras, teste de volume real e
  plano/cota atualizados. Nada deve ser descrito como liberado
  para produção só porque passou Vitest/TypeScript/build.

**Ponto de continuidade:** conferir que os três workflows do SHA
final desta alteração (`Quality Gate`, `Neon migration validation`,
`OCR isolado`) estejam `success`; corrigir qualquer falha
antes de deploy ou merge. PR #118 continua rascunho.

## 08/11/2026 — autorização explícita para publicar Preview atualizado

O responsável pelo SIGAPRO solicitou a publicação de **todas as melhorias
consolidadas da QA na prévia**, para avaliação visual e operacional. A
PR #118 deve continuar em rascunho, sem merge em `main`, sem deploy de
produção e sem modificar bancos ou variáveis de ambiente.

**Versão-base aprovada:** `9b3b5445199f5522271c9c3e171de3157483a3d1`,
com os três workflows em `success`. A primeira tentativa de deploy manual
da mesma versão foi cancelada por regra de `Ignored Build Step`: o
projeto Vercel exige a marca `[deploy-qa]` na mensagem do último commit
em conjunto com `VERCEL_ENV=preview` e o nome exato da branch. O
cancelamento foi intencional e protegeu a branch, não indicou falha
de build.

**Procedimento autorizado:** criar este commit documental de autorização
com a marca `[deploy-qa]`, aguardar CI verde para o SHA definitivo,
criar um **Preview** da mesma branch por Git Source, confirmar
`readyState=READY` e `meta.githubCommitSha`, e verificar o alias
de homologação antes de divulgar o link. Não alterar a regra de ignorar
build, não forçar deployment para produção e não afirmar validação
de interfaces autenticadas sem teste no navegador.

## 08/11/2026 — revisão de lançamento QA e envio de anexos grandes

**Auditoria de homologação somente de leitura (Neon QA `br-solitary-sound-b4xlbvs6`):**
2 municípios, 10 perfis, 8 processos distribuídos pelos dois municípios,
28 documentos vinculados a processos e 11 guias de recolhimento.
Somente uma dessas onze guias possui a chave `original_pdf_key` e o hash
`original_pdf_sha256` preenchidos simultaneamente; isso **não prova que o
PDF físico existe ou reabre no R2**. Existem duas pré-análises
urbanísticas e zero registros em `process_analysis_sheets` nesta cópia.
Não houve INSERT, UPDATE, DELETE, migração ou mutação dos dados.

**Bloqueio funcional identificado:** o upload comum de PDF técnico
usava JSON/base64 pela função `/api/r2-upload` com teto de 4 MiB
de corpo HTTP. Plantas e anexos reais de tamanho maior falhavam
antes da gravação. O sistema jurídico já tinha mecanismo de
multipart para legislações oficiais, mas não para processos.

**Solução implementada para documentos de processos:**
- Novo `server/api/r2-process-proxy-upload.ts` e rota central
  `api/r2.ts?action=process-proxy-upload`, com rewrite
  explícito `/api/r2-process-proxy-upload` no `vercel.json`.
  Apenas uploads `process-documents`, de **mais de 2 MiB até 40 MiB**,
  em pastas de processo permitidas e extensões PDF/PNG/JPEG/WebP.
  Não permite subir guia DAM original, avatar, legislação ou branding
  por esse endpoint.
- Cada requisição usa bloco de **2 MiB**, base64 abaixo do limite
  da Vercel; exige Bearer, perfil canônico idêntico ao dono da
  chave, vínculo com o município e franquia contratual de
  `storage_bytes`. Chunks temporários são privados, individualmente
  comparados pelo SHA-256 e protegidos contra sobrescrita.
  O servidor monta multipart em R2 com `IfNoneMatch: "*"`,
  confere hash do arquivo inteiro, MIME, tamanho, assinatura
  inicial e resposta de HEAD antes de responder sucesso.
  Tenta apagar staging ao concluir e admite abort autenticado.
- `src/integrations/r2/processChunkUpload.ts` prepara digest
  no navegador, transmite sequencialmente os blocos, preserva
  JWT somente no cabeçalho same-origin, não publica a URL de
  um arquivo privado, aborta staging quando um bloco falha.
  `src/integrations/r2/client.ts` usa essa via **somente** para
  anexos de processo acima de 2.500.000 bytes. Arquivos menores,
  brasões, fotos de perfil e as leis seguem seus fluxos atuais.
  Arquivos de processo maiores que 40 MB são recusados
  antecipadamente com explicação explícita.
- Regressões `r2ProcessChunkUploadSecurityQa.test.ts`,
  `r2ProcessChunkUploadBrowserQa.test.ts` e
  `r2ProcessChunkUploadGateQa.test.ts`: 2.5MB de amostra, hashes,
  roteamento Vercel, fim da carga, limpeza, URL sem token,
  caminhos bancários proibidos, autenticação, titularidade,
  vínculo da prefeitura, quota e bloqueio anônimo.
  Commit-base de implementação `3a961097228ee65f44bb9dfa723ec35f328cc7b4`
  aprovado nos três workflows em QA.

**Limitações honestas:** os testes automatizados não gravam arquivo de
40 MB fisicamente no R2 nem simulam um browser com sessão real.
É indispensável testar um PDF arquitetônico de 5–20 MB com
usuário profissional autorizado, verificar o arquivo exato
no R2, abrir o documento depois de F5 e conferir o SHA-256 e
o acesso isolado das duas Prefeituras. Um upload interrompido
pode deixar blocos temporários até limpeza/rotina de retenção
institucional; incluir conferência no teste de restauração.
Páginas de cadastro continuam com dados carregados em memória
e não comprovam paginação no backend sob milhares de linhas.

**Próximos gates prioritários:** teste completo de processo
(cadastro→guia paga→triagem→análise→comunique-se→assinatura→PDF
original→arquivamento), webhook sandbox bancário assinado e idempotente,
planta real contra legislação conferida, duas Prefeituras com sessão
simultânea, restore Neon + R2 e aprovação por perfil.
Os dez critérios do `docs/QA_COMMERCIAL_ACCEPTANCE.md` seguem
pendentes até evidências humanas revisadas; CI e Preview não autorizam
produção.

**Publicação de QA solicitada:** todas as mudanças aprovadas devem
aparecer no Preview, sem mesclar `main` nem alterar variáveis ou banco.
Este commit documental tem a marca de liberação permitida pelo
projeto para Vercel Preview; publicar apenas depois de conferir o
SHA do commit e os workflows. Esta marca é específica do
lançamento em homologação: **[deploy-qa]**.

## 08/11/2026 — fechamento progressivo: autorização de anexos e DAM original (QA)

**Escopo:** remover bloqueios reais sem desativar verificações financeiras,
de autenticação ou separação por Prefeitura. Na prévia anterior o deploy
`e82c533fbcb8a502cf6cc7fad28524bae302150c` estava READY
e tinha os três workflows verdes. Essas alterações seguintes não atingem
a produção e não devem ser dadas como publicadas antes de um Preview
confirmado com o novo SHA.

**1. Admin prefeitura e Master não escrevem em processos por API.**
O controle anterior de upload de R2 verificava o vínculo com o
município, porém o vínculo por si só também existe para contas de
consulta. O novo
`server/process-attachment-write-authorization.ts` exige:
- `current_profile_id` canônico correspondente à pasta de usuário;
- `has_tenant_access` ativo para o município da chave;
- `is_municipality_admin=false` e `is_master=false`;
- caminho estrito `municipalities/{municipio}/{pasta-processual}/{perfil}/{uuid}-{nome}`,
  sem dot-segments, fora do acervo financeiro e das legislações.

O mesmo gate é usado por `server/api/r2-upload.ts` e
`server/api/r2-process-proxy-upload.ts`. Uma recusa ou falha
de permissão resulta em HTTP 403/503 antes de escrever o arquivo.
O Admin continua autorizado a cadastrar **legislações oficiais**
pelo fluxo e RPC específicos; não há mudança nas permissões de
consulta a processos. A via de PDF original DAM continua com
`authorize_payment_guide_original_upload_v2` e não herda permissões
do upload processual.

**2. Original DAM em R2/S3:** anteriormente o
`IfNoneMatch="*"` podia responder 412 para uma chave de DAM já
existente e o backend devolver sucesso sem conferir o objeto original.
A nova `verifyExistingDamOriginal` exige HEAD do mesmo objeto,
tamanho exato, `ContentType=application/pdf`, hash SHA-256
do corpo recebido e metadado SHA-256 idêntico ao original.
Se qualquer prova divergir, permanece conflito 409 e não
há sobrescrita; aplica-se tanto ao R2 SIGAPRO quanto ao
armazenamento S3 municipal configurado. O hash no HEAD é
metadado controlado por quem fez o upload, logo **não substitui
verificação física de leitura/bytes no R2** durante aceite.

**Testes novos ou adaptados:**
`src/test/processAttachmentWriteAuthorizationQa.test.ts`,
`src/test/r2ProcessChunkUploadGateQa.test.ts`,
`src/test/r2ProcessChunkUploadSecurityQa.test.ts`,
`src/test/qaDamOriginalIdempotency.test.ts`.
São regressões de código/autorização e não provas de pagamento
real, leitura IA de planta real ou funcionamento de contas
autenticadas em todas as telas.

**Pendências comerciais que permanecem explícitas:** execução
real de cobrança sandbox assinada e baixada de forma idempotente,
reabertura binária do PDF original, análise técnica concluída no
banco (QA tinha zero linhas em `process_analysis_sheets`),
prova de leitura e zoneamento com projeto técnico real,
testes autenticados de quatro perfis em duas Prefeituras,
restauração Neon e R2, e carga/performance do backend.
A liberação comercial exige os dez aceites do documento
`docs/QA_COMMERCIAL_ACCEPTANCE.md` e autorização específica
para produção.

**Publicação solicitada pelo responsável:** ao concluir os três
workflows sem falhas, publicar apenas Preview da branch QA
com a marca exigida pelo Vercel **[deploy-qa]**;
não editar `main`, produção, credenciais ou dados municipais.

## 08/11/2026 — correção de contraste azul no projeto (captura da Prefeitura)

**Origem do problema:** captura do usuário na rota
`/prefeitura/visao-geral/atividades` mostra fundo azul escuro e
título `Atividades` e descrição com caracteres pretos no tema claro.
O usuário pediu **alterar o software**, não criar imagem ilustrativa.

**Causa de código confirmada:** a navegação usa
`text-white`/`text-sky-100` em componentes React, porém existem
cascatas globais muito específicas que forçam o `color` e o
`-webkit-text-fill-color` escuros nos textos do modo claro.
Classes Tailwind individuais não asseguravam precedência e o
resultado era texto preto sobre botão azul. O mesmo padrão poderia
atingir abas principais e filtros de processos.

**Correção estrutural apenas na QA:**
- `src/components/platform/MunicipalOverviewSubnav.tsx` marca
  estado e elementos semânticos das abas Resumo, Processos,
  Pendências e Atividades (título, descrição, contador).
- `src/components/platform/PageLayout.tsx` identifica a aba
  principal selecionada com `aria-current="page"`, preservando
  `data-nav-active` anterior.
- `src/styles/premium-navigation-contrast.css` reforça
  **somente os controles selecionados com fundo azul** usando
  seletores explícitos de estado, `color` e
  `-webkit-text-fill-color` em branco e azul muito claro. Inclui
  contadores e filtros ativos; as abas inativas mantêm texto
  escuro no tema claro e claro no tema escuro.
- `src/main.tsx` importa o CSS de contraste **depois** dos
  estilos globais `index.css` e `surface-polarity.css`.
  Não altera cores nem conteúdos dos documentos, R2, guias ou
  permissões.
- Testes `src/test/premiumNavigationContrastQa.test.tsx`
  verificam estado da navegação, escopo da regra, ordenação
  dos estilos, descrição e contador ativo e contraste mínimo
  WCAG AA dos textos brancos/azuis sobre o gradiente.

**Liberação:** publicar exclusivamente Preview após os três
workflows verdes, com commit de QA contendo `[deploy-qa]`,
confirmar SHA da prévia e reinspecionar as quatro subpáginas e
guias principais em tema claro e escuro. **Não fazer merge nem
deploy de produção.** O CI não substitui o aceite visual em
navegador autenticado.


## QA 08/11/2026 — menu lateral e marcadores compactos
- Evidência: captura `image(20261108-173859).png` e vídeo `20261108-1739-06.7853843.mp4`, página `/prefeitura/visao-geral/processos`. O item `Prefeitura` permanecia inativo no menu escuro porque a seleção era por igualdade estrita com `/prefeitura`; a coluna de marcador com 30 px quebrava visualmente seu título.
- Correção em `src/components/platform/AppSidebar.tsx`: realçar `Prefeitura` em `/prefeitura` e nas três subpáginas oficiais `/prefeitura/visao-geral/{processos,pendencias,atividades}`, sem realçar indevidamente `Organograma`, `Financeiro`, `Protocolos` ou outros setores. `aria-current=page` nas entradas ativas. Seleção de `Dashboard` preservada inclusive nas rotas internas.
- Correção em `src/components/platform/CompactProcessRegistry.tsx`: coluna de marcadores de 44 px com ícone no cabeçalho em vez de texto que quebrava; bandeira com geometria consistente; status e etiqueta longa permitem quebra controlada e truncamento dentro de seus limites; paginação existente de 25 processos preservada.
- Regressões adicionadas/atualizadas: `src/test/municipalSidebarActiveQa.test.tsx`, `src/components/platform/CompactProcessRegistry.test.tsx` e `src/test/municipalOverviewSubpagesQa.test.tsx`. Não alterar permissões, banco, dados de processos, pagamento, IA ou PDF neste lote.
- **Fluxo:** PR de trabalho atual é a [#118](https://github.com/roksparta8724/projetosigapro01/pull/118) em DRAFT. Não mesclar na `main`, nem publicar no domínio oficial. Só considerar a prévia QA apta após CI do SHA final e Vercel `READY`. A PR #117 do contexto histórico já havia sido integrada anteriormente; as seções antigas documentam o estágio daquela data.


## Liberação visual QA 08/11/2026 — gate do Vercel
- O lote de correção visual foi verificado no SHA `94327d09247ca635f66ed8d26729bdcaa0224d07`: `SIGAPRO Quality Gate`, `Neon migration validation` e `SIGAPRO OCR isolado - QA` encerraram com `success`; novos testes de menu e marcadores passaram.
- O primeiro deploy manual da QA com esse SHA foi **cancelado pelo Vercel**, não por erro de compilação: o comando Ignored Build Step exige explicitamente `[deploy-qa]` no título do commit. Alias estável permaneceu na versão antiga. Esta publicação controlada usa a convenção aprovada, sem habilitar deploy automático na branch, sem tocar na `main` nem na produção.
- Depois deste commit de liberação, verificar os gates no SHA final, estado `READY` do deploy e alias de QA antes de declarar que o navegador mostra as alterações.


## QA 08/11/2026 — correção do filtro Todos invisível no tema claro
- Captura fornecida: `image(20261108-181636).png`, Visão geral da Prefeitura → Processos. O botão `Todos`, quando selecionado, aparecia como uma cápsula branca vazia; o filtro estava com `aria-pressed=true` e texto forçado em branco pelo CSS de contraste, mas sem garantia de fundo azul (o tema/variante outline sobrepunha a classe Tailwind).
- Corrigida a raiz no CSS isolado `src/styles/premium-navigation-contrast.css`: filtro selecionado usa explicitamente fundo azul `#0c4a6e`, borda `#075985` e texto branco; no hover usa `#075985` e texto branco. No tema claro, filtros inativos mantêm fundo branco e texto `#1e293b`; não substitui o tema inverso nem afeta filtros de outras áreas.
- Testes de regressão em `src/test/premiumNavigationContrastQa.test.tsx` verificam o contrato de fundo/texto, a identificação `Todos`/seleção do painel e a razão de contraste WCAG AA. Nenhuma alteração no fluxo de processo, perfis, regras urbanísticas, banco, PIX/boleto, PDFs ou produção.
- O commit de liberação da prévia deve conservar `[deploy-qa]`; exigir CI de SHA final + Vercel `READY` e alias correto antes de anunciar a publicação. PR #118 deve permanecer em draft, `main` preservada.


## QA 08/11/2026 — auditoria jurídica IA: remediação guiada
- Evidências de tela: captura `image(20261108-182729).png` e vídeo `20261108-1826-29.8391751.mp4`, aba `/cadastro-gestao/legislacao`. Estado observado em Campo Limpo Paulista: 22/23 leituras conferidas, 1 ressalva de leitura, Quadro II com 45 rascunhos e 14 páginas, 0 normas individualmente versionadas, 0 importações com fonte, 0 evidências verificadas, 0 versões reais ativas e 1 registro QA fictício.
- A LC 379/2009 foi conferida visualmente em PDF oficial da Câmara (página 37 do documento, Quadro I, AIU 2): o CA mínimo reproduz a célula `01`, cuja pontuação é ambígua na cópia; o Anexo III apresenta CA `1,00` sem comprovar de modo isolado o mínimo. **Não alterar automaticamente para 1 nem remover a ressalva sem confirmação técnica/documental.** LC 566/2022 restabelece textos anteriores; LC 613/2023 institui Plano Diretor; PLC 795/2024 foi retirado. Confrontar leis por artigo e vigência.
- Correções implementadas: a auditoria enumera linhas não conferidas e ressalvas atuais (linha, zona, página, observação literal e histórico); cada pendência ganha ação para ir ao painel adequado, responsável explícito e foco de scroll apenas mediante clique; alterações efetivas em Quadro I, Quadro II ou versões jurídicas invalidam o relatório para nova consulta; substituição de documentos também atualiza a auditoria. O Quadro II distingue 45 rascunhos da inexistência de homologação jurídica. Sem alteração dos guardas ou liberação indevida da IA.
- Testes criados/atualizados: `src/test/urbanReadinessRemediationQa.test.ts`, `src/test/urbanAiReadinessAndDraft.test.ts` e contrato de fluxo `src/test/urbanLegislationContinuity.test.tsx`. SHA `9f1d341aa22f392ed92a9c341781b6e58533d8f3` passou nos gates `SIGAPRO Quality Gate`, `Neon migration validation` e `SIGAPRO OCR isolado - QA`.
- **Limites remanescentes reais:** sem autoridade municipal autenticada para assinar vigência por documento e cada campo, não há como registrar leis oficiais e evidências automaticamente; Quadro II e leitor geométrico exigem aceitação/homologação específica em caso real. Regra fictícia permanece isolada; não declarar IA pronta para parecer oficial nem mesclar a PR #118 draft. Publicar somente prévia QA, sem migrar ou alterar produção.


## Complemento QA 08/11/2026 — atualização automática após cadastro de leis
- O cadastro individual de legislação e a auditoria estavam em estados React separados: após registrar/arquivar norma, `UrbanAiReadinessPanel` permanecia com o `versionedLawCount` da consulta anterior até clique manual. Corrigido com invalidação efêmera `urbanLegalAuditEvents`, isolada por municipalityId, sem transmitir conteúdo de leis entre tenants, nem liberar regras.
- Regressões de isolamento/adaptação do painel em `src/test/urbanLegalAuditEventsQa.test.ts` e `urbanReadinessRemediationQa.test.ts` aprovadas. Fonte oficial visual da LC 379/2009, Quadro I, página 37: AIU (2) CA mínimo está graficamente como `01`, permanecendo ressalva jurídica; não aceitar a regra provisória de teste como parâmetro vigente.
- SHA completo da correção `6534f91435532bad550ac611a0e742a6d3d5f9b0` aprovado em `SIGAPRO Quality Gate`, `Neon migration validation` e `SIGAPRO OCR isolado - QA`. Este commit apenas registra a liberação de PREVIEW com marcação exigida no gate do Vercel. Não mesclar main; não promover produção. A homologação funcional/jurídica integral ainda depende de conferência documental e teste real supervisionado.


## QA 08/11/2026 — foto do Master estável ao navegar
- Evidência: vídeo `20261108-1848-42.5955287.mp4`, transições de páginas Master. Em instantes alternados a foto já cadastrada desaparecia e as iniciais `JR` apareciam; retornava após a nova requisição de imagem. O problema ocorria no ciclo de vida do avatar, **não comprova perda da foto no banco**.
- Causa 1: três `UserAvatar` em `PortalFrame.tsx` tinham `key` associada ao `activeInstitutionId`; a troca de módulo/prefeitura remontava o avatar. Correção: identidade estável `authenticatedUserId || authenticatedProfileId`, independente do tenant, com recuperação visual do `profileAvatarCache` somente para a identidade autenticada.
- Causa 2: `useAuthorizedAvatarUrl` revogava o blob privado no desmontar e fazia novo GET R2 autorizado em cada página; antes de chegar a resposta a UI exibia as iniciais. Correção: novo `authorizedAvatarRuntimeCache` **somente em memória**, com deduplicação por conta e referência R2; leitura privada continua com Bearer no endpoint same-origin e sem persistir token, bytes ou URL blob no localStorage. O logout e a troca de identidade limpam/revogam imediatamente o cache; respostas tardias após a troca são descartadas.
- Testes: `src/test/masterAvatarNavigationStabilityQa.test.ts` cobre reaproveitamento em rotas, isolamento entre contas, expiração de resultados tardios e fontes inválidas. Atualizados guardas de `qaAuthenticatedAvatarBrowser.test.ts`, `institutionalIdentityIsolationRegression.test.ts` e `profileBrandingPersistence.test.ts` para não exigir mais montagem por município. Gates do código SHA `ae61a942269cc7598de53ad57774e0e77316b928`: Quality Gate=success, Neon validation=success, OCR isolado QA=success.
- Publicar **somente prévia de QA** com tag `[deploy-qa]`. Não alterar produção, esquema, dados de perfil, permissões, guias ou leitura da IA. A confirmação visual dentro da conta autenticada deve ser feita no navegador após a prévia ficar READY.


## QA 08/11/2026 — auditoria de prontidão: ligações e eventos restaurados
- Evidência: captura `image(20261108-203141).png`, aba Gestão de leis e parâmetros. Os bloqueios são reais e não podem ser marcados como aprovados por ato de software: PDF legado presente, 22/23 linhas de Quadro I conferidas, 1 ressalva AIU2, 45 rascunhos de Quadro II, sem acervo jurídico versionado e sem evidências oficiais/versões reais ativas.
- Defeito confirmado: três consumidores do histórico de lote (Auditoria, Quadro I e Evidências) escolhiam arquivamento por qualquer evento antigo ou pelo primeiro evento retornado, e podiam considerar um lote restaurado como arquivado. Adicionado `urbanMatrixBatchStatus.ts` que escolhe o evento temporalmente mais recente por lote. Isolamento por lote e testes para restauro + novo arquivamento.
- Defeito confirmado: gravação jurídica em `UrbanQuadroIILegalReviewPanel` não notificava o painel de prontidão; gravação de evidência em `UrbanRegulationEvidencePanel` também não. Propagação de `onDataChanged` até `MunicipalUrbanRulesSettings` e atualização dos indicadores após leitura confirmada pelo backend; não ativa nenhuma regra.
- Defeito UX: ações de auditoria para PDF, registros, versões e evidências levavam a seções genéricas ou, sem rascunhos reais, a uma seção sem formulário. Destinos específicos com expansão de evidências ou de cadastro de versões em rascunho, mensagem quando etapa indisponível por perfil, resumo `X de 7 etapas atendidas` e próximo passo clicável. Ao abrir o Quadro I pelo alerta, exibir ressalvas registradas (incluindo AIU 2) que antes permaneciam recolhidas. A navegação não salva, assina nem ativa normas.
- Segurança jurídica: `legal_approval=false` do Quadro II não é ignorado; versões `reviewed_draft` e regras de QA continuam sem validade. Índices com páginas, vigência, alterações legais, zona e uso precisam de fonte oficial e servidor habilitado. O leitor geométrico exige homologação com planta real. Não declarar IA apta para parecer oficial apenas por testes unitários.
- Regressão `src/test/urbanReadinessWorkflowQa.test.ts` cobre restauro, sincronização de fontes e botões. O código de referência é o SHA `c88ee5f1947a5ca1dc56bfae6f0c627d19757c5d`; manter a PR #118 em rascunho e não realizar merge de produção.

## QA 08/11/2026 — leitura jurídica independente dos Quadros e normas oficiais
- Dossiê fonte: [`docs/LEITURA_LEGAL_CAMPO_LIMPO_20261108.md`](./LEITURA_LEGAL_CAMPO_LIMPO_20261108.md), com links da Câmara e DIOE para LC 379/2009, alterações 440/2011, 473/2014, 501/2016, restauração 566/2022, PDE 613/2023, leis especiais 655/656 de 2026 e decretos 7.548/7.550 de 2026. A minuta municipal de 2026 permanece classificada como proposta sem vigência, não podendo alimentar a IA.
- Conferência independente das **23 linhas do Quadro I original (pp. 36–37)** em `src/lib/campoLimpoQuadroIOriginal.ts`; tabela visual recolhível em `CampoLimpoQuadroIOriginalPanel.tsx`, apenas como referência histórica. Linha AIU(2) CA mínimo literal `01`, ambíguo; nunca converter para valor oficial. Condições/ressalvas de 440/2011 e ZEIS da 473/2014 referenciadas como leitura condicionada.
- `compareCampoLimpoQuadroIOriginal.ts` cruza o lote OCR da própria prefeitura com a fonte original por número de linhas, zona, uso e campos numéricos; mostra divergências sem gravar/assinar nem afirmar vigência. A entrada na auditoria tem ação específica para abrir a fonte histórica. A UI original contém texto claro e tabela com rolagem horizontal.
- Regressão: `src/test/campoLimpoOfficialQuadroIReviewQa.test.ts`, `src/test/campoLimpoQuadroIComparisonQa.test.ts` e `src/test/urbanOfficialLegalSources.test.ts`. Código final de funcionalidade `99bc5c60c20a315b2e583555439d5e20ee26d94b` testado: `SIGAPRO Quality Gate` success, `Neon migration validation` success, `SIGAPRO OCR isolado - QA` success.
- A sessão Neon acessível a esta auditoria contém uma cópia histórica (`sigapro_migration_stage_20260923`) que não reflete os 45 rascunhos do Quadro II vistos no browser. **Nenhuma escrita no banco, R2, regras, pagamentos, ou produção**. Cadastro legal autenticamente assinado e homologação geométrica continuam pendentes. A PR #118 permanece DRAFT e não deve ser integrada à main sem aceite funcional.
- Este commit documental autoriza exclusivamente **deployment PREVIEW na branch QA**, com tag `[deploy-qa]`; não promover produção.


## QA 08/11/2026 — lei-base confirmada, LC507 e confronto real no Neon
- Fontes oficiais consultadas em 08/11/2026: Câmara aponta LC 379/2009 como legislação de referência sem revogação expressa registrada, e Prefeitura publica nova LPUOS 2026 apenas em fase de minuta; o cronograma municipal indica entrega de proposta à Câmara para 15/12/2026. Não foi identificada nova LPUOS promulgada que substitua a LC 379/2009 até esta conferência. O Plano Diretor vigente referido na página oficial de aprovação é LC 613/2023.
- **Achado jurídico documental efetivo:** o art. 1º da **LC 507/2017** [PDF Câmara](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1965/) revoga expressamente **LC 473/2014**, restabelecendo a redação anterior da LC 379/2009 com as alterações da LC 440/2011. O art. 1º da LC 566/2022 menciona 379/2009, 440/2011 e 501/2016 em sua restauração normativa. O catálogo separa a 473 revogada, apresenta a 507 revogadora e deixa a minuta 2026 isolada.
- **Ação solicitada pelo usuário aplicada:** na Auditoria da IA da Prefeitura de Campo Limpo Paulista agora aparece `Lei-base: LC nº 379/2009 · Plano Diretor: LC nº 613/2023`, `Aguardando sua análise`, com a data de consulta (08/11/2026), contexto da revisão 2026 e links para a publicação e a cadeia de leis. É referência técnica, não cadastro oficial, nem autenticação, nem aprovação automática.
- **Fonte QA efetivamente validada:** Neon projeto `red-sunset-21120522`, branch `br-solitary-sound-b4xlbvs6`, database `sigapro_migration_stage_20260923`, município `49dac0b6-6352-4744-9aab-9ff91c59d970`. Leitura: 1 lote de Quadro I (23 linhas), 7 registros de auditoria de leitura, 45 rascunhos de Quadro II, 0 documentos oficiais individualizados, 0 importações jurídicas, 0 evidências, 1 versão `active` de teste. **Nenhuma escrita SQL** realizada.
- **Causa real eliminada:** comparador do Quadro I recusava `Campo Limpo Paulista - SP` (nome real do lote em QA) e esperava só `Campo Limpo Paulista`. Passa a aceitar somente variações explícitas com sufixo `SP`, mantendo isolamento de outras cidades. A reconciliação independente com as 23 linhas do Quadro I original chegou a **229 campos numéricos comparáveis, 0 divergências**. CA mínimo da AIU (2) continua isolado por ambiguidade; isso não prova vigência nem autoriza a IA a assinar parecer.
- Testes de regressão do catálogo LC507, do estado pendente de análise e da variação municipal em `src/test/urbanOfficialLegalSources.test.ts` e `src/test/campoLimpoQuadroIComparisonQa.test.ts`. Código verificado no SHA `85291422921d4626be7ac5d0d831d5dab784bc13` com gates `SIGAPRO Quality Gate`, `Neon migration validation` e `SIGAPRO OCR isolado - QA`: **success**.
- Riscos residuais **não encerrados**: importação autenticada dos PDFs com SHA-256 em R2/Neon, conferência jurídica de Quadro II e vigência por categoria, assinatura/autorização de responsável municipal e teste do leitor geométrico em planta real. Não declarar homologação integral ou regras prontas para parecer oficial. Prévia de QA somente, PR #118 em draft; produção preservada.


## QA 08/11/2026 — pré-preenchimento técnico com AIU2=1,00
- Pedido: automatizar preenchimento dos Quadros I/II conforme vídeo `20261108-2142-59.1480752.mp4`, mantendo CA mínimo da AIU(2) em **1,00**. Vídeo foi inspecionado; formulário jurídico estava vazio apesar de fontes técnicas anteriores.
- **Fonte real Neon homologação verificada, sem escrita:** projeto `red-sunset-21120522`, branch `br-solitary-sound-b4xlbvs6`, banco `sigapro_migration_stage_20260923`, tenant `49dac0b6-6352-4744-9aab-9ff91c59d970`. Encontrados 23 registros no lote do Quadro I (22 leituras conferidas e 1 ressalva), 45 registros `draft_unverified` do Quadro II. A orientação municipal da linha 22 da AIU(2), índice 21, já consta no histórico `urban_matrix_analyst_guidance_v1` e `urban_matrix_analyst_provisional_criteria_v1`: CA mínimo `1.0000`, OCR literal `01`, status `manual_only_pending_concidade`. Nenhum índice foi escrito sobre a fonte oficial.
- **Interface:** em `UrbanLegalMatrixReviewPanel`, seletor de zona/uso com preenchimento automático dos campos numéricos disponíveis e conferidos; 1 opção AIU(2) para **simulação técnica**. O formulário jurídico abre e é focado somente após clique explícito. Formulário de Quadro II traz automaticamente o primeiro trecho candidato do rascunho, mas conserva vazios a segunda transcrição independente, a zona e a vigência.
- **Isolamento jurídico:** `prepareAiu2ProvisionalSimulation` usa o registro do próprio Neon, exigindo fonte `quadros.pdf`, linha 22, zona AIU(2), página 37 e orientação provisória de 1,00; retorna `simulationOnly=true`. `MunicipalUrbanRulesSettings` impede via interface e função de salvar esse valor como versão legal, mesmo se o usuário informar uma data; nenhuma regra ativa, PDF oficial, evidência ou homologação foi inventada.
- **Testes:** `src/test/urbanAutoFillProvisionalQa.test.ts` acrescenta cobertura de pré-preenchimento, validação de lote, fonte ambígua, idempotência e bloqueio de ativação. Quality Gate teve primeira falha por substring de teste de texto, ajustada sem retirar o aviso. Código funcional SHA `2d12dda2e225b09b26595e5b6da45e13d88bdacf` com `SIGAPRO Quality Gate`, `Neon migration validation` e `SIGAPRO OCR isolado - QA` **todos success**.
- **Limite pendente real:** fluxo de cadastro de PDFs no R2/Neon exige a conta Admin da Prefeitura e arquivo original com SHA-256; registro de evidências e vigências, aprovação pelo responsável e leitor geométrico em planta real continuam sem homologação. O prefill não resolve nem pode suprimir essas exigências. **Publicar apenas preview QA**, não mesclar PR #118 draft, não promover produção.


## QA 08/11/2026 — referência legal e UX após vídeo de 22h29
- Vídeo inspecionado: `20261108-2229-33.0221418.mp4`, 21 s. Mostra Quadro I ZM-B(E)/COMERCIAL corretamente pré-preenchido, mas com fundamentação genérica `quadros.pdf, Quadro I, página 36. Conferir artigo, vigência e ressalvas`, resumo repetido de campos já carregados, data legal vazia, e a mensagem de erro de vigência aparecendo longe do campo. A auditoria permanece juridicamente pendente; a única versão ativa vista é fictícia de QA.
- **Correção documental rastreável:** `src/lib/urbanMatrixDraftPreparation.ts` agora recebe opcionalmente `{municipalityId,documentSha256}`. Somente a combinação exata do município `49dac0b6-6352-4744-9aab-9ff91c59d970` com o SHA do lote `68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1` recebe identificação da fonte **LC nº 379/2009, Quadro I ORIGINAL, página correspondente**, URL da Câmara e status `original_not_legally_consolidated`. Outros tenants e documentos continuam sem atribuição jurídica presumida.
- **Visual premium:** bloco de fonte com link direto à página original da Câmara, hash íntegro do lote de leitura e ressalva explícita de que este hash **não comprova o arquivo externo nem o cadastro autenticado no R2**. Remove do resumo extra CA mínimo, área e testada já pré-preenchidos; preserva só CA básico, gabarito não convertível e condições/exceções. Cabeçalho informa que são limites extraídos, não normas validadas.
- **Vigência sem invenção:** continua vazia enquanto não comprovada. Aviso aparece junto ao campo; tentativa de salvar sem data documentada move foco para o campo e apresenta explicação. Não usar o dia do cadastro nem transformar `quadros.pdf` em lei consolidada.
- **AIU 2:** mantém provisoriamente 1,00 no contexto de simulação de QA, sem gravar norma oficial ou remover ressalva; Quadro II e seu histórico não sofreram mudanças nesta rodada.
- **Regressão:** `src/test/urbanQuadroIProvenanceQa.test.ts` testa exatamente ZM-B(E)/COMERCIAL do vídeo, os 9 índices/omissões relevantes, PDF, isolamento por tenant/hash e salvamento de AIU 2 bloqueado. `src/test/urbanAiReadinessAndDraft.test.ts` agora exige valores nas entradas corretas, não duplicações no resumo. Os testes antigos de vigência continuam exigidos.
- Código funcional `4ed3bbc1b4f5a036d4910b36e58488c79a62893f` com **SIGAPRO Quality Gate**, **Neon migration validation** e **SIGAPRO OCR isolado - QA** com conclusão `success`.
- **Não resolvido juridicamente:** 45 rascunhos do Quadro II não são normas homologadas; falta registro autenticado de PDFs oficiais com integridade no R2, matriz de vigências/alterações, evidências jurídicas e teste de análise geométrica com planta real. Nenhuma escrita SQL ou modificação de produção. PR #118 permanece DRAFT. Esta rodada está autorizada apenas para **deploy PREVIEW de QA**, sem promover produção.


## QA 08/11/2026 — fluxo guiado premium da legislação (vídeo 23h05)
- Vídeo da Prefeitura: `20261108-2305-25.2856809.mp4`, 19 s. Mostra fontes legadas, auditoria `1/7 etapas`, Quadro II com 45 rascunhos e páginas horizontais, editor jurídico com índices ZM-B(E)/COMERCIAL pré-preenchidos, vigência vazia e 1 regra QA fictícia isolada. A falta de clareza não é erro na leitura do Quadro I: o usuário precisa de um caminho simples e organizado, não mais telas empilhadas.
- `UrbanAiReadinessPanel.tsx`: nova área `data-urban-guided-workflow` apresenta **Quadro I conferido X/Y, Quadro II rascunhos, acervo versionado** e **uma próxima ação recomendada**, baseada nos `checks` reais do banco. As sete tarjetas completas passam a `details[data-urban-readiness-all-checks]` inicialmente recolhido; acervo histórico e suas alterações também ficam em seção recolhível, sem perder acesso à fonte.
- Ao clicar a ação de cadastro da lei, o painel procura `UrbanLegislationRegistryPanel` no mesmo workspace e abre (apenas no navegador) o formulário e os metadados da **LC nº 379/2009**, quando ainda não existe nenhum documento individualizado. Se o usuário só tem consulta, mostra orientação de permissão; em nenhum caso cria ou aprova lei via clique de navegação.
- `UrbanLegislationRegistryPanel.tsx`: inclui orientação de **primeira lei** quando acervo está vazio, botão explícito para preparar a LC 379/2009 e link do PDF público. O upload obrigatório continua verificando `%PDF-`, SHA-256, R2, autenticação e validade de entrada antes da gravação. Sem PDF não há cadastro automático.
- `MunicipalUrbanRulesSettings.tsx`: orientações extensas recolhidas em `details[data-urban-legal-help]` para reduzir rolagem, preservando todo o texto jurídico e todos os módulos existentes.
- Testes: `src/test/urbanPremiumGuidedCompletionQa.test.ts` cobre 45 rascunhos que permanecem sem homologação, etapas e próximo passo, segurança de permissões e obrigatoriedade de PDF; regressão sem mudanças em backend. Código testado SHA `c6297dc9d2828eee0df899feadf575bfe7ff672b`: **Quality Gate=success, Neon migration validation=success, SIGAPRO OCR isolado - QA=success**.
- Fora de escopo deste commit: não executar escrita no Neon, não criar documentos no R2, não ativar regras, não resolver AIU2 CA=1 sem CONCIDADE, nem afirmar leitura geométrica homologada. Mantenha a PR #118 em DRAFT, preserve produção e faça **deploy exclusivamente PREVIEW QA**.


## QA 09/11/2026 — sair do ciclo do Quadro I após cadastro da LC 379
- Evidência: vídeo `20261109-1446-10.7062491.mp4` (19,5s), na página de legislação da Prefeitura, após o registro autêntico da LC 379/2009 no Neon/R2. Usuário caiu no **Quadro I** ao seguir o botão da auditoria, apesar de já haver 23/23 registros de leitura tratados (22 conferidos, 1 ressalva AIU 2 documentada). Ao selecionar "Ver todas as linhas", o sistema expandia verticalmente todos os registros e tornava a navegação confusa.
- Conferência de banco somente leitura: Neon `red-sunset-21120522`, branch de QA `br-solitary-sound-b4xlbvs6`, tenant `49dac0b6-6352-4744-9aab-9ff91c59d970`: **1 documento jurídico cadastrado, 45 rascunhos do Quadro II, 0 importações jurídicas e 0 evidências**. A confirmação visual corresponde ao cadastro LC 379/2009, mas registro de arquivo não comprova vigência/legalidade das matrizes.
- **Causa real:** `UrbanAiReadinessPanel` usava sempre o primeiro check `passed=false`, e `Quadro I` fica legalmente pendente enquanto houver uma ressalva. Isso fazia o botão principal mandar o usuário de volta para a mesma conferência já tratada, sem possibilidade de avanço.
- **Correção de fluxo:** novo helper puro `urbanReadinessNextStep.ts` ignora o Quadro I **somente para a próxima ação navegável** quando `untreated=0` e todas as linhas constam como conferidas ou ressalvadas. **Não altera `passed` do Quadro I**, não emite parecer e não remove a ressalva da AIU 2 (CA=1,00 apenas em simulação). Com lei cadastrada e Quadro II pendente, o próximo clique direciona à aba **Quadro II — Usos e localização**.
- **Correção visual premium:** resumo da auditoria mostra `23/23 registros tratados` + `22 conferidos · 1 ressalva`. Quando se opta por consultar todas as linhas do Quadro I, a lista tem altura máxima de 65vh, rolagem interna e botão para retornar à visão resumida, sem empurrar os demais módulos por páginas inteiras.
- Regressão `src/test/urbanGuidedNextStepAfterLegalRegistrationQa.test.ts` cobre 4 casos: Quadro II após ressalva registrada, cadastro da lei prioritário enquanto ausente, linha realmente não tratada voltando ao Quadro I, e nenhuma repetição quando resta somente validação jurídica. Código funcional SHA `5bd5af8b3846552ada821c5386ccfd4da586140d` aprovado em **Quality Gate, Neon migration validation e SIGAPRO OCR isolado - QA**.
- **Escopo protegido:** nenhuma escrita no banco da Prefeitura, R2, alterações de leis, aprovações, regras ativas ou produção. PR #118 em draft; publicar somente **preview QA**. Pendências continuam: conferência e evidências do Quadro II, vigências legais, validação de AIU2/CONCIDADE, planta real e homologação do leitor geométrico.


## QA 09/11/2026 — Quadro II, fila de 45 rascunhos e revisão direta
- Evidência: vídeo `20261109-1459-23.2776166.mp4` (~60 s), QII na homologação. Após avançar, o usuário chega corretamente ao Quadro II (14 páginas, 13 com OCR provisório, 1 exigindo inspeção visual), porém a fila apresenta **45 categorias já salvas e 0 próximas pendências**, com o botão `Revisar próxima pendência` desabilitado. Na página 45, S2.3 contém documentação incompleta (atividades academia/ginástica/esporte etc.) apesar do rascunho de hospedagem; cards duplicam categorias salvas e advertências, tornando a navegação extensa.
- Diagnóstico: `UrbanQuadroIIWorkspacePanel` calculava `pendingQueue=reviewQueue.items.filter(item=>item.status!=="draft_unverified")`; como todas as 45 categorias têm rascunho, nenhuma aparecia como pendência. O status `draft_unverified` é **persistência preliminar**, não validação legal. A interface também mostrava `0 trechos candidatos`, `0 inspeções visuais` apesar de 1 página marcada `visual_required`, pois contava apenas propostas ainda não rascunhadas.
- Base Neon de QA confirmada **apenas com SELECT**: projeto `red-sunset-21120522`, branch `br-solitary-sound-b4xlbvs6`, database `sigapro_migration_stage_20260923`, tenant Campo Limpo Paulista: **45 drafts, 45 trechos presentes, 38 com vias, 38 com requisitos de estacionamento, 0 com zonas permitidas preenchidas, 11 páginas com drafts**. Nenhuma gravação SQL ou R2 realizada.
- Correção técnica: a fila considera também `draft_unverified` como etapa de **conferência jurídica não concluída**. `Revisar próxima categoria` abre o **registro já salvo**, seleciona sua categoria no formulário `UrbanQuadroIILegalReviewPanel`, apresenta o trecho candidato, deixa zona, data, segunda transcrição e consentimento vazios e oferece link da Câmara para a página correspondente. `reviewCursor` avança para a categoria seguinte em cliques posteriores; é navegação sem qualquer aprovação automática.
- UX premium: o resumo agora diferencia `45 rascunhos aguardando revisão`, `13 páginas OCR provisório` e `1 página com revisão visual`, em vez de zero ações contraditórias. O botão do registro já salvo passa a ser **acionável para conferir** (nunca para duplicar). A lista detalhada de registros salvos fica recolhida e com rolagem limitada (55vh). Seção de escolha de outras categorias dentro do formulário jurídico também recolhida para reduzir rolagem. A tela não perde notas sobre ressalvas, nem duplica processos.
- Segurança: continua bloqueado cadastro duplicado da mesma categoria/página; nenhuma zona ou vigência é presumida, sem texto legal verificado não há versão homologada; nenhuma regra ativa/IA é criada. Proibido atribuir ao Quadro II homologação jurídica apenas porque a transcrição está no Neon.
- Regressões: `src/test/urbanQuadroIIResumeExistingDraftQa.test.ts` cobre 45 rascunhos, fila acionável, foco na categoria existente, não gravação, link PDF e painel contido. `src/test/urbanLegislationContinuity.test.tsx` foi atualizado para refletir **navegação ao rascunho existente com proteção contra duplicação**, sem enfraquecer a permissão ou o bloqueio de writes. Código SHA `4e8234a194ba0674c51f4ec5c26d7e59a784e2f3`, verificado com **Quality Gate, Neon migration validation, OCR isolado — todos success**.
- PR #118 continua DRAFT, branch QA única; publicar **somente preview**. Produção, auth, pagamentos, processos e banco municipal não alterados. Pendências reais: conferência manual do PDF em linhas críticas (S2.3 e página 43), zona/uso/hierarquia/vagas com escopo e vigência, evidências por regra e ensaio de planta arquitetônica real.

## 09/11/2026 — verdadeiro progresso da revisão jurídica (somente QA)
- Inspeção visual de vídeo: LC 379/2009 em acervo, 22/23 conferências do Quadro I mais AIU(2)=1 provisório; Quadro II com 45 rascunhos/14 páginas e nenhuma norma real liberada.
- Consultas Neon QA read-only: uma lei cadastrada como `quadros.pdf`, com SHA-256 `68c85d879011...`, `pending_legal_review`, datas jurídicas ainda sem conferência, 45 linhas `draft_unverified`, 0 importações jurídicas e 0 escopos oficiais; duas regras de teste não comprovam legislação real.
- Código QA distingue rascunho OCR de versão jurídica `reviewed_draft`, agrupando por município, SHA, página e categoria. Próxima categoria só percorre as que não possuem primeira revisão; a fila completa permanece consultável. A leitura é revalidada após o registro; indisponibilidade da API conserva estado pendente.
- Regra de segurança: uma revisão de zona NÃO é aprovação de todas as zonas nem ativação da IA; dados legais, publicação/vigência e georreferenciamento exigem evidência municipal. PR #118 continua draft, sem publicação em produção.

### Auditoria técnica integrada de 09/11/2026
- [Relatório de QA — legislação, zoneamento, pagamentos, IA, segurança e gates](./AUDITORIA_INTEGRADA_20261109.md). Consultas somente leitura no Neon QA; testados os limites do Quadro II, com CI de código `1582932b`: Quality Gate, Neon migration validation e OCR QA **SUCCESS**.
- **Esta publicação é exclusivamente de Prévia QA**. A revisão jurídica e as provas de pagamentos/IA continuam pendentes; não confundir com homologação comercial nem promover para `main`.


## QA — laboratório de PDF para ensaio técnico isolado
- Novo endpoint `POST /api/ai-assistant?action=qa-architectural-benchmark`, somente na branch Preview exata, JWT de analista/supervisor ativo, origem verificada. Utiliza os bytes do PDF QA04 fictício de três páginas produzidos em memória; nenhum arquivo real é consultado ou transmitido.
- O ensaio exige 3/3 recuos textuais com referência à página 2; não altera processo, pagamento, lei, zona ou estado da triagem. UI na mesa do analista, somente `VITE_SIGAPRO_NEON_ISOLATED=true`. Não é avaliação visual, de precisão em planta real nem parecer jurídico.
- Testes de sessão, perfis, isolamento da branch e resultado do parser + UI. A análise do documento oficial continua bloqueada até o fluxo correto.

## QA — Dossiê único do Quadro II
- Nova exportação em PDF A4, em um clique, de todos os rascunhos persistidos (45 na consulta de 09/11). Inclui separação por páginas, SHA-256, trecho candidato, uso, vias, vagas, campos pendentes e ressalvas de OCR. Não confirma lei, vigência, zonas ou regras para IA.
- Resultado gerado somente no navegador de um usuário autorizado para a prefeitura, sem modificar os dados do banco. Se histórico jurídico não estiver disponível, o documento declara a limitação em vez de alegar inexistência de revisão.

### QA — correção da geração de bytes e prova HTTP de proteção
- O PDF QA04 agora expõe uma única função `createQa04ArchitecturalPdfBytes()` utilizada tanto pelo upload de arquivo fictício quanto pelo laboratório de backend. Evita `File.arrayBuffer()` indisponível em alguns runtimes de teste e mantém exatamente os mesmos bytes das 3 pranchas.
- Smoke HTTP de QA verifica que `POST /api/ai-assistant?action=qa-architectural-benchmark` sem JWT não permite ensaio. A proteção Vercel requer identidade confiável para executar esse smoke remoto, sem desproteger a prévia.

## 09/11/2026 — consolidação das entregas técnicas e prévia isolada
- **Novo laboratório de PDF sintético**: `server/qa-architectural-benchmark.ts`, `src/components/platform/QaArchitecturalLab.tsx`, rota `POST /api/ai-assistant?action=qa-architectural-benchmark` e testes de autenticação/isolamento. Uma planta fictícia gerada em memória é processada pelo parser local atual, com exigência 3/3 recuos na página 2. A rota falha fechada fora do Vercel Preview da branch QA, sob JWT e perfil analista municipal. Não acessa/atualiza banco de processos, R2, pagamento ou legislação e não chama IA externa. Não comprova geometria real nem autoriza análise do processo 04 em triagem.
- **Exportação de dossiê completo do Quadro II**: `urbanQuadroIIDossier.ts`, botão na bancada municipal, páginas A4, SHA e trechos do PDF, 45 rascunhos existentes quando consultados, zonas/vias/vagas/condições, e histórico `reviewed_draft` isolado pelo município e SHA. A exportação ocorre no navegador sem alterar dados, e imprime advertência de não homologação. Teste do gerador está incluído.
- **Correção da camada de bytes de PDF**: `createQa04ArchitecturalPdfBytes()` fornece os mesmos bytes ao `File` do browser e ao ensaio em Node. Anteriormente o teste falhou pois `File.arrayBuffer()` não era suportado pelo runtime do runner, não por falta de uma cota no PDF.
- **Observação de CI**: no commit `bc03cac3` o Neon migration validation executou 1713 testes com 1712 passados e 1 teste de laboratório reprovado (HTTP 503 esperado 200); foi corrigido em `06370876`. Para este último commit, Quality Gate `42672066164` e Neon validation `42672066256` constam `failure` **sem criação de job** (0 jobs registrados via API), enquanto OCR isolado `42672065806` passou. Isso NÃO é evidência de sucesso da suíte completa nem prova de billing: checar as restrições de Actions/runner/conta e reexecutar quando a infraestrutura permitir. O CI comercial é obrigatório antes de liberação comercial.
- **Vercel**: a tentativa da versão `06370876` foi `CANCELED` pelo Ignored Build Step porque faltava `[deploy-qa]` no commit, não por erro de compilação. Esta atualização documental usa esse marcador para uma única compilação e implantação Preview QA, jamais `main`, produção ou banco `production`. Verificar o SHA final e READY antes de declarar publicação.
- **Critérios de aceite pendentes**: execução autenticada do laboratório e extração do PDF arquivado R2 com processo em Análise Técnica (sem burlar triagem), revisão legal municipal, georreferenciamento e webhook bancário assinado. Não confundir os recursos novos de ensaio/documentação com homologação legal ou bancária.


### QA — laboratório acessível fora de processos em triagem
- O ensaio do PDF fictício também está no primeiro painel da **Mesa Técnica > Visão Geral** do perfil `analista` ou `prefeitura_supervisor`, exclusivamente quando `VITE_SIGAPRO_NEON_ISOLATED=true`. Assim o laboratório é acessível mesmo que o processo fictício 04 não tenha saído da triagem; não precisa abrir a mesa documental do processo bloqueado.
- A fila oficial continua filtrando `isProcessReleasedToUrbanAnalysis`; não houve desvio de pagamento, triagem nem autorização do backend. Teste estático de regressão confirma o ponto de entrada e a separação.

## 09/11/2026 — Gate alternativo de qualidade obrigatório na compilação da Preview QA
- GitHub Actions passou a devolver falhas sem criar jobs; este é um bloqueio externo de agendamento, não aprovação técnica. Foi adicionado o script `scripts/qa-preview-build-gate.mjs`, chamado antes do `vite build`.
- **Exclusivamente** quando `VERCEL_ENV=preview` e `VERCEL_GIT_COMMIT_REF=fix/qa-triagem-analise-pagamento-20261101`, a compilação Vercel deve executar `tsc --noEmit`, ESLint do projeto e 18 suítes críticas (leitura de pranchas reais de ensaio, laboratório QA, legal/Quadro II, RLS/perfis, geozoneamento, fintech e webhooks). Se qualquer etapa falhar ou expirar, o processo aborta e o alias não deve migrar para a nova versão.
- Em produção/main/outras branches o comportamento de build permanece `vite build` sem dependência desse mecanismo QA. Esse gate não consulta bancos, provedores financeiros, arquivos reais nem executa testes E2E autenticados. Ele não substitui os gates comerciais, o GitHub Actions e os testes com prefeitura/banco/lei oficiais.
- Evidências do resultado estarão exclusivamente no build log Vercel do commit alvo. É incorreto anunciar a prévia como testada até o marcador `PASS focused preview gate` e o status READY.

### 09/11/2026 — bloqueio de ESLint resolvido pelo gate Preview
- Primeiro ensaio do novo gate: `tsc --noEmit` passou; ESLint detectou **1 erro** `no-control-regex` em `src/lib/urbanQuadroIIDossier.ts:27` e 48 advertências não bloqueantes preexistentes. O deploy `dpl_8HHTYnofKMAVDf3nDEJ1DyJoxddc` falhou corretamente em vez de atualizar o alias.
- Substituída a regex de caracteres de controle por filtragem segura de codepoints Unicode antes da normalização de espaços. O gate completo de 18 suítes ainda precisa passar no novo build; esta observação não é homologação comercial.

### 09/11/2026 — gate de testes: compatibilidade de versão
- Novo ensaio: `dpl_3hB4ZquoS8Vj26LPUwuwzvrQTf9T` **PASSOU** no TypeScript e no ESLint (48 avisos preexistentes; zero erro) e bloqueou o deploy no início do Vitest devido à opção `--minWorkers` não suportada pelo binário instalado. Foi removida a opção; `--maxWorkers=2` permanece para limitar concorrência em 2 CPUs.
- A suíte específica do próprio gate agora integra as verificações, totalizando 19 arquivos de testes focados. Corrigido seu detector de atribuição de variáveis ambientais para não confundir `===` com `=`. A validação ainda depende do próximo build.
- Observação apenas leitura Neon QA do mesmo dia: processo `PM-2026-00004` atualmente em `analise_tecnica` e `triage_status=concluido`; 5 anexos (4 válidos), uma guia com estado registrado como compensado/confirmado. Isso corrige notas históricas de etapa antiga, mas não comprova pagamento bancário externo. Não foi feito bypass de triagem.

### QA — teste de webhook independente de credenciais de Preview
- Gate Vercel `dpl_EtkobaRQhagDk9AeobcZMyNjjo1H`: TypeScript **PASS**, ESLint **PASS**, 19 arquivos/110 casos Vitest, sendo 109 PASS e 1 FAIL no mock de health do webhook. O caso esperava `encryptionConfigured=false`, porém o ambiente QA disponibiliza `MUNICIPAL_PAYMENT_MASTER_KEY` ao build.
- Corrigido apenas o setup do teste: `vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY","")` ao simular uma configuração ausente, restaurada por `vi.unstubAllEnvs()`. Código de produção/QA de validação de assinatura, auditoria financeira e guarda das credenciais **não foi modificado**. Novo build precisa confirmar resultado.

## 09/11/2026 — PDF real arquivado do Processo 04: prova de leitura autenticada em QA
- A **Mesa Técnica → Visão Geral** agora oferece dentro do laboratório QA a opção `Testar PDF arquivado no R2 (sem IA paga)`, visível apenas ao município de Campo Limpo Paulista na branch isolada e para papéis `analista`/`prefeitura_supervisor` do menu.
- Usa `GET /api/ai-assistant?action=project-extract` com o documento de versão 2 `ad0fb7f4-2b0f-43a4-8e9e-885af20863ec` e só se a autorização real estiver `documentReady=true` chama POST `readingMode=native_text`. O servidor lê o R2 por credenciais privadas, confere permissão, faz parsing/auditoria de 3 páginas e retesta a versão ao fim. Sem créditos, provedor externo, mudança de status, envio a pré-análise ou gravação.
- O componente só aceita resposta com vínculo exato a processo/documento/versão, fonte local e `pdfSharedWithConfiguredAiProvider=false`. A interface mostra o resultado dos 3 recuos com página e qualifica que o guia está `QA_SYNTHETIC_NOT_BANK_PAID` e que ART/matrícula são placeholders. Nenhuma homologação bancária/jurídica inferida.
- Regressões: tenant diferente oculto, GET autorizado precedendo POST, body nativo restrito e GET bloqueado impedindo acesso ao R2. O gate Vercel passará de 19 para 20 suítes críticas. Ainda falta usuário analista autenticado executar este ensaio da versão arquivada na prévia.

## QA — verdade financeira: guias simuladas não são arrecadação
- Campos de simulação `bankStatus=QA_SYNTHETIC_NOT_BANK_PAID`, códigos `QA-FICTICIA-SEM-COBRANCA` e transações `providerEnvironment=test` são excluídos de totais, gráficos e indicadores financeiros, mesmo com status `compensada` para ensaio técnico.
- Dashboard e Financeiro mantêm os registros no histórico, com etiqueta `Simulação QA — sem arrecadação real`, sem alterar `status` no Neon, as guias originais ou a habilitação de Análise Técnica. Os valores compensados não simulados ficam rotulados como `Compensado no sistema`, sem presumir prova de crédito bancário.
- Testes de classificação e regressão do livro financeiro adicionados; a mudança não executa nenhuma operação bancária nem toca a produção.

## 09/11/2026 — integridade transversal da homologação QA
- A apuração financeira compartilha um único sumário puro e não mutável entre Dashboard e Financeiro, incluindo valores finitos, pendências por processo e divergências. Nenhuma guia QA é contada como arrecadação; os históricos permanecem intactos.
- Cobertura de evidências jurídicas exige documento identificável e datas civis válidas (ex.: 2026-02-30 é rejeitada), limite temporal coerente, hash, página, trecho, município, zona e uso coincidentes. Não ativa qualquer lei e não substitui conferência jurídica.
- Códigos de etapa desconhecidos retornam progresso desconhecido, nunca "Cadastro" falsamente confirmado. Permissões e transições reais do backend não foram alteradas.
- Regressões QA de finanças, validade legal e integridade de fluxo foram incorporadas ao gate da prévia. Validar TypeScript, lint, suíte completa, integridade Neon e OCR antes de publicar; sem deploy em produção.

### Continuidade QA — evidência financeira por perfil
- Protocolo, livro financeiro, acesso externo e histórico de guias exibem Simulação QA quando o banco marca QA_SYNTHETIC_NOT_BANK_PAID ou o provedor está em ambiente test, mesmo que o status interno seja compensada para fins de ensaio.
- Nenhuma regra de transição, confirmação financeira, segregação entre prefeituras ou banco de dados foi alterada; as guias de QA continuam preservadas e rastreáveis.
- Compensada no sistema não equivale a comprovação de crédito em conta. Testes de regressão cobrem as telas.

### QA — regressão de etiqueta financeira atualizada
- Quality Gate completo do commit b486e3dd executou 1.734 testes, com 1 falha de asserção textual antiga no histórico financeiro do profissional; 1.733 passaram. A falha veio da expectativa literal 'Pago / compensado', agora substituída por classificação segura de simulação ou compensação do sistema.
- O teste agora exige que guia sintética não seja rotulada como dinheiro recebido, sem alterar registros, pagamentos, autorização de perfil ou processos. Reexecutar gates completos antes de anunciar publicação final.


## 09/11/2026 — continuidade autenticada: auditoria do banco e integridade transversal
- Vídeo `20261109-2136-00.9413257.mp4` (10,13 s) mostra conversa anterior, não interação com a interface; não é evidência E2E.
- Antes deste lote, PR #117 mesclada e PR #118 draft no commit `720ae7fc27af6f5364677bfdc29e1261508fd6d8`. GitHub Quality Gate, Neon migration validation e OCR QA aprovados nesse SHA; deployment Preview `dpl_HkmdPuy8yqKHHXa6svJbYLCozy91` READY no alias estável. Produção não recebe este lote.
- Leitura Neon QA, branch `br-solitary-sound-b4xlbvs6`: 8 processos, 11 guias, 28 documentos de processos, 45 rascunhos do Quadro II sem homologação, 1 documento legal pendente de revisão, 0 escopos de evidência jurídica, 0 geometrias de zoneamento, 2 regras ativas que são fixtures `QA-URBAN-E2E-20261024` sem validade legal. Não inferir conformidade dessas regras.
- Este lote corrige **o modelo de leitura dos pagamentos**: inglês legado (confirmed/pending/paid) e português, separa situações desconhecidas, exclui sandbox/QA da receita e usa somente a classificação comum nos indicadores de Dashboard, Financeiro e pagamentos externos. Não altera banco, conciliação, autorização ou estado da guia. `Compensada no sistema` não significa crédito bancário comprovado.
- O seletor de vigência urbanística passa a rejeitar datas civis impossíveis e regras de teste; regressões passam pelo gate do Preview QA. Falta validação do novo SHA, CI e Vercel READY antes de anunciar conclusão técnica.
- Bloqueios reais da homologação comercial: leitura autenticada do PDF R2 por analista, confirmação da legislação e usos por página/município/vigência, mapa GIS oficial cadastrado, webhook assinado e baixa bancária real, perfis de duas prefeituras e ensaio de restauração/rollback. Sem merge PR #118, sem deploy oficial e sem modificar dados do Neon neste ciclo.
\n\n## 09/11/2026 — fechamento integrado do livro financeiro por evidência real\n- Auditoria direta do banco Neon QA: 5 guias `compensada`/`paid=true` sem `bank_status`, ID de transação ou data de autenticação; 2 guias `QA_SYNTHETIC_NOT_BANK_PAID` e 1 guia Mercado Pago `test` com `processed/accredited` não são arrecadação real. O estado interno não prova crédito bancário.\n- Classificador comum de baixa bancária exige status compensado, ambiente de produção, Mercado Pago, estado/descrição processado/acreditado, pedido, pagamento e autenticação registrada. Outras modalidades aguardam recibo próprio verificado; nenhuma confirmação fictícia.\n- Dashboard, Financeiro, Controle por Protocolo e Pagamentos Externos passam a distinguir valores compensados internamente, valores com comprovação bancária e QA. Histórico preservado, sem alterar fluxos, pagamentos ou produção.\n- Segurança SQL conferida somente leitura: 135 tabelas public, 68 com RLS; 67 sem RLS, porém somente spatial_ref_sys (tabela PostGIS pública de referência) possui SELECT por authenticated/anonymous. Não aplicar RLS em legado indiscriminadamente sem revisar RPCs.\n- Testes de regressão e gate CI obrigatórios antes de publicar QA. Continuam pendentes as provas E2E autenticadas, municipais e bancárias comerciais; não declarar liberação comercial antecipada.\n

## 09/11/2026 — ensaio funcional integrado do ciclo municipal, sem concessão de direitos
- Corrigido o modelo de workflow de apresentação: havia caminho sem `initial_fee -> initial_settlement`, triagem antes do recolhimento e transições disponíveis ao `prefeitura_admin`, apesar de perfil estritamente consultivo nos processos.
- Sequência de referência agora inicia por cadastro/pre-protocolo, guia original arquivada, retorno da compensação e oficialização, triagem, análise técnica, exigência/reapresentação, decisão e alvará. Habite-se usa **protocolo independente** com vistoria, guia e assinatura, jamais continuação automática da aprovação.
- Transições de referência deixam de dar permissão de movimentação ao admin municipal. Mudanças de autorização efetiva continuam estritamente nas RPCs/RLS do Neon; o modelo React não concede permissões no servidor.
- Ensaio `src/test/qaFullJourneyIntegrated.test.ts` executa funções reais de fluxo, bloqueios por condição/papel, ambas as trajetórias e parsing real do PDF fictício com 3 pranchas, sem falsificar pagamento ou lei. Isto é ensaio funcional determinístico, **não** uma sessão autenticada E2E de prefeitura.
- Novo teste integra o gate de build Preview QA; publicar apenas se TypeScript, lint, focused gate, todos os testes e Vercel READY aprovarem no mesmo SHA.


### Complemento — sequência oficial específica do Habite-se
- Conferidos os procedimentos efetivos na migração `neon/migrations/20261018_habite_se_completion_workflow.sql` e nos testes de vistoria: análise documental → **vistoria e evidências** → solicitação e envio da guia de Habite-se → compensação → retorno à análise/Alvará → assinatura da Diretoria → conclusão.
- O modelo de referência QA agora possui os estágios próprios `habite_se_inspection` e `habite_se_fee`, em vez de saltar diretamente da triagem ao Alvará. O teste percorre cada etapa de ponta a ponta com regras de avanço explícitas; a autorização real permanece nas RPCs do banco.


### Proteção operacional completa — Admin da Prefeitura / QA
- A auditoria Neon encontrou proteção de escrita `municipal_admin_process_readonly_v1` em 8 tabelas principais, mas as auxiliares de parecer, alvará, habite-se e assinaturas ainda estavam sem esse gatilho, embora algumas RPCs citassem `prefeitura_admin` como opção. A autorização efetiva exige blindagem no banco, não somente nos botões.
- Migração aditiva `20261109_complete_prefeitura_admin_process_readonly_qa.sql`: mantém o `SECURITY DEFINER` com `search_path` seguro e amplia o gatilho a 27 tabelas processuais, cobrindo inserção, atualização e exclusão; contempla aliases legados de admin. Legislação municipal, perfis e gestão institucional permanecem fora desse bloqueio.
- Sem tocar na produção. Conferir aplicação em Neon QA e os 27 gatilhos efetivos antes de alegar proteção operacional final.


- Refinamento não destrutivo do gatilho: `notifications`, `process_markers`, `profile_process_archives` e `integration_sync_runs` são registros de caixa de notificações, preferências pessoais e log de conector — não alterações ao processo. Os gatilhos continuam instalados para auditoria, mas a função permite essas operações específicas. A edição de documentos, guias, parecer, assinatura, vistoria, alvará e status do processo continua negada ao admin municipal.

## 10/11/2026 — reprodução independente da instalação e bloqueio de dependências
- Em sandbox Git isolado reproduziu-se a falha de `npm ci` sem a configuração de peers legados: dependências de integração Neon beta não estavam incluídas no lockfile no modo peer padrão; `npm ci --legacy-peer-deps` instalou corretamente 834 pacotes e permitiu testes. É risco de divergência entre CI, preview e máquina do desenvolvedor.
- Adicionada configuração local `.npmrc` compatível com a versão beta fixada do Neon (`legacy-peer-deps=true`). CI Quality e Neon passam a executar **`npm ci`**, com lockfile imutável; workflow Neon não tem mais permissão de escrita nem sincroniza o lockfile por commit automático depois de testes. Uma futura atualização do SDK pode remover essa configuração mediante validação do novo lockfile.
- Isto comprova instalação reprodutível sob o contrato declarado, não comprova login de usuário municipal nem evento real de compensação bancária.


## 10/11/2026 — correção estrutural do encerramento administrativo do Habite-se
- Erro real: em `ProcessDetailPage.tsx` o comando `onCompleteProcess` escrevia genericamente `status=deferido`; no painel o status local também permanecia `deferido`. A aplicação não chamava a função existente `complete_habite_se_process_v1`, deixando o processo fora do arquivo administrativo.
- Corrigido: chamada pela `completeHabiteSeProcess` do cliente, com resultado obrigatoriamente `arquivado`; a RPC Neon verifica acesso e Alvará e grava processo, movimentação e auditoria na mesma transação. O painel agora marca `arquivado` apenas após sucesso efetivo.
- Prova de banco com identidade do analista: a RPC concluiu e gerou movimentação/auditoria, com rollback intencional preservando o processo original. Novo teste de regressão integra o gate Preview QA.


### Habite-se emitido — identidade exata do PDF assinado e bloqueio de arquivamento indevido
- Constatou-se em QA que o alvará registrado como emitido tinha `form_data` persistido diferente do conteúdo da versão 2 assinada pela Diretoria (observações preenchidas apenas no artefato assinado). `get_habite_se_permit_v1` regenerava o conteúdo usando parâmetros mutáveis da Prefeitura e podia mostrar dados diferentes da versão assinada.
- Migration `20261110_habite_se_signed_document_and_completion.sql` faz o documento **emitido** carregar diretamente o `formData` da última versão assinada pela Diretoria, com identificação do Alvará e código verificador. Sem assinatura verificável, bloqueia abertura em vez de apresentar conteúdo incerto.
- `complete_habite_se_process_v1` agora valida o artefato assinado e a guia do Habite-se efetivamente compensada. Guias bancárias exigem retorno autenticado, ambiente de produção e referência ao PDF original. Admin municipal é explicitamente consultivo, sem conclusão de processos.
- Implantar e provar na QA, sem reescrever documentos emitidos ou pagamentos legados; nenhum dado da produção alterado.


### Contrato do administrador municipal, inclusive na tela do processo
- A auditoria do formulário `ProcessDetailPage` encontrou exceção explícita `allowMunicipalAdmin:true` no encaminhamento por organograma e texto que prometia ao admin poder despachar processos. Isso contrariava a regra consultiva e os 27 bloqueios do Neon.
- Removida a exceção, formulário ocultado para `prefeitura_admin`, adicionada recusa defensiva no handler e corrigido o aviso institucional. Teste de regressão adicionado ao QA Preview. A gestão de legislações, identidade institucional e usuários permanece nas telas administrativas próprias.


### QA 04: retirar todos os bypasses de admin municipal, inclusive fixtures
- A suíte completa detectou duas exceções remanescentes `allowMunicipalAdmin:true` na importação de documentos sintéticos e na revisão V2 do Processo 04. Mesmo na homologação, uma prefeitura_admin não deve conseguir gravar dados operacionais.
- Removidas ambas as exceções e o parâmetro permissivo do executor genérico, restringindo o kit QA à operação `master_admin/master_ops` no processo e ambiente exatos. Isso preserva a funcionalidade do laboratório e os triggers de bloqueio do admin municipal. Testes QA e de despacho atualizados para verificar que não existe bypass.

### QA 10/11/2026 — Verdade operacional do status final no Habite-se
- Corrigido bug de falsa conclusão: `HabiteSePermitPanel` exibia **Processo concluído com êxito** quando o processo estava somente `deferido` (status legado com Alvará emitido). Agora só `arquivado` representa encerramento administrativo efetivo, confirmado pela RPC atômica, assinatura verificável e auditoria. Regressão adicionada à suíte canônica do Habite-se.
- Ensaio no banco QA com identidade ativa de Analista municipal: a RPC completou o processo real de homologação de Habite-se, alterando status para `arquivado`, inserindo movimentação e auditoria. **Rollback intencional** após assertivas: processo original permanece inalterado.
- Ensaio de acesso negativo no banco QA: Admin da Prefeitura e Profissional externo foram recusados na conclusão; Analista de outro tenant foi recusado ao ler e ao concluir Habite-se de Campo Limpo Paulista.
- Consulta de documento no banco QA: `get_habite_se_permit_v1` devolve o texto exatamente da versão assinada pela Diretoria, incluindo as observações, sem reconstruir o conteúdo emitido com parâmetros atuais.

### 10/11/2026 — reimpressão oficial do Habite-se a partir da versão assinada
- A renderização do PDF aceitava o objeto `process` atual para proprietário, endereço, área, uso e profissional, ainda que o artefato assinado `signature_blocks.artifact_payload` já possuísse o snapshot desses mesmos dados. Uma atualização posterior poderia gerar **documento visual diverso do assinado**, inclusive sem código verificador quando o comparador dependia do processo mutável.
- Introduzida `src/lib/habiteSeSignedSnapshot.ts` para exigir o artefato correto, número e processo, hash SHA-256, código verificador, assinatura da Diretoria e `formData` idêntico à versão emitida. O PDF usa exclusivamente o snapshot assinado, não os dados administrativos alteráveis. Caso qualquer campo essencial divirja, bloqueia a impressão oficial.
- A abertura de um alvará emitido agora obtém **novas cópias autenticadas** do alvará e das assinaturas no backend, sem confiar na visualização em cache do navegador; teste de regressão reproduz alteração posterior de proprietário, área e endereço e verifica identidade documental.

- Teste de documento binário `habiteSeSignedPdfBytesQa.test.ts`: gera um **PDF A4 real** a partir do artefato assinado, simula mudança posterior de proprietário, endereço e protocolo e verifica que os valores assinados aparecem no arquivo, sem os alterados. Incluído no QA Preview build gate.

- Refinamento de UX para prova documental: se o registro possui status `emitido` mas o navegador ainda não validou o artefato assinado, a interface mostra **Conferência da assinatura**, não **Emitido pela Diretoria**. A métrica da área no painel do Alvará passa a usar o snapshot da assinatura quando validado; impressão exige refetch autenticado.


## 10/11/2026 — consistência dos indicadores da homologação geral (sem editar processos)
- Auditoria read-only do Neon QA encontrou 8 processos e 11 guias; 1 processo legado com `status=analise_tecnica` porém `triage_status=recebido`, pasta de Triagem e `analysis_started_at=NULL`. O RPC `start_process_analysis` exige `process_technical_release_verified_v1` e área correta; não foi comprovado bypass. Registro original preservado para conferência municipal.
- Corrigido o Dashboard e a Visão Geral municipal na mesma branch QA: **Concluídos = somente `arquivado`**; `deferido`/`indeferido` são decisões, não arquivamento. **Em análise = status técnico com triagem concluída**. Divergências permanecem visíveis em aviso/indicador próprio, sem reclassificar nem alterar a fonte de dados no banco.
- Os painéis executivo, analista, prefeitura e filtros municipais compartilham as funções puras de verdade operacional; casos de triagem divergente recebem prioridade de conferência. Regressão nova incluída no gate da Prévia QA.
- Esta correção é de apresentação e prevenção de falsa conclusão: não constitui certificação de banco real, IA geométrica ou legislação. Nenhum merge em `main`, nenhum SQL de escrita ou publicação no domínio oficial.


## 10/11/2026 — colisão de protocolo entre municípios: correção de isolamento da navegação
- Auditoria read-only Neon QA confirmou duas linhas reais com `protocol_number=PM-2026-00001`, cada uma com `municipality_id` e `id` distintos. Isso é esperado para sequência municipal, mas a URL anterior `/processos/PM-2026-00001` abria o primeiro registro encontrado na lista combinada, potencialmente o processo de outro município para Master.
- `buildProcessIdentityRouteKey` agora combina número legível com UUID imutável; `buildProcessPath` usa a chave inequívoca. `resolveProcessRoute` valida tanto o ID quanto o prefixo e **não abre nenhuma linha** se um link legado de número único for ambíguo. URLs existentes sem colisão e URLs por ID permanecem válidas. A página de detalhes normaliza a rota canônica sem alterar os dados, a numeração oficial, a RLS ou permissões.
- Testes abrangem a colisão efetiva `PM-2026-00001` em dois municípios, ordem invertida e URL com prefixo fraudado. Suíte incluída no gate Preview QA. Sem merge na `main`, sem alterações no Neon e sem deploy oficial.

- Complemento: o refetch silencioso em `loadProcessRowsForStore` também reconhece a chave composta e busca por UUID (não pelo número duplicado); valida o prefixo antes de mesclar uma linha fora do conjunto ativo. O carregamento normal de dados e documentos continua sob RLS. Regressão cobre a correspondência entre gerador de URL, resolução e busca remota.

- O Quality Gate completo detectou contrato legado exigindo URL sem UUID literal (1 falha entre 1771 testes). A rota foi refinada com token base-36 compacto reversível, que mantém o protocolo legível, sem mostrar o UUID bruto; o token nunca autoriza acesso (RLS permanece obrigatória). O teste canônico foi atualizado para validar ausência de UUID em claro, além dos testes de isolamento de tenant. Reteste completo obrigatório antes de certificação.


## 10/11/2026 — intervenção de segurança e integridade efetivamente aplicada no Neon QA
- Falha raiz confirmada por leitura das RPCs reais: `set_process_status` permitia rebaixar `arquivado` por atualização genérica e finalizar Habite-se sem chamar `complete_habite_se_process_v1`; `reopen_process` ainda admitia `prefeitura_admin` na autorização apesar de este ser um perfil consultivo.
- Migração versionada `neon/migrations/20261110_closed_process_lifecycle_guard_v1_qa.sql`: a RPC genérica trava a linha `FOR UPDATE`, proíbe rebaixamento de arquivo, nega escrita ao administrador municipal e obriga a conclusão do Habite-se pela RPC assinada e financeira. `reopen_process` exige ator, motivo e autorização e registra histórico/movimentação/auditoria; uma marca transacional ativa trigger de invariantes em `processes`.
- **Aplicada de verdade exclusivamente na branch de dados Neon QA** `br-solitary-sound-b4xlbvs6`, database `sigapro_migration_stage_20260923`. Compilação das quatro alterações validada primeiro em uma transação integralmente revertida; execução atômica aplicada; `pg_trigger` confirmou `trg_guard_archived_process_transition_v1` habilitado.
- Teste negativo **real no Neon QA**, sem manipular processos: criada tabela temporária com `arquivado` e timestamp, ligada ao trigger verdadeiro. Tentativa de mudar `arquivado` para `deferido` resultou em `42501`; tentativa de apagar `archived_at` resultou em `23514`. Teste concluiu `SIGAPRO_QA_ARCHIVE_GUARD_NEGATIVE_TESTS_PASSED_ROLLBACK`; a transação e tabela temporária foram revertidas.
- Testes de regressão adicionados em `src/test/closedProcessLifecycleQa.test.ts` e ao gate de build da prévia QA. **CI `42839478470`: 326 arquivos e 1777 testes aprovados;** validação Neon CI `42839478484` e OCR isolado `42839478376` aprovados. São provas de código, e não homologação bancária ou jurídica.
- Perfil financeiro: `sigapro_qa_webhook_worker` tem privilégios restritos e sem acesso direto às tabelas financeiras; o papel histórico chamado `sigapro_prod_webhook_worker` copiado na branch QA ainda contém grants de `neon_superuser`, mas foi verificado sem senha PostgreSQL (`pg_authid.rolpassword IS NULL`), autenticação Neon `no_login` e sem sessões ativas. Um `ALTER ROLE` direto foi **negado por falta de ADMIN OPTION**; não foi adulterado o papel. Em `production`, o papel homônimo tem privilégios restritos e não herda `neon_superuser` nesta leitura.
- Evidência financeira QA prévia preservada: **1 liquidação Mercado Pago sandbox** com webhook assinado, correspondência de guia/valor e metadados de SHA do PDF; existe evento reprocessado mas marcado `verified_manual_review`. Não declarar conciliação automática universal ou dinheiro efetivamente recebido.
- **Dado legado preservado**: Habite-se assinado e emitido tem movimentação de arquivamento em 19/10, porém `processes.status=deferido`, atualizado em 22/10, e não possui reabertura formal. A proteção evita novas regressões, mas não legitima alteração retroativa de estado. Regularização deve ser feita pelo fluxo e perfil municipal autenticado, com evento real e auditoria.
- O cadastro jurídico oficial e a georreferência não receberam validação municipal automática. Sem lei homologada e GIS/lote referenciado, nenhuma IA pode emitir parecer de conformidade legal. Não foram realizados PIX real, alteração do banco de produção, arquivos R2 ou merge na `main`.
- Os **10 itens do aceite comercial** seguem pendentes de provas por sessão real e responsáveis externos; este relatório não marca aceite artificialmente. Publicação desta atualização para a **Prévia QA exclusivamente**, nunca `sigapromunicipal.com.br`.


## 10/11/2026 — desbloqueio efetivo da reconciliação da Triagem na QA
- Diagnóstico real: o painel do Protocolo possuía um ramo de consulta que retorna imediatamente para `prefeitura_admin`, mas a ação «Devolver à Triagem com auditoria» estava condicionada somente a esse perfil; assim, era **inacessível aos servidores operacionais**. A RPC `reconcile_unreleased_process_triage_v1` autorizava o administrador e negava o Protocolo. Não alterar processo legado silenciosamente.
- Migração de autorização `neon/migrations/20261110_triage_recovery_authorized_protocol_v1_qa.sql` **aplicada de verdade na branch Neon QA**, preservando guarda de identidade, município, protocolo oficializado, motivo mínimo, `FOR UPDATE`, inexistência de despacho/planilha/exigência e transação com auditoria + movimentação. Somente `Master` ou **servidor interno lotado no Protocolo** podem regularizar; administrador municipal é explicitamente negado.
- Interface `src/pages/saas/ProtocolDeskPage.tsx` agora exibe a regularização na área operacional ao responsável pelo processo/Master, não no painel consultivo; valida a seleção autorizada e motivo antes da RPC. Regra SQL continua sendo fonte de autorização. Regressão `src/test/qaTriageAuthorizedRecoveryQa.test.ts` incluída no gate Preview.
- Prova transacional diretamente na QA: `prefeitura_admin` com identidade Neon ativa foi recusado; com identidade `admin_master` ativa, o RPC efetivamente alterou o processo legado para `triagem` e gerou `process_audit_entries` e `process_movements`, sem modificar guias ou documentos. No fim, lançada a exceção de ensaio `SIGAPRO_TRIAGE_ADMIN_BLOCKED_AND_MASTER_RECONCILIATION_PASS_ROLLBACK` e verificada **reversão completa**: a linha original continua em análise divergente e tem 0 eventos de reconciliação persistidos. Isto comprova a função, não representa um aceite formal ou autorização para corrigir processo real em nome de outra pessoa.
- Nenhuma modificação da `production`, nenhum PIX real, nenhuma informação jurídica inventada.


## 10/11/2026 — candidato a liberação comercial controlada: provas Neon/R2 e cadeia de evidência
- **OBJETIVO:** preparar release candidato de QA sem alterar `main`, domínio oficial ou Neon production; jamais classificar produção como pronta enquanto evidências obrigatórias faltarem.
- **Habite-se real com rollback:** identidade Neon Master autenticada, `complete_habite_se_process_v1` validada com um processo que tem Alvará emitido. A transação transitou para `arquivado`, gerou carimbo de data, `process_movements` e `process_audit_entries` correspondentes; *rollback integral confirmado*, sem falsa atualização histórica.
- **Isolamento Neon QA ampliado:** duas contas reais de analistas de dois municípios, papel PostgreSQL `authenticated`, verificadas seis relações: `processes`, `payment_guides`, `process_documents`, `process_audit_entries`, `process_movements` e `signature_blocks`. Cada identidade enxerga processo próprio; nenhuma linha estrangeira acessível; ensaio transacional sem persistência.
- **Original DAM read-only:** a autorização `authorize_payment_guide_original_read_v1` na QA permite o PDF original ao analista municipal correto, recusa o município diferente e recusa chave alterada. A nova migração `neon/migrations/20261110_original_pdf_signing_strict_tenant_v1_qa.sql` exige município+tenant+processo coerentes e a chave canônica SHA-256 do PDF original antes de liberar URL assinada. Aplicada e testada na QA sem tocar o arquivo/guia; `src/test/qaOriginalPdfCanonicalAuthorization.test.ts` incluído no build.
- **Conciliação bancária QA de evidência existente:** `mp_qa_webhook_settle_v1` com registro assinado de pagamento sandbox devolveu `already_settled_qa` em duas repetições e não duplicou a evidência; centavo divergente e município distinto voltaram `manual_review`. Isso confirma idempotência do registro existente, **não** liquidação monetária de produção nem novo Pix gerado no ensaio.
- **R2 preview autenticado:** `server/api/r2-upload.ts` e `server/api/r2-delete.ts` exigem autenticação em Preview e produção, mesmo com override legado `R2_REQUIRE_AUTH=false`; desenvolvimento local só libera exceção explicitamente. Regressão incluída no gate QA.
- **Regression de segurança alinhada:** `src/test/r2UploadAccessSecurity.test.ts` previa incorretamente upload/delete sem autenticação em Preview. Atualizado para exigir autenticação em todos os deployments, com opt-out explícito somente em ambiente `development`; adicionado `src/test/r2ConsolidatedRuntime.test.ts` ao gate Preview para evitar retorno da vulnerabilidade.
- **ALERTA R2:** `R2_BUCKET_DOCUMENTOS`, `R2_BUCKET_LOGOS`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` são configurados como variáveis compartilhadas entre Preview e produção na Vercel. A camada Neon está isolada por branch, **o armazenamento físico R2 não está comprovadamente segregado**. Não prometer operações com arquivos reais de clientes antes de configurar/verificar separação por bucket/conta ou prefixo próprio, sem apagar os objetos existentes. Uma configuração QA de storage de outra branch tem bucket diferente, mas ainda não foi testada para a branch corrente.
- **Proveniência de aceite comercial:** `.github/workflows/qa-commercial-acceptance.yml` agora verifica o commit real do checkout, a ancestralidade na branch QA e, antes de baixar artifact, a execução emissora (`scripts/qa-commercial-evidence-provenance.mjs`) com repositório, branch, SHA e sucesso exatos. `scripts/qa-commercial-evidence-provenance.test.mjs` cobre manipulação de hash, origem, fork, evento e IDs. O aceite formal segue condicionado a revisores reais e aos dez artifacts privados.
- **Bloqueios externos restantes:** recuperação física dos bytes R2 e restauração conjunta banco+documentos, teste completo de pagamento e estorno no provedor, quatro jornadas no navegador com perfis legítimos, legislação/zoneamento municipal oficialmente conferidos, leitura IA em planta real com gabarito. Nenhuma dessas provas foi marcada como aprovada sem execução.


### 10/11/2026 — fechamento do release candidato QA sem falsa aprovação comercial
- O workflow de aceite comercial passou a exigir o **commit atualmente no HEAD da branch QA**, além do código e do artifact de evidências para esse mesmo SHA. Mudança de código invalida aprovações de release anterior; testes Node do verificador foram incluídos também no gate de build Vercel.
- Auditoria Vercel: os nomes e credenciais do R2 institucional continuam como variáveis compartilhadas de Preview e produção. O browser QA dispõe de Auth e Data API Neon QA de endpoint próprio (sem fallback ao banco de produção nas prévias). **R2 precisa ser segregado de verdade**, e o original existente deve ser migrado/validado sem alteração ou exclusão do arquivo histórico. Não configurar bucket fictício nem fazer movimentos cegos em produção.
- Resultados de testes com identidades reais em transações revertidas são comprovações técnicas, não assinaturas comerciais. Falta aceite privado dos dez critérios e homologação operacional autenticada. A QA deste lote está apta para demonstração técnica controlada, jamais para introduzir dados privados de novos clientes sem os controles pendentes.


## 10/11/2026 — última verificação da preparação comercial e do PDF R2
- O endereço FIXO de homologação continua: https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app/acesso. Confirmado que ele aponta para a versão QA, não para a produção.
- Banco QA conferido novamente: 2 prefeituras, 8 processos, 11 guias, 27 anexos válidos e um registro de conciliação Mercado Pago sandbox. **O banco tem 0 evidências legais conferidas (catálogo e escopos) e 0 geometrias de zoneamento e parcela.** Há registros de regras ativas que não equivalem a conformidade legal conferida.
- **Isolamento financeiro preservado:** a primeira execução do leitor R2 encontrou que o login bancário não dispõe de leitura direta nas tabelas municipais. Foi criada no Neon **somente de QA** a função `qa_r2_original_integrity_probe_v1()`, sem parâmetros, que devolve metadados de apenas um original DAM já liquidado no Mercado Pago sandbox; a função só pode ser executada pelo worker de teste e pelo proprietário do banco, e não modifica nenhum dado. O worker continua sem `SELECT` direto sobre `payment_guides`, `processes` ou evidências. Migration: `neon/migrations/20261110_qa_r2_original_probe_least_privilege_v1.sql`. O roteiro de inspeção agora usa exclusivamente essa função.
- Novo diagnóstico de integridade física: `scripts/qa-r2-original-bytes.mjs`, executado pelo gate Vercel exclusivamente na branch QA. Conecta ao banco QA apenas por SELECT, compara identidade do endpoint PostgreSQL ao endpoint Data API QA e baixa **um** original DAM do R2 via GET, computando SHA-256 em memória (máximo 25 MB). Nunca registra PDF, chave de objeto, login, credenciais, município ou dados pessoais. `PASS` confirma os bytes do objeto amostrado; `NOT_VERIFIED_*` não é aprovação; `INTEGRITY_MISMATCH` interrompe a publicação. Não prova restauração de backup nem segregação física de todos os objetos.
- Segurança: **nenhum aceite comercial é inferido** do sucesso de um build. Antes de receber cliente com processo, documentação e pagamento reais, seguem obrigatórias: isolamento físico comprovado do R2, restauração conjunta Neon+R2, jornada real E2E por perfil, demonstração com planta verdadeira/gabarito técnico e leis oficiais com escopos, e prova bancária integral por provedor habilitado. A produção continua intocada.


### 10/11/2026 — diagnóstico refinado para conferência do arquivo R2
- A primeira execução de `scripts/qa-r2-original-bytes.mjs` detectou corretamente ausência de permissão de SELECT ao banco para o worker, sem ampliar seus privilégios.
- Criada e executada em Neon QA a função read-only de uma linha `qa_r2_original_integrity_probe_v1`; comprovado que `sigapro_qa_webhook_worker` consegue executar essa função, mas tentativa direta de `SELECT public.payment_guides` recebe SQLSTATE **42501**, sem vazamento.
- Na segunda execução o passo de banco passou, mas a leitura do objeto S3 ainda retornou `NOT_VERIFIED_STORAGE`; **não há comprovação do conteúdo físico da DAM**. O código agora classifica com segurança ausência do objeto, credenciais recusadas ou indisponibilidade, sem mostrar informações de acesso ou identidade.
- Esta publicação de homologação é exclusivamente candidata a demonstração com dados fictícios; não substituir o PDF arquivado por outro arquivo, não ativar banco real e não liberar processos municipais reais sem integridade documental, backup, legislação e conciliação comprovados.


## 10/11/2026 — correção da causa de falha na DAM original em tamanho real
- Diagnóstico no código: `renderGuideOriginalPdf` mantém página A4/PNG em escala 3 para preservar QR e brasão. Quando o PDF supera o upload HTTP inline de 2,5 MB, o roteamento anterior tentava um multipart que **recusava o caminho imutável `dam-originals/`**, impossibilitando arquivar guias maiores.
- Correção integrada, sem reduzir resolução: `src/integrations/r2/processChunkUpload.ts` e `server/api/r2-process-proxy-upload.ts` agora aceitam SOMENTE a chave canônica `municipalities/<município>/processes/<processo>/dam-originals/<guia>/<sha256>.pdf`; upload em blocos até 25 MB, com hashes individuais e hash integral, validação de PDF, recusa de troca de conteúdo e autorização separada via `authorize_payment_guide_original_upload_v2`. Qualquer guia já paga, sem snapshot ou sem permissão é recusada antes da escrita; os demais anexos continuam com a política por papel/proprietário.
- `server/dam-original-integrity.ts` verifica o **objeto S3 realmente recuperado**, além de HEAD, tamanho/MIME/SHA e bytes PDF. O `server/api/r2-upload.ts` só confirma DAM original após essa prova em R2 ou BYOS, inclusive retries 412; anexos pequenos também precisam de HEAD que confirme tamanho/MIME.
- Os testes `src/test/qaDamOriginalIdempotency.test.ts`, `src/test/qaLargeDamOriginalUpload.test.ts` e as suites de upload/autorizações estão no gate do Preview. **Build verde prova o código, não comprova banco real ou recuperação de objetos antigos.**
- O PDF de uma guia sandbox já marcada arquivada retornou `NOT_VERIFIED_STORAGE_MISSING` na leitura física do bucket R2 configurado. Não apagar a referência histórica ou alterar o conteúdo para esconder o problema; a recuperação exige localizar os bytes originais em backup ou outro bucket/conta autorizada, preservando hash e trilha de auditoria. Não atribuir a arquivo ausente o status de restaurado.
- Não migrar nem liberar a produção enquanto a evidência de armazenamento independente, resgate Neon+R2, credenciais bancárias reais, sessões por perfil e a matriz urbanística oficial conferida não estiverem completas.


## 10/11/2026 — fechamento de brechas da GUIA no portal externo (candidato de uso real)
- **Falha descoberta**: `ExternalPaymentsPage.tsx` abria um HTML pagável temporário por `openGuiaRecolhimentoOficialWindow` na produção, sem o contrato de arquivamento obrigatório Neon→PDF R2/S3. A homologação explicitamente fictícia pode continuar abrindo prévia `NÃO PAGAR`, mas produção agora chama `readGuideOriginal` e `archiveAndOpenGuide` para abrir **exclusivamente a DAM oficial autenticada e persistida**. Um documento original existente é reaberto antes de chamar o banco, sem gerar segunda ordem. Guia quitada sem PDF não é recriada.
- `src/lib/guideOriginal.ts`: aceita boleto registrado sem PIX somente quando número da ordem, código de barras e linha digitável impressos coincidem exatamente com o retorno autorizado, persistido no Neon para provedor Mercado Pago em produção. Rejeita código inválido, provedor manual, divergência de valor, ambiente de teste e PIX malformado. A tela externa NÃO cria QR PIX a partir de uma chave estática municipal em uma cobrança bancária; para PIX real é preciso garantir ordem/provider/valor/baixa com o mesmo nível de prova.
- `ProcessDetailPage.tsx`: consulta primeiro o documento original no Neon. O PDF anexo legado não pode mascarar uma guia compensada ou substituir o original de um boleto. A compatibilidade antiga é consultada somente para arrecadação do sistema municipal próprio, sem gerar cobrança concorrente.
- `scripts/qa-r2-original-bytes.mjs`: a auditoria R2 diferencia objeto ausente, bucket ausente e hash/chave física divergente, usando só operações S3 de leitura, sem vazar nome de arquivo/chave/segredo. O original do sandbox anteriormente falhou `NOT_VERIFIED_STORAGE_MISSING`; o novo diagnóstico refina a causa, **não pode recriar automaticamente o documento pago**.
- Legislação pública fonte-primária registrada em `docs/BASE_LEGAL_CAMPO_LIMPO_PUBLICACAO_2026.md`: Prefeitura e Câmara apontam LC 379/2009, Prefeitura e Imprensa Oficial LC 613/2023, mas o portal também lista **propostas de minutas não promulgadas**. A IA não pode tratar as propostas como regras vigentes; segue faltando validação legal, georreferenciamento por lote e projeto com medidas auditáveis.
- Testes de regressão `src/test/realBankDamOriginalGate.test.ts` e `scripts/qa-r2-original-bytes.test.mjs` integrados ao gate QA. **Este release não autoriza produção: testes reais de cobrança+liquidação, estorno, restauração Neon/R2, papéis no navegador e legalidade por imóvel seguem obrigatórios.**


## 10/11/2026 — vínculo definitivo da DAM externa e assinatura após SHA
- Ajustado `ExternalPaymentsPage.tsx`: em produção, não entrega mais HTML avulso com código pagável. A abertura oficial lê o guia do Neon, reabre o original persistido sem criar outra ordem no banco, ou gera e arquiva via `archiveAndOpenGuide` antes da visualização. Ao falhar fecha a aba reservada e informa o motivo na interface. Apenas QA mantém prévia expressamente NÃO PAGÁVEL.
- Corrigido `ProcessDetailPage.tsx`: original canônico vem antes do eventual PDF legado; qualquer marcador de quitação (`paid` ou status homologado) sem original bloqueia recriação. PDF legado fica restrito à opção de arrecadação própria da Prefeitura.
- `src/lib/guideOriginal.ts` suporta boleto legítimo sem PIX se ordem, valor, barcode e linha digitável coincidirem com registro bancário de produção no Neon. PIX estático construído a partir de preferências da Prefeitura não é usado para representar a ordem Mercado Pago. PIX real exige sua própria ordem autenticada.
- `server/api/r2-sign-get.ts` exige **HEAD + GET integral + SHA-256** antes de assinar uma URL para PDF original DAM, tanto no R2 institucional quanto no BYOS municipal; impede uso de bucket de logos/avatares para guias. O restante dos documentos mantém a leitura normal por papéis/RLS.
- A inspeção QA de S3 classifica **bucket ausente**, **objeto ausente** e **arquivo sob outro SHA** sem exibir dados pessoais e sem alterar nenhum objeto.
- Novas regressões `src/test/realBankDamOriginalGate.test.ts`, `src/test/r2DamSignedByteIntegrity.test.ts` e extensão de `scripts/qa-r2-original-bytes.test.mjs`. Integram o gate de prévia.
- Fontes legais oficiais e diferença entre **lei promulgada** e **minutas propostas** em `docs/BASE_LEGAL_CAMPO_LIMPO_PUBLICACAO_2026.md`. Lei oficial não foi ativada sem evidência jurídica ou topologia cadastral.
- **Atenção**: a referência de um PDF antigo pago no QA está sem objeto comprovado. A proteção nova impede novos falsos sucessos, mas o registro histórico só pode ser recuperado de backup/autorização real sem forjar seus bytes. O aceite de produção continua pendente dos testes de caixa, banco, mapa oficial, quatro perfis e recuperação Neon+R2.


## 10/11/2026 — validação final da integração financeira
- `SIGAPRO Quality Gate` executou o typecheck da primeira versão e detectou identificadores duplicados `barcode` e `digitable_line` no tipo de `src/lib/guideOriginal.ts`. Erro corrigido removendo declarações redundantes; os campos originais já existiam.
- Correções unificadas permanecem restritas à branch QA e PR #118. A rotina de recuperação de R2 apenas DIAGNOSTICA os objetos antigos, não modifica documentos nem produz novas guias.
- Condição de aceite: nova execução da PR aprovar TypeScript, ESLint, testes gerais, segurança e build, além de preview READY no link fixo. Para produção comercial permanecem necessários teste bancário autêntico e comprovado, restauração de R2, zoneamento georreferenciado e matriz jurídica conferida com responsabilidade municipal.


### 10/11/2026 — alinhamento do gate completo de testes
- A bateria GitHub do candidato anterior aprovou 1807 testes e reprovou 1 teste textual legado que exigia a expressão `pixPayload: isolatedQa ? ""` na página externa. O código reforçou o bloqueio de PIX estático para todas as cobranças bancárias; o teste obsoleto foi atualizado para exigir a regra mais segura, preservando a prévia QA não pagável.
- O TypeScript e os testes focados da Vercel passaram; a auditoria física da DAM histórica identificou `NOT_VERIFIED_ORIGINAL_OBJECT_MISSING`: **bucket existe, referência SHA canônica não tem objeto**, sem recuperar o conteúdo. Isso exige backup/origem autorizada; jamais regenerar uma guia paga e chamá-la de original.
- Nova publicação exige validação completa no mesmo HEAD; manter PR #118 Draft e produção intocada até aceites reais.


## 10/11/2026 — integração de emissão real do boleto e separação de leitura
- A rotina `createMercadoPagoGuideBoleto` possuía uma saída fixa para ambiente de produção e usava apenas pagador fictício de sandbox. Foi implementada a preparação de **pagador real**, conforme campos de `payer` na documentação oficial de boleto Mercado Pago Orders: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/boleto.
- `server/mercadopago-payer.ts`: exige CPF/CNPJ verdadeiro com dígitos verificadores e nome completo provenientes exclusivamente da guia protegida em Neon. O formulário fornece somente e-mail e endereço de cobrança com CEP, rua, número, bairro, cidade e UF, sem sobrescrever o titular no banco. Não imprime os dados nos logs.
- `server/mercadopago.ts`: registra a ordem de produção **apenas** quando o runtime é `VERCEL_ENV=production`, existe vinculação municipal e bancária de produção, chave de assinatura bancária válida e a variável `SIGAPRO_PROD_BANK_CHARGES_ENABLED=true` foi explicitamente aprovada/configurada. Nenhum desses requisitos é preenchido automaticamente na QA. Mesmo com isso, exigir teste monetário controlado, webhook, estorno e backoffice antes de usar clientes.
- `api/mercadopago.ts` encaminha o pagador como objeto não confiável até a validação no servidor. `src/components/platform/RealBoletoPayerDialog.tsx` apresenta o formulário acessível, e `src/pages/saas/ExternalPaymentsPage.tsx` oferece botão separado `Emitir boleto oficial`. Clicar em **Visualizar guia** nunca emite uma ordem: consulta Neon e reabre o original S3 ou o arquiva em operação distinta.
- `ProcessDetailPage.tsx` não chama mais `ensureMercadoPagoGuideCharge` ao visualizar a guia, evitando cobranças implícitas e abas em branco se faltam dados. A preparação visual de logotipo permanece.
- `src/test/realBoletoIssuanceBoundary.test.ts` e `guideOpeningExperience.test.ts` cobrem CPF inválido, documento divergente, endereço/email incompleto, permissão de produção, guia de prefeitura própria, fluxo de emissão explícita e proibição de cobrança na leitura. Integrados ao gate Vercel QA.
- O R2 institucional segue com um original histórico de sandbox não localizado: **não modificar o registro do banco nem substituir por arquivo diferente do SHA**. A investigação continua por chaves compatíveis e backups auditáveis.
- PR #118 continua em rascunho no mesmo repositório e branch QA; **nenhuma promoção/alteração de produção foi realizada**.


### 10/11/2026 — validação do novo formulário real de boleto
- Teste de preview da primeira compilação detectou uma regra de ESLint `no-control-regex` no sanitizador da identificação do pagador; corrigido com verificação explícita de códigos de caracteres, sem relaxar os critérios.
- Interface de pagamentos usa formulário próprio com dados obrigatórios do pagador; guia oficial só é emitida após comando explícito. `ProcessDetailPage` não faz POST ao banco ao visualizar DAM.
- O backend usa o nome e CPF/CNPJ registrados no Neon e rejeita documentos com dígitos verificadores inválidos, dados conflitantes, CEP/UF incompletos e sessões não autorizadas.
- Ativação de produção bancária exige autorização operacional separada `SIGAPRO_PROD_BANK_CHARGES_ENABLED=true`, Vercel PROD, credenciais próprias da Prefeitura de produção e assinatura bancária; **nenhuma dessas condições é presumida por build aprovado**.
- Esta documentação apenas acompanha o release QA. Sem alteração de produção, nenhuma emissão bancária real foi provocada.


## 10/11/2026 — PIX e boleto de sandbox passam a funcionar na Vercel QA
- **Causa do erro nas prévias:** o cliente apontava `/api/qa/mercadopago/guide-boleto` e `/api/qa/mercadopago/guide-pix` para rotas que existiam exclusivamente no `vite.config.ts` local; o `vercel.json` não as publicava.
- Corrigido o roteamento `vercel.json` para a função consolidada `api/mercadopago.ts` (`qa-boleto`, `qa-pix`), sem aumentar a quantidade de funções do plano Vercel.
- `server/qa-hosted-bank-guard.ts` exige `VERCEL_ENV=preview`, a branch QA exata, flag Neon isolado e identidade PostgreSQL compatível com a Data API QA. Ambiente de produção e preview aleatório são bloqueados. Os emissores exigem autorização municipal do guia e credencial Mercado Pago de **teste**, nunca da conta real.
- PIX de teste hospedado precisava de persistência durável: substituído o uso de pasta local efêmera na Vercel por tabela `qa_pix_sandbox_orders_v1` na branch Neon QA e função `qa_pix_sandbox_order_v1` EXECUTE exclusivamente por `sigapro_qa_webhook_worker`/owner. O mesmo login não possui SELECT direto na tabela; RLS ativo e revogação de PUBLIC, anonymous, authenticated.
- O banco mantém para cada guia a mesma chave de idempotência, valor, referência da order e QR de sandbox. Ao repetir o pedido, consulta a ordem existente ou usa a mesma chave idempotente; nunca troca uma ordem por outra. O fluxo local 8081 continua com arquivo local isolado.
- Migration `neon/migrations/20261110_qa_hosted_pix_orders_durable_v1.sql` aplicada SOMENTE no Neon QA. Verificados: worker possui EXECUTE, anônimo não, e worker não possui SELECT direto na tabela. A produção não foi alterada.
- `src/test/qaHostedBankPaymentRoutes.test.ts` verifica vínculo de branch/Neon, roteamento real Vercel, persistência da order, proibição de acesso amplo e separação entre cobrança real e sandbox. Incluído no gate Preview.
- **Não há confirmação de transação bancária real nem de restituição do objeto histórico ausente** apenas com testes automatizados: para isso ainda são necessárias evidências externas; não alegar aceite comercial sem elas.


## 10/11/2026 — revisão de regressão da emissão explícita
- O candidato QA prévio publicou READY e o mesmo endereço fixo apontou para o commit correto; consulta GET em ambas as rotas recém-publicadas de sandbox `/api/qa/mercadopago/guide-pix` e `/api/qa/mercadopago/guide-boleto` retornou HTTP **405** JSON padronizado (antes eram rotas inexistentes na Vercel). A primeira versão teve 4 arquivos de testes legados reprovados (9 casos) porque exigiam emissão financeira automática durante a visualização e mensagem antiga de localhost.
- Testes `server/qa-mercadopago-pix.test.ts`, `src/test/qaBoletoEndToEnd.test.ts`, `src/test/issuedIssGuideFollowUp.test.ts`, `src/test/municipalBankingFlow.test.ts` foram alinhados à nova regra: operação de boleto real **somente mediante confirmação explícita do pagador**; visualização não cria ordem; QA hospedado em branch e banco isolados, além de localhost isolado.
- A validação subsequente executa pipeline completo e publicação de Preview; produção segue intocada.


## 10/11/2026 — aceite técnico do isolamento PIX em Neon QA
- Com a última migração QA implantada, a função `qa_pix_sandbox_order_v1` foi executada **com o login real** `sigapro_qa_webhook_worker` para consulta de guia real elegível de sandbox, retornando ausência de recibo (comportamento esperado); tentativa de `SELECT` direto em `qa_pix_sandbox_orders_v1` foi recusada pelo banco. Execução de `reserve` com a guia QA elegível foi testada em uma transação forçada a rollback por sentinela; a sentinela foi confirmada e a tabela manteve **0 linhas**. Nenhuma ordem bancária foi emitida no ensaio de permissão.
- O hardening final exige usuário do banco `sigapro_qa_webhook_worker`, nome do DB QA, `sslmode=require/verify-full`, marcador da mesma Data API Neon e branch Preview exata. Variáveis `SIGAPRO_LOCAL_QA_LAUNCH` não autorizam ambiente Vercel Preview arbitrário.
- O roteiro GitHub completo identificou 2 verificações textuais remanescentes do fluxo de emissão automática removido; foram alinhadas para exigir o botão de emissão explícita com número/valor da guia persistida no Neon.
- Mercado Pago Orders Boleto: validado o formato da chamada de produção com campos `payer`, `config.location.state_id`, `payment_method` e `X-Idempotency-Key` conforme documentação pública oficial. Não habilita dinheiro real neste release QA.


## 10/11/2026 — leitura multibanco CNAB240 integrada na administração (QA)

- **Implementado de fato na branch única QA:** `server/bank-return-cnab240.ts` lê retorno FEBRABAN CNAB240 em memória, checa banco da Prefeitura, tamanho fixo de 240 posições, cabeçalho/trailer, sequências T/U, movimento, centavos exatos, calendário, hash da leitura, classificação consultiva e duplicidade estrutural. **Não altera guias, status, protocolo ou arrecadação.**
- Layouts com leitura T específica: **Santander 033 H7815 v8.3 (abril/2025)**, posições T Nosso Número 41–53, valor 78–92, uso do beneficiário 101–125, e U valor pago 78–92, líquido 93–107; **Banrisul 041 CNAB240 v10.3 (outubro/2024)**, T Nosso Número 38–57, valor 82–96, identificação do título 106–130, U valor pago 78–92, líquido 93–107. Layout de convênio e autenticação exigem conferência real. Outros bancos não têm campos T específicos reconhecidos: a pré-conferência genérica não pode inferir identificadores.
- Fontes primárias dos leiautes: https://cms.santander.com.br/sites/WPS/documentos/arq-layout-de-arquivos-download-cob240ptbr/25-06-13_130421_cnab-240-abril-2025-ptbr.pdf e https://www.banrisul.com.br/BOB/data/LeiauteBanrisulFebraban_pdr240_v103_09102024.pdf.
- Ação segura `bank_return_preview` de `api/collection-configuration.ts` exige sessão autenticada e autorização do próprio município para configuração e detalhes bancários, recusa arquivo de outro banco, limita a carga a 600KB, e opcionalmente compara com **guia canônica do Neon** via `readStoredGuide` (jamais valor/identidade fornecidos arbitrariamente pelo navegador).
- **Interface unificada** em **Administração → Guias e Arrecadação → Dados bancários**: `BankReturnPreviewPanel.tsx` substitui a apresentação duplicada do leitor local `MunicipalBankFileInspector` na tela, sem remover a biblioteca local. Um único seletor lê no navegador **OFX, CNAB240 e CNAB400** (sem upload); a opção explícita **Conferir CNAB com Neon** envia CNAB240 limitado e opcional número de guia para validação protegida no servidor. Exibe resumo, divergências, hash e aviso de ausência de baixa. Nenhum arquivo é arquivado pelo novo endpoint; usuário deve preservar o original bancário para auditoria.
- Testes `server/bank-return-cnab240.test.ts` e `src/test/bankReturnPreviewIsolationQa.test.ts` cobrem Santander/Banrisul, banco trocado, T/U soltos, repetições, valores/datas inválidos, permissões e proibição de baixa. A classificação `possible_liquidation` **NÃO equivale a crédito comprovado**.
- **Diferença essencial:** leitura de retorno não é integração de emissão nem pagamento real. Não foi instalado falsamente adaptador de Santander/Itaú/GOVBR nem usado segredo bancário de produção. Baixa automática continua dependente de provedor assinado, vínculo da guia, PDF original, crédito verificável e rotina SQL idempotente.
- Produção `main`, Neon production, credenciais bancárias e pagamentos reais **não foram modificados** neste trabalho. Publicar no Preview QA exclusivamente com CI verde no SHA exato; não afirmar homologação comercial ou liberar pagamento real com base nesta leitura.

- **Gate Vercel:** a prévia desta revisão deve ser acionada com o marcador `[deploy-qa]` no commit conforme o Ignored Build Step do projeto; a tentativa sem marcador é cancelada intencionalmente. O código já foi validado em Quality Gate na branch QA, sem alterar produção.

- Consolidação final da interface: `MunicipalBankDetailsSettings.tsx` contém o único leitor bancário; o cartão duplicado foi removido de `MunicipalCollectionSettings.tsx`. Teste de isolamento e fluxo foi atualizado para exigir essa disposição. Versão liberada somente em Preview com marcadores explícitos e gates aprovados; não habilitar produção financeira automaticamente.


## 10/11/2026 — GOVBR/AR preparado para integração GET sem API pública documentada

- **Identificação correta:** GOVBR — GovernançaBrasil Administração de Receitas (AR), solução municipal terceirizada, NÃO confundir com GOV.BR federal ou GOB Soluções. Não há endpoints bancários oficiais confirmados para supor rotas.
- **Implementação QA:** `server/govbr-ar-readonly.ts` — conector de diagnóstico estritamente GET; URL informada pela prefeitura, domínio limitado a `govbr.com.br` ou `govbr.cloud`, HTTPS e porta 443, caminho GET declarado, autenticação Bearer ou X-Api-Key, sem redirecionamento, timeout de 8s e corpo JSON no máximo 64KiB. O conteúdo bruto não é retornado, logado nem gravado; somente metadados de formato/campos/contagens.
- **Isolamento:** `api/collection-configuration.ts` ação `govbr_read_preview` usa exclusivamente a configuração mais recente com `municipality_id` e `supplier_code=govbr_ar` autorizada via RPC `get_municipal_collection_secret_admin_v1`. Chave cifrada no Neon, descriptografada somente no backend; URL/credencial do navegador não são aceitas no teste.
- **Configuração:** `MunicipalCollectionSettings.tsx` permite salvar URL, cabeçalho de autenticação, rota GET e segredo por prefeitura, em modalidade `municipal_system / automatic` de homologação ainda INATIVA, com botão explícito de teste de GET. O banco já bloqueia ativação de todos os fornecedores municipais automáticos; o conector só declara `operations=[query]`, sem emissão, PDF ou baixa.
- **Contrato GOVBR pendente:** somente com URL real, documentação de GET/autenticação e credenciais de homologação da prefeitura será possível fazer o teste remoto. SOAP/mTLS/OAuth, emissão de DAM, PIX/boleto, geração de PDF e baixa exigem documentos e adaptadores específicos da GOVBR. A simples inserção de uma chave não faz esses fluxos funcionarem.
- **Testes:** novos `server/govbr-ar-readonly.test.ts` e `src/test/govbrArApiIsolationQa.test.ts` cobrem hosts perigosos, segredo em header, JSON sem dados pessoais, proibição de redirecionar, falta de autenticação, limitações, inatividade financeira e isolamento.
- Manual de solicitação/ativação: `docs/GOVBR_AR_API_PREPARACAO_QA.md`. Nenhuma chave de API real foi adicionada e nenhuma guia, arrecadação ou dado da produção foi alterado.

- Prévia QA da preparação GET GOVBR/AR: executar `npm run build`, Quality Gate, validação Neon e OCR isolado no commit marcado `[deploy-qa]`. Nenhum segredo GOVBR foi fornecido ou injetado. A ativação automática permanece negada pela RPC Neon. 

- **Separação absoluta:** a ação GOVBR/AR de teste recusa qualquer configuração com `environment=production` quando executada na Vercel Preview. Não testar credenciais de produção do fornecedor pela homologação QA. Nenhum evento financeiro é gravado pelo teste.
