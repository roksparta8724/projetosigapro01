import { describe, expect, it } from "vitest";
import { fitMunicipalLogoFrame, fullMunicipalLogoFrame, MUNICIPAL_FOOTER_LOGO_MAX_ZOOM } from "@/lib/municipalLogoFraming";
import { getShareableGuidePix } from "@/components/platform/GuidePixShareCard";
import { buildPixPayload } from "@/lib/pix";
import type { PaymentGuideEntry, TenantSettings } from "@/lib/platform";

const guide: PaymentGuideEntry = {
  kind: "iss_obra",
  label: "ISSQN / Projeto",
  code: "DAM-ISS-2026-12345",
  amount: 125,
  dueDate: "2026-11-10",
  status: "pendente",
  paymentProvider: "manual",
};
const payload = buildPixPayload({ key: "recebimento@exemplo.gov.br", merchantName: "PREFEITURA DE TESTE", merchantCity: "TESTE", amount: 125, txid: "DAMISS202612345" });

describe("footer zoom and PIX sharing", () => {
  it("allows footer-only zoom up to 3x without affecting the header", () => {
    expect(MUNICIPAL_FOOTER_LOGO_MAX_ZOOM).toBe(3);
    expect(fitMunicipalLogoFrame({ scale: 2.8, offsetX: 0, offsetY: 0 }, "footer").scale).toBe(2.8);
    expect(fitMunicipalLogoFrame({ scale: 2.8, offsetX: 0, offsetY: 0 }, "header").scale).toBe(1.5);
    expect(fitMunicipalLogoFrame({ scale: 9 }, "footer").scale).toBe(3);
    expect(fullMunicipalLogoFrame().scale).toBe(1.5);
  });

  it("shares a valid stored unpaid PIX code and never changes it", () => {
    expect(getShareableGuidePix({ guide: { ...guide, pixPayload: payload || "" } })).toBe(payload);
  });

  it("prevents sharing an already settled or sandbox charge", () => {
    expect(getShareableGuidePix({ guide: { ...guide, status: "compensada", pixPayload: payload || "" } })).toBe("");
    expect(getShareableGuidePix({ guide: { ...guide, providerEnvironment: "test", pixPayload: payload || "" } })).toBe("");
  });

  it("does not invent Mercado Pago PIX from a municipal static key", () => {
    const settings = { chavePix: "recebimento@exemplo.gov.br", pixEnabled: true, pixKeyType: "email", beneficiarioArrecadacao: "PREFEITURA QA" } as TenantSettings;
    expect(getShareableGuidePix({ guide: { ...guide, paymentProvider: "mercado_pago" }, settings })).toBe("");
  });
});
