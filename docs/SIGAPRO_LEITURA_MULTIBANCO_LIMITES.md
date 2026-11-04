# SIGAPRO — leitura local multibanco
O leitor do painel da Prefeitura identifica arquivos de estrutura CNAB 240 e CNAB 400 e extratos bancários OFX.
A análise é local ao navegador e não envia arquivos a Vercel, R2 ou Neon.
CNAB 240: header/trailer, banco COMPE, tipos de registro e contagem T/U.
CNAB 400: header/trailer e contagem estrutural (os campos variam por banco).
OFX: quantidade de lançamentos, créditos e identificadores FITID repetidos.
Nenhum desses arquivos, isoladamente, comprova o pagamento de uma guia.
Não altera status ou banco, não gera boleto e não executa baixa automática.
Para conciliação oficial, cada integração exige documentação do banco/fornecedor,
autorização municipal, layouts por convênio, certificados e testes reais.
