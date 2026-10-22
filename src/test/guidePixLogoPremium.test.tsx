import { describe, expect, it } from "vitest";
import { buildPixPayload } from "@/lib/pix";
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

  it("enlarges the coat of arms within the aligned 22mm A4 column without distortion", () => {
    const html = buildGuiaRecolhimentoOficialHtml(guide, { autoPrint: false });
    expect(html).toContain("grid-template-columns: 22mm minmax(0, 1fr) 58mm");
    expect(html).toContain("width: 20.5mm");
    expect(html).toContain("height: 17.6mm");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("padding: 0.65mm");
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
