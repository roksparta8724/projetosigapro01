/* eslint-disable react-refresh/only-export-components */
import { renderToStaticMarkup } from "react-dom/server";

export interface PaymentGuideDebtRow {
  year: string;
  debt: string;
  table: string;
  principal: number;
  penalty?: number;
  interest?: number;
  correction?: number;
  total?: number;
}

export interface OfficialPaymentGuideData {
  municipality: {
    name: string;
    logoUrl?: string | null;
    address: string;
    department: string;
    document?: string;
    phone?: string;
    email?: string;
  };
  guide: {
    number: string;
    year: string;
    issueDate: string;
    title?: string;
    registrationLabel?: string;
  };
  contributor: {
    registrationNumber: string;
    document: string;
    name: string;
    address: string;
    documentDate: string;
  };
  debtRows: PaymentGuideDebtRow[];
  totals?: {
    totalAmount?: number;
    amountToPay?: number;
  };
  responsible: {
    name: string;
    role?: string;
  };
  observations?: string[];
  bank: {
    payerName: string;
    payerDocument: string;
    payerAddress: string;
    bankName: string;
    agreementCode?: string;
    agency?: string;
    account?: string;
    amount: number;
    discount?: number;
    interest?: number;
    penalty?: number;
    chargedAmount?: number;
    digitableLine: string;
    barcodeValue: string;
    pixPayload?: string;
    pixLabel?: string;
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function sumDebtRows(rows: PaymentGuideDebtRow[]) {
  return rows.reduce((sum, row) => {
    const total =
      row.total ??
      Number((row.principal + (row.penalty ?? 0) + (row.interest ?? 0) + (row.correction ?? 0)).toFixed(2));
    return sum + total;
  }, 0);
}

function normalizeBarcode(code: string) {
  return code.replace(/\s+/g, "").trim();
}

function formatDigitableLine(code: string) {
  const raw = normalizeBarcode(code);
  if (!raw) return "";
  return raw.match(/.{1,5}/g)?.join(" ") ?? raw;
}

function buildBarcodeBars(code: string) {
  const normalized = normalizeBarcode(code);
  return normalized.split("").map((digit, index) => {
    const width = Number(digit || 0) % 3 === 0 ? 3 : Number(digit || 0) % 2 === 0 ? 2 : 1;
    return (
      <span
        key={`${digit}-${index}`}
        style={{
          display: "inline-block",
          width: `${width}px`,
          height: `${index % 4 === 0 ? 56 : 44}px`,
          background: "#111827",
          marginRight: "1px",
          verticalAlign: "bottom",
        }}
      />
    );
  });
}

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function OfficialPixMatrix({ value }: { value: string }) {
  const size = 132;
  const grid = 21;
  const cell = size / grid;
  const seed = hashSeed(value || "pix");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="QRCode Pix">
      <rect width={size} height={size} fill="#ffffff" />
      {Array.from({ length: grid * grid }).map((_, index) => {
        const row = Math.floor(index / grid);
        const column = index % grid;
        const reserved =
          (row < 7 && column < 7) ||
          (row < 7 && column >= grid - 7) ||
          (row >= grid - 7 && column < 7);
        const bit = ((seed >> ((row * grid + column) % 24)) & 1) === 1;
        const alternate = ((row * 17 + column * 13 + seed) % 5) <= 1;
        return reserved || bit || alternate ? (
          <rect
            key={`${row}-${column}`}
            x={column * cell}
            y={row * cell}
            width={cell}
            height={cell}
            fill="#111827"
          />
        ) : null;
      })}
    </svg>
  );
}

function OfficialField({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  width?: string;
}) {
  return (
    <div style={{ width, minWidth: 0 }}>
      <div
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#4b5563",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          minHeight: "26px",
          borderBottom: "1px solid #9ca3af",
          fontSize: "12px",
          color: "#111827",
          paddingBottom: "4px",
        }}
      >
        {value || " "}
      </div>
    </div>
  );
}

