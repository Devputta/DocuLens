/**
 * DocuLens Text & DOCX Ingestion Engine
 * 
 * Supports .txt and .docx ingestion alongside PDFs with:
 * - 25 MB file size limit and strict untrusted file handling
 * - PK ZIP signature validation for DOCX (ignoring macros and embedded scripts)
 * - Heading detection (ALL CAPS, numbered sections, short header lines)
 * - 3,000 character virtual page pagination at paragraph boundaries
 * - Table extraction from DOCX into DocumentTable records
 * - Reflowed provenance markers
 * - Clear error states for corrupt or password-protected documents
 */

import mammoth from 'mammoth';
import {
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  ElementType,
} from '../types/doculens';
import { calculateSHA256 } from './pdfParser';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const CHARS_PER_VIRTUAL_PAGE = 3000;

export interface IngestionResult {
  document: DocumentEntity;
  elements: DocumentElement[];
  chunks: DocumentChunk[];
  tables: DocumentTable[];
  isReflowed: boolean;
}

/**
 * Validates document buffer for supported formats: .pdf, .docx, .txt
 */
export function validateAnyDocumentHeader(
  buffer: ArrayBuffer,
  filename: string
): {
  valid: boolean;
  format: 'pdf' | 'docx' | 'txt' | 'unknown';
  error?: string;
} {
  if (!buffer || buffer.byteLength === 0) {
    return { valid: false, format: 'unknown', error: 'File is empty (0 bytes).' };
  }

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      format: 'unknown',
      error: `File size (${sizeMB} MB) exceeds the allowable threshold of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  // Unsupported binary executable / archive check
  const bannedExts = new Set([
    'exe', 'dll', 'bin', 'tar', 'gz', 'rar', '7z',
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
    'mp3', 'mp4', 'mov', 'avi', 'mkv',
    'iso', 'dmg', 'pkg', 'deb', 'rpm'
  ]);
  if (bannedExts.has(ext)) {
    return {
      valid: false,
      format: 'unknown',
      error: `Unsupported file type (.${ext}). DocuLens accepts PDF (.pdf), Word (.docx), or text (.txt) files.`,
    };
  }

  const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 1024)));

  // 1. PDF Check (%PDF-)
  for (let i = 0; i <= bytes.length - 5; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return { valid: true, format: 'pdf' };
    }
  }

  // 2. Encrypted Office Document check (Compound File Binary format / OLE)
  // 0xD0 0xCF 0x11 0xE0 0xA1 0xB1 0x1A 0xE1
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  ) {
    return {
      valid: false,
      format: 'docx',
      error: 'This DOCX document is encrypted or password-protected. Please remove password protection before importing.',
    };
  }

  // 3. DOCX Check (Must be ZIP container: PK\x03\x04)
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  if (ext === 'docx') {
    if (!isZip) {
      return {
        valid: false,
        format: 'docx',
        error: 'Malformed or corrupt DOCX file. The internal structure does not match a valid OpenXML package.',
      };
    }
    return { valid: true, format: 'docx' };
  }

  if (isZip) {
    return { valid: true, format: 'docx' };
  }

  // 4. Plain text / Markdown
  if (ext === 'txt' || ext === 'md' || ext === '') {
    return { valid: true, format: 'txt' };
  }

  return {
    valid: false,
    format: 'unknown',
    error: `Unsupported file format. DocuLens accepts .pdf, .docx, and .txt documents up to 25 MB.`,
  };
}

/**
 * Parses plain text (.txt) with blank-line splitting, heading heuristics, and virtual pagination.
 */
export async function parseTxtFile(
  fileOrBuffer: File | { name: string; buffer: ArrayBuffer },
  docId?: string
): Promise<IngestionResult> {
  const originalName = fileOrBuffer.name;
  const buffer = 'buffer' in fileOrBuffer ? fileOrBuffer.buffer : await fileOrBuffer.arrayBuffer();

  const validation = validateAnyDocumentHeader(buffer, originalName);
  if (!validation.valid) {
    throw new Error(validation.error || 'Failed document validation.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(buffer);
  const targetDocId = docId || `doc-${crypto.randomUUID().slice(0, 8)}`;
  const sha256 = await calculateSHA256(buffer);

  // Split into paragraphs by blank lines (2 or more newlines)
  const rawParagraphs = text.split(/\r?\n\s*\r?\n+/);

  const elements: DocumentElement[] = [];
  const tables: DocumentTable[] = [];
  let currentPage = 1;
  let currentPageChars = 0;
  let elementIndex = 1;

  for (const rawPara of rawParagraphs) {
    const trimmed = rawPara.trim();
    if (!trimmed) continue;

    // Advance virtual page if exceeding target ~3,000 characters
    if (currentPageChars > 0 && currentPageChars + trimmed.length > CHARS_PER_VIRTUAL_PAGE) {
      currentPage++;
      currentPageChars = 0;
    }

    // Markdown table detection (| col1 | col2 |)
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    const isTableBlock =
      lines.length >= 2 && lines.every((l) => l.startsWith('|') && l.endsWith('|'));
    if (isTableBlock) {
      const headerLine = lines[0];
      const headers = headerLine.split('|').slice(1, -1).map((c) => c.trim());
      const dataRows: string[][] = [];
      for (let i = 1; i < lines.length; i++) {
        const rowLine = lines[i];
        const cells = rowLine.split('|').slice(1, -1).map((c) => c.trim());
        if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
        dataRows.push(cells);
      }
      if (headers.length > 0) {
        const tableId = `tbl-${crypto.randomUUID().slice(0, 8)}`;
        const sourceElId = `src_p${currentPage}_e${elementIndex}`;
        const docTable: DocumentTable = {
          id: tableId,
          documentId: targetDocId,
          pageNumber: currentPage,
          sourceElementId: sourceElId,
          title: `Table (${headers.join(' | ')})`,
          headers,
          rows: dataRows,
          columnCount: headers.length,
          rowCount: dataRows.length,
          confidence: 'high',
          extractionMethod: 'user-adjusted',
        };
        tables.push(docTable);
        elements.push({
          id: `${targetDocId}-el-${elementIndex}`,
          documentId: targetDocId,
          type: 'table',
          pageNumber: currentPage,
          content: `[Table: ${headers.join(' | ')}]`,
          sourceElementId: sourceElId,
        });
        currentPageChars += trimmed.length;
        elementIndex++;
        continue;
      }
    }

    // Heuristics for Heading Detection:
    // 1. Short lines without a final period (length <= 80, no trailing '.')
    // 2. Numbered headings (e.g. "1. Introduction", "2.1 Methods")
    // 3. ALL CAPS line (e.g. "EXECUTIVE SUMMARY")
    const isSingleLine = !trimmed.includes('\n');
    const isShort = trimmed.length <= 85;
    const hasNoPeriod = !trimmed.endsWith('.');
    const isNumbered = /^(?:chapter|section|part)?\s*\d+(?:\.\d+)*\.?\s+[A-Z]/i.test(trimmed);
    const isAllCaps =
      trimmed.length >= 4 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed);

    let type: ElementType = 'paragraph';
    let headingLevel: number | undefined;

    if ((isShort && hasNoPeriod && (isNumbered || isSingleLine)) || isAllCaps) {
      if (isAllCaps || /^\d+\.?\s+/.test(trimmed)) {
        type = 'heading-1';
        headingLevel = 1;
      } else if (/^\d+\.\d+/.test(trimmed)) {
        type = 'heading-2';
        headingLevel = 2;
      } else {
        type = 'heading-2';
        headingLevel = 2;
      }
    } else if (/^[-*•]\s+/.test(trimmed) || /^\d+\)\s+/.test(trimmed)) {
      type = 'list-item';
    }

    elements.push({
      id: `${targetDocId}-el-${elementIndex}`,
      documentId: targetDocId,
      type,
      pageNumber: currentPage,
      content: trimmed,
      headingLevel,
      sourceElementId: `src_p${currentPage}_e${elementIndex}`,
    });

    currentPageChars += trimmed.length;
    elementIndex++;
  }

  // Fallback if empty
  if (elements.length === 0) {
    elements.push({
      id: `${targetDocId}-el-1`,
      documentId: targetDocId,
      type: 'paragraph',
      pageNumber: 1,
      content: text.trim() || '[Empty Document]',
      sourceElementId: 'src_p1_e1',
    });
  }

  const totalPages = Math.max(1, currentPage);
  const chunks = createDocumentChunks(elements, targetDocId);

  const preview = elements.slice(0, 3).map((e) => e.content).join(' ');
  const summary = preview.length > 250 ? `${preview.slice(0, 247)}...` : preview;

  const document: DocumentEntity = {
    id: targetDocId,
    originalName,
    storedPath: `local://doculens/storage/${targetDocId}-${originalName.replace(/\s+/g, '_')}`,
    sha256,
    sizeBytes: buffer.byteLength,
    pageCount: totalPages,
    status: 'ready',
    parserName: 'DocuLens-TXT-Engine',
    parserVersion: '1.0.0',
    createdAt: Date.now(),
    processedAt: Date.now(),
    summary,
    elementCount: elements.length,
    chunkCount: chunks.length,
    tableCount: tables.length,
    isReflowed: true,
    fileType: 'txt',
  };

  return {
    document,
    elements,
    chunks,
    tables,
    isReflowed: true,
  };
}

