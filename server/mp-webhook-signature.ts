import { createHmac, timingSafeEqual } from "node:crypto";

export type MPOrderNotice = {
  type?: unknown;
  action?: unknown;
  live_mode?: unknown;
  data?: { id?: unknown };
};
export type WebhookSignatureResult = { ok: true; orderId: string } | { ok: false; reason: string };

const ORDER_ID = /^[A-Za-z0-9_-]{6,100}$/;
const HEX_MAC = /^[a-f0-9]{64}$/i;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Mercado Pago requires the query-string data.id (lowercased if alphanumeric).
 * x-signature: ts=... , v1=HMAC_SHA256("id:...;request-id:...;ts:...;")
 */
export function verifyMercadoPagoOrderWebhook(input: {
  rawQueryId: string | null;
  queryTopic: string | null;
  headerSignature: string | undefined;
  requestId: string | undefined;
  notification: MPOrderNotice;
  secret: string;
  nowMs?: number;
}): WebhookSignatureResult {
  const { rawQueryId, queryTopic, headerSignature, requestId, notification, secret } = input;
  if (!rawQueryId || !ORDER_ID.test(rawQueryId) ||
      queryTopic !== "order" || notification.type !== "order" ||
      notification.live_mode !== false || !String(notification.action || "").startsWith("order.")) {
    return { ok: false, reason: "Evento ou identificação de ordem inválida." };
  }
  const bodyId = notification.data?.id;
  if (typeof bodyId !== "string" || !ORDER_ID.test(bodyId) ||
      bodyId.toLowerCase() !== rawQueryId.toLowerCase()) {
    return { ok: false, reason: "O ID do evento não corresponde ao identificador da URL." };
  }
  if (!requestId || !REQUEST_ID.test(requestId) || !headerSignature ||
      !secret || secret.length < 16) {
    return { ok: false, reason: "Cabeçalhos ou segredo de assinatura ausentes." };
  }
  const fields = new Map<string,string>();
  for (const field of headerSignature.split(",")) {
    const parts = field.trim().split("=");
    if (parts.length !== 2 || fields.has(parts[0])) {
      return { ok: false, reason: "Assinatura malformada." };
    }
    fields.set(parts[0],parts[1]);
  }
  const ts = fields.get("ts") || "";
  const signature = fields.get("v1") || "";
  if (!/^\d{10,13}$/.test(ts) || !HEX_MAC.test(signature)) {
    return { ok: false, reason: "Assinatura inválida." };
  }
  const timestampMs = Number(ts) < 1e12 ? Number(ts)*1000 : Number(ts);
  const maxSkewMs = 5 * 60 * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs((input.nowMs ?? Date.now())-timestampMs)>maxSkewMs) {
    return { ok: false, reason: "Notificação vencida ou com horário inválido." };
  }
  const canonical = `id:${rawQueryId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256",secret).update(canonical,"utf8").digest();
  const supplied = Buffer.from(signature,"hex");
  if (supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {
    return { ok:false, reason:"Assinatura não confere." };
  }
  return { ok:true, orderId:rawQueryId };
}
