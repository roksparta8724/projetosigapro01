# SIGAPRO — aceite comercial auditável de um release QA imutável

O **Quality Gate não aprova uma Prefeitura**. A autorização para produção exige
dez evidências **humanamente revisadas** e preservadas fora do código, vinculadas
ao commit de 40 caracteres que realmente foi publicado e testado em QA.

## Correção da dependência circular de commit

Antes, `--enforce` consultava `docs/QA_COMMERCIAL_ACCEPTANCE.json` e exigia
que cada item referisse o SHA do próprio release. Atualizar o manifesto
versionado criava outro commit e invalidava a prova. **Isso foi corrigido:**
o manifesto do GitHub continua como **checklist público pendente**, útil em
`--report`, mas **nunca autoriza produção**. O `--enforce` exige um pacote
privado, imutável e sanitizado, associado ao SHA efetivo do Preview.

Estrutura exigida do pacote, **não versionar nem enviar em conversas**:

```text
.qa-private-evidence/
  manifest.json
  tenant_isolation.evidence
  ai_real_plan.evidence
  pdf_original.evidence
  bank_settlement.evidence
  bank_worker_privileges.evidence
  neon_r2_recovery.evidence
  master_dashboard.evidence
  city_dashboard.evidence
  analyst_dashboard.evidence
  external_dashboard.evidence
```

Manifesto: `version: 1`, `environment: "qa"`, `releaseSha` igual ao SHA
do Preview e `checks` com as dez entradas. Cada entrada requer
`id`, `status: "approved"`, `sha` idêntico ao `releaseSha`,
`reviewer` com pelo menos cinco caracteres, `verifiedAt` em UTC
`YYYY-MM-DDTHH:mm:ssZ`, `file: "<id>.evidence"` e `sha256`
do arquivo de evidência verificado. O verificador calcula o hash dos
bytes efetivos e recusa provas ausentes, alterações, duplicatas, SHA
divergente, arquivos com nome fora do padrão e itens pendentes.

**O hash não comprova a veracidade da inspeção:** um responsável precisa
revisar o conteúdo antes de emitir o aceite. Registre achados com datas,
ambiente, papel, passos, resultado esperado/obtido e referências
anonimizadas para relatórios controlados. Não inclua CPF, projetos
identificáveis, credenciais, JWT, segredo de webhook, PIX real, documentação
privada, chaves de objetos R2 nem extratos de conta em artefatos do GitHub.
Provas sensíveis devem permanecer no armazenamento institucional com acesso
controlado; o arquivo `.evidence` pode conter referência sanitizada e hash
do documento, **não** cópia do documento privado.

## Uso seguro

**Relatório não bloqueante**, sempre baseado no checklist público:

```bash
node --test scripts/qa-commercial-acceptance.test.mjs
node scripts/qa-commercial-acceptance.mjs --report
```

**Aceite obrigatório**, somente com provas privadas materializadas localmente:

```bash
SIGAPRO_QA_RELEASE_SHA="<40-hex-do-preview-testado>" \
SIGAPRO_QA_EVIDENCE_DIR="/caminho/privado/qa-evidence" \
node scripts/qa-commercial-acceptance.mjs --enforce
```

O script falha se `SIGAPRO_QA_RELEASE_SHA` ou
`SIGAPRO_QA_EVIDENCE_DIR` estiverem ausentes, mesmo que o Git contenha
`approved`; não utiliza implicitamente o `GITHUB_SHA` do PR, que pode
representar um merge temporário em vez do commit publicado.

O workflow manual **SIGAPRO Commercial Acceptance QA** exige SHA completo,
ID numérico de uma execução aprovada que tenha publicado um artifact
sanitizado com nome `sigapro-qa-evidence-<sha>`, e origem na branch
`fix/qa-triagem-analise-pagamento-20261101`. O GitHub Action baixa esse
artifact e usa o diretório privado da execução. Configure **required
reviewers** para o environment `qa-commercial-approval` e confira a
proveniência da execução de evidências antes de aprovar. **Não utilize
artifacts de PRs não confiáveis**: artifacts do GitHub podem ser acessíveis
a membros autorizados do repositório e não devem conter documentos pessoais.
O projeto **ainda não tem** uma execução comprovada de upload de evidências
que cubra os dez critérios, portanto o workflow deve continuar falhando
fechado até que essa etapa seja provida de maneira segura.

## Dez provas exigidas

1. Duas Prefeituras reais de QA autenticadas e isolamento de todos os dados e ações.
2. Leitura de planta real pela IA com gabarito urbanístico assinado e evidências por página.
3. Guia DAM original arquivada em R2, PDF/QR/linha digitável e reabertura do mesmo arquivo.
4. Webhook de sandbox assinado, crédito exato, callbacks duplicados/estorno e idempotência.
5. Worker bancário com privilégios mínimos, inclusive conexão efetiva no banco.
6. Backup e **restauração** de Neon e R2 medidos, com verificação de integridade.
7. Painel Master autenticado.
8. Painel Admin da Prefeitura autenticado, sem ação em processos.
9. Painel do Analista autenticado.
10. Portal do Profissional Externo autenticado.

A `main` e a produção não devem ser liberadas enquanto não houver
evidências revisadas e mudança produtiva específica aprovada. A execução
do workflow por si só **não configura proteção obrigatória na branch
main**; o administrador do GitHub precisa exigir o status adequado nas
rulesets/branch protection.
