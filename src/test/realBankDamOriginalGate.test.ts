import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {assertOfficialGuideDocument,type GuideOriginal} from "@/lib/guideOriginal";
import {normalizeOfficialBanking} from "@/lib/bankCodes";
import type {GuiaRecolhimentoOficialProps} from "@/components/GuiaRecolhimentoOficial";

const line="23793388096060157364540663333335168400000300000";
const banking=normalizeOfficialBanking("",line);
const original:GuideOriginal={
  id:"g1",municipality_id:"m1",process_id:"p1",
  guide_number:"DAM-1",status:"pendente",amount:300,
  due_date:"2026-11-15",created_at:"2026-11-10",
  bank_reference:"order-1",payment_provider:"mercado_pago",
  provider_environment:"production",
  barcode:banking.barcode,digitable_line:banking.digitableLine,
};
const props={
  prefeitura:{nome:"Prefeitura Municipal"},
  contribuinte:{nome:"Contribuinte"},
  guia:{numeroGuia:"DAM-1",dataDocumento:"2026-11-10",
    valorDocumento:300,valorCobrado:300,
    bankReference:"order-1",codigoBarras:banking.barcode,
    linhaDigitavel:banking.digitableLine,pixPayload:""},
  itens:[],
} as GuiaRecolhimentoOficialProps;

describe("SIGAPRO: cobrança real somente com DAM original persistida",()=>{
  it("aceita DAM com boleto REAL registrado, ainda que não ofereça PIX",()=>{
    expect(banking.barcode).toMatch(/^\d{44}$/);
    expect(banking.digitableLine).toMatch(/^\d{47}$/);
    expect(()=>assertOfficialGuideDocument(original,props,"m1")).not.toThrow();
  });
  it("nega barcode divergente, linha adulterada ou outra ordem bancária",()=>{
    expect(()=>assertOfficialGuideDocument(original,{
      ...props,guia:{...props.guia,bankReference:"another-order"},
    },"m1")).toThrow(/boleto bancário registrado/);
    expect(()=>assertOfficialGuideDocument(original,{
      ...props,guia:{...props.guia,linhaDigitavel:"0".repeat(47)},
    },"m1")).toThrow(/boleto bancário registrado/);
    expect(()=>assertOfficialGuideDocument(original,{
      ...props,guia:{...props.guia,codigoBarras:"1".repeat(44)},
    },"m1")).toThrow(/boleto bancário registrado/);
  });
  it("nega ambiente de teste, provedor manual e guia sem prova de banco",()=>{
    expect(()=>assertOfficialGuideDocument({...original,provider_environment:"test"},props,"m1"))
      .toThrow(/boleto bancário registrado/);
    expect(()=>assertOfficialGuideDocument({...original,payment_provider:"manual"},props,"m1"))
      .toThrow(/boleto bancário registrado/);
    expect(()=>assertOfficialGuideDocument({...original,bank_reference:undefined},props,"m1"))
      .toThrow(/boleto bancário registrado/);
  });
  it("jamais considera chave PIX institucional ou PIX inválido uma prova do banco",()=>{
    expect(()=>assertOfficialGuideDocument(original,{
      ...props,guia:{...props.guia,pixPayload:"000201FAKE"},
    },"m1")).toThrow(/PIX Copia e Cola inválido/);
  });
  it("não aceita valor da guia diferente do valor persistido",()=>{
    expect(()=>assertOfficialGuideDocument(original,{
      ...props,guia:{...props.guia,valorCobrado:301},
    },"m1")).toThrow(/valor do PDF difere/);
  });
  it("portal externo não abre guia pagável transitória nem chama banco para reabrir original",()=>{
    const page=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
    expect(page).toContain('window.open("", "_blank")');
    expect(page).toContain("await readGuideOriginal(effectiveScopeId, guide.code)");
    expect(page).toContain("if (persisted?.original_pdf_key)");
    expect(page).toContain("await archiveAndOpenGuide(effectiveScopeId");
    expect(page).toContain("pixPayload: \"\"");
    expect(page).toContain("if (isolatedQa) {");
    expect(page).toContain("const opened = openGuiaRecolhimentoOficialWindow(");
    expect(page).toContain("if (officialWindow && !officialWindow.closed) officialWindow.close()");
    expect(page).not.toContain("pixPayload: isolatedQa ? \"\" : banking.pixPayload");
  });
});
