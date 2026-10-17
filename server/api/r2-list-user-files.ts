/**
 * api/r2-list-user-files.ts
 *
 * Lista somente arquivos de processo pertencentes ao usuário autenticado e à
 * prefeitura vinculada. Serve para recuperar uploads órfãos que chegaram ao R2,
 * mas não foram vinculados ao processo por versões antigas do fluxo.
 */

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
  applyMunicipalBasePath,
  resolveMunicipalDocumentTarget,
} from "../municipal-storage";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function resolveR2Endpoint() {
  const accountId = readEnv("R2_ACCOUNT_ID")
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  if (accountId && !/^sua_?account_?id$/i.test(accountId)) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  const rawEndpoint = readEnv("R2_ENDPOINT");
  if (!rawEndpoint) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return rawEndpoint.replace(/\/+$/, "");
  }
}

const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

function readBearer(req: Req) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || "";
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
      profileId,
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
    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const bucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";

    const body = (await readJsonBody(req)) as { since?: unknown; processId?: unknown };
    let since =
      typeof body.since === "string" && !Number.isNaN(Date.parse(body.since))
        ? new Date(body.since)
        : new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);

    const processId = typeof body.processId === "string" ? body.processId.trim() : "";
    let principalIds = Array.from(
      new Set([auth.profileId, auth.userId].filter((value): value is string => Boolean(value))),
    );

    // When a municipal analyst is viewing a process, recover only uploads that
    // belong to the professional who created that same accessible process.
    if (processId) {
      const dataApiUrl = (
        readEnv("R2_AUTH_DATA_API_URL") ||
        readEnv("VITE_NEON_DATA_API_URL") ||
        VALIDATED_NEON_DATA_API_URL
      ).replace(/\/+$/, "");
      const token = readBearer(req);

      const processResponse = await fetch(
        `${dataApiUrl}/processes?id=eq.${encodeURIComponent(processId)}&select=id,municipality_id,created_by,created_by_profile_id,created_at&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const processRows = (await processResponse.json().catch(() => [])) as Array<{
        id?: string;
        municipality_id?: string | null;
        created_by?: string | null;
        created_by_profile_id?: string | null;
        created_at?: string | null;
      }>;
      const processRow = Array.isArray(processRows) ? processRows[0] : null;

      if (
        !processResponse.ok ||
        !processRow?.id ||
        processRow.municipality_id !== auth.municipalityId
      ) {
        json(res, 403, { error: "Processo indisponível para recuperação de documentos." });
        return;
      }

      if (processRow.created_at && !Number.isNaN(Date.parse(processRow.created_at))) {
        const processCreatedAt = new Date(processRow.created_at);
        if (processCreatedAt > since) since = processCreatedAt;
      }

      let creatorUserId = processRow.created_by || "";
      if (processRow.created_by_profile_id) {
        const creatorResponse = await fetch(
          `${dataApiUrl}/profiles?id=eq.${encodeURIComponent(processRow.created_by_profile_id)}&select=user_id&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const creatorRows = (await creatorResponse.json().catch(() => [])) as Array<{
          user_id?: string | null;
        }>;
        if (creatorResponse.ok && creatorRows[0]?.user_id) {
          creatorUserId = creatorRows[0].user_id || creatorUserId;
        }
      }

      principalIds = Array.from(
        new Set(
          [
            processRow.created_by_profile_id || "",
            creatorUserId,
            processRow.created_by || "",
          ].filter(Boolean),
        ),
      );
    }
    const logicalRoot = `municipalities/${auth.municipalityId}/protocols/`;
    const municipalTarget = await resolveMunicipalDocumentTarget(
      req,
      auth.municipalityId,
      bucket,
      logicalRoot,
    );

    if (!municipalTarget && (!endpoint || !accessKeyId || !secretAccessKey)) {
      throw new Error("Armazenamento de documentos indisponível.");
    }

    const client = municipalTarget
      ? municipalTarget.client
      : new S3Client({
          region: "auto",
          endpoint,
          credentials: { accessKeyId, secretAccessKey },
        });
    const storageBucket = municipalTarget ? municipalTarget.bucket : bucket;

    const results = await Promise.all(
      principalIds.map((principalId) => {
        const logicalPrefix = `municipalities/${auth.municipalityId}/protocols/${principalId}/`;
        const physicalPrefix = municipalTarget
          ? applyMunicipalBasePath(municipalTarget.config.base_path, logicalPrefix)
          : logicalPrefix;
        return client.send(
          new ListObjectsV2Command({
            Bucket: storageBucket,
            Prefix: physicalPrefix,
            MaxKeys: 250,
          }),
        );
      }),
    );

    const files = results
      .flatMap((result) => result.Contents || [])
      .filter((item) => item.Key && item.LastModified && item.LastModified >= since)
      .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
      .filter(
        (item, index, all) =>
          all.findIndex((candidate) => candidate.Key === item.Key) === index,
      )
      .map((item) => {
        const physicalKey = item.Key!;
        const prefix = municipalTarget
          ? String(municipalTarget.config.base_path || "").replace(/^\/+|\/+$/g, "")
          : "";
        const objectKey =
          prefix && physicalKey.startsWith(`${prefix}/`)
            ? physicalKey.slice(prefix.length + 1)
            : physicalKey;
        return {
          objectKey,
          fileName: parseOriginalName(objectKey),
          size: Number(item.Size || 0),
          lastModified: item.LastModified?.toISOString() || null,
        };
      });

    json(res, 200, {
      files,
      storageProvider: municipalTarget ? "municipal_s3" : "sigapro_r2",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao localizar uploads anteriores.";
    console.error("[SIGAPRO][R2] Falha ao listar uploads recuperáveis", { error: message });
    json(res, 500, { error: message });
  }
}
