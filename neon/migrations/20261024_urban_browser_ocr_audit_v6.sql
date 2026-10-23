-- QA: distinguish OCR suggestion + human verification from two manual transcriptions.
-- No changes to official processes or municipality laws; preserves existing rows.
begin;
alter table public.urban_legal_evidence_scopes
  drop constraint if exists urban_legal_scope_verification_method_valid;
alter table public.urban_legal_evidence_scopes
  add constraint urban_legal_scope_verification_method_valid check (
    verification_method in (
      'text_layer_verified',
      'visual_double_transcription',
      'browser_ocr_human_verified'
    )
  );

create or replace function public.save_urban_legal_evidence_scoped_v3(
  _municipality_id uuid,_document_title text,_document_sha256 text,
  _page_number integer,_metric text,_excerpt text,
  _zone_code text,_use_code text,_effective_from date,_effective_until date,
  _verification_method text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public set row_security=off as $$
declare _saved jsonb;_id uuid;
begin
  if not public.is_urban_regulation_admin_v1(_municipality_id) or
      _verification_method not in (
        'text_layer_verified','visual_double_transcription','browser_ocr_human_verified'
      ) then
    raise exception 'Metodo de verificacao ou permissao municipal invalida.';
  end if;
  _saved:=public.save_urban_legal_evidence_scoped_v2(
    _municipality_id,_document_title,_document_sha256,
    _page_number,_metric,_excerpt,_zone_code,_use_code,_effective_from,_effective_until
  );
  _id:=(_saved->>'id')::uuid;
  update public.urban_legal_evidence_scopes
    set verification_method=_verification_method
    where id=_id and municipality_id=_municipality_id;
  if not found then raise exception 'Falha no registro do metodo de verificacao.';end if;
  return _saved || jsonb_build_object('verification_method',_verification_method);
end; $$;
notify pgrst,'reload schema';
commit;
