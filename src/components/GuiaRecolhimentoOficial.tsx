/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { normalizeOfficialBanking } from "@/lib/bankCodes";

type PrefeituraData = {
  nome: string;
  secretaria?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  logoUrl?: string;
  logoScale?: number;
  logoOffsetX?: number;
  logoOffsetY?: number;
  footerLogoScale?: number;
  footerLogoOffsetX?: number;
  footerLogoOffsetY?: number;
  cadastroTitulo?: string;
};

type ContribuinteData = {
  nome: string;
  cpfCnpj?: string;
  endereco?: string;
  numeroCadastro?: string;
};

type TaxaItem = {
  ano: string | number;
  divida: string;
  tabela?: string;
  sb?: string | number;
  pc?: string | number;
  principal: number;
  multa?: number;
  juros?: number;
  correcao?: number;
  total: number;
};

type GuiaData = {
  numeroGuia: string;
  exercicio?: string | number;
  dataDocumento: string;
  vencimento?: string;
  observacao?: string;
  funcionarioResponsavel?: string;
  proprietario?: string;
  profissionalResponsavel?: string;
  analistaSolicitante?: string;
  funcionarioEmissor?: string;
  areaObra?: number;
  usoObra?: string;
  padraoConstrutivo?: string;
  codigoBarras?: string;
  linhaDigitavel?: string;
  qrCodePixUrl?: string;
  pixPayload?: string;
  bankName?: string;
  bankMunicipalName?: string;
  bankCode?: string;
  bankAgency?: string;
  bankAccount?: string;
  bankBeneficiary?: string;
  bankAgreement?: string;
  bankInstructions?: string;
  bankReference?: string;
  bankPaymentId?: string;
  bankEnvironment?: "test" | "production";
  /** Explicit read-only QA document. Not an issued ticket or a payable demand. */
  nonPayablePreview?: boolean;
  bankStatus?: string;
  bankStatusDetail?: string;
  bankAuthenticatedAt?: string;
  paymentProvider?: "mercado_pago" | "bank_direct" | "manual";
  valorDocumento?: number;
  descontos?: number;
  outrosAcrescimos?: number;
  valorCobrado?: number;
  autenticacaoMecanica?: string;
  referencia?: string;
};

export type GuiaRecolhimentoOficialProps = {
  prefeitura: PrefeituraData;
  contribuinte: ContribuinteData;
  guia: GuiaData;
  itens: TaxaItem[];
  className?: string;
};

function formatCurrency(value?: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateBR(value?: string) {
  if (!value) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function sumValues(items: TaxaItem[], field: keyof TaxaItem) {
  return items.reduce((acc, item) => acc + Number(item[field] || 0), 0);
}

function formatDigitableLine(value?: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "Sem linha digitável oficial — consulte a Prefeitura.";

  if (digits.length === 47) {
    return [
      `${digits.slice(0, 5)}.${digits.slice(5, 10)}`,
      `${digits.slice(10, 15)}.${digits.slice(15, 21)}`,
      `${digits.slice(21, 26)}.${digits.slice(26, 32)}`,
      digits.slice(32, 33),
      digits.slice(33),
    ].join(" ");
  }

  if (digits.length === 48) {
    return [
      digits.slice(0, 12),
      digits.slice(12, 24),
      digits.slice(24, 36),
      digits.slice(36, 48),
    ].join(" ");
  }

  return "Linha digitável inválida — solicite uma cobrança oficial ao banco.";
}

const I25_PATTERNS: Record<string, string> = {
  "0": "nnwwn",
  "1": "wnnnw",
  "2": "nwnnw",
  "3": "wwnnn",
  "4": "nnwnw",
  "5": "wnwnn",
  "6": "nwwnn",
  "7": "nnnww",
  "8": "wnnwn",
  "9": "nwnwn",
};

function normalizeOfficialBarcode(code?: string) {
  const digits = (code || "").replace(/\D/g, "");
  // O código vem do provedor/banco. Não calculamos ou completamos dígitos.
  // I25 exige quantidade par; aceitamos o conteúdo oficial retornado entre
  // 40 e 48 dígitos para acomodar os provedores homologados.
  return digits.length === 44
    ? digits
    : "";
}

function Interleaved2of5Barcode({ value }: { value?: string }) {
  const digits = normalizeOfficialBarcode(value);
  if (!digits) {
    return (
      <span className="dam-barcode-fallback">
        Código bancário ainda não fornecido pelo convênio/API da Prefeitura.
      </span>
    );
  }

  const narrow = 1;
  const wide = 3;
  const quiet = 10;
  let x = quiet;
  const bars: Array<{ x: number; width: number }> = [];

  const addBar = (width: number) => {
    bars.push({ x, width });
    x += width;
  };
  const addSpace = (width: number) => {
    x += width;
  };
  const unit = (token: string) => (token === "w" ? wide : narrow);

  addBar(narrow);
  addSpace(narrow);
  addBar(narrow);
  addSpace(narrow);

  for (let pairIndex = 0; pairIndex < digits.length; pairIndex += 2) {
    const barsPattern = I25_PATTERNS[digits[pairIndex]];
    const spacesPattern = I25_PATTERNS[digits[pairIndex + 1]];
    for (let index = 0; index < 5; index += 1) {
      addBar(unit(barsPattern[index]));
      addSpace(unit(spacesPattern[index]));
    }
  }

  addBar(wide);
  addSpace(narrow);
  addBar(narrow);
  const totalWidth = x + quiet;

  return (
    <svg
      className="dam-barcode-svg"
      viewBox={`0 0 ${totalWidth} 50`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Código de barras bancário"
    >
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y="2" width={bar.width} height="42" fill="#000000" />
      ))}
    </svg>
  );
}

function ProviderBarcode({ value }: { value?: string }) {
  const digits = normalizeOfficialBarcode(value);
  if (!digits) {
    return (
      <span className="dam-barcode-fallback">
        Código bancário ainda não fornecido pelo convênio/API da Prefeitura.
      </span>
    );
  }

  return (
    <div className="dam-barcode-render">
      <Interleaved2of5Barcode value={digits} />
      <div className="dam-barcode-digits">{digits}</div>
    </div>
  );
}

