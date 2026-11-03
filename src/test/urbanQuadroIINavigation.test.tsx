import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { UrbanQuadroIIWorkspacePanel } from "@/components/platform/UrbanQuadroIIWorkspacePanel";
import { listUrbanQuadroIIWorkspace } from "@/integrations/backend/urbanPrecheckClient";

vi.mock("@/integrations/backend/urbanPrecheckClient", () => ({
  listUrbanQuadroIIWorkspace: vi.fn(),
  saveUrbanQuadroIIDraft: vi.fn(),
}));

const pages = [38, 39, 40].map((page_number) => ({
  page_number,
  topic: "Institucional",
  visual_warning: false,
  draft_count: 0,
  proposals: [],
}));

describe("SIGAPRO IA — changing Quadro II pages without scroll jumps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.mocked(listUrbanQuadroIIWorkspace).mockResolvedValue({
      status: "pending_legal_review",
      batch_id: "c8b6c9e6-8e35-4611-8af7-7e3c5b9d11aa",
      document_sha256: "a".repeat(64),
      document_title: "quadros.pdf",
      pages,
      entries: [],
      legal_approval: false,
      ready_for_ai: false,
    });
  });

  it("keeps one fixed index and reuses a single anchored detail while switching pages", async () => {
    const { container } = render(
      <UrbanQuadroIIWorkspacePanel
        municipalityId="6c1eaac6-1f5a-43f3-979e-2a7682b88a1a"
        canEdit
      />,
    );
    const index = await waitFor(() => {
      const element = container.querySelector('[data-urban-qii-index="true"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(within(index).getAllByRole("button")).toHaveLength(3);
    const page38 = within(index).getByRole("button", { name: /Página 38/ });
    const page39 = within(index).getByRole("button", { name: /Página 39/ });

    fireEvent.click(page38);
    expect(page38).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: /Leitura da página 38/ })).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    fireEvent.click(page39);
    expect(page38).toHaveAttribute("aria-pressed", "false");
    expect(page39).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: /Leitura da página 39/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Leitura da página 38/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-urban-qii-detail="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-urban-qii-index="true"]')).toBe(index);

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByRole("region", { name: /Leitura da página 40/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(screen.getByRole("region", { name: /Leitura da página 39/ })).toBeInTheDocument();
  });
});
