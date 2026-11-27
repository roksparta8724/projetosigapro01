import { render, screen } from "@testing-library/react";
import type { SessionUser } from "@/lib/platform";
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

// Testa o contrato da sessão isoladamente, sem montar stores de produção.
// O provider recebe uma lista vazia, de modo que a identidade autenticada
// e o cache de F5 sejam as fontes controladas por cada cenário do teste.
const storeMock = vi.hoisted(() => ({
  sessionUsers: [] as SessionUser[],
  storeIdentityConfirmed: false,
  remoteSyncedForCurrentUser: false,
}));
vi.mock("@/hooks/usePlatformData", () => ({
  usePlatformData: () => storeMock,
}));

vi.mock("@/integrations/backend/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/backend/config")>()),
  isNeonBackend: true,
  isSupabaseBackend: false,
  isNeonProduction: true,
}));

function Probe() {
  const { session } = usePlatformSession();
  return (
    <>
      <span data-testid="session-id">{session.id}</span>
      <span data-testid="session-role">{session.role}</span>
      <span data-testid="session-municipality">{session.municipalityId ?? "none"}</span>
      <span data-testid="session-department">{session.department || "none"}</span>
    </>
  );
}

describe("PlatformSessionProvider Neon profile-first identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    storeMock.sessionUsers = [];
    storeMock.storeIdentityConfirmed = false;
    storeMock.remoteSyncedForCurrentUser = false;
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

  it("discards the previous profile as soon as explicit logout removes the cache, even during auth hydration", () => {
    const { rerender } = render(<PlatformSessionProvider><Probe /></PlatformSessionProvider>);
    expect(screen.getByTestId("session-id")).toHaveTextContent(gatewayMock.authenticatedProfileId);
    window.localStorage.removeItem("sigapro.platform.session.v1");
    gatewayMock.authenticatedUserId = null as unknown as string;
    gatewayMock.authenticatedProfileId = null as unknown as string;
    gatewayMock.authenticatedRole = null as unknown as typeof gatewayMock.authenticatedRole;
    gatewayMock.authenticatedEmail = "";
    gatewayMock.authenticatedMunicipalityId = null as unknown as string;
    gatewayMock.authResolved = false;
    gatewayMock.loading = true;
    rerender(<PlatformSessionProvider><Probe /></PlatformSessionProvider>);
    expect(screen.getByTestId("session-id")).toHaveTextContent("unknown");
    gatewayMock.authResolved = true;
    gatewayMock.loading = false;
    rerender(<PlatformSessionProvider><Probe /></PlatformSessionProvider>);
    expect(screen.getByTestId("session-id")).toHaveTextContent("unknown");
    expect(window.localStorage.getItem("sigapro.platform.session.v1")).toBeNull();
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

describe("department identity and hydration", () => {
  it("ignores a prior store and accepts authoritative empty department without restoring stale permission", () => {
    gatewayMock.authenticatedUserId = "auth-current";
    gatewayMock.authenticatedProfileId = "profile-current";
    gatewayMock.authenticatedRole = "prefeitura_supervisor";
    gatewayMock.authenticatedEmail = "current@example.test";
    gatewayMock.authResolved = true;
    gatewayMock.loading = false;
    window.localStorage.clear();
    const cached = {id:"profile-current", role:"prefeitura_supervisor", department:"Análise", title:"Diretor de Análise", email:"current@example.test"};
    window.localStorage.setItem("sigapro.platform.session.v1", JSON.stringify(cached));
    storeMock.sessionUsers = [{...cached, role:"master_admin", department:"Financeiro"} as SessionUser];
    storeMock.storeIdentityConfirmed = false;
    storeMock.remoteSyncedForCurrentUser = false;
    const {rerender} = render(<PlatformSessionProvider><Probe/></PlatformSessionProvider>);
    expect(screen.getByTestId("session-role")).toHaveTextContent("prefeitura_supervisor");
    storeMock.storeIdentityConfirmed = true;
    storeMock.remoteSyncedForCurrentUser = true;
    storeMock.sessionUsers = [{...cached, department:"",title:""} as SessionUser];
    rerender(<PlatformSessionProvider><Probe/></PlatformSessionProvider>);
    expect(screen.getByTestId("session-department")).toHaveTextContent("none");
  });
});
