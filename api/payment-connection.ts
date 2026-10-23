import mercadoPagoHandler from "./mercadopago.js";

type Req = Parameters<typeof mercadoPagoHandler>[0];
type Res = Parameters<typeof mercadoPagoHandler>[1];

export default function paymentConnectionHandler(req: Req, res: Res) {
  req.url = "/api/mercadopago?action=payment-connection";
  return mercadoPagoHandler(req, res);
}
