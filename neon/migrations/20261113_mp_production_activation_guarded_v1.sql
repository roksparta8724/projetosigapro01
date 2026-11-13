-- SIGAPRO 13/11/2026 — proposta de homologação isolada, NÃO aplicar à produção
-- A função de 12/11 impede incondicionalmente Mercado Pago em production.
-- Esta versão permite o caminho somente com autorização real do município,
-- conta oficial salva, segredo de webhook, teste recente e ativação explícita.
-- Nenhuma guia existente é alterada, criada, paga ou conciliada por esta função.
-- Aplicar após a prefeitura confirmar seu convênio e a equipe validar E2E.
CREATE OR REPLACE FUNCTION public.activate_municipal_payment_connection_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  connection public.municipal_payment_provider_connections;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissão para administrar pagamentos desta Prefeitura';
  end if;

  select * into connection from public.municipal_payment_provider_connections
    where municipality_id = _municipality_id for update;

  if connection.municipality_id is null then
    raise exception 'Conexão municipal ainda não cadastrada';
  end if;

  if connection.provider = 'bank_direct' then
    raise exception 'Banco/convênio direto exige integração e homologação específicas antes de ativar cobrança automática';
  elsif connection.provider = 'mercado_pago' then
    if connection.credentials_ciphertext is null or connection.credential_fingerprint is null then
      raise exception 'Salve o Access Token da própria Prefeitura';
    end if;
    if connection.last_test_status is distinct from 'ok' or connection.last_tested_at is null then
      raise exception 'Teste as credenciais municipais antes de ativar';
    end if;
    if connection.environment = 'production' then
      if connection.webhook_secret_ciphertext is null or connection.webhook_fingerprint is null then
        raise exception 'Configure a chave de assinatura do Webhook de produção';
      end if;
      if connection.last_tested_at < now() - interval '24 hours' then
        raise exception 'O último teste de produção expirou. Teste a conexão novamente';
      end if;
    elsif connection.environment <> 'test' then
      raise exception 'Ambiente bancário não reconhecido';
    end if;
  elsif connection.provider <> 'manual' then
    raise exception 'Provedor bancário não reconhecido';
  end if;

  update public.municipal_payment_provider_connections
     set status = 'active',
         updated_by = public.current_profile_id(),
         updated_at = now()
   where municipality_id = _municipality_id;

  return public.get_municipal_payment_connection_v1(_municipality_id);
end $function$;
