import { createMercadoPagoTestBoleto } from "../../server/mercadopago";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Método não permitido." });
    return;
  }

  const result = await createMercadoPagoTestBoleto();
  json(res, result.ok ? 201 : 400, result);
}
