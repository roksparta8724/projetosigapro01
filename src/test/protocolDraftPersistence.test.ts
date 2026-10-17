import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultProtocolDraftForm,
  readProtocolDraft,
  saveProtocolDraft,
  toStoredUploadedFiles,
  type ProtocolDraftPayload,
} from "@/lib/protocolDraft";
import type { UploadedFileItem } from "@/components/platform/FileDropZone";

describe("protocol draft persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("preserves R2 object references so a saved draft does not require reattaching files", () => {
    const file = new File(["conteudo"], "projeto.pdf", { type: "application/pdf" });
    const uploaded: UploadedFileItem = {
      id: "upload-1",
      fileName: "projeto.pdf",
      mimeType: "application/pdf",
      sizeLabel: "8 B",
      file,
      storagePath:
        "municipalities/11111111-1111-4111-8111-111111111111/protocols/user-1/object-projeto.pdf",
      fileSizeBytes: file.size,
    };

    const stored = toStoredUploadedFiles({
      "Projeto Arquitetônico": [uploaded],
    });

    expect(stored["Projeto Arquitetônico"][0].storagePath).toBe(uploaded.storagePath);
    expect(stored["Projeto Arquitetônico"][0].fileSizeBytes).toBe(file.size);

    const payload: ProtocolDraftPayload = {
      draftNumber: "PRE-20261012-2000",
      form: {
        ...defaultProtocolDraftForm,
        titulo: "Residência",
        tipo: "Licenciamento",
        endereco: "Rua Teste, 10",
        iptu: "1",
        matricula: "2",
        proprietario: "Teste",
        documento: "3",
        lote: "",
        quadra: "",
        area: "",
        uso: "",
        padraoConstrutivo: "medio",
        observacoes: "",
        profissional: "Profissional",
        registro: "",
        telefone: "",
        email: "teste@example.com",
      },
      files: stored,
      updatedAt: new Date().toISOString(),
    };

    expect(
      saveProtocolDraft(
        "user-1",
        "11111111-1111-4111-8111-111111111111",
        payload,
      ),
    ).toBe(true);

    const restored = readProtocolDraft(
      "user-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(restored?.draftNumber).toBe(payload.draftNumber);
    expect(restored?.files["Projeto Arquitetônico"][0].storagePath).toBe(
      uploaded.storagePath,
    );
    expect(restored?.files["Projeto Arquitetônico"][0].fileSizeBytes).toBe(file.size);
  });
});
