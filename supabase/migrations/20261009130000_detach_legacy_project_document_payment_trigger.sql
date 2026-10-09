-- SIGAPRO: preserva o histórico do modelo antigo sem permitir que ele gere
-- novas cobranças na tabela compartilhada payment_guides.
--
-- project_documents/projects permanecem intactos para consulta histórica.

drop trigger if exists trigger_generate_payment on public.project_documents;
