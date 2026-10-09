-- SIGAPRO: remove automações financeiras do modelo legado "projects".
-- As colunas legadas permanecem temporariamente para compatibilidade histórica.

drop trigger if exists pagamento_confirmado on public.payment_guides;
drop trigger if exists trigger_pagamento_confirmado on public.payment_guides;

drop function if exists public.confirmar_pagamento();
drop function if exists public.atualizar_status_projeto_pagamento();
