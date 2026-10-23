import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPixPayload, isValidPixPayload } from "@/lib/pix";

const documentSource = readFileSync(fileURLToPath(new URL("../components/platform/OfficialPaymentGuideDocument.tsx", import.meta.url)), "utf8");

describe("official guide PIX authenticity", () => {
  it("renders a real QR encoder and never a pseudo-random payment matrix", () => {
    expect(documentSource).toContain("QRCodeSVG");
    expect(documentSource).toContain("isValidPixPayload(value)");
    expect(documentSource).not.toContain("hashSeed");
    expect(documentSource).not.toContain("data.bank.pixPayload || data.bank.digitableLine");
  });

  it("encodes the same valid EMV payload shown in the copy-and-paste field", () => {
    const payload = buildPixPayload({
      key: "teste@prefeitura.example",
      merchantName: "PREFEITURA TESTE",
      merchantCity: "TESTE",
      amount: 35.24,
      txid: "DAMTESTE123",
    });
    expect(isValidPixPayload(payload)).toBe(true);
    const markup = renderToStaticMarkup(QRCodeSVG({ value: payload, size: 132, level: "M", marginSize: 2 }));
    expect(markup).toContain("<svg");
    expect(markup).toContain("<path");
    expect(markup).not.toContain("hashSeed");
  });
});
