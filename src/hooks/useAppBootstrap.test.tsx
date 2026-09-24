import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrapProvider, useAppBootstrap } from "@/hooks/useAppBootstrap";

const authMock = vi.hoisted(() => {
  const user = {
    id: "e2388f6b-7473-48d1-b30b-fcc1117ea80e",
    email: "account@example.test",
    app_metadata: { role: "master_admin" },
  };
  let listener: ((event: string, session: { user: typeof user } | null) => unknown) | null = null;

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
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
                data: [{ user_id: user.id, role: "master_admin", municipality_id: null, email: user.email, full_name: "Account" }],
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

  return { client, user, emit: (event: string, session: { user: typeof user } | null) => listener?.(event, session) };
});

vi.mock("@/integrations/supabase/client", () => ({ hasSupabaseEnv: true, supabase: authMock.client }));
vi.mock("@/lib/tenant", () => ({
  resolveTenantFromLocation: () => ({
    hostname: "sigapromunicipal.com.br",
    mode: "platform",
    subdomain: null,
    isLocalhost: false,
  }),
}));
vi.mock("@/integrations/supabase/municipality", () => ({
  loadCurrentMunicipalityBundle: vi.fn(),
  loadMunicipalityBundleById: vi.fn(),
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
});
