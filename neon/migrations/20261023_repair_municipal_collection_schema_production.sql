-- SIGAPRO municipal collection parity repair. Source: already-tested isolated QA schema.
-- Additive DDL only: no historical guides/records are deleted or rewritten.
-- Apply as one transaction after staging validation and migration review.

CREATE TABLE IF NOT EXISTS public."municipal_collection_configurations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "municipality_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "mode" text NOT NULL,
  "status" text NOT NULL DEFAULT 'not_configured'::text,
  "supplier_code" text,
  "supplier_name" text,
  "api_base_url" text,
  "environment" text NOT NULL DEFAULT 'test'::text,
  "integration_type" text NOT NULL DEFAULT 'automatic'::text,
  "secret_ciphertext" text,
  "secret_fingerprint" text,
  "public_parameters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "capabilities" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "validation_message" text,
  "validated_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "municipal_collection_configurations_environment_check" CHECK ((environment = ANY (ARRAY['test'::text, 'production'::text]))),
  CONSTRAINT "municipal_collection_configurations_integration_type_check" CHECK ((integration_type = ANY (ARRAY['automatic'::text, 'controlled_import'::text]))),
  CONSTRAINT "municipal_collection_configurations_mode_check" CHECK ((mode = ANY (ARRAY['sigapro'::text, 'municipal_system'::text]))),
  CONSTRAINT "municipal_collection_configurations_status_check" CHECK ((status = ANY (ARRAY['not_configured'::text, 'homologation'::text, 'validated'::text, 'active'::text, 'error'::text]))),
  CONSTRAINT "municipal_collection_configurations_municipality_id_fkey" FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE RESTRICT,
  CONSTRAINT "municipal_collection_configurations_pkey" PRIMARY KEY (id),
  CONSTRAINT "municipal_collection_configurations_municipality_id_version_key" UNIQUE (municipality_id, version)
);

ALTER TABLE public."municipal_collection_configurations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."municipal_collection_configurations" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public."municipal_payment_provider_connections" (
  "municipality_id" uuid NOT NULL,
  "provider" text NOT NULL DEFAULT 'manual'::text,
  "environment" text NOT NULL DEFAULT 'test'::text,
  "status" text NOT NULL DEFAULT 'inactive'::text,
  "credentials_ciphertext" text,
  "credential_fingerprint" text,
  "webhook_secret_ciphertext" text,
  "webhook_fingerprint" text,
  "last_tested_at" timestamp with time zone,
  "last_test_status" text,
  "last_test_message" text,
  "updated_by" uuid,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "municipal_payment_provider_connections_status_check" CHECK ((status = ANY (ARRAY['inactive'::text, 'configured'::text, 'active'::text, 'error'::text]))),
  CONSTRAINT "municipal_payment_provider_connections_environment_check" CHECK ((environment = ANY (ARRAY['test'::text, 'production'::text]))),
  CONSTRAINT "municipal_payment_provider_connections_provider_check" CHECK ((provider = ANY (ARRAY['mercado_pago'::text, 'bank_direct'::text, 'manual'::text]))),
  CONSTRAINT "municipal_payment_provider_connections_municipality_id_fkey" FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE CASCADE,
  CONSTRAINT "municipal_payment_provider_connections_pkey" PRIMARY KEY (municipality_id)
);

ALTER TABLE public."municipal_payment_provider_connections" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."municipal_payment_provider_connections" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public."municipal_collection_operations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "municipality_id" uuid NOT NULL,
  "guide_id" uuid NOT NULL,
  "configuration_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_poll_at" timestamp with time zone,
  "external_reference" text,
  "response_summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "municipal_collection_operations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'unsupported'::text]))),
  CONSTRAINT "municipal_collection_operations_operation_check" CHECK ((operation = ANY (ARRAY['issue'::text, 'query'::text, 'pdf'::text, 'payment'::text, 'reissue'::text, 'cancel'::text]))),
  CONSTRAINT "municipal_collection_operations_municipality_id_fkey" FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE RESTRICT,
  CONSTRAINT "municipal_collection_operations_guide_id_fkey" FOREIGN KEY (guide_id) REFERENCES payment_guides(id) ON DELETE RESTRICT,
  CONSTRAINT "municipal_collection_operations_configuration_id_fkey" FOREIGN KEY (configuration_id) REFERENCES municipal_collection_configurations(id) ON DELETE RESTRICT,
  CONSTRAINT "municipal_collection_operations_pkey" PRIMARY KEY (id),
  CONSTRAINT "municipal_collection_operatio_municipality_id_guide_id_oper_key" UNIQUE (municipality_id, guide_id, operation, idempotency_key)
);

