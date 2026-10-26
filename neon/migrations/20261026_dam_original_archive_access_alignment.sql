-- SIGAPRO DAM original archive / professional-owned process access alignment

-- Forward-only, scoped schema migration. No payment, process or file data changed.

-- Prerequisite: 20261021_dam_original_and_provider_persistence.sql.

-- Apply to QA first; no production migration is run by the QA workflows.

begin;

-- Only authenticated municipal internal staff, or the authenticated professional
-- who actually created THIS process in THIS municipality, can freeze and attach
-- its original PDF. This does NOT grant authority to change a payment charge.
create or replace function public.assert_dam_document_archiver_v2(_guide public.payment_guides)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare actor uuid;
begin
  actor := public.current_profile_id();
  if actor is null or _guide.municipality_id is null or _guide.process_id is null
    then raise exception 'Acesso ao documento DAM não autorizado'; end if;
  if public.is_master() then return; end if;
  if not public.has_tenant_access(_guide.municipality_id)
     or not public.has_process_access(_guide.process_id)
    then raise exception 'Sem acesso à guia desta Prefeitura'; end if;
  if public.is_internal_municipality_role() then return; end if;
  if coalesce(public.current_role_code(),'') = 'profissional_externo'
    and exists (
      select 1 from public.processes pr
      where pr.id = _guide.process_id
        and pr.municipality_id = _guide.municipality_id
        and pr.created_by_profile_id = actor
    )
    then return; end if;
  raise exception 'Sem permissão para arquivar este documento DAM';
end $$;
revoke all on function public.assert_dam_document_archiver_v2(public.payment_guides) from public;


