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
