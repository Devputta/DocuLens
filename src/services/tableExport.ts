/**
 * DocuLens Table Extraction & CSV Security Sanitizer
 * Implements strict Formula Injection Mitigation (RFC-4180 & OWASP CSV Injection Guidelines)
 * Escapes '=', '+', '-', '@', '\t', '\r', '%', '|' to prevent spreadsheet macro execution
 * and formula exploits across Microsoft Excel, Google Sheets, and LibreOffice Calc.
 */

import { DocumentTable } from '../types/doculens';
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_REPOSITORY,
  formatExportDateTime,
  generateExportFilename,
  generateJSONMetadata,
} from '../utils/exportBranding';

// Dangerous characters per OWASP CSV Injection guidelines that trigger formula evaluation
const DANGEROUS_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r', '%', '|'];

/**
 * Sanitizes a single cell value against CSV formula injection.
 * Escapes malicious spreadsheet formula execution while preserving valid numbers.
 */
export function sanitizeCSVCell(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    if (!isNaN(value) && isFinite(value)) {
      return String(value);
    }
    return '';
  }

  const rawStr = String(value);
  const trimmed = rawStr.trim();
  if (trimmed === '') return '';

  // Check if it's a legitimate number (e.g. "-12.5", "+4.2", "390", "342.0", "0")
  const isPureNumber = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed);
  if (isPureNumber) {
    return trimmed;
  }

  const firstChar = trimmed.charAt(0);
  const rawFirstChar = rawStr.charAt(0);
  const isFormulaRisk =
    DANGEROUS_FORMULA_PREFIXES.includes(firstChar) ||
    DANGEROUS_FORMULA_PREFIXES.includes(rawFirstChar);

  let sanitized = trimmed;
  if (isFormulaRisk) {
    // Prepend single quote (') to force spreadsheet software to treat the cell as raw string text
    sanitized = `'${trimmed}`;
  }

  // RFC-4180 CSV escaping:
  // If the cell contains quotes, commas, newlines, or carriage returns:
  // double up internal quotes and wrap the whole cell in double quotes.
  if (
    sanitized.includes('"') ||
    sanitized.includes(',') ||
    sanitized.includes('\n') ||
    sanitized.includes('\r')
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}

export interface CSVExportOptions {
  docName?: string;
  date?: Date;
  includeMetadataHeader?: boolean;
}

/**
 * Converts a DocumentTable to a secure CSV string compliant with RFC-4180.
 * Writes metadata as '# key: value' comment lines at the top while preserving
 * strict Formula Injection Mitigation.
 */
export function exportTableToCSV(
  table: DocumentTable,
  options?: CSVExportOptions
): string {
  const lines: string[] = [];

  // Metadata comments at top (RFC-4180 compliant comments)
  lines.push(`# Application: ${BRAND_NAME}`);
  lines.push(`# Tagline: ${BRAND_TAGLINE}`);
  lines.push(`# Contributor: Devputta (${BRAND_REPOSITORY})`);
  if (options?.docName) {
    const cleanDoc = options.docName.replace(/[\r\n]+/g, ' ').trim();
    lines.push(`# Document: ${cleanDoc}`);
  }
  lines.push(`# Page: ${table.pageNumber}`);
  const genDate = formatExportDateTime(options?.date || new Date(), true);
  lines.push(`# Generated: ${genDate}`);

  // Title comment if present, sanitized to prevent injection or header splitting
  if (table.title) {
    const cleanTitle = table.title
      .replace(/[\r\n]+/g, ' ')
      .replace(/^([=+\-@%|])/g, "'$1")
      .trim();
    lines.push(`# ${cleanTitle}`);
  }

  // Header row
  const headerLine = table.headers.map((h) => sanitizeCSVCell(h)).join(',');
  lines.push(headerLine);

  // Data rows
  for (const row of table.rows) {
    const rowLine = row.map((cell) => sanitizeCSVCell(cell)).join(',');
    lines.push(rowLine);
  }

  return lines.join('\r\n');
}

/**
 * Converts a DocumentTable to structured JSON with metadata object.
 */
