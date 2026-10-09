-- SIGAPRO: identidade financeira canônica.
-- Uma Prefeitura não pode ter duas guias operacionais com o mesmo número.

create unique index if not exists payment_guides_municipality_number_uidx
  on public.payment_guides(municipality_id, guide_number)
  where process_id is not null
    and municipality_id is not null
    and guide_number is not null
    and btrim(guide_number) <> '';
