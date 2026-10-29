/**
 * ISOLATED LOCAL QA ONLY — persistent local document files for localhost:8081.
 * Never accesses R2; no fake R2 keys, no production server entrypoint.
 * The isolated Neon branch stores only the QA object reference.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { callDataApiRpc, getDataApiUrl, readEnv } from "./municipal-storage.js";

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OBJECT_KEY = new RegExp(`^municipalities/(${UUID})/(?:protocols|habite-se)/[a-zA-Z0-9_-]{1,128}/[0-9a-f-]{36}-[a-zA-Z0-9._-]{1,160}$`, "i");
const MAX_FILE_BYTES = 35 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil(MAX_FILE_BYTES * 1.4) + 32_768;

function assertIsolatedQa() {
  if (readEnv("SIGAPRO_LOCAL_QA_LAUNCH") !== "true" ||
      readEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES") !== "true" ||
      readEnv("VITE_SIGAPRO_NEON_ISOLATED") !== "true") {
    throw new Error("Repositório local de anexos indisponível fora do QA isolado.");
  }
  const url = new URL(getDataApiUrl());
  if (url.protocol !== "https:" || !url.hostname.includes(".apirest.") || !url.hostname.startsWith("ep-")) {
    throw new Error("Branch Neon QA não identificada.");
  }
  return url;
}

function storeRoot() {
  const url = assertIsolatedQa();
  const id = createHash("sha256").update(url.host + url.pathname).digest("hex").slice(0,20);
  return join(homedir(), ".sigapro", "isolated-qa-documents", id);
}

function validObjectKey(value: unknown) {
  const key = String(value || "");
  const match = OBJECT_KEY.exec(key);
  if (!match || key.includes("..") || key.includes("\\") || key.length > 390) {
    throw new Error("Caminho de documento de homologação inválido.");
  }
  return { key, tenantId: match[1] };
}

function filePath(objectKey: string) {
  // Do not use any part of the untrusted path as an OS filename.
  const digest = createHash("sha256").update(objectKey).digest("hex");
  return join(storeRoot(), digest.slice(0, 2), digest + ".qa");
}

function signingKey() {
  const secret = readEnv("MUNICIPAL_PAYMENT_MASTER_KEY");
  if (!/^[0-9a-f]{96}$/.test(secret)) {
    throw new Error("Chave privada do QA não configurada.");
  }
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update("SIGAPRO-LOCAL-QA-DOCUMENTS-V1")
    .digest();
}

function signature(key: string, exp: number) {
  return createHmac("sha256", signingKey()).update(`GET\n${key}\n${exp}`).digest("hex");
}

function sameSignature(a: string, b: string) {
  return /^[0-9a-f]{64}$/.test(a) && timingSafeEqual(Buffer.from(a,"hex"), Buffer.from(b,"hex"));
}

async function authorized(req: Req, tenantId: string) {
  if (!/^Bearer\s+\S+/i.test(String(req.headers.authorization || ""))) return false;
  const r = await callDataApiRpc<boolean>(req, "has_tenant_access", { target_tenant: tenantId });
  return r.ok && r.payload === true;
}

async function jsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Documento QA excede 35 MB.");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function json(res: Res, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function contentTypeFor(key: string) {
  const path = key.toLowerCase();
  if (path.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpg|jpeg|png|webp)$/.test(path)) return "image/" + (path.endsWith(".jpg") || path.endsWith(".jpeg") ? "jpeg" : path.split(".").pop());
  return "application/octet-stream";
}

function requireBucket(body: Record<string,unknown>) {
  if (body.bucket !== "process-documents") throw new Error("Somente documentos de processo são aceitos no QA local.");
}

async function handler(req: Req, res: Res, route: string) {
  assertIsolatedQa();
  if (route === "/api/qa-document") {
    if (req.method !== "GET") return json(res, 405, { error: "Método inválido" });
    const url = new URL(req.url || "/", "http://localhost:8081");
    const {key} = validObjectKey(url.searchParams.get("key"));
    const exp = Number(url.searchParams.get("exp"));
    const sig = String(url.searchParams.get("sig") || "");
    if (!Number.isSafeInteger(exp) || exp < Math.floor(Date.now()/1000) ||
        exp > Math.floor(Date.now()/1000)+3600 || !sameSignature(sig, signature(key,exp))) {
      return json(res, 403, { error: "Link de documento QA expirado ou inválido." });
    }
    let bytes: Buffer;
    try { bytes = await readFile(filePath(key)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return json(res, 404, {
        code: "QA_DOCUMENT_MISSING",
        error: "Documento de homologação não encontrado no armazenamento isolado. O registro pode existir, mas o arquivo não foi copiado para o QA.",
      });
      throw error;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeFor(key));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Content-Disposition", /\.(pdf|png|jpe?g|webp)$/i.test(key) ? "inline" : "attachment");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", bytes.length);
    res.end(bytes);
    return;
  }
  if (req.method !== "POST") return json(res, 405, { error: "Método inválido." });
  // No auth -> 403 rather than triggering any external request.
  if (!/^Bearer\s+\S+/i.test(String(req.headers.authorization || ""))) {
    return json(res, 403, { error: "Sessão autenticada obrigatória para documento QA." });
  }
  const body = await jsonBody(req);
  requireBucket(body);
  const { key, tenantId } = validObjectKey(body.objectKey);
  if (!(await authorized(req,tenantId))) return json(res, 403, { error: "Sem acesso a esta Prefeitura." });

  if (route === "/api/r2-sign-get") {
    const path = filePath(key);
    try {
      await stat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return json(res, 404, {
        code: "QA_DOCUMENT_MISSING",
        error: "Documento de homologação não encontrado no armazenamento isolado. O registro pode existir, mas o arquivo não foi copiado para o QA.",
      });
      throw error;
    }
    const ttl = Math.min(900, Math.max(60, Number(body.expiresIn)||900));
    const exp = Math.floor(Date.now()/1000)+ttl;
    // Same-origin signed reads are required for browser PDF text extraction;
    // the isolated store remains signed, short-lived and QA-only on both ports.
    const localPort = process.env.SIGAPRO_LOCAL_QA_PORT === "8080" ? 8080 : 8081;
    const signedUrl = `http://localhost:${localPort}/api/qa-document?key=${encodeURIComponent(key)}&exp=${exp}&sig=${signature(key,exp)}`;
    return json(res, 200, {bucket:"process-documents",objectKey:key,signedUrl});
  }
  if (route === "/api/r2-upload") {
    const base64 = String(body.base64 || "");
    if (!base64 || base64.length > MAX_BODY_BYTES ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Dados do anexo inválidos.");
    const bytes = Buffer.from(base64,"base64");
    if (!bytes.length || bytes.length>MAX_FILE_BYTES) throw new Error("Documento QA excede o limite de 35 MB.");
    if (bytes.length < 4) throw new Error("Documento QA incompleto.");
    if (/\.pdf$/i.test(key) && bytes.subarray(0,5).toString("ascii") !== "%PDF-") {
      throw new Error("O anexo PDF precisa conter um arquivo PDF válido.");
    }
    const path = filePath(key);
    await mkdir(join(storeRoot(),createHash("sha256").update(key).digest("hex").slice(0,2)),{recursive:true,mode:0o700});
    const handle = await open(path, "wx", 0o600);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
    return json(res, 200, { bucket:"process-documents", objectKey:key, publicUrl:"", fileSize:bytes.length, qaLocalOnly:true });
  }
  if (route === "/api/r2-delete") {
    await rm(filePath(key), {force:true});
    return json(res, 200, {success:true,objectKey:key, qaLocalOnly:true});
  }
  return json(res, 404, {error:"Rota QA indisponível."});
}

const ROUTES = new Set(["/api/qa-document","/api/r2-upload","/api/r2-sign-get","/api/r2-delete"]);

export async function handleQaDocumentRequest(req: Req,res: Res): Promise<boolean> {
  if (readEnv("SIGAPRO_LOCAL_QA_LAUNCH") !== "true") return false;
  const route = new URL(req.url || "/", "http://localhost:8081").pathname;
  if (!ROUTES.has(route)) return false;
  try { await handler(req,res,route); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Erro de anexo QA.";
    // Never expose paths, keys, raw provider responses or secrets.
    const safe = /^(Documento QA|Caminho de documento|O anexo PDF|Branch Neon|Chave privada|Somente documentos|Dados do anexo|Sem acesso|Link de documento|Sessão autenticada|Repositório local|Método)/.test(message)
      ? message : "Não foi possível armazenar ou abrir o documento QA. Verifique a sessão e os dados.";
    json(res, error instanceof SyntaxError ? 400 : 400, {error:safe});
  }
  return true;
}
