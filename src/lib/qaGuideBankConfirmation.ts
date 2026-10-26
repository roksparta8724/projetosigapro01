import { normalizeOfficialBanking } from "@/lib/bankCodes";
import type { GuideOriginal } from "@/lib/guideOriginal";
import type { MercadoPagoGuideCharge } from "@/lib/mercadoPagoGuide";

/** A browser response is never proof that Mercado Pago and Neon agree. */
export function verifyPersistedQaBoleto(input: {
  original: GuideOriginal;
  charge: MercadoPagoGuideCharge;
  municipalityId: string;
  processId: string;
  guideCode: string;
  amount: number;
}): void {
  const { original, charge, municipalityId, processId, guideCode, amount } = input;
  const persisted = normalizeOfficialBanking(original.barcode, original.digitable_line);
  const issued = normalizeOfficialBanking(charge.barcodeContent, charge.digitableLine);
  const expectedAmount = Number(amount);
  const actualAmount = Number(original.amount);
  const paid = original.paid === true ||
    ["compensada", "paid", "pago", "confirmed", "confirmado"].includes(
      String(original.status || "").toLowerCase(),
    );
  if (
    !charge.ok ||
    charge.environment !== "test" ||
    !charge.orderId ||
    original.municipality_id !== municipalityId ||
    original.process_id !== processId ||
    original.guide_number !== guideCode ||
    original.provider_environment !== "test" ||
    original.payment_provider !== "mercado_pago" ||
    original.bank_reference !== charge.orderId ||
    paid ||
    !persisted.barcode || !persisted.digitableLine ||
    !issued.barcode || !issued.digitableLine ||
    persisted.barcode !== issued.barcode ||
    persisted.digitableLine !== issued.digitableLine ||
    !Number.isFinite(expectedAmount) || expectedAmount <= 0 ||
    !Number.isFinite(actualAmount) ||
    actualAmount.toFixed(2) !== expectedAmount.toFixed(2)
  ) {
    throw new Error(
      "A ordem de TESTE não foi confirmada com a mesma guia, processo, código bancário e valor no Neon QA. Consulte a guia antes de repetir a emissão.",
    );
  }
}
