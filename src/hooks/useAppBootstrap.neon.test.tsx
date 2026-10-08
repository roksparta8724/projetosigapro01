import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrapProvider, useAppBootstrap } from "@/hooks/useAppBootstrap";

const neonMock = vi.hoisted(() => {
  const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
  const profileId = "d5434b4e-e1f5-46fd-a95c-dedc9631d9d2";
  const authUser = {
    id: "f0a659b0-395f-48ad-a29f-70362d9cf4a6",
    email: "prefeitura@example.test",
    app_metadata: {},
    user_metadata: {},
  };
  let listener: ((event: string, session: { user: typeof authUser } | null) => unknown) | null = null;

  const makeMembershipBuilder = () => {
    const result = {
      data: [{
        tenant_id: municipalityId,
        role_id: "ad993d53-631d-4640-802e-76bb310ce8c7",
        level_name: "Nivel 3",
        is_active: true,
        deleted_at: null,
      }],
      error: null,
    };
    const builder: any = {
      is: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  };

  const client: any = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(async () => ({
        data: { user: authUser, session: { user: authUser } },
        error: null,
      })),
      onAuthStateChange: vi.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "current_profile_id") return { data: profileId, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: profileId,
                    role: "prefeitura_admin",
                    municipality_id: municipalityId,
                    account_status: "active",
                    email: authUser.email,
                    full_name: "Prefeitura Admin",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "tenant_memberships") {
        return { select: () => makeMembershipBuilder() };
      }
      if (table === "roles") {
        return {
          select: () => ({
            in: async () => ({
              data: [{
                id: "ad993d53-631d-4640-802e-76bb310ce8c7",
                code: "prefeitura_admin",
              }],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  const accountClient = {
    requestPasswordReset: vi.fn(async () => ({ data: { status: true }, error: null })),
    resetPassword: vi.fn(async () => ({ data: { status: true }, error: null })),
    changePassword: vi.fn(async () => ({ data: { status: true }, error: null })),
    changeEmail: vi.fn(async () => ({ data: { status: true }, error: null })),
  };

  return { client, accountClient, authUser, profileId, municipalityId };
});

vi.mock("@/integrations/backend/databaseClient", () => ({
  hasBackendEnv: true,
  backendClient: neonMock.client,
  neonAccountClient: neonMock.accountClient,
}));
vi.mock("@/integrations/backend/config", () => ({
  isNeonBackend: true,
  isSupabaseBackend: false,
  backendMode: "neon",
}));
vi.mock("@/lib/tenant", () => ({
  resolveTenantFromLocation: () => ({
    hostname: "sigapromunicipal.com.br",
    mode: "platform",
    subdomain: null,
    isLocalhost: false,
  }),
}));
vi.mock("@/integrations/supabase/municipality", () => ({
  loadCurrentMunicipalityBundle: vi.fn(async () => null),
  loadMunicipalityBundleById: vi.fn(async (id: string) => ({
    municipality: { id },
    branding: null,
    settings: null,
  })),
}));
vi.mock("@/integrations/supabase/platform", () => ({
  registerRemoteExternalAccount: vi.fn(),
  registerRemoteOwnerAccount: vi.fn(),
}));

function Probe() {
  const { signIn, resetPassword, updatePassword, authUserId, role, profile } = useAppBootstrap();
  const [status, setStatus] = useState("idle");
  return (
    <>
      <button onClick={async () => setStatus((await signIn(neonMock.authUser.email, "password")).ok ? "signed-in" : "failed")}>
        Sign in Neon
      </button>
      <span>{status}</span>
      <span data-testid="auth-id">{authUserId ?? "none"}</span>
      <span data-testid="role">{role ?? "none"}</span>
      <span data-testid="profile-role">{profile?.role ?? "none"}</span>
      <span data-testid="profile-id">{profile?.userId ?? "none"}</span>
      <button onClick={async () => setStatus((await resetPassword("USER@Example.Test")).ok ? "reset-requested" : "reset-failed")}>
        Reset Neon
      </button>
      <button onClick={async () => setStatus((await updatePassword("NovaSenha123!")).ok ? "password-reset" : "password-failed")}>
        Apply reset
      </button>
    </>
  );
}

describe("AppBootstrapProvider Neon-first login", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("resolves the authenticated Neon subject through current_profile_id", async () => {
    render(
      <AppBootstrapProvider>
        <Probe />
      </AppBootstrapProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in Neon" }));

    expect(await screen.findByText("signed-in")).toBeInTheDocument();
    expect(screen.getByTestId("auth-id")).toHaveTextContent(neonMock.authUser.id);
    expect(screen.getByTestId("role")).toHaveTextContent("prefeitura_admin");
    expect(screen.getByTestId("profile-role")).toHaveTextContent("prefeitura_admin");
    expect(screen.getByTestId("profile-id")).toHaveTextContent(neonMock.profileId);
    expect(neonMock.client.rpc).toHaveBeenCalledWith("current_profile_id");
  });
  it("uses the Neon password recovery contract with redirect token flow", async () => {
    window.history.replaceState(null, "", "/recuperar-senha?token=valid-reset-token");

    render(
      <AppBootstrapProvider>
        <Probe />
      </AppBootstrapProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset Neon" }));
    expect(await screen.findByText("reset-requested")).toBeInTheDocument();
    expect(neonMock.accountClient.requestPasswordReset).toHaveBeenCalledWith({
      email: "user@example.test",
      redirectTo: `${window.location.origin}/recuperar-senha`,
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply reset" }));
    expect(await screen.findByText("password-reset")).toBeInTheDocument();
    expect(neonMock.accountClient.resetPassword).toHaveBeenCalledWith({
      newPassword: "NovaSenha123!",
      token: "valid-reset-token",
    });
  });
});