export function exportTableToJSON(
  table: DocumentTable,
  options?: { docName?: string; date?: Date }
): { meta: ReturnType<typeof generateJSONMetadata>; data: Record<string, string>[] } {
  const data = table.rows.map((row) => {
    const obj: Record<string, string> = {};
    table.headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  });

  const meta = generateJSONMetadata(table.title || `Table p.${table.pageNumber}`, {
    docA: options?.docName || 'Document',
    docB: table.title || `Table_p${table.pageNumber}`,
    pageNumber: table.pageNumber,
    confidence: table.confidence,
    extractionMethod: table.extractionMethod,
    rowCount: table.rows.length,
    columnCount: table.headers.length,
    date: options?.date || new Date(),
  });

  return { meta, data };
}

/**
 * Computes numeric stats for a column if numerical.
 */
export function analyzeColumn(values: string[]): {
  isNumeric: boolean;
  count: number;
  min?: number;
  max?: number;
  average?: number;
  sum?: number;
} {
  const numericValues = values
    .map((v) => parseFloat(v.replace(/[^0-9.-]/g, '')))
    .filter((n) => !isNaN(n));

  if (numericValues.length >= values.length * 0.6 && numericValues.length > 0) {
    const sum = numericValues.reduce((acc, val) => acc + val, 0);
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const average = sum / numericValues.length;

    return {
      isNumeric: true,
      count: values.length,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      average: Math.round(average * 100) / 100,
      sum: Math.round(sum * 100) / 100,
    };
  }

  return {
    isNumeric: false,
    count: values.length,
  };
}

/**
 * Triggers safe client-side CSV download with standardized filename:
 * doculens_<type>_<docA>_vs_<docB>_YYYY-MM-DD_HHmm.csv
 */
export function downloadCSVFile(
  table: DocumentTable,
  docName: string = 'document',
  filenamePrefix = 'table'
): void {
  const csvContent = exportTableToCSV(table, { docName });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);

  const filename = generateExportFilename(
    'table',
    docName,
    table.title || filenamePrefix || `p${table.pageNumber}`,
    'csv'
  );
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers client-side JSON download with standardized filename:
 * doculens_<type>_<docA>_vs_<docB>_YYYY-MM-DD_HHmm.json
 */
