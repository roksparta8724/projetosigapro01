import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("F5 without intermediate pages — SIGAPRO V7", () => {
  it("normal route refresh never renders a full-screen waiting page", () => {
    const { container } = render(<SecureRoutePending surface="route" />);
    const pending = screen.getByRole("status");
    expect(pending).toHaveAttribute("data-sigapro-route-pending", "route");
    expect(pending).toHaveClass("sr-only");
    expect(container.querySelector("main")).toBeNull();
    expect(screen.queryByText("Abrindo módulo…")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("document access resolves silently while still withholding protected content", () => {
    const { container } = render(<SecureRoutePending surface="document" title="Documento protegido" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-sigapro-route-pending", "document");
    expect(container.querySelector("main")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("slow network shows only a small recoverable notice, never an overlaying app shell", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<SecureRoutePending surface="route" />);
      act(() => vi.advanceTimersByTime(8999));
      expect(screen.queryByRole("alert")).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole("alert")).toHaveAttribute("data-sigapro-recovery-notice", "compact");
      expect(container.querySelector("main")).toBeNull();
      expect(container.querySelector('[class*="min-h-screen"]')).toBeNull();
      expect(screen.getByRole("button",{name:"Recarregar"})).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("all three original interstitial sources are removed or reduced to nonmodal status", () => {
    const html = read("index.html");
    const app = read("src/App.tsx");
    const guard = read("src/components/platform/PermissionRoute.tsx");
    const plan = read("src/components/platform/PlanModuleRoute.tsx");
    const pending = read("src/components/platform/SecureRoutePending.tsx");
    expect(html).toContain('}, 15000);');
    expect(html).toContain("inset: auto 16px 16px auto;");
    expect(html).not.toContain('}, 2000);');
    expect(html).toContain('data-sigapro-initial-render="true"');
    expect(app).toContain('<Suspense fallback={<SecureRoutePending surface="route"');
    expect(guard).toContain("if (isInitialAccessResolution)");
    expect(guard).toContain("hasValidRefreshContinuity()");
    expect(plan).toContain("if (entitlements.isResolving)");
    expect(plan).toContain("hasValidRefreshContinuity()");
    expect(pending).toContain('className="sr-only"');
    expect(pending).toContain("data-sigapro-recovery-notice");
    expect(pending).not.toContain("min-h-screen");
    expect(pending).not.toContain("min-h-[100dvh]");
  });
  it("real authorization failures and unexpected app exceptions remain independently handled", () => {
    expect(read("src/components/platform/AppErrorBoundary.tsx")).toContain("Não foi possível abrir esta página");
    expect(read("src/components/platform/PermissionRoute.tsx")).toContain("Conta bloqueada administrativamente");
    expect(read("src/components/platform/PlanModuleRoute.tsx")).toContain("Módulo indisponível para esta Prefeitura");
    expect(read("src/main.tsx")).toContain("renderBootstrapFailure(error)");
    expect(read("src/main.tsx")).toContain("persistRefreshContinuity();");
  });
});
