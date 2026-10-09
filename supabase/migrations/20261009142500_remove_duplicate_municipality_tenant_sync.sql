-- SIGAPRO: consolida a ponte técnica municipality -> tenant.
-- sync_municipality_tenant_root() é a implementação canônica e já preserva
-- compatibilidade/FKs legadas. A implementação anterior duplicava a mesma
-- escrita a cada alteração municipal.

drop trigger if exists trg_sync_municipality_to_legacy_tenant on public.municipalities;
drop function if exists public.sync_municipality_to_legacy_tenant();
