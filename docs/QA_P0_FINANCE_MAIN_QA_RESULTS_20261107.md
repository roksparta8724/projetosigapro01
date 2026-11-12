# SIGAPRO — aplicação P0 financeira na QA principal e testes de segregação

**Data:** 07/11/2026. **Escopo:** após o ensaio autorizado em cópia isolada e a continuidade solicitada pelo usuário, promover **somente** à QA principal `br-solitary-sound-b4xlbvs6`; NÃO modificar banco de produção `br-summer-surf-b4s88rv5`, site oficial ou `main`. Banco `sigapro_migration_stage_20260923`; projeto Neon `red-sunset-21120522`.

## 1. Controle antes de executar

- Proposta auditada: `docs/QA_P0_FINANCE_HARDENING_REVIEW.sql`. Nenhuma alteração inserida no executor de migrações automáticas.
- Funções da QA antes da aplicação:
  - `confirm_preprotocol_payment_v1(uuid)` MD5 `dfe14fed9aa673ea0f07a8dab4107ac1`
  - `confirm_process_payment_guide(uuid,text)` MD5 `09171c21ab3afa7e52262fa642fef844`
  - `officialize_preprotocol_v1(uuid,uuid)` MD5 `4aa2c40884c6c7c0ff1e173b4d46e3a5`, já sem EXECUTE para `PUBLIC` ou `authenticated` nessa QA.
- Uma correção adicional foi feita após o ensaio inicial: **a verificação de vínculo bancário agora ocorre ANTES do ramo que trata a guia como já paga**. Assim uma guia bancária `paid=true` e ainda sem processo oficial não pode usar a rota manual para obter oficialização. A confirmação feita pelo provedor segue na via separada. O teste estrutural `financeFunctionPrivilegeReviewQa.test.ts` protege a ordem do guarda.

## 2. Transação aplicada à QA principal

Uma única transação Neon com 10 comandos confirmou o banco, os três hashes antigos e a ACL original **antes** de atualizar. Foi criado `sigapro_qa_p0_main_20261107.function_backup`, contendo definição SQL, hash MD5, proprietário, ACL antiga e data dos três procedimentos. A integridade dos três backups foi confirmada no próprio banco.

Na mesma transação:
- Reafirmado o bloqueio de EXECUTE direto de `officialize_preprotocol_v1` a `PUBLIC`/`authenticated` (o trigger proprietário continua autorizado).
- Substituído `confirm_preprotocol_payment_v1` pelo fluxo que limita baixa de pré-protocolo a usuários ativos do **Setor de Protocolo** no município e nega qualquer guia com provedor ou indício de transação bancária, inclusive uma guia já marcada como paga ainda sem processo oficial.
- Substituído `confirm_process_payment_guide` pelo fluxo que limita guia inicial ao Protocolo, demais guias ao **Financeiro**, com comprovação de acesso ao processo e negação de metadados bancários.
- Verificado o hash novo de cada função, as chamadas autorizadas, as ACLs e a ausência de EXECUTE direto público da oficialização.

**Hashes verificados após a aplicação, na QA principal:**

| Função | MD5 final |
|---|---|
| `confirm_preprotocol_payment_v1` | `feee1bf8a9831dfb45bd37bc6d7a539a` |
| `confirm_process_payment_guide` | `1656ac3eed5cf5e44693340515d1b795` |
| `officialize_preprotocol_v1` | `4aa2c40884c6c7c0ff1e173b4d46e3a5` |

## 3. Ensaios na QA principal — resultado

| Caso | Resultado e evidência |
|---|---|
| Conta `authenticated` chama a oficialização diretamente | **NEGADO**, `insufficient_privilege` |
| Admin Prefeitura consulta processo próprio | **PERMITIDO**, sem permitir ação financeira |
| Admin Prefeitura baixa pré-protocolo, protocolo ou ISS | **3 NEGADOS**, setor operacional requerido |
| Guia Mercado Pago existente ainda pendente tenta baixa manual pelo Protocolo | **NEGADO** pela checagem bancária; não mudou de status |
| Guia Mercado Pago já oficializada passa pelo acesso repetido do Protocolo | **IDEMPOTENTE**, devolveu processo existente, sem número novo |
| Protocolo confirma guia sintética, exclusivamente manual, com vínculo municipal | **PERMITIDO**, processo oficializado e auditoria gerada |
| Financeiro confirma guia sintética de ISS, exclusivamente manual | **PERMITIDO**, histórico/auditoria gerados |
| Financeiro tenta confirmar protocolo e Protocolo tenta confirmar ISS | **2 NEGADOS**, segregação de setores |
| Admin, Financeiro e Protocolo tentam consultar processo de outra Prefeitura | **3 NEGADOS** em `has_process_access` |
| Financeiro e Protocolo tentam confirmação de guia/processo de outro município | **2 NEGADOS**; nenhuma escrita |
| Ensaio de restaurar definições anteriores dos três procedimentos | **PASSOU**: hashes antigos conferidos dentro de subtransação que foi deliberadamente revertida, preservando estado protegido |
| Integridade e identidade | **PASSOU**: 8 processos, 11 guias e 10 perfis como antes; nenhum registro sintético persistiu; backup 3/3 íntegro |

As chamadas SQL de ensaio utilizaram perfis e vínculo municipal reais da cópia QA, simulando os claims da identidade Neon **apenas no contexto da sessão SQL de teste**. As inserções fictícias foram contidas em subtransações com exceção forçada para rollback. A sequência oficial é mantida pela função `next_tenant_protocol_number` que atualiza `tenant_protocol_counters` transacionalmente; nenhum processo ou guia fictício foi preservado. **Isso não equivale a login real via navegador nem a um pagamento bancário em sandbox.**

