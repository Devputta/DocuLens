import { describe, it, expect } from 'vitest';
import {
  validatePDFHeader,
  calculateSHA256,
  createProvenanceChunks,
  MAX_UPLOAD_BYTES,
  MAX_PAGES_LIMIT,
} from '../src/services/pdfParser';
import { DocumentElement } from '../src/types/doculens';
import { sanitizeCSVCell, exportTableToCSV } from '../src/services/tableExport';
import { generateSampleBundles } from '../src/services/sampleDocuments';

describe('Document Validation & Signatures', () => {
  it('rejects empty 0-byte file buffer', () => {
    const emptyBuffer = new ArrayBuffer(0);
    const result = validatePDFHeader(emptyBuffer, 'test.pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects oversized files exceeding 25 MB limit', () => {
    // Mock oversized buffer check via length property
    const oversizedBuffer = new ArrayBuffer(MAX_UPLOAD_BYTES + 1024);
    const result = validatePDFHeader(oversizedBuffer, 'huge.pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
  });

  it('rejects unsupported binary executable or media extensions', () => {
    const fakeBuffer = new TextEncoder().encode('not an executable').buffer;
    const exeResult = validatePDFHeader(fakeBuffer, 'malicious.exe');
    expect(exeResult.valid).toBe(false);
    expect(exeResult.error).toContain('Unsupported file type');

    const zipResult = validatePDFHeader(fakeBuffer, 'archive.zip');
    expect(zipResult.valid).toBe(false);
    expect(zipResult.error).toContain('Unsupported file type');
  });

  it('accepts valid PDF with %PDF- header signature', () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj').buffer;
    const result = validatePDFHeader(pdfBytes, 'document.pdf');
    expect(result.valid).toBe(true);
    expect(result.isPDF).toBe(true);
  });

  it('accepts PDF with %PDF- within standard 1024-byte preamble offset', () => {
    const leadingWhitespace = '   \n\r\n';
    const pdfBytes = new TextEncoder().encode(`${leadingWhitespace}%PDF-1.4\n...`).buffer;
    const result = validatePDFHeader(pdfBytes, 'offset.pdf');
    expect(result.valid).toBe(true);
    expect(result.isPDF).toBe(true);
  });

  it('rejects corrupt/binary file without %PDF- signature and non-printable bytes', () => {
    const binaryGarbage = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]).buffer;
    const result = validatePDFHeader(binaryGarbage, 'corrupt.pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('accepts UTF-8 plain text documents as fallback documents', () => {
    const textBytes = new TextEncoder().encode('# Meeting Notes\n\nAll items approved.').buffer;
    const result = validatePDFHeader(textBytes, 'notes.md');
    expect(result.valid).toBe(true);
    expect(result.isPDF).toBe(false);
  });
});

describe('Cryptographic Checksum & Duplicate Detection', () => {
  it('calculates reproducible SHA-256 hash', async () => {
    const data = new TextEncoder().encode('DocuLens Provenance Test Content').buffer;
    const hash1 = await calculateSHA256(data);
    const hash2 = await calculateSHA256(data);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
    expect(typeof hash1).toBe('string');
  });

  it('detects duplicate documents with identical SHA-256 fingerprints', async () => {
    const sampleDocs = generateSampleBundles().map((s) => s.document);
    const existingDoc = sampleDocs[0];

    const duplicateCheck = sampleDocs.find(
      (d) => d.sha256.toLowerCase() === existingDoc.sha256.toLowerCase()
    );
    expect(duplicateCheck).toBeDefined();
    expect(duplicateCheck?.id).toBe(existingDoc.id);

    const nonExistent = sampleDocs.find(
      (d) => d.sha256 === '0000000000000000000000000000000000000000000000000000000000000000'
    );
    expect(nonExistent).toBeUndefined();
  });
});

describe('Provenance-Aware Chunking', () => {
  it('respects chunk boundaries and records element provenance', () => {
    const mockElements: DocumentElement[] = [
      {
        id: 'el-1',
        documentId: 'doc-test',
        type: 'heading-1',
        pageNumber: 1,
        content: 'Section 1: Clinical Methodology',
        sourceElementId: 'src_h1',
      },
      {
        id: 'el-2',
        documentId: 'doc-test',
        type: 'paragraph',
        pageNumber: 1,
        content: 'The study was conducted under double-blind randomized conditions across 12 medical centers.',
        sourceElementId: 'src_p1',
      },
      {
        id: 'el-3',
        documentId: 'doc-test',
        type: 'paragraph',
        pageNumber: 2,
        content: 'Primary endpoint evaluation occurred at Week 16 with secondary safety surveillance at Week 24.',
        sourceElementId: 'src_p2',
      },
    ];

    const chunks = createProvenanceChunks(mockElements, 'doc-test');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].documentId).toBe('doc-test');
    expect(chunks[0].elementIds).toContain('el-1');
    expect(chunks[0].elementIds).toContain('el-2');
    expect(chunks[0].text).toContain('Section 1: Clinical Methodology');
    expect(chunks[0].pageStart).toBe(1);
  });
});

describe('Spreadsheet Formula Injection Defense (RFC-4180)', () => {
  it('sanitizes dangerous spreadsheet macro prefixes (=, +, -, @)', () => {
    expect(sanitizeCSVCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCSVCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
    expect(sanitizeCSVCell('-2+3+cmd')).toBe("'-2+3+cmd");
    expect(sanitizeCSVCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sanitizeCSVCell('\t=1+1')).toBe("'=1+1");
  });

  it('preserves legitimate numeric values without prepending quotes', () => {
    expect(sanitizeCSVCell('342.0')).toBe('342.0');
    expect(sanitizeCSVCell('-12.5')).toBe('-12.5');
    expect(sanitizeCSVCell('+45')).toBe('+45');
    expect(sanitizeCSVCell('0')).toBe('0');
  });

  it('escapes quotes and wraps cells containing commas or newlines', () => {
    expect(sanitizeCSVCell('Report, Annual')).toBe('"Report, Annual"');
    expect(sanitizeCSVCell('Line1\nLine2')).toBe('"Line1\nLine2"');
    expect(sanitizeCSVCell('Quoted "Text"')).toBe('"Quoted ""Text"""');
  });

  it('exports complete table securely', () => {
    const table = {
      id: 'tbl-sec',
      documentId: 'doc-1',
      pageNumber: 1,
      sourceElementId: 'el-tbl',
      title: 'Security Test Table',
      headers: ['Sector', 'Formula Test', 'Legitimate Number'],
      rows: [
        ['Solar', '=2+5', '342.5'],
        ['Wind, Offshore', '@SYSTEM', '-12.0'],
      ],
    };

    const csv = exportTableToCSV(table);
    expect(csv).toContain("'=2+5");
    expect(csv).toContain("'@SYSTEM");
    expect(csv).toContain('342.5');
    expect(csv).toContain('"Wind, Offshore"');
  });
});

describe('Demo Action & Non-Automatic Seeding Contract', () => {
  it('verifies curated benchmark documents are generated with valid provenance', () => {
    const bundles = generateSampleBundles();
    expect(bundles.length).toBe(5);
    for (const bundle of bundles) {
      expect(bundle.document.status).toBe('ready');
      expect(bundle.document.pageCount).toBeGreaterThan(0);
      expect(bundle.elements.length).toBeGreaterThan(0);
      expect(bundle.chunks.length).toBeGreaterThan(0);
    }
  });
});
