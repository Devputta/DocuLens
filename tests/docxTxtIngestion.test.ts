import { describe, it, expect } from 'vitest';
import {
  parseTxtFile,
  parseDocxFile,
  validateAnyDocumentHeader,
  CHARS_PER_VIRTUAL_PAGE,
  MAX_UPLOAD_BYTES,
} from '../src/services/docxTxtParser';
import { parsePDFFile, validatePDFHeader } from '../src/services/pdfParser';

describe('TXT Ingestion Pipeline (Requirement 9)', () => {
  it('splits plain text by blank lines into paragraph elements', async () => {
    const textContent = `
First paragraph with some introduction text.

Second paragraph providing technical details.

Third paragraph with conclusion.
`.trim();

    const buffer = new TextEncoder().encode(textContent).buffer;
    const result = await parseTxtFile({ name: 'technical_spec.txt', buffer });

    expect(result.elements.length).toBe(3);
    expect(result.elements[0].content).toBe('First paragraph with some introduction text.');
    expect(result.elements[1].content).toBe('Second paragraph providing technical details.');
    expect(result.elements[2].content).toBe('Third paragraph with conclusion.');
    expect(result.document.isReflowed).toBe(true);
    expect(result.document.fileType).toBe('txt');
  });

  it('detects headings: ALL CAPS, numbered "1. ", and short lines without period', async () => {
    const textContent = `
EXECUTIVE SUMMARY

This is a regular overview paragraph that explains the goal of the document in detail.

1. Background and Motivation

Here is the background description for the project.

Key Architectural Principles

These principles must be followed across all implementations.

2.1 Data Ingestion

Ingestion handles PDF, Word, and text formats safely.
`.trim();

    const buffer = new TextEncoder().encode(textContent).buffer;
    const result = await parseTxtFile({ name: 'principles.txt', buffer });

    const headings = result.elements.filter((e) => e.type.startsWith('heading'));
    expect(headings.length).toBeGreaterThanOrEqual(4);

    // ALL CAPS heading
    const allCapsHeading = result.elements.find((e) => e.content === 'EXECUTIVE SUMMARY');
    expect(allCapsHeading).toBeDefined();
    expect(allCapsHeading?.type).toBe('heading-1');

    // Numbered heading
    const numberedHeading = result.elements.find((e) => e.content.startsWith('1. Background'));
    expect(numberedHeading).toBeDefined();
    expect(numberedHeading?.type).toBe('heading-1');

    // Short line without final period
    const shortLineHeading = result.elements.find((e) => e.content === 'Key Architectural Principles');
    expect(shortLineHeading).toBeDefined();
    expect(shortLineHeading?.type).toBe('heading-2');

    // Decimal numbered heading
    const subHeading = result.elements.find((e) => e.content.startsWith('2.1 Data Ingestion'));
    expect(subHeading).toBeDefined();
    expect(subHeading?.type).toBe('heading-2');
  });

  it('paginates text into virtual pages of about 3000 characters at paragraph boundaries', async () => {
    // Generate 4 long paragraphs of 1,200 characters each
    const para1 = 'A'.repeat(1200);
    const para2 = 'B'.repeat(1200);
    const para3 = 'C'.repeat(1200);
    const para4 = 'D'.repeat(1200);
    const longText = `${para1}\n\n${para2}\n\n${para3}\n\n${para4}`;

    const buffer = new TextEncoder().encode(longText).buffer;
    const result = await parseTxtFile({ name: 'long_document.txt', buffer });

    expect(result.document.pageCount).toBeGreaterThan(1);
    expect(result.document.isReflowed).toBe(true);

    // Verify elements are assigned to appropriate virtual pages without mid-paragraph splitting
    const p1Elements = result.elements.filter((e) => e.pageNumber === 1);
    const p2Elements = result.elements.filter((e) => e.pageNumber === 2);

    expect(p1Elements.length).toBeGreaterThan(0);
    expect(p2Elements.length).toBeGreaterThan(0);

    const p1TotalLength = p1Elements.reduce((acc, el) => acc + el.content.length, 0);
    expect(p1TotalLength).toBeLessThanOrEqual(CHARS_PER_VIRTUAL_PAGE + 1500);
  });
});

describe('DOCX Ingestion & Security Validation (Requirement 9)', () => {
  it('validates ZIP PK\\x03\\x04 signature on .docx files and rejects non-ZIP docx files', () => {
    // Non-ZIP file with .docx extension
    const fakeBytes = new TextEncoder().encode('Not a valid zip container').buffer;
    const validation = validateAnyDocumentHeader(fakeBytes, 'corrupt.docx');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Malformed or corrupt DOCX file');
  });

  it('detects encrypted / password-protected Office documents with Compound Binary header', () => {
    // Compound File Binary Format magic bytes (0xD0 0xCF 0x11 0xE0 0xA1 0xB1 0x1A 0xE1)
    const encryptedBytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]).buffer;
    const validation = validateAnyDocumentHeader(encryptedBytes, 'protected.docx');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('encrypted or password-protected');
  });

  it('rejects oversized documents exceeding 25 MB limit', () => {
    const oversizedBuffer = new ArrayBuffer(MAX_UPLOAD_BYTES + 1024);
    const validation = validateAnyDocumentHeader(oversizedBuffer, 'huge_file.txt');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('exceeds the allowable threshold of 25 MB');
  });

  it('rejects completely empty 0-byte files', () => {
    const emptyBuffer = new ArrayBuffer(0);
    const validation = validateAnyDocumentHeader(emptyBuffer, 'empty.txt');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('empty');
  });

  it('rejects dangerous executable binary extensions even if renamed', () => {
    const fakeBuffer = new TextEncoder().encode('MZ binary mock').buffer;
    const validation = validateAnyDocumentHeader(fakeBuffer, 'trojan.exe');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Unsupported file type');
  });

  it('handles malformed DOCX files with clear error message without throwing unhandled exceptions', async () => {
    // A file with PK header but truncated / corrupted payload
    const corruptZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff]).buffer;

    await expect(parseDocxFile({ name: 'truncated.docx', buffer: corruptZip })).rejects.toThrow(
      /Malformed or corrupt DOCX file/
    );
  });
});

describe('Full Downstream Integration with parsePDFFile (Requirement 9)', () => {
  it('automatically routes .txt files through unified ingestion pipeline and marks reflowed', async () => {
    const txtContent = `
# System Architecture

DocuLens provides local-first intelligence.

| Component | Status | Latency |
| Ingestion | Active | <10ms |
| Indexing  | Ready  | <50ms |
`.trim();

    const buffer = new TextEncoder().encode(txtContent).buffer;
    const result = await parsePDFFile({ name: 'system_design.txt', buffer });

    expect(result.document.fileType).toBe('txt');
    expect(result.document.isReflowed).toBe(true);
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.tables.length).toBe(1);
    expect(result.tables[0].headers).toContain('Component');
    expect(result.tables[0].rows.length).toBe(2);
  });
});
