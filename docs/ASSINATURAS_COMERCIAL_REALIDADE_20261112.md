# SIGAPRO | Assinaturas eletrônicas, ICP-Brasil opcional e habilitação comercial
Data: 12/11/2026. Fonte: código `main`, consulta somente leitura ao Neon PROD e GET `/api/e-sign-artifact` (HTTP 200).

## Modos e situação comprovada
- **Assinatura eletrônica interna SIGAPRO:** serviço V2 ativo em produção; senha pessoal é revalidada pelo provedor Neon Auth, o servidor autentica o mesmo sujeito e a RPC grava papel, instante, IP, versão e hash SHA-256. As sete assinaturas históricas demonstradas no banco são `password_reauth`, 3 análise técnica e 4 Diretoria. Este registro eletrônico **não deve ser descrito como assinatura qualificada ICP-Brasil**. Nova jornada autenticada de todos os perfis ainda deve ser homologada.
- **ICP-Brasil qualificada (opcional):** existe o valor `icp_brasil` como opção cadastral herdada em `tenant_settings.signature_mode`, mas **não existe fluxo PAdES/CAdES verificado por cadeia ICP, certificado, carimbo/validação e prestador homologado** na aplicação. A escolha foi desabilitada no cadastro comercial para não vender uma capacidade apenas cadastral. Integrar um prestador de assinatura qualificada, validar CPF/CNPJ e identidade do signatário, consentimento, callbacks autenticados, certificado/cadeia/revogação, PDF assinado e original R2, antes de permitir `icp_brasil` como ativo. O fornecedor e suas credenciais devem ser exclusivos da prefeitura e nunca enviados ao browser.
- **GOV.BR**: assinatura avançada é diferente de ICP qualificada. Para uso por aplicativo precisa integração admitida pela plataforma pública.
- **Assinatura manuscrita/manual:** existe fluxo separado para PDF destinado à assinatura física; PDF preparado não pode ser confundido com assinatura eletrônica concluída.

## Perfis e poderes
Cada conta individual pode assinar **somente um documento ou ato ao qual esteja formalmente vinculada e autorizada**, nunca atos oficiais de qualquer prefeitura indiscriminadamente.
- Profissional externo: documentos/declarações de sua atribuição e pertencentes ao processo a que tem acesso; assinatura de alvará da Prefeitura é exclusiva dos cargos indicados.
- Analista responsável: análise técnica atual (não o Master).
- Fiscal designado: atos de fiscalização conforme atribuição.
- Diretoria: alvarás e pareceres no slot da Diretoria.
- Secretaria: assinatura complementar quando exigida/solicitada e após Diretoria.
- Admin da prefeitura: leitura/gestão de parâmetros conforme sua permissão, **sem assinatura de atos processuais em lugar dos responsáveis**.
- Proprietário: consulta, ciência e eventualmente assinatura de declaração própria quando houver fluxo com prova de identidade implementado. A existência de conta não significa autorização para assinar um alvará.
- Master: gestão da plataforma, não assinatura de decisão técnica em nome da Prefeitura.

## Regras para a opção ICP-Brasil no futuro
1. Prefeitura escolhe `eletronica` por padrão e pode solicitar qualificada, sem impactar outros municípios.
2. No modo qualificado, iniciar sessão com prestador credenciado e identificar signatário e papel.
3. Conferir documento exato (SHA-256 original) e assinar PAdES/CAdES comprovável, sem jamais transformar um registro de senha interno em certificado.
4. Receber retorno assinado do prestador; verificar token, status e certificado/chave/cadeia/validade/revogação, conforme o caso; realizar prova de cadeia independente e ler o PDF assinado no R2.
5. Registrar ID do provedor, carimbo, signatário, papel, município, hash antes/depois, auditoria, PDF e evidências para verificação pública.
6. Se não houver prestador/certificado, **bloquear apenas a modalidade ICP** e permitir eletrônica quando juridicamente aceita pela prefeitura. Se o ato exigir qualificada, não usar alternativa silenciosa.

## Preparação comercial
Planos e contratos já possuem cadastro e uma atribuição de plano `ativo`. No banco PROD ainda constam 0 provedores financeiros ativos em produção, 0 normas urbanísticas oficialmente ativadas e 0 configurações de cobrança ativas. Isso exige credenciais/convênio financeiro da prefeitura (ou importação oficial com Tesouraria), cadastro e conferência da lei vigente, e aceite de usuários em uma jornada real. **Publicar software não é habilitar automaticamente a operação financeira ou jurídica de um município.**

## Base legal
Lei federal 14.063/2020 classifica assinaturas em simples, avançada e qualificada: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm
ITI ICP-Brasil: https://www.gov.br/iti/pt-br/assuntos/icp-brasil/certificado-digital
GOV.BR assinatura avançada: https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada/assinatura-eletronica-avancada
