import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstitutionalLogo } from "@/components/platform/InstitutionalLogo";
import type { InstitutionalBranding } from "@/lib/institutionBranding";

const branding: InstitutionalBranding = {
  tenantId: "municipality-a",
  logoUrl: "/municipality-a-logo.png",
  logoScale: 2,
  logoOffsetX: 40,
  logoOffsetY: -20,
  logoAlt: "Logo da prefeitura A",
  logoUpdatedAt: "",
  logoUpdatedBy: "",
  logoFrameMode: "rounded",
  logoFitMode: "cover",
};

describe("InstitutionalLogo", () => {
  it("keeps the entire municipal logo inside a fixed card without crop transforms", () => {
    const { container } = render(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="header" />);
    const image = screen.getByRole("img", { name: "Logo da prefeitura A" });

    expect(container.firstChild).toHaveClass("overflow-hidden", "h-[112px]", "w-[188px]");
    expect(image).toHaveClass("object-contain", "object-center");
    expect(image).not.toHaveStyle({ transform: expect.anything() });
  });

  it("uses a neutral municipal fallback, never the SIGAPRO mark", () => {
    const { rerender } = render(<InstitutionalLogo branding={{ ...branding, logoUrl: "" }} fallbackLabel="Prefeitura A" variant="footer" />);
    expect(screen.getByRole("img", { name: "Prefeitura A" })).toBeInTheDocument();
    expect(screen.queryByText("SIGAPRO")).not.toBeInTheDocument();

    rerender(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="footer" />);
    fireEvent.error(screen.getByRole("img", { name: "Logo da prefeitura A" }));
    expect(screen.getByRole("img", { name: "Prefeitura A" })).toBeInTheDocument();
    expect(screen.queryByText("SIGAPRO")).not.toBeInTheDocument();
  });

  it("uses the official local asset for an unconfigured master logo", () => {
    const { container } = render(<InstitutionalLogo branding={{ ...branding, tenantId: "master", logoUrl: "" }} fallbackLabel="SIGAPRO" />);
    const image = screen.getByRole("img", { name: "Logo da prefeitura A" });
    expect(image).toHaveAttribute("src", expect.stringContaining("sigapro-logo.png"));
    expect(image).toHaveClass("mix-blend-screen", "object-contain");
    expect(image).toHaveStyle({ transform: `translate(${40 * 128 / 160}px, ${-20 * 128 / 160}px) scale(2)` });
    expect(container.firstChild).toHaveClass("bg-transparent");
    expect(container.firstChild).not.toHaveClass("bg-white", "p-4", "border");
  });

  it("renders the master footer crop in a proportional square without a white card", () => {
    const { container } = render(<InstitutionalLogo branding={{ ...branding, tenantId: "master" }} variant="footer" />);
    const image = screen.getByRole("img", { name: "Logo da prefeitura A" });
    expect(container.firstChild).toHaveClass("h-[144px]", "w-[144px]", "bg-transparent");
    expect(image).toHaveClass("object-contain", "mix-blend-screen");
    expect(image).toHaveStyle({ transform: `translate(${40 * 144 / 160}px, ${-20 * 144 / 160}px) scale(2)` });
  });

  it("retains a valid logo while replacing it, but never across municipalities", () => {
    const { container, rerender } = render(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" />);
    rerender(<InstitutionalLogo branding={{ ...branding, logoUrl: "/new-logo.png" }} fallbackLabel="Prefeitura A" />);
    expect(screen.getByRole("img", { name: "Logo da prefeitura A" })).toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
    fireEvent.load(container.querySelector('img[aria-hidden="true"]')!);
    expect(screen.getByRole("img", { name: "Logo da prefeitura A" })).toHaveAttribute("src", expect.stringContaining("/new-logo.png"));

    rerender(<InstitutionalLogo branding={{ ...branding, tenantId: "municipality-b", logoUrl: "/municipality-b-logo.png" }} fallbackLabel="Prefeitura B" />);
    expect(screen.getByRole("img", { name: "Logo da prefeitura A" })).toHaveAttribute("src", expect.stringContaining("/municipality-b-logo.png"));
  });

  it("keeps the previous municipal logo if a replacement fails to load", () => {
    const { container, rerender } = render(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" />);
    rerender(<InstitutionalLogo branding={{ ...branding, logoUrl: "/broken-logo.png" }} fallbackLabel="Prefeitura A" />);
    fireEvent.error(container.querySelector('img[aria-hidden="true"]')!);
    expect(screen.getByRole("img", { name: "Logo da prefeitura A" })).toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
  });
});
