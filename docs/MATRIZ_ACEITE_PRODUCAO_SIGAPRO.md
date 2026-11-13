# SIGAPRO — Matriz de aceite técnico e de segurança

**Ambiente de trabalho:** QA, branch `fix/qa-triagem-analise-pagamento-20261101`, PR #118 DRAFT, sem merge em `main`.
**Regra:** nenhum sucesso de CI substitui prova funcional autenticada. Não liberar operações municipais reais, cobranças ou decisões técnicas só por screenshots, mocks ou testes sintéticos.
**Data de referência:** 07/11/2026.

## Condições obrigatórias para liberar uma prefeitura

Legenda: **CÓDIGO** = requisito implementado no código com teste; **PENDENTE** = requer prova real; **BLOQUEADO** = não pode ser anunciado como funcional/homologado.

| Eixo | Critério objetivo de aceite | Estado |
|---|---|---|
| Isolamento | Usuários e arquivos de duas prefeituras diferentes não se enxergam, nem por IDs/URLs adulterados ou links assinados; teste no Neon QA com duas entidades | **CÓDIGO/INSPEÇÃO QA** — tabelas principais com RLS e PK confirmadas por SQL; falta ensaio autenticado entre dois municípios |
| R2/IA | PDF vigente, mesmo `municipality_id` e `tenant_id`, etapa liberada, versão e autorização RPC válidas, antes de buscar bytes e antes de transmitir a qualquer provedor | **CÓDIGO** — `architectural-document-guard`, `ai-project-extract`, testes; E2E real pendente |
| Credenciais bancárias | AES-256-GCM, segregação por município/ambiente, chave fora do código; rotação e gestão de acesso a segredos | **CÓDIGO/PENDENTE** — cifragem e segregação existem; comprovação de rotação e cofre gerenciado pendentes |
| MFA e segurança operacional | MFA de perfis privilegiados, sessões revogáveis, limites de tentativas, WAF, auditoria de mutações críticas e revisão periódica de permissões | **PENDENTE** — não presumir como homologado |
| LGPD | Papéis de controlador/operador, inventário de dados, retenção, tratamento por terceiros, política de incidentes e avaliação de riscos | **PENDENTE** — documentação e aceite jurídico municipal |
| Backup e recuperação | Cópia isolada de Neon e R2, criptografia, restauração testada, RPO/RTO documentados | **PARCIAL** — snapshot Neon histórico acessível e relações críticas legíveis; restauração completa + backup/recuperação R2 e RPO/RTO ainda não testados |
| Planta arquitetônica | Extração por página (vetorial/OCR/visual), cota literal e unidade, referência de versão, recuos, área, taxa, CA, ausência de inferência legal, diagnóstico com erros/omissões conhecidos | **CÓDIGO/PENDENTE** — leitor e testes sintéticos existentes; prova com pranchas reais diversas não concluída |
| Confusão lei × projeto | Parâmetro/limite da lei não vira medida observada na planta sem evidência específica de projeto; valores conflitantes ou ilegíveis não viram cotas | **CÓDIGO** — `architecturalPdfReadings` + testes de limites; aceite humano permanece obrigatório |
| Leitura visual IA | Modelo visual com autorização, limite de custo, transferência consentida, privacidade e benchmark comparado ao gabarito do engenheiro | **OCR LOCAL QA COMPROVADO** — serviço de leitura de imagem raster sintética passou no CI, mas não integrado ao portal; análise geométrica por IA visual e benchmark em plantas reais continuam bloqueados |
| PDF DAM | Dados oficiais da prefeitura e responsável, PIX vinculado à guia, QR verificável, formato A4 sem deformar, prova legível e uma página quando aplicável | **CÓDIGO/PENDENTE** — proporção A4 protegida no gerador; validação visual+leitura de PDF arquivado pendente |
| Arquivo imutável | Reabertura da guia **original** sem emitir nova cobrança; `SHA-256` e armazenamento create-once; erro se arquivo original desapareceu | **CÓDIGO/PENDENTE** — fluxo implementado; E2E com guia real e reabertura pendente |
| Banco | Cobrança vinculada a valor/guia/município/ambiente, webhook assinado, pagamento consultado no provedor, baixa idempotente e auditoria | **CÓDIGO/INSPEÇÃO QA** — índices idempotentes confirmados e uma conexão MP de teste ativa; não houve baixa real. Worker QA detectado com BYPASSRLS/herança administrativa: correção de papel obrigatória |
| Banco próprio | Santander, Itaú, Caixa, Banco do Brasil, convênios municipais e GOVBR exigem contrato/API/layout e homologação específica por prestador | **BLOQUEADO** — seletor de banco não equivale a conector universal pronto |
| Protocolo | Numero oficial sequencial atribuído somente após confirmação válida de pagamento e etapa autorizada, triagem → análise sem saltos | **CÓDIGO/PENDENTE** — regras e testes existentes; ensaio completo externo/financeiro/protocolo pendente |
| UI premium | Todos os dashboards, abas, contraste, responsividade com menu lateral e hover sem texto quebrado em sessões Master/prefeitura/analista/externo | **CÓDIGO QA PUBLICADO, ACEITE PENDENTE** — versão anterior confirmada READY; novo release precisa SHA exato, além de inspeção visual em sessões Master/prefeitura/externo |
| Infra comercial | Hospedagem adequada à operação comercial, TLS, domínios, logs, backups, monitoramento, rollback | **PENDENTE** — não usar VPS de R$ 50 como solução única de prefeitura+IA GPU |

