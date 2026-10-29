import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function getQaOpener() {
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
  vi.resetModules();
  return (await import("../integrations/r2/client")).getLegislationOpenUrl;
}

describe("SIGAPRO QA legislation cannot open production file-store URLs", () => {
  it.each([
    "https://sigapromunicipal.com.br/arquivos/lei.pdf",
    "https://documents.r2.cloudflarestorage.com/municipalities/old/lei.pdf",
    "http://bucket.example.invalid/lei.pdf",
    "//sigapromunicipal.com.br/lei.pdf",
    "blob:https://sigapromunicipal.com.br/hidden",
    "data:application/pdf;base64,QUJD",
  ])("blocks external stored URL %s in isolated QA", async url => {
    const open = await getQaOpener();
    expect(open(url)).toBe("");
  });

  it("keeps stable municipal references on the local QA API", async () => {
    const open=await getQaOpener();
    const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/legislation/lei-qa.pdf";
    expect(open("r2:"+key)).toBe(
      "/api/legislation-open?objectKey="+encodeURIComponent(key),
    );
  });

  it("allows same-origin relative references in isolated QA", async () => {
    const open=await getQaOpener();
    expect(open("/arquivos/qa-only.pdf")).toBe("/arquivos/qa-only.pdf");
  });

  it("does not change production's behavior for existing absolute URLs", async () => {
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "false");
    vi.resetModules();
    const { getLegislationOpenUrl } = await import("../integrations/r2/client");
    expect(getLegislationOpenUrl("https://sigapromunicipal.com.br/lei.pdf")).toBe(
      "https://sigapromunicipal.com.br/lei.pdf",
    );
  });
});
