import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { archiveAndOpenGuide, hasVerifiableGuidePaymentData, isGuideSettled, openLegacyGuideOriginal, type GuideOriginal } from "./guideOriginal";
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
const original: GuideOriginal = { id: "g1", municipality_id: "m1", process_id: "p1", guide_number: "DAM-1", amount: 300, created_at: "2026-10-13", due_date: "2026-10-20", status: "pendente", pix_code: pixPayload };
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
  it.each([
    { status: "pendente", paid: true },
    { status: "paid", paid: false },
    { status: "pago", paid: false },
    { status: "confirmed", paid: false },
    { status: "confirmado", paid: false },
    { status: "compensada", paid: false },
  ])("never regenerates a compensated guide ($status, paid=$paid), even if R2 original is missing", async ({ status, paid }) => {
    const settled = { ...original, status, paid };
    expect(isGuideSettled(settled)).toBe(true);
    vi.mocked(backendClient.rpc).mockResolvedValue({ data: settled });
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("Não será recriada");
    expect(uploadFile).not.toHaveBeenCalled();
    expect(renderGuideOriginalPdf).not.toHaveBeenCalled();
    expect(backendClient.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not confuse an unpaid pending guide with a paid one", () => {
    expect(isGuideSettled({ ...original, paid: false })).toBe(false);
  });
  it("does not recreate a paid guide with no original", async () => {
    backendClient.rpc.mockResolvedValue({ data: { ...original, status: "compensada" } });
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("Não será recriada");
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it("rejects browser-only PIX when the Neon guide has no recorded recipient", async () => {
    backendClient.rpc.mockResolvedValue({ data: { ...original, pix_code: undefined } });
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("sem boleto bancário válido");
    expect(backendClient.rpc).toHaveBeenCalledTimes(1);
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
  it("archives a freshly issued PDF just once and reopens the byte-identical stored original after payment", async () => {
    let stored: GuideOriginal = { ...original };
    vi.mocked(backendClient.rpc).mockImplementation(async (name, args) => {
      if (name === "get_payment_guide_original_v1") return { data: { ...stored } };
      if (name === "freeze_payment_guide_document_v1") {
        stored = { ...stored, document_snapshot: props };
        return { data: { ...stored } };
      }
      if (name === "attach_payment_guide_original_v1") {
        stored = {
          ...stored,
          original_pdf_key: String(args._object_key),
          original_pdf_sha256: String(args._sha256),
        };
        return { data: { ...stored } };
      }
      throw new Error("Unexpected banking RPC: " + name);
    });
    await archiveAndOpenGuide("m1", props, target);
    const originalPdfKey = stored.original_pdf_key;
    const originalSha = stored.original_pdf_sha256;
    expect(originalPdfKey).toMatch(/^municipalities\/m1\/processes\/p1\/dam-originals\/g1\/[a-f0-9]{64}\.pdf$/);
    expect(originalSha).toMatch(/^[a-f0-9]{64}$/);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(renderGuideOriginalPdf).toHaveBeenCalledTimes(1);
    stored = { ...stored, status: "compensada" };
    const editedCurrentSettings = {
      ...props, prefeitura: { nome: "PREFEITURA EDITADA DEPOIS" },
      guia: { ...props.guia, valorDocumento: 999, dataDocumento: "2026-12-31" },
    } as GuiaRecolhimentoOficialProps;
    await archiveAndOpenGuide("m1", editedCurrentSettings, target);
    expect(stored.original_pdf_key).toBe(originalPdfKey);
    expect(stored.original_pdf_sha256).toBe(originalSha);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(renderGuideOriginalPdf).toHaveBeenCalledTimes(1);
    expect(vi.mocked(backendClient.rpc).mock.calls.map(([name]) => name)).toEqual([
      "get_payment_guide_original_v1",
      "freeze_payment_guide_document_v1",
      "attach_payment_guide_original_v1",
      "get_payment_guide_original_v1",
    ]);
    expect(target.location.replace).toHaveBeenCalledTimes(2);
  });

  it("does not pretend the PDF is saved when upload fails", async () => {
    backendClient.rpc.mockResolvedValueOnce({ data: original }).mockResolvedValueOnce({ data: { ...original, document_snapshot: props } });
    vi.mocked(uploadFile).mockRejectedValue(new Error("R2 unavailable"));
    await expect(archiveAndOpenGuide("m1", props, target)).rejects.toThrow("R2 unavailable");
    expect(backendClient.rpc).toHaveBeenCalledTimes(2);
    expect(target.location.replace).not.toHaveBeenCalled();
  });
  it("opens and archives a valid bank boleto without PIX, using the immutable Neon snapshot", async () => {
    const barcode = "23791684000003000003388060601573644066333333";
    const digitableLine = "23793388096060157364540663333335168400000300000";
    const boletoProps = {
      ...props,
      guia: { ...props.guia, pixPayload: "", codigoBarras: barcode, linhaDigitavel: digitableLine },
    } as GuiaRecolhimentoOficialProps;
    expect(hasVerifiableGuidePaymentData(boletoProps)).toBe(true);
    backendClient.rpc.mockResolvedValueOnce({ data: original })
      .mockResolvedValueOnce({ data: { ...original, document_snapshot: boletoProps } })
      .mockResolvedValueOnce({ data: { ...original, original_pdf_key: `municipalities/m1/processes/p1/dam-originals/g1/${storedSha}.pdf`, original_pdf_sha256: storedSha } });
    await archiveAndOpenGuide("m1", boletoProps, target);
    expect(renderGuideOriginalPdf).toHaveBeenCalledWith(boletoProps);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(target.location.replace).toHaveBeenCalledTimes(1);
  });
  it("never archives an incomplete boleto lacking both bank barcode and official PIX", async () => {
    const invalid = {
      ...props, guia: { ...props.guia, pixPayload: "", codigoBarras: "1".repeat(44),
        linhaDigitavel: "2".repeat(47) },
    } as GuiaRecolhimentoOficialProps;
    expect(hasVerifiableGuidePaymentData(invalid)).toBe(false);
    backendClient.rpc.mockResolvedValue({ data: original });
    await expect(archiveAndOpenGuide("m1", invalid, target)).rejects.toThrow("sem boleto bancário válido");
    expect(uploadFile).not.toHaveBeenCalled();
    expect(renderGuideOriginalPdf).not.toHaveBeenCalled();
  });
  it("never turns a non-payable QA preview into an archived payable PDF", async () => {
    const preview = {
      ...props, guia: { ...props.guia, nonPayablePreview: true },
    } as GuiaRecolhimentoOficialProps;
    expect(hasVerifiableGuidePaymentData(preview)).toBe(false);
    backendClient.rpc.mockResolvedValue({ data: original });
    await expect(archiveAndOpenGuide("m1", preview, target)).rejects.toThrow("sem boleto bancário válido");
    expect(uploadFile).not.toHaveBeenCalled();
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
