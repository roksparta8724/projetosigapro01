# SIGAPRO — Homologação IA urbanística | ciclo pós-release de 04/11/2026

> **AMBIENTE QA EXCLUSIVO.** Não mesclar em `main` e **não publicar em `sigapromunicipal.com.br`** neste ciclo. O site oficial está no commit de release `0c23d52ab8a066fc6b19fb93c556fabfe77f60cb`. Todas as próximas melhorias e regressões devem ficar nesta branch `fix/qa-triagem-analise-pagamento-20261101`, com PR **draft** contra `main`. O domínio oficial, suas credenciais e o banco Neon branch `production` não devem ser modificados durante os testes.

## Fonte documental real preservada

- PDF original da LC 379/2009 fornecido pelo usuário: `quadros.pdf`, SHA-256 `68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1`.
- Quadro I nas **páginas 36 e 37** do PDF. Quadro II nas **páginas 38–51**.
- Há também JSON histórico de transcrição `SIGAPRO_LC379_2009_matriz_para_conferencia.json`, marcado expressamente como **rascunho de conferência, não legislação ativa**. Não sobrescrever o arquivo nem os dados brutos; sempre versionar correções.
- A validade em 2026 e as modificações legislativas posteriores não foram verificadas; não aplicar automaticamente as regras como lei vigente.

## Auditoria read-only no Neon QA em 04/11/2026

- Projeto Neon `red-sunset-21120522`, branch QA `br-solitary-sound-b4xlbvs6`, database `sigapro_migration_stage_20260923`. **Nunca executar SQL de correção na branch production.**
- `urban_matrix_batch_staging_v1`: **1 lote**, 23 linhas do Quadro I; **16 revisadas e 7 não revisadas**; status `pending_legal_review`. Hash do PDF corresponde ao original acima.
- **Índices pendentes, base zero:** 12 ZM-MA comercial, 13 ZM-MA residencial (p.36); 16 ZC residencial, 17 ZC comercial, 20 AIU(1), 21 AIU(2), 22 ZI (p.37). Nos índices com recuo único/exceções, ler notas 1–4 da página 37, não inferir aplicação a partir de uma célula isolada.
- **AIU(2), índice 21:** OCR original insuficiente para confirmar CA mínimo; registro de orientação de analista `proposed_value=1`, status `pending_documentary_confirmation`; ato provisório `manual_only_pending_concidade`, versão 1, valor 1. **Não alterar a transcrição, não transformar em lei, não ativar para IA**, até confirmação documental/CONCIDADE.
- `urban_quadro_ii_source_evidence_v1`: **14 páginas**, da 38 à 51, status de origem `machine_unverified` ou `visual_required`; página 43 com orientação girada e leitura insuficiente. `urban_quadro_ii_draft_entries_v1` = **0** e `urban_legal_matrix_imports` = **0**.
- `urban_legislation_documents_v1` = **0**, `urban_legal_evidence_scopes` = **0**. Os documentos jurídicos precisam ser registrados e conferidos por pessoa habilitada antes de permitir comparação urbanística.
- `urban_regulation_versions` QA = **2 registros `active` fictícios** (zona `QA-URBAN-E2E-20261024`, uso `QA_RES`, lei fictícia). São fixtures sintéticos **sem validade legal**: os filtros `isUrbanTestFixtureRule` e `summarizeUrbanLegalReadiness` devem continuar excluindo-os das conclusões reais. **Nunca migrar dados QA para produção.**
- Processo QA `PM-2026-00004`: permanece `triagem`. Planta arquitetônica V1 invalidada e V2 válida (PDF de 16.575 bytes), outros três documentos obrigatórios presentes. Pagamento sintético QA NÃO equivale a confirmação bancária. **Não desbloquear análise técnica apenas para executar a IA**: primeiro concluir fluxo de triagem de modo autorizado ou usar teste isolado sem efeito no processo.

## Critério de aceitação para a IA

1. Diferenciar **o que a planta declara** dos **limites da lei**. Nunca tomar CA máximo da norma como CA medido no projeto.
2. O leitor visual deve devolver cota, unidade, página e citação textual; se medida/locale/unidade/citação não bater, **valor não deve ficar pronto para conferência**. Valores duplicados, sem implantação ou conflitantes são pendência, não média.
3. OCR Cloudflare é texto, não medição geométrica. Recuos exigem planta de implantação e conferência visual real; não calcular por pixels/escala.
4. A IA não aprova nem assina; sem versão legal válida + prova por artigo/página e aceite humano, o resultado deve ser **“não homologado / revisão manual”**.
5. Testar português BR com vírgula decimal, metro/metro quadrado/%, exemplo de unidade errada, valores conflitantes, documentos inválidos e versionamento. Corrigir em QA com testes automatizados e evidência antes de futura release.

## Publicação futura, após vários lotes

- Reusar esta **mesma branch de QA com credenciais isoladas**; manter **uma PR draft**. Push nessa branch pode atualizar preview Vercel automaticamente, o que é autorizado como homologação; **nenhuma publicação em produção**.
- Só preparar novo merge após: CI `Quality Gate` + `Neon migration validation` verdes; testes de múltiplas prefeituras, PDF com recuos reais, segurança, IA visual, leis e fluxo financeiro concluídos; checklist de backup, comparações de banco e rollback.
- O ponto de retomada é **este documento**, `docs/STATUS_UNICO_SIGAPRO.md` e a nova PR draft. A versão oficial `main` fica intocada até nova ordem do usuário.
