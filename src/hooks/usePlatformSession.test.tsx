import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformSessionProvider, usePlatformSession } from "@/hooks/usePlatformSession";

const gatewayMock = vi.hoisted(() => ({
  authenticatedEmail: "prefeitura@example.test",
  authenticatedRole: "prefeitura_admin",
  authenticatedAccessLevel: 3 as const,
  authenticatedUserId: "f0a659b0-395f-48ad-a29f-70362d9cf4a6",
  authenticatedProfileId: "d5434b4e-e1f5-46fd-a95c-dedc9631d9d2",
  authenticatedMunicipalityId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
  authResolved: true,
  loading: false,
}));

vi.mock("@/hooks/useAuthGateway", () => ({
  useAuthGateway: () => gatewayMock,
}));

vi.mock("@/integrations/backend/config", () => ({
  isNeonBackend: true,
}));

function Probe() {
  const { session } = usePlatformSession();
  return (
    <>
      <span data-testid="session-id">{session.id}</span>
      <span data-testid="session-role">{session.role}</span>
      <span data-testid="session-municipality">{session.municipalityId ?? "none"}</span>
    </>
  );
}

describe("PlatformSessionProvider Neon profile-first identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    gatewayMock.authenticatedEmail = "prefeitura@example.test";
    gatewayMock.authenticatedRole = "prefeitura_admin";
    gatewayMock.authenticatedAccessLevel = 3;
    gatewayMock.authenticatedUserId = "f0a659b0-395f-48ad-a29f-70362d9cf4a6";
    gatewayMock.authenticatedProfileId = "d5434b4e-e1f5-46fd-a95c-dedc9631d9d2";
    gatewayMock.authenticatedMunicipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
    gatewayMock.authResolved = true;
    gatewayMock.loading = false;
  });

  it("preserves the canonical master_admin role instead of falling back to an owner role", () => {
    gatewayMock.authenticatedEmail = "roksparta02@gmail.com";
    gatewayMock.authenticatedRole = "master_admin";
    gatewayMock.authenticatedUserId = "daa16788-343c-45fe-a649-bbbce94d4798";
    gatewayMock.authenticatedProfileId = "17b9f386-cf7a-4f92-8646-e3944d28eb4f";
    gatewayMock.authenticatedMunicipalityId = null;

    render(
      <PlatformSessionProvider>
        <Probe />
      </PlatformSessionProvider>,
    );

    expect(screen.getByTestId("session-role")).toHaveTextContent("master_admin");
    expect(screen.getByTestId("session-id")).toHaveTextContent("17b9f386-cf7a-4f92-8646-e3944d28eb4f");
    expect(screen.getByTestId("session-municipality")).toHaveTextContent("none");
  });

  it("keeps the cached external Neon session on F5 even when authResolved is true before live identity returns", () => {
    window.localStorage.setItem(
      "sigapro.platform.session.v1",
      JSON.stringify({
        id: "external-profile-id",
        name: "Profissional Externo",
        role: "profissional_externo",
        accessLevel: 1,
        tenantId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
        municipalityId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
        title: "Profissional externo",
        email: "profissional@example.test",
        accountStatus: "active",
        userType: "Profissional",
        department: "",
        createdAt: "",
        lastAccessAt: "",
        blockedAt: null,
        blockedBy: null,
        blockReason: null,
        deletedAt: null
      }),
    );

    gatewayMock.authenticatedEmail = "";
    gatewayMock.authenticatedRole = null as unknown as typeof gatewayMock.authenticatedRole;
    gatewayMock.authenticatedUserId = null as unknown as string;
    gatewayMock.authenticatedProfileId = null as unknown as string;
    gatewayMock.authenticatedMunicipalityId = null as unknown as string;
    gatewayMock.authResolved = true;
    gatewayMock.loading = false;

    render(
      <PlatformSessionProvider>
        <Probe />
      </PlatformSessionProvider>,
    );

    expect(screen.getByTestId("session-id")).toHaveTextContent("external-profile-id");
    expect(screen.getByTestId("session-role")).toHaveTextContent("profissional_externo");
    expect(screen.getByTestId("session-municipality")).toHaveTextContent(
      "49dac0b6-6352-4744-9aab-9ff91c59d970",
    );
  });

  it("uses profile_id as the business session id while auth subject remains separate", () => {
    render(
      <PlatformSessionProvider>
        <Probe />
      </PlatformSessionProvider>,
    );

    expect(screen.getByTestId("session-id")).toHaveTextContent(gatewayMock.authenticatedProfileId);
    expect(screen.getByTestId("session-id")).not.toHaveTextContent(gatewayMock.authenticatedUserId);
    expect(screen.getByTestId("session-role")).toHaveTextContent("prefeitura_admin");
    expect(screen.getByTestId("session-municipality")).toHaveTextContent(
      gatewayMock.authenticatedMunicipalityId,
    );

    const cached = JSON.parse(
      window.localStorage.getItem("sigapro.platform.session.v1") || "{}",
    );
    expect(cached.id).toBe(gatewayMock.authenticatedProfileId);
  });
});
