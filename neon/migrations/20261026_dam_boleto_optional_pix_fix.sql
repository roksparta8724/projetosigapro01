-- Correct bank-only boleto archival without requiring a separate PIX key.

-- No document/charge rows are mutated by this schema-only migration.

begin;

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
    or (
      nullif(btrim(coalesce(_snapshot #>> '{guia,pixPayload}', '')), '') is not null
      and (_snapshot #>> '{guia,pixPayload}') !~ '^000201.*BR\.GOV\.BCB\.PIX.*6304[0-9A-F]{4}$'
    )
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

revoke all on function public.freeze_payment_guide_document_v1(uuid,text,jsonb) from public;

grant execute on function public.freeze_payment_guide_document_v1(uuid,text,jsonb) to authenticated;

commit;