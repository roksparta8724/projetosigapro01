import {
  formatOfficialProcessNumber, formatOfficialProcessTitle, parseMarker,
  statusLabel, type ProcessRecord,
} from "@/lib/platform";
import { processPendingGuideCount } from "@/components/platform/ProcessWorkspaceHeader";

/**
 * Excel OOXML generated locally, with no third-party CDN, server exposure or CSV
 * delimiter ambiguity. Text cells are inline strings, so leading zeros and
 * user-controlled values are never interpreted as formulas.
 */
const xml = (value: unknown) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const encode = (str: string) => new TextEncoder().encode(str);
const columns: Array<{ header: string; width: number; text: (p: ProcessRecord) => string }> = [
  { header: "Nº DO PROCESSO", width: 23, text: p => formatOfficialProcessNumber(p.protocol) },
  { header: "ASSUNTO / PROCESSO", width: 43, text: p => formatOfficialProcessTitle({ title: p.title, type: p.type }) },
  { header: "INTERESSADO", width: 34, text: p => p.ownerName || "Não informado" },
  { header: "ETAPA ATUAL", width: 24, text: p => statusLabel(p.status) },
  { header: "UNIDADE ATUAL", width: 31, text: p => p.processControl?.currentFolder || p.dispatches?.[0]?.to || "Não informada" },
  { header: "RESPONSÁVEL", width: 32, text: p => p.analysis?.assignedTo || p.technicalLead || "Não atribuído" },
  { header: "PRAZO", width: 17, text: p => p.sla?.dueDate || "Sem prazo" },
  { header: "PENDÊNCIAS", width: 36, text: p => (p.requirements || []).filter(r => r.status === "aberta" || r.status === "respondida").map(r => r.title || "Exigência").join(" | ") || "Nenhuma" },
  { header: "GUIAS PENDENTES", width: 19, text: p => String(processPendingGuideCount(p)) },
  { header: "MARCADORES", width: 36, text: p => (p.tags || []).map(tag => parseMarker(tag).label).join(" | ") || "Nenhum" },
  { header: "SLA", width: 21, text: p => p.sla?.breached ? "Prazo vencido" : typeof p.sla?.hoursRemaining === "number" && p.sla.hoursRemaining <= 12 ? "Atenção ao prazo" : "Regular" },
];
const colName = (i: number): string => {
  let n = i + 1, output = "";
  while (n) { n--; output = String.fromCharCode(65 + n % 26) + output; n = Math.floor(n / 26); }
  return output;
};
const cell = (col: number, row: number, value: string, style: number) => {
  return '<c r="' + colName(col) + row + '" s="' + style +
    '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
};

