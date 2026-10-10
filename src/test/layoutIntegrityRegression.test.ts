import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const saasDir = resolve(root, "src/pages/saas");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("layout integrity regression", () => {
  it("rejects top-level commas in arbitrary grid templates across SaaS pages", () => {
    const offenders: string[] = [];

    const hasTopLevelComma = (template: string) => {
      let depth = 0;
      for (const char of template) {
        if (char === "(") depth += 1;
        if (char === ")") depth = Math.max(0, depth - 1);
        if (char === "," && depth === 0) return true;
      }
      return false;
    };

    for (const file of readdirSync(saasDir)) {
      if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
      const source = readFileSync(resolve(saasDir, file), "utf8");
      const templates = Array.from(source.matchAll(/grid-cols-\[([^\]]+)\]/g), (match) => match[1]);
      if (templates.some(hasTopLevelComma)) offenders.push(file);
    }

    expect(offenders, `Invalid grid templates: ${offenders.join(", ")}`).toEqual([]);
  });

  it("expands single-content main grids instead of reserving a dead side column", () => {
    const pageLayout = read("src/components/platform/PageLayout.tsx");
    const css = read("src/index.css");
    const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
    const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(pageLayout).toContain("[&>*:only-child]:col-span-full");
    expect(css).toContain(".sig-main-grid > :only-child");
    expect(css).toContain("grid-column: 1 / -1 !important");
    expect(financeProtocols).toContain('PageMainGrid className="grid-cols-1 xl:grid-cols-1"');
    expect(settings).toContain('PageMainGrid className="mt-4 grid-cols-1 xl:grid-cols-1"');
    expect(detail).toContain("showPrimaryDetailColumn");
    expect(detail).toContain("showSecondaryDetailColumn");
    expect(detail).toContain("useSplitDetailLayout");
    expect(detail).toContain("[grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]");
  });

  it("keeps the shared app shell single-column until the sidebar leaves enough width", () => {
    const pageLayout = read("src/components/platform/PageLayout.tsx");
    expect(pageLayout).toContain(
      "xl:grid-cols-[minmax(0,2.45fr)_minmax(280px,0.84fr)]",
    );
    expect(pageLayout).not.toContain(
      "lg:grid-cols-[minmax(0,2.35fr)_minmax(260px,0.82fr)]",
    );
  });

  it("keeps process finance cards from compressing the PIX column", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    expect(detail).toContain(
      "min-[1560px]:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]",
    );
    expect(detail).toContain(
      "sm:grid-cols-[minmax(160px,200px)_minmax(0,1fr)]",
    );
    expect(detail).toContain("overflow-x-auto whitespace-nowrap");
    expect(detail).not.toContain("xl:grid-cols-[1.05fr,0.95fr]");
    expect(detail).not.toContain('className="mt-2 break-all text-xs text-slate-500"');
  });

  it("keeps finance subpages free from forced narrow PIX and early fixed widths", () => {
    const protocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
    const desk = read("src/pages/saas/FinanceDeskPage.tsx");

    expect(protocols).not.toContain("line-clamp-3 break-all");
    expect(protocols).toContain("overflow-x-auto whitespace-nowrap");
    expect(desk).not.toMatch(/\sxl:min-w-\[560px\]/);
    expect(desk).toContain("2xl:min-w-[560px]");
  });
});
