import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/GuiaRecolhimentoOficial.tsx"),
  "utf8",
);
const vite = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

describe("official guide municipal branding", () => {
  it("never leaves a remote logo URL inside static printable HTML", () => {
    expect(source).toContain('logoUrl: /^data:image\\//i.test(staticLogo) ? staticLogo : ""');
    expect(source).toContain("fallback institucional renderizado no próprio HTML");
  });

  it("renders a printable institutional fallback instead of a broken image icon", () => {
    expect(source).toContain("dam-logo-fallback-mark");
    expect(source).toContain("municipalityName={prefeitura.nome}");
    expect(source).toContain("Brasão de");
    expect(source).not.toContain('alt="Logo da Prefeitura"');
  });

  it("embeds an R2 branding object before opening the guide", () => {
    expect(source).toContain("deriveBrandingObjectKey");
    expect(source).toContain("getSignedUrlForObjectStrict");
    expect(source).toContain("const embeddedLogo = await embedGuideImage");
    expect(source).toContain("logoObjectKey");
    expect(source).toContain("AbortSignal.timeout(8_000)");
  });

  it("proxies read-only R2 access from localhost when local credentials are absent", () => {
    expect(vite).toContain("READ_ONLY_R2_ROUTES");
    expect(vite).toContain("proxyOfficialReadApi");
    expect(vite).toContain("!localR2Ready");
    expect(vite).toContain("Upload/delete nunca são encaminhados para produção");
  });
});
