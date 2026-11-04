-- PREPARAÇÃO LOCAL. Não aplicada em produção. Requer 20261017_payment_guide_banking_fields.sql.
begin;

alter table public.payment_guides
  add column if not exists ticket_url text,
  add column if not exists pix_code text,
  add column if not exists document_snapshot jsonb,
  add column if not exists original_pdf_key text,
  add column if not exists original_pdf_sha256 text;

-- SECURITY INVOKER deliberately retains the existing guide visibility/RLS rules.
create or replace function public.get_payment_guide_original_v1(_municipality_id uuid, _guide_code text)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public
as $$
  select to_jsonb(g) || jsonb_build_object('status', case
    when coalesce(g.paid,false) or lower(coalesce(g.status,'')) in ('compensada','paid','pago','confirmed','confirmado')
    then 'compensada' else g.status end) from public.payment_guides g
  where g.municipality_id = _municipality_id and g.guide_number = _guide_code;
$$;

create or replace function public.assert_dam_writer_v1(_guide public.payment_guides)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  if public.current_profile_id() is null or not (
    public.is_master() or (
      public.has_tenant_access(_guide.municipality_id)
      and public.has_process_access(_guide.process_id)
      and public.is_internal_municipality_role()
    )
  ) then raise exception 'Sem permissão para preparar a guia municipal'; end if;
end $$;

