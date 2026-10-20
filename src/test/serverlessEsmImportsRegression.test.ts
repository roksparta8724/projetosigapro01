import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// Vercel runs these compiled API entrypoints as native Node ESM. In ESM,
// relative runtime imports MUST contain the .js extension of emitted files.
// The Vite browser build alone cannot detect extensionless serverless imports.
const serverlessSources = [
  "api/r2.ts",
  "api/mercadopago.ts",
  "server/api/r2-delete.ts",
  "server/api/r2-sign-get.ts",
  "server/api/r2-upload.ts",
];

function runtimeRelativeImports(path: string) {
  const input = readFileSync(resolve(process.cwd(), path), "utf8");
  const parsed = ts.createSourceFile(path, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return parsed.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return [];
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const specifier = statement.moduleSpecifier.text;
    return specifier.startsWith(".") ? [specifier] : [];
  });
}

describe("Node ESM compatibility of SIGAPRO Vercel functions", () => {
  it("runtime imports use explicit .js extensions and point to real TypeScript modules", () => {
    let checked = 0;
    for (const file of serverlessSources) {
      const imports = runtimeRelativeImports(file);
      expect(imports.length, `Expected runtime imports in ${file}`).toBeGreaterThan(0);
      for (const specifier of imports) {
        expect(specifier.endsWith(".js"), `Node ESM rejects ${file}: ${specifier}`).toBe(true);
        const tsTarget = resolve(process.cwd(), dirname(file), specifier.slice(0, -3) + ".ts");
        expect(existsSync(tsTarget), `Missing TypeScript source for ${file}: ${specifier}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it("emitted ESM JavaScript preserves explicitly resolvable module specifiers", () => {
    const file = "api/r2.ts";
    const output = ts.transpileModule(readFileSync(resolve(process.cwd(), file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const specifier of runtimeRelativeImports(file)) {
      expect(output).toContain(specifier);
    }
    expect(output).not.toContain('from "../server/api/r2-delete"');
  });
});
