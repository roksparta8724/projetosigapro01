-- SIGAPRO: templates financeiros não podem virar cobrança sem configuração municipal explícita.

create or replace function public.resolve_municipal_guide_amount(
  _municipality_id uuid,
  _guide_kind text,
  _area numeric default null,
  _usage text default null,
  _construction_standard text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _settings jsonb;
  _profiles jsonb;
  _rate numeric;
  _fixed numeric;
  _normalized_usage text := public.normalize_fee_label(_usage);
  _normalized_standard text := public.normalize_fee_label(_construction_standard);
begin
  if _municipality_id is null then
    raise exception 'Prefeitura invalida para calcular guia';
  end if;

  select ms.general_settings
    into _settings
  from public.municipality_settings ms
  where ms.municipality_id=_municipality_id
  limit 1;

  if _settings is null then
    raise exception 'Configuracao financeira da Prefeitura nao encontrada';
  end if;

  if _guide_kind='protocolo' then
    _fixed := coalesce(
      nullif(_settings->>'taxa_protocolo','')::numeric,
      nullif(_settings->>'fee_protocol','')::numeric
    );

    if _fixed is null or _fixed <= 0 then
      raise exception 'Taxa de protocolo ainda nao foi configurada pela Prefeitura';
    end if;

    return round(_fixed,2);
  end if;

  if _guide_kind='iss_obra' then
    if coalesce(_area,0) <= 0 then
      raise exception 'Area da obra invalida para calculo do ISSQN';
    end if;

    if jsonb_typeof(_settings->'iss_rate_profiles')='array'
       and jsonb_array_length(_settings->'iss_rate_profiles')>0 then
      _profiles := _settings->'iss_rate_profiles';

      select (p.value->>'rate')::numeric
        into _rate
      from jsonb_array_elements(_profiles) with ordinality p(value,ord)
      where public.normalize_fee_label(p.value->>'label')=_normalized_usage
         or exists(
           select 1
           from jsonb_array_elements_text(coalesce(p.value->'aliases','[]'::jsonb)) a(alias)
           where public.normalize_fee_label(a.alias)=_normalized_usage
              or (
                public.normalize_fee_label(a.alias)<>''
                and _normalized_usage like '%'||public.normalize_fee_label(a.alias)||'%'
              )
         )
      order by p.ord
      limit 1;
    end if;

    _fixed := coalesce(
      nullif(_settings->>'taxa_iss_por_metro_quadrado','')::numeric,
      nullif(_settings->>'fee_iss_m2','')::numeric
    );
    _rate := coalesce(_rate,_fixed);

    if _rate is null or _rate <= 0 then
      raise exception 'Tabela de ISSQN nao configurada para o uso informado';
    end if;

    return round(_area * _rate,2);
  end if;

  if _guide_kind='aprovacao_final' then
    if jsonb_typeof(_settings->'approval_rate_profiles')='array'
       and jsonb_array_length(_settings->'approval_rate_profiles')>0 then
      _profiles := _settings->'approval_rate_profiles';

      select (p.value->>'rate')::numeric
        into _rate
      from jsonb_array_elements(_profiles) with ordinality p(value,ord)
      where public.normalize_fee_label(p.value->>'usage')=_normalized_usage
        and public.normalize_fee_label(p.value->>'standard')=_normalized_standard
      order by p.ord
      limit 1;
    end if;

    _fixed := coalesce(
      nullif(_settings->>'taxa_aprovacao_final','')::numeric,
      nullif(_settings->>'fee_final_approval','')::numeric
    );

    if _rate is not null and _rate > 0 then
      if coalesce(_area,0) <= 0 then
        raise exception 'Area da obra invalida para calculo da taxa final';
      end if;
      return round(_area * _rate,2);
    end if;

    if _fixed is not null and _fixed > 0 then
      return round(_fixed,2);
    end if;

    raise exception 'Tabela da taxa final nao configurada para uso e padrao informados';
  end if;

  raise exception 'Tipo de guia invalido para calculo oficial';
end;
$function$;

revoke all on function public.resolve_municipal_guide_amount(uuid,text,numeric,text,text) from public;
revoke all on function public.resolve_municipal_guide_amount(uuid,text,numeric,text,text) from authenticated;
