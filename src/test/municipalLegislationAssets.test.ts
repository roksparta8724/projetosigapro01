import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal legislation assets", () => {
  const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
  const legislation = read("src/pages/saas/LegislationPage.tsx");
  const zoning = read("src/pages/saas/ZoningPage.tsx");
  const municipality = read("src/lib/municipality.ts");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const dropzone = read("src/components/platform/FileDropZone.tsx");
  const r2Client = read("src/integrations/r2/client.ts");
  const r2Storage = read("src/integrations/r2/storage.ts");
  const r2SignApi = read("api/r2-sign-get.ts");
  const r2UploadApi = read("api/r2-upload.ts");
  const legislationOpenApi = read("api/legislation-open.ts");

  it("persists institutional assets instead of saving blob preview URLs", () => {
    expect(settings).toContain("handleSaveInstitutionalAssets");
    expect(settings).toContain("uploadFileToStorage");
    expect(settings).toContain('"process-documents"');
    expect(settings).toContain("persistentRef");
    expect(settings).toContain("Salvar arquivos oficiais");
    expect(settings).toContain("Acervo legal municipal");
    expect(settings).toContain('title="Zoneamento"');
    expect(settings).toContain("zoneamentoFiles");
  });

  it("saves official legal references in municipal settings", () => {
    expect(backend).toContain("plano_diretor_arquivo_url");
    expect(backend).toContain("uso_solo_arquivo_url");
    expect(backend).toContain("zoneamento_arquivo_url");
    expect(backend).toContain("zoning_map_file_url");
    expect(backend).toContain("leis_arquivo_url");
    expect(backend).toContain("coat_of_arms_url");
    expect(backend).toContain("bandeira_url");
    expect(backend).not.toContain("flag_url: settings.bandeiraUrl");
  });

  it("restores legal references after refresh", () => {
    expect(municipality).toContain("general.plano_diretor_arquivo_url");
    expect(municipality).toContain("general.uso_solo_arquivo_url");
    expect(municipality).toContain("general.zoneamento_arquivo_url");
    expect(municipality).toContain("general.zoning_map_file_url");
    expect(municipality).toContain("general.leis_arquivo_url");
    expect(municipality).toContain("general.plan_file_url");
  });

  it("opens the official PDF through one stable route in localhost and production", () => {
    expect(legislation).toContain("getLegislationOpenUrl");
    expect(legislation).toContain('window.open(targetUrl, "_blank", "noopener,noreferrer")');
    expect(r2Client).toContain("getLegislationOpenUrl");
    expect(r2Client).toContain("/api/legislation-open?objectKey=");
    expect(legislationOpenApi).toContain("isMunicipalLegislationObject");
    expect(legislationOpenApi).toContain("ResponseContentDisposition: \"inline\"");
    expect(legislationOpenApi).toContain('res.setHeader("Location", signedUrl)');
    expect(legislation).toContain("Abrir guia");
    expect(legislation).not.toContain('<iframe src={item.fileUrl}');
  });

  it("shows the official zoning PDF in the zoning workspace", () => {
    expect(zoning).toContain("Documento oficial do zoneamento");
    expect(zoning).toContain("liveInstitutionSettings?.zoneamentoArquivoUrl");
    expect(zoning).toContain("institutionSettingsCompat?.zoneamentoArquivoUrl");
    expect(zoning).toContain("liveInstitutionSettings?.zoneamentoArquivoNome");
    expect(zoning).toContain("openZoningDocument");
    expect(zoning).toContain("getLegislationOpenUrl");
    expect(zoning).toContain("Abrir guia");
    expect(zoning).toContain("PDF de zoneamento ainda não vinculado");
  });

  it("prioritizes the official same-origin API when opening signed PDFs in production", () => {
    expect(r2Client).toContain("buildApiCandidates");
    expect(r2Client).toContain('buildApiCandidates("/api/r2-sign-get")');
    expect(r2Client).toContain('["localhost", "127.0.0.1", "::1"]');
    expect(r2Client).toContain("isLocalBrowser ? [remote, normalized] : [normalized, remote]");
    expect(r2Client).toContain("requestSignedUrlWithFallback");
  });

  it("normalizes browser bucket names before requesting signed URLs", () => {
    expect(r2Client).toContain("function normalizeClientBucket");
    expect(r2Client).toContain('return "process-documents"');
    expect(r2Client).toContain('return "institutional-branding"');
    expect(r2Client).toContain("bucket = normalizeClientBucket(input.bucket)");
  });

  it("resolves physical storage buckets only on the server", () => {
    expect(r2Storage).toContain('? "process-documents"');
    expect(r2Storage).toContain(': "institutional-branding"');
    expect(r2Storage).not.toContain("VITE_R2_BUCKET_DOCUMENTOS");
    expect(r2SignApi).toContain('if (value === "process-documents") return documents');
    expect(r2UploadApi).toContain('if (value === "process-documents") return documents');
    expect(legislationOpenApi).toContain('readEnv("R2_BUCKET_DOCUMENTOS")');
    expect(legislationOpenApi).toContain('"sigapro-documentos"');
  });

  it("refreshes the municipality bundle and prefers live legal attachments after saving", () => {
    expect(settings).toContain("bootstrap.refreshMunicipalityBundle(savedTenantId)");
    expect(settings).toContain("sigapro-municipality-settings-updated");
    expect(legislation).toContain("const liveSettings = getInstitutionSettings");
    expect(legislation).toContain(
      "liveSettings.usoSoloArquivoUrl || base.usoSoloArquivoUrl",
    );
    expect(legislation).toContain(
      "liveSettings.zoneamentoArquivoUrl || base.zoneamentoArquivoUrl",
    );
  });

  it("shows an explicit official-storage state in upload cards", () => {
    expect(dropzone).toContain("savedLabel");
    expect(settings).toContain('savedLabel="Salvo no armazenamento oficial"');
  });
});
