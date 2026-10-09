# SIGAPRO — Arquitetura canônica Neon

Este documento registra as regras técnicas do SIGAPRO após a revisão arquitetural de outubro/2026.

## 1. Backend oficial

- **Neon PostgreSQL + Neon Auth + Neon Data API** são a fonte oficial do SIGAPRO.
- Supabase permanece somente como **compatibilidade/rollback explícito**.
- O modo padrão do aplicativo é Neon.
- Supabase só pode ser ativado deliberadamente com `VITE_BACKEND=supabase`.
- Os domínios oficiais `sigapromunicipal.com.br` e `*.sigapromunicipal.com.br` são sempre Neon.

## 2. Modelo operacional

- `public.processes` é a tabela canônica de processos.
- `public.process_documents`, `public.payment_guides`, `public.process_requirements`,
  `public.interdepartmental_dispatches`, `public.process_messages` e
  `public.process_markers` compõem o workflow operacional.
- `projects`, `project_documents` e `project_payments` são **histórico legado**.
- Dados legados não devem ser apagados sem migração específica, mas novas funcionalidades
  não podem escrever no modelo `projects`.
- Triggers legados que alteravam `payment_guides` ou geravam cobrança a partir de
  `project_documents` devem permanecer desligados.

## 3. Protocolo

Fluxo oficial:

1. profissional preenche o protocolo;
2. arquivos são enviados ao R2;
3. o protocolo é persistido no Neon;
4. somente depois da confirmação do Neon a UI considera o protocolo concluído;
5. a guia inicial de protocolo é criada junto com o processo;
6. a UI recarrega o processo do Neon.

Protocolos antigos que existam apenas no navegador devem ser reconciliados de forma
idempotente, preservando o número original quando seguro.

## 4. Financeiro

Guias devem representar documentos realmente emitidos.

- **Protocolo:** criada na abertura oficial do processo.
- **ISSQN da obra:** criada somente quando o setor fiscal/IPTU emitir.
- **Taxa final / Habite-se:** criada somente quando o processo cumprir as condições para fechamento.
- Uma tabela de taxas alterada hoje não pode alterar retroativamente o valor de uma guia já emitida.
- Confirmação e reemissão são operações persistidas no Neon.
- Nunca inferir guia futura apenas calculando um valor no frontend.

## 5. Workflow

Toda ação que muda um processo deve sobreviver a F5, nova sessão e outro subdomínio.

Devem ser persistidos no Neon:

- despacho entre setores;
- recebimento/conclusão/devolução de despacho;
- exigências e respostas;
- revisão e anotação documental;
- mensagens;
- marcadores;
- checkpoint;
- sobrestamento;
- visibilidade externa;
- mudança de status;
- reabertura;
- anexos complementares;
- emissão, confirmação e reemissão financeira.

O frontend deve recarregar o estado oficial após a operação.

## 6. R2

- O valor persistente é o `objectKey/filePath`.
- O endpoint `*.r2.cloudflarestorage.com` é endpoint S3 privado e **não é URL pública**.
- Sem `R2_PUBLIC_BASE_URL`, o sistema deve gerar URL GET assinada no momento da leitura.
- URLs temporárias assinadas não devem ser tratadas como endereço permanente do arquivo.

## 7. LocalStorage

Permitido para:

- rascunho de protocolo;
- cache de bootstrap;
- cache de sessão visual;
- preferências locais.

Não permitido como fonte oficial para:

- processos;
- guias;
- usuários;
- workflow;
- configurações municipais;
- pagamentos.

Em produção, falha do Neon deve resultar em estado operacional seguro/vazio, nunca em dados demo.

## 8. Integrações no frontend

Código de tela/hook deve importar operações de banco por:

- `@/integrations/backend/databaseClient`
- `@/integrations/backend/platform`
- `@/integrations/backend/municipality`

Os arquivos sob `integrations/supabase/*` permanecem temporariamente como implementação
legada interna/fallback e não devem ser usados diretamente por novas telas.

## 9. Identidade municipal

- `municipality_id` é a identidade de negócio da Prefeitura.
- A compatibilidade técnica com `tenant_id` deve respeitar a invariável documentada nas migrations.
- Papéis devem usar códigos canônicos.
- Toda operação deve respeitar RLS e escopo municipal.

## 10. Regra de manutenção

Antes de adicionar uma nova ação ao SIGAPRO:

1. definir onde ela é persistida no Neon;
2. garantir RLS/permissão;
3. criar RPC quando a operação exigir transação ou auditoria;
4. carregar o dado novamente no loader remoto;
5. só então adicionar a interação de UI;
6. nunca criar uma segunda fonte de verdade no navegador.
