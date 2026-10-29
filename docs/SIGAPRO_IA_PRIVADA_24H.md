# SIGAPRO IA Privada — infraestrutura preparada, contratação posterior

Estado: **código pronto para integração, servidor não contratado nem homologado**.

## Arquitetura verificada
- SIGAPRO React/Vite na Vercel; `api/ai-assistant.ts` autentica cada sessão via RPC `get_current_profile_context` do Neon.
- Processos, legislação, guias e R2 continuam nos serviços atuais; este conector é **somente conversação assistiva**, sem OCR, geometria, aprovação automática, consulta a processos ou RAG.
- A pré-conferência urbanística determinística atual segue funcionando de modo independente. Não se usa o modelo para decidir recuos ou emitir alvará.

## Configurar somente depois de contratar e homologar a nuvem
Aguardar o administrador provisionar um gateway HTTPS dedicado, atrás do qual o modelo GPU (vLLM ou implementação compatível com OpenAI Chat Completions) fica **não exposto à internet**.

Cadastrar **apenas em Vercel → Projeto SIGAPRO → Environment Variables → Production**, sem prefixo `VITE_`:

| Nome | Valor esperado |
| --- | --- |
| `SIGAPRO_AI_PROVIDER` | `private` para habilitar o modo privado |
| `SIGAPRO_AI_GATEWAY_URL` | domínio HTTPS do gateway, *sem caminho*, ex.: `https://ia.sigapromunicipal.com.br` |
| `SIGAPRO_AI_GATEWAY_TOKEN` | token secreto de serviço gerado no gateway (mínimo 32 caracteres) |
| `SIGAPRO_AI_MODEL` | ID exato do modelo publicado no vLLM (ex.: `Qwen/Qwen3.5-9B`) |

**Nenhum segredo deve ser enviado ao GitHub, navegador, chat ou logs.** Gerar token aleatório seguro e guardar em gerenciador de segredos. Variáveis novas exigem implantação posterior na Vercel, feita somente quando a infraestrutura estiver verificada.

Ausência de `SIGAPRO_AI_PROVIDER` preserva o comportamento antigo (`openai`). Ao escolher `private`, ausência de URL/token/modelo retorna HTTP 503 e `SIGAPRO_PRIVATE_AI_NOT_CONFIGURED`. Falhas do servidor privado **nunca fazem fallback para OpenAI**.

## Requisitos mínimos de segurança do futuro gateway
1. HTTPS com certificado válido e domínio controlado; nenhum endereço IP, localhost ou porta privada configurável no app. TLS válido, redirecionamentos proibidos.
2. Gateway público com validação do `Bearer` **do serviço SIGAPRO**, limites por origem/uso e rate limiting. Só o gateway pode conversar com vLLM na rede interna. A Vercel deve conseguir alcançar o gateway por HTTPS.
3. Restringir acesso/saída, mitigar DNS rebinding/SSRF na infraestrutura, e fixar destino ao servidor de modelos. *A validação de URL do aplicativo não substitui proteção de rede/DNS no gateway*.
4. Não armazenar prompts ou anexos nos logs do proxy/vLLM; proteger credenciais, limitar requisições/tokens, monitorar erro/latência/uso, retenção, backups e alertas.
5. Não encaminhar documentos pessoais ou dados municipais completos à IA sem autorização/escopo, análise LGPD e consentimento/base legal adequada. Atualmente o endpoint só encaminha até 8 mensagens do usuário/assistente autenticado.
6. Isolar recuperação de normas por `municipality_id` autorizado pelo Neon e controle de acesso server-side antes de implementar RAG/OCR; nunca confiar no `municipalityId` enviado pelo navegador.
7. Em caso de falha, retornar resposta segura; nunca criar guia, concluir análise, assinar alvará ou alterar status a partir do modelo.

## Gates antes de ativar
- [ ] Contrato, localidade, proteção de dados, custos e SLA de GPU aprovados.
- [ ] Testes autenticados: usuário ativo/negado, duas prefeituras, indisponibilidade, timeout, solicitação indevida e vazamento de segredos.
- [ ] Gateway HTTPS acessível, token de serviço válido, resposta do modelo e restrições de rede comprovadas.
- [ ] Testes de concorrência, quotas por município, observabilidade e auditoria sem dados sensíveis.
- [ ] Inserção das variáveis no Vercel e promoção controlada após Quality Gate.
- [ ] Validação jurídica e técnica separada para análise de PDFs, OCR, RAG e regras oficiais.

O servidor de IA **não está sendo criado por este commit**. A preparação não gera custo de GPU.
