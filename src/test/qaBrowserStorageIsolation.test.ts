import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldIsolateQaStorage } from "../integrations/r2/qaNeonNative";

describe("SIGAPRO QA browser storage hard-fail",()=>{
  const source=readFileSync("src/integrations/r2/client.ts","utf8");
  it("rejects a missing Neon function before legacy upload/delete/read",()=>{
    expect(source).toContain("function requireQaNativeBase(): string");
    expect(source).toContain("if (isolatedQa) {\n    return uploadQaNative({base:requireQaNativeBase()");
    expect(source).toContain("if (isolatedQa) return readQaNative(requireQaNativeBase()");
    expect(source).toContain("if (isolatedQa) return deleteQaNative(requireQaNativeBase()");
  });
  it("never publishes an R2 object URL from the isolated QA browser",()=>{
    expect(source).toContain('if (isolatedQa) return ""; // QA documents must remain private.');
    expect(shouldIsolateQaStorage("projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app",false)).toBe(true);
  });
});
