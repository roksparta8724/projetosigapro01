-- SIGAPRO: Ficha Técnica da Análise — estado oficial compartilhado.
-- Migração PREPARADA, NAO EXECUTADA. Aplicar somente na publicação autorizada.
-- Rascunho é mutável; versões assinadas continuam imutáveis em signature_blocks.
begin;

create table if not exists public.process_analysis_sheets (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  tenant_id uuid null references public.tenants(id) on delete set null,
  process_id uuid not null references public.processes(id) on delete cascade,
  version integer not null default 1,
  analysis_date date null,
  sheet_number text not null default '1',
  header_snapshot jsonb not null default '{}'::jsonb,
  items jsonb not null default '{}'::jsonb,
  routing text null,
  routing_other text null,
  conclusion text null,
  communique_pages text null,
  technical_signature jsonb null,
  fiscal_signature jsonb null,
  status text not null default 'rascunho',
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, process_id)
);

alter table public.process_analysis_sheets
  add column if not exists sheet_payload jsonb not null default '{}'::jsonb;
alter table public.process_analysis_sheets
  add column if not exists revision bigint not null default 0;

create index if not exists idx_process_analysis_sheets_process
  on public.process_analysis_sheets(process_id);

alter table public.process_analysis_sheets enable row level security;
drop policy if exists process_analysis_sheets_select_scoped on public.process_analysis_sheets;
create policy process_analysis_sheets_select_scoped
  on public.process_analysis_sheets for select to authenticated
  using (public.has_process_access(process_id));
drop policy if exists process_analysis_sheets_write_scoped on public.process_analysis_sheets;
-- Nao conceder escrita direta: o RPC abaixo valida o responsavel e a revisao.
revoke insert, update, delete on public.process_analysis_sheets from authenticated;
grant select on public.process_analysis_sheets to authenticated;

create or replace function public.get_process_analysis_sheet_v2(_process_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = pg_catalog, public
set row_security = off
as $fn$
declare _row public.process_analysis_sheets%rowtype;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem permissao para consultar esta ficha.';
  end if;
  select * into _row from public.process_analysis_sheets
   where process_id = _process_id;
  if _row.id is null then
    return jsonb_build_object('found',false,'revision',0,'payload',null);
  end if;
  return jsonb_build_object(
    'found',true,'revision',_row.revision,
    'payload',_row.sheet_payload,'updated_at',_row.updated_at,
    'updated_by_profile_id',_row.updated_by_profile_id
  );
end;
$fn$;

create or replace function public.save_process_analysis_sheet_v2(
  _process_id uuid,
  _payload jsonb,
  _expected_revision bigint
)
returns jsonb
language plpgsql
volatile security definer
set search_path = pg_catalog, public
set row_security = off
as $fn$
declare
  _process public.processes%rowtype;
  _sheet public.process_analysis_sheets%rowtype;
  _new_revision bigint;
  _municipality uuid;
  _actor uuid;
begin
  if not public.can_write_process_analysis(_process_id) then
    raise exception 'Somente o analista responsavel ou a Diretoria autorizada pode salvar a analise.';
  end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object'
     or _payload->>'schema' <> 'sigapro.urban-analysis-checklist.v2'
     or _payload->>'processId' <> _process_id::text
     or jsonb_typeof(_payload->'items') <> 'object'
     or pg_column_size(_payload) > 262144 then
    raise exception 'Conteudo da ficha invalido.';
  end if;
  if _expected_revision is null or _expected_revision < 0 then
    raise exception 'Revisao esperada e obrigatoria.';
  end if;

  select * into _process from public.processes where id = _process_id for update;
  if _process.id is null then raise exception 'Processo inexistente.'; end if;
  _municipality := coalesce(_process.municipality_id,_process.tenant_id);
  if _municipality is null or _payload->>'municipalityId' <> _municipality::text then
    raise exception 'A ficha pertence a outro municipio.';
  end if;
  _actor := public.current_profile_id();
  if _actor is null then raise exception 'Perfil invalido.'; end if;

  select * into _sheet from public.process_analysis_sheets
   where process_id=_process_id for update;

  if _sheet.id is null then
    if _expected_revision <> 0 then
      raise exception 'CONFLITO_REVISAO: ficha criada por outro usuario.';
    end if;
    insert into public.process_analysis_sheets(
      municipality_id,tenant_id,process_id,version,analysis_date,sheet_number,
      items,routing,routing_other,conclusion,communique_pages,sheet_payload,
      revision,status,updated_by_profile_id
    ) values (
      _municipality,_process.tenant_id,_process_id,2,
      nullif(_payload->>'analysisDate','')::date,
      coalesce(nullif(_payload->>'sheetNumber',''),'1'),
      _payload->'items',_payload->>'routing',_payload->>'routingOther',
      _payload->>'conclusion',_payload->>'communiquePages',_payload,
      1,'rascunho',_actor
    );
    _new_revision := 1;
  else
    if _sheet.revision <> _expected_revision then
      raise exception 'CONFLITO_REVISAO: outra pessoa salvou alteracoes. Recarregue antes de sobrescrever.';
    end if;
    update public.process_analysis_sheets set
      analysis_date=nullif(_payload->>'analysisDate','')::date,
      sheet_number=coalesce(nullif(_payload->>'sheetNumber',''),'1'),
      items=_payload->'items',
      routing=_payload->>'routing',
      routing_other=_payload->>'routingOther',
      conclusion=_payload->>'conclusion',
      communique_pages=_payload->>'communiquePages',
      sheet_payload=_payload,
      revision=revision+1,
      status='rascunho',
      updated_by_profile_id=_actor,
      updated_at=clock_timestamp()
    where id=_sheet.id
    returning revision into _new_revision;
  end if;

  return jsonb_build_object('ok',true,'revision',_new_revision);
end;
$fn$;
revoke all on function public.get_process_analysis_sheet_v2(uuid) from public;
revoke all on function public.save_process_analysis_sheet_v2(uuid,jsonb,bigint) from public;
grant execute on function public.get_process_analysis_sheet_v2(uuid) to authenticated;
grant execute on function public.save_process_analysis_sheet_v2(uuid,jsonb,bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
