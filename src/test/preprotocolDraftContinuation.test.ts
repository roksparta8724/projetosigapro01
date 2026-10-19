import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/pages/saas/ProtocolarProjetoPage.tsx"),
  "utf8",
);

describe("pre-protocol draft continuation", () => {
  it("keeps the editor open after saving a local draft", () => {
    expect(page).toContain("window.history.replaceState");
    expect(page).toContain('url.searchParams.set("rascunho", draftNumber)');
    expect(page).not.toContain('navigate("/externo/controle/rascunhos")');
  });

  it("separates saving from proceeding to payment for an existing pre-protocol", () => {
    expect(page).toContain('data-remote-draft-action="save"');
    expect(page).toContain('data-remote-draft-action="payment"');
    expect(page).toContain("Salvar alterações");
    expect(page).toContain("Prosseguir para pagamento");
    expect(page).toContain('remoteDraftActionRef = useRef<"save" | "payment">("payment")');
  });

  it("stays on the page after remote draft save and only payment action navigates", () => {
    expect(page).toContain('remotePreProtocolNumber && remoteDraftAction === "save"');
    expect(page).toContain("Rascunho salvo com sucesso.");
    expect(page).toContain("/externo/pagamentos?preprotocolo=");
  });

  it("blocks payment continuation while required documents are missing", () => {
    expect(page).toContain("missingRequired.length > 0");
    expect(page).toContain("Anexe todos os documentos obrigatórios antes de prosseguir para o pagamento");
  });
});
