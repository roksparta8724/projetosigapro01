# SIGAPRO — gateway privado de IA para futura GPU

**Estado:** arquivos preparados, **sem GPU contratada, sem DNS, sem chave, sem novo custo de servidor**.

## Componentes
- `gateway/gateway.mjs`: endpoint compatível com chat OpenAI, protegido por token, comparação constante, validação de entrada/modelo, limite de 30 chamadas/min e 2 simultâneas **por contêiner**, tamanho e tempo limitados. Não registra prompts nem credenciais.
- `gateway/gateway.test.mjs`: 7 testes locais de autenticação, resposta, rejeições, limites, erros e remoção de parâmetros não autorizados; sem API paga.
- `compose.yaml`, `Caddyfile`, `gateway/Dockerfile`: configuração inicial para Caddy HTTPS + Node gateway + vLLM na rede interna. Só Caddy publica portas.
- CI da branch passa a executar `node --test infra/private-ai/gateway/gateway.test.mjs`.

## Quando for contratado o servidor
1. Selecionar região, GPU/VRAM, orçamento e licença do modelo; assinar condições LGPD e retenção.
2. Configurar DNS para o domínio de IA, TLS, firewall (80/443 públicos, SSH restrito) e política de backup.
3. Instalar Docker Engine/Compose, driver NVIDIA e NVIDIA Container Toolkit; testar `nvidia-smi` e GPU no contêiner.
4. Copiar `infra/private-ai/.env.example` para `.env` **somente no host privado**, substituir TODOS os exemplos; gerar token forte com `openssl rand -hex 32`. Não registrar segredos no GitHub.
5. Selecionar imagem e versão vLLM **compatíveis com a GPU**, fixar versão/digest antes de operar dados municipais. Usar `docker compose config` para revisão e então `docker compose up -d --build`, na pasta `infra/private-ai`.
6. Validar TLS, autenticação do gateway, health, erros, timeout, concorrência, disponibilidade, logs sem dados sensíveis e isolamento entre municípios.
7. Somente após homologação, configurar variáveis **server-side** na Vercel: `SIGAPRO_AI_PROVIDER=private`, `SIGAPRO_AI_GATEWAY_URL=https://<dominio-real>`, `SIGAPRO_AI_GATEWAY_TOKEN`, `SIGAPRO_AI_MODEL`. Fazer deploy controlado e testar com contas autorizadas.

## Limitações e segurança
- Isso é um conector para **assistente conversacional**; não realiza OCR, CAD, análise geométrica, RAG, aprovação urbanística, pagamentos ou assinaturas.
- A sessão do usuário segue autorizada na Vercel/Neon; o gateway apenas autentica o **serviço SIGAPRO**, não substitui RLS.
- OCR, documentos e RAG futuros exigirão escopo municipal e verificação de permissões antes de recuperar qualquer informação.
- Limites por prefeitura/tenant, rate-limit distribuído, WAF, observabilidade, alta disponibilidade e proteção de rede/egress/DNS deverão ser acrescentados ou homologados **antes de operar múltiplas prefeituras em produção**.
- O template não garante por si só segurança contratual, disponibilidade 24/7 nem acesso real à GPU.
- Não habilitar `SIGAPRO_AI_PROVIDER=private` até o gateway completo estar validado.

Fontes técnicas: https://docs.vllm.ai/en/latest/deployment/docker/ ; https://docs.docker.com/compose/how-tos/gpu-support/ .
