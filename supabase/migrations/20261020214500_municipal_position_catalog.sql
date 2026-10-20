-- SIGAPRO — cadastro municipal de cargos (somente publicação futura).
-- Esta migração NÃO foi aplicada ao banco. Validar antes do deploy.
begin;

create or replace function public.update_municipal_position_titles_v1(
  _municipality_id uuid,
  _position_titles jsonb
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
set row_security = 'off'
as $body$
declare
  _general jsonb;
  _old_titles jsonb;
  _aliases jsonb;
  _new_titles jsonb := '{}'::jsonb;
  _key text;
  _value text;
  _previous text;
  _defaults jsonb := '{
    "diretor_urbanismo":"Diretor de Urbanismo",
    "secretario_urbanismo":"Secretário de Urbanismo",
    "secretario_financeiro":"Secretário do Financeiro",
    "diretor_financeiro":"Diretor do Financeiro",
    "diretor_administracao":"Diretor da Administração",
    "secretario_administracao":"Secretário da Administração",
    "diretor_ti":"Diretor de TI"
  }'::jsonb;
begin
  if _municipality_id is null or
    (not public.is_master() and not public.can_manage_municipality(_municipality_id)) then
    raise exception 'Sem permissão para editar os cargos desta Prefeitura.';
  end if;
  if _position_titles is null or jsonb_typeof(_position_titles) <> 'object' then
    raise exception 'Catálogo de cargos inválido.';
  end if;
  select coalesce(general_settings, '{}'::jsonb)
    into _general
    from public.municipality_settings
    where municipality_id = _municipality_id
    for update;
  if not found then
    raise exception 'Configurações municipais não encontradas.';
  end if;
  _old_titles := coalesce(_general->'position_titles', '{}'::jsonb);
  _aliases := coalesce(_general->'position_title_aliases', '{}'::jsonb);
  for _key, _value in select key, value from jsonb_each_text(_position_titles) loop
    if not (_defaults ? _key) then
      raise exception 'Cargo institucional não reconhecido: %', _key;
    end if;
    _value := btrim(regexp_replace(_value, '[[:space:]]+', ' ', 'g'));
    if _value = '' or char_length(_value) > 90 or _value ~ '[[:cntrl:]]' then
      raise exception 'O nome do cargo deve conter entre 1 e 90 caracteres válidos.';
    end if;
    _previous := coalesce(nullif(_old_titles->>_key,''), _defaults->>_key);
    if _previous is distinct from _value and
      not (coalesce(_aliases-> _key, '[]'::jsonb) ? _previous) then
      -- Lista histórica de títulos permite atualizar exibições futuras sem
      -- alterar perfis assinados nem conceder privilégios ao alterar nomes.
      _aliases := jsonb_set(
        _aliases, array[_key],
        coalesce(_aliases-> _key, '[]'::jsonb) || to_jsonb(_previous), true
      );
    end if;
    _new_titles := _new_titles || jsonb_build_object(_key, _value);
  end loop;
  update public.municipality_settings
     set general_settings = jsonb_set(
         jsonb_set(_general, '{position_titles}', _new_titles, true),
         '{position_title_aliases}', _aliases, true
       )
   where municipality_id = _municipality_id;
  return jsonb_build_object('municipality_id', _municipality_id, 'position_titles', _new_titles);
end;
$body$;

revoke all on function public.update_municipal_position_titles_v1(uuid,jsonb) from public;
grant execute on function public.update_municipal_position_titles_v1(uuid,jsonb) to authenticated;
commit;
