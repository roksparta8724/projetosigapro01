import {describe, expect, it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {OfficialPaymentGuideDocument, type OfficialPaymentGuideData} from "@/components/platform/OfficialPaymentGuideDocument";
import {barcodeFromDigitableLine} from "@/lib/bankCodes";

const line = "23793388096060157364540663333335168400000300000";
const barcode = barcodeFromDigitableLine(line);
const fixture: OfficialPaymentGuideData = {
  municipality: {name:"Prefeitura QA",address:"Endereço de teste",department:"Financeiro"},
  guide:{number:"QA",year:"2026",issueDate:"26/11/2026"},
  contributor:{registrationNumber:"QA",name:"Pessoa fictícia",address:"Teste",documentDate:"26/11/2026"},
  debtRows:[{year:"2026",debt:"Teste",table:"QA",principal:300}],
  responsible:{name:"QA"},
  bank:{payerName:"Teste",payerDocument:"",payerAddress:"Teste",bankName:"Banco QA",amount:300,digitableLine:line,barcodeValue:barcode},
};
describe("official payment guide alternate template",()=>{
  it("renders real I25 from consistent bank digits",()=>{
    const html=renderToStaticMarkup(<OfficialPaymentGuideDocument data={fixture}/>);
    expect(html).toContain('aria-label="Código de barras bancário I25"');
    expect(html).toContain(line);
    expect(html).toContain(barcode);
    expect(html.match(/<rect\b/g)?.length).toBe(114);
  });
  it("suppresses both payment fields if the bank codes conflict or are absent",()=>{
    for(const bank of [
      {...fixture.bank,barcodeValue:"1".repeat(44)},
      {...fixture.bank,barcodeValue:"",digitableLine:""},
    ]){
      const html=renderToStaticMarkup(<OfficialPaymentGuideDocument data={{...fixture,bank}}/>);
      expect(html).not.toContain('aria-label="Código de barras bancário I25"');
      expect(html).not.toContain(line);
      expect(html).toContain("Linha digitável indisponível ou divergente.");
    }
  });
});
