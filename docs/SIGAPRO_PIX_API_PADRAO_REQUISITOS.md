# SIGAPRO — Núcleo comum API Pix e bancos
Fonte: https://github.com/bacen/pix-api e https://www.bcb.gov.br/estabilidadefinanceira/pix-cobranca

Implementação na branch de homologação:
- `server/standard-pix-collection.ts`: constrói cobrança imediata no formato comum `/cob/{txid}` e classifica respostas de cobranças `cob` de API Pix
- O txid tem de 26 a 35 caracteres alfanuméricos e deve ser exclusivo do beneficiário conforme a API Pix.
- Nenhuma leitura de JSON, CNAB ou OFX declara liquidação. `settlementAuthorized` permanece false.
- Rejeita destinatário incorreto, txid diferente, divergência de centavos, devoluções, comprovantes repetidos ou ausentes.
- Nunca envia valores, não acessa banco, não altera `payment_guides`, sem efeitos colaterais.

Para operação automática por instituição:
1. Assinar/contratar a API da instituição (Pix Cobrança, boleto registrado, retorno/conciliacão) para a conta específica do município;
2. Receber documentação e credenciais de homologação, client_id, segredo, certificado mTLS e chave privada quando exigidos;
3. Implementar adaptador para OAuth, certificado, `/cob`/`/cobv`, `/pix` ou eventos, PDF de boleto e consultas conforme contrato;
4. Garantir que o backend faça consulta autenticada por município, txid e valor, valide a titularidade do beneficiário e registre idempotência para baixar a guia;
5. Homologar com transação de valor mínimo autorizada e verificar crédito bancário, reembolso e repetição de callback;
6. Implementar GOVBR/AR separadamente: não pressupor que seja a API Pix do banco.

O núcleo é comum; não significa que um banco ainda sem credenciamento, API e conector já funcione.