create or replace function public.authorize_payment_guide_charge_v1(_municipality_id uuid, _guide_code text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides
    where municipality_id = _municipality_id and guide_number = _guide_code;
  perform public.assert_dam_writer_v1(g);
  return not coalesce(g.paid,false)
    and lower(coalesce(g.status,'')) not in ('compensada','paid','pago','confirmed','confirmado')
    and g.document_snapshot is null
    and nullif(btrim(g.bank_reference),'') is null;
end $$;
revoke all on function public.authorize_payment_guide_charge_v1(uuid,text) from public;
grant execute on function public.authorize_payment_guide_charge_v1(uuid,text) to authenticated;

create or replace function public.authorize_payment_guide_provider_sync_v1(
  _municipality_id uuid, _guide_code text, _bank_reference text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides
    where municipality_id = _municipality_id and guide_number = _guide_code;
  perform public.assert_dam_writer_v1(g);
  return not coalesce(g.paid,false)
    and lower(coalesce(g.status,'')) not in ('compensada','paid','pago','confirmed','confirmado')
    and g.document_snapshot is null
    and nullif(btrim(g.bank_reference),'') = nullif(btrim(_bank_reference),'');
end $$;
revoke all on function public.authorize_payment_guide_provider_sync_v1(uuid,text,text) from public;
grant execute on function public.authorize_payment_guide_provider_sync_v1(uuid,text,text) to authenticated;

create or replace function public.dam_barcode_from_digitable_line_v1(_line text)
returns text language plpgsql immutable set search_path = pg_catalog, public
as $$ declare d text := regexp_replace(coalesce(_line,''),'[^0-9]','','g'); begin
  if d ~ '^[0-9]{47}$' then
    return substring(d,1,4) || substring(d,33,1) || substring(d,34) ||
      substring(d,5,5) || substring(d,11,10) || substring(d,22,10);
  elsif d ~ '^8[0-9]{47}$' then
    return substring(d,1,11) || substring(d,13,11) || substring(d,25,11) || substring(d,37,11);
  end if;
  return '';
end $$;

create or replace function public.persist_payment_guide_provider_charge_v2(
  _municipality_id uuid, _guide_code text, _charge jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; new_barcode text; new_line text; begin
  select * into strict g from public.payment_guides
    where municipality_id = _municipality_id and guide_number = _guide_code for update;
  perform public.assert_dam_writer_v1(g);
  if coalesce(g.paid,false) or lower(coalesce(g.status,'')) in ('compensada','paid','pago','confirmed','confirmado') then return to_jsonb(g); end if;
  if (_charge->>'externalReference') is distinct from g.guide_number
    or (_charge->>'amount')::numeric is distinct from g.amount
    or nullif(_charge->>'orderId','') is null
    or coalesce(_charge->>'environment','') not in ('test','production')
  then raise exception 'Cobrança não corresponde à guia original'; end if;
  if nullif(g.bank_reference,'') is not null and g.bank_reference <> _charge->>'orderId'
  then raise exception 'A guia já possui outra cobrança'; end if;
  if g.document_snapshot is not null then return to_jsonb(g); end if;
  new_barcode := regexp_replace(coalesce(_charge->>'barcodeContent',''),'[^0-9]','','g');
  new_line := regexp_replace(coalesce(_charge->>'digitableLine',''),'[^0-9]','','g');
  if (new_barcode <> '' or new_line <> '') and
    (new_barcode !~ '^[0-9]{44}$' or public.dam_barcode_from_digitable_line_v1(new_line) is distinct from new_barcode)
  then raise exception 'Código de barras e linha digitável bancários são inconsistentes'; end if;
  update public.payment_guides set
    bank_reference = _charge->>'orderId',
    bank_payment_id = coalesce(nullif(_charge->>'paymentId',''),bank_payment_id),
    bank_status = coalesce(nullif(_charge->>'status',''),bank_status),
    bank_status_detail = coalesce(nullif(_charge->>'statusDetail',''),bank_status_detail),
    bank_authenticated_at = coalesce(nullif(_charge->>'authenticatedAt','')::timestamptz,bank_authenticated_at),
    payment_provider = 'mercado_pago', provider_environment = _charge->>'environment',
    barcode = coalesce(nullif(new_barcode,''),barcode),
    digitable_line = coalesce(nullif(new_line,''),digitable_line),
    ticket_url = coalesce(nullif(_charge->>'ticketUrl',''),ticket_url)
  where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.freeze_payment_guide_document_v1(
  _municipality_id uuid, _guide_code text, _snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides
    where municipality_id = _municipality_id and guide_number = _guide_code for update;
  perform public.assert_dam_writer_v1(g);
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
  perform public.assert_dam_writer_v1(g);
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
  perform public.assert_dam_writer_v1(g);
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

create or replace function public.protect_dam_original_v1()
returns trigger language plpgsql set search_path = pg_catalog, public as $$ begin
  -- V13 officializes the process after payment and writes only this display
  -- reference. Preserve that workflow without changing the paid document.
  if (coalesce(old.paid,false) or lower(coalesce(old.status,'')) in ('compensada','paid','pago','confirmed','confirmado'))
    and (to_jsonb(new) - array['official_process_reference','updated_at'])
      is distinct from (to_jsonb(old) - array['official_process_reference','updated_at']) then
    raise exception 'Guia compensada é imutável';
  end if;
  if old.bank_reference is not null or old.document_snapshot is not null then
    if row(new.guide_number,new.amount,new.created_at,new.due_date)
      is distinct from row(old.guide_number,old.amount,old.created_at,old.due_date)
    then raise exception 'Número, valor e datas da guia emitida são imutáveis'; end if;
  end if;
  if old.document_snapshot is not null and row(new.document_snapshot,new.pix_code,new.barcode,new.digitable_line)
    is distinct from row(old.document_snapshot,old.pix_code,old.barcode,old.digitable_line)
  then raise exception 'Conteúdo do documento original é imutável'; end if;
  if old.original_pdf_key is not null and row(new.original_pdf_key,new.original_pdf_sha256)
    is distinct from row(old.original_pdf_key,old.original_pdf_sha256)
  then raise exception 'PDF original é imutável'; end if;
  return new;
end $$;
drop trigger if exists protect_dam_original on public.payment_guides;
create trigger protect_dam_original before update on public.payment_guides
  for each row execute function public.protect_dam_original_v1();

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

revoke all on function public.assert_dam_writer_v1(public.payment_guides) from public;
revoke all on function public.dam_barcode_from_digitable_line_v1(text) from public;
revoke all on function public.protect_dam_original_v1() from public;
revoke all on function public.protect_dam_original_delete_v1() from public;
revoke all on function public.get_payment_guide_original_v1(uuid,text) from public;
revoke all on function public.persist_payment_guide_provider_charge_v2(uuid,text,jsonb) from public;
revoke all on function public.freeze_payment_guide_document_v1(uuid,text,jsonb) from public;
revoke all on function public.attach_payment_guide_original_v1(uuid,text,text,text) from public;
grant execute on function public.get_payment_guide_original_v1(uuid,text) to authenticated;
grant execute on function public.persist_payment_guide_provider_charge_v2(uuid,text,jsonb) to authenticated;
grant execute on function public.freeze_payment_guide_document_v1(uuid,text,jsonb) to authenticated;
grant execute on function public.attach_payment_guide_original_v1(uuid,text,text,text) to authenticated;
commit;
notify pgrst, 'reload schema';
