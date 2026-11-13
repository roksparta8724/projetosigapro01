# SIGAPRO — auditoria de funcionamento real na homologação (08/11/2026)

**Natureza deste relatório:** validação não destrutiva. A existência de uma
página HTTP, de testes unitários ou de uma linha no banco não substitui
um teste operacional autenticado. Nenhum status abaixo constitui
autorização para produção ou homologação comercial.

## Versão e infraestrutura verificadas

- Preview publicado em
  `https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app`
  com SHA `4639cba7bfd0fe9b931d95f36742f46d2de30639` antes desta auditoria,
  `readyState=READY`. PR #118 DRAFT, sem merge.
- Qualidade do SHA publicado: três workflows GitHub concluídos em `success`,
  com 1.642 testes em 294 arquivos. Isso valida a suíte, não usuários reais.
- **HTTP real via Vercel Preview:** GET `/api/health` = 200 e serviço
  `sigapro`; GET `/api/mp-qa-webhook` = 200,
  ambiente `qa` com worker e criptografia configurados (não houve
  transferência bancária). GET nas rotas de upload, exclusão e
  assinatura de documentos = 405, com respostas JSON; tela de
  acesso e subpáginas municipais = 200, com HTML PT-BR.
  O verificador `scripts/qa-preview-live-smoke.mjs` está disponível para
  execução por uma identidade Vercel confiável. O GitHub Runner
  **não** possui autorização de acesso ao Preview protegido:
  em execução real recebeu HTTP 401 antes de alcançar o SIGAPRO,
  inclusive no endpoint de saúde. A tentativa não constitui
  teste funcional aprovado nem falha do aplicativo.
  A checagem foi removida do bloqueio automático do Quality Gate
  (que continuou com TypeScript, ESLint, Vitest, OCR e build).
  As respostas públicas acima foram verificadas por meio da
  **integração Vercel autorizada**. Nunca desativar o acesso
  protegido para fazer o teste passar. Não houve medição de login.
- Vercel Runtime Errors (janela de 24 h): nenhum cluster de erro retornado
  pela consulta; logs individuais de 24h não ficam retidos no
  plano Hobby. A ausência de logs não prova ausência de falhas.

## Neon QA — dados existentes (SELECT somente)

Projeto `red-sunset-21120522`, branch isolada
`br-solitary-sound-b4xlbvs6`, banco
`sigapro_migration_stage_20260923`. Nenhuma escrita efetuada.

| Observação | Resultado |
|---|---:|
| Municípios ativos / total | 2 / 2 |
| Perfis (todos os estados) | 10 |
| Processos | 8 |
| Em análise técnica | 4 |
| Pagamento pendente | 2 |
| Pendência documental | 1 |
| Deferidos | 1 |
| Documentos de processos, com referência no banco | 28 / 28 |
| Guias de recolhimento | 11 |
| Guias com chave e SHA do PDF original registrados | 1 / 11 |
| Fichas de análise técnica persistidas | 0 |
| Execuções de pré-análise urbanística | 2 |

**Importante:** referência de documento registrada ≠ objeto físico
aberto no R2. Uma guia de teste compensada e metadado PDF no banco
não são prova de callback assinado e baixa bancária em ambiente real.

## Matriz de aceite (10 provas obrigatórias)

| Prova | Situação em 08/11 | Evidência necessária para aprovar |
|---|---|---|
| Isolamento multi-Prefeitura | Não comprovado em sessões | Duas sessões simultâneas; leitura e tentativa de escrita cruzadas bloqueadas |
| IA — planta real | Não comprovado | Projeto arquitetônico real com recuos; gabarito de zoneamento, artigo/página e parecer humano |
| PDF DAM original | Não comprovado fisicamente | Mesmo objeto e SHA recuperados diretamente do R2, sem novo PIX |
| Banco / conciliação | Não comprovado ponta a ponta | Ordem sandbox, webhook HMAC válido, valor exato, duplicidade, estorno e histórico |
| Worker bancário com privilégio mínimo | Parcial | QA worker sem BYPASSRLS/CREATEDB/CREATEROLE; conexão efetiva e revisão de credenciais antigas |
| Restauração Neon + R2 | Não comprovado | Restore isolado com contagem, SHA, tempo e relatório |
| Dashboard Master | Não comprovado em navegador autenticado | Navegação completa e permissões |
| Dashboard Admin Prefeitura | Não comprovado em navegador autenticado | Resumo, subpáginas e confirmação de consulta sem edição de processos |
| Dashboard Analista | Não comprovado em navegador autenticado | Documentos, marcações, análise, comunique-se e parecer |
| Portal Profissional Externo | Não comprovado em navegador autenticado | Cadastro, anexos reais, guia, pagamento e retomada |

