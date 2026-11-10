import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {buildProductionBoletoPayer,assertProductionBankIssueAllowed} from "../../server/mercadopago-payer";
import type {StoredGuide} from "../../server/guide-persistence";

const guide={
  id:"g1",municipality_id:"city-qa",process_id:"process-qa",
  guide_number:"DAM-2026-0001",amount:150.75,
  created_at:"2026-11-10",due_date:"2026-11-20",
  status:"pendente",owner_name_snapshot:"Maria Pereira",
  owner_document_snapshot:"529.982.247-25",
  collection_mode_snapshot:"sigapro",payment_provider:"mercado_pago",
  provider_environment:"production",
} as StoredGuide;
const form={
  email:"pagador@example.org",
  street_name:"Rua das Acacias",
  street_number:"10",zip_code:"13220-000",
  neighborhood:"Centro",city:"Campo Limpo Paulista",state:"SP",
};
const source=(name:string)=>readFileSync(name,"utf8");

describe("SIGAPRO: boleto real exige titular e cobrança explícita",()=>{
  it("usa exclusivamente a identidade validada da guia Neon, sem CPF do cliente",()=>{
    const payer=buildProductionBoletoPayer(guide,form);
    expect(payer.first_name).toBe("Maria");
    expect(payer.last_name).toBe("Pereira");
    expect(payer.identification).toEqual({type:"CPF",number:"52998224725"});
    expect(payer.address.zip_code).toBe("13220000");
    expect(payer.address.state).toBe("SP");
    expect(payer.email).toBe("pagador@example.org");
  });
  it("rejeita nome ausente, CPF inválido ou identificação divergente no banco",()=>{
    expect(()=>buildProductionBoletoPayer({...guide,owner_name_snapshot:"Maria"},form)).toThrow(/nome completo/);
    expect(()=>buildProductionBoletoPayer({...guide,owner_document_snapshot:"11111111111"},form)).toThrow(/CPF ou CNPJ/);
    expect(()=>buildProductionBoletoPayer({...guide,contribuinte_cpf:"11111111111"},form)).toThrow(/divergente/);
    expect(()=>buildProductionBoletoPayer({...guide,owner_document_snapshot:""},form)).toThrow(/divergente|não cadastrado/);
  });
  it("rejeita email/CEP/UF incompletos e não aceita identidade enviada pelo navegador",()=>{
    expect(()=>buildProductionBoletoPayer(guide,{...form,email:"invalid"})).toThrow(/e-mail/);
    expect(()=>buildProductionBoletoPayer(guide,{...form,zip_code:"123"})).toThrow(/CEP/);
    expect(()=>buildProductionBoletoPayer(guide,{...form,state:"Sao Paulo"})).toThrow(/CEP/);
    expect(()=>buildProductionBoletoPayer(guide,{...form,owner_document_snapshot:"00000000000"}))
      .not.toThrow();
    expect(buildProductionBoletoPayer(guide,{...form,owner_document_snapshot:"00000000000"}).identification.number)
      .toBe("52998224725");
  });
  it("só permite pedido real no deploy de produção habilitado e vinculado ao banco municipal",()=>{
    const enabled={VERCEL_ENV:"production",SIGAPRO_PROD_BANK_CHARGES_ENABLED:"true"};
    expect(()=>assertProductionBankIssueAllowed(guide,enabled)).not.toThrow();
    for(const env of [
      {...enabled,VERCEL_ENV:"preview"},{...enabled,SIGAPRO_PROD_BANK_CHARGES_ENABLED:"false"},
      {VERCEL_ENV:"production"},
    ])expect(()=>assertProductionBankIssueAllowed(guide,env)).toThrow(/emissão bancária real/);
    expect(()=>assertProductionBankIssueAllowed({...guide,provider_environment:"test"},enabled)).toThrow();
    expect(()=>assertProductionBankIssueAllowed({...guide,payment_provider:"manual"},enabled)).toThrow();
    expect(()=>assertProductionBankIssueAllowed({...guide,collection_mode_snapshot:"municipal_system"},enabled)).toThrow();
  });
  it("botão real emite só com ação explícita, formulário e consentimento",()=>{
    const page=source("src/pages/saas/ExternalPaymentsPage.tsx");
    const dialog=source("src/components/platform/RealBoletoPayerDialog.tsx");
    const detail=source("src/pages/saas/ProcessDetailPage.tsx");
    const body=page.slice(page.indexOf("const openExternalGuide = async"),page.indexOf("  // Enquanto existe guia inicial pendente"));
    expect(page).toContain('data-prod-issue-boleto="true"');
    expect(page).toContain("const issueRealBoleto = async");
    expect(page).toContain("onConfirm={issueRealBoleto}");
    expect(body).not.toContain("ensureMercadoPagoGuideCharge(");
    expect(detail).not.toContain("await ensureMercadoPagoGuideCharge(");
    expect(dialog).toContain('data-real-boleto-payer-form="true"');
    expect(dialog).toContain("Confirmar emissão bancária");
    expect(dialog).not.toContain("localStorage");
  });
  it("API recebe pagador como dado não confiável; servidor controla a identidade e o banco",()=>{
    const api=source("api/mercadopago.ts");
    const server=source("server/mercadopago.ts");
    expect(api).toContain("payer: body.payer");
    expect(server).toContain("buildProductionBoletoPayer(stored!,input.payer)");
    expect(server).toContain("assertProductionBankIssueAllowed(stored || undefined)");
    expect(server).toContain("assertBankChargeAttestationReady()");
    expect(server).toContain('X-Idempotency-Key');
    expect(server).not.toContain('A cobrança real ainda está bloqueada. Primeiro valide');
  });
});
