import { describe, expect, it } from "vitest";
import { exactChargeCents, assertProviderChargeMatchesGuide } from "../../server/guide-persistence";
import type { StoredGuide } from "../../server/guide-persistence";

const guide:StoredGuide={id:"g",process_id:"p",municipality_id:"m",
  guide_number:"DAM-01",amount:1234.56,status:"pending",due_date:"2026-11-30",created_at:"2026-11-07"};
const payment=(amount:string)=>({ok:true,environment:"test" as const,
  orderId:"id-1",externalReference:"DAM-01",amount});
describe("SIGAPRO — conferência monetária em centavos exatos",()=>{
  it("aceita somente decimal estrito, sem formato exponencial nem fração de centavo",()=>{
    expect(exactChargeCents("1234.56")).toBe(123456);
    expect(exactChargeCents("1")).toBe(100);
    expect(exactChargeCents("0.01")).toBe(1);
    for(const bad of ["0","0.00","1.005","1e0","1,00","1.234,56","-0.01","NaN","Infinity","01.00"," 1.00 ",1]) {
      expect(exactChargeCents(bad)).toBeNull();
    }
  });
  it("não permite arredondar cobrança com três casas para coincidir com guia",()=>{
    expect(()=>assertProviderChargeMatchesGuide(guide,payment("1234.56"))).not.toThrow();
    expect(()=>assertProviderChargeMatchesGuide(guide,payment("1234.561"))).toThrow(/Valor/);
    expect(()=>assertProviderChargeMatchesGuide(guide,payment("1234.55"))).toThrow(/Valor/);
    expect(()=>assertProviderChargeMatchesGuide({...guide,amount:1234.565},payment("1234.56"))).toThrow(/Valor/);
  });
});
