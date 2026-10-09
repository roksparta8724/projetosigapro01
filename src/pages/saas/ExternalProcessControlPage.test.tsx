import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ExternalProcessControlPage } from "@/pages/saas/ExternalProcessControlPage";

vi.mock("@/components/platform/PortalFrame", () => ({
  PortalFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePlatformSession", () => ({
  usePlatformSession: () => ({
    session: {
      id: "external-profile-id",
      name: "Profissional Externo",
      role: "profissional_externo",
      tenantId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
      municipalityId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
      email: "profissional@example.test",
    },
  }),
}));

vi.mock("@/hooks/useMunicipality", () => ({
  useMunicipality: () => ({
    municipality: { id: "49dac0b6-6352-4744-9aab-9ff91c59d970" },
    scopeId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
    institutionSettingsCompat: null,
  }),
}));

vi.mock("@/hooks/usePlatformData", () => ({
  usePlatformData: () => ({
    processes: [],
    getInstitutionSettings: () => null,
  }),
}));

describe("ExternalProcessControlPage", () => {
  it("renders process metrics and filters without ReferenceError after navigation", () => {
    render(
      <MemoryRouter initialEntries={["/externo/controle"]}>
        <ExternalProcessControlPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Controle de processos")).toBeInTheDocument();
    expect(screen.getByText("Em andamento")).toBeInTheDocument();
    expect(screen.getByText("Com exigências")).toBeInTheDocument();
    expect(screen.getByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.getByText("Concluídos")).toBeInTheDocument();
    expect(screen.getByText("Nenhum processo encontrado")).toBeInTheDocument();
  });
});
