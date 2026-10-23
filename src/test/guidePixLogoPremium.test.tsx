import { describe, expect, it } from "vitest";
import { buildPixPayload, isValidPixPayload } from "@/lib/pix";
import {
  GuiaRecolhimentoOficial,
  buildGuiaRecolhimentoOficialHtml,
  type GuiaRecolhimentoOficialProps,
} from "@/components/GuiaRecolhimentoOficial";
import { institutionalLogoVisibleBounds } from "@/lib/guideAssets";
import { renderToStaticMarkup } from "react-dom/server";

const guide: GuiaRecolhimentoOficialProps = {
  prefeitura: {
    nome: "PREFEITURA DE TESTE",
    secretaria: "SECRETARIA DE FINANÇAS",
    logoUrl: "data:image/png;base64,VGhpcyBpcyBhIG1vY2s=",
  },
  contribuinte: { nome: "PESSOA DE TESTE", numeroCadastro: "001" },
  guia: {
    numeroGuia: "DAM-PRE-QA-00001",
    dataDocumento: "2026-10-22",
    vencimento: "2026-10-24",
    paymentProvider: "mercado_pago",
    bankEnvironment: "test",
    linhaDigitavel: "23793380296060054351030006333303799140000020000",
    codigoBarras: "23797991400000200003380260600543513000633330",
    valorDocumento: 35.24,
    valorCobrado: 35.24,
  },
  itens: [{ ano: 2026, divida: "Taxa de Protocolo", principal: 35.24, total: 35.24 }],
};

