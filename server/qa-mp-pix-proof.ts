/** Server-only attestation of a Mercado Pago QA PIX operation before Neon persistence. */
import { createHmac } from "node:crypto";
import { readEnv } from "./municipal-storage.js";

export type QaPixProofInput = {
  action: "reserve" | "save";
  municipalityId: string;
  guideCode: string;
  key: string;
  amount: number;
  orderId?: string;
  paymentId?: string;
  status?: string;
  qrCode?: string;
};
export function signQaPixProof(input: QaPixProofInput) {
  const secret = readEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET");
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error("Chave de assinatura de cobranças de QA não configurada.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Valor de guia inválido para comprovação PIX.");
  }
  const epoch = Math.floor(Date.now() / 1000);
  const fields = [
    "sigapro-qa-pix-v1", input.action, input.municipalityId,
    input.guideCode, input.key, input.amount.toFixed(2),
    input.orderId || "", input.paymentId || "", input.status || "",
    input.qrCode || "", String(epoch),
  ];
  if (fields.some(v => /[\r\n]/.test(v))) {
    throw new Error("Resposta bancária contém caracteres de controle.");
  }
  const mac = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(fields.join("\n"), "utf8").digest("hex");
  return { _proof_epoch: epoch, _proof_mac: mac };
}