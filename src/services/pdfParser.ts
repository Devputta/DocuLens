/**
 * DocuLens PDF Parser Adapter & Ingestion Pipeline
 * Strict validation (%PDF- signature, byte bounds, page count, SHA-256 checksums),
 * graceful handling of encrypted/corrupt PDFs, and provenance tracking.
 */

import {
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  ElementType,
  UploadProgress,
} from '../types/doculens';
import { parseDocxFile, parseTxtFile } from './docxTxtParser';
import { pdfBytes } from '../utils/bytes';
import { loadPdfjs } from './pdfjsLoader';

// Maximum upload limits from requirements
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_PAGES_LIMIT = 500;

export interface ParseResult {
  document: DocumentEntity;
  elements: DocumentElement[];
  chunks: DocumentChunk[];
  tables: DocumentTable[];
  isZeroText?: boolean;
}

export interface ParseOptions {
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Calculates SHA-256 checksum using Web Crypto API.
 */
export async function calculateSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates file signature, extension, and byte bounds.
 */
export interface HeaderValidationResult {
  valid: boolean;
  isPDF: boolean;
  isDocx?: boolean;
  isTxt?: boolean;
  error?: string;
}

export function validatePDFHeader(
  buffer: ArrayBuffer,
  filename?: string
): HeaderValidationResult {
  if (!buffer || buffer.byteLength === 0) {
    return { valid: false, isPDF: false, error: 'File is empty (0 bytes).' };
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      isPDF: false,
      error: `File size (${sizeMB} MB) exceeds the allowable threshold of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const extMatch = filename ? filename.match(/\.([a-zA-Z0-9]+)$/) : null;
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  // Check file extension if provided
  if (filename) {
    const unsupportedBinaryExts = new Set([
      'exe', 'dll', 'bin', 'zip', 'tar', 'gz', 'rar', '7z',
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
      'mp3', 'mp4', 'mov', 'avi', 'mkv',
      'iso', 'dmg', 'pkg', 'deb', 'rpm'
    ]);
    if (unsupportedBinaryExts.has(ext)) {
      return {
        valid: false,
        isPDF: false,
        error: `Unsupported file type (.${ext}). DocuLens only accepts PDF documents (.pdf) or plain text/markdown (.txt, .md).`,
      };
    }
  }

  // 1. Check for standard PDF magic bytes "%PDF-" anywhere in first 1024 bytes (per ISO 32000-1 specification)
  const headerBytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 1024)));
  let isPDF = false;
  for (let i = 0; i <= headerBytes.length - 5; i++) {
    if (
      headerBytes[i] === 0x25 && // %
      headerBytes[i + 1] === 0x50 && // P
      headerBytes[i + 2] === 0x44 && // D
      headerBytes[i + 3] === 0x46 && // F
      headerBytes[i + 4] === 0x2d // -
    ) {
      isPDF = true;
      break;
    }
  }

  if (isPDF) {
    return { valid: true, isPDF: true, isDocx: false, isTxt: false };
  }

  // 2. Check for DOCX (Compound Binary / Encrypted vs ZIP signature)
  if (
    headerBytes.length >= 8 &&
    headerBytes[0] === 0xd0 &&
    headerBytes[1] === 0xcf &&
    headerBytes[2] === 0x11 &&
    headerBytes[3] === 0xe0 &&
    headerBytes[4] === 0xa1 &&
    headerBytes[5] === 0xb1 &&
    headerBytes[6] === 0x1a &&
    headerBytes[7] === 0xe1
  ) {
    return {
      valid: false,
      isPDF: false,
      error: 'This DOCX document is encrypted or password-protected. Please remove password protection before importing.',
    };
  }

  const isZip =
    headerBytes.length >= 4 &&
    headerBytes[0] === 0x50 &&
    headerBytes[1] === 0x4b &&
    headerBytes[2] === 0x03 &&
    headerBytes[3] === 0x04;

  if (ext === 'docx') {
    if (!isZip) {
      return {
        valid: false,
        isPDF: false,
        error: 'Malformed or corrupt DOCX file. The internal structure does not match a valid OpenXML package.',
      };
    }
    return { valid: true, isPDF: false, isDocx: true, isTxt: false };
  }

  if (isZip && ext !== 'zip') {
    return { valid: true, isPDF: false, isDocx: true, isTxt: false };
  }

  // 3. Text/Markdown checks
  if (ext === 'txt' || ext === 'md') {
    return { valid: true, isPDF: false, isDocx: false, isTxt: true };
  }

  // Check if it's text/markdown/plain with printable characters
  const peekStr = String.fromCharCode(...new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 200))));
  const isPrintable = /^[\x20-\x7E\r\n\t]+$/.test(peekStr);
  if (!isPrintable) {
    return {
      valid: false,
      isPDF: false,
      error: 'Unsupported document format: missing required %PDF- file header signature.',
    };
  }

  return { valid: true, isPDF: false, isDocx: false, isTxt: true };
}

/**
 * Fallback parser for extracting text from text/markdown documents
 */
function parseTextDocument(
  text: string,
  docId: string
): { elements: DocumentElement[]; tables: DocumentTable[] } {
  const lines = text.split('\n');
  const elements: DocumentElement[] = [];
  const tables: DocumentTable[] = [];

  let currentPage = 1;
  let elementIndex = 1;
  let currentTableHeaders: string[] = [];
  let currentTableRows: string[][] = [];
  let inTable = false;

  const flushTable = () => {
    if (inTable && currentTableHeaders.length > 0) {
      const tableId = `${docId}-tbl-${tables.length + 1}`;
      const sourceElId = `${docId}-el-${elementIndex}`;
      elements.push({
        id: sourceElId,
        documentId: docId,
        type: 'table',
        pageNumber: currentPage,
        content: `Table: ${currentTableHeaders.join(' | ')} (${currentTableRows.length} rows)`,
        sourceElementId: `src_${tableId}`,
      });
      tables.push({
        id: tableId,
        documentId: docId,
        pageNumber: currentPage,
        sourceElementId: sourceElId,
        headers: currentTableHeaders,
        rows: currentTableRows,
      });
      elementIndex++;
      currentTableHeaders = [];
      currentTableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check for explicit page break markers
    if (line.includes('--- Page') || line.includes('=== Page') || line === '---') {
      flushTable();
      currentPage++;
      continue;
    }

    if (!line) {
      flushTable();
      continue;
    }

    // Markdown table detection (| col1 | col2 |)
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      // Check if separator line
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        currentTableHeaders = cells;
      } else {
        currentTableRows.push(cells);
      }
      continue;
    } else {
      flushTable();
    }

    // Heading detection
    if (line.startsWith('# ')) {
      elements.push({
        id: `${docId}-el-${elementIndex++}`,
        documentId: docId,
        type: 'heading-1',
        pageNumber: currentPage,
        content: line.replace(/^#\s*/, ''),
        headingLevel: 1,
        sourceElementId: `src_h1_${elementIndex}`,
      });
    } else if (line.startsWith('## ')) {
      elements.push({
        id: `${docId}-el-${elementIndex++}`,
        documentId: docId,
        type: 'heading-2',
        pageNumber: currentPage,
        content: line.replace(/^##\s*/, ''),
        headingLevel: 2,
        sourceElementId: `src_h2_${elementIndex}`,
      });
    } else if (line.startsWith('### ')) {
      elements.push({
        id: `${docId}-el-${elementIndex++}`,
        documentId: docId,
        type: 'heading-3',
        pageNumber: currentPage,
        content: line.replace(/^###\s*/, ''),
        headingLevel: 3,
        sourceElementId: `src_h3_${elementIndex}`,
      });
    } else if (line.startsWith('* ') || line.startsWith('- ') || /^\d+\.\s/.test(line)) {
      elements.push({
        id: `${docId}-el-${elementIndex++}`,
        documentId: docId,
        type: 'list-item',
        pageNumber: currentPage,
        content: line,
        sourceElementId: `src_li_${elementIndex}`,
      });
    } else if (line.toLowerCase().startsWith('footnote') || line.startsWith('[^')) {
      elements.push({
        id: `${docId}-el-${elementIndex++}`,
        documentId: docId,
        type: 'footnote',
        pageNumber: currentPage,
        content: line,
        sourceElementId: `src_fn_${elementIndex}`,
      });
    } else {
      elements.push({
        id: `${docId}-el-${elementIndex++}`,
        documentId: docId,
        type: 'paragraph',
        pageNumber: currentPage,
        content: line,
        sourceElementId: `src_p_${elementIndex}`,
      });
    }
  }

  flushTable();
  return { elements, tables };
}

export interface PDFTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Robust PDF layout and table extraction pipeline using positional metadata from PDF.js.
 * Groups text items into rows with baseline tolerances, detects column boundaries,
 * handles wrapped multi-line cells and empty cells, excludes bullet lists and prose paragraphs,
 * and attaches extraction confidence and provenance.
 */
export function extractPageLayoutAndTables(
  items: PDFTextItemLike[],
  pageNum: number,
  docId: string,
  viewportHeight: number = 792,
  startElementIndex: number = 1
): { elements: DocumentElement[]; tables: DocumentTable[]; nextElementIndex: number } {
  let elementIndex = startElementIndex;
  const elements: DocumentElement[] = [];
  const tables: DocumentTable[] = [];

  // Filter out blank items
  const validItems = items.filter((item) => item.str && item.str.trim().length > 0);
  if (validItems.length === 0) {
    return { elements, tables, nextElementIndex: elementIndex };
  }

  // Convert to visual spans with x, y, width, height
  interface Span {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  const spans: Span[] = validItems.map((item) => {
    const x = item.transform && item.transform.length >= 6 ? item.transform[4] : 0;
    const y = item.transform && item.transform.length >= 6 ? item.transform[5] : 0;
    return {
      text: item.str,
      x,
      y,
      width: item.width || 0,
      height: item.height || 10,
    };
  });

  // Sort spans top-to-bottom (y descending), then left-to-right (x ascending)
  spans.sort((a, b) => b.y - a.y || a.x - b.x);

  // Group spans into visual lines with baseline tolerance
  interface Line {
    y: number;
    height: number;
    spans: Span[];
    fullText: string;
  }

  const lines: Line[] = [];
  for (const span of spans) {
    const tol = Math.max(3.5, span.height * 0.55);
    const line = lines.find((l) => Math.abs(l.y - span.y) <= tol);
    if (line) {
      line.spans.push(span);
      line.y = (line.y * (line.spans.length - 1) + span.y) / line.spans.length;
      line.height = Math.max(line.height, span.height);
    } else {
      lines.push({
        y: span.y,
        height: span.height,
        spans: [span],
        fullText: '',
      });
    }
  }

  // Sort lines top-to-bottom
  lines.sort((a, b) => b.y - a.y);

  // In each line, sort spans by x, merge adjacent word chunks
  for (const line of lines) {
    line.spans.sort((a, b) => a.x - b.x);
    const merged: Span[] = [];
    for (const span of line.spans) {
      if (merged.length === 0) {
        merged.push({ ...span });
      } else {
        const prev = merged[merged.length - 1];
        const gap = span.x - (prev.x + prev.width);
        if (gap < 4.5) {
          const needsSpace = gap > 1.2 && !prev.text.endsWith(' ') && !span.text.startsWith(' ');
          prev.text += (needsSpace ? ' ' : '') + span.text;
          prev.width = (span.x + span.width) - prev.x;
          prev.height = Math.max(prev.height, span.height);
        } else {
          merged.push({ ...span });
        }
      }
    }
    line.spans = merged;
    line.fullText = merged.map((s) => s.text).join(' ').trim();
  }

  // Helper to check if a line has multiple distinct column-like spans
  const isCandidateRow = (line: Line): boolean => {
    // Pipe delimited syntax
    if (line.fullText.includes('|') && line.fullText.split('|').length >= 3) {
      return true;
    }
    if (line.spans.length < 2) return false;
    // Bullet list exclusion: if span 0 is bullet/number and only 2 spans total
    if (line.spans.length === 2) {
      const first = line.spans[0].text.trim();
      if (/^[•\-\*\u2022\u25E6]|\d{1,2}\.$/.test(first)) {
        return false;
      }
    }
    // Check horizontal gaps between spans: at least one gap must be >= 12 points
    for (let i = 0; i < line.spans.length - 1; i++) {
      const gap = line.spans[i + 1].x - (line.spans[i].x + line.spans[i].width);
      if (gap >= 12) return true;
    }
    return false;
  };

  const consumedLineIndices = new Set<number>();
  let tableCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    if (consumedLineIndices.has(i)) continue;
    if (!isCandidateRow(lines[i])) continue;

    // Scan for consecutive rows that form a table block
    const tableLineIndices: number[] = [i];
    for (let j = i + 1; j < lines.length; j++) {
      if (consumedLineIndices.has(j)) break;
      const curLine = lines[j];
      const prevLine = lines[tableLineIndices[tableLineIndices.length - 1]];
      const vGap = prevLine.y - curLine.y;

      // If vertical gap is too large (> 45 pt), break
      if (vGap > 45) break;

      if (isCandidateRow(curLine)) {
        tableLineIndices.push(j);
      } else if (vGap < Math.max(16, curLine.height * 1.5) && curLine.spans.length >= 1) {
        // Potential wrapped multi-line cell continuation
        tableLineIndices.push(j);
      } else {
        break;
      }
    }

    if (tableLineIndices.length >= 2) {
      // Collect column boundaries across rows
      const allX: number[] = [];
      for (const idx of tableLineIndices) {
        for (const s of lines[idx].spans) {
          allX.push(s.x);
        }
      }

      // Cluster x coordinates within 14 points tolerance
      allX.sort((a, b) => a - b);
      const colClusters: number[] = [];
      for (const x of allX) {
        const existing = colClusters.find((c) => Math.abs(c - x) <= 14);
        if (existing === undefined) {
          colClusters.push(x);
        }
      }
      colClusters.sort((a, b) => a - b);

      if (colClusters.length >= 2) {
        const getClosestCol = (spanX: number): number => {
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let c = 0; c < colClusters.length; c++) {
            const dist = Math.abs(colClusters[c] - spanX);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = c;
            }
          }
          return bestIdx;
        };

        const rawGrid: string[][] = [];
        let isWrappedRow = false;

        for (let rIdx = 0; rIdx < tableLineIndices.length; rIdx++) {
          const line = lines[tableLineIndices[rIdx]];
          const rowCells = new Array(colClusters.length).fill('');
          const colsPopulated = new Set<number>();

          for (const s of line.spans) {
            const col = getClosestCol(s.x);
            if (!colsPopulated.has(col)) {
              rowCells[col] = s.text.trim();
              colsPopulated.add(col);
            } else {
              rowCells[col] += ' ' + s.text.trim();
            }
          }

          // Check for wrapped continuation of previous row
          const prevGridRow = rawGrid.length > 0 ? rawGrid[rawGrid.length - 1] : null;
          const prevLine = rIdx > 0 ? lines[tableLineIndices[rIdx - 1]] : null;
          const vGap = prevLine ? prevLine.y - line.y : 999;

          if (
            prevGridRow &&
            vGap < Math.max(16, line.height * 1.4) &&
            colsPopulated.size < colClusters.length &&
            colsPopulated.size <= 2 &&
            line.spans.length <= 2
          ) {
            for (let c = 0; c < colClusters.length; c++) {
              if (rowCells[c]) {
                prevGridRow[c] = prevGridRow[c] ? `${prevGridRow[c]} ${rowCells[c]}` : rowCells[c];
              }
            }
            isWrappedRow = true;
          } else {
            if (colsPopulated.size > 0) {
              rawGrid.push(rowCells);
            }
          }
        }

        if (rawGrid.length >= 2) {
          const headerRow = rawGrid[0];
          const dataRows = rawGrid.slice(1);

          // Exclude bullet lists
          const isBulletList =
            colClusters.length === 2 &&
            dataRows.every((r) => /^[•\-\*\u2022\u25E6]|\d{1,2}\.$/.test(r[0].trim()));

          if (!isBulletList) {
            let tableTitle: string | undefined;
            if (i > 0 && !consumedLineIndices.has(i - 1)) {
              const prevLine = lines[i - 1];
              const prevText = prevLine.fullText.trim();
              if (
                prevText.length < 90 &&
                (/^(table|exhibit|figure|matrix|summary of|overview|chart)\b/i.test(prevText) ||
                  (prevLine.spans.length === 1 && prevLine.height > lines[i].height))
              ) {
                tableTitle = prevText;
                consumedLineIndices.add(i - 1);
              }
            }

            let confidence: 'high' | 'medium' | 'low' = 'high';
            const warnings: string[] = [];

            if (colClusters.length < 3 || dataRows.length < 2) {
              confidence = 'medium';
            }
            if (isWrappedRow) {
              warnings.push('Contains wrapped cell text aligned by proximity.');
            }
            const emptyCellCount = dataRows.reduce(
              (acc, r) => acc + r.filter((c) => !c || !c.trim()).length,
              0
            );
            if (emptyCellCount > (dataRows.length * colClusters.length) / 3) {
              confidence = 'medium';
              warnings.push('Table contains empty cells; preserved without synthetic fabrication.');
            }

            const tableId = `${docId}-tbl-p${pageNum}-${tableCounter++}`;
            const sourceElId = `${docId}-el-${elementIndex++}`;

            const docTable: DocumentTable = {
              id: tableId,
              documentId: docId,
              pageNumber: pageNum,
              sourceElementId: sourceElId,
              title: tableTitle || `Table ${tables.length + 1} (Page ${pageNum})`,
              headers: headerRow.map((h, hIdx) => h.trim() || `Column ${hIdx + 1}`),
              rows: dataRows,
              confidence,
              warnings: warnings.length > 0 ? warnings : undefined,
              extractionMethod: 'pdf-layout-analysis',
              columnCount: colClusters.length,
              rowCount: dataRows.length,
            };

            tables.push(docTable);

            const normY = Math.max(
              0,
              Math.min(100, Math.round(((viewportHeight - lines[i].y) / viewportHeight) * 100))
            );
            elements.push({
              id: sourceElId,
              documentId: docId,
              type: 'table',
              pageNumber: pageNum,
              content: `${docTable.title}: ${docTable.headers.join(' | ')} (${docTable.rows.length} rows)`,
              bbox: [10, normY, 80, 20],
              sourceElementId: `src_${tableId}`,
            });

            for (const idx of tableLineIndices) {
              consumedLineIndices.add(idx);
            }
            continue;
          }
        }
      }
    }
  }

  // Emit remaining non-consumed lines as normal elements
  for (let i = 0; i < lines.length; i++) {
    if (consumedLineIndices.has(i)) continue;
    const line = lines[i];
    const lineText = line.fullText;
    if (!lineText) continue;

    let elType: ElementType = 'paragraph';
    let headingLevel: number | undefined;

    const normY = Math.max(
      0,
      Math.min(100, Math.round(((viewportHeight - line.y) / viewportHeight) * 100))
    );
    const bbox: [number, number, number, number] = [10, normY, 80, 5];

    if (
      lineText.length < 80 &&
      (lineText === lineText.toUpperCase() ||
        lineText.startsWith('Chapter') ||
        lineText.startsWith('Section') ||
        line.height >= 14) &&
      !lineText.endsWith('.')
    ) {
      elType = 'heading-1';
      headingLevel = 1;
    } else if (lineText.length < 100 && /^[0-9]\.[0-9]/.test(lineText)) {
      elType = 'heading-2';
      headingLevel = 2;
    } else if (normY > 90 || lineText.toLowerCase().startsWith('footnote')) {
      elType = 'footnote';
    } else if (/^[•\-\*\u2022\u25E6]|\d{1,2}\.\s/.test(lineText)) {
      elType = 'list-item';
    }

    elements.push({
      id: `${docId}-el-${elementIndex++}`,
      documentId: docId,
      type: elType,
      pageNumber: pageNum,
      content: lineText,
      headingLevel,
      bbox,
      sourceElementId: `src_p${pageNum}_e${elementIndex}`,
    });
  }

  return { elements, tables, nextElementIndex: elementIndex };
}

/**
 * Parses a PDF file with strict validation, error isolation, and stage-by-stage progress callbacks.
 */
export async function parsePDFFile(
  file: File | { name: string; buffer: ArrayBuffer },
  options?: ParseOptions
): Promise<ParseResult> {
  const onProgress = options?.onProgress;
  const originalName = file.name;

  onProgress?.({
    stage: 'reading',
    percent: 5,
    message: `Reading ${originalName}...`,
  });

  const buffer = 'buffer' in file ? file.buffer : await file.arrayBuffer();
  const sizeBytes = buffer.byteLength;

  // 1. Signature & Bounds Validation
  onProgress?.({
    stage: 'validating',
    percent: 15,
    message: 'Validating file signature, headers, and allowable size...',
  });

  const validation = validatePDFHeader(buffer, originalName);
  if (!validation.valid) {
    throw new Error(validation.error || 'Failed document validation.');
  }

  const sha256 = await calculateSHA256(buffer);
  const docId = `doc-${crypto.randomUUID().slice(0, 8)}`;
  const storedPath = `local://doculens/storage/${docId}-${originalName.replace(/\s+/g, '_')}`;

  let elements: DocumentElement[] = [];
  let tables: DocumentTable[] = [];
  let pageCount = 1;
  let isScanned = false;
  let isZeroText = false;
  let warningMessage: string | undefined;

  if (validation.isDocx) {
    onProgress?.({
      stage: 'parsing',
      percent: 30,
      message: `Parsing DOCX headings, paragraphs, and tables from ${originalName}...`,
    });
    const docxResult = await parseDocxFile({ name: originalName, buffer }, docId);
    onProgress?.({
      stage: 'complete',
      percent: 100,
      message: 'Ingestion complete.',
    });
    return {
      document: docxResult.document,
      elements: docxResult.elements,
      chunks: docxResult.chunks,
      tables: docxResult.tables,
      isZeroText: false,
    };
  }

  if (validation.isTxt) {
    onProgress?.({
      stage: 'parsing',
      percent: 30,
      message: `Paginating text into virtual pages from ${originalName}...`,
    });
    const txtResult = await parseTxtFile({ name: originalName, buffer }, docId);
    onProgress?.({
      stage: 'complete',
      percent: 100,
      message: 'Ingestion complete.',
    });
    return {
      document: txtResult.document,
      elements: txtResult.elements,
      chunks: txtResult.chunks,
      tables: txtResult.tables,
      isZeroText: false,
    };
  }

  if (validation.isPDF) {
    onProgress?.({
      stage: 'parsing',
      percent: 25,
      message: 'Initializing PDF layout engine and inspecting page structures...',
    });

    try {
      const pdfjs = await loadPdfjs();

      const loadingTask = pdfjs.getDocument({
        data: pdfBytes(buffer),
        useSystemFonts: true,
      });

      const pdf = await loadingTask.promise;

      // Page Count Limit Check
      if (pdf.numPages > MAX_PAGES_LIMIT) {
        throw new Error(
          `Document exceeds maximum allowable limit of ${MAX_PAGES_LIMIT} pages (found ${pdf.numPages} pages). Please split the document before uploading.`
        );
      }

      pageCount = pdf.numPages;
      let elementIndex = 1;

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const percent = Math.round(25 + (pageNum / pageCount) * 50);
        onProgress?.({
          stage: 'parsing',
          percent,
          message: `Extracting page ${pageNum} of ${pageCount}...`,
          currentPage: pageNum,
          totalPages: pageCount,
        });

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        const items = textContent.items as Array<{
          str: string;
          transform: number[];
          width: number;
          height: number;
        }>;

        const { elements: pageElements, tables: pageTables, nextElementIndex } =
          extractPageLayoutAndTables(items, pageNum, docId, viewport.height, elementIndex);

        elementIndex = nextElementIndex;
        elements.push(...pageElements);
        tables.push(...pageTables);
      }

      // Check if document has no extractable text layer (scanned PDF)
      if (elements.length === 0) {
        isScanned = true;
        isZeroText = true;
        warningMessage =
          'Scanned document without embedded OCR text layer. Text search, citation extraction, and diffing require a searchable text layer.';
        elements.push({
          id: `${docId}-el-1`,
          documentId: docId,
          type: 'callout',
          pageNumber: 1,
          content: `[Notice: Scanned document without embedded OCR text layer (${pageCount} page${pageCount > 1 ? 's' : ''}). Text search and citation extraction require searchable text.]`,
          sourceElementId: 'src_scanned_notice',
        });
      }
    } catch (pdfErr: any) {
      // Discriminate between specific PDF failure modes
      const errMsg = pdfErr?.message || String(pdfErr);
      const errName = pdfErr?.name || '';

      if (errName === 'PasswordException' || /password|encrypted|decrypt/i.test(errMsg)) {
        throw new Error(
          'This PDF document is encrypted or password-protected. Please unlock or decrypt the file before importing.'
        );
      }

      if (errName === 'InvalidPDFException' || /invalid pdf|corrupted|stream end|xref/i.test(errMsg)) {
        throw new Error(
          'Malformed or corrupted PDF file. The internal PDF structure could not be parsed.'
        );
      }

      // Re-throw page limit or custom errors directly
      if (errMsg.includes('Document exceeds maximum allowable limit')) {
        throw pdfErr;
      }

      console.debug('PDF.js binary decode fallback triggered:', pdfErr);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const rawText = decoder.decode(buffer);
      const textOnly = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
      const parsed = parseTextDocument(textOnly, docId);
      elements = parsed.elements;
      tables = parsed.tables;
      pageCount = Math.max(1, Math.max(...elements.map((e) => e.pageNumber), 1));
    }
  } else {
    // Plain text / Markdown document
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(buffer);
    const parsed = parseTextDocument(rawText, docId);
    elements = parsed.elements;
    tables = parsed.tables;
    pageCount = Math.max(1, Math.max(...elements.map((e) => e.pageNumber), 1));
  }

  // 2. Chunks Construction
  onProgress?.({
    stage: 'chunking',
    percent: 85,
    message: 'Constructing provenance-linked chunks and section hierarchies...',
  });

  const chunks = createProvenanceChunks(elements, docId);

  // Document summary preview
  const previewText = elements
    .slice(0, 4)
    .map((e) => e.content)
    .join(' ');
  const summary = previewText.length > 250 ? `${previewText.slice(0, 247)}...` : previewText;

  // 3. Final Storage Packaging
  onProgress?.({
    stage: 'storing',
    percent: 95,
    message: 'Finalizing document record and IndexedDB storage...',
  });

  const document: DocumentEntity = {
    id: docId,
    originalName,
    storedPath,
    sha256,
    sizeBytes,
    pageCount,
    status: 'ready',
    parserName: 'DocuLens-PDF-Adapter',
    parserVersion: '1.2.0',
    createdAt: Date.now(),
    processedAt: Date.now(),
    summary,
    elementCount: elements.length,
    chunkCount: chunks.length,
    tableCount: tables.length,
    isScanned,
    warningMessage,
  };

  onProgress?.({
    stage: 'complete',
    percent: 100,
    message: 'Ingestion complete.',
  });

  return {
    document,
    elements,
    chunks,
    tables,
    isZeroText,
  };
}

/**
 * Creates provenance-aware chunks adhering to size boundaries (~1,800 chars target, max ~2,400).
 */
export function createProvenanceChunks(
  elements: DocumentElement[],
  documentId: string
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const TARGET_CHUNK_CHARS = 1600;
  const MAX_CHUNK_CHARS = 2400;

  let currentText = '';
  let currentElementIds: string[] = [];
  let pageStart = 1;
  let pageEnd = 1;
  let currentSectionPath: string[] = [];
  let chunkIndex = 1;

  for (const el of elements) {
    if (el.type.startsWith('heading')) {
      currentSectionPath = [el.content];
    }

    const prospectiveLength = currentText.length + el.content.length + 2;

    if (prospectiveLength > MAX_CHUNK_CHARS && currentText.length > 0) {
      chunks.push({
        id: `${documentId}-chk-${chunkIndex++}`,
        documentId,
        text: currentText.trim(),
        pageStart,
        pageEnd,
        elementIds: [...currentElementIds],
        sectionPath: [...currentSectionPath],
        searchText: currentText.toLowerCase().replace(/[^a-z0-9\s]/g, ' '),
      });

      currentText = `${el.content}\n\n`;
      currentElementIds = [el.id];
      pageStart = el.pageNumber;
      pageEnd = el.pageNumber;
    } else {
      if (currentText.length === 0) {
        pageStart = el.pageNumber;
      }
      currentText += `${el.content}\n\n`;
      currentElementIds.push(el.id);
      pageEnd = el.pageNumber;

      if (currentText.length >= TARGET_CHUNK_CHARS) {
        chunks.push({
          id: `${documentId}-chk-${chunkIndex++}`,
          documentId,
          text: currentText.trim(),
          pageStart,
          pageEnd,
          elementIds: [...currentElementIds],
          sectionPath: [...currentSectionPath],
          searchText: currentText.toLowerCase().replace(/[^a-z0-9\s]/g, ' '),
        });
        currentText = '';
        currentElementIds = [];
      }
    }
  }

  if (currentText.trim().length > 0) {
    chunks.push({
      id: `${documentId}-chk-${chunkIndex++}`,
      documentId,
      text: currentText.trim(),
      pageStart,
      pageEnd,
      elementIds: [...currentElementIds],
      sectionPath: [...currentSectionPath],
      searchText: currentText.toLowerCase().replace(/[^a-z0-9\s]/g, ' '),
    });
  }

  return chunks;
}
