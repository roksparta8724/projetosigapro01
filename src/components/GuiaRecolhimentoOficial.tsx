/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";

type PrefeituraData = {
  nome: string;
  secretaria?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  logoUrl?: string;
  logoObjectKey?: string;
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

type ElectronicSignatureData = {
  signerName: string;
  signerTitle?: string;
  departmentCode?: string;
  departmentName?: string;
  signedAt: string;
  signatureCode: string;
  signatureFingerprint: string;
  assuranceLabel?: string;
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
  valorDocumento?: number;
  descontos?: number;
  outrosAcrescimos?: number;
  valorCobrado?: number;
  autenticacaoMecanica?: string;
  referencia?: string;
  assinaturaEletronica?: ElectronicSignatureData;
};

export type GuiaRecolhimentoOficialProps = {
  prefeitura: PrefeituraData;
  contribuinte: ContribuinteData;
  guia: GuiaData;
  itens: TaxaItem[];
  className?: string;
};

function GuideInstitutionLogo({
  source,
  className,
  compact = false,
}: {
  source?: string;
  className?: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  const normalizedSource = String(source || "").trim();

  if (!normalizedSource || failed) {
    return (
      <div
        className="dam-logo-fallback"
        style={compact ? { width: 18, height: 18 } : undefined}
        aria-label="Brasão institucional indisponível"
      >
        Brasão
      </div>
    );
  }

  return (
    <img
      src={normalizedSource}
      alt="Brasão da Prefeitura"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

function formatCurrency(value?: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateBR(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function sumValues(items: TaxaItem[], field: keyof TaxaItem) {
  return items.reduce((acc, item) => acc + Number(item[field] || 0), 0);
}

function formatDigitableLine(value?: string) {
  const raw = (value || "").replace(/\s+/g, "");
  if (!raw) return "Sem linha digitável oficial — consulte a Prefeitura.";
  return raw.match(/.{1,5}/g)?.join(" ") ?? raw;
}

function renderBarcodeVisual(code?: string) {
  const digits = (code || "").replace(/\D/g, "");
  if (!digits) return "Código bancário não informado pela Prefeitura.";
  return digits
    .slice(0, 44)
    .split("")
    .map((digit) => {
      const value = Number(digit);
      if (Number.isNaN(value)) return "|";
      if (value <= 2) return "||";
      if (value <= 5) return "|||";
      if (value <= 7) return "||||";
      return "|||||";
    })
    .join(" ");
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
      background: #ffffff;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
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
      display: flex;
      justify-content: flex-end;
      margin: 0 0 2mm 0;
    }

    .dam-print-button {
      border: 1px solid #000000;
      background: #ffffff;
      color: #000000;
      font-size: 11px;
      line-height: 1;
      padding: 6px 10px;
      cursor: pointer;
    }

    .dam-sheet {
      width: 200mm;
      height: 286.5mm;
      max-height: 286.5mm;
      min-height: 286.5mm;
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid #111827;
      background: #ffffff;
      padding: 2.8mm;
      box-sizing: border-box;
    }

    .dam-stack {
      display: flex;
      flex-direction: column;
      gap: 1mm;
      height: 100%;
    }

    .dam-block {
      border: 1px solid #000000;
    }

    .dam-block-top {
      flex: 0 0 auto;
    }

    .dam-block-bottom {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }

    .dam-header {
      display: grid;
      grid-template-columns: 74px 1fr 92px;
      border-bottom: 1px solid #000000;
      align-items: stretch;
    }

    .dam-logo-box,
    .dam-header-right {
      box-sizing: border-box;
    }

    .dam-logo-box {
      height: 56px;
      border-right: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }

    .dam-logo {
      max-width: 54px;
      max-height: 48px;
      object-fit: contain;
      display: block;
    }

    .dam-logo-fallback {
      width: 32px;
      height: 32px;
      border: 1px dashed #9ca3af;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 5.5px;
      line-height: 1.15;
      color: #6b7280;
      text-align: center;
      text-transform: uppercase;
      padding: 2px;
      box-sizing: border-box;
    }

    .dam-header-center {
      height: 56px;
      padding: 4px 7px;
      text-align: left;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      box-sizing: border-box;
    }

    .dam-municipality-name {
      font-size: 10px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .dam-header-line {
      font-size: 7px;
      line-height: 1;
      text-transform: uppercase;
    }

    .dam-header-line.normal {
      text-transform: none;
    }

    .dam-header-right {
      border-left: 1px solid #000000;
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
      grid-template-columns: 1fr 1fr;
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
    }

    .dam-title {
      border-bottom: 1px solid #000000;
      padding: 3px 0 2px;
      text-align: center;
      font-size: 10.5px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .dam-subtitle-band {
      display: grid;
      grid-template-columns: 1fr 54mm;
      border-bottom: 1px solid #000000;
      background: #fafafa;
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
      border-bottom: 1px solid #000000;
      padding: 2px 3px 1px;
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
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
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #fafafa;
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
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .dam-total-value {
      border-left: 1px solid #000000;
      text-align: right;
      font-size: 9.5px;
      line-height: 1;
      font-weight: 700;
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
      margin: 0.9mm 0;
      border-top: 1px dashed #000000;
    }

    .dam-receipt-header {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 116px;
      border-bottom: 1px solid #000000;
      align-items: stretch;
    }

    .dam-receipt-logo {
      border-right: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      box-sizing: border-box;
    }

    .dam-receipt-logo img {
      max-width: 44px;
      max-height: 40px;
      object-fit: contain;
    }

    .dam-receipt-center {
      text-align: left;
      padding: 3px 6px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .dam-receipt-title {
      font-size: 8px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .dam-receipt-subline {
      margin-top: 1px;
      font-size: 6px;
      line-height: 1;
    }

    .dam-receipt-right {
      border-left: 1px solid #000000;
      min-width: 0;
      overflow: hidden;
    }

    .dam-receipt-right .dam-receipt-row {
      grid-template-columns: 50px minmax(0, 1fr);
    }

    .dam-receipt-right .dam-receipt-row-label {
      padding: 3px 4px;
      font-size: 6px;
      line-height: 1.15;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .dam-receipt-right .dam-receipt-row-value {
      padding: 3px 4px;
      font-size: 7.5px;
      line-height: 1.15;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
    }

    .dam-receipt-body {
      display: grid;
      grid-template-columns: 1fr 64mm;
      flex: 1 1 auto;
      min-height: 72mm;
    }

    .dam-receipt-left {
      border-right: 1px solid #000000;
    }

    .dam-receipt-row {
      display: grid;
      grid-template-columns: 66px minmax(0, 1fr);
      border-bottom: 1px solid #000000;
      min-width: 0;
    }

    .dam-receipt-row:last-child {
      border-bottom: 0;
    }

    .dam-receipt-row-label {
      border-right: 1px solid #000000;
      padding: 2px 3px;
      font-size: 7px;
      line-height: 1;
      font-weight: 700;
      text-transform: uppercase;
      box-sizing: border-box;
    }

    .dam-receipt-row-value {
      padding: 2.5px 4px;
      font-size: 8px;
      line-height: 1.2;
      box-sizing: border-box;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .dam-note {
      border-bottom: 1px solid #000000;
      padding: 3px 4px;
      font-size: 6.5px;
      line-height: 1.05;
      box-sizing: border-box;
    }

    .dam-electronic-signature {
      margin-top: 3px;
      border: 1px solid #000000;
      display: grid;
      grid-template-columns: 22mm minmax(0, 1fr);
      box-sizing: border-box;
      background: #ffffff;
    }

    .dam-electronic-signature-badge {
      border-right: 1px solid #000000;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 6.5px;
      line-height: 1.25;
      font-weight: 800;
      text-transform: uppercase;
      box-sizing: border-box;
    }

    .dam-electronic-signature-body {
      padding: 4px 5px;
      font-size: 6.5px;
      line-height: 1.35;
      box-sizing: border-box;
    }

    .dam-electronic-signature-body strong {
      font-size: 7px;
    }

    .dam-electronic-signature-code {
      margin-top: 2px;
      font-family: "Courier New", monospace;
      font-size: 6px;
      overflow-wrap: anywhere;
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
      min-height: 18mm;
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

    .dam-qrcode-box img {
      width: 18px;
      height: 18px;
      object-fit: contain;
      display: block;
    }

    .dam-qrcode-fallback {
      font-size: 6px;
      line-height: 1;
      text-transform: uppercase;
    }

    .dam-bottom-section {
      border-top: 1px solid #000000;
      padding: 3px 4px;
      box-sizing: border-box;
      min-height: 11mm;
      background: #fcfcfc;
    }

    .dam-digitable-value {
      margin-top: 1px;
      font-size: 7.5px;
      line-height: 1;
      letter-spacing: 0.02em;
    }

    .dam-barcode-box {
      margin-top: 2px;
      height: 14mm;
      border: 1px solid #000000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      overflow: hidden;
      padding: 2px 3px;
      box-sizing: border-box;
    }

    .dam-barcode-text {
      width: 100%;
      text-align: center;
      font-size: 13px;
      line-height: 1;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    .dam-footer-area {
      display: grid;
      grid-template-columns: 1fr 54mm;
      border-top: 1px solid #000000;
      min-height: 19mm;
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
      border: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 6.5px;
      text-transform: uppercase;
    }

    .dam-final-area {
      display: grid;
      grid-template-columns: 1fr 54mm;
      border-top: 1px solid #000000;
      flex: 1 1 auto;
      min-height: 42mm;
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
      border: 1px solid #000000;
      min-height: 28mm;
      padding: 3px 4px;
      box-sizing: border-box;
      font-size: 6.5px;
      line-height: 1.2;
    }

    .dam-final-right-box {
      margin-top: 3px;
      border: 1px solid #000000;
      min-height: 28mm;
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

      .print-hide {
        display: none !important;
      }

      .dam-sheet,
      .dam-sheet * {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .dam-sheet {
        border-color: #000000 !important;
        box-shadow: none !important;
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

  const prefeituraEndereco = [
    prefeitura.endereco,
    prefeitura.cidade,
    prefeitura.uf,
    prefeitura.cep,
  ]
    .filter(Boolean)
    .join(" - ");

  const visibleItens = itens.slice(0, 8);

  return (
    <div ref={ref} className={`dam-root ${className}`}>
      <style>{getStyles()}</style>

      <div className="dam-toolbar print-hide">
        <button
          type="button"
          onClick={() => window.print()}
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
                <GuideInstitutionLogo
                  source={prefeitura.logoUrl}
                  className="dam-logo"
                />
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
                    <div className="dam-mini-label">No Guia</div>
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

            <div className="dam-title">{guideMeta.title}</div>

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
                label="No do Cadastro"
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
              <div className="dam-total-label">VALOR TOTAL A PAGAR</div>
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

            {guia.assinaturaEletronica ? (
              <div className="dam-electronic-signature">
                <div className="dam-electronic-signature-badge">
                  Assinatura
                  <br />
                  Eletrônica
                </div>
                <div className="dam-electronic-signature-body">
                  Documento assinado eletronicamente por{" "}
                  <strong>{guia.assinaturaEletronica.signerName}</strong>
                  {guia.assinaturaEletronica.signerTitle
                    ? `, ${guia.assinaturaEletronica.signerTitle}`
                    : ""}
                  {guia.assinaturaEletronica.departmentName
                    ? `, ${[
                        guia.assinaturaEletronica.departmentCode,
                        guia.assinaturaEletronica.departmentName,
                      ].filter(Boolean).join(" — ")}`
                    : ""}
                  , em {new Date(guia.assinaturaEletronica.signedAt).toLocaleString("pt-BR")}.
                  <div className="dam-electronic-signature-code">
                    Código: {guia.assinaturaEletronica.signatureCode}
                    {" • "}
                    SHA-256: {guia.assinaturaEletronica.signatureFingerprint}
                  </div>
                  <div className="dam-electronic-signature-code">
                    {guia.assinaturaEletronica.assuranceLabel || "Assinatura eletrônica autenticada por login e senha no SIGAPRO"}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="dam-warning-row">
              {guia.assinaturaEletronica
                ? "** DOCUMENTO ELETRÔNICO ASSINADO NO SIGAPRO — CONFIRA O CÓDIGO DE VERIFICAÇÃO **"
                : "** VALIDO SOMENTE COM AUTENTICACAO MECANICA ** ** NAO RECEBER APOS O VENCIMENTO **"}
            </div>

            <div className="dam-observation-row">
              <div className="dam-observation-label">Observacao</div>
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
                <GuideInstitutionLogo
                  source={prefeitura.logoUrl}
                  compact
                />
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
                <ReceiptRow label="No Guia" value={guia.numeroGuia} />
              </div>
            </div>

            <div className="dam-receipt-body">
              <div className="dam-receipt-left">
                <ReceiptRow
                  label="No do Cadastro"
                  value={contribuinte.numeroCadastro}
                />
                <ReceiptRow label="CNPJ/CPF" value={contribuinte.cpfCnpj} />
                <ReceiptRow
                  label="Data Emissao"
                  value={formatDateBR(guia.dataDocumento)}
                />
                <ReceiptRow label="Pagador" value={contribuinte.nome} />
                <ReceiptRow label="Endereço" value={contribuinte.endereco} />

                <div className="dam-note">
                  Pagável em bancos conveniados. Não receber após o vencimento.
                </div>

                <div className="dam-auth">
                  <div className="dam-auth-label">Autenticacao Mecanica</div>
                  <div className="dam-auth-value">
                    {guia.autenticacaoMecanica || ""}
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

                {guia.qrCodePixUrl ? (
                  <div className="dam-qr-wrap">
                    <div className="dam-qrcode-label">PIX opcional</div>
                    <div className="dam-qrcode-box">
                      <img src={guia.qrCodePixUrl} alt="QR Code PIX" />
                    </div>
                  </div>
                ) : (
                  <div className="dam-qr-wrap">
                    <div className="dam-qrcode-label">Canal complementar</div>
                    <div className="dam-qrcode-box">
                      <span className="dam-qrcode-fallback">Consulte a Prefeitura para obter o meio de pagamento oficial.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="dam-bottom-section">
              <div className="dam-bottom-label">Linha Digitavel</div>
              <div className="dam-digitable-value">
                {formatDigitableLine(guia.linhaDigitavel)}
              </div>
            </div>

            <div className="dam-bottom-section">
              <div className="dam-bottom-label">Codigo de Barras</div>
              <div className="dam-barcode-box">
                <div className="dam-barcode-text">
                  {renderBarcodeVisual(guia.codigoBarras)}
                </div>
              </div>
            </div>

            <div className="dam-footer-area">
              <div className="dam-footer-left">
                <div className="dam-bottom-label">Instruções de pagamento</div>
                <div className="dam-footer-note">
                  {guia.linhaDigitavel || guia.qrCodePixUrl
                    ? "Efetue o pagamento pelo canal oficial indicado pela Prefeitura. Após a compensação, o recolhimento poderá ser conferido na tramitação administrativa."
                    : "Não há linha digitável nem PIX oficial nesta via. Solicite à Tesouraria o meio de arrecadação válido antes de efetuar o pagamento."}
                </div>
              </div>
              <div className="dam-footer-right">
                <div className="dam-bottom-label">Autenticação bancária</div>
                <div className="dam-auth-box">
                  {guia.autenticacaoMecanica || "Espaço reservado"}
                </div>
              </div>
            </div>

            <div className="dam-final-area">
              <div className="dam-final-left">
                <div className="dam-bottom-label">Instruções de lançamento</div>
                <div className="dam-final-text">
                  Documento de cobrança registrado e vinculado ao processo administrativo. O pagamento depende de meio oficial de arrecadação, observando as normas e o vencimento da Prefeitura.
                </div>
                <div className="dam-final-box">
                  Uso interno da Prefeitura: conferência do recolhimento, registro da compensação, despacho da tesouraria
                  e validação para prosseguimento do processo.
                </div>
              </div>
              <div className="dam-final-right">
                <div className="dam-bottom-label">Autenticação mecânica</div>
                <div className="dam-final-right-box">
                  {guia.autenticacaoMecanica || "Espaço reservado"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

async function blobToDataUrl(blob: Blob) {
  if (!blob.type.startsWith("image/")) return "";
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

export function deriveBrandingObjectKey(source?: string) {
  const value = String(source || "").trim();
  if (!value || value.startsWith("data:")) return "";

  try {
    const baseOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const url = new URL(value, baseOrigin);
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const municipalityMatch = path.match(
      /(municipalities\/[0-9a-f-]{36}\/branding\/[a-zA-Z0-9/_-]+\.(?:png|webp|jpe?g))$/i,
    );
    if (municipalityMatch?.[1]) return municipalityMatch[1];

    const platformMatch = path.match(
      /(platform\/branding\/[a-zA-Z0-9/_-]+\.(?:png|webp|jpe?g))$/i,
    );
    return platformMatch?.[1] || "";
  } catch {
    return "";
  }
}

async function embedGuideImage(source?: string, objectKey?: string) {
  const key =
    String(objectKey || "").trim() ||
    deriveBrandingObjectKey(source);

  if (key) {
    try {
      // Nunca reaproveita URL assinada antiga: com objectKey disponível,
      // solicita uma URL R2 nova antes de renderizar/imprimir a guia.
      const bucket =
        (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
        "sigapro-logos";
      const signedUrl = await getSignedUrlForObjectStrict({
        bucket,
        objectKey: key,
        expiresIn: 900,
      });
      const response = await fetch(signedUrl, {
        cache: "no-store",
      });
      if (response.ok) {
        return await blobToDataUrl(await response.blob());
      }
    } catch {
      // No localhost o endpoint de assinatura do R2 pode não ter as variáveis
      // server-side. Nesse caso, tente a logo já resolvida pelo branding antes
      // de cair para o fallback visual.
    }
  }

  const url = String(source || "").trim();
  if (!url || url.startsWith("data:")) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    if (/localhost|127\.0\.0\.1/i.test(parsed.hostname) && !/localhost|127\.0\.0\.1/i.test(window.location.hostname)) {
      return "";
    }
    const response = await fetch(parsed.toString(), {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return "";
    return await blobToDataUrl(await response.blob());
  } catch {
    return "";
  }
}

function renderGuideOpeningState(popup: Window, title: string) {
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    html,body{margin:0;min-height:100%;background:#ffffff}
  </style>
</head>
<body></body>
</html>`);
  popup.document.close();
}

export function buildGuiaRecolhimentoOficialHtml(
  props: GuiaRecolhimentoOficialProps,
  options?: { title?: string; autoPrint?: boolean },
) {
  const staticLogo = String(props.prefeitura.logoUrl || "").trim();
  const safeProps: GuiaRecolhimentoOficialProps = {
    ...props,
    prefeitura: {
      ...props.prefeitura,
      // HTML estático não hidrata onError. Nunca deixe URL remota quebrada
      // dentro da guia: a abertura oficial incorpora o brasão como data URL.
      logoUrl: /^data:image\//i.test(staticLogo) ? staticLogo : "",
    },
  };
  const markup = renderToStaticMarkup(<GuiaRecolhimentoOficial {...safeProps} />);
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
    ${autoPrint ? "<script>window.addEventListener('load', function () { window.print(); }, { once: true });</script>" : ""}
  </body>
</html>`;
}

export function openGuiaRecolhimentoOficialWindow(
  props: GuiaRecolhimentoOficialProps,
  options?: { title?: string; autoPrint?: boolean },
) {
  const title = options?.title || props.guia.numeroGuia;
  const popup = window.open("", "_blank");
  if (!popup) return;

  try {
    popup.opener = null;
  } catch {
    // Alguns navegadores não permitem alterar opener; a guia continua funcional.
  }

  renderGuideOpeningState(popup, title);
  popup.focus();

  void (async () => {
    const embeddedLogo = await embedGuideImage(
      props.prefeitura.logoUrl,
      props.prefeitura.logoObjectKey,
    );
    const resolvedProps: GuiaRecolhimentoOficialProps = {
      ...props,
      prefeitura: {
        ...props.prefeitura,
        logoUrl: embeddedLogo,
      },
    };

    const html = buildGuiaRecolhimentoOficialHtml(resolvedProps, options);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const previewUrl = URL.createObjectURL(blob);

    try {
      popup.location.replace(previewUrl);
    } catch {
      popup.location.href = previewUrl;
    }

    window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  })();
}


