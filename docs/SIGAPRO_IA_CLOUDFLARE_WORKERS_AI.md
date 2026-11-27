# SIGAPRO IA — Integração opcional com Cloudflare Workers AI

Estado: **código de integração preparado, sem token nem conta configurados e sem prova de inferência real**.

## Para que serve
O endpoint autenticado \`/api/ai-assistant\` pode ser ligado ao Workers AI da Cloudflare **sem API paga da OpenAI e sem contratar GPU própria**, dentro da franquia gratuita aplicável da conta Cloudflare. Não acessa documentos R2, dados bancários, processos nem leis por conta própria. Não realiza OCR, RAG, geometria ou aprovação urbanística.

A API oficial da Cloudflare mantém compatibilidade Chat Completions em
\`POST https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1/chat/completions\`.

## Configuração futura pelo administrador na Vercel
Na conta da Cloudflare, criar token dedicado **Workers AI Read/Edit**, sem usar a chave R2.
Na Vercel, projeto oficial SIGAPRO → Settings → Environment Variables, cadastrar **Production** e **sem prefixo \`VITE_\`**:

| Chave | Valor |
| --- | --- |
| \`SIGAPRO_CF_ACCOUNT_ID\` | ID hexadecimal de 32 caracteres da conta Cloudflare Workers AI |
| \`SIGAPRO_CF_API_TOKEN\` | Token secreto \`SIGAPRO-IA\` criado no painel; armazenar como Sensitive/Secret |
| \`SIGAPRO_AI_PROVIDER\` | \`cloudflare\` (ativar **somente após** as duas variáveis anteriores) |
| \`SIGAPRO_CF_MODEL\` | Opcional. O padrão é \`@cf/zai-org/glm-4.7-flash\` |

Nunca enviar o token no chat, publicar no GitHub, adicionar \`VITE_\` ou inserir em screenshots. Um redeploy controlado da Vercel é necessário para aplicar variáveis alteradas.

A seleção de modelo é limitada no código a \`@cf/zai-org/glm-4.7-flash\` e \`@cf/meta/llama-3.1-8b-instruct\`. Nenhum modelo sujeito a plano pago é selecionável via variável.

## Gate de homologação
1. Registrar no dashboard Cloudflare o consumo atual e confirmar o plano Free; **não presumir saldo apenas por criar token**.
2. Configurar no Vercel os valores secretos e definir \`SIGAPRO_AI_PROVIDER=cloudflare\`. Verificar o destino correto antes de alterar Production.
3. Executar uma implantação controlada para ativar as novas variáveis.
4. Com um login ativo do SIGAPRO, fazer uma pergunta genérica (sem CPF, anexos, propriedade ou dados municipais), conferir resposta e contabilização no painel Workers AI.
5. Testar sessão expirada, perfil suspenso, sobrecarga, quota 429 e indisponibilidade. Não encaminhar dados municipais reais à nuvem antes de aprovação LGPD, contrato e controles de retenção.
6. Para uma IA técnico-jurídica que analise leis e projetos, desenvolver RAG com isolamento por prefeitura e referências oficiais; o assistente atual é apenas conversacional.

No plano Workers Free há uma franquia de 10.000 neurons/dia; acima da franquia novas operações falham até o reset. No plano Workers Paid, excedentes podem ser cobrados. Verificar preços e políticas antes de habilitar tráfego real.

**O conector \`private\` para GPU própria permanece disponível**. Cada modo exige ativação explícita; nenhum modo faz fallback automático para outro fornecedor.

Referências: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/ ; https://developers.cloudflare.com/workers-ai/platform/pricing/ ; https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/