/**
 * Parses DOCX document using mammoth in bundled offline mode.
 * Extracts headings, paragraphs, lists, and tables with full virtual page pagination.
 */
export async function parseDocxFile(
  fileOrBuffer: File | { name: string; buffer: ArrayBuffer },
  docId?: string
): Promise<IngestionResult> {
  const originalName = fileOrBuffer.name;
  const buffer = 'buffer' in fileOrBuffer ? fileOrBuffer.buffer : await fileOrBuffer.arrayBuffer();

  // Validate ZIP header and size
  const validation = validateAnyDocumentHeader(buffer, originalName);
  if (!validation.valid) {
    throw new Error(validation.error || 'Failed document validation.');
  }

  const targetDocId = docId || `doc-${crypto.randomUUID().slice(0, 8)}`;
  const sha256 = await calculateSHA256(buffer);

  let html = '';
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    html = result.value || '';
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/encrypted|password|decrypt/i.test(msg)) {
      throw new Error(
        'This DOCX document is encrypted or password-protected. Please remove password protection before importing.'
      );
    }
    throw new Error(`Malformed or corrupt DOCX file: ${msg}`);
  }

  if (!html.trim()) {
    // Attempt fallback raw text extraction
    try {
      const rawRes = await mammoth.extractRawText({ arrayBuffer: buffer });
      const rawText = rawRes.value || '';
      if (rawText.trim()) {
        const txtRes = await parseTxtFile({ name: originalName, buffer }, targetDocId);
        txtRes.document.fileType = 'docx';
        txtRes.document.parserName = 'DocuLens-DOCX-Fallback';
        return txtRes;
      }
    } catch {
      // ignore
    }
  }

  // Parse HTML structures (headings, paragraphs, lists, tables)
  const { elements, tables, pageCount } = extractDocxStructures(html, targetDocId);

  const chunks = createDocumentChunks(elements, targetDocId);
  const preview = elements.slice(0, 3).map((e) => e.content).join(' ');
  const summary = preview.length > 250 ? `${preview.slice(0, 247)}...` : preview;

  const document: DocumentEntity = {
    id: targetDocId,
    originalName,
    storedPath: `local://doculens/storage/${targetDocId}-${originalName.replace(/\s+/g, '_')}`,
    sha256,
    sizeBytes: buffer.byteLength,
    pageCount,
    status: 'ready',
    parserName: 'DocuLens-DOCX-Engine',
    parserVersion: '1.0.0',
    createdAt: Date.now(),
    processedAt: Date.now(),
    summary,
    elementCount: elements.length,
    chunkCount: chunks.length,
    tableCount: tables.length,
    isReflowed: true,
    fileType: 'docx',
  };

  return {
    document,
    elements,
    chunks,
    tables,
    isReflowed: true,
  };
}

