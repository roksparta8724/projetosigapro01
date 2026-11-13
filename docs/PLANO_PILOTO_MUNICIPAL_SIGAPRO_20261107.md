# SIGAPRO — plano técnico de habilitação municipal
**Data-base:** 07/11/2026 · **Escopo:** branch QA `fix/qa-triagem-analise-pagamento-20261101`, PR #118 em rascunho.
**Natureza:** critérios de arquitetura e aceite, **não** laudo de segurança nem declaração de sistema homologado.

## Decisão de arquitetura: preservar e fortalecer, não trocar tudo

| Camada | Decisão | Condição de liberação |
|---|---|---|
| Portal e API | Manter Vercel; deploy de QA separado da `main` e produção | SHA exato, checks concluídos, sessão real testada, rollback validado |
| Dados transacionais | Manter Neon PostgreSQL com RLS e RBAC por município | Duas prefeituras autenticadas, tentativa de acesso cruzado por IDs e URLs, backup restaurado |
| PDFs e evidências | Manter R2 privado; arquivos originais imutáveis por chave/hash | Verificar objeto arquivado, SHA-256, reabertura sem novo PIX, controle de versões e recuperação R2 |
| Leitura de PDF | Texto selecionável local `native_text`; OCR raster isolado; IA visual opcional | Cada página auditada, identidade da versão confirmada, gabarito do analista, nunca decisão automática |
| Cargas demoradas | Fila de tarefas com estado e reexecução idempotente; candidato: Cloudflare Queues + DLQ | Job pertence a `municipality_id` e `document_id`; prazo, tentativas, retenção, bloqueio de PDF substituído |
| Pagamentos | Adaptadores isolados por provedor e município, seguindo API/contrato do banco | Credenciais por prefeitura e ambiente, retorno assinado, baixa idempotente, centavos exatos, conciliação real |
| Auditoria | Rastreamento administrativo + logs técnicos sem dados privados | ID do evento, usuário, perfil, município, processo, antes/depois conforme política, retenção definida |
| Segurança | OWASP ASVS 5.0 como matriz de teste; LGPD, resposta a incidentes, gestão de acesso | MFA privilegiado, least privilege, inventário de dados, DPIA/RIPD quando aplicável, teste independente |

## Ordem de execução técnica — não pular etapa

### P0 — impedir danos materiais, vazamento e parecer inválido

1. **Isolamento entre prefeituras:** executar em QA com duas contas autênticas; tentar IDs de processo, PDF, DAM e URLs assinadas pertencentes a município diferente. Esperado: acesso negado sem divulgar metadados.
2. **Pagamento e protocolo:** em ambiente bancário de teste, emitir uma guia legítima e imutável, conferir QR/valor, confirmar liquidação no provedor, repetir webhook, simular assinatura inválida, rede indisponível, valor incorreto e conciliação após PDF original. Apenas confirmação bancária válida gera baixa e numeração do protocolo; jamais tratar evento sintético como pago.
3. **Integridade documental:** verificar SHA de PDF no R2, documentos substituídos/invalidos e a impossibilidade de emitir nova cobrança ao reabrir a guia já arquivada. Conferir layout A4 com a identidade real da prefeitura e dos declarantes autorizados.
4. **Parecer e IA:** validar ao menos uma planta real e uma planta de teste com medidas conflitantes, pixels ilegíveis, PDFs rotacionados, multicamada e escaneados; confronto com gabarito técnico assinado. A ausência de evidência é **não avaliado**, nunca **conforme** ou **não conforme**.
5. **Regras municipais:** tabela oficial de parâmetros urbanísticos com lei, artigo, versão, vigência, zoneamento, uso e página. Sem imóvel/geometria municipal homologada, não calcular enquadramento jurídico. AIU(2) continua provisório até CONCIDADE.
6. **Privilégios:** role exclusivo de webhook sem BYPASSRLS, SUPERUSER, herança administrativa ou grants diretos a processos e guias. A QA ainda requer corrigir seu role; o role de produção foi verificado apenas por metadados, não por login e execução.
7. **Backups:** ensaio completo de restauração do banco, arquivos R2 e autenticação, medindo perda de dados e tempo de recuperação (RPO/RTO), sem tocar no domínio oficial.

### P1 — operação municipal diária

