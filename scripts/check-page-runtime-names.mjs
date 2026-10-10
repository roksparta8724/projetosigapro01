import ts from "typescript";
import path from "node:path";

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.app.json");
if (!configPath) {
  console.error("tsconfig.app.json não encontrado");
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });

const fatalCodes = new Set([2304, 2307, 2552]);
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter((diagnostic) => {
    const fileName = diagnostic.file?.fileName?.replaceAll("\\", "/") || "";
    return fileName.includes("/src/pages/saas/") && fatalCodes.has(diagnostic.code);
  });

if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}

console.log("Page runtime name check: PASS");
