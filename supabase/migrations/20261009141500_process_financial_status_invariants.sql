-- SIGAPRO: invariantes financeiros de status no nivel da tabela de processos.
-- Protege contra atalhos por RPC, script administrativo ou codigo futuro.

create or replace function public.guard_process_financial_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _settings jsonb := '{}'::jsonb;
  _final_fee_enabled boolean := true;
  _has_pending_guide boolean := false;
  _protocol_paid boolean := false;
  _final_paid boolean := false;
  _has_open_requirements boolean := false;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(ms.general_settings,'{}'::jsonb)
    into _settings
  from public.municipality_settings ms
  where ms.municipality_id=coalesce(new.municipality_id,new.tenant_id)
  limit 1;

  _settings := coalesce(_settings,'{}'::jsonb);
  _final_fee_enabled :=
    coalesce((_settings->>'final_approval_fee_enabled')::boolean,true);

  select exists(
    select 1
    from public.payment_guides g
    where g.process_id=new.id
      and coalesce(g.paid,false)=false
      and coalesce(g.status,'pendente') not in ('compensada','confirmed','paid')
  ) into _has_pending_guide;

  select exists(
    select 1
    from public.payment_guides g
    where g.process_id=new.id
      and g.guide_kind='protocolo'
      and (
        coalesce(g.paid,false)=true
        or coalesce(g.status,'') in ('compensada','confirmed','paid')
      )
  ) into _protocol_paid;

  select exists(
    select 1
    from public.payment_guides g
    where g.process_id=new.id
      and g.guide_kind='aprovacao_final'
      and (
        coalesce(g.paid,false)=true
        or coalesce(g.status,'') in ('compensada','confirmed','paid')
      )
  ) into _final_paid;

  select exists(
    select 1
    from public.process_requirements r
    where r.process_id=new.id
      and r.status in ('aberta','respondida')
  ) into _has_open_requirements;

  if new.status='pagamento_pendente'::public.process_status
     and not _has_pending_guide then
    raise exception 'Processo nao pode entrar em pagamento pendente sem guia pendente';
  end if;

  if new.status='analise_tecnica'::public.process_status
     and not _protocol_paid then
    raise exception 'Analise tecnica exige guia de protocolo compensada';
  end if;

  if new.status='deferido'::public.process_status then
    if coalesce(new.is_on_hold,false) then
      raise exception 'Processo sobrestado nao pode ser deferido';
    end if;

    if _has_open_requirements then
      raise exception 'Processo com exigencia aberta ou respondida nao pode ser deferido';
    end if;

    if _final_fee_enabled and not _final_paid then
      raise exception 'Deferimento exige guia final de aprovacao compensada';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_process_financial_transition on public.processes;

create trigger trg_guard_process_financial_transition
before update of status on public.processes
for each row
execute function public.guard_process_financial_transition();

revoke all on function public.guard_process_financial_transition() from public;
revoke all on function public.guard_process_financial_transition() from authenticated;
