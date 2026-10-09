-- SIGAPRO: reemissão não pode apagar histórico nem desfazer pagamento.

alter table public.payment_guides
  add column if not exists original_due_date date,
  add column if not exists reissue_count integer not null default 0,
  add column if not exists last_reissued_at timestamptz;

create or replace function public.reissue_process_payment_guide(
  _process_id uuid,
  _guide_kind text,
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date,current_date + 2);
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido';
  end if;

  if _due < current_date then
    raise exception 'O novo vencimento nao pode estar no passado';
  end if;

  select p.tenant_id,p.municipality_id
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para reemitir guia';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
  for update;

  if _guide.id is null then
    raise exception 'Guia nao encontrada para reemissao';
  end if;

  if coalesce(_guide.paid,false)=true
     or coalesce(_guide.status,'') in ('compensada','confirmed','paid') then
    raise exception 'Guia ja compensada nao pode ser reemitida';
  end if;

  update public.payment_guides
     set original_due_date=coalesce(original_due_date,due_date),
         due_date=_due,
         status='pendente',
         reissue_count=coalesce(reissue_count,0)+1,
         last_reissued_at=now()
   where id=_guide.id
   returning * into _guide;

  update public.processes
     set status='pagamento_pendente',
         updated_at=now()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia reemitida',
    'Segunda via #'||_guide.reissue_count::text||
      ' da guia '||coalesce(_guide.guide_number,'')||
      ' emitida com vencimento em '||to_char(_due,'DD/MM/YYYY')||'.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide)
  );
end;
$function$;

revoke all on function public.reissue_process_payment_guide(uuid,text,date) from public;
grant execute on function public.reissue_process_payment_guide(uuid,text,date) to authenticated;
