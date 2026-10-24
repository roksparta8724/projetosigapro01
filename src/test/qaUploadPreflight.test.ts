import { describe, expect, it } from "vitest";
import { QA_MAX_JSON_UPLOAD_BYTES, qaUploadMime, validateQaUploadPreflight } from "../lib/qaUploadPreflight";

describe("SIGAPRO QA preflight avoids broken base64 uploads", () => {
  it("accepts a PDF at the existing safe 2 MiB limit", () => {
    expect(() => validateQaUploadPreflight({ name: "planta.pdf", type: "application/pdf",
      size: QA_MAX_JSON_UPLOAD_BYTES })).not.toThrow();
  });
  it("rejects a PDF larger than 2 MiB before reading/encoding any bytes", () => {
    expect(() => validateQaUploadPreflight({ name: "projeto.pdf", type: "application/pdf",
      size: QA_MAX_JSON_UPLOAD_BYTES + 1 })).toThrow("2 MB");
  });
  it("rejects empty or suspiciously invalid sizes", () => {
    for(const size of [0, -1, NaN, Infinity]) {
      expect(() => validateQaUploadPreflight({ name: "x.pdf", type: "application/pdf", size })).toThrow("tamanho inválido");
    }
  });
  it("accepts a PDF with missing MIME from Windows and relies on server magic-byte check", () => {
    const file={name:"planta-arquitetonica.PDF",type:"",size:200};
    expect(qaUploadMime(file)).toBe("application/pdf");
    expect(() => validateQaUploadPreflight(file)).not.toThrow();
  });
  it("recognizes photograph extensions without Windows MIME",()=>{
    expect(qaUploadMime({name:"vistoria.JPG",type:""})).toBe("image/jpeg");
    expect(qaUploadMime({name:"vistoria.png",type:""})).toBe("image/png");
    expect(qaUploadMime({name:"vistoria.webp",type:""})).toBe("image/webp");
  });
  it("rejects formats the isolated QA server does not store", () => {
    expect(() => validateQaUploadPreflight({ name:"projeto.dwg",type:"application/octet-stream",size:150 }))
      .toThrow("PDF ou imagens");
  });
});
