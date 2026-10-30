import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTenantFromHostname } from "@/lib/tenant";
import { normalizeInstitutionalHexColor } from "@/lib/municipality";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("integridade visual dos subdominios", () => {
  it("distingue dominio principal e subdominios", () => {
    expect(resolveTenantFromHostname("sigapromunicipal.com.br").mode).toBe("root");
    expect(resolveTenantFromHostname("cidade-exemplo.sigapromunicipal.com.br").mode).toBe("tenant");
    expect(resolveTenantFromHostname("www.sigapromunicipal.com.br").mode).toBe("root");
  });

  it("utiliza 90 por cento no carregamento e no React", () => {
    expect(read("index.html")).toContain('var initialAppZoom = "1"');
    expect(read("index.html")).toContain('data-page-zoom", "100');
    expect(read("src/App.tsx")).toContain('dataset.pageZoom = "100"');
    expect(read("src/App.tsx")).toContain('dataset.pageZoom = "100"');
  });

  it("preserva cores municipais corretas", () => {
    expect(normalizeInstitutionalHexColor("#13579A", "#123f32")).toBe("#13579A");
    expect(normalizeInstitutionalHexColor("#abc", "#123f32")).toBe("#aabbcc");
    expect(normalizeInstitutionalHexColor("invalida", "#123f32")).toBe("#123f32");
  });

  it("preserva legibilidade do rodape responsivo", () => {
    const portal = read("src/components/platform/PortalFrame.tsx");
    const css = read("src/styles/surface-polarity.css");
    expect(portal).toContain('data-sig-footer-grid="true"');
    expect(portal).not.toContain('className="whitespace-nowrap text-sm font-medium leading-6 text-[#F8FBFF]');
    expect(css).toContain('SIGAPRO SHARED FOOTER RESPONSIVE V1');
    expect(css).toContain('grid-template-columns: repeat(auto-fit');
    expect(css).toContain('overflow-wrap: anywhere !important');
  });
});
