import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO QA Vercel storage route contract", () => {
  const config=JSON.parse(readFileSync("vercel.json","utf8")) as {
    rewrites: Array<{source:string;destination:string}>;
  };
  const rewrites=new Map(config.rewrites.map(x=>[x.source,x.destination]));
  it.each([
    ["/api/r2-upload","/api/r2?action=upload"],
    ["/api/r2-sign-get","/api/r2?action=sign-get"],
    ["/api/r2-delete","/api/r2?action=delete"],
  ])("keeps %s routed through the pinned QA storage adapter", (path,dest) => {
    expect(rewrites.get(path)).toBe(dest);
  });
  it("puts storage rewrites before the generic API rewrite", () => {
    const generic=config.rewrites.findIndex(r=>r.source==="/api/(.*)");
    for(const path of ["/api/r2-upload","/api/r2-sign-get","/api/r2-delete"]) {
      expect(config.rewrites.findIndex(r=>r.source===path)).toBeLessThan(generic);
    }
  });
});
