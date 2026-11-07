# SIGAPRO — ensaio autorizado P0 financeiro em cópia isolada do Neon

**Data:** 07/11/2026. **Autorização:** usuário autorizou expressamente corrigir e testar permissões financeiras em **cópia isolada do Neon de homologação**, com reversão e **sem alterar produção**.

## Ambiente realmente utilizado

- Neon projeto: `red-sunset-21120522`
- QA principal, **não modificado**: `br-solitary-sound-b4xlbvs6`
- Produção, **não modificada**: `br-summer-surf-b4s88rv5`
- Branch isolada de ensaio usada: `br-lucky-credit-b4evfnn0`, `sigapro-release-migration-rehearsal-20261104`
- Banco: `sigapro_migration_stage_20260923`
- Tentativa de criar nova branch derivada da QA: **HTTP 422 — limite de 10 branches**. Para não apagar backups nem interferir nas branches principais, foi utilizada **a cópia de ensaio já existente**; ela deriva de um backup de produção datado de 04/11, **não é uma cópia recém-criada da branch QA de 07/11**. As três funções-alvo tinham hashes iguais aos da QA antes do ensaio. Os testes funcionais foram realizados apenas nessa branch de ensaio.

## Alteração aplicada — e **somente** na cópia de ensaio

Origem: `docs/QA_P0_FINANCE_HARDENING_REVIEW.sql`, revisado antes da aplicação. Operação atômica via Neon `run_sql_transaction`, sem tocar em produção ou QA principal:

1. Criado `sigapro_qa_p0_20261107.function_backup` com as três definições anteriores, proprietário e ACL originais. Verificação final: **3 backups íntegros** por MD5.
2. Revogado `EXECUTE` direto de `PUBLIC` e `authenticated` na função `officialize_preprotocol_v1(uuid,uuid)`. O acionamento interno pelo trigger continua disponível ao proprietário `neondb_owner`.
3. Revisada `confirm_preprotocol_payment_v1`: somente servidor do Protocolo com vínculo/perfil ativo e `profile_operational_area='protocolos'` pode confirmar guias **manuais**. Qualquer `bank_reference` ou provedor diferente de `manual`/`municipal_system` exige conciliação autenticada.
4. Revisada `confirm_process_payment_guide`: baixa inicial pelo Protocolo e demais guias pelo Financeiro, cada qual no setor correto. **Correção adicional na revisão:** `bank_direct` também é tratado como provedor bancário; qualquer referência de banco ou provedor diferente de `manual`/`municipal_system` impede a baixa manual, mesmo quando o papel Financeiro é válido.

## Ensaios executados contra as funções reais na branch isolada

| Ensaio | Resultado | Observação |
|---|---|---|
| `authenticated` chama `officialize_preprotocol_v1` diretamente | **PASSOU — acesso negado** | Teste com `SET LOCAL ROLE authenticated`, erro `insufficient_privilege` esperado |
| Admin Prefeitura tenta confirmar pré-protocolo, protocolo e ISS | **PASSOU — três operações negadas** | Papel real da cópia validado via identidade Neon e `current_role_code`; consulta ao processo segue possível |
| Financeiro faz baixa manual de ISS com registro sintético | **PASSOU — pagamento, movimento e auditoria gerados** | A subtransação foi **revertida intencionalmente**; dados e eventos fictícios não persistiram |
| Protocolo confirma guia inicial manual sintética | **PASSOU — processo oficializado após guia paga** | Gerou referência oficial vinculada, histórico e manteve triagem/pendência documental conforme falta de anexos; ensaio revertido |
| Financeiro tenta baixar guia vinculada a provedor | **PASSOU — cinco variantes negadas** | `bank_direct` com/sem referência, Mercado Pago, `manual` com referência e referência sem provedor; tudo revertido |
| Protocolo tenta baixar pré-protocolo vinculado a banco | **PASSOU — cinco variantes negadas** | Mesmos cenários, sem números oficiais persistidos |
| Financeiro tenta baixar guia inicial; Protocolo tenta baixar ISS | **PASSOU — papéis cruzados negados** | Nenhuma alteração de dados |
| Analista, Financeiro, Master e profissional externo tentam confirmar pré-protocolo fora da função | **PASSOU — todos negados** | Perfis/identidades existentes na cópia; nenhuma alteração |
| Repetição de confirmação de guia já paga | **PASSOU — pagamento duplicado negado** | Financeiro e Protocolo |
| Reabertura de pré-protocolo já oficializado pelo Protocolo | **PASSOU — resultado idempotente** | Não gera novo número |
| Integridade pós-testes | **PASSOU** | A branch de ensaio permanece com **3 processos e 6 guias**, os mesmos totais do início |
| Backup de funções e permissões | **PASSOU** | 3 definições com MD5 conferido, guardadas no schema exclusivo de ensaio |