function worksheetXml(rows: readonly ProcessRecord[], generatedAt: Date, scope: string) {
  const time = generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const rowXml: string[] = [
    '<row r="1" ht="32" customHeight="1">' +
      cell(0, 1, "SIGAPRO  |  CONTROLE DE PROCESSOS", 1) + '</row>',
    '<row r="3" ht="28" customHeight="1">' +
      cell(0, 3, 'Relatório operacional  •  ' + scope + '  •  Gerado em ' + time, 2) + '</row>',
    '<row r="4" ht="27" customHeight="1">' +
      cell(0, 4, 'PROCESSOS EXPORTADOS', 6) + cell(2, 4, String(rows.length), 7) +
      cell(4, 4, 'GUIAS PENDENTES', 6) +
      cell(6, 4, String(rows.reduce((total, p) => total + processPendingGuideCount(p), 0)), 7) +
      cell(8, 4, 'COM PRAZO VENCIDO', 6) +
      cell(10, 4, String(rows.filter(p => p.sla?.breached).length), 7) + '</row>',
    '<row r="6" ht="32" customHeight="1">' +
      columns.map((c, i) => cell(i, 6, c.header, 3)).join("") + '</row>',
  ];
  rows.forEach((record, index) => {
    const y = index + 7;
    const style = index % 2 === 0 ? 4 : 5;
    rowXml.push('<row r="' + y + '" ht="35" customHeight="1">' +
      columns.map((c, i) => cell(i, y, c.text(record), style)).join("") + '</row>');
  });
  const end = Math.max(6, rows.length + 6);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' +
    '<pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="19"/>' +
    '<cols>' + columns.map((c, i) => '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + c.width + '" customWidth="1"/>').join("") + '</cols>' +
    '<sheetData>' + rowXml.join("") + '</sheetData>' +
    '<mergeCells count="6"><mergeCell ref="A1:K2"/><mergeCell ref="A3:K3"/>' +
    '<mergeCell ref="A4:B4"/><mergeCell ref="C4:D4"/><mergeCell ref="E4:F4"/><mergeCell ref="G4:H4"/></mergeCells>' +
    '<autoFilter ref="A6:K' + end + '"/>' +
    '<pageMargins left="0.3" right="0.3" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1"/>' +
    '</worksheet>';
}

const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="5"><font><sz val="10"/><name val="Aptos"/><color rgb="FF1A3048"/></font>' +
  '<font><b/><sz val="19"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font>' +
  '<font><sz val="11"/><name val="Aptos"/><color rgb="FF33607D"/></font>' +
  '<font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font>' +
  '<font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF004877"/></font></fonts>' +
  '<fills count="6"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF073D65"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0B5B8D"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFECF4FA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="hair"><color rgb="FFD3E1EB"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const U8 = (size: number, chunks: Uint8Array[], totalSize: number): Uint8Array => {
  const out = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.length; }
  if (cursor !== totalSize) throw new Error("Montagem da planilha inconsistente.");
  return out;
};
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c >>> 0;
}
const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zipStored(files: Array<{ name: string; contents: string }>): Uint8Array {
  const body: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0, centralSize = 0;
  const view16 = (data: Uint8Array, pos: number, v: number) => new DataView(data.buffer).setUint16(pos, v, true);
  const view32 = (data: Uint8Array, pos: number, v: number) => new DataView(data.buffer).setUint32(pos, v >>> 0, true);
  files.forEach(({ name, contents }) => {
    const filename = encode(name), payload = encode(contents), crc = crc32(payload);
    const header = new Uint8Array(30 + filename.length);
    view32(header, 0, 0x04034b50); view16(header, 4, 20); view16(header, 6, 0x0800);
    view16(header, 8, 0); view32(header, 14, crc);
    view32(header, 18, payload.length); view32(header, 22, payload.length);
    view16(header, 26, filename.length); header.set(filename, 30);
    body.push(header, payload);
    const record = new Uint8Array(46 + filename.length);
    view32(record, 0, 0x02014b50); view16(record, 4, 20); view16(record, 6, 20);
    view16(record, 8, 0x0800); view16(record, 10, 0); view32(record, 16, crc);
    view32(record, 20, payload.length); view32(record, 24, payload.length);
    view16(record, 28, filename.length); view32(record, 42, offset);
    record.set(filename, 46); central.push(record);
    centralSize += record.length; offset += header.length + payload.length;
  });
  const end = new Uint8Array(22);
  view32(end, 0, 0x06054b50); view16(end, 8, files.length);
  view16(end, 10, files.length); view32(end, 12, centralSize); view32(end, 16, offset);
  return U8(offset + centralSize + end.length, [...body, ...central, end],
    offset + centralSize + end.length);
}

export function buildPremiumProcessWorkbook(
  records: readonly ProcessRecord[], scope: string, generatedAt = new Date(),
): Uint8Array {
  const files = [
    { name: "[Content_Types].xml", contents: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>' },
    { name: "_rels/.rels", contents: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' },
    { name: "xl/workbook.xml", contents: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews>' +
      '<sheets><sheet name="Controle de Processos" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", contents: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' },
    { name: "xl/styles.xml", contents: styles },
    { name: "xl/worksheets/sheet1.xml", contents: worksheetXml(records, generatedAt, scope) },
  ];
  return zipStored(files);
}

export function downloadPremiumProcessWorkbook(records: readonly ProcessRecord[], scope: string) {
  if (typeof document === "undefined" || !records.length) throw new Error("Nenhum processo para exportar.");
  const bytes = buildPremiumProcessWorkbook(records, scope);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  link.href = url;
  link.download = "sigapro-controle-processos-" + date + ".xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
