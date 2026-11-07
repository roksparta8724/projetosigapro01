# SIGAPRO — aceite integral obrigatório (QA → comercial)

O **Quality Gate do código não aprova uma prefeitura**. Para impedir a
reincidência de erros, este controle distingue testes automatizados de
evidências autenticadas de uso real. O estado inicial das dez dimensões
é **pendente**, não uma certificação falsa.

Execute \`node --test scripts/qa-commercial-acceptance.test.mjs\`.
Use \`node scripts/qa-commercial-acceptance.mjs --report\` para o relatório
não bloqueante, ou \`--enforce\` para impedir aceite sem as dez provas.
O SHA completo precisa ser o mesmo do release.

Cada entrada aprovada precisa conter \`status=approved\`, \`sha\`,
\`reviewer\`, \`verifiedAt\` UTC, \`file=<id>.evidence\` e o SHA-256 do
arquivo. Os arquivos devem estar em diretório privado, sanitizados,
fora do GitHub e **sem CPF, tokens, credenciais, documentos ou Pix reais**.
A ferramenta verifica a existência e o hash da prova; a equipe técnica
deve conferir o conteúdo, pois hash sozinho não prova correção funcional.

Requisitos: teste RLS entre duas prefeituras; planta real com gabarito;
PDF e Pix originais reabertos; liquidação bancária idempotente no sandbox;
role bancário sem privilégio excessivo; restauração **Neon e R2**;
Dashboards Master, prefeitura, analista e externo autenticados em tela.

Workflow manual: \`SIGAPRO Commercial Acceptance QA\`, falha
intencionalmente enquanto as provas reais faltarem.
**Isto não modifica a produção nem ativa pagamentos.**
Para que esse check bloqueie merges por inteiro, o administrador do
GitHub precisa configurá-lo como requerido na proteção da branch
\`main\`; ainda não alteramos essa política.
