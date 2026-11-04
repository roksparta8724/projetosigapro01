import { describe, expect, it } from "vitest";
import {
  getStableMunicipalLegislationReference,
  getLegislationOpenUrl,
} from "@/integrations/r2/client";

const MUNICIPALITY_A = "11111111-1111-4111-8111-111111111111";
const MUNICIPALITY_B = "22222222-2222-4222-8222-222222222222";
const key = `municipalities/${MUNICIPALITY_A}/legislation/uso-e-ocupacao.pdf`;
const legacySignedUrl =
  `https://sigapro-documentos.example123.r2.cloudflarestorage.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261021T010000Z&X-Amz-Expires=900`;

describe("Municipal legislation PDF references", () => {
  it("upgrades expired historic R2 signed links to immutable municipal references", () => {
    const recovered = getStableMunicipalLegislationReference(legacySignedUrl, MUNICIPALITY_A);
    expect(recovered).toBe(`r2:${key}`);
    const usableUrl = getLegislationOpenUrl(recovered);
    expect(usableUrl).toContain("/api/legislation-open?objectKey=");
    expect(decodeURIComponent(usableUrl)).toContain(key);
    expect(usableUrl).not.toContain("X-Amz-");
  });

  it("preserves an existing durable R2 reference", () => {
    expect(getStableMunicipalLegislationReference(`r2:${key}`, MUNICIPALITY_A)).toBe(`r2:${key}`);
  });

  it("never borrows PDF files from a different municipality or third-party host", () => {
    expect(getStableMunicipalLegislationReference(legacySignedUrl, MUNICIPALITY_B)).toBe(legacySignedUrl);
    expect(getStableMunicipalLegislationReference(
      `https://untrusted.example.com/${key}?X-Amz-Expires=900`, MUNICIPALITY_A,
    )).toContain("untrusted.example.com");
    expect(getStableMunicipalLegislationReference("https://example.org/brochure.pdf", MUNICIPALITY_A))
      .toBe("https://example.org/brochure.pdf");
  });
});
