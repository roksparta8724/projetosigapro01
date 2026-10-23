import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const vite = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
const handler = readFileSync(resolve(process.cwd(), "api/municipality-logo-open.ts"), "utf8");
const frontend = readFileSync(resolve(process.cwd(), "src/integrations/r2/client.ts"), "utf8");

describe("localhost municipal logo endpoint parity", () => {
  it("routes GET to the same handler as the official Vercel endpoint, before the POST-only fallback", () => {
    expect(vite).toContain('import handleMunicipalityLogoOpen from "./api/municipality-logo-open";');
    expect(vite).toContain('req.url.split("?")[0] === "/api/municipality-logo-open"');
    expect(vite).toContain("await handleMunicipalityLogoOpen(req, res)");
    expect(vite.indexOf('req.url.split("?")[0] === "/api/municipality-logo-open"'))
      .toBeLessThan(vite.indexOf('if (req.method !== "POST")'));
  });

  it("preserves the original object-key allowlist, URL validation and R2 bucket in both environments", () => {
    expect(handler).toContain("isMunicipalBrandingObject(objectKey)");
    expect(handler).toContain("R2_BUCKET_LOGOS");
    expect(handler).toContain('req.method !== "GET"');
    expect(frontend).toContain("/api/municipality-logo-open?objectKey=");
    expect(frontend).toContain('host === "localhost" || host === "127.0.0.1"');
    expect(frontend).toContain('host === "sigapromunicipal.com.br"');
  });

  it("blocks QA logos unless user opts into read-only municipal branding", () => {
    expect(vite).toContain('process.env.SIGAPRO_QA_PUBLIC_BRANDING_READ !== "true"');
    expect(vite).toContain("Logo municipal em QA requer opção explícita de leitura pública.");
  });
});
