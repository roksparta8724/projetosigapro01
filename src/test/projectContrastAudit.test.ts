import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function extractStaticClassNames(source: string) {
  return [...source.matchAll(/className=(?:"([^"]+)"|'([^']+)'|\`([^\`]+)\`)/g)]
    .map((match) => match[1] || match[2] || match[3] || "");
}

const root = resolve(process.cwd(), "src");
const files = walk(root).filter((file) => /\.(tsx|ts)$/.test(file) && !file.includes("/test/"));

describe("project-wide foreground/background contrast audit", () => {
  it("contains no direct same-element light-on-light or dark-on-dark utility combinations", () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const className of extractStaticClassNames(source)) {
        const lightSurface = /(?:^|\s)bg-(?:white|slate-(?:50|100)|gray-(?:50|100))(?:\s|\/|$)/.test(className);
        const lightText = /(?:^|\s)text-(?:white|slate-(?:50|100)|gray-(?:50|100))(?:\s|\/|$)/.test(className);
        const darkSurface = /(?:^|\s)bg-(?:black|slate-(?:900|950)|gray-(?:900|950))(?:\s|\/|$)/.test(className);
        const darkText = /(?:^|\s)text-(?:black|slate-(?:900|950)|gray-(?:900|950))(?:\s|\/|$)/.test(className);

        if ((lightSurface && lightText) || (darkSurface && darkText)) {
          violations.push(`${relative(process.cwd(), file)} :: ${className}`);
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
