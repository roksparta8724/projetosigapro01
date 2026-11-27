import { assertStoredDocumentBytes } from "./document-storage-integrity.js";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type ApiReq = import("http").IncomingMessage & { method?: string; body?: unknown };

const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

export function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

export function readBearer(req: ApiReq) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || "";
}

function neonBranchHost(raw: string, kind: "neonauth" | "apirest") {
  try {
    const url = new URL(raw);
    const match = url.hostname.match(/^([^.]+)\.(neonauth|apirest)\./);
    return url.protocol === "https:" && match?.[2] === kind ? match[1] : "";
  } catch { return ""; }
}

export function getDataApiUrl() {
  // The official Vercel deployment also forces the production Neon Auth URL
  // in the browser: server-side RPC must use the SAME branch, regardless of
  // stale inherited variables from previous preview deployments.
  if (process.env.VERCEL_ENV === "production") {
    return VALIDATED_NEON_DATA_API_URL;
  }
  if (process.env.VERCEL_ENV === "preview") {
    // Isolated QA must fail closed rather than silently target production.
    const frontendData = readEnv("VITE_NEON_DATA_API_URL");
    const backendData = readEnv("R2_AUTH_DATA_API_URL");
    const auth = readEnv("VITE_NEON_AUTH_URL");
    const authHost = neonBranchHost(auth, "neonauth");
    const dataHost = neonBranchHost(frontendData, "apirest");
    const serverHost = neonBranchHost(backendData, "apirest");
    const productionHost = neonBranchHost(VALIDATED_NEON_DATA_API_URL, "apirest");
    if (readEnv("VITE_SIGAPRO_NEON_ISOLATED") !== "true" ||
        !authHost || authHost === productionHost ||
        authHost !== dataHost || authHost !== serverHost) {
      throw new Error("Ambiente de homologação inválido: Neon Auth e Data API devem apontar para a mesma branch QA, nunca produção.");
    }
    return backendData.replace(/\/+$/, "");
  }
  // Vite localhost signs in with the official Neon Auth by default.
  // Do NOT honor an arbitrary Data API override independently: that creates
  // "jwk not found" by sending a production JWT to a QA branch (or vice versa).
  if (process.env.NODE_ENV !== "production") {
    const isolatedRequested = readEnv("VITE_SIGAPRO_NEON_ISOLATED") === "true";
    const localAuth = readEnv("VITE_NEON_AUTH_URL");
    const localData = readEnv("VITE_NEON_DATA_API_URL");
    const authHost = neonBranchHost(localAuth, "neonauth");
    const dataHost = neonBranchHost(localData, "apirest");
    if (isolatedRequested) {
      if (!authHost || authHost !== dataHost ||
          dataHost === neonBranchHost(VALIDATED_NEON_DATA_API_URL, "apirest")) {
        throw new Error("Homologação Neon local inválida: informe Auth e Data API HTTPS da MESMA branch.");
      }
      return localData.replace(/\/+$/, "");
    }
    return VALIDATED_NEON_DATA_API_URL;
  }
  // Development and other explicit environments may override the validated URL.
  return (
    readEnv("R2_AUTH_DATA_API_URL") ||
    readEnv("VITE_NEON_DATA_API_URL") ||
    VALIDATED_NEON_DATA_API_URL
  ).replace(/\/+$/, "");
}

