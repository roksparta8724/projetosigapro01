# SIGAPRO — STATUS ÚNICO E PLANO DE ENTREGA
> Atualizado em **04/11/2026**. Este documento é a **fonte oficial de continuidade do desenvolvimento**. Mantenha-o sincronizado após cada alteração relevante. Nunca dependa exclusivamente do histórico de conversas do ChatGPT.

## Ambientes, links e escopo
- **Repositório:** https://github.com/roksparta8724/projetosigapro01
- **Ramificação ÚNICA de trabalho e homologação:** `fix/qa-triagem-analise-pagamento-20261101`
- **Pull request central de integração e entrega:** https://github.com/roksparta8724/projetosigapro01/pull/117 (**draft**, NÃO mesclar automaticamente).
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
