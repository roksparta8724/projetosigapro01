/**
 * api/r2-list-user-files.ts
 *
 * Lista somente arquivos de processo pertencentes ao usuário autenticado e à
 * prefeitura vinculada. Serve para recuperar uploads órfãos que chegaram ao R2,
 * mas não foram vinculados ao processo por versões antigas do fluxo.
 */

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

function readBearer(req: Req) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || "";
}

function sanitizeAccessKeyId(value: string) {
  const normalized = value.replace(/\s+/g, "");
  const hexOnly = normalized.replace(/[^a-fA-F0-9]/g, "");
  return hexOnly.length >= 32 ? hexOnly.slice(0, 32) : normalized;
}

function sanitizeSecret(value: string) {
  return value.replace(/\s+/g, "");
}

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
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function resolveAuthenticatedScope(req: Req) {
  const token = readBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Autenticação necessária." };
  }

  const dataApiUrl = (
    readEnv("R2_AUTH_DATA_API_URL") ||
    readEnv("VITE_NEON_DATA_API_URL") ||
    VALIDATED_NEON_DATA_API_URL
  ).replace(/\/+$/, "");

  try {
    const profileResponse = await fetch(`${dataApiUrl}/rpc/current_profile_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: "{}",
    });
    const profilePayload = await profileResponse.json().catch(() => null);
    const profileId =
      typeof profilePayload === "string"
        ? profilePayload
        : profilePayload && typeof profilePayload === "object"
          ? String(
              (profilePayload as Record<string, unknown>).id ||
              (profilePayload as Record<string, unknown>).profile_id ||
              "",
            )
          : "";

    if (!profileResponse.ok || !profileId) {
      return { ok: false as const, status: 401, error: "Sessão inválida ou expirada." };
    }

    const scopeResponse = await fetch(
      `${dataApiUrl}/profiles?id=eq.${encodeURIComponent(profileId)}&select=user_id,municipality_id&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    const rows = (await scopeResponse.json().catch(() => [])) as Array<{
      user_id?: string | null;
      municipality_id?: string | null;
    }>;
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!scopeResponse.ok || !row?.user_id || !row?.municipality_id) {
      return { ok: false as const, status: 403, error: "Perfil sem escopo municipal válido." };
    }

    return {
      ok: true as const,
      userId: row.user_id,
      municipalityId: row.municipality_id,
    };
  } catch {
    return { ok: false as const, status: 503, error: "Não foi possível validar o escopo do usuário." };
  }
}

function parseOriginalName(key: string) {
  const last = key.split("/").pop() || key;
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i, "");
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

  const auth = await resolveAuthenticatedScope(req);
  if (!auth.ok) {
    json(res, auth.status, { error: auth.error });
    return;
  }

  try {
    const endpoint = readEnv("R2_ENDPOINT");
    const accessKeyId = sanitizeAccessKeyId(readEnv("R2_ACCESS_KEY_ID"));
    const secretAccessKey = sanitizeSecret(readEnv("R2_SECRET_ACCESS_KEY"));
    const bucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("Armazenamento de documentos indisponível.");
    }

    const body = (await readJsonBody(req)) as { since?: unknown };
    const since =
      typeof body.since === "string" && !Number.isNaN(Date.parse(body.since))
        ? new Date(body.since)
        : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

    const prefix = `municipalities/${auth.municipalityId}/protocols/${auth.userId}/`;
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 250,
      }),
    );

    const files = (result.Contents || [])
      .filter((item) => item.Key && item.LastModified && item.LastModified >= since)
      .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
      .map((item) => ({
        objectKey: item.Key!,
        fileName: parseOriginalName(item.Key!),
        size: Number(item.Size || 0),
        lastModified: item.LastModified?.toISOString() || null,
      }));

    json(res, 200, { files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao localizar uploads anteriores.";
    console.error("[SIGAPRO][R2] Falha ao listar uploads recuperáveis", { error: message });
    json(res, 500, { error: message });
  }
}
