import { useEffect, useMemo, useState } from "react";
import { Cloud, Database, HardDrive, KeyRound, Server, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { backendClient } from "@/integrations/backend/databaseClient";

type StorageConnection = {
  municipality_id?: string;
  provider?: "sigapro_r2" | "s3_compatible";
  status?: "inactive" | "configured" | "active" | "error";
  endpoint_url?: string;
  region?: string;
  bucket_documents?: string;
  base_path?: string;
  force_path_style?: boolean;
  credentials_configured?: boolean;
  credential_fingerprint?: string;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  updated_at?: string | null;
  testOk?: boolean;
  testMessage?: string;
};

const apiBase = (import.meta.env.VITE_R2_API_BASE || "").toString().replace(/\/+$/, "");

function buildApiUrl(path: string) {
  if (!apiBase) return path;
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

async function authorizationHeaders() {
  try {
    const result = await backendClient?.auth?.getSession?.();
    const session = result?.data?.session ?? null;
    const token =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function storageRequest(
  municipalityId: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const response = await fetch(buildApiUrl("/api/storage-connection"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authorizationHeaders()),
    },
    body: JSON.stringify({ municipalityId, action, ...payload }),
  });
  const body = (await response.json().catch(() => ({}))) as StorageConnection & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Não foi possível concluir a configuração de armazenamento.");
  }
  if(body.municipality_id!==municipalityId.toLowerCase())throw Error("O servidor não confirmou a Prefeitura selecionada.");
  return body;
}

function providerLabel(connection: StorageConnection | null) {
  if (!connection || connection.provider !== "s3_compatible" || connection.status !== "active") {
    return "SIGAPRO Nuvem · Arquivos Oficiais";
  }
  return "Armazenamento próprio da Prefeitura";
}

function MunicipalStorageSettingsForm({
  municipalityId,
  municipalityName,
}: {
  municipalityId: string;
  municipalityName?: string | null;
}) {
  const [connection, setConnection] = useState<StorageConnection | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(false);
  const [form, setForm] = useState({
    endpointUrl: "",
    region: "us-east-1",
    bucketDocuments: "",
    basePath: "",
    forcePathStyle: false,
    accessKeyId: "",
    secretAccessKey: "",
  });

  const isMunicipalActive =
    connection?.provider === "s3_compatible" && connection?.status === "active";
  const isConfigured =
    connection?.provider === "s3_compatible" &&
    Boolean(connection.endpoint_url && connection.bucket_documents);
  const dirty = Boolean(connection && (
    form.endpointUrl.trim() !== (connection.endpoint_url || "") ||
    form.region.trim() !== (connection.region || "us-east-1") ||
    form.bucketDocuments.trim() !== (connection.bucket_documents || "") ||
    form.basePath.trim().replace(/^\/+|\/+$/g,"") !== (connection.base_path || "") ||
    form.forcePathStyle !== Boolean(connection.force_path_style) ||
    form.accessKeyId.trim() || form.secretAccessKey.trim()
  ));
  const canSave = Boolean(connection && !isMunicipalActive && form.endpointUrl.trim() && form.bucketDocuments.trim() &&
    form.accessKeyId.trim() && form.secretAccessKey.trim());
  const testAge = connection?.last_tested_at ? Date.now() - Date.parse(connection.last_tested_at) : NaN;
  const hasValidTest = connection?.last_test_status === "ok" && Number.isFinite(testAge) && testAge >= 0 && testAge < 86400000;

  const statusLabel = useMemo(() => {
    if (!connection) return busy==="load" ? "Carregando" : "Configuração não consultada";
    if (isMunicipalActive) return "Armazenamento municipal ativo";
    if (connection.provider === "s3_compatible" && connection.status === "error") {
      return "Conexão municipal com erro";
    }
    if (connection.provider === "s3_compatible") return "Conexão municipal preparada";
    return "SIGAPRO Nuvem ativa";
  }, [connection, isMunicipalActive, busy]);

  const load = async () => {
    if (!municipalityId) return;
    setBusy("load");
    setMessage("");
    setMessageOk(false);
    try {
      const current = await storageRequest(municipalityId, "get");
      setConnection(current);
      setForm((value) => ({
        ...value,
        endpointUrl: current.endpoint_url || "",
        region: current.region || "us-east-1",
        bucketDocuments: current.bucket_documents || "",
        basePath: current.base_path || "",
        forcePathStyle: Boolean(current.force_path_style),
        accessKeyId: "",
        secretAccessKey: "",
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar a configuração.");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    void load();
  }, [municipalityId]);

  const save = async () => {
    setBusy("save");
    setMessage("");
    setMessageOk(false);
    try {
      const next = await storageRequest(municipalityId, "save", form);
      if(next.status!=="configured" || next.provider!=="s3_compatible" || !next.credentials_configured)throw Error("O servidor não confirmou o cadastro.");
      setConnection(next);
      setForm((current) => ({ ...current, endpointUrl:next.endpoint_url||"",region:next.region||"us-east-1",bucketDocuments:next.bucket_documents||"",basePath:next.base_path||"",forcePathStyle:Boolean(next.force_path_style),accessKeyId: "", secretAccessKey: "" }));
      setMessageOk(true);
      setMessage(
        "Conexão salva. O repositório permanece inalterado até a validação e ativação.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar a conexão.");
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setMessage("");
    setMessageOk(false);
    try {
      const next = await storageRequest(municipalityId, "test");
      if(next.testOk!==true || next.last_test_status!=="ok")throw Error("O servidor não confirmou o teste.");
      setConnection(next);
      setMessageOk(true);
      setMessage(next.testMessage || "Conexão validada com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível validar o armazenamento.");
      // Keep the error visible and invalidate the local proof; the server rechecks it on activation.
      setConnection(current=>current?{...current,last_test_status:"error"}:current);
    } finally {
      setBusy("");
    }
  };

  const activate = async () => {
    setBusy("activate");
    setMessage("");
    setMessageOk(false);
    try {
      const next = await storageRequest(municipalityId, "activate");
      if(next.provider!=="s3_compatible" || next.status!=="active")throw Error("Ativação não confirmada pelo servidor.");
      setConnection(next);
      setMessageOk(true);
      setMessage(
        "Armazenamento da Prefeitura ativado. Novos documentos oficiais serão gravados no repositório municipal.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar o armazenamento.");
    } finally {
      setBusy("");
    }
  };

  const activateSigaproR2 = async () => {
    setBusy("sigapro");
    setMessage("");
    setMessageOk(false);
    try {
      const next = await storageRequest(municipalityId, "use_sigapro");
      if(next.provider!=="sigapro_r2" || next.status!=="active")throw Error("Retorno ao repositório institucional não confirmado.");
      setConnection(next);
      setMessageOk(true);
      setMessage("SIGAPRO Nuvem definida como armazenamento ativo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar o armazenamento.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Repositório oficial de documentos
              </p>
              <h3 className="mt-2 break-words text-lg font-semibold text-slate-950 dark:text-slate-100">{providerLabel(connection)}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {isMunicipalActive
                  ? `Os novos arquivos oficiais de ${municipalityName || "esta Prefeitura"} são armazenados no repositório municipal configurado.`
                  : "Por enquanto, os documentos permanecem no armazenamento privado do SIGAPRO. A Prefeitura pode migrar para sua própria nuvem ou servidor quando o contrato exigir."}
              </p>
              {!isMunicipalActive ? (
                <details data-sigapro-storage-infrastructure="true"
                  className="mt-3 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                    Informações da infraestrutura
                  </summary>
                  <p className="mt-2 break-words [overflow-wrap:anywhere]">
                    O repositório contratado pelo SIGAPRO utiliza armazenamento Cloudflare R2.
                    Os arquivos permanecem protegidos conforme as permissões do município.
                  </p>
                </details>
              ) : null}
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isMunicipalActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
            }`}>
              <span className={`h-2 w-2 rounded-full ${isMunicipalActive ? "bg-emerald-600" : "bg-sky-600"}`} />
              {statusLabel}
            </div>
          </div>

          <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <Database className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Metadados do processo</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Continuam no banco operacional do SIGAPRO para o funcionamento do sistema.
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <HardDrive className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Arquivos oficiais</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                PDFs, projetos e anexos seguem o repositório selecionado para a Prefeitura.
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
              <ShieldCheck className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Credenciais protegidas</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                As chaves ficam cifradas e vinculadas à Prefeitura e ao endpoint. O servidor não as devolve ao navegador.
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
              {isMunicipalActive ? <Server className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /> : <Cloud className="h-5 w-5 text-sky-700 dark:text-sky-300" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">Situação da conexão</p>
              <p className="break-words text-xs text-slate-500 dark:text-slate-400">
                {connection?.credentials_configured
                  ? `Credencial: ${connection.credential_fingerprint || "configurada"}`
                  : "Nenhuma credencial municipal armazenada"}
              </p>
            </div>
          </div>

          <div className="mt-4 min-w-0 space-y-2 break-words text-sm text-slate-600 dark:text-slate-300">
            <p>Último teste: {connection?.last_tested_at ? new Date(connection.last_tested_at).toLocaleString("pt-BR") : "ainda não realizado"}</p>
            {connection?.last_test_message ? <p>{connection.last_test_message}</p> : null}
          </div>

          {isMunicipalActive ? (
            <Button
              type="button"
              variant="outline"
              className="mt-5 min-h-11 h-auto w-full whitespace-normal rounded-xl text-center"
              disabled={Boolean(busy)}
              onClick={() => void activateSigaproR2()}
            >
              Voltar ao SIGAPRO Nuvem
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Nuvem ou servidor da Prefeitura
            </p>
            <h3 className="mt-2 break-words text-lg font-semibold text-slate-950 dark:text-slate-100">
              Conectar armazenamento S3 compatível
            </h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Configure Cloudflare R2 ou AWS S3. A ativação é permitida antes do primeiro processo. Para um município com acervo existente, a troca depende de migração verificada dos arquivos. As legislações públicas permanecem no repositório institucional.
            </p>
          </div>
          <KeyRound className="h-5 w-5 text-slate-400" />
        </div>

        <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label>Endpoint HTTPS</Label>
            <Input
              value={form.endpointUrl}
              onChange={(event) => setForm((current) => ({ ...current, endpointUrl: event.target.value }))}
              placeholder="https://<conta>.r2.cloudflarestorage.com"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Região</Label>
            <Input
              value={form.region}
              onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
              placeholder="us-east-1"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Bucket de documentos oficiais</Label>
            <Input
              value={form.bucketDocuments}
              onChange={(event) => setForm((current) => ({ ...current, bucketDocuments: event.target.value }))}
              placeholder="sigapro-documentos-prefeitura"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Prefixo/pasta base (opcional)</Label>
            <Input
              value={form.basePath}
              onChange={(event) => setForm((current) => ({ ...current, basePath: event.target.value }))}
              placeholder="sigapro"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Access Key</Label>
            <Input
              autoComplete="off"
              value={form.accessKeyId}
              onChange={(event) => setForm((current) => ({ ...current, accessKeyId: event.target.value }))}
              placeholder={connection?.credentials_configured ? "Informe a nova chave para salvar alterações" : "Access Key da Prefeitura"}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Secret Key</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.secretAccessKey}
              onChange={(event) => setForm((current) => ({ ...current, secretAccessKey: event.target.value }))}
              placeholder={connection?.credentials_configured ? "Informe a nova chave para salvar alterações" : "Secret Key da Prefeitura"}
            />
          </div>
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Formato de acesso ao bucket</p>
            <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
              Use apenas se o endpoint oficial R2 ou AWS S3 exigir path-style.
            </p>
          </div>
          <Switch
            checked={form.forcePathStyle}
            onCheckedChange={(checked) => setForm((current) => ({ ...current, forcePathStyle: checked }))}
          />
        </div>

        {!connection&&!busy?<Button type="button" variant="outline" onClick={()=>void load()}>Consultar configuração novamente</Button>:null}
        {message ? (
          <div role={messageOk?"status":"alert"} className={`mt-4 min-w-0 break-words rounded-xl border px-4 py-3 text-sm ${
            messageOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          }`}>
            {message}
          </div>
        ) : null}

        {dirty&&!isMunicipalActive?<p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Salve os dados e as duas chaves antes de testar ou ativar a nova configuração.</p>:null}
        {isMunicipalActive?<p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Repositório ativo: alterações exigem migração ou rotação controlada.</p>:null}
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 h-auto w-full whitespace-normal rounded-xl text-center sm:w-auto"
            disabled={Boolean(busy) || !canSave}
            onClick={() => void save()}
          >
            {busy === "save" ? "Salvando..." : "Salvar conexão"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 h-auto w-full whitespace-normal rounded-xl text-center sm:w-auto"
            disabled={Boolean(busy) || !isConfigured || dirty}
            onClick={() => void test()}
          >
            {busy === "test" ? "Testando..." : "Testar conexão"}
          </Button>
          <Button
            type="button"
            className="min-h-11 h-auto w-full whitespace-normal rounded-xl bg-sky-800 px-5 text-white hover:bg-sky-700 dark:bg-sky-700 dark:hover:bg-sky-600 sm:w-auto"
            disabled={Boolean(busy) || !hasValidTest || isMunicipalActive || dirty}
            onClick={() => void activate()}
          >
            {busy === "activate" ? "Ativando..." : "Ativar armazenamento municipal"}
          </Button>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 sm:p-5">
        <p className="font-semibold">Separação de responsabilidade</p>
        <p className="mt-1">
          Esta configuração transfere o local físico dos arquivos oficiais. Ela não transforma o SIGAPRO em um sistema sem acesso técnico: o software ainda precisa acessar os arquivos para entregá-los aos usuários autorizados. Para uma política em que nem o operador do SIGAPRO consiga descriptografar o conteúdo, é necessário adotar criptografia com chave controlada exclusivamente pela Prefeitura/BYOK.
        </p>
      </div>
    </div>
  );
}

/** Remount on tenant change so an asynchronous response from a previous
 * municipality cannot populate the new municipality's form. */
export function MunicipalStorageSettings(props:{municipalityId:string;municipalityName?:string|null}){
 return <MunicipalStorageSettingsForm key={props.municipalityId} {...props}/>;
}