O ensaio isolado prévio `docs/QA_P0_FINANCE_REHEARSAL_RESULT_20261107.md` já havia testado **28 variantes** de tentativas indevidas por provedor, referências e metadados bancários, além dos caminhos positivos e rollback. As funções implantadas na QA principal têm os mesmos hashes finais testados no isolamento, com a guarda prévia do ramo já pago adicionada e protegida por teste estrutural.

## 4. Produção preservada e P0 produtivo ainda aberto

A produção `br-summer-surf-b4s88rv5` foi examinada **somente com SELECT** após a aplicação: manteve os hashes originais `dfe14.../09171.../4aa2...` e continua com EXECUTE de `officialize_preprotocol_v1` para `PUBLIC` e `authenticated`. **Portanto, a produção continua bloqueada para aceite comercial.** Nenhum merge em `main`, alteração de DNS, deploy produtivo, pagamento real, escrita em produção ou eliminação de backup.

## 5. Auditoria complementar do usuário técnico do webhook

O worker dedicado `sigapro_qa_webhook_worker` da QA apresenta `rolbypassrls=false`, `rolinherit=false`, não herda `neon_superuser`, não tem acesso direto a perfis/processos/guias e tem somente EXECUTE da RPC `mp_qa_webhook_settle_v1` necessária ao ensaio.

**Bloqueio diferente, ainda não corrigido:** a QA conserva `sigapro_prod_webhook_worker` criado anteriormente com `rolbypassrls=true`, `rolinherit=true` e participação em `neon_superuser`; seu acesso excessivo às tabelas decorre da herança administrativa, sem grants diretos. A produção contém o papel homônimo **restrito**, sem essas permissões excessivas. A tentativa controlada de reduzir `BYPASSRLS` e revogar `neon_superuser` **somente na QA** foi negada pelo Neon, SQLSTATE **42501**: o usuário disponível não possui `CREATEROLE` e `ADMIN OPTION` sobre a função. Toda essa tentativa estava na mesma transação e foi integralmente revertida; nem o schema de backup do papel foi criado.

Não é seguro usar a conta legada com privilégios elevados; o código do webhook produtivo tem guarda fail-closed, enquanto a QA deve utilizar exclusivamente `sigapro_qa_webhook_worker` para sua própria RPC. A remoção, substituição ou restrição da conta antiga exige ação administrativa no Neon com autorização própria; não apagar nem resetar credenciais automaticamente.

## 6. O que segue pendente para o cliente municipal

- Webhook assinado real em **sandbox** (crédito validado no provedor, reenvio duplicado, estorno, rastreio por município, quantidade em centavos e PDF original);
- Segurança do worker legado da QA com privilégios excessivos, sem risco de uso;
- Ensaios com duas contas reais em navegador/HTTP e os quatro painéis municipais;
- IA técnica com planta real/gabarito legal, revisão de PDFs e recuperação integral do Neon + R2;
- Liberação produtiva e 10 gates comerciais de `docs/QA_COMMERCIAL_ACCEPTANCE.json` (todos ainda `pending`).

**Resultado específico:** P0 financeiro nas duas rotinas manuais **corrigido e comprovado em SQL na QA principal**, com backups, rollback e isolamento municipal. **Não significa software liberado comercialmente nem conciliação de banco comprovada.**

## 7. Verificação adicional do webhook de homologação

A definição de `mp_qa_webhook_settle_v1` foi inspecionada no Neon QA principal. Sua ACL concede EXECUTE somente ao proprietário e ao `sigapro_qa_webhook_worker`, não aos usuários de interface `authenticated`. A rotina exige recibo previamente registrado com assinatura verificada, consulta bem-sucedida ao provedor, estado `processed/accredited`, conciliação vinculada à Prefeitura e guia, valores coerentes e PDF original arquivado com SHA; duplicatas usam evidência e retorno idempotente.

**Teste SQL negativo executado e aprovado:** tentativa de liquidar com IDs sintéticos e sem recibo assinado persistido devolveu `manual_review`, `matched=false`. Essa verificação não fez pagamento nem registrou crédito.

**Inventário agregado sem dados sensíveis:** existem **2 guias Mercado Pago** na QA principal, sendo **1 paga e 1 pendente**. Uma apresenta chave e SHA do PDF original, snapshot documental e carimbo de autenticação bancária; as duas têm identificador de pagamento externo. O resultado comprova a existência de metadados, **não** a disponibilidade do objeto R2, a correspondência do PDF ou a verificação de webhook real.

O teste HTTP com callback genuinamente assinado pelo Mercado Pago no sandbox, checagem em tempo real de crédito e reenvio duplicado **continua pendente**, assim como a retirada de privilégios do worker legado (tarefa administrativa separada).

## 8. Integridade dos registros históricos (somente leitura)

Auditoria adicional executada na QA principal, após a implantação, sem coletar identificação pessoal e sem alterar registros:

| Verificação | Resultado |
|---|---:|
| Guias com Prefeitura diferente do processo vinculado | **0** |
| Documentos com Prefeitura diferente do processo vinculado | **0** |
| Números oficiais duplicados por Prefeitura | **0** |
| Guia de protocolo marcada paga mas processo não oficializado | **0** |
| Processos oficiais antigos sem `officialized_by_payment_guide_id` | **2** |
| Desses, processos com exatamente uma guia de protocolo marcada paga | **2** |

Os dois registros antigos são **candidatos a reconciliação, não prova suficiente de crédito bancário**. Um único `paid=true` legado não comprova, por si só, assinatura do provedor, valor creditado ou autenticidade do PDF original. **Não foi feito preenchimento retroativo automático.** A reparação exigirá evidência bancária/documental, verificação de auditoria, conferência da guia original e um procedimento versionado que não altere o número oficial histórico.
