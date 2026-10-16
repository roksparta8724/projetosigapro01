import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("protocol marker active contrast", () => {
  const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
  const css = read("src/index.css");
  const pageLayout = read("src/components/platform/PageLayout.tsx");

  it("treats the selected protocol filter as a marker, not as a navigation card", () => {
    expect(protocol).toContain('data-protocol-marker-active={markerFilter === "todos" ? "true" : "false"}');
    expect(protocol).toContain('aria-pressed={markerFilter === "todos"}');
    expect(protocol).toContain("sig-protocol-marker-label");
    expect(protocol).toContain("sig-protocol-marker-count");
    expect(protocol).toContain("sig-protocol-marker-icon");
  });

  it("moves the dark active state to whichever marker is selected", () => {
    expect(protocol).toContain("const markerActive = markerFilter === marker.id");
    expect(protocol).toContain('data-protocol-marker-active={markerActive ? "true" : "false"}');
    expect(protocol).toContain("<CheckCircle2");
  });

  it("forces readable light copy and icon only on the active marker", () => {
    expect(css).toContain("PROTOCOL MARKER ACTIVE CONTRAST — 2026-10-16");
    expect(css).toContain('.sig-protocol-marker[data-protocol-marker-active="true"]');
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("stroke: #dbeafe !important");
    expect(css).toContain("background: rgba(255,255,255,0.16) !important");
  });

  it("does not keep the previous broad navigation-card interpretation", () => {
    expect(pageLayout).not.toContain('data-contrast-card={active ? "dark" : "light"}');
    expect(css).not.toContain("SIGAPRO ACTIVE DARK NAV CONTRAST — FINAL 2026-10-16");
  });
});
