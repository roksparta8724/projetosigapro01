-- SIGAPRO: branding master salvo exclusivamente por RPC master.
drop function if exists public.save_platform_branding_variant(text,text,text,text,text);

create function public.save_platform_branding_variant(
  _variant text,
  _url text,
  _object_key text,
  _file_name text,
  _mime_type text,
  _layout jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _row public.platform_branding%rowtype;
  _variant_clean text := lower(trim(coalesce(_variant,'')));
  _header_frame text;
  _header_fit text;
  _footer_frame text;
  _footer_fit text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not public.is_master() then
    raise exception 'Apenas a conta master pode alterar o branding da plataforma';
  end if;

  if _variant_clean not in ('header','footer') then
    raise exception 'Variante de branding invalida';
  end if;

  if nullif(trim(coalesce(_object_key,'')),'') is null then
    raise exception 'Object key obrigatorio';
  end if;

  _header_frame := case
    when _layout->>'headerLogoFrameMode' in ('soft-square','rounded')
      then _layout->>'headerLogoFrameMode'
    else null
  end;
  _header_fit := case
    when _layout->>'headerLogoFitMode' in ('contain','cover')
      then _layout->>'headerLogoFitMode'
    else null
  end;
  _footer_frame := case
    when _layout->>'footerLogoFrameMode' in ('soft-square','rounded')
      then _layout->>'footerLogoFrameMode'
    else null
  end;
  _footer_fit := case
    when _layout->>'footerLogoFitMode' in ('contain','cover')
      then _layout->>'footerLogoFitMode'
    else null
  end;

  insert into public.platform_branding(
    platform_key,
    updated_at,
    updated_by
  )
  values(
    'sigapro',
    now(),
    _profile_id
  )
  on conflict (platform_key) do update set
    updated_at=now(),
    updated_by=_profile_id;

  update public.platform_branding
     set logo_alt = coalesce(nullif(trim(coalesce(_layout->>'logoAlt','')),''), logo_alt),
         footer_text = coalesce(nullif(trim(coalesce(_layout->>'footerText','')),''), footer_text),
         header_logo_scale = coalesce(nullif(_layout->>'headerLogoScale','')::numeric, header_logo_scale),
         header_logo_offset_x = coalesce(nullif(_layout->>'headerLogoOffsetX','')::numeric, header_logo_offset_x),
         header_logo_offset_y = coalesce(nullif(_layout->>'headerLogoOffsetY','')::numeric, header_logo_offset_y),
         header_logo_frame_mode = coalesce(_header_frame, header_logo_frame_mode),
         header_logo_fit_mode = coalesce(_header_fit, header_logo_fit_mode),
         footer_logo_scale = coalesce(nullif(_layout->>'footerLogoScale','')::numeric, footer_logo_scale),
         footer_logo_offset_x = coalesce(nullif(_layout->>'footerLogoOffsetX','')::numeric, footer_logo_offset_x),
         footer_logo_offset_y = coalesce(nullif(_layout->>'footerLogoOffsetY','')::numeric, footer_logo_offset_y),
         footer_logo_frame_mode = coalesce(_footer_frame, footer_logo_frame_mode),
         footer_logo_fit_mode = coalesce(_footer_fit, footer_logo_fit_mode),
         updated_at=now(),
         updated_by=_profile_id
   where platform_key='sigapro';

  if _variant_clean='header' then
    update public.platform_branding
       set header_logo_url=nullif(trim(coalesce(_url,'')),''),
           header_logo_object_key=trim(_object_key),
           header_logo_file_name=nullif(trim(coalesce(_file_name,'')),''),
           header_logo_mime_type=nullif(trim(coalesce(_mime_type,'')),''),
           updated_at=now(),
           updated_by=_profile_id
     where platform_key='sigapro'
     returning * into _row;
  else
    update public.platform_branding
       set footer_logo_url=nullif(trim(coalesce(_url,'')),''),
           footer_logo_object_key=trim(_object_key),
           footer_logo_file_name=nullif(trim(coalesce(_file_name,'')),''),
           footer_logo_mime_type=nullif(trim(coalesce(_mime_type,'')),''),
           updated_at=now(),
           updated_by=_profile_id
     where platform_key='sigapro'
     returning * into _row;
  end if;

  return to_jsonb(_row);
end;
$function$;

revoke all on function public.save_platform_branding_variant(text,text,text,text,text,jsonb) from public;
grant execute on function public.save_platform_branding_variant(text,text,text,text,text,jsonb) to authenticated;
