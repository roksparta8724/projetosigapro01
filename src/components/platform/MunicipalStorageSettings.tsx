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
  return body;
}

function providerLabel(connection: StorageConnection | null) {
  if (!connection || connection.provider !== "s3_compatible" || connection.status !== "active") {
    return "SIGAPRO Cloud · Cloudflare R2";
  }
  return "Armazenamento próprio da Prefeitura";
}

export function MunicipalStorageSettings({
  municipalityId,
  municipalityName,
}: {
  municipalityId: string;
  municipalityName?: string | null;
}) {
  const [connection, setConnection] = useState<StorageConnection | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
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
  const hasValidTest = connection?.last_test_status === "ok";

  const statusLabel = useMemo(() => {
    if (!connection) return "Carregando";
    if (isMunicipalActive) return "Armazenamento municipal ativo";
    if (connection.provider === "s3_compatible" && connection.status === "error") {
      return "Conexão municipal com erro";
    }
    if (connection.provider === "s3_compatible") return "Conexão municipal preparada";
    return "R2 do SIGAPRO ativo";
  }, [connection, isMunicipalActive]);

  const load = async () => {
    if (!municipalityId) return;
    setBusy("load");
    setMessage("");
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
    try {
      const next = await storageRequest(municipalityId, "save", form);
      setConnection(next);
      setForm((current) => ({ ...current, accessKeyId: "", secretAccessKey: "" }));
      setMessage(
        "Conexão salva. Os documentos continuam no R2 do SIGAPRO até o teste e a ativação do armazenamento municipal.",
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
    try {
      const next = await storageRequest(municipalityId, "test");
      setConnection(next);
      setMessage(next.testMessage || "Conexão validada com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível validar o armazenamento.");
      void load();
    } finally {
      setBusy("");
    }
  };

  const activate = async () => {
    setBusy("activate");
    setMessage("");
    try {
      const next = await storageRequest(municipalityId, "activate");
      setConnection(next);
      setMessage(
        "Armazenamento da Prefeitura ativado. Novos documentos oficiais serão gravados no repositório municipal.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar o armazenamento.");
    } finally {
      setBusy("");
    }
  };

  const useSigapro = async () => {
    setBusy("sigapro");
    setMessage("");
    try {
      const next = await storageRequest(municipalityId, "use_sigapro");
      setConnection(next);
      setMessage("Cloudflare R2 do SIGAPRO definido como armazenamento ativo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar o armazenamento.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Repositório oficial de documentos
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">{providerLabel(connection)}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {isMunicipalActive
                  ? `Os novos arquivos oficiais de ${municipalityName || "esta Prefeitura"} são armazenados no repositório municipal configurado.`
                  : "Por enquanto, os documentos permanecem no armazenamento privado do SIGAPRO. A Prefeitura pode migrar para sua própria nuvem ou servidor quando o contrato exigir."}
              </p>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isMunicipalActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
            }`}>
              <span className={`h-2 w-2 rounded-full ${isMunicipalActive ? "bg-emerald-600" : "bg-sky-600"}`} />
              {statusLabel}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Database className="h-5 w-5 text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Metadados do processo</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Continuam no banco operacional do SIGAPRO para o funcionamento do sistema.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <HardDrive className="h-5 w-5 text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Arquivos oficiais</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                PDFs, projetos e anexos seguem o repositório selecionado para a Prefeitura.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Credenciais protegidas</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                As chaves não são devolvidas ao navegador e ficam cifradas no backend.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white">
              {isMunicipalActive ? <Server className="h-5 w-5 text-emerald-700" /> : <Cloud className="h-5 w-5 text-sky-700" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Situação da conexão</p>
              <p className="text-xs text-slate-500">
                {connection?.credentials_configured
                  ? `Credencial: ${connection.credential_fingerprint || "configurada"}`
                  : "Nenhuma credencial municipal armazenada"}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>Último teste: {connection?.last_tested_at ? new Date(connection.last_tested_at).toLocaleString("pt-BR") : "ainda não realizado"}</p>
            {connection?.last_test_message ? <p>{connection.last_test_message}</p> : null}
          </div>

          {isMunicipalActive ? (
            <Button
              type="button"
              variant="outline"
              className="mt-5 w-full rounded-full"
              disabled={Boolean(busy)}
              onClick={() => void useSigapro()}
            >
              Voltar a usar R2 do SIGAPRO
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nuvem ou servidor da Prefeitura
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              Conectar armazenamento S3 compatível
            </h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Compatível com AWS S3, MinIO, Ceph, Cloudflare R2 próprio e outros serviços com API S3. O vínculo pode ficar preparado sem ser ativado.
            </p>
          </div>
          <KeyRound className="h-5 w-5 text-slate-400" />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Endpoint HTTPS</Label>
            <Input
              value={form.endpointUrl}
              onChange={(event) => setForm((current) => ({ ...current, endpointUrl: event.target.value }))}
              placeholder="https://storage.prefeitura.gov.br"
            />
          </div>
          <div className="space-y-2">
            <Label>Região</Label>
            <Input
              value={form.region}
              onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
              placeholder="us-east-1"
            />
          </div>
          <div className="space-y-2">
            <Label>Bucket de documentos oficiais</Label>
            <Input
              value={form.bucketDocuments}
              onChange={(event) => setForm((current) => ({ ...current, bucketDocuments: event.target.value }))}
              placeholder="sigapro-documentos-prefeitura"
            />
          </div>
          <div className="space-y-2">
            <Label>Prefixo/pasta base (opcional)</Label>
            <Input
              value={form.basePath}
              onChange={(event) => setForm((current) => ({ ...current, basePath: event.target.value }))}
              placeholder="sigapro"
            />
          </div>
          <div className="space-y-2">
            <Label>Access Key</Label>
            <Input
              autoComplete="off"
              value={form.accessKeyId}
              onChange={(event) => setForm((current) => ({ ...current, accessKeyId: event.target.value }))}
              placeholder={connection?.credentials_configured ? "Deixe vazio para manter a credencial atual" : "Access Key da Prefeitura"}
            />
          </div>
          <div className="space-y-2">
            <Label>Secret Key</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.secretAccessKey}
              onChange={(event) => setForm((current) => ({ ...current, secretAccessKey: event.target.value }))}
              placeholder={connection?.credentials_configured ? "Deixe vazio para manter a credencial atual" : "Secret Key da Prefeitura"}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Compatibilidade com servidor local</p>
            <p className="mt-1 text-xs text-slate-500">
              Ative para MinIO/Ceph ou gateways que exigem path-style.
            </p>
          </div>
          <Switch
            checked={form.forcePathStyle}
            onCheckedChange={(checked) => setForm((current) => ({ ...current, forcePathStyle: checked }))}
          />
        </div>

        {message ? (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            /sucesso|validada|ativado|salva|ativo/i.test(message)
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}>
            {message}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={Boolean(busy)}
            onClick={() => void save()}
          >
            {busy === "save" ? "Salvando..." : "Salvar conexão"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={Boolean(busy) || !isConfigured}
            onClick={() => void test()}
          >
            {busy === "test" ? "Testando..." : "Testar conexão"}
          </Button>
          <Button
            type="button"
            className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900"
            disabled={Boolean(busy) || !hasValidTest || isMunicipalActive}
            onClick={() => void activate()}
          >
            {busy === "activate" ? "Ativando..." : "Ativar armazenamento municipal"}
          </Button>
        </div>
      </div>

      <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <p className="font-semibold">Separação de responsabilidade</p>
        <p className="mt-1">
          Esta configuração transfere o local físico dos arquivos oficiais. Ela não transforma o SIGAPRO em um sistema sem acesso técnico: o software ainda precisa acessar os arquivos para entregá-los aos usuários autorizados. Para uma política em que nem o operador do SIGAPRO consiga descriptografar o conteúdo, é necessário adotar criptografia com chave controlada exclusivamente pela Prefeitura/BYOK.
        </p>
      </div>
    </div>
  );
}
