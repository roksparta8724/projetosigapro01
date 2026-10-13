import type { MunicipalStorageConnection } from "../server/municipal-storage";
import {
  callDataApiRpc,
  credentialFingerprint,
  encryptStorageCredentials,
  getMunicipalStorageConnection,
  getMunicipalStorageSecretAdmin,
  normalizeStorageEndpoint,
  testMunicipalStorageConnection,
} from "../server/municipal-storage";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function setCors(res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res: Res, status: number, body: unknown) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) as Record<string, unknown> : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function municipalityIdFrom(body: Record<string, unknown>) {
  const id = typeof body.municipalityId === "string" ? body.municipalityId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Prefeitura inválida.");
  }
  return id;
}

async function rpcOrThrow<T>(
  req: Req,
  fn: string,
  body: Record<string, unknown>,
) {
  const result = await callDataApiRpc<T>(req, fn, body);
  if (!result.ok) {
    throw new Error(result.error || "Operação de armazenamento não autorizada.");
  }
  return result.payload;
}

export default async function handler(req: Req, res: Res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Método não permitido." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const action = typeof body.action === "string" ? body.action : "get";
    const municipalityId = municipalityIdFrom(body);

    if (action === "get") {
      const connection = await getMunicipalStorageConnection(req, municipalityId);
      json(res, 200, connection);
      return;
    }

    if (action === "save") {
      const endpoint = normalizeStorageEndpoint(String(body.endpointUrl || ""));
      const region = String(body.region || "us-east-1").trim() || "us-east-1";
      const bucketDocuments = String(body.bucketDocuments || "").trim();
      const basePath = String(body.basePath || "").trim().replace(/^\/+|\/+$/g, "");
      const forcePathStyle = Boolean(body.forcePathStyle);
      const accessKeyId = String(body.accessKeyId || "").trim();
      const secretAccessKey = String(body.secretAccessKey || "").trim();

      if (!bucketDocuments) {
        throw new Error("Informe o bucket de documentos da Prefeitura.");
      }
      if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
        throw new Error("Informe Access Key e Secret Key juntos.");
      }

      let encrypted: string | null = null;
      let fingerprint: string | null = null;
      if (accessKeyId && secretAccessKey) {
        encrypted = encryptStorageCredentials({ accessKeyId, secretAccessKey });
        fingerprint = credentialFingerprint(accessKeyId);
      }

      const connection = await rpcOrThrow<MunicipalStorageConnection>(
        req,
        "save_municipal_storage_connection_v1",
        {
          _municipality_id: municipalityId,
          _endpoint_url: endpoint,
          _region: region,
          _bucket_documents: bucketDocuments,
          _base_path: basePath,
          _force_path_style: forcePathStyle,
          _credentials_ciphertext: encrypted,
          _credential_fingerprint: fingerprint,
        },
      );
      json(res, 200, connection || {});
      return;
    }

    if (action === "test") {
      const secretConfig = await getMunicipalStorageSecretAdmin(req, municipalityId);
      if (secretConfig.provider !== "s3_compatible") {
        throw new Error("Configure o armazenamento próprio antes de testar.");
      }

      try {
        const result = await testMunicipalStorageConnection(secretConfig);
        const connection = await rpcOrThrow<MunicipalStorageConnection>(
          req,
          "mark_municipal_storage_test_v1",
          {
            _municipality_id: municipalityId,
            _ok: true,
            _message: result.message,
          },
        );
        json(res, 200, {
          ...(connection || {}),
          testOk: true,
          testMessage: result.message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha no teste de conexão.";
        await rpcOrThrow<MunicipalStorageConnection>(
          req,
          "mark_municipal_storage_test_v1",
          {
            _municipality_id: municipalityId,
            _ok: false,
            _message: message,
          },
        ).catch(() => null);
        json(res, 400, { error: message, testOk: false });
      }
      return;
    }

    if (action === "activate") {
      const connection = await rpcOrThrow<MunicipalStorageConnection>(
        req,
        "activate_municipal_storage_connection_v1",
        { _municipality_id: municipalityId },
      );
      json(res, 200, connection || {});
      return;
    }

    if (action === "use_sigapro") {
      const connection = await rpcOrThrow<MunicipalStorageConnection>(
        req,
        "use_sigapro_storage_v1",
        { _municipality_id: municipalityId },
      );
      json(res, 200, connection || {});
      return;
    }

    json(res, 400, { error: "Ação de armazenamento inválida." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao configurar armazenamento.";
    console.error("[SIGAPRO][MunicipalStorage] configuração", { error: message });
    json(res, 400, { error: message });
  }
}
