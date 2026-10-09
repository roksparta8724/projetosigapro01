-- SIGAPRO: impede regressão para o protocolo v1 depois da migração canônica v2.
-- A função antiga permanece definida apenas para histórico/rollback técnico.

revoke execute on function public.create_external_process(
  uuid,text,text,text,text,text,text,text,numeric,text,text,text,text,text,jsonb,text
) from authenticated;
