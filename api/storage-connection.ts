import {
  municipalStorageCommand,
  credentialFingerprint,
  encryptStorageCredentials,
  getMunicipalStorageConnection,
  getMunicipalStorageSecretAdmin,
  normalizeStorageEndpoint,
  testMunicipalStorageConnection,
} from "../server/municipal-storage.js";

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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size=0;
    req.on("data", (chunk) => {const bytes=Buffer.from(chunk);size+=bytes.length;if(size>16384){reject(Error("Configuração excede o limite."));return;}chunks.push(bytes);});
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

export default async function handler(req: Req, res: Res) {
  setCors(res);

  const requestUrl = new URL(req.url || "/api/storage-connection", "https://sigapro.local");
  const actionFromQuery = requestUrl.searchParams.get("action") || "";

  if (req.method === "GET" && actionFromQuery === "health") {
    // Public health is strictly liveness, never an inventory of secrets,
    // storage providers, API credentials, or which services are configured.
    // Restricted operational diagnostics use authenticated admin workflows.
    json(res, 200, { ok: true, service: "sigapro", status: "alive" });
    return;
  }

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
    if(JSON.stringify(body).length>16384)throw Error("Configuração excede o limite.");

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

      if(!bucketDocuments)throw Error("Informe o bucket de documentos da Prefeitura.");
      if(!accessKeyId||!secretAccessKey)throw Error("Informe Access Key e Secret Key juntas para salvar a configuração.");
      const ciphertext=encryptStorageCredentials({accessKeyId,secretAccessKey},{municipalityId,endpoint});
      const connection=await municipalStorageCommand(req,municipalityId,"save",{endpoint,region,bucket:bucketDocuments,basePath,forcePathStyle,ciphertext,fingerprint:credentialFingerprint(accessKeyId)});
      json(res, 200, connection || {});
      return;
    }

    if (action === "test") {
      const secretConfig = await getMunicipalStorageSecretAdmin(req, municipalityId);
      if (secretConfig.provider !== "s3_compatible") {
        throw new Error("Configure o armazenamento próprio antes de testar.");
      }

      if(!secretConfig.config_revision)throw Error("Salve a configuração antes de testar.");
      try{
        const result=await testMunicipalStorageConnection(secretConfig);
        const connection=await municipalStorageCommand(req,municipalityId,"mark",{revision:secretConfig.config_revision,ok:true});
        json(res,200,{...connection,testOk:true,testMessage:result.message});
      }catch{
        await municipalStorageCommand(req,municipalityId,"mark",{revision:secretConfig.config_revision,ok:false}).catch(()=>null);
        json(res,400,{error:"Não foi possível comprovar a gravação, leitura e remoção. Confira credenciais e permissões e repita o teste.",testOk:false});
      }
      return;
    }

    if (action === "activate") {
      const connection = await municipalStorageCommand(req,municipalityId,"activate");
      json(res, 200, connection || {});
      return;
    }

    if (action === "use_sigapro") {
      const connection = await municipalStorageCommand(req,municipalityId,"use_sigapro");
      json(res, 200, connection || {});
      return;
    }

    json(res, 400, { error: "Ação de armazenamento inválida." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao configurar armazenamento.";
    console.warn("[SIGAPRO][MunicipalStorage] configuração não confirmada");
    json(res, 400, { error: message });
  }
}