/**
 * Extracts structured elements and tables from Mammoth HTML with 3,000 char virtual pagination.
 */
function extractDocxStructures(
  html: string,
  docId: string
): { elements: DocumentElement[]; tables: DocumentTable[]; pageCount: number } {
  const elements: DocumentElement[] = [];
  const tables: DocumentTable[] = [];

  let currentPage = 1;
  let currentPageChars = 0;
  let elementIndex = 1;

  // Tokenize HTML by block level tags: h1-h6, p, li, table
  const blockRegex = /<(h[1-6]|p|li|table)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];

    if (tag === 'table') {
      // Parse Table Rows and Cells
      const rowMatches = inner.match(/<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/gi) || [];
      const parsedRows: string[][] = [];

      for (const rowHtml of rowMatches) {
        const cellMatches = rowHtml.match(/<(td|th)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi) || [];
        const rowCells = cellMatches.map((c) => stripHtml(c).trim());
        if (rowCells.length > 0) {
          parsedRows.push(rowCells);
        }
      }

      if (parsedRows.length > 0) {
        const headers = parsedRows[0];
        const bodyRows = parsedRows.slice(1);

        const tableText = parsedRows.map((r) => r.join(' | ')).join('\n');
        if (currentPageChars > 0 && currentPageChars + tableText.length > CHARS_PER_VIRTUAL_PAGE) {
          currentPage++;
          currentPageChars = 0;
        }

        const sourceElId = `src_p${currentPage}_e${elementIndex}`;
        const tableId = `tbl-${crypto.randomUUID().slice(0, 8)}`;

        const docTable: DocumentTable = {
          id: tableId,
          documentId: docId,
          pageNumber: currentPage,
          sourceElementId: sourceElId,
          headers,
          rows: bodyRows,
          columnCount: headers.length,
          rowCount: bodyRows.length,
          confidence: 'high',
          extractionMethod: 'user-adjusted',
        };
        tables.push(docTable);

        elements.push({
          id: `${docId}-el-${elementIndex}`,
          documentId: docId,
          type: 'table',
          pageNumber: currentPage,
          content: `[Table: ${headers.join(' | ')}]`,
          sourceElementId: sourceElId,
        });

        currentPageChars += tableText.length;
        elementIndex++;
      }
      continue;
    }

    const textContent = stripHtml(inner).trim();
    if (!textContent) continue;

    if (currentPageChars > 0 && currentPageChars + textContent.length > CHARS_PER_VIRTUAL_PAGE) {
      currentPage++;
      currentPageChars = 0;
    }

    let type: ElementType = 'paragraph';
    let headingLevel: number | undefined;

    if (tag.startsWith('h')) {
      const level = parseInt(tag[1], 10);
      if (level === 1) type = 'heading-1';
      else if (level === 2) type = 'heading-2';
      else type = 'heading-3';
      headingLevel = level;
    } else if (tag === 'li') {
      type = 'list-item';
    }

    elements.push({
      id: `${docId}-el-${elementIndex}`,
      documentId: docId,
      type,
      pageNumber: currentPage,
      content: textContent,
      headingLevel,
      sourceElementId: `src_p${currentPage}_e${elementIndex}`,
    });

    currentPageChars += textContent.length;
    elementIndex++;
  }

  // Fallback if no blocks found
  if (elements.length === 0) {
    const rawClean = stripHtml(html).trim() || '[Empty Document]';
    elements.push({
      id: `${docId}-el-1`,
      documentId: docId,
      type: 'paragraph',
      pageNumber: 1,
      content: rawClean,
      sourceElementId: 'src_p1_e1',
    });
  }

  return {
    elements,
    tables,
    pageCount: Math.max(1, currentPage),
  };
}

