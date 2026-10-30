import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Regression for Vercel ERR_MODULE_NOT_FOUND in compiled Node ESM functions.
 * Do not enumerate a hand-picked subset: every runtime file in api/ and server/
 * must be covered, including transitive R2/municipal storage/payment modules.
 */
function runtimeSources(directory: string): string[] {
  return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSources(relativePath);
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /(?:\.test|\.spec|\.d)\.tsx?$/.test(entry.name)) return [];
    return [relativePath];
  });
}

function emittedRelativeImports(path: string) {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  // transpileModule removes type-only imports; checking the emitted code
  // prevents false positives on erased type declarations.
  const output = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const parsed = ts.createSourceFile(path.replace(/\.tsx?$/, ".js"), output, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) &&
               node.expression.kind === ts.SyntaxKind.ImportKeyword &&
               node.arguments.length === 1 &&
               ts.isStringLiteral(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return imports.filter((specifier) => specifier.startsWith("."));
}

describe("Vercel Node ESM import graph — every API and server module", () => {
  it("has resolvable explicit .js imports throughout the complete runtime graph", () => {
    const files = [...runtimeSources("api"), ...runtimeSources("server")];
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files).toContain(join("server", "api", "r2-list-user-files.ts"));
    expect(files).toContain(join("server", "municipal-payment.ts"));
    expect(files).toContain(join("api", "storage-connection.ts"));

    let totalRuntimeImports = 0;
    for (const file of files) {
      for (const specifier of emittedRelativeImports(file)) {
        expect(specifier.endsWith(".js"), `ERR_MODULE_NOT_FOUND in ${file}: ${specifier}`).toBe(true);
        const sourceTarget = resolve(process.cwd(), dirname(file), specifier.slice(0, -3) + ".ts");
        expect(existsSync(sourceTarget), `Missing local module for ${file}: ${specifier}`).toBe(true);
        totalRuntimeImports += 1;
      }
    }
    expect(totalRuntimeImports).toBeGreaterThanOrEqual(13);
  });

  it("covers all three storage and payment regressions that broke production", () => {
    expect(emittedRelativeImports(join("server", "api", "r2-list-user-files.ts"))).toContain("../municipal-storage.js");
    expect(emittedRelativeImports(join("server", "municipal-payment.ts"))).toContain("./municipal-storage.js");
    expect(emittedRelativeImports(join("api", "storage-connection.ts"))).toContain("../server/municipal-storage.js");
  });
});
