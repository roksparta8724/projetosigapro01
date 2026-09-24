import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function env(key: string) {
  return String(process.env[key] || "").replace(/^['"]|['"]$/g, "").trim();
}

async function readBody(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }

  try {
    const { objectKey } = await readBody(req);
    if (typeof objectKey !== "string" ||
      !/^platform\/branding\/[a-zA-Z0-9/_-]+\.(png|webp|jpe?g)$/i.test(objectKey) ||
      objectKey.includes("..")) {
      res.statusCode = 400;
      res.end("Logo inválido.");
      return;
    }

    const accessKeyId = env("R2_ACCESS_KEY_ID").replace(/\s+/g, "");
    const hexOnly = accessKeyId.replace(/[^a-fA-F0-9]/g, "");
    const client = new S3Client({
      region: "auto",
      endpoint: env("R2_ENDPOINT"),
      credentials: {
        accessKeyId: hexOnly.length >= 32 ? hexOnly.slice(0, 32) : accessKeyId,
        secretAccessKey: env("R2_SECRET_ACCESS_KEY").replace(/\s+/g, ""),
      },
    });
    const object = await client.send(new GetObjectCommand({
      Bucket: env("R2_BUCKET_LOGOS") || "sigapro-logos",
      Key: objectKey,
    }));
    if (!object.Body || (object.ContentLength ?? 0) > 10 * 1024 * 1024) {
      res.statusCode = 413;
      res.end("Logo indisponível ou muito grande.");
      return;
    }
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length > 10 * 1024 * 1024) {
      res.statusCode = 413;
      res.end("Logo muito grande.");
      return;
    }
    res.setHeader("Content-Type", object.ContentType?.startsWith("image/") ? object.ContentType : "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(bytes));
  } catch {
    res.statusCode = 502;
    res.end("Não foi possível ler o logo salvo.");
  }
}