/**
 * Strips HTML tags and unescapes standard HTML entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Constructs provenance chunks matching the DocuLens chunking format.
 */
function createDocumentChunks(elements: DocumentElement[], docId: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let currentChunkText: string[] = [];
  let currentElementIds: string[] = [];
  let currentSection = 'General';
  let chunkIndex = 1;
  let pageStart = 1;
  let pageEnd = 1;

  for (const el of elements) {
    if (el.type.startsWith('heading')) {
      currentSection = el.content;
    }

    currentChunkText.push(el.content);
    currentElementIds.push(el.id);
    pageEnd = el.pageNumber;

    const accumulatedLength = currentChunkText.join(' ').length;
    if (accumulatedLength >= 600) {
      const fullText = currentChunkText.join('\n');
      chunks.push({
        id: `chk-${docId.slice(4, 10)}-${chunkIndex}`,
        documentId: docId,
        text: fullText,
        pageStart,
        pageEnd,
        elementIds: [...currentElementIds],
        sectionPath: [currentSection],
        searchText: fullText.toLowerCase(),
        sourceType: 'document',
      });
      chunkIndex++;
      currentChunkText = [];
      currentElementIds = [];
      pageStart = el.pageNumber;
    }
  }

  if (currentChunkText.length > 0) {
    const fullText = currentChunkText.join('\n');
    chunks.push({
      id: `chk-${docId.slice(4, 10)}-${chunkIndex}`,
      documentId: docId,
      text: fullText,
      pageStart,
      pageEnd,
      elementIds: [...currentElementIds],
      sectionPath: [currentSection],
      searchText: fullText.toLowerCase(),
      sourceType: 'document',
    });
  }

  return chunks;
}
