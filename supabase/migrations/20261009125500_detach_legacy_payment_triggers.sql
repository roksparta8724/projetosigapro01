-- SIGAPRO: isola o fluxo financeiro atual do modelo legado "projects".
-- Não remove tabelas nem dados históricos; apenas desconecta automações antigas
-- da tabela payment_guides, hoje utilizada pelo modelo canônico "processes".

drop trigger if exists pagamento_confirmado on public.payment_guides;
drop trigger if exists trigger_pagamento_confirmado on public.payment_guides;

-- O trigger trg_set_process_payment_guide_kind permanece ativo e pertence ao
-- modelo atual baseado em process_id/guide_kind.