function formatDateTimeBR(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function bankAuthenticationLabel(guia: GuiaData) {
  if (guia.nonPayablePreview) {
    return {
      tone: "test",
      title: "NÃO EMITIDA",
      lines: ["Prévia administrativa de homologação.", "Nenhuma cobrança foi registrada no banco."],
    };
  }
  const status = String(guia.bankStatus || "").toLowerCase();
  const detail = String(guia.bankStatusDetail || "").toLowerCase();
  const paid =
    (status === "processed" && detail === "accredited") ||
    Boolean(guia.bankAuthenticatedAt);

  if (guia.bankEnvironment === "test") {
    return {
      tone: "test",
      title: "HOMOLOGAÇÃO",
      lines: [
        detail === "waiting_payment"
          ? "Aguardando pagamento no ambiente de teste"
          : status
            ? `Status: ${status}${detail ? ` / ${detail}` : ""}`
            : "Cobrança de teste registrada",
        guia.bankPaymentId ? `Payment: ${guia.bankPaymentId}` : "",
        guia.bankReference ? `Order: ${guia.bankReference}` : "",
      ].filter(Boolean),
    };
  }

  if (paid) {
    return {
      tone: "paid",
      title: "PAGAMENTO COMPENSADO",
      lines: [
        guia.bankAuthenticatedAt
          ? `Confirmado em ${formatDateTimeBR(guia.bankAuthenticatedAt)}`
          : "Confirmação recebida do provedor",
        guia.bankPaymentId ? `Payment: ${guia.bankPaymentId}` : "",
        guia.bankReference ? `Order: ${guia.bankReference}` : "",
      ].filter(Boolean),
    };
  }

  if (detail === "waiting_payment" || status === "action_required") {
    return {
      tone: "pending",
      title: "AGUARDANDO COMPENSAÇÃO",
      lines: [
        "Cobrança registrada no provedor",
        guia.bankPaymentId ? `Payment: ${guia.bankPaymentId}` : "",
        guia.bankReference ? `Order: ${guia.bankReference}` : "",
      ].filter(Boolean),
    };
  }

  if (guia.bankReference || guia.bankPaymentId) {
    return {
      tone: "pending",
      title: "COBRANÇA REGISTRADA",
      lines: [
        status ? `Status: ${status}${detail ? ` / ${detail}` : ""}` : "",
        guia.bankPaymentId ? `Payment: ${guia.bankPaymentId}` : "",
        guia.bankReference ? `Order: ${guia.bankReference}` : "",
      ].filter(Boolean),
    };
  }

  return {
    tone: "manual",
    title: "AGUARDANDO AUTENTICAÇÃO",
    lines: ["A baixa será registrada pelo provedor ou pela Tesouraria."],
  };
}

function getStyles() {
  return `
    @page {
      size: A4 portrait;
      margin: 5mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #eef3f8;
    }

    body {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-rendering: geometricPrecision;
    }

    .dam-root {
      width: 100%;
      background: #ffffff;
      color: #000000;
    }

    .dam-toolbar {
      width: 200mm;
      margin: 4mm auto 2.5mm;
      display: flex;
      justify-content: flex-end;
    }

    .dam-print-button {
      border: 0;
      border-radius: 9px;
      background: #0f3557;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      padding: 9px 14px;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(15, 53, 87, 0.18);
    }

    .dam-sheet {
      width: 200mm;
      height: 286.5mm;
      max-height: 286.5mm;
      min-height: 286.5mm;
      margin: 0 auto 5mm;
      overflow: hidden;
      border: 1px solid #d7e0e8;
      border-top: 4px solid #0f3557;
      border-radius: 3mm;
      background: #ffffff;
      padding: 3.2mm;
      box-sizing: border-box;
      box-shadow: 0 14px 34px rgba(15, 53, 87, 0.12);
    }

    .dam-stack {
      display: flex;
      flex-direction: column;
      gap: 1mm;
      height: 100%;
    }

    .dam-block {
      border: 1px solid #9fb0c1;
      border-radius: 1.8mm;
      overflow: hidden;
    }

    .dam-block-top {
      flex: 0 0 auto;
    }

    .dam-block-bottom {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
    }

    .dam-header {
      display: grid;
      grid-template-columns: 82px 1fr 170px;
      border-bottom: 1px solid #b7c5d2;
      align-items: stretch;
      background: linear-gradient(90deg, #f8fbfd 0%, #ffffff 58%, #f5f9fc 100%);
    }

    .dam-logo-box,
    .dam-header-right {
      box-sizing: border-box;
    }

    .dam-logo-box {
      height: 64px;
      border-right: 1px solid #b7c5d2;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1px; overflow: hidden;
      background: #ffffff;
    }

    .dam-logo {
      max-width: 74px;
      max-height: 61px;
      object-fit: contain;
      display: block;
    }

    .dam-logo-fallback {
      width: 42px;
      height: 42px;
      border: 1px solid #c5d1dc;
      border-radius: 12px;
      background: #f4f8fb;
      color: #0f3557;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: .08em;
      line-height: 1;
    }

    .dam-header-center {
      height: 64px;
      padding: 5px 9px;
      text-align: left;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      box-sizing: border-box;
    }

    .dam-municipality-name {
      font-size: 11.2px;
      line-height: 1.05;
      font-weight: 800;
      color: #0f3557;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .dam-header-line {
      font-size: 6.8px;
      line-height: 1.15;
      color: #334155;
      text-transform: uppercase;
    }

    .dam-header-line.normal {
      text-transform: none;
    }

    .dam-header-right {
      border-left: 1px solid #b7c5d2;
      display: grid;
      grid-template-rows: 16px 1fr;
    }

    .dam-header-right-title {
      border-bottom: 1px solid #000000;
      padding: 1px 3px;
      text-align: center;
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dam-header-right-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 38px;
    }

    .dam-mini-cell {
      padding: 2px 3px;
      box-sizing: border-box;
    }

    .dam-mini-cell + .dam-mini-cell {
      border-left: 1px solid #000000;
    }

    .dam-mini-label {
      font-size: 6.5px;
      line-height: 1;
      text-transform: uppercase;
    }

    .dam-mini-value {
      margin-top: 1px;
      font-size: 8.5px;
      line-height: 1;
      font-weight: 700;
      white-space: nowrap;
    }

    .dam-title {
      border-bottom: 1px solid #0a2944;
      padding: 5px 8px 4px;
      text-align: center;
      font-size: 11px;
      line-height: 1;
      font-weight: 800;
      color: #ffffff;
      background: #0f3557;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }

    .dam-homologation-band {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-bottom: 1px solid #d97706;
      padding: 4px 8px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 7px;
      line-height: 1.1;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .dam-homologation-dot {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: #ea580c;
      flex: 0 0 auto;
    }

    .dam-subtitle-band {
      display: grid;
      grid-template-columns: 1fr 54mm;
      border-bottom: 1px solid #b7c5d2;
      background: #edf4f8;
    }

    .dam-subtitle-main,
    .dam-subtitle-side {
      padding: 2px 4px;
      box-sizing: border-box;
    }

    .dam-subtitle-side {
      border-left: 1px solid #000000;
    }

    .dam-subtitle-label {
      font-size: 6px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .dam-subtitle-value {
      margin-top: 1px;
      font-size: 7px;
      line-height: 1.2;
    }

    .dam-fields-grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 2px;
      padding: 2px;
      box-sizing: border-box;
    }

    .dam-field {
      border: 1px solid #000000;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .dam-field-label {
      border-bottom: 1px solid #c8d3dd;
      padding: 2px 3px 1px;
      font-size: 6.5px;
      line-height: 1;
      font-weight: 800;
      color: #475569;
      background: #f4f7fa;
      text-transform: uppercase;
    }

    .dam-field-value {
      min-height: 18px;
      padding: 3px 4px;
      font-size: 8.5px;
      line-height: 1.2;
      display: flex;
      align-items: center;
      box-sizing: border-box;
    }

    .span-4 { grid-column: span 4; }
    .span-6 { grid-column: span 6; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }

    .dam-responsibility-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-top: 1px solid #000000;
      background: #fcfcfc;
    }

    .dam-responsibility-cell {
      min-width: 0;
      padding: 3px 4px;
      box-sizing: border-box;
    }

    .dam-responsibility-cell + .dam-responsibility-cell {
      border-left: 1px solid #000000;
    }

    .dam-responsibility-label {
      font-size: 5.8px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #374151;
    }

    .dam-responsibility-value {
      margin-top: 2px;
      font-size: 7px;
      line-height: 1.15;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .dam-work-meta {
      border-top: 1px solid #000000;
      padding: 2px 4px;
      font-size: 6.5px;
      line-height: 1.2;
      background: #fafafa;
    }

    .dam-reference {
      border-top: 1px solid #000000;
      border-bottom: 1px solid #000000;
      padding: 2px 4px 1px;
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #fafafa;
    }

    .dam-table-wrap {
      padding: 2px;
      box-sizing: border-box;
    }

    .dam-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .dam-table th,
    .dam-table td {
      border: 1px solid #000000;
      padding: 2.5px 3.5px;
      font-size: 7.2px;
      line-height: 1.2;
      vertical-align: middle;
      box-sizing: border-box;
    }

    .dam-table th {
      font-size: 6.5px;
      font-weight: 800;
      color: #173b59;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #eaf1f6;
    }

    .align-right {
      text-align: right;
    }

    .align-left {
      text-align: left;
    }

    .dam-total-row,
    .dam-summary-row,
    .dam-warning-row,
    .dam-observation-row {
      display: grid;
      border-top: 1px solid #000000;
      box-sizing: border-box;
    }

    .dam-total-row {
      grid-template-columns: 1fr 58mm;
    }

    .dam-total-label,
    .dam-total-value,
    .dam-summary-cell,
    .dam-observation-label,
    .dam-observation-value {
      padding: 2px 4px;
      box-sizing: border-box;
    }

    .dam-total-label {
      font-size: 7.2px;
      line-height: 1;
      font-weight: 800;
      color: #ffffff;
      background: #0f3557;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .dam-total-value {
      border-left: 1px solid #0a2944;
      text-align: right;
      font-size: 10px;
      line-height: 1;
      font-weight: 800;
      color: #ffffff;
      background: #0f3557;
    }

    .dam-responsible-row {
      display: grid;
      grid-template-columns: 42mm 1fr;
      border-top: 1px solid #000000;
    }

    .dam-responsible-label,
    .dam-responsible-value {
      padding: 2px 4px;
      box-sizing: border-box;
    }

    .dam-responsible-label {
      border-right: 1px solid #000000;
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
    }

    .dam-responsible-value {
      font-size: 8px;
      line-height: 1;
    }

    .dam-warning-row {
      grid-template-columns: 1fr;
      padding: 2px 4px 1px;
      text-align: center;
      font-size: 6.5px;
      line-height: 1.15;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #fafafa;
    }

    .dam-observation-row {
      grid-template-columns: 18mm 1fr;
    }

    .dam-observation-label {
      border-right: 1px solid #000000;
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
    }

    .dam-observation-value {
      font-size: 7px;
      line-height: 1.05;
    }

    .dam-summary-row {
      grid-template-columns: repeat(5, 1fr);
    }

    .dam-summary-cell {
      min-width: 0;
      overflow: hidden;
    }

    .dam-summary-cell + .dam-summary-cell {
      border-left: 1px solid #000000;
    }

    .dam-summary-label {
      font-size: 6px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .dam-summary-value {
      margin-top: 2px;
      font-size: 7.2px;
      line-height: 1.15;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .dam-tear-line {
      margin: 1.2mm 0;
      border-top: 1px dashed #91a4b7;
    }

    .dam-receipt-header {
      display: grid;
      /* Malha institucional única: logo, conteúdo e bloco financeiro alinham
         exatamente com as colunas do corpo da guia. */
      grid-template-columns: 22mm minmax(0, 1fr) 58mm;
      min-height: 19mm;
      border-bottom: 1px solid #000000;
      align-items: stretch;
      background: #f8fbfd;
    }

    .dam-receipt-logo {
      border-right: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5mm;
      box-sizing: border-box;
      background: #ffffff;
    }

    .dam-receipt-logo img {
      width: auto;
      height: auto;
      max-width: 17mm;
      max-height: 14mm;
      object-fit: contain;
      display: block;
    }

    .dam-receipt-center {
      text-align: left;
      padding: 2.1mm 2.5mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }

    .dam-receipt-title {
      font-size: 8.6px;
      line-height: 1.06;
      font-weight: 800;
      color: #0f3557;
      text-transform: uppercase;
      letter-spacing: 0.035em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dam-receipt-subline {
      margin-top: 1.2px;
      font-size: 6.15px;
      line-height: 1.12;
      color: #172033;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dam-receipt-right {
      border-left: 1px solid #000000;
      min-width: 0;
      overflow: hidden;
      background: #ffffff;
    }

    .dam-receipt-right .dam-receipt-row {
      grid-template-columns: 22mm minmax(0, 1fr);
      min-height: 9.5mm;
    }

    .dam-receipt-right .dam-receipt-row-label {
      padding: 1.7mm 1.4mm;
      font-size: 5.75px;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
      display: flex;
      align-items: center;
    }

    .dam-receipt-right .dam-receipt-row-value {
      padding: 1.7mm 1.6mm;
      font-size: 6.5px;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: normal;
      overflow-wrap: normal;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
      color: #111827;
    }

    .dam-receipt-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 58mm;
      flex: 0 0 auto;
      min-height: 42mm;
      background: #ffffff;
    }

    .dam-receipt-left {
      border-right: 1px solid #000000;
      min-width: 0;
    }

    .dam-receipt-row {
      display: grid;
      /* Mesmos 22 mm usados na coluna do logo para manter a grade vertical
         perfeitamente alinhada da primeira à última linha. */
      grid-template-columns: 22mm minmax(0, 1fr);
      border-bottom: 1px solid #000000;
      min-width: 0;
    }

    .dam-receipt-row:last-child {
      border-bottom: 0;
    }

    .dam-receipt-row-label {
      border-right: 1px solid #000000;
      padding: 2px 4px;
      font-size: 6.4px;
      line-height: 1.05;
      font-weight: 700;
      text-transform: uppercase;
      box-sizing: border-box;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
    }

    .dam-receipt-row-value {
      padding: 2.5px 4px;
      font-size: 7.7px;
      line-height: 1.16;
      box-sizing: border-box;
      min-width: 0;
      overflow-wrap: normal;
      word-break: normal;
    }

    .dam-note {
      border-bottom: 1px solid #000000;
      padding: 3px 4px;
      font-size: 6.5px;
      line-height: 1.05;
      box-sizing: border-box;
    }

    .dam-auth {
      padding: 3px 4px;
      box-sizing: border-box;
    }

    .dam-auth-label {
      font-size: 6px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
    }

    .dam-auth-value {
      min-height: 7mm;
      font-size: 6.5px;
      line-height: 1.1;
      margin-top: 1px;
    }

    .dam-qr-wrap {
      border-bottom: 1px solid #000000;
      padding: 2px 3px;
      box-sizing: border-box;
    }

    .dam-qrcode-label,
    .dam-bottom-label {
      font-size: 6px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
    }

    .dam-qrcode-box {
      margin-top: 1px;
      min-height: 14mm;
      border: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-sizing: border-box;
    }

    .dam-qrcode-box img,
    .dam-qrcode-box svg {
      width: 96px;
      height: 96px;
      object-fit: contain;
      display: block;
      background: #ffffff;
    }

    .dam-pix-test-warning {
      margin-top: 2px;
      border: 1px solid #f0b45d;
      border-radius: 3px;
      background: #fff7ed;
      color: #9a3412;
      padding: 2px 3px;
      font-size: 5.2px;
      line-height: 1.15;
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
    }

    .dam-pix-copy-label {
      margin-top: 2px;
      font-size: 5.4px;
      line-height: 1;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
    }

    .dam-pix-copy {
      margin-top: 2px;
      border: 1px solid #d4dee7;
      border-radius: 3px;
      background: #f8fafc;
      padding: 2px 3px;
      box-sizing: border-box;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 4.9px;
      line-height: 1.18;
      font-weight: 600;
      word-break: break-all;
      color: #0f172a;
    }

    .dam-qrcode-fallback {
      font-size: 6px;
      line-height: 1;
      text-transform: uppercase;
    }

    .dam-bottom-section {
      border-top: 1px solid #b7c5d2;
      padding: 4px 5px;
      box-sizing: border-box;
      min-height: 12mm;
      background: #f7fafc;
    }

    .dam-digitable-value {
      margin-top: 3px;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 9.4px;
      line-height: 1.15;
      font-weight: 800;
      letter-spacing: 0.035em;
      color: #0f172a;
    }

    .dam-barcode-box {
      margin-top: 3px;
      height: 19mm;
      border: 1px solid #8da1b5;
      background: #ffffff;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      overflow: hidden;
      padding: 2px 3px;
      box-sizing: border-box;
    }

    .dam-barcode-render {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-end;
      gap: 1px;
    }

    .dam-barcode-svg {
      display: block;
      width: 100%;
      height: 49px;
      flex: 1 1 auto;
    }

    .dam-barcode-digits {
      flex: 0 0 auto;
      text-align: center;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 6.2px;
      line-height: 1;
      letter-spacing: 0.055em;
      font-weight: 700;
      color: #111827;
      white-space: nowrap;
    }

    .dam-barcode-fallback {
      width: 100%;
      padding: 0 8px;
      text-align: center;
      font-size: 6px;
      line-height: 1.2;
      text-transform: uppercase;
      color: #374151;
    }

    .dam-barcode-digits {
      margin-top: 2px;
      text-align: center;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 6.3px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: .055em;
      color: #334155;
      word-break: break-all;
    }

    .dam-footer-area {
      display: grid;
      grid-template-columns: 1fr 54mm;
      border-top: 1px solid #b7c5d2;
      min-height: 14mm;
      background: #fbfcfe;
    }

    .dam-footer-left,
    .dam-footer-right {
      padding: 3px 4px;
      box-sizing: border-box;
    }

    .dam-footer-right {
      border-left: 1px solid #000000;
    }

    .dam-footer-note {
      font-size: 6.5px;
      line-height: 1.25;
      color: #111111;
    }

    .dam-guide-tag {
      display: inline-flex;
      align-items: center;
      border: 1px solid #000000;
      padding: 1px 6px;
      font-size: 6px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: #ffffff;
    }

    .dam-auth-box {
      min-height: 15mm;
      margin-top: 2px;
      border: 1px solid #aebdca;
      background: #f8fafc;
      padding: 4px;
      box-sizing: border-box;
      font-size: 6.5px;
    }

    .dam-bank-auth-title {
      font-size: 7px;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #0f3557;
      text-transform: uppercase;
    }

    .dam-bank-auth-line {
      margin-top: 2px;
      font-size: 5.7px;
      line-height: 1.25;
      color: #334155;
      overflow-wrap: anywhere;
      text-transform: none;
    }

    .dam-bank-auth[data-tone="paid"] {
      border-color: #86c89b;
      background: #f0fbf3;
    }

    .dam-bank-auth[data-tone="test"] {
      border-color: #d4b768;
      background: #fff9e8;
    }

    .dam-bank-auth[data-tone="pending"] {
      border-color: #9db8d1;
      background: #f3f8fc;
    }

    .dam-final-area {
      display: grid;
      grid-template-columns: 1fr 54mm;
      border-top: 1px solid #b7c5d2;
      flex: 0 0 auto;
      min-height: 19mm;
      background: #f8fbfd;
    }

    .dam-final-left,
    .dam-final-right {
      padding: 3px 4px;
      box-sizing: border-box;
    }

    .dam-final-right {
      border-left: 1px solid #000000;
    }

    .dam-final-text {
      font-size: 6.5px;
      line-height: 1.25;
      margin-top: 2px;
    }

    .dam-final-box {
      margin-top: 3px;
      border: 1px solid #c0ccd7;
      min-height: 11mm;
      padding: 3px 4px;
      box-sizing: border-box;
      font-size: 6.2px;
      line-height: 1.3;
      background: #ffffff;
    }

    .dam-final-box > div + div {
      margin-top: 1.5px;
    }

    .dam-final-right-box {
      margin-top: 3px;
      border: 1px solid #c0ccd7;
      min-height: 11mm;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 6.5px;
      line-height: 1.2;
      text-transform: uppercase;
      padding: 3px;
      box-sizing: border-box;
    }

    @media print {
      html, body {
        width: 210mm;
        min-height: 297mm;
        background: #ffffff !important;
      }

      /* Mantém a guia inteira em A4 com respiro institucional real.
         A largura compensada preserva a malha e centraliza o documento após o zoom. */
      .dam-root {
        zoom: 0.90;
        width: 111.111%;
        transform-origin: top center;
      }

      .print-hide {
        display: none !important;
      }

      .dam-sheet,
      .dam-sheet * {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .dam-sheet {
        margin: 0 auto !important;
        border-color: #000000 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }

      .dam-homologation-band {
        background: #fff7ed !important;
        color: #9a3412 !important;
        border-color: #d97706 !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      .dam-barcode-svg,
      .dam-barcode-svg rect {
        fill: #000000 !important;
        color: #000000 !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      .dam-receipt-right,
      .dam-summary-row,
      .dam-header-right {
        overflow: hidden !important;
      }
    }
  `;
}

function FormCell({
  label,
  value,
  spanClass,
}: {
  label: string;
  value?: React.ReactNode;
  spanClass: string;
}) {
  return (
    <div className={`dam-field ${spanClass}`}>
      <div className="dam-field-label">{label}</div>
      <div className="dam-field-value">{value || <span>&nbsp;</span>}</div>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="dam-receipt-row">
      <div className="dam-receipt-row-label">{label}</div>
      <div className="dam-receipt-row-value">{value || <span>&nbsp;</span>}</div>
    </div>
  );
}

function inferGuideKind(guia: GuiaData, itens: TaxaItem[]) {
  const reference = `${guia.referencia || ""} ${itens.map((item) => item.divida || "").join(" ")}`.toLowerCase();
  if (reference.includes("iss")) {
    return {
      title: "GUIA DE ISSQN / PROJETO",
      description: "Documento de arrecadação municipal de ISSQN / Projeto calculado conforme a metragem e o uso da edificação.",
      shortLabel: "ISSQN / Projeto",
      documentClass: "Arrecadação tributária",
    };
  }
  if (
    reference.includes("aprov") ||
    reference.includes("habite") ||
    reference.includes("recolhimento vinculado à obra") ||
    reference.includes("recolhimento vinculado a obra") ||
    reference.includes("guia de recolhimento da obra")
  ) {
    return {
      title: "GUIA DE RECOLHIMENTO DA OBRA",
      description: "Documento de arrecadação municipal gerado após a aprovação técnica, conforme o workflow definido pela Prefeitura e as regras financeiras oficiais.",
      shortLabel: "Recolhimento da obra",
      documentClass: "Arrecadação da obra",
    };
  }
  return {
    title: "GUIA DE RECOLHIMENTO DE PROTOCOLO",
    description: "Documento de arrecadação municipal emitido na abertura do processo administrativo e vinculado ao protocolo.",
    shortLabel: "Protocolo",
    documentClass: "Arrecadação inicial",
  };
}

export const GuiaRecolhimentoOficial = React.forwardRef<
  HTMLDivElement,
  GuiaRecolhimentoOficialProps
>(function GuiaRecolhimentoOficial(
  { prefeitura, contribuinte, guia, itens, className = "" },
  ref,
) {
  const guideMeta = inferGuideKind(guia, itens);
  const totalPrincipal = sumValues(itens, "principal");
  const totalMulta = sumValues(itens, "multa");
  const totalJuros = sumValues(itens, "juros");
  const totalCorrecao = sumValues(itens, "correcao");
  const totalDocumento =
    guia.valorDocumento ??
    itens.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const descontos = Number(guia.descontos || 0);
  const outrosAcrescimos = Number(guia.outrosAcrescimos || 0);
  const valorCobrado =
    guia.valorCobrado ?? totalDocumento - descontos + outrosAcrescimos;
  const bankAuth = bankAuthenticationLabel(guia);
  const nonPayable = guia.nonPayablePreview === true;

  const prefeituraEndereco = [
    prefeitura.endereco,
    prefeitura.cidade,
    prefeitura.uf,
    prefeitura.cep,
  ]
    .filter(Boolean)
    .join(" - ");

  const visibleItens = itens.slice(0, 8);
  const resolvedMunicipalityLogo =
    String(prefeitura.logoUrl || "").trim();

  // Screen branding zoom/crop does not fit the smaller printed DAM frame.
  const headerLogoStyle: React.CSSProperties = { objectFit: "contain", transform: "none" };
  const footerLogoStyle: React.CSSProperties = { objectFit: "contain", transform: "none" };

  return (
    <div ref={ref} className={`dam-root ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: getStyles() }} />

      <div className="dam-toolbar print-hide">
        <button
          type="button"
          data-dam-print-button="true"
          className="dam-print-button"
        >
          Imprimir / Salvar PDF
        </button>
      </div>

      <div className="dam-sheet">
        <div className="dam-stack">
          <div className="dam-block dam-block-top">
            <div className="dam-header">
              <div className="dam-logo-box">
                {resolvedMunicipalityLogo ? (
                  <img
                    src={resolvedMunicipalityLogo}
                    alt="Logo da Prefeitura"
                    className="dam-logo"
                    style={headerLogoStyle}
                  />
                ) : (
                  <div className="dam-logo-fallback">PM</div>
                )}
              </div>

              <div className="dam-header-center">
                <div className="dam-municipality-name">{prefeitura.nome}</div>
                {prefeitura.secretaria ? (
                  <div className="dam-header-line">{prefeitura.secretaria}</div>
                ) : null}
                {prefeituraEndereco ? (
                  <div className="dam-header-line normal">{prefeituraEndereco}</div>
                ) : null}
                {prefeitura.telefone ? (
                  <div className="dam-header-line normal">
                    Tel.: {prefeitura.telefone}
                  </div>
                ) : null}
              </div>

              <div className="dam-header-right">
                <div className="dam-header-right-title">
                  {prefeitura.cadastroTitulo || "Cadastro Eventual"}
                </div>
                <div className="dam-header-right-grid">
                  <div className="dam-mini-cell">
                    <div className="dam-mini-label">Nº Guia</div>
                    <div className="dam-mini-value">{guia.numeroGuia}</div>
                  </div>
                  <div className="dam-mini-cell">
                    <div className="dam-mini-label">Exercicio</div>
                    <div className="dam-mini-value">
                      {guia.exercicio || new Date().getFullYear()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dam-title">{nonPayable ? "Prévia de guia — não pagável" : guideMeta.title}</div>

            {guia.bankEnvironment === "test" ? (
              <div className="dam-homologation-band">
                <span className="dam-homologation-dot" />
                {nonPayable
                  ? "PRÉVIA ADMINISTRATIVA DE HOMOLOGAÇÃO — NÃO PAGÁVEL — SEM COBRANÇA BANCÁRIA"
                  : "Homologação Mercado Pago — documento de teste — não efetuar pagamento"}
              </div>
            ) : null}

            <div className="dam-subtitle-band">
              <div className="dam-subtitle-main">
                <div className="dam-subtitle-label">Documento de arrecadação municipal</div>
                <div className="dam-subtitle-value">{guideMeta.description}</div>
              </div>
              <div className="dam-subtitle-side">
                <div className="dam-subtitle-label">Tipo da guia</div>
                <div className="dam-subtitle-value">{guideMeta.shortLabel}</div>
                <div style={{ marginTop: "2px" }}>
                  <span className="dam-guide-tag">{guideMeta.documentClass}</span>
                </div>
              </div>
            </div>

            <div className="dam-fields-grid">
              <FormCell
                label="Nº do Cadastro"
                value={contribuinte.numeroCadastro}
                spanClass="span-6"
              />
              <FormCell
                label="CNPJ/CPF"
                value={contribuinte.cpfCnpj}
                spanClass="span-6"
              />
              <FormCell
                label="Contribuinte"
                value={contribuinte.nome}
                spanClass="span-8"
              />
              <FormCell
                label="Data do Documento"
                value={formatDateBR(guia.dataDocumento)}
                spanClass="span-4"
              />
              <FormCell
                label="Endereço"
                value={contribuinte.endereco}
                spanClass="span-12"
              />
            </div>

            {(guia.proprietario || guia.profissionalResponsavel || guia.analistaSolicitante || guia.funcionarioEmissor) ? (
              <>
                <div className="dam-responsibility-grid">
                  {[
                    ["Proprietário", guia.proprietario || contribuinte.nome],
                    ["Profissional responsável", guia.profissionalResponsavel || ""],
                    ["Analista responsável", guia.analistaSolicitante || ""],
                    ["Responsável pela emissão", guia.funcionarioEmissor || guia.funcionarioResponsavel || ""],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="dam-responsibility-cell">
                      <div className="dam-responsibility-label">{label}</div>
                      <div className="dam-responsibility-value">{value || "—"}</div>
                    </div>
                  ))}
                </div>
                {(guia.areaObra || guia.usoObra || guia.padraoConstrutivo) ? (
                  <div className="dam-work-meta">
                    <strong>Dados da obra:</strong>{" "}
                    {[
                      guia.areaObra ? `${Number(guia.areaObra).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : "",
                      guia.usoObra || "",
                      guia.padraoConstrutivo || "",
                    ].filter(Boolean).join(" • ")}
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="dam-reference">
              {guia.referencia || guideMeta.shortLabel}
            </div>

            <div className="dam-table-wrap">
              <table className="dam-table">
                <thead>
                  <tr>
                    {[
                      "Ano",
                      "Divida",
                      "Tabela",
                      "SB",
                      "PC",
                      "Principal",
                      "Multa",
                      "Juros",
                      "Correcao",
                      "Total",
                    ].map((label, index) => (
                      <th
                        key={label}
                        className={index <= 4 ? "align-left" : "align-right"}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleItens.length > 0 ? (
                    visibleItens.map((item, index) => (
                      <tr key={`${item.ano}-${index}`}>
                        <td>{item.ano}</td>
                        <td>{item.divida}</td>
                        <td>{item.tabela || ""}</td>
                        <td>{item.sb ?? ""}</td>
                        <td>{item.pc ?? ""}</td>
                        <td className="align-right">
                          {formatCurrency(item.principal)}
                        </td>
                        <td className="align-right">
                          {formatCurrency(item.multa)}
                        </td>
                        <td className="align-right">
                          {formatCurrency(item.juros)}
                        </td>
                        <td className="align-right">
                          {formatCurrency(item.correcao)}
                        </td>
                        <td className="align-right">
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "3px 2px" }}>
                        Nenhum item de cobranca informado.
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td colSpan={5} className="align-right" style={{ fontWeight: 700 }}>
                      Totais
                    </td>
                    <td className="align-right" style={{ fontWeight: 700 }}>
                      {formatCurrency(totalPrincipal)}
                    </td>
                    <td className="align-right" style={{ fontWeight: 700 }}>
                      {formatCurrency(totalMulta)}
                    </td>
                    <td className="align-right" style={{ fontWeight: 700 }}>
                      {formatCurrency(totalJuros)}
                    </td>
                    <td className="align-right" style={{ fontWeight: 700 }}>
                      {formatCurrency(totalCorrecao)}
                    </td>
                    <td className="align-right" style={{ fontWeight: 700 }}>
                      {formatCurrency(totalDocumento)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="dam-total-row">
              <div className="dam-total-label">{nonPayable ? "VALOR REFERENCIAL — NÃO PAGAR" : guia.bankEnvironment === "test" ? "VALOR DO BOLETO DE TESTE — NÃO PAGAR" : "VALOR TOTAL A PAGAR"}</div>
              <div className="dam-total-value">{formatCurrency(totalDocumento)}</div>
            </div>

            <div className="dam-responsible-row">
              <div className="dam-responsible-label">
                Responsável pela Emissão
              </div>
              <div className="dam-responsible-value">
                {guia.funcionarioEmissor || guia.funcionarioResponsavel || guia.analistaSolicitante || ""}
              </div>
            </div>

            <div className="dam-warning-row">
              {nonPayable
                ? "** SOMENTE PRÉVIA DE TESTE — SEM BOLETO REGISTRADO — NÃO PAGAR **"
                : guia.bankEnvironment === "test"
                  ? "** BOLETO EMITIDO NO AMBIENTE DE TESTES — NÃO PAGAR — SEM VALIDADE DE ARRECADAÇÃO OFICIAL **"
                : guia.paymentProvider === "mercado_pago"
                  ? "** VALIDAÇÃO ELETRÔNICA PELO PROVEDOR DE PAGAMENTO ** ** NÃO RECEBER APÓS O VENCIMENTO **"
                  : "** VÁLIDO SOMENTE COM AUTENTICAÇÃO / BAIXA OFICIAL ** ** NÃO RECEBER APÓS O VENCIMENTO **"}
            </div>

            <div className="dam-observation-row">
              <div className="dam-observation-label">Observação</div>
              <div className="dam-observation-value">
                {guia.observacao || " "}
              </div>
            </div>

            <div className="dam-summary-row">
              {[
                ["No Guia", guia.numeroGuia],
                ["Vencimento", formatDateBR(guia.vencimento)],
                ["(+) Outras Acresc.", formatCurrency(outrosAcrescimos)],
                ["Valor Documento", formatCurrency(totalDocumento)],
                ["(=) Valor Cobrado", formatCurrency(valorCobrado)],
              ].map(([label, value]) => (
                <div key={String(label)} className="dam-summary-cell">
                  <div className="dam-summary-label">{label}</div>
                  <div className="dam-summary-value">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="dam-tear-line" />

          <div className="dam-block dam-block-bottom">
            <div className="dam-receipt-header">
              <div className="dam-receipt-logo">
                {resolvedMunicipalityLogo ? (
                  <img src={resolvedMunicipalityLogo} alt="Logo da Prefeitura" style={footerLogoStyle} />
                ) : (
                  <div className="dam-logo-fallback" style={{ width: 18, height: 18 }}>
                    PM
                  </div>
                )}
              </div>

              <div className="dam-receipt-center">
                <div className="dam-receipt-title">{prefeitura.nome}</div>
                {prefeitura.secretaria ? (
                  <div className="dam-receipt-subline" style={{ fontWeight: 700 }}>
                    {prefeitura.secretaria}
                  </div>
                ) : null}
                <div className="dam-receipt-subline">
                  {[prefeitura.endereco, prefeitura.cidade, prefeitura.uf]
                    .filter(Boolean)
                    .join(" - ")}
                </div>
                <div className="dam-receipt-subline" style={{ fontWeight: 700, textTransform: "uppercase" }}>
                  {prefeitura.cadastroTitulo || "Cadastro Eventual"}
                </div>
              </div>

              <div className="dam-receipt-right">
                <ReceiptRow
                  label="Vencimento"
                  value={formatDateBR(guia.vencimento)}
                />
                <ReceiptRow label="Nº Guia" value={guia.numeroGuia} />
              </div>
            </div>

            <div className="dam-receipt-body">
              <div className="dam-receipt-left">
                <ReceiptRow
                  label="Nº do Cadastro"
                  value={contribuinte.numeroCadastro}
                />
                <ReceiptRow label="CNPJ/CPF" value={contribuinte.cpfCnpj} />
                <ReceiptRow
                  label="Data Emissão"
                  value={formatDateBR(guia.dataDocumento)}
                />
                <ReceiptRow label="Pagador" value={contribuinte.nome} />
                <ReceiptRow label="Endereço" value={contribuinte.endereco} />

                <div className="dam-note">
                  {guia.bankAgency || guia.bankAccount || guia.bankBeneficiary ? (
                    <div data-dam-municipal-bank="true" style={{ marginBottom: 3, fontSize: "6px", lineHeight: 1.35, overflowWrap: "anywhere" }}>
                      <strong>Arrecadação municipal:</strong>{" "}
                      {[
                        guia.bankMunicipalName && `Banco ${guia.bankCode ? `${guia.bankCode} • ` : ""}${guia.bankMunicipalName}`,
                        guia.bankAgency && `Ag. ${guia.bankAgency}`,
                        guia.bankAccount && `Conta ${guia.bankAccount}`,
                        guia.bankBeneficiary && `Favorecido: ${guia.bankBeneficiary}`,
                      ].filter(Boolean).join(" | ")}
                    </div>
                  ) : null}
                  <div>
                    {nonPayable
                      ? `Provedor selecionado para homologação: ${guia.bankName || "não informado"}. Nenhuma cobrança bancária emitida; não efetuar pagamento.`
                      : guia.bankName
                        ? `Provedor de cobrança: ${guia.bankName}${guia.bankAgreement ? ` • Convênio ${guia.bankAgreement}` : ""}. Não receber após o vencimento.`
                        : "Pagamento pelos canais oficiais indicados pela Prefeitura. Não receber após o vencimento."}
                  </div>
                  {guia.bankReference || guia.bankPaymentId ? (
                    <div style={{ marginTop: 2, fontSize: "5.5px", color: "#475569" }}>
                      {[guia.bankReference ? `Order: ${guia.bankReference}` : "", guia.bankPaymentId ? `Payment: ${guia.bankPaymentId}` : ""]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  ) : null}
                </div>

                <div className="dam-auth">
                  <div className="dam-auth-label">
                    {nonPayable ? "Emissão bancária" : guia.paymentProvider === "mercado_pago" ? "Validação eletrônica" : "Autenticação / baixa"}
                  </div>
                  <div className="dam-auth-value">
                    {guia.paymentProvider === "mercado_pago" ? (
                      <>
                        {bankAuth.title}
                        {guia.bankPaymentId ? <> • Payment {guia.bankPaymentId}</> : null}
                      </>
                    ) : (
                      guia.autenticacaoMecanica || "Aguardando baixa oficial"
                    )}
                  </div>
                </div>
              </div>

              <div>
                <ReceiptRow
                  label="Valor Doc."
                  value={formatCurrency(totalDocumento)}
                />
                <ReceiptRow
                  label="(-) Descontos"
                  value={formatCurrency(descontos)}
                />
                <ReceiptRow
                  label="(+) Acresc."
                  value={formatCurrency(outrosAcrescimos)}
                />
                <ReceiptRow
                  label="(+) Juros"
                  value={formatCurrency(totalJuros)}
                />
                <ReceiptRow
                  label="(+) Multa"
                  value={formatCurrency(totalMulta)}
                />
                <ReceiptRow
                  label="(=) Valor"
                  value={formatCurrency(valorCobrado)}
                />

                {guia.pixPayload ? (
                  <div className="dam-qr-wrap">
                    <div className="dam-qrcode-label">PIX — QR Code e Copia e Cola</div>
                    {guia.bankEnvironment === "test" ? (
                      <div className="dam-pix-test-warning">
                        PIX cadastrado pode ser real — não efetuar pagamento durante a homologação.
                      </div>
                    ) : null}
                    <div className="dam-qrcode-box">
                      <QRCodeSVG value={guia.pixPayload} size={96} level="M" marginSize={4} />
                    </div>
                    <div className="dam-pix-copy-label">PIX Copia e Cola</div>
                    <div className="dam-pix-copy">{guia.pixPayload}</div>
                  </div>
                ) : guia.qrCodePixUrl ? (
                  <div className="dam-qr-wrap">
                    <div className="dam-qrcode-label">PIX — QR Code oficial</div>
                    <div className="dam-qrcode-box">
                      <img src={guia.qrCodePixUrl} alt="QR Code PIX" />
                    </div>
                  </div>
                ) : (
                  <div className="dam-qr-wrap">
                    <div className="dam-qrcode-label">PIX</div>
                    <div className="dam-qrcode-box">
                      <span className="dam-qrcode-fallback">
                        {nonPayable ? "Não emitido — prévia sem cobrança bancária" : "PIX não configurado para esta Prefeitura."}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="dam-bottom-section">
              <div className="dam-bottom-label">Linha Digitável</div>
              <div className="dam-digitable-value">
                {nonPayable ? "NÃO EMITIDA — PRÉVIA DE HOMOLOGAÇÃO" : formatDigitableLine(guia.linhaDigitavel)}
              </div>
            </div>

            <div className="dam-bottom-section">
              <div className="dam-bottom-label">Código de Barras</div>
              <div className="dam-barcode-box">
                {nonPayable
                  ? <span className="dam-barcode-fallback">NÃO EMITIDO — nenhuma cobrança foi registrada no provedor</span>
                  : <ProviderBarcode value={guia.codigoBarras} />}
              </div>
            </div>

            <div className="dam-footer-area">
              <div className="dam-footer-left">
                <div className="dam-bottom-label">Instruções de pagamento</div>
                <div className="dam-footer-note">
                  {nonPayable
                    ? "SOMENTE HOMOLOGAÇÃO — prévia administrativa, sem pagamento, PIX, código de barras ou confirmação bancária."
                    : guia.bankInstructions ||
                    (guia.linhaDigitavel || guia.pixPayload || guia.qrCodePixUrl
                      ? "Efetue o pagamento pelo canal oficial indicado pela Prefeitura. Após a compensação, o recolhimento poderá ser conferido na tramitação administrativa."
                      : "Não há linha digitável nem PIX oficial nesta via. Solicite à Tesouraria o meio de arrecadação válido antes de efetuar o pagamento.")}
                </div>
              </div>
              <div className="dam-footer-right">
                <div className="dam-bottom-label">Autenticação bancária</div>
                <div className="dam-auth-box dam-bank-auth" data-tone={bankAuth.tone}>
                  <div className="dam-bank-auth-title">{bankAuth.title}</div>
                  {bankAuth.lines.map((line) => (
                    <div key={line} className="dam-bank-auth-line">{line}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dam-final-area">
              <div className="dam-final-left">
                <div className="dam-bottom-label">Controle e conciliação da arrecadação</div>
                <div className="dam-final-text">
                  {nonPayable
                    ? "Prévia para testar o fluxo administrativo. Não comprova emissão, autenticação ou compensação bancária."
                    : "Guia vinculada ao processo administrativo e ao provedor oficial de cobrança."}
                </div>
                <div className="dam-final-box">
                  <div><strong>Provedor:</strong> {guia.bankName || "Arrecadação municipal"}</div>
                  <div><strong>Situação:</strong> {bankAuth.title}</div>
                  {guia.bankReference ? <div><strong>Order:</strong> {guia.bankReference}</div> : null}
                  {guia.bankPaymentId ? <div><strong>Payment:</strong> {guia.bankPaymentId}</div> : null}
                  {guia.bankAuthenticatedAt ? (
                    <div><strong>Compensação:</strong> {formatDateTimeBR(guia.bankAuthenticatedAt)}</div>
                  ) : null}
                </div>
              </div>
              <div className="dam-final-right">
                <div className="dam-bottom-label">Tesouraria / baixa manual</div>
                <div className="dam-final-right-box">
                  {nonPayable
                    ? "Não realizada. Prévia de homologação sem pagamento."
                    : guia.autenticacaoMecanica ||
                      (guia.paymentProvider === "mercado_pago"
                        ? "Dispensada após confirmação eletrônica do provedor."
                        : "Carimbo, assinatura, data e identificação do agente arrecadador.")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

function toAbsoluteGuideAssetUrl(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://sigapromunicipal.com.br";
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

export function buildGuiaRecolhimentoOficialHtml(
  props: GuiaRecolhimentoOficialProps,
  options?: { title?: string; autoPrint?: boolean },
) {
  const banking = normalizeOfficialBanking(props.guia.codigoBarras, props.guia.linhaDigitavel);
  const normalizedProps: GuiaRecolhimentoOficialProps = {
    ...props,
    prefeitura: {
      ...props.prefeitura,
      logoUrl: toAbsoluteGuideAssetUrl(props.prefeitura.logoUrl),
    },
    guia: {
      ...props.guia,
      // Defense in depth: never expose a payable artifact in an admin-only QA preview.
      codigoBarras: props.guia.nonPayablePreview ? "" : banking.barcode,
      linhaDigitavel: props.guia.nonPayablePreview ? "" : banking.digitableLine,
      qrCodePixUrl: props.guia.nonPayablePreview ? "" : toAbsoluteGuideAssetUrl(props.guia.qrCodePixUrl),
      pixPayload: props.guia.nonPayablePreview ? "" : props.guia.pixPayload,
      bankReference: props.guia.nonPayablePreview ? undefined : props.guia.bankReference,
      bankPaymentId: props.guia.nonPayablePreview ? undefined : props.guia.bankPaymentId,
      bankAuthenticatedAt: props.guia.nonPayablePreview ? undefined : props.guia.bankAuthenticatedAt,
    },
  };
  const markup = renderToStaticMarkup(<GuiaRecolhimentoOficial {...normalizedProps} />);
  const title = options?.title || props.guia.numeroGuia;
  const autoPrint = options?.autoPrint ?? true;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    ${markup}
    <script>
      (function () {
        function bindDamPrint() {
          var buttons = document.querySelectorAll('[data-dam-print-button="true"]');
          buttons.forEach(function (button) {
            button.addEventListener('click', function () {
              window.focus();
              window.print();
            });
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', bindDamPrint, { once: true });
        } else {
          bindDamPrint();
        }
      })();
    </script>
    ${autoPrint ? `<script>
      window.addEventListener('load', function () {
        var images = Array.prototype.slice.call(document.images || []);
        var pending = images.map(function (img) {
          if (img.complete) return Promise.resolve();
          return new Promise(function (resolve) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        });
        Promise.all(pending).then(function () {
          window.setTimeout(function () { window.print(); }, 180);
        });
      }, { once: true });
    </script>` : ""}
  </body>
</html>`;
}

export function reserveGuiaRecolhimentoOficialWindow(title = "Guia de recolhimento") {
  const popup = window.open("about:blank", "_blank");
  if (!popup) return null;

  try {
    popup.document.title = title;
    popup.document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef3f8;font-family:Segoe UI,Arial,sans-serif;color:#0f3557">
        <div style="padding:24px 28px;border:1px solid #d7e0e8;border-radius:14px;background:#fff;box-shadow:0 14px 34px rgba(15,53,87,.12);font-weight:700">
          Preparando guia oficial...
        </div>
      </div>
    `;
  } catch {
    // A janela reservada continua válida mesmo se o navegador limitar o acesso inicial.
  }

  popup.focus();
  return popup;
}

export function openGuiaRecolhimentoOficialWindow(
  props: GuiaRecolhimentoOficialProps,
  options?: { title?: string; autoPrint?: boolean },
  reservedWindow?: Window | null,
) {
  const html = buildGuiaRecolhimentoOficialHtml(props, options);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const previewUrl = URL.createObjectURL(blob);
  const popup =
    reservedWindow && !reservedWindow.closed
      ? reservedWindow
      : window.open(previewUrl, "_blank");

  if (!popup) {
    URL.revokeObjectURL(previewUrl);
    return null;
  }

  if (reservedWindow && !reservedWindow.closed) {
    try {
      popup.location.replace(previewUrl);
    } catch {
      popup.location.href = previewUrl;
    }
  }

  popup.focus();
  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  return popup;
}
