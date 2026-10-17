import { checkMercadoPagoConnection } from "../../server/mercadopago";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Método não permitido." });
    return;
  }

  const requestUrl = new URL(req.url || "/api/mercadopago/health", "https://sigapro.local");
  const municipalityId = requestUrl.searchParams.get("municipalityId");
  const result = await checkMercadoPagoConnection(req, municipalityId);
  json(res, result.ok ? 200 : result.configured ? 502 : 503, result);
}
