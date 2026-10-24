import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyQaExistingDocumentCopy } from "@/lib/qaExistingDocumentRecovery";

const input = new TextEncoder().encode("%PDF-1.7\nobj\nendobj\n%%EOF");

function fileLike(bytes = input) {
  return {
    name: "doc-qa.pdf",
    size: bytes.byteLength,
    slice(start: number, end: number) {
      const part = bytes.slice(start, end);
      return {
        arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
      } as Blob;
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as File;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SIGAPRO QA — importar apenas cópia que corresponde ao documento cadastrado", () => {
  it("aceita somente tamanho e SHA-256 exatos", async () => {
    const hash = Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", input)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    await expect(verifyQaExistingDocumentCopy(fileLike(), {
      fileHash: hash, fileSizeBytes: input.byteLength,
    })).resolves.toBeUndefined();
    await expect(verifyQaExistingDocumentCopy(fileLike(), {
      fileHash: hash, fileSizeBytes: input.byteLength - 1,
    })).rejects.toThrow("tamanho");
    await expect(verifyQaExistingDocumentCopy(fileLike(), {
      fileHash: "a".repeat(64), fileSizeBytes: input.byteLength,
    })).rejects.toThrow("SHA-256 diferente");
  });

  it("bloqueia importação sem impressão digital válida", async () => {
    await expect(verifyQaExistingDocumentCopy(fileLike(), {
      fileHash: "", fileSizeBytes: input.byteLength,
    })).rejects.toThrow("SHA-256 verificável");
    await expect(verifyQaExistingDocumentCopy(fileLike(), {
      fileHash: "invalid", fileSizeBytes: input.byteLength,
    })).rejects.toThrow("SHA-256 verificável");
  });

  it("rejeita HTML renomeado como PDF antes de verificar hash", async () => {
    const wrong = new TextEncoder().encode("<html>login</html>");
    await expect(verifyQaExistingDocumentCopy(fileLike(wrong), {
      fileHash: "a".repeat(64), fileSizeBytes: wrong.byteLength,
    })).rejects.toThrow("assinatura");
  });
});
