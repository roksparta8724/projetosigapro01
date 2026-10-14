-- SIGAPRO: guia interna de ISSQN/Projeto só pode chegar ao acesso externo
-- depois da liberação manual registrada em mensagem externa/mista.
-- A guia de protocolo continua visível automaticamente.

drop policy if exists payment_guides_select_scoped on public.payment_guides;

create policy payment_guides_select_scoped
on public.payment_guides
for select
to authenticated
using (
  public.is_master()
  or public.is_internal_municipality_role()
  or (
    public.has_process_access(process_id)
    and (
      coalesce(guide_kind, 'protocolo') = 'protocolo'
      or exists (
        select 1
        from public.process_messages m
        where m.process_id = payment_guides.process_id
          and m.audience in ('externo', 'misto')
          and nullif(btrim(payment_guides.guide_number), '') is not null
          and position(payment_guides.guide_number in coalesce(m.message, '')) > 0
      )
    )
  )
);

notify pgrst, 'reload schema';
