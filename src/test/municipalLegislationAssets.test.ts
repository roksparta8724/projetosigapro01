import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal legislation assets", () => {
  const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
  const legislation = read("src/pages/saas/LegislationPage.tsx");
  const municipality = read("src/lib/municipality.ts");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const dropzone = read("src/components/platform/FileDropZone.tsx");

  it("persists institutional assets instead of saving blob preview URLs", () => {
    expect(settings).toContain("handleSaveInstitutionalAssets");
    expect(settings).toContain("uploadFileToStorage");
    expect(settings).toContain('"process-documents"');
    expect(settings).toContain("persistentRef");
    expect(settings).toContain("Salvar arquivos oficiais");
    expect(settings).toContain("Acervo legal municipal");
  });

  it("saves official legal references in municipal settings", () => {
    expect(backend).toContain("plano_diretor_arquivo_url");
    expect(backend).toContain("uso_solo_arquivo_url");
    expect(backend).toContain("leis_arquivo_url");
    expect(backend).toContain("coat_of_arms_url");
    expect(backend).toContain("flag_url");
  });

  it("restores legal references after refresh", () => {
    expect(municipality).toContain("general.plano_diretor_arquivo_url");
    expect(municipality).toContain("general.uso_solo_arquivo_url");
    expect(municipality).toContain("general.leis_arquivo_url");
    expect(municipality).toContain("general.plan_file_url");
    expect(municipality).toContain("general.zoning_file_url");
  });

  it("opens the official PDF in a dedicated browser tab, including private R2 files", () => {
    expect(legislation).toContain('window.open("", "_blank")');
    expect(legislation).toContain("getSignedUrlForObjectStrict");
    expect(legislation).toContain('item.fileUrl.startsWith("r2:")');
    expect(legislation).toContain("Abrir PDF em nova guia");
    expect(legislation).not.toContain('<iframe src={item.fileUrl}');
  });

  it("shows an explicit official-storage state in upload cards", () => {
    expect(dropzone).toContain("savedLabel");
    expect(settings).toContain('savedLabel="Salvo no armazenamento oficial"');
  });
});
