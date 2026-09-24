import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrapProvider, useAppBootstrap } from "@/hooks/useAppBootstrap";

const authMock = vi.hoisted(() => {
  const tenantId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
  let mode = "platform";
  let profileRole: string | null = "master_admin";
  let profileMunicipalityId: string | null = null;
  let hostMunicipalityId = tenantId;
  const user = {
    id: "e2388f6b-7473-48d1-b30b-fcc1117ea80e",
    email: "account@example.test",
    app_metadata: { role: "master_admin" },
    user_metadata: { role: "profissional_externo", tenant_id: tenantId, full_name: "Account" },
  };
  let listener: ((event: string, session: { user: typeof user } | null) => unknown) | null = null;

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(async () => {
        const callbackResult = listener?.("SIGNED_IN", { user });
        if (callbackResult !== undefined) throw new Error("Auth callback must be synchronous");
        return { data: { user }, error: null };
      }),
      onAuthStateChange: vi.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: profileRole === null && !profileMunicipalityId ? [] : [{ user_id: user.id, role: profileRole, municipality_id: profileMunicipalityId, email: user.email, full_name: "Account" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "tenant_memberships") {
        return { select: () => ({ eq: () => ({ is: () => ({ eq: async () => ({ data: [], error: null }) }) }) }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    client,
    user,
    tenantId,
    get hostMunicipalityId() { return hostMunicipalityId; },
    set hostMunicipalityId(value: string) { hostMunicipalityId = value; },
    get mode() { return mode; },
    set mode(value: string) { mode = value; },
    setProfile(role: string | null, municipalityId: string | null) {
      profileRole = role;
      profileMunicipalityId = municipalityId;
    },
    emit: (event: string, session: { user: typeof user } | null) => listener?.(event, session),
  };
});

const registrationMock = vi.hoisted(() => ({
  external: vi.fn(async () => {
    authMock.setProfile("profissional_externo", authMock.tenantId);
  }),
  owner: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ hasSupabaseEnv: true, supabase: authMock.client }));
vi.mock("@/lib/tenant", () => ({
  resolveTenantFromLocation: () => ({
    hostname: authMock.mode === "tenant" ? "campolimpopaulista.sigapromunicipal.com.br" : "sigapromunicipal.com.br",
    mode: authMock.mode,
    subdomain: authMock.mode === "tenant" ? "campolimpopaulista" : null,
    isLocalhost: false,
  }),
}));
vi.mock("@/integrations/supabase/municipality", () => ({
  loadCurrentMunicipalityBundle: vi.fn(async () => ({ municipality: { id: authMock.hostMunicipalityId } })),
  loadMunicipalityBundleById: vi.fn(),
}));
vi.mock("@/integrations/supabase/platform", () => ({
  registerRemoteExternalAccount: registrationMock.external,
  registerRemoteOwnerAccount: registrationMock.owner,
}));

function LoginProbe() {
  const { signIn, loading, authUserId } = useAppBootstrap();
  const [status, setStatus] = useState("idle");

  return (
    <>
      <button onClick={async () => setStatus((await signIn(authMock.user.email, "password")).ok ? "signed-in" : "failed")}>
        Sign in
      </button>
      <span>{status}</span>
      <span data-testid="loading-state">{loading ? "loading" : "ready"}</span>
      <span data-testid="auth-user-id">{authUserId ?? "none"}</span>
    </>
  );
}

describe("AppBootstrapProvider login", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    authMock.mode = "platform";
    authMock.hostMunicipalityId = authMock.tenantId;
    authMock.user.app_metadata.role = "master_admin";
    authMock.setProfile("master_admin", null);
  });

  it("does not await Supabase calls inside the auth callback", async () => {
    render(
      <AppBootstrapProvider>
        <LoginProbe />
      </AppBootstrapProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("signed-in")).toBeInTheDocument();
    expect(authMock.client.auth.signInWithPassword).toHaveBeenCalledOnce();
  });

  it("ends validation when the auth request fails", async () => {
    authMock.client.auth.signInWithPassword.mockRejectedValueOnce(new Error("Network unavailable"));
    render(
      <AppBootstrapProvider>
        <LoginProbe />
      </AppBootstrapProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.getByTestId("loading-state")).toHaveTextContent("ready");
  });

  it("loads a session event after the synchronous callback returns", async () => {
    render(
      <AppBootstrapProvider>
        <LoginProbe />
      </AppBootstrapProvider>,
    );

    await act(async () => {
      expect(authMock.emit("SIGNED_IN", { user: authMock.user })).toBeUndefined();
    });

    expect(await screen.findByText(authMock.user.id)).toBeInTheDocument();
  });

  it("links an email-confirmed external signup on its municipality subdomain", async () => {
    authMock.mode = "tenant";
    authMock.user.app_metadata.role = "profissional_externo";
    authMock.setProfile(null, null);
    render(
      <AppBootstrapProvider>
        <LoginProbe />
      </AppBootstrapProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("signed-in")).toBeInTheDocument();
    expect(registrationMock.external).toHaveBeenCalledWith(expect.objectContaining({ tenantId: authMock.tenantId }));
  });

  it("does not link a signup on a different municipality subdomain", async () => {
    authMock.mode = "tenant";
    authMock.hostMunicipalityId = "a1ee0596-b385-440e-bd38-07c9d9547705";
    authMock.user.app_metadata.role = "profissional_externo";
    authMock.setProfile(null, null);
    render(
      <AppBootstrapProvider>
        <LoginProbe />
      </AppBootstrapProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(registrationMock.external).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-user-id")).toHaveTextContent("none");
  });
});
