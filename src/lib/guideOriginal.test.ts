import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { archiveAndOpenGuide, openLegacyGuideOriginal, type GuideOriginal } from "./guideOriginal";
import type { ProcessDocument } from "@/lib/platform";
import { backendClient } from "@/integrations/backend/databaseClient";
import { getSignedUrlForObjectStrict, uploadFile } from "@/integrations/r2/client";
import { renderGuideOriginalPdf } from "./guidePdf";
import type { GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";
import { buildPixPayload } from "./pix";

vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc: vi.fn() } }));
vi.mock("@/integrations/r2/client", () => ({ getSignedUrlForObjectStrict: vi.fn(), uploadFile: vi.fn() }));
vi.mock("./guidePdf", () => ({ renderGuideOriginalPdf: vi.fn() }));
const pixPayload = buildPixPayload({ key: "financeiro@prefeitura.gov.br", merchantName: "Prefeitura Teste", merchantCity: "Sao Paulo", amount: 300, txid: "DAM1" })!;
const props = { prefeitura: { nome: "Teste" }, contribuinte: { nome: "Teste" }, guia: { numeroGuia: "DAM-1", dataDocumento: "2026-10-13", valorDocumento: 300, pixPayload }, itens: [] } as GuiaRecolhimentoOficialProps;
const original: GuideOriginal = { id: "g1", municipality_id: "m1", process_id: "p1", guide_number: "DAM-1", amount: 300, created_at: "2026-10-13", due_date: "2026-10-20", status: "pendente" };
const storedSha = "a".repeat(64);
const target = { location: { replace: vi.fn() } } as unknown as Window;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(getSignedUrlForObjectStrict).mockResolvedValue("https://storage.test/original.pdf");
  vi.mocked(uploadFile).mockImplementation(async (input) => ({ bucket: input.bucket, objectKey: input.objectKey, publicUrl: "" }));
  vi.mocked(renderGuideOriginalPdf).mockResolvedValue(new NodeBlob(["%PDF-test"]) as unknown as Blob);
});

describe("immutable DAM original", () => {
  it("preserves read-only access to a uniquely identified legacy original", async () => {
    const documents = [{ uploaded: true, filePath: "r2:legacy.pdf", fileName: "DAM-1.pdf", mimeType: "application/pdf" }] as ProcessDocument[];
    expect(await openLegacyGuideOriginal(documents, "DAM-1", target)).toBe(true);
    expect(getSignedUrlForObjectStrict).toHaveBeenCalledWith({ bucket: "process-documents", objectKey: "legacy.pdf" });
    expect(backendClient.rpc).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it("does not confuse guide prefixes or choose between duplicate legacy originals", async () => {
    const doc = { uploaded: true, filePath: "legacy.pdf", fileName: "DAM-10.pdf", mimeType: "application/pdf" } as ProcessDocument;
    expect(await openLegacyGuideOriginal([doc], "DAM-1", target)).toBe(false);
    expect(await openLegacyGuideOriginal([doc, doc], "DAM-10", target)).toBe(false);
    expect(getSignedUrlForObjectStrict).not.toHaveBeenCalled();
  });
  it("reopens exactly the stored PDF even after payment without regenerating or uploading", async () => {
    backendClient.rpc.mockResolvedValue({ data: { ...original, status: "compensada", original_pdf_key: `municipalities/m1/processes/p1/dam-originals/g1/${storedSha}.pdf`, original_pdf_sha256: storedSha } });
    await archiveAndOpenGuide("m1", props, target);
    expect(getSignedUrlForObjectStrict).toHaveBeenCalledWith({ bucket: "process-documents", objectKey: `municipalities/m1/processes/p1/dam-originals/g1/${storedSha}.pdf` });
    expect(renderGuideOriginalPdf).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(backendClient.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not recreate a paid guide with no original", async () => {
    backendClient.rpc.mockResolvedValue({ data: { ...original, status: "compensada" } });
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("Não será recriada");
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it("renders the persisted snapshot instead of current settings and opens only after attaching", async () => {
    const snapshot = { ...props, prefeitura: { nome: "Prefeitura ORIGINAL" } };
    backendClient.rpc.mockResolvedValueOnce({ data: original })
      .mockResolvedValueOnce({ data: { ...original, document_snapshot: snapshot } })
      .mockResolvedValueOnce({ data: { ...original, original_pdf_key: `municipalities/m1/processes/p1/dam-originals/g1/${storedSha}.pdf`, original_pdf_sha256: storedSha } });
    await archiveAndOpenGuide("m1", props, target);
    expect(renderGuideOriginalPdf).toHaveBeenCalledWith(snapshot);
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ objectKey: expect.stringMatching(/^municipalities\/m1\/processes\/p1\/dam-originals\/g1\/[a-f0-9]{64}\.pdf$/) }));
    expect(getSignedUrlForObjectStrict).toHaveBeenCalledWith(expect.objectContaining({ objectKey: `municipalities/m1/processes/p1/dam-originals/g1/${storedSha}.pdf` }));
    expect(target.location.replace).toHaveBeenCalledTimes(1);
  });
  it("does not pretend the PDF is saved when upload fails", async () => {
    backendClient.rpc.mockResolvedValueOnce({ data: original }).mockResolvedValueOnce({ data: { ...original, document_snapshot: props } });
    vi.mocked(uploadFile).mockRejectedValue(new Error("R2 unavailable"));
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("R2 unavailable");
    expect(backendClient.rpc).toHaveBeenCalledTimes(2);
    expect(target.location.replace).not.toHaveBeenCalled();
  });
  it("fails closed if Neon or the signed original is unavailable", async () => {
    backendClient.rpc.mockResolvedValue({ error: { message: "Neon unavailable" } });
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("Neon unavailable");
    backendClient.rpc.mockResolvedValue({ data: { ...original, original_pdf_key: `municipalities/m1/processes/p1/dam-originals/g1/${storedSha}.pdf`, original_pdf_sha256: storedSha } });
    vi.mocked(getSignedUrlForObjectStrict).mockRejectedValue(new Error("R2 read failed"));
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("R2 read failed");
    expect(renderGuideOriginalPdf).not.toHaveBeenCalled();
  });
});
