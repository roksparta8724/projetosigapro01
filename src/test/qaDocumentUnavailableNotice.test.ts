import { describe, expect, it } from "vitest";
import {
  isQaDocumentMissingError, officialDocumentHref,
} from "@/components/platform/QaDocumentUnavailableNotice";

describe("SIGAPRO QA — documento referenciado sem cópia do arquivo", () => {
  it("reconhece somente erro de anexo ausente no QA e não mascara falha de autorização", () => {
    expect(isQaDocumentMissingError(
      "Documento de homologação não encontrado no armazenamento isolado. O registro pode existir."
    )).toBe(true);
    expect(isQaDocumentMissingError("Anexo QA não encontrado.")).toBe(true);
    expect(isQaDocumentMissingError("Sem acesso a esta Prefeitura.")).toBe(false);
    expect(isQaDocumentMissingError("Token inválido.")).toBe(false);
  });

  it("oferece navegação explícita ao documento oficial, sem URL assinada ou chave R2", () => {
    const result = officialDocumentHref(
      "/processos/PM-2026-00003", "f5d5e9aa-9ef9-4074-ab22-78bc0081e964"
    );
    expect(result).toBe(
      "https://sigapromunicipal.com.br/processos/PM-2026-00003/documentos/f5d5e9aa-9ef9-4074-ab22-78bc0081e964/visualizar"
    );
    expect(result).not.toContain("sig=");
    expect(officialDocumentHref("//attacker.example", "f5d5e9aa-9ef9-4074-ab22-78bc0081e964")).toBe("");
    expect(officialDocumentHref("/../escape", "f5d5e9aa-9ef9-4074-ab22-78bc0081e964")).toBe("");
    expect(officialDocumentHref("/processos/PM-2026-00003", "../../bad")).toBe("");
  });
});
