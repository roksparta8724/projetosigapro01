import { describe, expect, it } from "vitest";
import { barcodeFromDigitableLine, normalizeOfficialBanking } from "./bankCodes";

export const testLine = "23793388096060157364540663333335168400000300000";
export const testBarcode = "23791684000003000003388060601573644066333333";

describe("official banking field normalization", () => {
  it("maps the 47 bank line digits to the 44 barcode digits without padding", () => {
    expect(barcodeFromDigitableLine(testLine)).toBe(testBarcode);
    expect(normalizeOfficialBanking(testBarcode, testLine)).toEqual({ barcode: testBarcode, digitableLine: testLine });
  });
  it("removes the four block check digits of a collection line", () => {
    const line = "812345678901" + "123456789012" + "234567890123" + "345678901234";
    expect(barcodeFromDigitableLine(line)).toBe("81234567890123456789012345678901234567890123");
  });
  it("handles a provider repeating the digitable line as barcode_content", () => {
    expect(normalizeOfficialBanking(testLine, testLine).barcode).toBe(testBarcode);
  });
  it("supports the Mercado Pago Orders documented 46-digit auxiliary barcode with its official line", () => {
    const line = "23793380296060054351030006333303799140000020000";
    const auxiliary = "3335008800000000006004835002100020000242462010";
    const resolved = normalizeOfficialBanking(auxiliary, line);
    expect(resolved.digitableLine).toBe(line);
    expect(resolved.barcode).toBe(barcodeFromDigitableLine(line));
    expect(resolved.barcode).toHaveLength(44);
  });

  it("rejects contradictory codes and malformed strings instead of rendering false bars", () => {
    expect(normalizeOfficialBanking("1".repeat(44), testLine).barcode).toBe("");
    expect(normalizeOfficialBanking("abc" + testBarcode, testLine).barcode).toBe("");
    expect(barcodeFromDigitableLine("2".repeat(48))).toBe("");
  });
});