**Nota sobre os testes:** contas e papéis foram selecionados da cópia isolada e a identidade Neon foi simulada com claims apenas na sessão de SQL de teste; não foram usados tokens reais de login de navegador. Registros sintéticos foram criados somente em blocos PL/pgSQL com exceção forçada para garantir rollback; nenhuma transação bancária real foi realizada.

O primeiro ensaio com guia já paga não conseguiu alterar a guia por **proteção legítima de imutabilidade**. Os testes foram refeitos com registros sintéticos e reversão. Outro ensaio inicial foi barrado pelo guarda do fluxo porque o registro sintético não tinha a pasta de Análise preenchida; reproduzido com pasta válida, o caminho financeiro passou. Na primeira oficialização sintética, o estado final foi `pendencia_documental`, **correto** para processo sem os anexos obrigatórios, em vez de `triagem` simples.

## Confirmação de isolamento após o ensaio

| Função | Rehearsal (corrigida) | QA principal (intacta) | Produção (intacta) |
|---|---|---|---|
| `officialize_preprotocol_v1`: EXECUTE por `authenticated`/`PUBLIC` | **não/não** | **não/não** | **sim/sim — P0 pendente** |
| `confirm_preprotocol_payment_v1`: hash | `dd909642e465827dce0d77a3401f2ffa` | `dfe14fed9aa673ea0f07a8dab4107ac1` | `dfe14fed9aa673ea0f07a8dab4107ac1` |
| `confirm_process_payment_guide`: hash | `4b8331052e26fd3369e125f296fa9891` | `09171c21ab3afa7e52262fa642fef844` | `09171c21ab3afa7e52262fa642fef844` |

O fato de a produção ainda permitir chamada direta de oficialização é **um risco de autorização por corrigir**, não evidência de exploração ou incidente.

## Reversão ensaiada e comprovada na branch de ensaio

As definições anteriores estão no banco isolado em `sigapro_qa_p0_20261107.function_backup`, preservadas com hash e ACL. **Ensaio de reversão executado e aprovado:** em uma subtransação PL/pgSQL, as três definições originais foram recriadas via `CREATE OR REPLACE FUNCTION`, cada hash MD5 foi conferido e os privilégios `EXECUTE` originais da oficialização foram restaurados provisoriamente. Uma exceção controlada reverteu toda a restauração; imediatamente depois, conferi novamente os hashes das duas funções corrigidas e confirmei a ausência de `EXECUTE` para `PUBLIC`/`authenticated`. O estado endurecido permaneceu intacto. Nenhuma alteração atingiu QA principal ou produção. Para reverter **apenas essa branch**, restaurar os dois corpos de função via `definition` e reproduzir o `proacl` salvo para a oficialização. Não executar restauração sobre QA principal ou produção. Não excluir a branch automaticamente; ela já existia e pode servir a outros ensaios.

## Critérios ainda NÃO cumpridos para entrega comercial

- Aplicação revisada na **QA principal** e depois em produção, com autorização de mudança, backup, rollback, janela e validação específica. Este ensaio isolado **não alterou nenhum desses bancos**.
- Teste de webhook real de sandbox com conta bancária, assinatura, conciliação, repetição/idempotência e valor em centavos; compatibilidade do worker dedicado e seu menor privilégio. **Não testados.**
- Teste autenticado HTTP/neon Data API em navegadores reais para todos os papéis, inclusive duas prefeituras; os testes de sessão SQL **não substituem** esse aceite.
- Revisão e regularização de eventual role do webhook QA com `BYPASSRLS`; o worker da produção deve continuar protegido.
- Reconciliação dos processos históricos com `officialized_by_payment_guide_id` ausente, **sem edição automática por suposição**.
- Os 10 gates do `docs/QA_COMMERCIAL_ACCEPTANCE.json` permanecem `pending`. A PR #118 deve continuar DRAFT, sem merge em produção.

**Conclusão:** a correção P0 de funções financeiras foi **aplicada e comprovada em cópia isolada de ensaio**, com funcionamento legítimo preservado e cenários indevidos bloqueados. **Ainda não foi aplicada ao banco QA principal ou produção**, portanto o risco produtivo não foi resolvido por este ensaio.
