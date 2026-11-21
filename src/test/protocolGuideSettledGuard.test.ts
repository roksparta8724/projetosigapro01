import { describe, expect, it } from "vitest";
import { isGuideSettled } from "@/lib/guideOriginal";

describe("pre-protocol cannot reopen once the original banking guide is settled",()=>{
  it.each(["compensada","paid","pago","confirmed","confirmado"," CONFIRMADO "])(
    "denies draft editing for compensated status %s", status => {
      expect(isGuideSettled({status})).toBe(true);
    }
  );
  it("treats authoritative paid flag as settled even with legacy status",()=>{
    expect(isGuideSettled({status:"pending",paid:true})).toBe(true);
  });
  it("does not make pending, cancelled or absent guide into a paid one",()=>{
    expect(isGuideSettled({status:"pending",paid:false})).toBe(false);
    expect(isGuideSettled({status:"cancelled",paid:false})).toBe(false);
    expect(isGuideSettled(null)).toBe(false);
  });
});
