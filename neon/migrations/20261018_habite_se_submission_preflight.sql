-- SIGAPRO - preflight oficial do protocolo de Habite-se.
-- Bloqueia a criação quando faltar documento obrigatório do checklist próprio.

create or replace function public.validate_habite_se_submission_v1(
  _tenant_id uuid,
  _payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _type text := lower(coalesce(_payload->>'type',''));
  _missing text[] := array[]::text[];
  _required text[];
  _label text;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if not public.has_tenant_access(_tenant_id) then
    raise exception 'Usuário sem vínculo com a Prefeitura.';
  end if;

  if _type not like '%habite%' then
    return jsonb_build_object('ok',true,'missing',jsonb_build_array());
  end if;

  if jsonb_typeof(_payload->'documents') <> 'array' then
    raise exception 'O Habite-se exige o envio dos documentos obrigatórios antes do protocolo.';
  end if;

  _required := array[
    'RG ou CNH do proprietario',
    'CPF do proprietario',
    'IPTU atualizado',
    'Matricula do imovel',
    'Alvará de construção ou regularização',
    'Projeto aprovado pela Prefeitura'
  ];

  if _type like '%parcial%' then
    _required := _required || array[
      'Planta destacando a etapa concluída',
      'ART ou RRT de execução ou conclusão da etapa',
      'Termo de conclusão parcial pelo responsável técnico'
    ];
  else
    _required := _required || array[
      'ART ou RRT de execução ou conclusão da obra',
      'Termo de conclusão da obra pelo responsável técnico'
    ];
  end if;

  foreach _label in array _required
  loop
    if not exists (
      select 1
      from jsonb_array_elements(_payload->'documents') d
      where lower(btrim(coalesce(d->>'label',''))) = lower(btrim(_label))
        and nullif(btrim(coalesce(d->>'filePath','')),'') is not null
    ) then
      _missing := array_append(_missing,_label);
    end if;
  end loop;

  if coalesce(array_length(_missing,1),0) > 0 then
    raise exception 'Habite-se não pode ser protocolado. Documentos obrigatórios pendentes: %',
      array_to_string(_missing,', ');
  end if;

  return jsonb_build_object(
    'ok',true,
    'required_count',coalesce(array_length(_required,1),0),
    'missing',to_jsonb(_missing)
  );
end;
$function$;

grant execute on function public.validate_habite_se_submission_v1(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
