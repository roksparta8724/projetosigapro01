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
