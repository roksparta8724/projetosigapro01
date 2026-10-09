-- SIGAPRO: numeração de guia é única dentro de cada Prefeitura, não globalmente.
-- O índice canônico payment_guides_municipality_number_uidx já protege o escopo municipal.

drop index if exists public.payment_guides_number_unique;
