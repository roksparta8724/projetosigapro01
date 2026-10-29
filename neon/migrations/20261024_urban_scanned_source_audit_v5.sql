-- SIGAPRO IA / QA: immutable legal document excerpt + validated origin classification.
-- Source verification method is informational; NEVER evidence of legal applicability.
begin;
alter table public.urban_legal_evidence_scopes
  add column if not exists verification_method text not null default 'text_layer_verified';
alter table public.urban_legal_evidence_scopes
  add constraint urban_legal_scope_verification_method_valid
  check (verification_method in ('text_layer_verified','visual_double_transcription'));

create or replace function public.list_urban_legal_evidence_v2(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off as $$
begin
  if _municipality_id is null or not (
    public.is_master() or
    (public.has_tenant_access(_municipality_id) and public.is_internal_municipality_role())
  ) then raise exception 'Acesso negado ao acervo legal municipal.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (
      select s.id,s.evidence_id,s.municipality_id,e.document_title,
        e.document_sha256,e.page_number,e.metric,e.excerpt,
        s.zone_code,s.use_code,s.effective_from,s.effective_until,
        s.verification_method,s.created_at
      from public.urban_legal_evidence_scopes s
      join public.urban_legal_evidence_catalog e
        on e.id=s.evidence_id and e.municipality_id=s.municipality_id
      where s.municipality_id=_municipality_id
      order by s.created_at desc limit 250
    ) t
  ),'[]'::jsonb);
end; $$;

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
      _verification_method not in ('text_layer_verified','visual_double_transcription') then
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
revoke all on function public.save_urban_legal_evidence_scoped_v3(
  uuid,text,text,integer,text,text,text,text,date,date,text) from public;
grant execute on function public.save_urban_legal_evidence_scoped_v3(
  uuid,text,text,integer,text,text,text,text,date,date,text) to authenticated;
revoke execute on function public.save_urban_legal_evidence_scoped_v2(
  uuid,text,text,integer,text,text,text,text,date,date) from authenticated;
notify pgrst,'reload schema';
commit;
