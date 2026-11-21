import { describe, expect, it } from "vitest";
import { describePendingAnalystCa } from "@/lib/urbanLegalMatrixReview";
import type { UrbanMatrixAnalystGuidance } from "@/integrations/backend/urbanPrecheckClient";

const guidance: UrbanMatrixAnalystGuidance = {
  row_index: 21,
  field_code: "ca_minimo_original",
  proposed_value: 1,
  original_ocr_text: "01",
  attribution: "reported_by_user_as_analyst_guidance",
  source_note: "Relato de orientação técnica, pendente de confirmação documental",
  status: "pending_documentary_confirmation",
  created_at: "2026-11-03T19:51:42.997Z",
};
describe("AIU(2) guidance presentation", () => {
  it("shows 1,00 without certifying the scanned 01 as a legal rule", () => {
    expect(describePendingAnalystCa(guidance)).toEqual({
      formatted: "1,00",
      sourceOcr: "01",
      status: "Aguardando comprovação documental",
    });
  });
  it("does not present unknown or invalid guidance as an adopted value", () => {
    expect(describePendingAnalystCa(undefined)).toBeNull();
    expect(describePendingAnalystCa({...guidance, proposed_value: Number.NaN})).toBeNull();
    expect(describePendingAnalystCa({...guidance, status: "verified" as UrbanMatrixAnalystGuidance["status"]})).toBeNull();
  });
});
