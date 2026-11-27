-- Complete the previously absent Neon storage contract. No existing repository is switched.
CREATE TABLE IF NOT EXISTS public.municipal_storage_connections (
 municipality_id uuid PRIMARY KEY REFERENCES public.municipalities(id),
 provider text NOT NULL DEFAULT 'sigapro_r2',
 status text NOT NULL DEFAULT 'active',
 endpoint_url text,region text NOT NULL DEFAULT 'us-east-1',bucket_documents text,
 base_path text NOT NULL DEFAULT '',force_path_style boolean NOT NULL DEFAULT false,
 credentials_ciphertext text,credential_fingerprint text,last_tested_at timestamptz,
 last_test_status text,last_test_message text,updated_by uuid,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.municipal_storage_connections ADD COLUMN IF NOT EXISTS config_revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.municipal_storage_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_storage_connections FROM PUBLIC,anonymous,authenticated;
CREATE OR REPLACE FUNCTION public.municipal_storage_command_v2(_municipality_id uuid, _action text, _payload text, _epoch text, _mac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE actor uuid; config public.municipal_storage_connections; body jsonb; secret text; expected text; admin boolean; response jsonb; stamp bigint;
BEGIN
 actor:=public.current_profile_id();
 IF actor IS NULL OR _municipality_id IS NULL OR _action IS NULL OR _action NOT IN ('get','resolve','secret','save','mark','activate','use_sigapro')
 OR _payload IS NULL OR length(_payload)>32000 OR _payload !~ '^[A-Za-z0-9+/=]+$'
 OR _epoch IS NULL OR _epoch !~ '^[0-9]{10,11}$' OR _mac IS NULL OR _mac !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operação de armazenamento não autorizada.'; END IF;
 stamp:=_epoch::bigint;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-stamp)>120 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação de servidor expirada.'; END IF;
 SELECT key_hex INTO secret FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
 IF secret IS NULL THEN RAISE EXCEPTION 'Comprovação de servidor indisponível.'; END IF;
 expected:=encode(extensions.hmac(convert_to(concat_ws(chr(10),'sigapro-storage-command-v2',_municipality_id::text,_action,_payload,_epoch),'UTF8'),
 extensions.hmac(convert_to('sigapro-storage-domain-v2','UTF8'),decode(secret,'hex'),'sha256'),'sha256'),'hex');
 IF expected IS DISTINCT FROM _mac THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação de servidor inválida.'; END IF;
 admin:=coalesce(public.is_master(),false) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.municipality_id=_municipality_id AND p.role='prefeitura_admin' AND p.account_status='active' AND p.deleted_at IS NULL);
 IF (_action='resolve' AND NOT(admin OR coalesce(public.has_tenant_access(_municipality_id),false))) OR (_action<>'resolve' AND NOT admin)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sem permissão para o armazenamento desta Prefeitura.'; END IF;
 body:=convert_from(decode(_payload,'base64'),'UTF8')::jsonb;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Configuração inválida.'; END IF;
 IF _action IN ('save','mark','activate','use_sigapro') THEN
  PERFORM 1 FROM public.municipalities WHERE id=_municipality_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prefeitura inválida.'; END IF;
 END IF;
 SELECT * INTO config FROM public.municipal_storage_connections WHERE municipality_id=_municipality_id;
 IF _action='save' THEN
  IF config.provider='s3_compatible' AND config.status='active' THEN RAISE EXCEPTION 'Repositório ativo: alterações exigem procedimento de migração ou rotação controlada.'; END IF;
  IF coalesce(body->>'endpoint','') !~ '^https://([a-f0-9]{32}\.r2\.cloudflarestorage\.com|s3([.-][a-z0-9-]+)?\.amazonaws\.com)$'
   OR coalesce(body->>'region','') !~ '^[a-z0-9-]{2,32}$'
   OR coalesce(body->>'bucket','') !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
   OR coalesce(body->>'basePath','') !~ '^([A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*)?$'
   OR length(coalesce(body->>'basePath',''))>180
   OR coalesce(body->>'ciphertext','') !~ '^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
   OR length(body->>'ciphertext')>12000 OR jsonb_typeof(body->'forcePathStyle') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'Informe endpoint R2/AWS S3, bucket, região e credenciais válidos.'; END IF;
  INSERT INTO public.municipal_storage_connections(municipality_id,provider,status,endpoint_url,region,bucket_documents,base_path,force_path_style,credentials_ciphertext,credential_fingerprint,updated_by)
  VALUES(_municipality_id,'s3_compatible','configured',body->>'endpoint',body->>'region',body->>'bucket',coalesce(body->>'basePath',''),(body->>'forcePathStyle')::boolean,body->>'ciphertext',left(body->>'fingerprint',100),actor)
  ON CONFLICT(municipality_id) DO UPDATE SET provider='s3_compatible',status='configured',endpoint_url=excluded.endpoint_url,region=excluded.region,bucket_documents=excluded.bucket_documents,base_path=excluded.base_path,force_path_style=excluded.force_path_style,credentials_ciphertext=excluded.credentials_ciphertext,credential_fingerprint=excluded.credential_fingerprint,config_revision=gen_random_uuid(),last_tested_at=NULL,last_test_status=NULL,last_test_message=NULL,updated_by=actor,updated_at=clock_timestamp();
 ELSIF _action='mark' THEN
  IF config.municipality_id IS NULL OR config.provider<>'s3_compatible' OR config.config_revision::text IS DISTINCT FROM body->>'revision' OR jsonb_typeof(body->'ok') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'A configuração mudou. Execute o teste novamente.'; END IF;
  UPDATE public.municipal_storage_connections SET last_tested_at=clock_timestamp(),last_test_status=CASE WHEN (body->>'ok')::boolean THEN 'ok' ELSE 'error' END,last_test_message=CASE WHEN (body->>'ok')::boolean THEN 'Gravação, leitura, integridade e remoção verificadas.' ELSE 'Teste de armazenamento não confirmado.' END,status=CASE WHEN status='active' THEN 'active' WHEN (body->>'ok')::boolean THEN 'configured' ELSE 'error' END,updated_at=clock_timestamp() WHERE municipality_id=_municipality_id;
 ELSIF _action='activate' THEN
  IF config.provider='s3_compatible' AND config.status='active' THEN NULL;
  ELSE
   IF config.municipality_id IS NULL OR config.provider<>'s3_compatible' OR config.last_test_status IS DISTINCT FROM 'ok' OR config.last_tested_at IS NULL OR config.last_tested_at<clock_timestamp()-interval '24 hours' OR config.credentials_ciphertext IS NULL THEN RAISE EXCEPTION 'Teste a conexão antes de ativar.'; END IF;
   IF EXISTS(SELECT 1 FROM public.processes p WHERE p.municipality_id=_municipality_id OR p.tenant_id=_municipality_id) THEN RAISE EXCEPTION 'Prefeitura com processos existentes: migração de arquivos necessária antes de trocar o repositório.'; END IF;
   UPDATE public.municipal_storage_connections SET status='active',updated_by=actor,updated_at=clock_timestamp() WHERE municipality_id=_municipality_id;
  END IF;
 ELSIF _action='use_sigapro' THEN
  IF config.provider='s3_compatible' AND config.status='active' AND EXISTS(SELECT 1 FROM public.processes p WHERE p.municipality_id=_municipality_id OR p.tenant_id=_municipality_id) THEN RAISE EXCEPTION 'Repositório contém processos: migração de arquivos necessária antes de retornar.'; END IF;
  UPDATE public.municipal_storage_connections SET provider='sigapro_r2',status='active',config_revision=gen_random_uuid(),last_tested_at=NULL,last_test_status=NULL,last_test_message=NULL,credentials_ciphertext=NULL,credential_fingerprint=NULL,updated_by=actor,updated_at=clock_timestamp() WHERE municipality_id=_municipality_id;
 END IF;
 SELECT * INTO config FROM public.municipal_storage_connections WHERE municipality_id=_municipality_id;
 IF config.municipality_id IS NULL OR (_action='resolve' AND (config.provider<>'s3_compatible' OR config.status<>'active')) THEN
  RETURN jsonb_build_object('municipality_id',_municipality_id,'provider','sigapro_r2','status','active','credentials_configured',false);
 END IF;
 response:=jsonb_build_object('municipality_id',_municipality_id,'provider',config.provider,'status',config.status,'endpoint_url',config.endpoint_url,'region',config.region,'bucket_documents',config.bucket_documents,'base_path',config.base_path,'force_path_style',config.force_path_style,'credentials_configured',config.credentials_ciphertext IS NOT NULL,'credential_fingerprint',config.credential_fingerprint,'last_tested_at',config.last_tested_at,'last_test_status',config.last_test_status,'last_test_message',config.last_test_message,'updated_at',config.updated_at,'config_revision',config.config_revision);
 IF _action IN ('resolve','secret') THEN response:=response||jsonb_build_object('credentials_ciphertext',config.credentials_ciphertext); END IF;
 RETURN response;
END $function$;
REVOKE ALL ON FUNCTION public.municipal_storage_command_v2(uuid,text,text,text,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.municipal_storage_command_v2(uuid,text,text,text,text) TO authenticated;
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_municipal_storage_connection_v1','get_municipal_storage_secret_admin_v1','resolve_municipal_storage_secret_v1','save_municipal_storage_connection_v1','mark_municipal_storage_test_v1','activate_municipal_storage_connection_v1','use_sigapro_storage_v1')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anonymous,authenticated',f.sig); END LOOP;
END $$;
