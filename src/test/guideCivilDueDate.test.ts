import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {isGuideOverdueOnBrazilDate,parseGuideCivilDueDate} from "@/lib/guideCivilDueDate";
describe("SIGAPRO bank due date remains valid through the day in Brazil",()=>{
  it("does not mark a guide expired before local midnight",()=>{
    expect(isGuideOverdueOnBrazilDate("2026-10-27",new Date("2026-10-28T01:59:00Z"))).toBe(false);
    expect(isGuideOverdueOnBrazilDate("2026-10-27",new Date("2026-10-28T03:00:00Z"))).toBe(true);
  });
  it("does not interpret a UTC midnight ISO timestamp as expiration",()=>{
    expect(isGuideOverdueOnBrazilDate("2026-10-27T00:00:00.000Z",new Date("2026-10-27T13:00:00Z"))).toBe(false);
  });
  it("understands DD/MM/YYYY and actual leap days",()=>{
    expect(parseGuideCivilDueDate("31/10/2026")).toBe("2026-10-31");
    expect(parseGuideCivilDueDate("29/02/2028")).toBe("2028-02-29");
    expect(parseGuideCivilDueDate("29/02/2026")).toBeNull();
    expect(isGuideOverdueOnBrazilDate("31/10/2026",new Date("2026-11-01T04:00:00Z"))).toBe(true);
  });
  it("does not invent overdue status for missing or invalid historic dates",()=>{
    for(const v of ["","Invalid Date","32/10/2026","2026-02-30","2026-13-01"])
      expect(isGuideOverdueOnBrazilDate(v,new Date("2026-11-01T04:00:00Z"))).toBe(false);
  });
  it("protects compensated guides and sandbox issuer from reissuing a paid charge",()=>{
    const page=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
    expect(page).toContain('if (isGuideSettled(guide)) return "compensada"');
    expect(page).toContain('if (isGuideOverdueOnBrazilDate(guide.dueDate)) return "vencida"');
    expect(page).toContain("!isGuideSettled(guide)");
    expect(page).not.toContain("const due = new Date(guide.dueDate)");
  });
});
