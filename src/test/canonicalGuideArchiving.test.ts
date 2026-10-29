import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const guide = readFileSync("src/lib/guideOriginal.ts", "utf8");

describe("SIGAPRO original PDF only uses bank-confirmed payee details", () => {
  it("uses the canonical PIX saved on the same Neon guide", () => {
    expect(guide).toContain('const persistedPix = String(original.pix_code || "").trim();');
    expect(guide).toContain('pixPayload: isValidPixPayload(persistedPix) ? persistedPix : ""');
    expect(guide).toContain('if (!hasVerifiableGuidePaymentData(canonicalProps))');
    expect(guide).toContain('{ _snapshot: canonicalProps }');
    expect(guide).not.toContain('{ _snapshot: props }');
  });
  it("still allows a valid boleto when the provider has not supplied a canonical PIX", () => {
    expect(guide).toContain("const banking = normalizeOfficialBanking(props.guia.codigoBarras, props.guia.linhaDigitavel)");
    expect(guide).toContain("return Boolean(banking.barcode && banking.digitableLine)");
  });
  it("reopens a previously stored original before freezing a new snapshot", () => {
    expect(guide.indexOf("await openStoredGuide(original, target)")).toBeLessThan(
      guide.indexOf('guideRpc("freeze_payment_guide_document_v1"')
    );
  });
});
