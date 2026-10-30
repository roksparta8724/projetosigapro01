# SIGAPRO IA — Consulta ao cadastro legal municipal (sem enviar dados ao modelo)

Status: módulo de **consulta read-only**. Não é RAG, não realiza OCR, não cria/ativa legislação ou aprova processos.

## Por que isso existe
A auditoria em 29/10/2026 encontrou no Neon oficial:
- 0 `urban_regulation_versions`;
- 0 `urban_legal_evidence_catalog`;
- 0 `urban_legal_evidence_scopes`;
- 0 `process_urban_precheck_runs`.

O upload de uma lei em PDF não gera regras automaticamente. Mesmo com uma resposta coerente da Cloudflare, sem normas oficialmente cadastradas não é possível falar em conformidade urbanística.

## Consulta segura
`GET /api/ai-legal-readiness`:
- exige token de sessão Neon válido, conta ativa e prefeitura definida;
- a prefeitura vem somente da identidade verificada por `get_current_profile_context`; nunca do querystring ou do navegador;
- duas RPCs existentes da base oficial, `list_urban_regulation_versions_v1` e `list_urban_legal_evidence_v2`, reforçam autorização de perfil interno e isolamento de tenants;
- seleciona somente normas **ativas, vigentes e com limites numericamente validados**;
- seleciona somente evidências verificadas, com hash SHA-256, página, zona, uso, período vigente e método documentado;
- apresenta até 6 evidências para conferência **humana**; a listagem de normas é limitada a 200 e evidências a 250 pelas RPCs do Neon. Se a página estiver cheia, o resultado indica truncamento potencial;
- nunca invoca Cloudflare Workers AI, não expõe chave de API, não lê PDFs do R2, não grava no Neon e não retorna conclusão de conformidade;
- falha sem mostrar dados quando sessão, perfil ou catálogo falham.

## Próximo gate
1. Prefeitura publica arquivos oficiais pelo fluxo institucional.
2. Administração insere e aprova parâmetros por zona/uso com referência legal e data de vigência.
3. Cada trecho de lei é conferido humanamente na página/arquivo original e catalogado com método de verificação.
4. Testes com dois municípios de dados autorizados, datas de vigência, regras conflitantes, revogações, RLS e perfis externos.
5. Somente depois desenvolver RAG read-only com citações verificáveis; exigir revisão LGPD antes de enviar conteúdo legal ou dados de processos a fornecedor externo.
6. Mesmo com RAG, recuos, áreas e índices devem ser validados por cálculo determinístico e conferência do analista.

Nenhum dado ou credencial deve ser compartilhado no chat; não escrever dados de legislação fictícia na produção.
