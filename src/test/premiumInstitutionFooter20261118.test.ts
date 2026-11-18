// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatInstitutionPhone,
  hasInstitutionEmail,
  shouldRepeatInstitutionLocality,
} from "@/lib/institutionFooterPresentation";

const portal = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
const css = readFileSync("src/styles/sigapro-premium-footer.css", "utf8");
const entry = readFileSync("src/main.tsx", "utf8");

describe("SIGAPRO — rodapé institucional premium", () => {
  it("mantém telefone real e o apresenta com máscara profissional brasileira", () => {
    expect(formatInstitutionPhone("1148128374")).toBe("(11) 4812-8374");
    expect(formatInstitutionPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatInstitutionPhone("+55 11 4812-8374")).toBe("+55 (11) 4812-8374");
    expect(formatInstitutionPhone("Telefone não informado")).toBe("Telefone não informado");
    expect(formatInstitutionPhone("0800 000 0000")).toBe("0800 000 0000");
  });

  it("não duplica o município quando já está registrado no próprio endereço", () => {
    expect(shouldRepeatInstitutionLocality(
      "Avenida Adherbal da Costa Moreira, 255 - Jardim América - Campo Limpo Paulista/SP",
      "Campo Limpo Paulista",
    )).toBe(false);
    expect(shouldRepeatInstitutionLocality(
      "Av. Central, 255 - Centro",
      "Campo Limpo Paulista",
    )).toBe(true);
    expect(shouldRepeatInstitutionLocality("", "Campo Limpo Paulista")).toBe(true);
    expect(shouldRepeatInstitutionLocality("Centro", "")).toBe(false);
  });

  it("não exibe linha fictícia de contato quando o e-mail não está cadastrado", () => {
    expect(hasInstitutionEmail("E-mail não informado")).toBe(false);
    expect(hasInstitutionEmail("")).toBe(false);
    expect(hasInstitutionEmail("contato@prefeitura.sp.gov.br")).toBe(true);
    expect(portal).toContain("{footerEmailDisplay ? (");
    expect(portal).toContain('data-sig-footer-column="contato"');
  });

  it("distribui logo, Secretaria, endereço e contato em quatro áreas independentes", () => {
    expect(portal).toContain('data-sig-footer-design="premium-v3"');
    expect(portal).toContain('data-sig-footer-grid="true"');
    for (const column of ["secretaria","endereco","contato"]) {
      expect(portal).toContain(`data-sig-footer-column="${column}"`);
    }
    expect(portal).toContain('data-sig-footer-logo-cell="true"');
    expect(portal).toContain("branding={stableFooterBranding}");
    expect(portal).toContain("{institutionFooterTitle}");
    expect(portal).toContain("{footerAddress || \"Endereço não informado\"}");
    expect(portal).toContain("{footerPhoneDisplay}");
    expect(portal).toContain("{institutionFooterSignature}");
  });

  it("não permite que regras legadas forcem colunas iguais ou centralizem o brasão", () => {
    const legacy = readFileSync("src/styles/surface-polarity.css", "utf8");
    expect(legacy).not.toContain('html body #root .sig-page-footer [data-sig-footer-grid="true"]');
    expect(legacy).toContain('.sig-page-footer:not([data-sig-footer-design="premium-v3"]) [data-sig-footer-grid="true"]');
    expect(legacy).toContain('.sig-page-footer:not([data-sig-footer-design="premium-v3"]) [data-sig-footer-logo-cell="true"]');
    expect(css).toContain('align-items: start;');
    expect(css).toContain('justify-content: flex-start;');
    expect(css).toContain('width: 116px !important;');
    expect(css).toContain('height: 116px !important;');
    expect(css).not.toContain('repeat(auto-fit');
    expect(portal).toContain('data-sig-footer-design="premium-v3"');
  });

  it("usa grid proporcional e responsividade conforme a largura útil do conteúdo", () => {
    expect(css).toContain("container: sigapro-footer / inline-size");
    expect(css).toContain("grid-template-columns: 116px minmax(0, 1.48fr) minmax(0, 1.46fr) minmax(0, .82fr)");
    expect(css).toContain("@container sigapro-footer (max-width: 1050px)");
    expect(css).toContain("@container sigapro-footer (max-width: 710px)");
    expect(css).toContain("@container sigapro-footer (max-width: 430px)");
    expect(css).toContain('data-sig-footer-primary="true"');
    expect(entry).toContain('import "./styles/sigapro-premium-footer.css"');
  });
});
