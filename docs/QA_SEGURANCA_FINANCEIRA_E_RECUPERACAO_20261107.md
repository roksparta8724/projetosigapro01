# SIGAPRO — auditoria de segurança financeira e recuperação (QA, 07/11/2026)

**Escopo:** inspeção exclusivamente de metadados e totais do Neon; nenhuma
consulta exibiu CPF, credenciais, transações detalhadas ou dados de projetos.
**Projeto Neon:** red-sunset-21120522.
**Banco:** sigapro_migration_stage_20260923.

## Achado de segurança: privilégio excessivo no worker de produção

No ramo de homologação br-solitary-sound-b4xlbvs6, o papel
\`sigapro_prod_webhook_worker\` foi encontrado com \`rolbypassrls=true\`
e herança do papel administrativo \`neon_superuser\`; ele também possui
permissões amplas em tabelas de processos/documentos. **É um risco, não
uma invasão confirmada.** Sem evidências equivalentes na branch de produção,
o achado não é extrapolado para o banco oficial.

O portal de homologação agora contém uma proteção: o endpoint de
confirmação bancária em produção consulta os próprios privilégios da
conexão **antes** de ler segredos ou creditar pagamentos. Caso o papel
tenha BYPASSRLS, seja superusuário, herde \`neon_superuser\` ou possua
permissões proibidas em perfis/documentos, a reconciliação **falha
fechada** e requer correção de privilégios no Neon antes de ser habilitada.
Isso é deliberado: não é seguro movimentar fundos com um worker
excessivamente privilegiado.

**Não foi executado ALTER ROLE, REVOKE ou GRANT em nenhum banco.**
Antes de qualquer aplicação em produção, precisa-se estabelecer
a lista mínima de permissões necessária para as RPCs existentes,
conferir que a conta não pertence a um papel administrativo,
testar webhook/rollback em ambiente isolado e obter aprovação de mudança.

## Verificação de segmentação SQL no QA

- \`public.processes\`, \`process_documents\`, \`payment_guides\`,
  \`profiles\`, \`municipalities\` e \`process_audit_entries\`:
  RLS habilitado e chaves primárias presentes.
- Tabelas legadas como \`audit_logs\`, \`documentos\`,
  \`project_documents\` e \`process_habite_se_inspections\`
  aparecem sem RLS; na verificação, o papel \`authenticated\`
  não possuía SELECT/INSERT/UPDATE nelas. Isso **não comprova**
  a impossibilidade de vazamento por todas as APIs/roles nem dispensa
  testes autenticados de duas prefeituras.
- \`sigapro_prod_webhook_worker\` apresentava acesso elevado
  às tabelas, tornando obrigatório rever o princípio do menor privilégio.

## Continuidade: teste não destrutivo de dados históricos

Foram consultados dois ramos independentes, usando SELECT apenas.

| Relação | QA atual (br-solitary-sound-b4xlbvs6) | Snapshot de ensaio de 04/11 (br-lucky-credit-b4evfnn0) |
|---|---:|---:|
| municipalities | 2 | 2 |
| payment_guides | 11 | 6 |
| process_audit_entries | 89 | 70 |
| process_documents | 28 | 16 |
| processes | 8 | 3 |
| profiles | 10 | 9 |

No ramo do snapshot, as sete tabelas críticas consultadas têm
RLS habilitado e chave primária. Isso confirma **legibilidade e
separação de um ponto histórico em outra branch**, mas **não equivale**
a restaurar o serviço inteiro, executar \`pg_restore\`, recuperar o
R2 ou comprovar objetivos RPO/RTO. Uma restauração completa precisa
ser ensaiada em ambiente de recuperação isolado, com validação de
arquivos R2, autenticação, links e integridade de dados.

## Condições que ainda bloqueiam o aceite completo

- Leitura de PDF escaneado precisa de motor OCR/visão efetivamente
  provisionado, amostra real consentida e gabarito técnico.
- Homologação bancária precisa de credenciais de teste válidas e
  confirmação do provedor, sem usar dinheiro real sem autorização.
- Recuperação completa exige backup externo R2 e ensaio medido.
- Dashboards requerem sessão autenticada em cada perfil e captura
  visual; não basta o deploy READY nem testes DOM.

## Reforço do gate bancário — 07/11/2026 (continuação)

A consulta **somente de leitura** no Neon QA, filtrando exclusivamente
o nome do role e privilégios, confirmou:
- `sigapro_prod_webhook_worker` tem `rolbypassrls=true`;
- é membro de papel elevado;
- tem acesso direto a `profiles` (tabela/colunas) e `process_documents`;
- tem permissão de escrita direta em `payment_guides`.

Essas constatações não indicam ataque nem mostram acesso aos dados em si.

**Correção de código somente na branch QA:** o pré-gate
`server/mp-webhook-worker-privilege.ts` rejeita agora também
permissões amplas `SELECT/INSERT/UPDATE/DELETE` sobre perfis, documentos
e processos, privilégios por coluna, escritas diretas nos registros
financeiros/auditoria e herança de `pg_read_all_data` ou
`pg_write_all_data`. O worker continua podendo usar as RPCs específicas
e consultar o registro de recibos assinados quando seu login for
corretamente reduzido. Nenhuma função de liquidação foi liberada por
esta alteração: conexão insegura é rejeitada **antes** de ler o segredo
bancário.

**Validação SQL:** a nova consulta executou sem erro de sintaxe no Neon
QA usando conexão proprietária (retornou todos os controles sensíveis
como verdadeiros, portanto rejeitável). A tentativa de executar como
`sigapro_prod_webhook_worker` não completou: Neon recusou por falta
de senha de login desse papel. Portanto **não há smoke autenticado do
worker restrito**; o CI cobre as decisões do gate com entradas simuladas.
A prova integral depende de credenciais/role reais configurados
por canal seguro, sem repassar segredos ao ChatGPT.

**Para destravar sem diminuir a segurança:** em cópia isolada, definir
um role dedicado sem heranças administrativas e sem grants diretos
sobre tabelas sensíveis, conceder somente `EXECUTE` das RPCs bancárias
estritamente necessárias e `SELECT` da visão de recibos usada na
reconciliação; testar a assinatura do webhook, pagamento duplicado,
acesso cruzado e rollback; depois aprovar aplicação planejada na
infraestrutura oficial. **Não executar GRANT/REVOKE na produção sem
ensaiar e autorizar.**
