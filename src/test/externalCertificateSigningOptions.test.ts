import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Modalidades de assinatura externa", () => {
  it("distingue os certificados externos e não promove emissão ou assinatura interna", () => {
    const source = readFileSync("src/components/platform/ExternalCertificateSigningOptions.tsx", "utf8");
    expect(source).toContain("https://assinador.iti.br/");
    expect(source).toContain("https://validar.iti.gov.br/");
    expect(source).toContain("ICP-Brasil");
    expect(source).toContain("Integração direta ainda não habilitada");
    expect(source).not.toMatch(/signProcessArtifact|fetch\(|\.rpc\(/);
    expect(source).toContain('String(import.meta.env.VITE_SIGAPRO_NEON_ISOLATED)==="true"');
    expect(source).toContain("runCertifiedSandbox(sandbox,popup,attempt.signal)");
    expect(source).toContain("Nenhum alvará foi emitido");
    const client=readFileSync("src/integrations/esign/certifiedSandboxClient.ts","utf8");
    expect(client).not.toMatch(/signProcessArtifactWithPassword|finalizeHabiteSePermit|finalizeConstructionPermit/);
    expect(client).toContain('v.issuanceAuthorized!==false');
    expect(client).toContain('v.manifestRecorded!==true');
  });
  it("exibe as orientações nos dois fluxos sem substituir a confirmação existente", () => {
    for (const file of ["ConstructionPermitPanel", "HabiteSePermitPanel"]) {
      const source = readFileSync("src/components/platform/" + file + ".tsx", "utf8");
      expect(source).toContain("<ExternalCertificateSigningOptions disabled=");
      expect(source).toContain("signProcessArtifactWithPassword");
    }
  });
});
