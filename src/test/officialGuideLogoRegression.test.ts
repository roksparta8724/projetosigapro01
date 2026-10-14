import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGuiaRecolhimentoOficialHtml } from "@/components/GuiaRecolhimentoOficial";

describe("official guide logo regression", () => {
  it("never emits a remote broken image into static guide HTML", () => {
    const html = buildGuiaRecolhimentoOficialHtml(
      {
        prefeitura: {
          nome: "Prefeitura Teste",
          logoUrl: "https://expired.example.com/logo.png",
          logoObjectKey: "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/header-logo.jpg",
        },
        contribuinte: {
          nome: "Contribuinte Teste",
        },
        guia: {
          numeroGuia: "DAM-TESTE-0001",
          dataDocumento: "2026-10-14",
        },
        itens: [],
      },
      { autoPrint: false },
    );

    expect(html).not.toContain("https://expired.example.com/logo.png");
    expect(html).not.toContain('src="https://');
    expect(html).toContain("Brasão");
  });

  it("falls through to the resolved branding URL when local R2 signing cannot be used", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/GuiaRecolhimentoOficial.tsx"),
      "utf8",
    );

    const keyBranch = source.slice(
      source.indexOf("if (key) {"),
      source.indexOf('const url = String(source || "").trim();'),
    );

    expect(keyBranch).toContain("getSignedUrlForObjectStrict");
    expect(keyBranch).toContain("if (response.ok)");
    expect(keyBranch).not.toContain('return "";');
    expect(source).toContain('const url = String(source || "").trim();');
  });
});
