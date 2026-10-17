import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });
  it("keeps the entire municipal logo inside a fixed card without crop transforms", () => {
    const { container } = render(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="header" />);
    const image = screen.getByRole("img", { name: "Logo da prefeitura A" });

    expect(container.firstChild).toHaveClass("overflow-hidden", "h-[112px]", "w-[188px]");
    expect(image).toHaveClass("object-contain", "object-center");
    expect(image).not.toHaveStyle({ transform: expect.anything() });
  });


  it("keeps municipal footer and preview logos fully visible without saved crop transforms", () => {
    const footer = render(
      <InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="footer" />,
    );
    const footerImage = screen.getByRole("img", { name: "Logo da prefeitura A" });
    expect(footerImage).toHaveClass("object-contain", "object-center");
    expect(footerImage).not.toHaveStyle({ transform: expect.anything() });
    footer.unmount();

    render(
      <InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="preview" />,
    );
    const previewImage = screen.getByRole("img", { name: "Logo da prefeitura A" });
    expect(previewImage).toHaveClass("object-contain", "object-center");
    expect(previewImage).not.toHaveStyle({ transform: expect.anything() });
  });

  it("never hides a valid logo behind opacity or a white loading skeleton", () => {
    const { container } = render(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="header" />);
    const image = screen.getByRole("img", { name: "Logo da prefeitura A" });

    expect(image).not.toHaveClass("opacity-0");
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
    expect(image).toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
  });

  it("reuses the last successfully loaded logo immediately after remount", () => {
    const first = render(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="header" />);
    const firstImage = screen.getByRole("img", { name: "Logo da prefeitura A" });
    fireEvent.load(firstImage);
    first.unmount();

    render(
      <InstitutionalLogo
        branding={{ ...branding, logoUrl: "" }}
        fallbackLabel="Prefeitura A"
        variant="header"
      />,
    );

    const restored = screen.getByRole("img", { name: "Logo da prefeitura A" });
    expect(restored).toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
    expect(restored).not.toHaveClass("opacity-0");
  });

  it("uses a neutral municipal fallback after the hydration guard, never the SIGAPRO mark", () => {
    vi.useFakeTimers();
    const { rerender } = render(<InstitutionalLogo branding={{ ...branding, logoUrl: "" }} fallbackLabel="Prefeitura A" variant="footer" />);

    // Evita o flash "Prefeitura" durante a hidratação do branding no F5.
    expect(screen.queryByRole("img", { name: "Prefeitura A" })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("img", { name: "Prefeitura A" })).toBeInTheDocument();
    expect(screen.queryByText("SIGAPRO")).not.toBeInTheDocument();

    rerender(<InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" variant="footer" />);
    fireEvent.error(screen.getByRole("img", { name: "Logo da prefeitura A" }));
    act(() => vi.advanceTimersByTime(500));
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

  it("retains a valid logo while replacing it without mounting a hidden preload image", () => {
    const probes: Array<{
      onload: null | (() => void);
      onerror: null | (() => void);
      src: string;
      decoding: string;
      complete: boolean;
      naturalWidth: number;
    }> = [];
    const OriginalImage = window.Image;
    class ProbeImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      src = "";
      decoding = "auto";
      complete = false;
      naturalWidth = 0;
      constructor() {
        probes.push(this);
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, writable: true, value: ProbeImage });

    try {
      const { container, rerender } = render(
        <InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" />,
      );
      const firstImage = screen.getByRole("img", { name: "Logo da prefeitura A" });
      fireEvent.load(firstImage);

      rerender(
        <InstitutionalLogo
          branding={{ ...branding, logoUrl: "/new-logo.png" }}
          fallbackLabel="Prefeitura A"
        />,
      );

      expect(screen.getByRole("img", { name: "Logo da prefeitura A" }))
        .toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
      expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();
      expect(container.querySelectorAll("img")).toHaveLength(1);

      act(() => probes[probes.length - 1]?.onload?.());

      expect(screen.getByRole("img", { name: "Logo da prefeitura A" }))
        .toHaveAttribute("src", expect.stringContaining("/new-logo.png"));
    } finally {
      Object.defineProperty(window, "Image", { configurable: true, writable: true, value: OriginalImage });
    }
  });

  it("keeps the loaded municipal logo when branding temporarily loses its URL", () => {
    const { rerender } = render(
      <InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" />,
    );
    const image = screen.getByRole("img", { name: "Logo da prefeitura A" });
    fireEvent.load(image);

    rerender(
      <InstitutionalLogo
        branding={{ ...branding, logoUrl: "" }}
        fallbackLabel="Prefeitura A"
      />,
    );

    expect(screen.getByRole("img", { name: "Logo da prefeitura A" }))
      .toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
    expect(screen.queryByText("Prefeitura")).not.toBeInTheDocument();
  });

  it("keeps the cached official logo instead of flashing the coat of arms during F5 hydration", () => {
    const brandedWithCrest = {
      ...branding,
      fallbackLogoUrl: "/municipality-a-crest.png",
    };

    const first = render(
      <InstitutionalLogo branding={brandedWithCrest} fallbackLabel="Prefeitura A" />,
    );
    fireEvent.load(screen.getByRole("img", { name: "Logo da prefeitura A" }));
    first.unmount();

    const hydrated = render(
      <InstitutionalLogo
        branding={{ ...brandedWithCrest, logoUrl: "" }}
        fallbackLabel="Prefeitura A"
      />,
    );

    expect(screen.getByRole("img", { name: "Logo da prefeitura A" }))
      .toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));

    hydrated.rerender(
      <InstitutionalLogo branding={brandedWithCrest} fallbackLabel="Prefeitura A" />,
    );

    expect(screen.getByRole("img", { name: "Logo da prefeitura A" }))
      .toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
  });

  it("keeps the previous municipal logo if an off-DOM replacement probe fails", () => {
    const probes: Array<{
      onload: null | (() => void);
      onerror: null | (() => void);
      src: string;
      decoding: string;
      complete: boolean;
      naturalWidth: number;
    }> = [];
    const OriginalImage = window.Image;
    class ProbeImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      src = "";
      decoding = "auto";
      complete = false;
      naturalWidth = 0;
      constructor() {
        probes.push(this);
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, writable: true, value: ProbeImage });

    try {
      const { container, rerender } = render(
        <InstitutionalLogo branding={branding} fallbackLabel="Prefeitura A" />,
      );
      const firstImage = screen.getByRole("img", { name: "Logo da prefeitura A" });
      fireEvent.load(firstImage);

      rerender(
        <InstitutionalLogo
          branding={{ ...branding, logoUrl: "/broken-logo.png" }}
          fallbackLabel="Prefeitura A"
        />,
      );

      expect(container.querySelectorAll("img")).toHaveLength(1);
      act(() => probes[probes.length - 1]?.onerror?.());

      expect(screen.getByRole("img", { name: "Logo da prefeitura A" }))
        .toHaveAttribute("src", expect.stringContaining("/municipality-a-logo.png"));
    } finally {
      Object.defineProperty(window, "Image", { configurable: true, writable: true, value: OriginalImage });
    }
  });
});
