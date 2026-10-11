-- SIGAPRO: anotacoes estruturadas para analise documental.
-- Mantem a RPC anterior intacta e adiciona marcacao de texto e marca-texto por pagina.

create or replace function public.add_process_document_annotation_v2(
  _document_id uuid,
  _kind text,
  _page integer,
  _x numeric,
  _y numeric,
  _width numeric,
  _height numeric,
  _note text
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
  _process_id uuid;
  _tenant_id uuid;
  _municipality_id uuid;
  _author text;
  _annotation jsonb;
  _doc public.process_documents%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _kind not in ('text','highlight') then
    raise exception 'Tipo de anotacao invalido';
  end if;

  if nullif(btrim(_note),'') is null then
    raise exception 'Anotacao obrigatoria';
  end if;

  if _page is null or _page < 1 or _page > 5000 then
    raise exception 'Pagina invalida';
  end if;

  if _x is null or _y is null or _x < 0 or _x > 100 or _y < 0 or _y > 100 then
    raise exception 'Coordenadas invalidas';
  end if;

  _width := greatest(0, least(coalesce(_width,0), 100));
  _height := greatest(0, least(coalesce(_height,0), 100));

  if _kind='highlight' and (_width < 0.5 or _height < 0.5) then
    raise exception 'Area do marca-texto muito pequena';
  end if;

  select d.process_id,d.tenant_id,d.municipality_id
    into _process_id,_tenant_id,_municipality_id
  from public.process_documents d
  where d.id=_document_id;

  if _process_id is null then
    raise exception 'Documento nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Somente equipe interna pode anotar documento';
  end if;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Usuario')
    into _author
  from public.profiles p
  where p.id=_profile_id;

  _annotation := jsonb_build_object(
    'id',gen_random_uuid()::text,
    'kind',_kind,
    'page',_page,
    'x',round(_x,4),
    'y',round(_y,4),
    'width',round(_width,4),
    'height',round(_height,4),
    'note',btrim(_note),
    'author',coalesce(_author,'Usuario'),
    'authorProfileId',_profile_id,
    'createdAt',now()
  );

  update public.process_documents
     set annotations=coalesce(annotations,'[]'::jsonb) || jsonb_build_array(_annotation)
   where id=_document_id
   returning * into _doc;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'documento','Marcacao tecnica',
    case when _kind='highlight'
      then 'Marca-texto registrado no documento, pagina '||_page||'.'
      else 'Observacao textual registrada no documento, pagina '||_page||'.'
    end,
    false,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'document',to_jsonb(_doc),
    'annotation',_annotation,
    'audit',to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.add_process_document_annotation_v2(uuid,text,integer,numeric,numeric,numeric,numeric,text) from public;
grant execute on function public.add_process_document_annotation_v2(uuid,text,integer,numeric,numeric,numeric,numeric,text) to authenticated;