create or replace function public.freeze_payment_guide_document_v1(
  _municipality_id uuid, _guide_code text, _snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides
    where municipality_id = _municipality_id and guide_number = _guide_code for update;
  perform public.assert_dam_document_archiver_v2(g);
  if g.document_snapshot is not null then return to_jsonb(g); end if;
  if coalesce(g.paid,false) or lower(coalesce(g.status,'')) in ('compensada','paid','pago','confirmed','confirmado') then raise exception 'Guia compensada: original não arquivado; não regenerar'; end if;
  if (_snapshot #>> '{guia,numeroGuia}') is distinct from g.guide_number
    or (_snapshot #>> '{guia,valorDocumento}')::numeric is distinct from g.amount
    or (_snapshot #>> '{guia,valorCobrado}')::numeric is distinct from g.amount
    or (_snapshot #>> '{guia,dataDocumento}')::timestamptz is distinct from g.created_at
    or (_snapshot #>> '{guia,codigoBarras}') is distinct from g.barcode
    or (_snapshot #>> '{guia,linhaDigitavel}') is distinct from g.digitable_line
    or coalesce(_snapshot #>> '{guia,pixPayload}','') !~ '^000201.*BR\.GOV\.BCB\.PIX.*6304[0-9A-F]{4}$'
    or coalesce(g.barcode,'') !~ '^[0-9]{44}$'
    or coalesce(g.digitable_line,'') !~ '^([0-9]{47}|[0-9]{48})$'
  then raise exception 'Documento não corresponde aos dados oficiais da guia'; end if;
  -- Every immutable financial field comes from the locked Neon row. Only
  -- presentation fields (including the embedded crest) remain client supplied.
  _snapshot := jsonb_set(_snapshot, '{guia}', (_snapshot->'guia') || jsonb_build_object(
    'numeroGuia', g.guide_number,
    'dataDocumento', g.created_at,
    'vencimento', g.due_date,
    'valorDocumento', g.amount,
    'valorCobrado', g.amount,
    'codigoBarras', g.barcode,
    'linhaDigitavel', g.digitable_line,
    'bankReference', g.bank_reference,
    'bankPaymentId', g.bank_payment_id,
    'bankStatus', g.bank_status,
    'bankStatusDetail', g.bank_status_detail,
    'bankAuthenticatedAt', g.bank_authenticated_at,
    'bankEnvironment', coalesce(g.provider_environment,'test'),
    'paymentProvider', g.payment_provider
  ));
  update public.payment_guides set document_snapshot = _snapshot,
    pix_code = nullif(_snapshot #>> '{guia,pixPayload}','')
    where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.attach_payment_guide_original_v1(
  _municipality_id uuid, _guide_code text, _object_key text, _sha256 text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides
    where municipality_id = _municipality_id and guide_number = _guide_code for update;
  perform public.assert_dam_document_archiver_v2(g);
  if g.original_pdf_key is not null then return to_jsonb(g); end if;
  if coalesce(g.paid,false) or lower(coalesce(g.status,'')) in ('compensada','paid','pago','confirmed','confirmado') or g.document_snapshot is null
    then raise exception 'Guia não permite arquivamento'; end if;
  if _sha256 !~ '^[a-f0-9]{64}$' or _object_key is distinct from
    ('municipalities/' || g.municipality_id || '/processes/' || g.process_id || '/dam-originals/' || g.id || '/' || _sha256 || '.pdf')
    then raise exception 'Referência do PDF inválida'; end if;
  update public.payment_guides set original_pdf_key = _object_key, original_pdf_sha256 = _sha256
    where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.authorize_payment_guide_original_upload_v2(_guide_id uuid, _municipality_id uuid, _process_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides where id = _guide_id and municipality_id = _municipality_id and process_id = _process_id;
  perform public.assert_dam_document_archiver_v2(g);
  return not coalesce(g.paid,false) and lower(coalesce(g.status,'')) not in ('compensada','paid','pago','confirmed','confirmado') and g.document_snapshot is not null and g.original_pdf_key is null;
end $$;
revoke all on function public.authorize_payment_guide_original_upload_v2(uuid,uuid,uuid) from public;
grant execute on function public.authorize_payment_guide_original_upload_v2(uuid,uuid,uuid) to authenticated;

create or replace function public.authorize_payment_guide_original_read_v1(
  _guide_id uuid, _municipality_id uuid, _process_id uuid, _object_key text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  if public.current_profile_id() is null then return false; end if;
  select * into strict g from public.payment_guides
    where id = _guide_id and municipality_id = _municipality_id and process_id = _process_id;
  if not (public.is_master() or (public.has_tenant_access(g.municipality_id) and public.has_process_access(g.process_id)))
  then return false; end if;
  return g.original_pdf_key is not null and g.original_pdf_key = _object_key;
end $$;
revoke all on function public.authorize_payment_guide_original_read_v1(uuid,uuid,uuid,text) from public;
grant execute on function public.authorize_payment_guide_original_read_v1(uuid,uuid,uuid,text) to authenticated;

create or replace function public.protect_dam_original_delete_v1()
returns trigger language plpgsql set search_path = pg_catalog, public as $$ begin
  if old.original_pdf_key is not null or old.document_snapshot is not null
    or coalesce(old.paid,false)
    or lower(coalesce(old.status,'')) in ('compensada','paid','pago','confirmed','confirmado')
  then raise exception 'Guia emitida possui original permanente e não pode ser excluída'; end if;
  return old;
end $$;
drop trigger if exists protect_dam_original_delete on public.payment_guides;
create trigger protect_dam_original_delete before delete on public.payment_guides
  for each row execute function public.protect_dam_original_delete_v1();

revoke all on function public.freeze_payment_guide_document_v1(uuid,text,jsonb) from public;

revoke all on function public.attach_payment_guide_original_v1(uuid,text,text,text) from public;

revoke all on function public.authorize_payment_guide_original_upload_v2(uuid,uuid,uuid) from public;

revoke all on function public.authorize_payment_guide_original_read_v1(uuid,uuid,uuid,text) from public;

grant execute on function public.freeze_payment_guide_document_v1(uuid,text,jsonb) to authenticated;

grant execute on function public.attach_payment_guide_original_v1(uuid,text,text,text) to authenticated;

grant execute on function public.authorize_payment_guide_original_upload_v2(uuid,uuid,uuid) to authenticated;

grant execute on function public.authorize_payment_guide_original_read_v1(uuid,uuid,uuid,text) to authenticated;

commit;