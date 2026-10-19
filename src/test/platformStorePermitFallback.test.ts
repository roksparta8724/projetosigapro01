import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"),
  "utf8",
);

describe("official platform store construction permit fallback", () => {
  it("does not take the whole official store offline when direct permit table read is unavailable", () => {
    const errorsBlock = source.slice(
      source.indexOf("const errors = ["),
      source.indexOf("].filter(Boolean);", source.indexOf("const errors = [")),
    );

    expect(errorsBlock).not.toContain("constructionPermitsResult.error");
    expect(source).toContain("constructionPermitRows");
    expect(source).toContain('db.rpc("get_construction_permit_v1"');
    expect(source).toContain("visibleProcessIds");
    expect(source).toContain("constructionPermitByProcess");
  });

  it("keeps the official permit data feeding process stage preservation", () => {
    expect(source).toContain("constructionPermit?.status === \"signed\"");
    expect(source).toContain('currentStage: constructionPermitStage || process.sla_stage');
    expect(source).toContain("constructionPermit");
    expect(source).toContain('"Alvará de Construção"');
  });
});
