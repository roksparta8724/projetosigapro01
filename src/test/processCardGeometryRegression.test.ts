import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/surface-polarity.css"),
  "utf8",
);

describe("process card visual rollback and stable geometry", () => {
  it("keeps process/document cards from growing or shifting on interaction", () => {
    expect(css).toContain("PROCESS CARD STABILITY LOCK V9");
    expect(css).toContain("transform: none !important");
    expect(css).toContain("scale: 1 !important");
    expect(css).toContain("[data-process-tabbar=\"true\"] button");
    expect(css).toContain("[data-checklist-status]");
  });

  it("keeps dark process surfaces readable without touching the topbar", () => {
    expect(css).toContain("#sig-process-document-command-center");
    expect(css).toContain("color: #ffffff !important");
    expect(css).not.toContain(".sig-premium-topbar {");
    expect(css).not.toContain(".sig-topbar-shell {");
  });
});
