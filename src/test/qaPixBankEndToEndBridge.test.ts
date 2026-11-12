import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {assertOfficialGuideDocument,type GuideOriginal} from "@/lib/guideOriginal";
import {buildPixPayload} from "@/lib/pix";
import type {GuiaRecolhimentoOficialProps} from "@/components/GuiaRecolhimentoOficial";

const read=(p:string)=>readFileSync(p,"utf8");
const qr=buildPixPayload({
  key:"qa@mercadopago.example",
  merchantName:"MERCADO PAGO TESTE",merchantCity:"SAO PAULO",
  txid:"SIGAPROQA20261110",
})!;
const guide:GuideOriginal={
  id:"g-qa",process_id:"p-qa",municipality_id:"m-qa",
  guide_number:"DAM-PRE-QA-20261110-ABC12345",
  amount:35.24,created_at:"2026-11-10T15:35:10.000Z",
  due_date:"2026-11-30",status:"pendente",paid:false,
  payment_provider:"mercado_pago",provider_environment:"test",
  bank_reference:"ORDER_QA_PIX_001",bank_payment_id:"PAY_QA_001",
  pix_code:qr,
};
const props:GuiaRecolhimentoOficialProps={
  prefeitura:{nome:"Prefeitura de QA"},
  contribuinte:{nome:"Contribuinte de QA"},
  guia:{
    numeroGuia:guide.guide_number,
    dataDocumento:guide.created_at,valorDocumento:35.24,valorCobrado:35.24,
    bankReference:guide.bank_reference,bankPaymentId:guide.bank_payment_id,
    bankEnvironment:"test",paymentProvider:"mercado_pago",
    pixPayload:qr,qaSandboxPixPayload:qr,
    bankName:"Mercado Pago teste",codigoBarras:undefined,linhaDigitavel:undefined,
    nonPayablePreview:false,
  },
  itens:[],
};

describe("SIGAPRO: closing the real QA PIX issuance / signed-settlement loop",()=>{
  it("allows a frozen, watermarked QR provider-issued document with no amount in dynamic EMV",()=>{
    expect(qr).toMatch(/^000201/);
    expect(()=>assertOfficialGuideDocument(guide,props,"m-qa")).not.toThrow();
    const template=read("src/components/GuiaRecolhimentoOficial.tsx");
    expect(template).toContain("Homologação Mercado Pago — documento de teste — não efetuar pagamento");
    expect(template).toContain("QR DE HOMOLOGAÇÃO · NÃO PAGAR");
    expect(template).toContain('guia.bankEnvironment === "test"');
  });
  it("fails closed if order, payment id, QR, environment or payable status mismatch",()=>{
    const changes=[
      {bankReference:"ORDER_OTHER"},
      {bankPaymentId:"PAY_OTHER"},
      {pixPayload:buildPixPayload({key:"other@example.test",merchantName:"TESTE",merchantCity:"SAO PAULO",txid:"OTHER"})!},
      {qaSandboxPixPayload:""},
      {bankEnvironment:"production" as const},
      {paymentProvider:"manual" as const},
    ];
    for(const change of changes){
      expect(()=>assertOfficialGuideDocument(guide,{
        ...props,guia:{...props.guia,...change},
      },"m-qa")).toThrow();
    }
    expect(()=>assertOfficialGuideDocument(guide,{...props,guia:{...props.guia,nonPayablePreview:true}},"m-qa"))
      .toThrow(/prévia/i);
    expect(()=>assertOfficialGuideDocument({...guide,payment_provider:"manual"},props,"m-qa")).toThrow();
    expect(()=>assertOfficialGuideDocument({...guide,bank_payment_id:undefined},props,"m-qa")).toThrow();
    expect(()=>assertOfficialGuideDocument({...guide,amount:35.25},props,"m-qa")).toThrow();
  });
  it("connects both ledgers in one restricted QA SQL transaction and never settles from issuance",()=>{
    const migration=read("neon/migrations/20261110_qa_pix_ledger_canonical_bridge_v2.sql");
    expect(migration).toContain("session_user IS DISTINCT FROM 'sigapro_qa_webhook_worker'");
    expect(migration).toContain("INSERT INTO public.qa_pix_sandbox_orders_v1");
    expect(migration).toContain("INSERT INTO public.mp_qa_pix_orders_v1");
    expect(migration).toContain("UPDATE public.mp_qa_pix_orders_v1");
    expect(migration).toContain("UPDATE public.payment_guides SET");
    expect(migration).toContain("bank_reference=rec.bank_order_id");
    expect(migration).toContain("bank_payment_id=rec.bank_payment_id");
    expect(migration).toContain("pix_code=rec.qr_code");
    expect(migration).toContain("provider_charge_saved_at=coalesce(provider_charge_saved_at,now())");
    expect(migration).toContain("ON CONFLICT(guide_id) DO NOTHING");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.qa_pix_sandbox_order_v1");
    expect(migration).toContain("TO sigapro_qa_webhook_worker");
    expect(migration).not.toMatch(/\bSET\s+paid\s*=\s*true\b/i);
    expect(migration).not.toContain("officialize_preprotocol_v1(");
  });
  it("uses exact provider reference and only a verified frozen original for a signed webhook",()=>{
    const issuer=read("server/qa-mercadopago-pix.ts");
    const webhook=read("server/mp-qa-webhook.ts");
    const frontend=read("src/pages/saas/ExternalPaymentsPage.tsx");
    expect(issuer).toContain("const externalReference=input.guideCode;");
    expect(issuer).not.toContain('const externalReference=input.guideCode+"-PIX-QA"');
    expect(webhook).toContain("verifyMercadoPagoOrderWebhook");
    expect(webhook).toContain("fetchMunicipalMpOrder");
    expect(webhook).toContain("public.mp_qa_webhook_settle_v1");
    expect(frontend).toContain("const qaPixBound = Boolean(");
    expect(frontend).toContain("persisted.bank_reference && persisted.bank_payment_id");
    expect(frontend).toContain("sandboxPix.orderId === persisted.bank_reference");
    expect(frontend).toContain("sandboxPix.paymentId === persisted.bank_payment_id");
    // Reserve a tab in the user gesture and archive the actual QA DAM after the provider responds.
    expect(frontend).toContain("const pixWindow = window.open");
    expect(frontend).toContain("openExternalGuide(process,guide,pixWindow)");
    expect(frontend).toContain("if (isolatedQa && qaPixBound)");
    expect(frontend).toContain("await archiveAndOpenGuide(effectiveScopeId,guideDocument,officialWindow)");
    expect(frontend).toContain("openGuiaRecolhimentoOficialWindow(guideDocument,");
    expect(frontend).toContain("nonPayablePreview: previewOnly");
    expect(frontend).not.toContain("pixPayload: isolatedQa ? banking.pixPayload : ");
  });
});
