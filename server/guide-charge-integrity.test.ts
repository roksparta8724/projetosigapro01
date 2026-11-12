import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertProviderChargeMatchesGuide, persistGuideCharge, signVerifiedBankCharge, type StoredGuide } from "./guide-persistence";
import type { MercadoPagoGuideBoletoResult } from "./mercadopago";
import { callDataApiRpc } from "./municipal-storage";
import type { ApiReq } from "./municipal-storage";

vi.mock("./municipal-storage", () => ({ callDataApiRpc: vi.fn() }));
const req = {headers:{authorization:"Bearer qa-isolated"}} as ApiReq;
const guide: StoredGuide = {
  id:"guide-id", municipality_id:"city-a", process_id:"process-a",
  guide_number:"DAM-001", amount:1, status:"pendente",
  due_date:"2026-11-10",created_at:"2026-11-07",
  collection_mode_snapshot:"sigapro",
};
const charge: MercadoPagoGuideBoletoResult = {
  ok:true,environment:"test",externalReference:"DAM-001",orderId:"order-001",amount:"1.00",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","ab".repeat(32));
});

describe("SIGAPRO QA — conciliação bancária não pode atribuir ordem indevida", () => {
  it("aceita apenas referência original, valor exato e ambiente consistente", () => {
    expect(() => assertProviderChargeMatchesGuide(guide, charge, true)).not.toThrow();
    expect(() => signVerifiedBankCharge(guide,charge)).not.toThrow();
    expect(() => assertProviderChargeMatchesGuide(guide,{...charge,amount:"2.00"})).toThrow(/Valor/);
    expect(() => assertProviderChargeMatchesGuide(guide,{...charge,amount:"NaN"})).toThrow(/Valor/);
    expect(() => assertProviderChargeMatchesGuide(guide,{...charge,externalReference:"DAM-OUTRA"})).toThrow();
    expect(() => assertProviderChargeMatchesGuide(guide,{...charge,ok:false})).toThrow();
  });
  it("proíbe usar pagamento real no sandbox ou misturar ambientes da prefeitura", () => {
    expect(() => assertProviderChargeMatchesGuide(guide,{...charge,environment:"production"},true)).toThrow(/Homologação/);
    expect(() => assertProviderChargeMatchesGuide({...guide,provider_environment:"production"},charge)).toThrow(/Ambiente da cobrança/);
    expect(() => assertProviderChargeMatchesGuide({...guide,bank_reference:"other-order"},charge)).toThrow(/outra cobrança/);
  });
  it("não cria nem altera uma nova cobrança de guia quitada ou municipal", () => {
    expect(() => assertProviderChargeMatchesGuide({...guide,paid:true},charge)).toThrow(/compensada/);
    expect(() => assertProviderChargeMatchesGuide({...guide,status:"confirmado"},charge)).toThrow(/compensada/);
    expect(() => assertProviderChargeMatchesGuide({...guide,collection_mode_snapshot:"municipal_system"},charge)).toThrow(/sistema bancário próprio/);
  });
  it("rejeita todos os casos indevidos antes de chamar a persistência Neon", async () => {
    const bad = [
      {guide:{...guide,paid:true},charge,sandbox:false},
      {guide:{...guide,bank_reference:"other-order"},charge,sandbox:false},
      {guide,charge:{...charge,environment:"production" as const},sandbox:true},
      {guide,charge:{...charge,amount:"1.01"},sandbox:false},
      {guide,charge:{...charge,ok:false},sandbox:false},
    ];
    for (const item of bad) {
      await expect(persistGuideCharge(req,item.guide,item.charge,item.sandbox)).rejects.toThrow();
    }
    expect(callDataApiRpc).not.toHaveBeenCalled();
  });
});
