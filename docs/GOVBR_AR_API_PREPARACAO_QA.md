# SIGAPRO — GOVBR Administração de Receitas (AR): preparação segura

**Situação:** conector de diagnóstico API GET somente leitura na branch QA. **Não é uma integração bancária homologada.**

## O que já está preparado

- Cada prefeitura pode selecionar Sistema próprio → GOVBR/AR → integração por API, informar a URL HTTPS da instância GOVBR, a rota GET documentada do município, o cabeçalho de autenticação (Bearer ou X-Api-Key) e salvar a credencial cifrada pelo servidor.
- A operação de teste GOVBR exige sessão e permissão de administrador financeiro municipal, consulta a configuração do município no Neon, descriptografa o segredo somente no backend e faz GET sem redirecionamento.
- O destino é limitado a HTTPS/443 em govbr.com.br e govbr.cloud e seus subdomínios; não há chamadas para IPs, localhost, outros domínios, URLs com senha ou parâmetros arbitrários.
- Limites: 8s de conexão, resposta 64 KiB, JSON obrigatório. Não grava nem entrega dados brutos de contribuintes ao navegador, apenas nomes de campos e contagem.
- O conector anuncia somente a operação query, com credencial ainda não verificada e baixa bancária desativada. O banco Neon impede ativar modalidade de arrecadação automática de fornecedor municipal enquanto não homologada.
- Emissão de DAM, geração de PDF, compensação financeira, baixa automática, cancelamento, reemissão e alteração de registros NÃO são realizadas por essa consulta.

## Por que a chave, sozinha, não basta

GOVBR GovernançaBrasil / Administração de Receitas é um produto municipal, diferente do portal federal gov.br e da empresa GOB. Esses serviços não fornecem o contrato da API GOVBR/AR.

A chave não informa servidor, caminhos, formato da consulta, autenticação, esquema dos dados ou regras de liquidação. Para que o GET de diagnóstico funcione, a prefeitura precisará do endereço, caminho e credencial oficialmente fornecidos pelo suporte GOVBR.

Se a instância real usar SOAP/WSDL, mTLS, OAuth2, VPN, URLs fora dos domínios aprovados ou consultas paginadas obrigatórias, o transporte deverá ser implementado conforme documentação; não se devem adivinhar rotas nem comprometer a segurança.

## Informações a solicitar à GOVBR

1. Documentação OpenAPI/Swagger, WSDL ou manual de integração do módulo Administração de Receitas (AR), versão e contrato.
2. URL base oficial de homologação e de produção, IPs/certificados e escopo da prefeitura.
3. Método de autenticação, renovação de credencial e perfis de consulta.
4. Rota GET de consulta de guia, processo e situação, parâmetros e esquema JSON.
5. Endpoints oficiais de DAM, boleto/PIX, PDF, reemissão, cancelamento e idempotência.
6. Webhook ou consultas de compensação/estorno e prova de crédito bancário com exemplos.

Após receber o contrato e credenciais de teste, homologar cada operação em QA, conferir isolamento entre prefeituras, centavos exatos, PDF imutável, eventos assinados, retornos adversariais e idempotência antes de ativar produção.

## Como interpretar o resultado

GET retornou JSON: conectividade e estrutura verificadas, NÃO pagamento confirmado.
GET falhou: sistema mostra o tipo de falha sem vazar token.
O resultado não gera nem quita guia, não muda protocolo e não autoriza emissão real.

Essa entrega prepara o código; não atesta que o fornecedor liberou acesso.
