import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function listServerlessFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) return listServerlessFiles(full);
    return /\.(ts|js|mjs|cjs)$/.test(entry) ? [full] : [];
  });
}

describe("Vercel Hobby serverless function budget", () => {
  it("keeps the project at or below 12 serverless functions", () => {
    const files = listServerlessFiles(resolve(process.cwd(), "api"));
    expect(
      files.length,
      `Vercel Hobby aceita no máximo 12 Serverless Functions; encontradas ${files.length}:\n${files.join("\n")}`,
    ).toBeLessThanOrEqual(12);
  });
});
