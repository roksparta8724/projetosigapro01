import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const directRoutes = [
  "api/municipality-logo-open.ts",
  "api/legislation-open.ts",
  "server/api/profile-avatar-open.ts",
  "server/api/r2-master-logo-source.ts",
  "server/api/r2-sign-get.ts",
  "server/api/r2-list-user-files.ts",
  "server/api/r2-upload.ts",
  "server/api/r2-delete.ts",
];

describe("SIGAPRO — isolamento de todas as rotas R2 na prévia", () => {
  it.each(directRoutes)("mantém bloqueio antecipado em %s", path => {
    const source = readFileSync(path, "utf8");
    const entryPoint = source.indexOf("export default async function handler(");
    const guard = source.indexOf('process.env.VITE_SIGAPRO_NEON_ISOLATED === "true"', entryPoint);
    expect(entryPoint).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(entryPoint);
    expect(source.slice(guard, guard + 600)).toMatch(/res\.statusCode = 503|fail\(res, 503/);
    expect(source.slice(guard, guard + 650)).toContain("return;");
    for (const method of ["PutObjectCommand", "DeleteObjectCommand", "GetObjectCommand", "ListObjectsV2Command"]) {
      const execution = source.indexOf("new " + method + "(", entryPoint);
      if (execution >= 0) expect(guard).toBeLessThan(execution);
    }
  });
});
