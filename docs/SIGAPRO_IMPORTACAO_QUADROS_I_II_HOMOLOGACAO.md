# Importação assistida de Quadro I e II — QA (30/10/2026)
Implementado em branch de homologação. Na interface, o administrador seleciona o PDF oficial já arquivado ou baixado, informa a página física e cola o trecho exato da tabela. A IA Cloudflare recebe APENAS o trecho com consentimento explícito e sugere candidatos com citação literal, sempre sujeitos a conferência humana.

**Limite atual:** não existe OCR de PDF integral, nem interpretação automática da página digitalizada, nem georreferenciamento da zona. A primeira fase usa extração de texto manualmente copiado do PDF. Tabelas escaneadas exigem transcrição e dupla conferência humana.

Quadro I: candidatos das oito métricas pré-existentes; ao confirmar, salva evidência documentada por SHA-256, página, zona, uso, vigência e método e cria somente versão DRAFT via RPC existente. Quadro II: condições textuais separadas em tabela de matrizes, versionadas como REVIEWED_DRAFT. Quadro II não cria nem ativa permissão urbanística. Nenhum comando de ativação automática foi incorporado.

Nova migração: neon/migrations/20261030_urban_legal_matrix_import_v1.sql; executar primeiro somente em branch Neon isolada. Tabela com RLS forçada, sem grants diretos ao authenticated; RPCs SECURITY DEFINER verificam admin e escopo de município. Quadro e páginas são informados manualmente; fonte e vigência ainda precisam ser conferidas por servidor competente.

**Limitação transacional:** a gravação de matriz, evidências e regras utiliza RPCs separados; falha intermediária pode deixar revisão sem a regra numérica correspondente. Todas permanecem DRAFT, nunca ativa. Para produção, é recomendado consolidar em transação RPC idempotente.

**Gate:** QA com uma prefeitura piloto e outra prefeitura isolada, datas e revogações, documentos completos, CORS/R2, dois perfis de autorização, fluxos de erro, referência da lei vigente e validação humana. Preview da Vercel usa endpoints validados da produção por padrão; não usar preview para escrever enquanto não apontar a Neon QA com AUTH e DATA API do mesmo branch.

Não altera tabelas oficiais ainda e não transfere PDFs integrais à IA.