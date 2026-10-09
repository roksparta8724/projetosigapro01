import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PermissionRoute } from "@/components/platform/PermissionRoute";

vi.mock("@/hooks/useAuthGateway", () => ({
  useAuthGateway: () => ({
    isAuthenticated: true,
    signOut: vi.fn(),
    authenticatedUserId: "daa16788-343c-45fe-a649-bbbce94d4798",
  }),
}));

vi.mock("@/hooks/useAppBootstrap", () => ({
  useAppBootstrap: () => ({
    isReady: false,
    authResolved: false,
    loading: true,
    authUserId: null,
    profile: null,
  }),
}));

vi.mock("@/hooks/usePlatformData", () => ({
  usePlatformData: () => ({ sessionUsers: [] }),
}));

vi.mock("@/hooks/usePlatformSession", () => ({
  usePlatformSession: () => ({
    session: {
      id: "17b9f386-cf7a-4f92-8646-e3944d28eb4f",
      role: "master_admin",
      email: "roksparta02@gmail.com",
      municipalityId: null,
      tenantId: null,
    },
  }),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({
    loading: true,
    mode: "root",
    municipalityId: null,
    inactive: false,
  }),
}));

vi.mock("@/lib/platform", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform")>("@/lib/platform");
  return {
    ...actual,
    can: () => true,
  };
});

describe("PermissionRoute stable authenticated rendering", () => {
  it.each(["default", "inverse-main"] as const)(
    "keeps the authorized page mounted during background revalidation in %s layout",
    (layoutMode) => {
      render(
        <div data-layout-mode={layoutMode}>
          <MemoryRouter>
            <PermissionRoute permission="view_master_dashboard">
              <div data-testid="protected-content">Master estável</div>
            </PermissionRoute>
          </MemoryRouter>
        </div>,
      );

      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
      expect(screen.queryByLabelText("Validando acesso")).not.toBeInTheDocument();
    },
  );
});