describe("SIGAPRO DAM — only real PIX and premium municipal logo", () => {
  it("hides the empty PIX box on boleto-only Mercado Pago sandbox guides", () => {
    const html = buildGuiaRecolhimentoOficialHtml(guide, { autoPrint: false });
    expect(html).not.toContain("PIX não configurado para esta Prefeitura");
    expect(html).not.toContain('class="dam-qr-wrap"');
    expect(html).toContain('data-dam-payment-mode="boleto-only"');
    expect(html).toContain("23797991400000200003380260600543513000633330");
    expect(html).toContain("Forma de pagamento: boleto bancário.");
    expect(html).toContain("Homologação — não pagar");
  });

  it("validates lowercase br.gov.bcb.pix used by Mercado Pago without changing QR bytes", () => {
    const original=buildPixPayload({
      key:"sandbox@example.test",merchantName:"PREFEITURA TESTE",
      merchantCity:"SAO PAULO",amount:35.24,txid:"TEST123",
    })!;
    const body=original.slice(0,-4).replace("BR.GOV.BCB.PIX","br.gov.bcb.pix");
    let crc=0xFFFF;
    for(let i=0;i<body.length;i++){
      crc^=body.charCodeAt(i)<<8;
      for(let bit=0;bit<8;bit++){
        crc=(crc&0x8000)?((crc<<1)^0x1021)&0xFFFF:(crc<<1)&0xFFFF;
      }
    }
    const lower=body+crc.toString(16).toUpperCase().padStart(4,"0");
    expect(lower).toContain("br.gov.bcb.pix");
    expect(isValidPixPayload(lower)).toBe(true);
  });

  it("never invents PIX from a malformed Copia e Cola string", () => {
    const html = buildGuiaRecolhimentoOficialHtml({
      ...guide,
      guia: { ...guide.guia, pixPayload: "123-invalid", qrCodePixUrl: "javascript:alert(1)" },
    }, { autoPrint: false });
    expect(html).not.toContain('data-dam-pix="official-payload"');
    expect(html).not.toContain('data-dam-pix="official-qr"');
    expect(html).not.toContain("PIX não configurado");
    expect(html).toContain('data-dam-payment-mode="boleto-only"');
  });

  it("renders verified PIX payload and QR Code when a bank-provided payload exists", () => {
    const payload = buildPixPayload({
      key: "prefeitura.exemplo@example.gov.br",
      merchantName: "PREFEITURA MUNICIPAL",
      merchantCity: "SAO PAULO",
      amount: 35.24,
      txid: "DAMQATEST01",
    });
    expect(payload).toBeTruthy();
    const html = renderToStaticMarkup(
      <GuiaRecolhimentoOficial {...guide} guia={{
        ...guide.guia, bankEnvironment: "production", pixPayload: payload!,
      }} />,
    );
    expect(html).toContain('data-dam-pix="official-payload"');
    expect(html).toContain("PIX Copia e Cola");
    expect(html).toContain(payload);
    expect(html).not.toContain('data-dam-payment-mode="boleto-only"');
  });

  it("displays a sandbox provider PIX QR alongside boleto only when explicitly returned by the test API", () => {
    const testQr = buildPixPayload({
      key:"sandbox@example.test",merchantName:"MERCADO PAGO TESTE",
      merchantCity:"SAO PAULO",amount:35.24,txid:"SANDBOX-ORDER",
    })!;
    const html=buildGuiaRecolhimentoOficialHtml({
      ...guide,guia:{...guide.guia,bankEnvironment:"test",qaSandboxPixPayload:testQr},
    },{autoPrint:false});
    expect(html).toContain('data-dam-pix="sandbox"');
    expect(html).toContain("QR DE HOMOLOGAÇÃO");
    expect(html).toContain("NÃO PAGAR");
    expect(html).toContain(testQr);
    expect(html).toContain("Linha Digitável");
    expect(html).not.toContain('data-dam-payment-mode="boleto-only"');
  });

  it("refuses fake or invalid sandbox provider QR even if present in the guide object", () => {
    const html=buildGuiaRecolhimentoOficialHtml({
      ...guide,guia:{...guide.guia,bankEnvironment:"test",qaSandboxPixPayload:"000201PIXINVALID"},
    },{autoPrint:false});
    expect(html).not.toContain('data-dam-pix="sandbox"');
    expect(html).toContain('data-dam-payment-mode="boleto-only"');
  });

  it("never displays a potentially real PIX copied into a sandbox boleto", () => {
    const payload = buildPixPayload({
      key: "teste@example.com",
      merchantName: "PREFEITURA MUNICIPAL",
      merchantCity: "CAMPINAS",
      amount: 35.24,
      txid: "SANDBOXONLY",
    })!;
    const html = buildGuiaRecolhimentoOficialHtml({
      ...guide, guia: { ...guide.guia, bankEnvironment: "test", pixPayload: payload },
    }, { autoPrint: false });
    expect(html).not.toContain(payload);
    expect(html).not.toContain('data-dam-pix="official-payload"');
    expect(html).toContain('data-dam-payment-mode="boleto-only"');
  });

  it("never displays a payable PIX in an unissued QA preview", () => {
    const payload = buildPixPayload({
      key: "teste@example.com",
      merchantName: "PREFEITURA MUNICIPAL",
      merchantCity: "CAMPINAS",
      amount: 35.24,
      txid: "QANOPAY",
    })!;
    const html = buildGuiaRecolhimentoOficialHtml({
      ...guide, guia: { ...guide.guia, pixPayload: payload, nonPayablePreview: true },
    }, { autoPrint: false });
    expect(html).not.toContain(payload);
    expect(html).not.toContain('data-dam-pix="official-payload"');
  });

  it("keeps the original compact 19mm header and expands only the crest within the 28mm card", () => {
    const html = buildGuiaRecolhimentoOficialHtml(guide, { autoPrint: false });
    expect(html).toContain("grid-template-columns: 28mm minmax(0, 1fr) 58mm");
    expect(html).toContain("height: 19mm");
    expect(html).toContain("max-height: 19mm");
    expect(html).toContain("height: 9.5mm");
    expect(html).toContain("width: 27.3mm");
    expect(html).toContain("height: 18.25mm");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("padding: 0.25mm");
    expect(html).not.toContain("min-height: 26mm");
  });

  it("removes scanned light-gray margins without cropping the coat of arms", () => {
    const width = 120, height = 120;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 240;
      pixels[i + 3] = 255;
    }
    for (let y = 32; y < 88; y++) {
      for (let x = 37; x < 83; x++) {
        const at = (y * width + x) * 4;
        pixels[at] = 22; pixels[at + 1] = 92; pixels[at + 2] = 62;
      }
    }
    const bounds = institutionalLogoVisibleBounds(pixels, width, height);
    expect(bounds).toBeTruthy();
    expect(bounds!.x).toBeGreaterThanOrEqual(25);
    expect(bounds!.y).toBeGreaterThanOrEqual(20);
    expect(bounds!.width).toBeLessThan(70);
    expect(bounds!.height).toBeLessThan(80);
    // The trim includes every colored source pixel plus safety margin.
    expect(bounds!.x).toBeLessThanOrEqual(37);
    expect(bounds!.y).toBeLessThanOrEqual(32);
    expect(bounds!.x + bounds!.width).toBeGreaterThanOrEqual(83);
    expect(bounds!.y + bounds!.height).toBeGreaterThanOrEqual(88);
  });

  it("trims only substantial whitespace in art sources and keeps filled logos untouched", () => {
    const width = 80, height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
    for (let y = 20; y < 60; y++) {
      for (let x = 24; x < 56; x++) {
        const at = (y * width + x) * 4;
        pixels[at] = 0; pixels[at + 1] = 30; pixels[at + 2] = 80;
      }
    }
    const bounds = institutionalLogoVisibleBounds(pixels, width, height);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThan(width);
    expect(bounds!.height).toBeLessThan(height);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 20; pixels[i + 1] = 30; pixels[i + 2] = 40;
    }
    expect(institutionalLogoVisibleBounds(pixels, width, height)).toBeNull();
  });
});
