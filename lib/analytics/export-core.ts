import type { DashboardSnapshot } from './dashboard';

export type DataExportFormat = 'CSV' | 'JSON' | 'XLSX' | 'PDF';

export type DataExportArtifact = {
  format: DataExportFormat;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  snapshot: DashboardSnapshot;
};

type ExportRow = {
  section: string;
  key: string;
  label: string;
  value: string;
  unit: string;
  source: string;
  available: string;
  reason: string;
  definitionVersion: string;
};

const encoder = new TextEncoder();

export function normalizeDataExportFormat(value: unknown): DataExportFormat | null {
  const format = String(value ?? '').trim().toUpperCase();
  return format === 'CSV' || format === 'JSON' || format === 'XLSX' || format === 'PDF'
    ? format
    : null;
}

function round(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function metricValue(input: { value: number | null; valuesByUnit?: Record<string, number> }) {
  const entries = Object.entries(input.valuesByUnit ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length) return entries.map(([unit, value]) => `${round(value)} ${unit}`).join(' | ');
  return input.value == null ? '' : round(input.value);
}

export function buildDataExportRows(snapshot: DashboardSnapshot): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const metric of snapshot.historical) {
    rows.push({
      section: 'HISTORICAL',
      key: metric.key,
      label: metric.label,
      value: metricValue(metric),
      unit: metric.unit,
      source: metric.source,
      available: String(metric.available),
      reason: metric.reason ?? '',
      definitionVersion: String(metric.definitionVersion),
    });
  }

  for (const metric of snapshot.live) {
    rows.push({
      section: 'LIVE',
      key: metric.key,
      label: metric.label,
      value: metric.value == null ? '' : round(metric.value),
      unit: 'COUNT',
      source: metric.source,
      available: String(metric.available),
      reason: metric.reason ?? '',
      definitionVersion: '',
    });
  }

  for (const metric of snapshot.unavailable) {
    rows.push({
      section: 'UNAVAILABLE',
      key: metric.key,
      label: metric.label,
      value: '',
      unit: '',
      source: metric.source,
      available: 'false',
      reason: metric.reason,
      definitionVersion: '',
    });
  }

  for (const day of snapshot.daily) {
    for (const [key, value] of Object.entries({
      communication: day.communication,
      commerce: day.commerce,
      booking: day.booking,
      ai: day.ai,
    })) {
      rows.push({
        section: 'DAILY',
        key: `${day.day}.${key}`,
        label: `${day.day} ${key}`,
        value: String(value),
        unit: 'COUNT',
        source: 'WAREHOUSE',
        available: 'true',
        reason: '',
        definitionVersion: '',
      });
    }
  }

  return rows;
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeDataExportCsv(snapshot: DashboardSnapshot) {
  const rows = buildDataExportRows(snapshot);
  const headers = [
    'section','key','label','value','unit','source','available','reason','definition_version',
  ];
  const body = [
    headers.join(','),
    ...rows.map((row) => [
      row.section,row.key,row.label,row.value,row.unit,row.source,row.available,row.reason,row.definitionVersion,
    ].map(csvCell).join(',')),
  ].join('\r\n');
  return encoder.encode('\uFEFF' + body);
}

export function serializeDataExportJson(snapshot: DashboardSnapshot) {
  return encoder.encode(JSON.stringify({
    schemaVersion: 1,
    exportKind: 'GOVERNED_ANALYTICS_SNAPSHOT',
    generatedAt: snapshot.generatedAt,
    window: snapshot.window,
    scope: snapshot.scope,
    freshness: snapshot.freshness,
    historical: snapshot.historical,
    live: snapshot.live,
    unavailable: snapshot.unavailable,
    daily: snapshot.daily,
    notes: snapshot.notes,
  }, null, 2));
}

function xml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index: number) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function worksheetXml(rows: string[][]) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number) {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStore(entries: Array<{ name: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data,
    ]);
    localParts.push(local);

    const central = concat([
      u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),
      u16(0),u16(0),u32(0),u32(offset),name,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const local = concat(localParts);
  const central = concat(centralParts);
  const end = concat([
    u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),
    u32(central.length),u32(local.length),u16(0),
  ]);
  return concat([local, central, end]);
}

export function serializeDataExportXlsx(snapshot: DashboardSnapshot) {
  const headers = ['Section','Key','Label','Value','Unit','Source','Available','Reason','Definition Version'];
  const rows = buildDataExportRows(snapshot).map((row) => [
    row.section,row.key,row.label,row.value,row.unit,row.source,row.available,row.reason,row.definitionVersion,
  ]);

  return zipStore([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Analytics Export" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml([headers, ...rows]) },
  ]);
}

function pdfSafe(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function pdfPageStream(lines: string[]) {
  const commands = ['BT','/F1 9 Tf','40 760 Td'];
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -14 Td');
    commands.push(`(${pdfSafe(line).slice(0, 105)}) Tj`);
  });
  commands.push('ET');
  return commands.join('\n');
}

export function serializeDataExportPdf(snapshot: DashboardSnapshot) {
  const lines = [
    'Smart Visions Governed Analytics Export',
    `Generated: ${snapshot.generatedAt}`,
    `Scope: ${snapshot.scope.level}`,
    `Window: ${snapshot.window.days} days`,
    `Warehouse facts: ${snapshot.freshness.warehouseFactCount}`,
    '',
    ...buildDataExportRows(snapshot).map((row) =>
      `${row.section} | ${row.label} | ${row.available === 'true' ? row.value || '0' : 'Unavailable'} ${row.unit}`.trim(),
    ),
  ];
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) chunks.push(lines.slice(i, i + 48));

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontObjectId = 3 + chunks.length * 2;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  for (let i = 0; i < chunks.length; i += 1) pageObjectIds.push(3 + i * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  chunks.forEach((chunk, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const stream = pdfPageStream(chunk);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id <= fontObjectId; id += 1) {
    offsets[id] = encoder.encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${fontObjectId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontObjectId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}

function filenameScope(snapshot: DashboardSnapshot) {
  const raw = snapshot.scope.level.toLowerCase();
  return raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'scope';
}

export function makeDataExportArtifact(snapshot: DashboardSnapshot, format: DataExportFormat): DataExportArtifact {
  const date = snapshot.generatedAt.slice(0, 10);
  const base = `smart-visions-analytics-${filenameScope(snapshot)}-${snapshot.window.days}d-${date}`;
  if (format === 'CSV') return { format, filename: `${base}.csv`, mimeType: 'text/csv; charset=utf-8', bytes: serializeDataExportCsv(snapshot), snapshot };
  if (format === 'JSON') return { format, filename: `${base}.json`, mimeType: 'application/json; charset=utf-8', bytes: serializeDataExportJson(snapshot), snapshot };
  if (format === 'XLSX') return { format, filename: `${base}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: serializeDataExportXlsx(snapshot), snapshot };
  return { format, filename: `${base}.pdf`, mimeType: 'application/pdf', bytes: serializeDataExportPdf(snapshot), snapshot };
}
