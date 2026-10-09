-- SIGAPRO: compatibilidade controlada entre o vocabulário financeiro
-- histórico e o fluxo atual. Novas operações usam:
--   protocolo | iss_obra | aprovacao_final
-- Registros históricos permanecem legíveis sem serem reinterpretados.

alter table public.payment_guides
  drop constraint if exists payment_guides_modern_kind_check;

alter table public.payment_guides
  add constraint payment_guides_kind_compat_check
  check (
    guide_kind is null
    or guide_kind in (
      'protocolo',
      'iss_obra',
      'aprovacao_final',
      'initial_protocol',
      'technical_analysis',
      'final_approval',
      'other',
      'post_communicate'
    )
  );

create or replace function public.set_process_payment_guide_kind()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.process_id is not null and nullif(btrim(new.guide_kind),'') is null then
    -- Guia sem tipo criada pelo fluxo atual é sempre a taxa inicial.
    new.guide_kind := 'protocolo';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_set_process_payment_guide_kind on public.payment_guides;
create trigger trg_set_process_payment_guide_kind
before insert or update of process_id,guide_kind on public.payment_guides
for each row
execute function public.set_process_payment_guide_kind();
