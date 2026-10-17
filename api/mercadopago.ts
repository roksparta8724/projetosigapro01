import {
  checkMercadoPagoConnection,
  createMercadoPagoGuideBoleto,
} from "../server/mercadopago";

type Req = import("http").IncomingMessage & {
  method?: string;
  body?: Record<string, unknown>;
};
type Res = import("http").ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req: Req, res: Res) {
  const requestUrl = new URL(req.url || "/api/mercadopago", "https://sigapro.local");
  const action = requestUrl.searchParams.get("action") || "health";

  if (action === "health") {
    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "Método não permitido." });
      return;
    }

    const municipalityId = requestUrl.searchParams.get("municipalityId");
    const result = await checkMercadoPagoConnection(req, municipalityId);
    json(res, result.ok ? 200 : result.configured ? 502 : 503, result);
    return;
  }

  if (action === "guide-boleto") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const result = await createMercadoPagoGuideBoleto(
        {
          municipalityId: body.municipalityId ? String(body.municipalityId) : undefined,
          guideCode: String(body.guideCode || ""),
          amount: Number(body.amount || 0),
          dueDate: body.dueDate ? String(body.dueDate) : undefined,
          description: body.description ? String(body.description) : undefined,
        },
        req,
      );

      json(res, result.ok ? 201 : 400, result);
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Requisição inválida.",
      });
    }
    return;
  }

  json(res, 404, { ok: false, error: "Ação Mercado Pago não encontrada." });
}