export function downloadJSONFile(
  table: DocumentTable,
  docName: string = 'document',
  filenamePrefix = 'table'
): void {
  const jsonContent = exportTableToJSON(table, { docName });
  const blob = new Blob([JSON.stringify(jsonContent, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);

  const filename = generateExportFilename(
    'table',
    docName,
    table.title || filenamePrefix || `p${table.pageNumber}`,
    'json'
  );
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escapes XML special characters for safe OpenXML insertion.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Computes column letter from 0-indexed column number (0 -> A, 1 -> B, 26 -> AA).
 */
export function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Precomputed CRC32 lookup table for fast local zip generation
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function calculateCRC32(bytes: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a valid, uncompressed standard PKZip (ZIP) archive buffer.
 * Compatible with all spreadsheet applications (Excel, LibreOffice, Google Sheets).
 */
export function buildZipArchive(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let currentOffset = 0;

  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = entry.data;
    const crc = calculateCRC32(dataBytes);
    const size = dataBytes.length;

    // 1. Local file header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0, true); // General purpose bit flag
    lv.setUint16(8, 0, true); // Compression: 0 (Store)
    lv.setUint16(10, 0, true); // Last mod file time
    lv.setUint16(12, 0, true); // Last mod file date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    // 2. Central directory header (46 bytes + name length)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central dir signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0, true); // General purpose bit flag
    cv.setUint16(10, 0, true); // Compression: 0
    cv.setUint16(12, 0, true); // Time
    cv.setUint16(14, 0, true); // Date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, currentOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, dataBytes);
    centralChunks.push(centralHeader);
    currentOffset += localHeader.length + dataBytes.length;
  }

  const centralOffset = currentOffset;
  let centralSize = 0;
  for (const c of centralChunks) {
    centralSize += c.length;
  }

  // 3. End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central directory
  ev.setUint16(8, entries.length, true); // Entries on this disk
  ev.setUint16(10, entries.length, true); // Total entries
  ev.setUint32(12, centralSize, true); // Size of central directory
  ev.setUint32(16, centralOffset, true); // Offset of central directory
  ev.setUint16(20, 0, true); // ZIP comment length

  // Merge all chunks into single Uint8Array
  let totalLength = currentOffset + centralSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  result.set(eocd, pos);

  return result;
}

/**
 * Converts a DocumentTable to a secure, formula-safe Excel (.xlsx) file buffer.
 * - Cells starting with =, +, -, @, \t, \r, %, | are strictly written as text (t="inlineStr")
 *   to eliminate formula injection risks in Excel and other spreadsheet software.
 * - Preserves numeric values for non-injection inputs.
 * - Entirely local, self-contained, 0 network dependencies.
 */
export function exportTableToXLSX(
  table: DocumentTable,
  options?: { docName?: string; date?: Date }
): Uint8Array {
  const encoder = new TextEncoder();

  // 1. Build sheet1.xml
  let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';
  sheetXml += '  <sheetData>\n';

  let rowIndex = 1;

  // Header row
  sheetXml += `    <row r="${rowIndex}">\n`;
  for (let cIdx = 0; cIdx < table.headers.length; cIdx++) {
    const colLetter = getColumnLetter(cIdx);
    const cellRef = `${colLetter}${rowIndex}`;
    const rawVal = table.headers[cIdx] || '';
    const safeText = escapeXml(rawVal);
    sheetXml += `      <c r="${cellRef}" t="inlineStr"><is><t>${safeText}</t></is></c>\n`;
  }
  sheetXml += '    </row>\n';
  rowIndex++;

  // Data rows
  for (const row of table.rows) {
    sheetXml += `    <row r="${rowIndex}">\n`;
    for (let cIdx = 0; cIdx < table.headers.length; cIdx++) {
      const colLetter = getColumnLetter(cIdx);
      const cellRef = `${colLetter}${rowIndex}`;
      const rawVal = row[cIdx] ?? '';
      const strVal = String(rawVal).trim();

      if (strVal === '') {
        // empty cell
        continue;
      }

      const firstChar = strVal.charAt(0);
      const isFormulaRisk = DANGEROUS_FORMULA_PREFIXES.includes(firstChar);

      if (isFormulaRisk) {
        // Requirement: "Keep the formula-injection protection: cells starting with = + - @ are written as text, for XLSX too."
        const safeText = escapeXml(strVal);
        sheetXml += `      <c r="${cellRef}" t="inlineStr"><is><t>${safeText}</t></is></c>\n`;
      } else {
        // Check if valid numeric
        const isNumeric = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(strVal);
        if (isNumeric) {
          sheetXml += `      <c r="${cellRef}"><v>${strVal}</v></c>\n`;
        } else {
          const safeText = escapeXml(strVal);
          sheetXml += `      <c r="${cellRef}" t="inlineStr"><is><t>${safeText}</t></is></c>\n`;
        }
      }
    }
    sheetXml += '    </row>\n';
    rowIndex++;
  }

  sheetXml += '  </sheetData>\n';
  sheetXml += '</worksheet>';

  // Standard OpenXML structures
  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    '  <Default Extension="xml" ContentType="application/xml"/>\n' +
    '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n' +
    '  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n' +
    '</Relationships>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\n' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
    '  <sheets>\n' +
    '    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>\n' +
    '  </sheets>\n' +
    '</workbook>';

  const zipEntries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
  ];

  return buildZipArchive(zipEntries);
}

/**
 * Triggers safe client-side Excel (.xlsx) file download.
 */
export function downloadXLSXFile(
  table: DocumentTable,
  docName: string = 'document',
  filenamePrefix = 'table'
): void {
  const xlsxBytes = exportTableToXLSX(table, { docName });
  const blob = new Blob([xlsxBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);

  const filename = generateExportFilename(
    'table',
    docName,
    table.title || filenamePrefix || `p${table.pageNumber}`,
    'xlsx'
  );
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