export async function callDataApiRpc<T = unknown>(
  req: ApiReq,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; payload: T | null; error: string }> {
  const token = readBearer(req);
  if (!token) {
    return { ok: false, status: 401, payload: null, error: "Autenticação necessária." };
  }

  try {
    const response = await fetch(`${getDataApiUrl()}/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    const error =
      payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>).message || "")
        : "";
    return { ok: response.ok, status: response.status, payload, error };
  } catch {
    return { ok: false, status: 503, payload: null, error: "Serviço de configuração indisponível." };
  }
}

/** Domain-separated keys from the existing server-only 256-bit attestation
 * root. Separate storage MAC/encryption domains; never use a browser token
 * as a secret. Root rotation requires controlled re-encryption. */
function storageDomainKey(domain:string){
 const root=readEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET");
 if(!/^[a-f0-9]{64}$/.test(root))throw Error("Comprovação segura de armazenamento indisponível.");
 return createHmac("sha256",Buffer.from(root,"hex")).update(domain,"utf8").digest();
}
type StorageScope={municipalityId:string;endpoint:string};
function aad(scope:StorageScope){return Buffer.from("sigapro-storage-credentials-v2\n"+scope.municipalityId.toLowerCase()+"\n"+normalizeStorageEndpoint(scope.endpoint),"utf8");}
export function encryptStorageCredentials(input:{accessKeyId:string;secretAccessKey:string},scope:StorageScope){
 if(!input.accessKeyId.trim()||!input.secretAccessKey.trim()||input.accessKeyId.length>256||input.secretAccessKey.length>512)throw Error("Informe Access Key e Secret Key válidas.");
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",storageDomainKey("sigapro-storage-encryption-v2"),iv);
 cipher.setAAD(aad(scope));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({accessKeyId:input.accessKeyId.trim(),secretAccessKey:input.secretAccessKey.trim()}),"utf8"),cipher.final()]);
 return ["v2",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptStorageCredentials(ciphertext:string,scope:StorageScope){
 const [version,iv,tag,encrypted,...rest]=ciphertext.split(".");
 if(version!=="v2"||!iv||!tag||!encrypted||rest.length||Buffer.from(iv,"base64url").length!==12||Buffer.from(tag,"base64url").length!==16)throw Error("Credencial municipal armazenada em formato inválido.");
 try{
  const decipher=createDecipheriv("aes-256-gcm",storageDomainKey("sigapro-storage-encryption-v2"),Buffer.from(iv,"base64url"));
  decipher.setAAD(aad(scope));decipher.setAuthTag(Buffer.from(tag,"base64url"));
  const result=JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted,"base64url")),decipher.final()]).toString("utf8"));
  if(typeof result.accessKeyId!=="string"||!result.accessKeyId||typeof result.secretAccessKey!=="string"||!result.secretAccessKey)throw Error("invalid");
  return {accessKeyId:result.accessKeyId as string,secretAccessKey:result.secretAccessKey as string};
 }catch{throw Error("Credencial não corresponde à Prefeitura ou ao endpoint cadastrado.");}
}
export async function municipalStorageCommand(req:ApiReq,municipalityId:string,action:"get"|"resolve"|"secret"|"save"|"mark"|"activate"|"use_sigapro",body:Record<string,unknown>={}){
 if(!readBearer(req))throw Error("Autenticação necessária.");
 const id=municipalityId.toLowerCase();
 const payload=Buffer.from(JSON.stringify(body),"utf8").toString("base64");
 const epoch=String(Math.floor(Date.now()/1000));
 const mac=createHmac("sha256",storageDomainKey("sigapro-storage-domain-v2")).update(["sigapro-storage-command-v2",id,action,payload,epoch].join("\n"),"utf8").digest("hex");
 const result=await callDataApiRpc<MunicipalStorageConnection>(req,"municipal_storage_command_v2",{_municipality_id:id,_action:action,_payload:payload,_epoch:epoch,_mac:mac});
 if(!result.ok||!result.payload||result.payload.municipality_id!==id)throw Error(result.error||"Configuração de armazenamento não confirmada pelo banco.");
 return result.payload;
}

export function credentialFingerprint(accessKeyId: string) {
  const normalized = accessKeyId.trim();
  if (!normalized) return "";
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 10).toUpperCase();
  const suffix = normalized.slice(-4);
  return `AK…${suffix} · ${digest}`;
}

export function normalizeStorageEndpoint(value:string){
 const raw=value.trim();
 if(!raw)throw Error("Informe o endpoint do armazenamento.");
 const url=new URL(/^https:\/\//i.test(raw)?raw:"https://"+raw);
 // Fixed DNS suffix and service hostname; no custom addresses, IPs,
 // URL credentials, paths or redirects. Initial supported providers: R2/AWS.
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash||url.pathname!=="/"||
   !/^([a-f0-9]{32}\.r2\.cloudflarestorage\.com|s3([.-][a-z0-9-]+)?\.amazonaws\.com)$/.test(url.hostname))throw Error("Informe o endpoint HTTPS oficial do Cloudflare R2 ou AWS S3.");
 return url.origin;
}

export type MunicipalStorageConnection = {
  municipality_id?: string;
  provider?: "sigapro_r2" | "s3_compatible";
  status?: "inactive" | "configured" | "active" | "error";
  endpoint_url?: string;
  region?: string;
  bucket_documents?: string;
  base_path?: string;
  force_path_style?: boolean;
  credentials_configured?: boolean;
  credentials_ciphertext?: string;
  credential_fingerprint?: string;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  updated_at?: string | null;
  config_revision?: string;
};

export function getMunicipalStorageConnection(req:ApiReq,municipalityId:string){return municipalStorageCommand(req,municipalityId,"get");}
export function getMunicipalStorageSecretAdmin(req:ApiReq,municipalityId:string){return municipalStorageCommand(req,municipalityId,"secret");}
export function resolveMunicipalStorageSecret(req:ApiReq,municipalityId:string){return municipalStorageCommand(req,municipalityId,"resolve");}

export function buildMunicipalS3Client(config: MunicipalStorageConnection) {
  const endpoint = normalizeStorageEndpoint(String(config.endpoint_url || ""));
  const region = String(config.region || "us-east-1").trim() || "us-east-1";
  const credentials = decryptStorageCredentials(String(config.credentials_ciphertext || ""),{municipalityId:String(config.municipality_id||""),endpoint});
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: Boolean(config.force_path_style),
    credentials,
  });
}

export function applyMunicipalBasePath(basePath: string | undefined, objectKey: string) {
  const prefix = String(basePath || "").replace(/^\/+|\/+$/g, "");
  const logical = objectKey.replace(/^\/+/, "");
  return prefix ? `${prefix}/${logical}` : logical;
}

export async function testMunicipalStorageConnection(config:MunicipalStorageConnection,client=buildMunicipalS3Client(config)){
 const bucket=String(config.bucket_documents||"").trim();
 if(!bucket||!config.municipality_id)throw Error("Bucket municipal não configurado.");
 const testKey=applyMunicipalBasePath(config.base_path,".sigapro/connection-tests/"+randomUUID()+".txt");
 const bytes=Buffer.from("SIGAPRO synthetic storage test "+randomUUID(),"utf8");
 const hash=createHash("sha256").update(bytes).digest("hex");
 await client.send(new PutObjectCommand({Bucket:bucket,Key:testKey,Body:bytes,ContentType:"text/plain",IfNoneMatch:"*"}));
 try{
  await assertStoredDocumentBytes(client,{bucket,objectKey:testKey,expectedSha256:hash,expectedBytes:bytes.length,contentType:"text/plain",maxBytes:1024});
 }finally{
  // Failure to clean up means the connection has NOT passed.
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:testKey}));
 }
 try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:testKey}));}
 catch(error){
  const e=error as {name?:string;$metadata?:{httpStatusCode?:number}};
  if(e.$metadata?.httpStatusCode===404||e.name==="NotFound"||e.name==="NoSuchKey")
   return {ok:true,message:"Gravação, leitura, integridade e remoção verificadas."};
  throw Error("Não foi possível comprovar a remoção do arquivo de teste.");
 }
 throw Error("Arquivo de teste não foi removido.");
}

function isPublicMunicipalLegislationObject(objectKey: string) {
  return /^municipalities\/[0-9a-f-]{36}\/legislation(?:[-/]|$)/i.test(
    String(objectKey || "").replace(/^\/+/, ""),
  );
}

export async function resolveMunicipalDocumentTarget(
  req: ApiReq,
  municipalityId: string,
  requestedBucket: string,
  logicalObjectKey: string,
) {
  if (!municipalityId) return null;
  const sigaproDocumentBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
  if (requestedBucket !== sigaproDocumentBucket) return null;

  const publicLegislation = isPublicMunicipalLegislationObject(logicalObjectKey);

  // Public legislation stays in the institutional R2 even for BYOS.
  // Never silently fall back after a failed configured repository lookup.
  if(publicLegislation)return null;
  const config=await resolveMunicipalStorageSecret(req,municipalityId);
  if (config.provider !== "s3_compatible" || config.status !== "active") return null;
  if (!config.credentials_ciphertext || !config.bucket_documents || !config.endpoint_url) {
    throw new Error("O armazenamento próprio da Prefeitura está ativo, mas incompleto.");
  }

  return {
    client: buildMunicipalS3Client(config),
    bucket: String(config.bucket_documents),
    objectKey: applyMunicipalBasePath(config.base_path, logicalObjectKey),
    logicalObjectKey,
    config,
  };
}