1. Master: somente funções contratuais e monitoramento autorizados; revisão específica de acesso a conteúdo municipal e perfis privilegiados.
2. Admin Prefeitura: leitura de processos, dashboards e parâmetros do plano; alteração de regras municipais somente por fluxo jurídico autorizado; nenhuma decisão técnica ou baixa financeira por atalhos.
3. Protocolo/triagem: guia, confirmação, sequência, anexos, comunique-se e redistribuição auditados.
4. Analista/fiscal/diretor: filas, pranchas, marcações, fotos, revisão técnica, assinatura, alvarás, habite-se e histórico auditável.
5. Profissional externo/proprietário: cadastro, documentos, cobranças, correções e acompanhamento sem informações de terceiros.
6. Revisão visual responsiva com contas reais, navegação sem recarregamento indevido de PDF, contrastes AA, texto em cards, feedback de erro, telas de leitura e impressão em A4.
7. Monitoramento: disponibilidade, falhas de API, fila de jobs, atraso de webhook, taxa de erro do OCR, sinalização de incidente e retenção mínima de logs definida.

## Contrato mínimo do pipeline de leitura técnica

`document_id` + `process_id` + `municipality_id` + `version` + `sha256` identificam uma única entrada. O servidor valida autenticação, perfil, etapa de análise, município, documento vigente e R2 **antes** da leitura. Processamento não deve receber URLs arbitrárias do navegador nem tokens administrativos.

- **Local:** interpretar apenas texto selecionável; sem crédito de IA, sem inferir geometria ou conformidade.
- **OCR:** em sandbox isolado e sem rede de saída quando possível, converter cada prancha em imagem e recuperar texto com página e eventual qualidade de leitura; resultados são rascunhos. O protótipo `tools/ocr` **não está integrado ao portal**. Antes de integrar, exigir fila autenticada, antimalware, isolamento, limites, criptografia e retenção.
- **Visão:** ativada por prefeitura e provedor, com contrato/privacidade, limite de custos, autorização explícita para transferência do PDF, página e citação verificável; a assinatura ChatGPT Plus não fornece credencial de API.
- **Parecer:** sempre separado dos passos anteriores; comparar somente valores revisados por técnico e parâmetros legais oficialmente ativados, registrando diferenças, ausências e conflitos.
- **Correção de 07/11:** `quoteSupportsArchitecturalReading` precisa rejeitar o primeiro número quando uma mesma citação contém limite legal e cota projetada. Nem `mínimo`/ `máximo` sem marcador explícito nem o termo `proposto` em outra frase convertem limite legal em cota. Testes no arquivo `src/test/architecturalPdfLegalLimitVsObserved.test.ts`.

## Critérios de aceite — prova, não intenção

O manifesto `docs/QA_COMMERCIAL_ACCEPTANCE.json` lista 10 itens obrigatórios. Todos permanecem `pending` até evidência autenticada, revisão independente e correspondência ao SHA da versão. O verificador de aceite está em `scripts/qa-commercial-acceptance.mjs`; um build verde não aprova automaticamente nenhuma prefeitura.

**Saída por piloto (duas prefeituras independentes):** termo de aceite do responsável técnico, responsável por segurança, responsável financeiro e gestor municipal; referências verificadas a logs sanitizados, relatório de leitura com gabarito, PDFs arquivados, provas de liquidação de sandbox, testes de restauração e imagens das telas. Não compartilhar dados pessoais ou segredos em GitHub/ChatGPT.

## Gestão de riscos e custos

- **Não contratar automaticamente VPS, plano Pro, API de IA ou serviço bancário.** Cloudflare R2 tem criptografia automática em repouso; isso não substitui políticas de acesso, backup independente e recuperação.
- **Não dimensionar VPS econômica como infraestrutura municipal única.** Worker de OCR isolado pode ser usado experimentalmente; produção exige avaliação de carga, segurança, isolamento e custo por prancha.
- **Não depender de uma única API de IA.** Quando o provedor cair, a plataforma deve preservar documentos, protocolo, fila e registros; diagnóstico permanece indisponível em vez de inventado.
- **Separação legal:** requisitos brasileiros e atribuições de controlador/operador devem ser revisados conforme o contrato e a legislação municipal; nenhuma interpretação automatizada substitui ato formal da prefeitura.
- **Regras de incidente:** avaliar risco/dano relevante e, quando aplicável, cumprir prazo de comunicação da Resolução ANPD nº 15/2024. Manter rastreabilidade e plano de resposta.

## Referências oficiais verificadas em 07/11/2026

- OWASP ASVS 5.0: https://asvs.owasp.org/
- ANPD — comunicação de incidente: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
- ANPD — guia de segurança: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
- Banco Central — Manual de Padrões de Iniciação Pix: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
- Cloudflare Queues e DLQ: https://developers.cloudflare.com/queues/ ; https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- Cloudflare R2 segurança: https://developers.cloudflare.com/r2/reference/data-security/
- Vercel Functions limites: https://vercel.com/docs/functions/limitations

**Política de release:** PR #118 permanece `draft`; não migrar `main`, `sigapromunicipal.com.br`, Neon production, credenciais ou dados reais sem os gates acima. Após CI verde, publicar uma única versão QA identificada com `[deploy-qa]` e comprovar SHA e status READY.