export function OfficialPaymentGuideDocument({
  data,
  previewMode = false,
}: {
  data: OfficialPaymentGuideData;
  previewMode?: boolean;
}) {
  const totalAmount = data.totals?.totalAmount ?? sumDebtRows(data.debtRows);
  const amountToPay = data.totals?.amountToPay ?? data.bank.chargedAmount ?? totalAmount;
  const discount = data.bank.discount ?? 0;
  const interest = data.bank.interest ?? 0;
  const penalty = data.bank.penalty ?? 0;
  const chargedAmount = data.bank.chargedAmount ?? amountToPay;

  return (
    <div
      style={{
        background: previewMode ? "#f3f4f6" : "#ffffff",
        padding: previewMode ? "24px 0" : "0",
      }}
    >
      <div
        className="sigapro-payment-guide"
        style={{
          width: "190mm",
          minHeight: "277mm",
          margin: "0 auto",
          background: "#ffffff",
          color: "#111827",
          border: "1px solid #9ca3af",
          padding: "10mm 10mm 8mm",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "12px",
          lineHeight: 1.35,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 170px", gap: "12px", alignItems: "start" }}>
          <div
            style={{
              height: "80px",
              border: "1px solid #9ca3af",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            {data.municipality.logoUrl ? (
              <img
                src={data.municipality.logoUrl}
                alt={data.municipality.name}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: "11px", textAlign: "center", padding: "8px" }}>BRASAO / LOGO</span>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>{data.municipality.name}</div>
            <div style={{ marginTop: "4px", fontSize: "11px" }}>{data.municipality.address}</div>
            <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: 600 }}>{data.municipality.department}</div>
          </div>

          <div style={{ border: "1px solid #9ca3af" }}>
            <div style={{ borderBottom: "1px solid #9ca3af", padding: "6px 8px", fontSize: "10px", textTransform: "uppercase" }}>
              {data.guide.registrationLabel || "Cadastro Eventual"}
            </div>
            <div style={{ padding: "8px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#4b5563" }}>Guia</div>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>{data.guide.number}</div>
              <div style={{ marginTop: "10px", fontSize: "10px", textTransform: "uppercase", color: "#4b5563" }}>Ano</div>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>{data.guide.year}</div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "2px solid #111827", marginTop: "10px", paddingTop: "10px" }}>
          <div style={{ textAlign: "center", fontSize: "16px", fontWeight: 700, letterSpacing: "0.06em" }}>
            {data.guide.title || "GUIA DE RECOLHIMENTO DE DEBITOS"}
          </div>
        </div>

        <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "160px 170px 1fr", gap: "14px" }}>
          <OfficialField label="Nº do Cadastro" value={data.contributor.registrationNumber} />
          <OfficialField label="CNPJ/CPF" value={data.contributor.document} />
          <OfficialField label="Contribuinte" value={data.contributor.name} />
        </div>

        <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 180px", gap: "14px" }}>
          <OfficialField label="Endereço" value={data.contributor.address} />
          <OfficialField label="Data do Documento" value={data.contributor.documentDate} />
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              {["Ano", "Divida", "Tabela", "Principal", "Multa", "Juros", "Correcao", "Total"].map((column) => (
                <th
                  key={column}
                  style={{
                    border: "1px solid #9ca3af",
                    padding: "7px 8px",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    textAlign: column === "Divida" || column === "Tabela" ? "left" : "center",
                  }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.debtRows.map((row, index) => {
              const rowTotal =
                row.total ??
                Number((row.principal + (row.penalty ?? 0) + (row.interest ?? 0) + (row.correction ?? 0)).toFixed(2));
              return (
                <tr key={`${row.debt}-${index}`}>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px", textAlign: "center" }}>{row.year}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px" }}>{row.debt}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px" }}>{row.table}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{formatCurrency(row.principal)}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{formatCurrency(row.penalty ?? 0)}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{formatCurrency(row.interest ?? 0)}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{formatCurrency(row.correction ?? 0)}</td>
                  <td style={{ border: "1px solid #9ca3af", padding: "7px 8px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontWeight: 700 }}>{formatCurrency(rowTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "18px", marginTop: "14px" }}>
          <div style={{ border: "1px solid #9ca3af", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563" }}>Funcionário responsável pela emissão</div>
            <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: 700 }}>{data.responsible.name}</div>
            {data.responsible.role ? <div style={{ marginTop: "4px", fontSize: "11px" }}>{data.responsible.role}</div> : null}
          </div>

          <div style={{ border: "1px solid #9ca3af", padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "7px" }}>
              <span>Total geral</span>
              <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{formatCurrency(totalAmount)}</strong>
            </div>
            <div style={{ borderTop: "1px solid #9ca3af", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 700 }}>
              <span>Valor total a pagar</span>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>{formatCurrency(amountToPay)}</span>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid #9ca3af", marginTop: "14px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: "8px" }}>Observações</div>
          <div style={{ fontSize: "11px", lineHeight: 1.5 }}>
            {(data.observations && data.observations.length > 0
              ? data.observations
              : [
                  "Documento válido com autenticação da prefeitura emissora.",
                  "Não receber após o vencimento sem reemissão ou atualização municipal.",
                ]).map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "14px", marginTop: "16px" }}>
          <div style={{ border: "1px solid #9ca3af", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: "8px" }}>Dados do contribuinte</div>
            <div style={{ display: "grid", gap: "10px" }}>
              <OfficialField label="Nome / Razão social" value={data.bank.payerName} />
              <OfficialField label="CPF / CNPJ" value={data.bank.payerDocument} />
              <OfficialField label="Endereço" value={data.bank.payerAddress} />
            </div>
          </div>

          <div style={{ border: "1px solid #9ca3af", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: "8px" }}>Dados bancários</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
              <OfficialField label="Banco" value={data.bank.bankName} />
              <OfficialField label="Convênio" value={data.bank.agreementCode || "-"} />
              <OfficialField label="Agência" value={data.bank.agency || "-"} />
              <OfficialField label="Conta" value={data.bank.account || "-"} />
            </div>

            <div style={{ display: "grid", gap: "8px", marginTop: "12px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "12px" }}>
              {[
                ["Valor do documento", data.bank.amount],
                ["Descontos", discount],
                ["Juros", interest],
                ["Multa", penalty],
                ["Valor cobrado", chargedAmount],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #d1d5db", paddingBottom: "4px" }}>
                  <span>{label}</span>
                  <strong>{formatCurrency(Number(value))}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 180px", gap: "14px", marginTop: "16px", alignItems: "stretch" }}>
          <div style={{ border: "1px solid #9ca3af", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: "6px" }}>Linha digitável</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "14px", fontWeight: 700, wordBreak: "break-all" }}>
              {data.bank.digitableLine}
            </div>

            <div style={{ marginTop: "12px", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: "6px" }}>Código de barras</div>
            <div style={{ minHeight: "60px", border: "1px solid #9ca3af", padding: "8px", display: "flex", alignItems: "flex-end" }}>
              {buildBarcodeBars(data.bank.barcodeValue)}
            </div>
            <div style={{ marginTop: "6px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "11px", wordBreak: "break-all" }}>
              {formatDigitableLine(data.bank.barcodeValue)}
            </div>
          </div>

          <div style={{ border: "1px solid #9ca3af", padding: "10px 12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", textAlign: "center" }}>
              {data.bank.pixLabel || "PIX / QRCode"}
            </div>
            <OfficialPixMatrix value={data.bank.pixPayload || data.bank.digitableLine} />
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "9px", textAlign: "center", wordBreak: "break-all" }}>
              {data.bank.pixPayload || "Chave PIX não informada"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildOfficialPaymentGuideHtml(
  data: OfficialPaymentGuideData,
  options?: { autoPrint?: boolean; title?: string },
) {
  const markup = renderToStaticMarkup(<OfficialPaymentGuideDocument data={data} previewMode />);
  const title = options?.title || data.guide.number;
  const autoPrint = options?.autoPrint ?? true;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #eef2f7; color: #111827; }
      body { font-family: Inter, Arial, sans-serif; }
      .sigapro-print-toolbar {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        justify-content: center;
        gap: 12px;
        padding: 16px;
        background: rgba(255,255,255,0.96);
        border-bottom: 1px solid #d1d5db;
      }
      .sigapro-print-button {
        border: 1px solid #9ca3af;
        background: #ffffff;
        color: #111827;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      @media print {
        body { background: #ffffff; }
        .sigapro-print-toolbar { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="sigapro-print-toolbar">
      <button class="sigapro-print-button" onclick="window.print()">Imprimir / Salvar PDF</button>
      <button class="sigapro-print-button" onclick="window.close()">Fechar</button>
    </div>
    ${markup}
    ${autoPrint ? "<script>window.addEventListener('load', () => window.print(), { once: true });</script>" : ""}
  </body>
</html>`;
}

export function openOfficialPaymentGuideWindow(
  data: OfficialPaymentGuideData,
  options?: { autoPrint?: boolean; title?: string },
) {
  const popup = window.open("", "_blank", "width=1080,height=980");
  if (!popup) return;
  popup.document.write(buildOfficialPaymentGuideHtml(data, options));
  popup.document.close();
}
