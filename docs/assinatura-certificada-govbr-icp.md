# Integração de assinatura certificada (GOV.BR e ICP-Brasil)

Status: interface de orientação externa implementada. A assinatura certificada dentro do SIGAPRO permanece indisponível até a implementação e homologação do ciclo completo. Não confundir confirmação por senha, hash de payload e QR interno com certificado digital.

## Requisitos de ativação
- Ato normativo municipal conforme Lei 14.063/2020, art. 5º, com política por tipo de documento e signatário. ICP-Brasil quando exigida por lei.
- Adesão municipal à Rede gov.br, integração de identidade digital e credenciais oficiais por órgão/serviço e ambiente; callback autorizado no domínio do órgão.
- Solicitar acesso oficial: https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/transformacao-digital/servico-de-integracao-aos-produtos-de-identidade-digital-gov.br/
- Manual: https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/latest/iniciarintegracao.html

## Contrato de implementação antes da liberação
1. Backend autoriza município, processo, versão, signatário e slot; política normativa impede downgrade de modalidade.
2. PDF oficial imutável em armazenamento privado, com hash e versão. Preparar PDF e ByteRange para assinatura envelopada. Não assinar apenas o JSON de emissão.
3. OAuth 2.0 com state/nonce aleatórios, expiração e consumo único, credenciais exclusivamente no servidor e separação QA/produção. Escopos: sign govbr (avançada) ou sign icp_brasil (qualificada em nuvem); ambas somente quando admitidas. Certificados locais requerem integração própria.
4. Troca de code por token no servidor, assinatura PKCS#7 do hash correto, incorporação ao PDF e validação de cadeia, identidade/CPF do signatário, integridade, política, revogação e versão. Não aceitar sucesso baseado em callback ou relato do usuário.
5. Arquivar bytes finais, SHA-256, evidências e histórico por município. Segunda assinatura em revisão incremental compatível; preservar a primeira. Revalidar competência e versão antes da transição atômica e idempotente de emissão. Nunca reconstruir o PDF assinado.
6. Testes de recusa: cross-tenant, alteração do PDF, CPF divergente, certificado revogado, callback repetido, sessão expirada, modalidade proibida, troca de lotação, documento desatualizado, rejeição de certificado e indisponibilidade do serviço. Testes reais de homologação e validação em https://validar.iti.gov.br/ para produção.
7. Só habilitar o botão de assinatura integrada quando os testes e a política municipal forem aprovados. Não substituir os controles existentes por links externos.

A interface atual fornece acesso ao assinador oficial GOV.BR e ao VALIDAR, sem registrar assinatura ou emitir alvará. O ICP-Brasil externo depende do assinador do titular. Não há importação certificada automática implementada nesta alteração.