**Alerta de segurança identificado em leitura de `pg_roles`:**
`sigapro_qa_webhook_worker` está sem `BYPASSRLS`,
`CREATEDB` e `CREATEROLE`; entretanto, existe na cópia QA
um papel legado denominado `sigapro_prod_webhook_worker`
com os três privilégios ativos. **Não modificar cegamente**
as permissões ou credenciais de produção. É necessária uma
revisão específica de dependências e uma janela autorizada
antes de demover/rotacionar esse papel. A comprovação de conexão
do worker de produção segue pendente.


## Consistência financeira adicional (SQL somente leitura)

- Os quatro processos em análise e o deferido possuem guia marcada
  como paga e data de oficialização; **nenhum desses cinco** tem no
  banco a evidência de autenticação de uma guia de teste do Mercado
  Pago. São dados de QA/legado, não comprovação de pagamento real.
- Os dois processos com status `pagamento_pendente` não têm data de
  oficialização e não possuem guia marcada paga. Isso corresponde
  ao comportamento esperado no snapshot, mas não prova webhook real.
- O processo com `pendencia_documental` tem guia de teste com
  autenticação bancária registrada e está oficializado; ainda
  falta comprovar a assinatura da notificação original e
  a integridade física do PDF.
- No banco QA, `public.officialize_preprotocol_v1` é
  `SECURITY DEFINER`, mas tem permissão de EXECUTE **apenas para
  `neondb_owner`**. A role `authenticated` e os workers bancários
  não executam essa função diretamente. A oficialização é feita
  por trigger após a atualização da guia.
- `public.payment_guides` e `public.processes` têm RLS habilitado,
  somente política SELECT para `authenticated`, e a role não
  possui privilégios diretos de INSERT/UPDATE nas tabelas.
  A função `confirm_preprotocol_payment_v1` valida perfil,
  setor de protocolo, vínculo municipal e recusa manualmente guias
  com referência de banco. Isso reduz o risco de baixa forjada
  por chamadas simples à Data API; ainda devem ser testadas as
  operações autorizadas de cada perfil e o callback sandbox.

**Essa verificação é estática no banco de QA:** não substitui teste
de ponta a ponta nem prova que uma prefeitura real concluiu o processo.

## Ações realizadas nesta auditoria

1. Inspeção da PR, do SHA efetivamente publicado e da trilha CI.
2. Requisições HTTP reais à prévia sem autenticação ou mutação.
3. Consultas Neon QA de leitura para status de processos, documentos,
   guias, relatórios de IA e privilégio mínimo.
4. Introdução do verificador real
   `scripts/qa-preview-live-smoke.mjs` para uso pelo Vercel autenticado; o CI registra a exigência de acesso confiável.
5. Manutenção do bloqueio de publicação comercial enquanto faltarem
   provas humanas vinculadas a um SHA imutável, conforme
   `docs/QA_COMMERCIAL_ACCEPTANCE.md`.

## Dependências que não podem ser simuladas como sucesso

- Para autenticação real, usar contas de QA para os quatro perfis
  e **sem expor senhas no GitHub ou nesta conversa**.
- Para prova financeira, provider sandbox deve entregar notificação
  validamente assinada — não falsificar status `compensada` por SQL.
- Para prova IA, usar planta real fornecida/autorizada e
  limites urbanísticos oficiais conferidos por analista.
- Para prova R2, verificar **bytes reais** e SHA-256, não apenas
  metadados no banco ou HEAD sem GET.
- Para teste de escalabilidade, medir consultas reais e índices
  em ambiente isolado; a paginação atual reduz DOM, não substitui
  paginação/pesquisa no backend.

**Decisão de liberação:** QA técnica parcial; **produção BLOQUEADA**
até que as 10 provas sejam concluídas e revisadas. Qualquer novo deploy
exige CI verde, Preview do SHA exato e reconfirmação visual do usuário.
