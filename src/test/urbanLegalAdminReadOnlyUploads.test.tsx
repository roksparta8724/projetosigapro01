import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { canEditUrbanLegislationManagement } from "@/lib/urbanLegislationAccess";

const existingPdf: UploadedFileItem = {
  id: "legal-old-1",
  fileName: "zoneamento clp.pdf",
  mimeType: "application/pdf",
  sizeLabel: "1 MB",
  storagePath: "municipalities/qa-tenant/legal/zoneamento.pdf",
  persistentRef: "r2:municipalities/qa-tenant/legal/zoneamento.pdf",
  previewUrl: "/api/legislation-open?objectKey=test.pdf",
};

describe("SIGAPRO — Master insere documentos; Admin Prefeitura apenas consulta", () => {
  it("does not present disabled attachment/replacement buttons as if they were broken for admin", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FileDropZone title="Zoneamento" description="Mapa oficial" appearance="legal"
        readOnly disabled files={[existingPdf]} onFilesSelected={onSelect} />,
    );
    expect(screen.getByText("Somente consulta — edição pelo Master")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Selecionar arquivo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Substituir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", existingPdf.previewUrl);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("permits a Master to open the same document uploader", () => {
    const { container } = render(
      <FileDropZone title="Plano Diretor" description="PDF oficial" appearance="legal"
        disabled={!canEditUrbanLegislationManagement("master_admin")}
        readOnly={!canEditUrbanLegislationManagement("master_admin")}
        files={[]} onFilesSelected={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toBeEnabled();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(screen.queryByText("Somente consulta — edição pelo Master")).not.toBeInTheDocument();
  });
  it("explains a missing document without implying that it was deleted", () => {
    render(<FileDropZone title="Plano Diretor" description="PDF oficial"
      appearance="legal" readOnly files={[]} onFilesSelected={vi.fn()} />);
    expect(screen.getByText(/Nenhum PDF vinculado a este campo/)).toBeInTheDocument();
  });
  it("restricts all four old fields and exposes extra laws in the independent registry", () => {
    const cfg = readFileSync("src/pages/saas/ConfiguracoesPage.tsx", "utf8");
    const registry = readFileSync("src/components/platform/UrbanLegislationRegistryPanel.tsx", "utf8");
    const legacy = cfg.slice(cfg.indexOf('id="sigapro-legal-archive-upload"'), cfg.indexOf("<MunicipalUrbanRulesSettings", cfg.indexOf('id="sigapro-legal-archive-upload"')));
    expect(legacy.match(/readOnly={!canManageLegislation}/g)).toHaveLength(4);
    expect(legacy).toContain("Somente consulta: o cadastro, a substituição e a exclusão");
    expect(legacy).toContain("{canManageLegislation ? (");
    expect(legacy).toContain("Salvar arquivos oficiais");
    expect(registry).toContain("Consulta — o Master cadastra as leis");
    expect(registry).toContain("O Master deve registrar as normas adicionais");
    expect(canEditUrbanLegislationManagement("prefeitura_admin")).toBe(false);
    expect(canEditUrbanLegislationManagement("master_ops")).toBe(true);
  });
});