## Entradas obrigatórias da bateria de IA

- PDF com texto selecionável e cotas verdadeiras: planta e quadro de áreas.
- PDF rasterizado, de múltiplas pranchas, com bordas cortadas, baixa resolução ou rotação.
- Projeto com recuo esquerdo diferente do direito, medidas contraditórias e cotas ausentes.
- Legislação oficial com quadro de parâmetros: valores legais **não** podem aparecer como valores medidos no desenho.
- Controle documental: arquivo invalidado/substituído durante a leitura não pode produzir resultado aplicável.
- Separação por prefeitura e sessão: analista de um município jamais pode receber PDF de outro.
- Saída de cada caso: gabarito assinado por técnico, comparação campo por campo (precisão, omissão e falsa evidência), páginas e justificativas, sem aprovação automática.

## Bateria financeira e documental

- Emitir guia de teste vinculada a protocolo isolado; documentar identificadores de município, guia, processo, ambiente e banco.
- Conferir valor exato em centavos e linha digitável/QR com o provedor; valores divergentes = bloqueio.
- Repetir webhook, inverter ordem, enviar assinatura inválida, simular falha de rede e atraso: liquidação nunca duplica.
- Confirmar que `status pending` não é pago e que não há geração repetida de Pix ao reabrir PDF arquivado.
- Validar o PDF A4 com brasão, dados oficiais, contribuintes, QR legível, assinatura quando aplicável, ausência de corte e SHA arquivado.
- Só executar pagamento real simbólico com autorização expressa, credenciais de ambiente apropriado e conferência financeira designada.

## Evidências mínimas por execução

1. SHA exato do código e do deploy em homologação, `READY`, sem alterar produção.
2. Teste automatizado e vídeo/captura autenticada de cada papel.
3. Registro de resultados por processo, documento, banco, data, município de teste e método.
4. Logs sanitizados, sem tokens, cartões, CPF completos, chaves, dados sigilosos ou conteúdo de projetos reais.
5. Aprovação técnica e financeira assinada pelo responsável habilitado.

## Limites e política de implantação

- Manter `Neon QA` e `R2 QA` isolados, dados de teste identificados, sem usar credenciais bancárias de produção no ensaio.
- Sem merge `main`, sem alterar domínio oficial, sem migrar Neon produção e sem ativar a IA visual automaticamente.
- Vercel pode servir o front-end, mas a visualização no URL `*.vercel.app` depende da publicação do SHA correto; não há atualização por simples alteração no GitHub.
- Não contratar VPS, nuvem ou API paga automaticamente. Orçamento definido: até R$ 50/mês para testes auxiliares, com custos de IA externa previamente controlados.