ALTER TABLE public."municipal_collection_operations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."municipal_collection_operations" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public."municipal_collection_webhook_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "municipality_id" uuid NOT NULL,
  "configuration_id" uuid NOT NULL,
  "supplier_event_id" text NOT NULL,
  "signature_verified" boolean NOT NULL DEFAULT false,
  "payload_sha256" text NOT NULL,
  "processing_status" text NOT NULL DEFAULT 'received'::text,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  CONSTRAINT "municipal_collection_webhook_events_processing_status_check" CHECK ((processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'rejected'::text, 'failed'::text]))),
  CONSTRAINT "municipal_collection_webhook_events_payload_sha256_check" CHECK ((payload_sha256 ~ '^[a-f0-9]{64}$'::text)),
  CONSTRAINT "municipal_collection_webhook_events_configuration_id_fkey" FOREIGN KEY (configuration_id) REFERENCES municipal_collection_configurations(id) ON DELETE RESTRICT,
  CONSTRAINT "municipal_collection_webhook_events_municipality_id_fkey" FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE RESTRICT,
  CONSTRAINT "municipal_collection_webhook_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "municipal_collection_webhook__configuration_id_supplier_eve_key" UNIQUE (configuration_id, supplier_event_id)
);

ALTER TABLE public."municipal_collection_webhook_events" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."municipal_collection_webhook_events" FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.can_read_municipal_collection_v1(_municipality_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
  select public.is_master() or (public.has_tenant_access(_municipality_id) and public.is_internal_municipality_role())
$function$;

REVOKE ALL ON FUNCTION public."can_read_municipal_collection_v1"(_municipality_id uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.is_municipal_payment_admin(_municipality_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
  select
    public.is_master()
    or (
      public.has_tenant_access(_municipality_id)
      and public.current_role_code() = 'prefeitura_admin'
    )
$function$;

REVOKE ALL ON FUNCTION public."is_municipal_payment_admin"(_municipality_id uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.activate_municipal_collection_configuration_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  target public.municipal_collection_configurations;
  provider public.municipal_payment_provider_connections;
  bank jsonb;
  document text;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissão para administrar arrecadação';
  end if;
  select * into strict target from public.municipal_collection_configurations
    where municipality_id=_municipality_id order by version desc limit 1 for update;
  if target.status <> 'validated' then
    raise exception 'Valide a configuração antes de ativar';
  end if;

  if target.mode='sigapro' then
    select * into provider from public.municipal_payment_provider_connections
      where municipality_id=_municipality_id;
    if provider.municipality_id is null or provider.status <> 'active' then
      raise exception 'Provedor bancário da Prefeitura não está ativo';
    end if;
    if provider.environment <> target.environment then
      raise exception 'Ambiente bancário incompatível com a modalidade configurada';
    end if;
    if provider.provider='bank_direct' then
      raise exception 'Convênio bancário direto ainda não possui adaptador homologado';
    end if;
    if provider.provider='manual' and (
      coalesce((target.capabilities->>'payment')::boolean,false) or
      coalesce((target.capabilities->>'query')::boolean,false)
    ) then
      raise exception 'Baixa manual não permite consultas ou confirmação automática';
    end if;
    if provider.provider not in ('manual','mercado_pago') then
      raise exception 'Provedor bancário sem integração homologada';
    end if;
    if target.environment='production' then
      select general_settings into bank from public.municipality_settings
        where municipality_id=_municipality_id;
      document := regexp_replace(coalesce(bank->>'bank_beneficiary_document',''),'[^0-9]','','g');
      if document !~ '^[0-9]{14}$'
         or btrim(coalesce(bank->>'settlement_beneficiary',bank->>'beneficiario_arrecadacao',''))='' then
        raise exception 'Conta arrecadadora municipal sem beneficiário e CNPJ oficiais';
      end if;
    end if;
  elsif target.mode='municipal_system' then
    if target.integration_type='automatic' then
      raise exception 'Emissão automática do fornecedor municipal ainda não homologada';
    end if;
    if target.integration_type<>'controlled_import' then
      raise exception 'Selecione importação controlada de documento oficial';
    end if;
  else
    raise exception 'Modalidade de arrecadação inválida';
  end if;

  update public.municipal_collection_configurations
    set status=case when id=target.id then 'active'
                    when status='active' then 'validated' else status end,
        activated_at=case when id=target.id then now() else activated_at end
    where municipality_id=_municipality_id;
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $function$;

REVOKE ALL ON FUNCTION public."activate_municipal_collection_configuration_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."activate_municipal_collection_configuration_v1"(_municipality_id uuid) TO authenticated;

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
    where municipality_id=_municipality_id for update;
  if connection.municipality_id is null then raise exception 'Conexão municipal ainda não cadastrada'; end if;
  if connection.provider='bank_direct' then
    raise exception 'Banco/convênio cadastrado, mas ainda sem adaptador homologado para emissão automática';
  end if;
  if connection.provider='mercado_pago' then
    if connection.environment='production' then
      raise exception 'Cobrança real Mercado Pago bloqueada até homologação bancária e autorização da Prefeitura';
    end if;
    if connection.last_test_status<>'ok' or connection.credentials_ciphertext is null then
      raise exception 'Teste a credencial municipal antes de ativar o Mercado Pago';
    end if;
  elsif connection.provider<>'manual' then
    raise exception 'Provedor ainda não homologado';
  end if;
  update public.municipal_payment_provider_connections set
    status='active',updated_by=public.current_profile_id(),updated_at=now()
    where municipality_id=_municipality_id;
  return public.get_municipal_payment_connection_v1(_municipality_id);
end $function$;

REVOKE ALL ON FUNCTION public."activate_municipal_payment_connection_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."activate_municipal_payment_connection_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.append_municipal_collection_guide_document_v1(_municipality_id uuid, _process_id uuid, _reference text, _guide_kind text, _document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _mode public.municipal_collection_configurations;
  _process public.processes;
  _role text := coalesce(public.current_role_code(),'');
  _profile_id uuid := public.current_profile_id();
  _user_id uuid := public.current_legacy_user_id();
  _path text := nullif(btrim(_document->>'filePath'),'');
  _title text := nullif(btrim(_document->>'label'),'');
  _hash text := nullif(btrim(_document->>'fileHash'),'');
  _file_name text := nullif(btrim(_document->>'fileName'),'');
  _bytes bigint := coalesce(nullif(_document->>'fileSizeBytes','')::bigint,0);
  _ref text := upper(btrim(_reference));
  _existing uuid;
begin
  if _profile_id is null or not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Somente servidores municipais autenticados podem importar guias';
  end if;
  if not public.is_master() and _role in ('prefeitura_admin','admin_municipality','admin_prefeitura') then
    raise exception 'Administrador da Prefeitura configura arrecadacao, mas nao opera guias';
  end if;
  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final','habite_se') then
    raise exception 'Tipo de guia invalido';
  end if;
  if not public.is_master() and (
    (_guide_kind='protocolo' and _role not in ('counter_service','expedient','setor_intersetorial','prefeitura_supervisor')) or
    (_guide_kind<>'protocolo' and _role not in ('financial','financeiro','prefeitura_supervisor','setor_intersetorial'))
  ) then
    raise exception 'Guia deve ser importada pelo departamento responsavel';
  end if;
  if _ref !~ '^[A-Z0-9][A-Z0-9./_-]{2,79}$' then raise exception 'Numero da guia invalido'; end if;
  if _hash !~ '^[a-f0-9]{64}$' then raise exception 'SHA-256 da guia obrigatorio'; end if;
  if _file_name is null or lower(right(_file_name,4)) <> '.pdf' then raise exception 'Somente PDF oficial'; end if;
  if _bytes < 16 or _bytes > 3145728 then raise exception 'PDF fora do limite permitido'; end if;
  if coalesce(_document->>'mimeType','') <> 'application/pdf' then raise exception 'Tipo MIME de guia invalido'; end if;
  if coalesce(_document->>'source','') <> 'integracao' then raise exception 'Origem da guia invalida'; end if;
  if _title is null or _title not like '% - '||_ref||' | %' or
     _title !~ '^Guia (GOVBR/AR|municipal oficial) - ' then
    raise exception 'Identificacao da guia importada invalida';
  end if;
  if _path is null or _path not like 'municipalities/'||_municipality_id::text||'/govbr-ar/%' or
     _path like '%..%' or _path not like '%.pdf' then
    raise exception 'Arquivo fora do escopo privado de arrecadacao desta Prefeitura';
  end if;
  select * into _process from public.processes where id=_process_id;
  if _process.id is null or coalesce(_process.municipality_id,_process.tenant_id)<>_municipality_id then
    raise exception 'Processo nao pertence a esta Prefeitura';
  end if;
  if not public.has_tenant_access(_municipality_id) and not public.is_master() then
    raise exception 'Sem acesso a Prefeitura';
  end if;
  select * into _mode from public.municipal_collection_configurations
    where municipality_id=_municipality_id and status='active'
    order by version desc limit 1;
  if _mode.id is null or _mode.mode <> 'municipal_system' or _mode.integration_type <> 'controlled_import' then
    raise exception 'Importacao de guia municipal nao esta ativa nesta Prefeitura';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guide-import:'||_process_id::text,0));
  select id into _existing from public.process_documents
    where process_id=_process_id and (
      file_hash=_hash or title=_title or file_path=_path
    ) limit 1;
  if _existing is not null then raise exception 'Guia ja importada neste processo; abra o PDF original'; end if;

  insert into public.process_documents(
    tenant_id,municipality_id,process_id,uploaded_by,uploaded_by_profile_id,
    title,file_path,file_hash,version,source,is_required,is_valid,
    file_name,mime_type,size_label,file_size_bytes,review_status,annotations
  ) values(
    _process.tenant_id,_municipality_id,_process_id,_user_id,_profile_id,
    _title,_path,_hash,1,'integracao',false,true,_file_name,'application/pdf',
    (_bytes/1024)::text||' KB',_bytes,'pendente','[]'::jsonb
  );
  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,municipality_id
  ) values (
    _process.tenant_id,_process_id,_user_id,_profile_id,
    'documento','Guia municipal oficial recebida',
    'Guia externa '||_ref||' recebida pela Prefeitura (PDF original, sem cobranca SIGAPRO e sem baixa automatica).',
    true,_municipality_id
  );
  return jsonb_build_object('process_id',_process_id,'synced',1,'inserted',1,'stored',1);
end $function$;

REVOKE ALL ON FUNCTION public."append_municipal_collection_guide_document_v1"(_municipality_id uuid, _process_id uuid, _reference text, _guide_kind text, _document jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."append_municipal_collection_guide_document_v1"(_municipality_id uuid, _process_id uuid, _reference text, _guide_kind text, _document jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_municipal_collection_configuration_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  c public.municipal_collection_configurations;
begin
  if not public.can_read_municipal_collection_v1(_municipality_id) then
    raise exception 'Sem acesso à modalidade de arrecadação desta prefeitura';
  end if;
  select * into c from public.municipal_collection_configurations
   where municipality_id = _municipality_id and status = 'active'
   order by version desc limit 1;
  if c.id is null then
    return jsonb_build_object('municipality_id',_municipality_id,'mode','sigapro','status','not_configured','enabled',false);
  end if;
  return jsonb_build_object(
    'municipality_id',c.municipality_id,
    'mode',c.mode,
    'status',c.status,
    'enabled',true,
    'supplier_code',c.supplier_code,
    'supplier_name',c.supplier_name,
    'integration_type',c.integration_type,
    'version',c.version
  );
end $function$;

REVOKE ALL ON FUNCTION public."get_active_municipal_collection_configuration_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_active_municipal_collection_configuration_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_municipal_collection_bank_details_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare g jsonb;
begin
  if not public.can_read_municipal_collection_v1(_municipality_id) then
    raise exception 'Sem acesso a configuracao bancaria desta Prefeitura';
  end if;
  select coalesce(general_settings,'{}'::jsonb) into g
  from public.municipality_settings where municipality_id=_municipality_id;
  if g is null then raise exception 'Configuracoes da Prefeitura nao encontradas'; end if;
  return jsonb_build_object(
    'beneficiarioArrecadacao', coalesce(g->>'settlement_beneficiary',g->>'beneficiario_arrecadacao',''),
    'chavePix',coalesce(g->>'pix_key',g->>'chave_pix',''),
    'pixEnabled',coalesce((g->>'pix_enabled')::boolean,length(coalesce(g->>'pix_key',g->>'chave_pix',''))>0),
    'pixKeyType',coalesce(g->>'pix_key_type','cnpj'),
    'pixMerchantCity',coalesce(g->>'pix_merchant_city',''),
    'bankCode',coalesce(g->>'bank_code',''),
    'bankName',coalesce(g->>'bank_name',''),
    'bankAgency',coalesce(g->>'bank_agency',''),
    'bankAgencyDigit',coalesce(g->>'bank_agency_digit',''),
    'bankAccount',coalesce(g->>'bank_account',''),
    'bankAccountDigit',coalesce(g->>'bank_account_digit',''),
    'bankBeneficiaryDocument',coalesce(g->>'bank_beneficiary_document',''),
    'bankCollectionMode',coalesce(g->>'bank_collection_mode','manual'),
    'bankAgreementCode',coalesce(g->>'bank_agreement_code',''),
    'bankWallet',coalesce(g->>'bank_wallet',''),
    'bankInstructions',coalesce(g->>'bank_instructions','')
  );
end $function$;

REVOKE ALL ON FUNCTION public."get_municipal_collection_bank_details_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_municipal_collection_bank_details_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_municipal_collection_configuration_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare c public.municipal_collection_configurations; begin
  if not public.can_read_municipal_collection_v1(_municipality_id) then raise exception 'Sem acesso à configuração de arrecadação'; end if;
  select * into c from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1;
  if c.id is null then return jsonb_build_object('municipality_id',_municipality_id,'status','not_configured','mode','sigapro','enabled',false); end if;
  return (to_jsonb(c)-array['secret_ciphertext']) || jsonb_build_object('secret_configured',c.secret_ciphertext is not null);
end $function$;

REVOKE ALL ON FUNCTION public."get_municipal_collection_configuration_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_municipal_collection_configuration_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_municipal_collection_secret_admin_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare c public.municipal_collection_configurations; begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  select * into strict c from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1;
  return to_jsonb(c);
end $function$;

REVOKE ALL ON FUNCTION public."get_municipal_collection_secret_admin_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_municipal_collection_secret_admin_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_municipal_payment_connection_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _row public.municipal_payment_provider_connections%rowtype;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_payment_provider_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','manual',
      'environment','test',
      'status','inactive',
      'credentials_configured',false,
      'credential_fingerprint','',
      'webhook_configured',false,
      'webhook_fingerprint',''
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'environment',_row.environment,
    'status',_row.status,
    'credentials_configured',_row.credentials_ciphertext is not null,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'webhook_configured',_row.webhook_secret_ciphertext is not null,
    'webhook_fingerprint',coalesce(_row.webhook_fingerprint,''),
    'last_tested_at',_row.last_tested_at,
    'last_test_status',_row.last_test_status,
    'last_test_message',_row.last_test_message,
    'updated_at',_row.updated_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION public."get_municipal_payment_connection_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_municipal_payment_connection_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_municipal_payment_secret_admin_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _row public.municipal_payment_provider_connections%rowtype;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_payment_provider_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','manual',
      'environment','test',
      'status','inactive'
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'environment',_row.environment,
    'status',_row.status,
    'credentials_ciphertext',_row.credentials_ciphertext,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'webhook_secret_ciphertext',_row.webhook_secret_ciphertext,
    'webhook_fingerprint',coalesce(_row.webhook_fingerprint,'')
  );
end;
$function$;

REVOKE ALL ON FUNCTION public."get_municipal_payment_secret_admin_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_municipal_payment_secret_admin_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_municipal_collection_validation_v1(_municipality_id uuid, _ok boolean, _message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$ begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  update public.municipal_collection_configurations set status=case when _ok then 'validated' else 'error' end,validated_at=case when _ok then now() else null end,validation_message=left(coalesce(_message,''),1000)
  where id=(select id from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1);
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $function$;

REVOKE ALL ON FUNCTION public."mark_municipal_collection_validation_v1"(_municipality_id uuid, _ok boolean, _message text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."mark_municipal_collection_validation_v1"(_municipality_id uuid, _ok boolean, _message text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_municipal_payment_test_v1(_municipality_id uuid, _ok boolean, _message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  update public.municipal_payment_provider_connections
  set last_tested_at=now(),
      last_test_status=case when _ok then 'ok' else 'error' end,
      last_test_message=left(coalesce(_message,''),1000),
      status=case when _ok then 'configured' else 'error' end,
      updated_at=now()
  where municipality_id=_municipality_id;

  return public.get_municipal_payment_connection_v1(_municipality_id);
end;
$function$;

REVOKE ALL ON FUNCTION public."mark_municipal_payment_test_v1"(_municipality_id uuid, _ok boolean, _message text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."mark_municipal_payment_test_v1"(_municipality_id uuid, _ok boolean, _message text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_municipal_payment_secret_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _row public.municipal_payment_provider_connections%rowtype;
begin
  if not public.has_tenant_access(_municipality_id) and not public.is_master() then
    raise exception 'Sem acesso ao provedor de pagamento desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_payment_provider_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','manual',
      'environment','test',
      'status','inactive'
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'environment',_row.environment,
    'status',_row.status,
    'credentials_ciphertext',_row.credentials_ciphertext,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'webhook_secret_ciphertext',_row.webhook_secret_ciphertext,
    'webhook_fingerprint',coalesce(_row.webhook_fingerprint,'')
  );
end;
$function$;

REVOKE ALL ON FUNCTION public."resolve_municipal_payment_secret_v1"(_municipality_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."resolve_municipal_payment_secret_v1"(_municipality_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_municipal_collection_bank_details_v1(_municipality_id uuid, _fields jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  p jsonb;
  k text;
  beneficiary text := btrim(coalesce(_fields->>'beneficiarioArrecadacao',''));
  pix_key text := btrim(coalesce(_fields->>'chavePix',''));
  pix_enabled boolean;
  pix_type text := coalesce(_fields->>'pixKeyType','cnpj');
  pix_city text := btrim(coalesce(_fields->>'pixMerchantCity',''));
  bank_code text := btrim(coalesce(_fields->>'bankCode',''));
  bank_name text := btrim(coalesce(_fields->>'bankName',''));
  bank_mode text := coalesce(_fields->>'bankCollectionMode','manual');
  agreement text := btrim(coalesce(_fields->>'bankAgreementCode',''));
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Somente o administrador pode alterar os dados bancarios da Prefeitura';
  end if;
  if _fields is null or jsonb_typeof(_fields)<>'object' then raise exception 'Formulario bancario invalido'; end if;
  for k in select jsonb_object_keys(_fields) loop
    if k <> all(array[
      'beneficiarioArrecadacao','chavePix','pixEnabled','pixKeyType','pixMerchantCity',
      'bankCode','bankName','bankAgency','bankAgencyDigit','bankAccount',
      'bankAccountDigit','bankBeneficiaryDocument','bankCollectionMode','bankAgreementCode',
      'bankWallet','bankInstructions'
    ]) then raise exception 'Campo bancario inesperado: %',k; end if;
  end loop;
  if jsonb_typeof(_fields->'pixEnabled') is distinct from 'boolean' then
    raise exception 'Opcao PIX invalida';
  end if;
  pix_enabled := (_fields->>'pixEnabled')::boolean;
  if pix_type not in ('cpf','cnpj','email','phone','random') then raise exception 'Tipo de chave PIX invalido'; end if;
  if pix_enabled and (beneficiary='' or pix_key='' or pix_city='') then
    raise exception 'Configure beneficiario, chave e cidade para habilitar o PIX';
  end if;
  if bank_code <> '' and bank_code !~ '^[0-9]{3}$' then
    raise exception 'Codigo COMPE deve ter tres digitos';
  end if;
  if bank_mode not in ('manual','agreement','api') then raise exception 'Modalidade bancaria invalida'; end if;
  if bank_mode <> 'manual' and (bank_code='' or bank_name='') then
    raise exception 'Banco e codigo COMPE obrigatorios para convenio/API';
  end if;
  if bank_mode='agreement' and agreement='' then raise exception 'Numero de convenio obrigatorio'; end if;
  if length(beneficiary)>180 or length(pix_key)>130 or length(pix_city)>110 or
    length(bank_name)>150 or length(coalesce(_fields->>'bankInstructions',''))>1500 then
    raise exception 'Campo bancario excede limite';
  end if;
  p := jsonb_build_object(
    'settlement_beneficiary',beneficiary,'beneficiario_arrecadacao',beneficiary,
    'pix_key',pix_key,'chave_pix',pix_key,'pix_enabled',pix_enabled,
    'pix_key_type',pix_type,'pix_merchant_city',pix_city,
    'bank_code',bank_code,'bank_name',bank_name,
    'bank_agency',btrim(coalesce(_fields->>'bankAgency','')),
    'bank_agency_digit',btrim(coalesce(_fields->>'bankAgencyDigit','')),
    'bank_account',btrim(coalesce(_fields->>'bankAccount','')),
    'bank_account_digit',btrim(coalesce(_fields->>'bankAccountDigit','')),
    'bank_beneficiary_document',btrim(coalesce(_fields->>'bankBeneficiaryDocument','')),
    'bank_collection_mode',bank_mode,'bank_agreement_code',agreement,
    'bank_wallet',btrim(coalesce(_fields->>'bankWallet','')),
    'bank_instructions',btrim(coalesce(_fields->>'bankInstructions',''))
  );
  update public.municipality_settings
     set general_settings = coalesce(general_settings,'{}'::jsonb) || p, updated_at = now()
   where municipality_id=_municipality_id;
  if not found then raise exception 'Configuracoes da Prefeitura nao encontradas'; end if;
  return public.get_municipal_collection_bank_details_v1(_municipality_id);
end $function$;

REVOKE ALL ON FUNCTION public."save_municipal_collection_bank_details_v1"(_municipality_id uuid, _fields jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."save_municipal_collection_bank_details_v1"(_municipality_id uuid, _fields jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_municipal_collection_configuration_v1(_municipality_id uuid, _mode text, _supplier_code text, _supplier_name text, _api_base_url text, _environment text, _integration_type text, _secret_ciphertext text, _secret_fingerprint text, _public_parameters jsonb, _capabilities jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare c public.municipal_collection_configurations; previous public.municipal_collection_configurations; next_version integer; begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  if _mode not in ('sigapro','municipal_system') or _environment not in ('test','production') or _integration_type not in ('automatic','controlled_import') then raise exception 'Configuração de arrecadação inválida'; end if;
  if _api_base_url <> '' and _api_base_url !~ '^https://' then raise exception 'A URL oficial deve usar HTTPS'; end if;
  select * into previous from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1;
  select coalesce(max(version),0)+1 into next_version from public.municipal_collection_configurations where municipality_id=_municipality_id;
  insert into public.municipal_collection_configurations(municipality_id,version,mode,status,supplier_code,supplier_name,api_base_url,environment,integration_type,secret_ciphertext,secret_fingerprint,public_parameters,capabilities,created_by)
  values(_municipality_id,next_version,_mode,'homologation',nullif(_supplier_code,''),nullif(_supplier_name,''),nullif(_api_base_url,''),_environment,_integration_type,coalesce(_secret_ciphertext,previous.secret_ciphertext),coalesce(_secret_fingerprint,previous.secret_fingerprint),coalesce(_public_parameters,'{}'),coalesce(_capabilities,'{}'),public.current_profile_id()) returning * into c;
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $function$;

REVOKE ALL ON FUNCTION public."save_municipal_collection_configuration_v1"(_municipality_id uuid, _mode text, _supplier_code text, _supplier_name text, _api_base_url text, _environment text, _integration_type text, _secret_ciphertext text, _secret_fingerprint text, _public_parameters jsonb, _capabilities jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."save_municipal_collection_configuration_v1"(_municipality_id uuid, _mode text, _supplier_code text, _supplier_name text, _api_base_url text, _environment text, _integration_type text, _secret_ciphertext text, _secret_fingerprint text, _public_parameters jsonb, _capabilities jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_municipal_payment_connection_v1(_municipality_id uuid, _provider text, _environment text, _credentials_ciphertext text DEFAULT NULL::text, _credential_fingerprint text DEFAULT NULL::text, _webhook_secret_ciphertext text DEFAULT NULL::text, _webhook_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  old_connection public.municipal_payment_provider_connections;
  keep_current boolean;
  new_credential text;
  new_fingerprint text;
  new_webhook text;
  new_webhook_fingerprint text;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissão para administrar pagamentos desta Prefeitura';
  end if;
  if _provider not in ('mercado_pago','bank_direct','manual') then
    raise exception 'Provedor de pagamento inválido';
  end if;
  if _environment not in ('test','production') then
    raise exception 'Ambiente de pagamento inválido';
  end if;

  select * into old_connection from public.municipal_payment_provider_connections
    where municipality_id=_municipality_id for update;
  keep_current := old_connection.municipality_id is not null
    and old_connection.provider=_provider
    and old_connection.environment=_environment
    and _provider='mercado_pago';

  -- Never carry a test token into production or another provider. A blank input
  -- keeps a credential ONLY if provider AND environment are unchanged.
  new_credential := case when _provider='mercado_pago'
    then coalesce(nullif(_credentials_ciphertext,''),case when keep_current then old_connection.credentials_ciphertext end)
    else null end;
  new_fingerprint := case when _provider='mercado_pago'
    then coalesce(nullif(_credential_fingerprint,''),case when keep_current then old_connection.credential_fingerprint end)
    else null end;
  new_webhook := case when _provider='mercado_pago'
    then coalesce(nullif(_webhook_secret_ciphertext,''),case when keep_current then old_connection.webhook_secret_ciphertext end)
    else null end;
  new_webhook_fingerprint := case when _provider='mercado_pago'
    then coalesce(nullif(_webhook_fingerprint,''),case when keep_current then old_connection.webhook_fingerprint end)
    else null end;

  insert into public.municipal_payment_provider_connections(
    municipality_id,provider,environment,status,
    credentials_ciphertext,credential_fingerprint,
    webhook_secret_ciphertext,webhook_fingerprint,
    last_tested_at,last_test_status,last_test_message,updated_by,updated_at
  ) values (
    _municipality_id,_provider,_environment,
    case when _provider='manual' then 'active' else 'configured' end,
    new_credential,new_fingerprint,new_webhook,new_webhook_fingerprint,
    null,null,null,public.current_profile_id(),now()
  ) on conflict (municipality_id) do update set
    provider=excluded.provider,environment=excluded.environment,
    status=excluded.status,
    credentials_ciphertext=excluded.credentials_ciphertext,
    credential_fingerprint=excluded.credential_fingerprint,
    webhook_secret_ciphertext=excluded.webhook_secret_ciphertext,
    webhook_fingerprint=excluded.webhook_fingerprint,
    last_tested_at=null,last_test_status=null,last_test_message=null,
    updated_by=excluded.updated_by,updated_at=now();

  return public.get_municipal_payment_connection_v1(_municipality_id);
end $function$;

REVOKE ALL ON FUNCTION public."save_municipal_payment_connection_v1"(_municipality_id uuid, _provider text, _environment text, _credentials_ciphertext text, _credential_fingerprint text, _webhook_secret_ciphertext text, _webhook_fingerprint text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."save_municipal_payment_connection_v1"(_municipality_id uuid, _provider text, _environment text, _credentials_ciphertext text, _credential_fingerprint text, _webhook_secret_ciphertext text, _webhook_fingerprint text) TO authenticated;

NOTIFY pgrst, 'reload schema';
