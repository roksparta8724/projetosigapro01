# SIGAPRO — auditoria P0 de permissões financeiras e vínculo de oficialização

**Data:** 07/11/2026 · **Método:** consultas somente leitura no Neon QA e production; sem usar credenciais bancárias, dados de pessoas ou pagamento real. **Estado:** bloqueador de segurança a tratar, não aceite aprovado.

## Resultado comprovado por metadados e definição SQL

1. `public.officialize_preprotocol_v1(uuid,uuid)` é `SECURITY DEFINER` e grava número oficial/estado de processo. **Neon QA:** `authenticated` não tem `EXECUTE`; **Neon production:** `authenticated` e `PUBLIC` possuem `EXECUTE` na ACL declarada. A definição não inclui verificação explícita de identidade municipal solicitante; ela exige guia marcada como paga e plano ativo. Isto é **uma superfície de autorização indevida**, não uma exploração ou vazamento observado.
2. `public.confirm_preprotocol_payment_v1(uuid)` é `SECURITY DEFINER`, tem `EXECUTE` para `authenticated` em QA e produção e permite `prefeitura_admin` no corpo. Quando a guia ainda não é paga, pode atualizá-la para `paid=true`/compensada por ação manual. Não há proteção explícita contra `payment_provider`/vínculo bancário nesse trecho. Essa política contraria o requisito do usuário de **Admin da Prefeitura somente leitura de processos e sem baixa financeira**.
3. `public.confirm_process_payment_guide(uuid,text)` é `SECURITY DEFINER` com `EXECUTE` para `authenticated` e também concede papel de baixa manual ao `prefeitura_admin`. O código já bloqueia algumas guias bancárias, mas a autorização da Prefeitura Admin precisa ser reduzida. O Financeiro autorizado deve continuar usando o caminho de pagamento manual quando for juridicamente e operacionalmente permitido.
4. `public.mp_qa_webhook_settle_v1` na QA possui `EXECUTE` para o role dedicado do worker, **não** para `authenticated`. O worker da QA com BYPASSRLS/herança elevada continua precisando de ajuste próprio; não foi modificado. O role da produção já foi conferido anteriormente por metadados como restrito, mas não foi autenticado em teste E2E.

## Rastreabilidade dos registros do Neon QA

Auditoria agregado-semana sem expor IDs: zero diferenças de município nos joins `process_documents→processes` e `payment_guides→processes`, zero documentos sem processo, zero guias com `process_id` inexistente, zero documento `is_valid=true` com `invalidated_at` presente e zero protocolos oficiais duplicados. Foram identificados **dois processos já oficializados** com `officialized_by_payment_guide_id IS NULL`, ambos em `analise_tecnica` com ao menos uma guia registrada como paga. Isso **não demonstra que entraram sem pagamento**; pode representar registro legado de ensaio. A rotina canônica atual grava a referência ao oficializar. É necessária reconciliação auditada antes de qualquer reparo. Nenhum dado foi alterado.

## Proposta de mudança PREPARADA, NÃO EXECUTADA

`docs/QA_P0_FINANCE_HARDENING_REVIEW.sql` contém uma proposta transacional para:

- revogar `EXECUTE` direto do `PUBLIC` e `authenticated` na oficialização `SECURITY DEFINER`, preservando uso interno pela função/trigger proprietário;
- remover `prefeitura_admin`/Master de baixas manuais, autorizando apenas perfis e setores operacionais específicos;
- rejeitar marcação manual de pré-protocolo vinculado a um provedor bancário, que exige confirmação assinada e autenticada.

O arquivo fica deliberadamente **fora das migrações executáveis**, com teste estático `src/test/financeFunctionPrivilegeReviewQa.test.ts`. Não autoriza aplicar sem revisão e ensaio; ele não é conserto ativo do banco enquanto não houver execução controlada.

## Checklist para execução aprovada

1. Revisar impacto e assinatura das rotinas atuais no Neon, funções chamadoras e permissões dos dois papéis de webhook; congelar SHA.
2. Criar cópia isolada de QA para reversão. Aprovar mudança no banco; executar somente nessa cópia e testar contas legítimas Protocolo/Financeiro, Admin Prefeitura, profissional externo e webhook com repetição.
3. Confirmar `authenticated` sem EXECUTE direto de oficialização; verificar manual-only legítima, rejeição de guia bancária e idempotência do provedor.
4. Inspecionar os dois processos históricos sem referência ao pagamento; reconciliar por evidência do próprio banco, sem editar informações financeiras por suposição.
5. Fazer backup e aprovar janela de produção com rollback validado antes de qualquer permissão produtiva.

**Status comercial:** `docs/QA_COMMERCIAL_ACCEPTANCE.json` permanece com 10 itens `pending`. A inclusão deste documento na PR não autoriza produção, não declara baixa bancária homologada e não comprova incidentes de segurança.

## Atualização posterior: correção aplicada à QA principal

A seção histórica acima registra o diagnóstico e a proposta **antes** da aplicação. A cronologia foi atualizada após a aprovação do ensaio isolado e o comando de continuidade do usuário.

- **QA principal `br-solitary-sound-b4xlbvs6`:** aplicada em transação auditada, com três backups de função/ACL em `sigapro_qa_p0_main_20261107.function_backup`; duas rotinas manuais corrigidas e `officialize_preprotocol_v1` sem EXECUTE direto público.
- **Teste SQL na QA:** papéis Admin, Financeiro e Protocolo, duas prefeituras, pagamento manual positivo com rollback, guia Mercado Pago pendente negada, guia já oficializada idempotente, restauração de funções ensaiada. **8 processos/11 guias** antes e depois.
- **Produção:** NÃO modificada. A função de oficialização ainda está executável por `PUBLIC`/`authenticated` na produção, logo o risco P0 produtivo segue aberto.
- **Worker legado no Neon QA:** tentativa de retirar `BYPASSRLS` e herança administrativa negada por falta de `CREATEROLE`/`ADMIN OPTION` (**42501**); transação revertida. A conta dedicada de QA permanece corretamente restrita. Exige administração autorizada do Neon.
- **Relatório atual canônico:** `docs/QA_P0_FINANCE_MAIN_QA_RESULTS_20261107.md`. Essa validação é restrita a SQL e não substitui webhook real, conexão HTTP, testes de duas contas no navegador ou aceite comercial.
