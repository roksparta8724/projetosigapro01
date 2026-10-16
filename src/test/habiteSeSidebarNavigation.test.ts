import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Habite-se sidebar navigation", () => {
  const frame = read("src/components/platform/PortalFrame.tsx");
  const sidebar = read("src/components/platform/AppSidebar.tsx");

  it("shows Habite-se as an explicit child of Processos in the lateral menu", () => {
    expect(frame).toContain(
      '{ to: "/externo/habite-se", label: "Habite-se", icon: FileText }',
    );
  });

  it("uses the current child route to activate both the child indicator and its parent group", () => {
    expect(sidebar).toContain(
      "const isChildActive = item.children?.some((child) => isRouteActive(pathname, child.to))",
    );
    expect(sidebar).toContain(
      "const parentActive = hasChildren ? isParentActive(pathname, item.to) || isChildActive : isExactActive",
    );
    expect(sidebar).toContain(
      'childActive ? darkSurface',
    );
    expect(sidebar).toContain(
      'childActive\n                                        ? darkSurface',
    );
  });
});
