# SIGAPRO QA — Leitura documental de Campo Limpo Paulista (08/11/2026)

**Natureza:** referência técnica para conferência, SEM homologação jurídica, cadastro de PDF no R2 ou ativação de normas. Esta pesquisa não altera o banco da Prefeitura, o fluxo de pagamentos ou a produção.

## 1. Fontes oficiais localizadas

| Fonte | Efeito documental confirmado | Limites do uso |
|---|---|---|
| [LC 379/2009, original, Câmara](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1830/) | LPUOS, Quadro I, Quadro II, mapas e anexos; 23 linhas do Quadro I (pp. 36–37) | Texto original, NÃO consolidado |
| [LC 440/2011, Câmara](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1889/) | Alterações de parcelamento e hipóteses especiais nos arts. 69-B, 69-C e 77-A | Recuos excepcionais apenas se requisitos provados; Conselho das Cidades na hipótese do art. 77-A |
| [LC 473/2014, Câmara](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1928/) | Histórico de alterações do solo/ZEIS | **Revogada expressamente pelo art. 1º da LC 507/2017**; não usar dispositivos como regras atuais |
| [LC 507/2017, Câmara](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1965/) | Revoga a LC 473/2014 e restabelece a redação anterior da LC 379/2009 com alterações da LC 440/2011 | Conferir cronologia junto da LC 501/2016 e LC 566/2022; não reativar lei revogada |
| [LC 501/2016, Câmara](https://www.camaracampolimpo.sp.gov.br/public/legislacao/download-lei/1948/) | Altera o art. 76 da LC 379/2009 | Não muda por si o Quadro I original |
| [LC 566/2022, Câmara](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/2024/) | Revoga LCs 535/548 de 2019 e repristina expressamente 379/2009, 440/2011 e 501/2016, entre outras | Conferir histórico e relações por artigo e data |
| [LC 613/2023, Imprensa Oficial](https://www.dosp.com.br/leituratexto?p=MTMzOTc0NA%3D%3D) | Novo Plano Diretor Estratégico | Aplicar junto da LPUOS e seus anexos, não substituir numericamente os quadros sem fundamento |
| [LC 655/2026, DIOE](https://www.dosp.com.br/leituratexto?p=MjU4MDQyNg%3D%3D) | Direito real de laje, procedimento especial | Não aplicar a qualquer obra nova |
| [LC 656/2026, DIOE](https://www.dosp.com.br/leituratexto?p=MjU4MDQyNw%3D%3D) | Regularização extraordinária de imóveis consolidados e desdobros, condicionada a situação anterior e requisitos | Art. 7º prevê permeabilidade de 15% em hipóteses delimitadas; não mudar índice geral da LPUOS |
| [Decreto 7.548/2026, DIOE](https://www.dosp.com.br/leituratexto?p=Mjc1MjE4Mg%3D%3D) | Regulamenta LC 655/2026 | Fluxo específico de laje e integração com 613/2023 e 379/2009 |
| [Decreto 7.550/2026, DIOE](https://www.dosp.com.br/leituratexto?p=Mjc1MTkyNg%3D%3D) | Regulamenta LC 656/2026 | Fluxo especial, sem alteração automática de regras ordinárias |
| [Revisão da LPUOS 2026 — página da Prefeitura](https://www.campolimpopaulista.sp.gov.br/leis-urbanisticas) | Minuta e quadros para audiências e consultas de 2026 | MINUTA — não é nova lei promulgada |

Os links são de fontes públicas para leitura. Registro individual em banco autenticado exige PDF original, SHA-256 e permissões da Prefeitura.

## 2. Conclusão da pesquisa até 08/11/2026

- **Lei de referência para revisão municipal: LC nº 379/2009**, com **Plano Diretor LC nº 613/2023** e a cadeia de alterações/repristinações devidamente separada.
- **Status no SIGAPRO: "Aguardando sua análise"** — revisão documental, sem certificar vigência consolidada nem liberar IA.
- **Não foi identificada nova LPUOS promulgada** que substitua a LC 379/2009 nas fontes oficiais consultadas em 08/11/2026. A [Prefeitura publica cronograma de revisão da LPUOS](https://www.campolimpopaulista.sp.gov.br/leis-urbanisticas) e prevê envio da proposta à Câmara em 15/12/2026. Isso é uma **minuta**, não lei nova vigente.
- **Achado novo:** o [PDF oficial da LC 507/2017](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/1965/) confirma revogação expressa da LC 473/2014 e retorno da redação da LC 379 com alteração pela LC 440/2011; o [PDF da LC 566/2022](https://www.camaracampolimpo.sp.gov.br/legislacao/download-lei/2024/) menciona expressamente as LCs 379/2009, 440/2011 e 501/2016 na restauração de vigência.
- **Banco de QA correto verificado (somente leitura):** Neon `red-sunset-21120522`, branch `br-solitary-sound-b4xlbvs6`, banco `sigapro_migration_stage_20260923`, tenant CLP. Observado: 1 lote do Quadro I, 7 eventos de conferência, 45 rascunhos do Quadro II, 0 documentos de lei individualizados, 0 importações jurídicas e 0 evidências verificadas. Existe 1 versão ativa de teste; não equiparar a versão oficial.
- Os dados legais permanecem sem escrita automática porque o cadastro original exige permissão da Prefeitura, PDF íntegro e SHA-256; não inventar autorização de advogado ou servidor.

## 3. Quadro I original: reconstituição independente

- Fonte: PDF LC 379/2009, **páginas impressas 36 e 37** (índices PDF 35 e 36); comparação visual da tabela. O código `src/lib/campoLimpoQuadroIOriginal.ts` guarda **23 linhas**, apenas como strings literais, sem coerção ou cálculo.
- Parâmetros capturados: zona, uso, CA mínimo/básico/máximo, TO máxima, TP mínima, área e testada mínimas, gabarito como impresso, recuos frontal, fundos, lateral e ressalva.
- **AIU (2)**, linha 22: CA mínimo impresso como `01`, campo **ambíguo**; não converter automaticamente para `1`, `0,1` ou `0,01`. Outros campos observados nesta linha: CA básico `1`, máximo `1`, TO `40%`, TP `35%`, lote `5000 m²`, testada `50 m`, `2 pavimentos`, recuos `10/8/4 m` (frente/fundos/lateral).
- ZEIS e ZEPAM remetem a legislação específica. As notas após a tabela e o Anexo III trazem condicionantes e exceções. A expressão `largura da via da testada + recuo` não é número em metros.
- `src/lib/compareCampoLimpoQuadroIOriginal.ts` compara campos extraídos **apenas** de um lote correspondente a Campo Limpo Paulista com 23 linhas, por posição alinhada, zona e uso; divulga discrepâncias e bloqueia comparação numérica do CA mínimo ambíguo. É uma auditoria da leitura OCR, não uma certificação de vigência.

## 4. Quadro II e situação funcional

Na última captura apresentada no chat, o sistema reporta 14 páginas, 45 sugestões e 45 rascunhos, ainda sem importação jurídica versionada. Não existem provas suficientes para transformar sugestões em permissões de uso. Cada categoria requer: página original, zona individual, texto literal, vias, vagas, condições especiais, vigência e autenticação do responsável. O verificador não deve confundir quantidade de rascunhos com cobertura jurídica.

## 5. Tratamento dos bloqueios reais

1. **Acervo jurídico versionado:** registrar cada norma e seus anexos no acervo individual da conta Admin da Prefeitura. Link externo da Câmara não é PDF armazenado.
2. **Quadro I:** revisar as divergências apontadas pela nova tabela original; a AIU (2) permanece como ressalva pendente de documento ou decisão técnica/jurídica fundamentada.
3. **Quadro II:** conferir categoria por categoria, com oitiva de instâncias competentes nas hipóteses previstas em lei, quando aplicável.
4. **Importações e evidências:** emitir versões `reviewed_draft`, relacionando cada índice ao PDF, página, transcrição e SHA da mesma fonte.
5. **Versões ativas:** exigir assinaturas e salvaguardas do backend para o escopo do processo; QA fictícia nunca substitui legislação municipal.
6. **Geometria do projeto:** leitor geométrico ainda requer ensaio com plantas reais cotadas antes de declarar automação homologada.

## 6. Limites técnicos e segurança

- Na consulta anterior, o banco `sigapro_migration_stage_20260923` foi verificado na branch de produção, que não continha os 45 rascunhos. **A consulta desta rodada na branch de QA `br-solitary-sound-b4xlbvs6` confirmou os 45 rascunhos**. Somente leitura: nenhum registro foi alterado.
- Nenhum PDF foi carregado por esta pesquisa na conta R2 da Prefeitura; nenhuma norma foi ativada; não foi emitido parecer legal para processo real.
- Testes da aplicação e a publicação de preview medem funcionamento do software, não substituem aceite documental da Prefeitura.
- Alterações do código ficaram na PR #118 em draft, na branch `fix/qa-triagem-analise-pagamento-20261101`. Não promover produção antes de testes funcionais e validação jurídica.

**Encaminhamento:** obter confirmação autenticada das normas e folhas originais aplicáveis por modo de processo, consolidar vigências e completar evidências para cada zona e categoria. A conferência da AIU (2) permanece explicitamente aberta.
