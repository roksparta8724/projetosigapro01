import { randomBytes } from "node:crypto";
export type ItiSigningMode = "govbr" | "icp_brasil";
export type ItiSandboxConfig = { clientId: string; clientSecret: string; redirectUri: string; municipalityId: string };
const OAUTH = "https://cas.staging.iti.br/oauth2.0/";
const API = "https://assinatura-api.staging.iti.br/externo/v2/";
const MAX_RESPONSE = 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checked(config: ItiSandboxConfig) {
  const uri = new URL(config.redirectUri);
  if (!uuid.test(config.municipalityId) || !config.clientId.trim() || !config.clientSecret.trim() ||
      uri.protocol !== "https:" || uri.username || uri.password || uri.hash || uri.search || uri.port) {
    throw new Error("Configuração de homologação ITI inválida.");
  }
  return config;
}
function required(value: string, max = 8192) {
  if (!value || value.length > max || /[\r\n]/.test(value)) throw new Error("Parâmetro ITI inválido.");
  return value;
}
function safeMode(mode: ItiSigningMode) {
  if (mode !== "govbr" && mode !== "icp_brasil") throw new Error("Modalidade ITI inválida.");
  return mode;
}
async function limited(response: Response) {
  if (!response.ok || !response.body) throw new Error("Serviço ITI recusou a operação (HTTP " + response.status + ").");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) { await reader.cancel(); throw new Error("Resposta ITI excede o limite."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error("Resposta ITI vazia.");
  return Buffer.concat(chunks);
}
const options = () => ({ redirect: "error" as const, cache: "no-store" as const, signal: AbortSignal.timeout(15000) });
/** Server-only sandbox transport. A caller must persist the state, nonce and document binding,
 * consume the state atomically, and independently validate certificate identity, chain,
 * revocation, PDF and policy before any signature is recorded. No route or issuance is enabled. */
export function createItiSandboxAuthorization(config: ItiSandboxConfig, mode: ItiSigningMode) {
  checked(config); safeMode(mode);
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const url = new URL("authorize", OAUTH);
  url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId,
    redirect_uri: config.redirectUri, scope: "sign " + mode, state, nonce }).toString();
  return { url: url.toString(), state, nonce, municipalityId: config.municipalityId, mode, expiresAt: Date.now() + 5 * 60 * 1000 };
}
export async function exchangeItiSandboxCode(config: ItiSandboxConfig, code: string) {
  checked(config);
  const response = await fetch(new URL("token", OAUTH), { ...options(), method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: required(code), client_id: config.clientId,
      client_secret: config.clientSecret, redirect_uri: config.redirectUri }) });
  const bytes = await limited(response);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Resposta de token ITI inválida.");
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Resposta de token ITI inválida."); }
  const token = value as { access_token?: unknown; token_type?: unknown } | null;
  if (typeof token?.access_token !== "string" || (token.token_type !== undefined &&
      (typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer"))) throw new Error("Token ITI inválido.");
  return required(token.access_token);
}
export async function readItiSandboxCertificate(accessToken: string) {
  const response = await fetch(new URL("certificadoPublico", API), { ...options(), method: "GET",
    headers: { Authorization: "Bearer " + required(accessToken) } });
  const pem = (await limited(response)).toString("utf8");
  if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(pem)) throw new Error("Certificado ITI inválido.");
  // Format check only; caller must perform independent validation.
  return pem;
}
export async function requestItiSandboxPkcs7(accessToken: string, byteRangeDigest: Uint8Array) {
  if (byteRangeDigest.byteLength !== 32) throw new Error("O hash deve ser SHA-256 de 32 bytes.");
  const response = await fetch(new URL("assinarPKCS7", API), { ...options(), method: "POST",
    headers: { Authorization: "Bearer " + required(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ hashBase64: Buffer.from(byteRangeDigest).toString("base64") }) });
  const bytes = await limited(response);
  // ASN.1 sequence is only a format guard, not proof of a valid digital signature.
  if (bytes.length < 16 || bytes[0] !== 0x30) throw new Error("Pacote PKCS#7 ITI inválido.");
  return bytes;
}
