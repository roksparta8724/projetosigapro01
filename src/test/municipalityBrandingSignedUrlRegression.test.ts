import { describe, expect, it } from "vitest";
import { mapMunicipalityBranding } from "@/integrations/backend/municipality";

describe("municipality branding signed URL regression", () => {
  it("drops an expired signed R2 URL when a permanent object key exists", () => {
    const branding = mapMunicipalityBranding({
      id: "branding-1",
      municipality_id: "49dac0b6-6352-4744-9aab-9ff91c59d970",
      logo_url:
        "https://example.r2.cloudflarestorage.com/logo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261009T213721Z&X-Amz-Expires=21600&X-Amz-Signature=expired",
      header_logo_url:
        "https://example.r2.cloudflarestorage.com/header-logo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261009T213721Z&X-Amz-Expires=21600&X-Amz-Signature=expired",
      header_logo_object_key:
        "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/header-logo.jpg",
      footer_logo_object_key:
        "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/footer-logo.jpg",
    });

    expect(branding.logoUrl).toBe("");
    expect(branding.headerLogoUrl).toBe("");
    expect(branding.headerLogoObjectKey).toBe(
      "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/header-logo.jpg",
    );
    expect(branding.footerLogoObjectKey).toBe(
      "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/footer-logo.jpg",
    );
  });

  it("keeps a permanent public logo URL when there is no R2 object key", () => {
    const branding = mapMunicipalityBranding({
      id: "branding-2",
      municipality_id: "m2",
      logo_url: "https://cdn.example.com/prefeitura/logo.png",
    });

    expect(branding.logoUrl).toBe("https://cdn.example.com/prefeitura/logo.png");
    expect(branding.headerLogoUrl).toBe("https://cdn.example.com/prefeitura/logo.png");
    expect(branding.footerLogoUrl).toBe("https://cdn.example.com/prefeitura/logo.png");
  });
});
