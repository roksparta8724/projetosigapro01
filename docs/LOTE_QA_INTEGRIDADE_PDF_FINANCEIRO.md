# QA SIGAPRO — lote de integridade documental e financeira

**Escopo desta entrega consolidada:** tornar o leitor local gratuito mais
abrangente sem fingir que ele faz análise visual de geometria, e impedir
diferenças financeiras arredondadas de passarem como pagamento idêntico.

## Cenários corrigidos por código e testes

1. Leitor de PDF nativo segue a árvore /Catalog → /Pages → /Kids, com
   detecção de contagem impossível, ciclo e referências faltantes; ordenação
   física de objetos não corresponde necessariamente à numeração de pranchas.
2. Texto PDF em strings hexadecimais ASCII ou UTF-16BE pode ser extraído
   dentro de comandos Tj/TJ, sem interpretar códigos arbitrários de fontes
   proprietárias. Nunca se infere geometria da imagem.
3. Campos de área com milhares e vírgula decimal (por exemplo 1.200,00 m²)
   são preservados na normalização brasileira; a leitura não transforma
   erroneamente 1.200 em 1,2.
4. Uma implantação que declara um recuo mas omite outro não perde a
   evidência do primeiro. A medida ausente continua não verificada e a
   aprovação automática permanece proibida.
5. Persistência de cobrança usa centavos exatos em formato decimal estrito,
   sem aceitar 1.001 como R$ 1,00 por arredondamento, e mantém as
   proteções já implementadas para ambiente, guia, ordem e baixa anterior.

## Restrições explícitas

- PDFs escaneados, CMaps/ToUnicode complexos, fontes sem camada textual ou
  desenhos com cotas não selecionáveis exigem outro leitor (OCR/visão),
  com autorização, gabarito e conferência técnica.
- A árvore de páginas incompleta ou inconsistente é erro, não resultado
  inventado; não se presume inspeção visual.
- Nada desta alteração conecta um novo banco, executa transação real,
  liga uma API paga ou muda a lei vigente.
- Dados financeiros e documentos reais só podem passar por homologação
  com banco e técnico responsáveis, sem alterar o site oficial.
