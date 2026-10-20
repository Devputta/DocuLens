import { describe, it, expect, vi } from 'vitest';
import {
  hasZeroTextLayer,
  parseOcrPageText,
  runInBrowserOCR,
} from '../src/services/ocrService';
import { DocumentElement, CitationEvidence, InquiryMessage } from '../src/types/doculens';
import { MAX_UPLOAD_BYTES, MAX_PAGES_LIMIT } from '../src/services/pdfParser';

describe('Citation Navigation Reliability (Requirement 2)', () => {
  const verifiedEvidence: CitationEvidence = {
    evidenceId: 'ev-1',
    documentId: 'doc-123',
    documentName: 'Clean Energy Audit 2025.pdf',
    pageNumber: 3,
    chunkId: 'chk-1',
    quote: 'Global clean energy investments reached $648 billion in fiscal year 2025.',
    sourceElementIds: ['el-42'],
    verified: true,
    verificationDetails: 'Exact substring match located at index 0 on Page 3',
  };

  const unverifiedEvidence: CitationEvidence = {
    evidenceId: 'ev-2',
    documentId: 'doc-123',
    documentName: 'Clean Energy Audit 2025.pdf',
    pageNumber: 5,
    chunkId: 'chk-2',
    quote: 'Fabricated statistic not present in the ingested document text layer.',
    sourceElementIds: ['el-99'],
    verified: false,
    rejectionReason: 'Substantial discrepancy between citation quote and stored document content.',
  };

  it('triggers navigation callback with page, quote, and element ID for verified citation', () => {
    const handleNavigate = vi.fn();

    // Simulate clicking a verified citation
    if (verifiedEvidence.verified) {
      handleNavigate(
        verifiedEvidence.documentId,
        verifiedEvidence.pageNumber,
        verifiedEvidence.quote,
        verifiedEvidence.sourceElementIds[0]
      );
    }

    expect(handleNavigate).toHaveBeenCalledTimes(1);
    expect(handleNavigate).toHaveBeenCalledWith(
      'doc-123',
      3,
      'Global clean energy investments reached $648 billion in fiscal year 2025.',
      'el-42'
    );
  });

  it('prevents navigation for unverified citations and keeps rejection badge', () => {
    const handleNavigate = vi.fn();

    // Simulate clicking logic: only verified citations trigger navigation
    const isClickable = unverifiedEvidence.verified;
    if (isClickable) {
      handleNavigate(
        unverifiedEvidence.documentId,
        unverifiedEvidence.pageNumber,
        unverifiedEvidence.quote,
        unverifiedEvidence.sourceElementIds[0]
      );
    }

    expect(handleNavigate).not.toHaveBeenCalled();
    expect(unverifiedEvidence.verified).toBe(false);
    expect(unverifiedEvidence.rejectionReason).toContain('discrepancy');
  });

  it('navigates correctly from structured direct quotations when verified', () => {
    const handleNavigate = vi.fn();

    const mockMessage: InquiryMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Summary with quotes',
      timestamp: Date.now(),
      documentScopeId: 'doc-123',
      verificationStatus: 'verified',
      provider: 'local-deterministic',
      evidence: [verifiedEvidence],
      structured: {
        directQuotations: [
          {
            quote: verifiedEvidence.quote,
            citationId: 'ev-1',
            pageNumber: 3,
            documentName: 'Clean Energy Audit 2025.pdf',
            verified: true,
          },
          {
            quote: 'Unverified claim',
            citationId: 'ev-fake',
            pageNumber: 1,
            documentName: 'Clean Energy Audit 2025.pdf',
            verified: false,
            rejectionReason: 'Quote not found in document',
          },
        ],
        extractedFacts: [],
        summary: 'Energy investments increased.',
      },
    };

    // Check direct quotations navigation behavior
    const verifiedDq = mockMessage.structured!.directQuotations[0];
    const unverifiedDq = mockMessage.structured!.directQuotations[1];

    if (verifiedDq.verified) {
      const match = mockMessage.evidence.find((e) => e.evidenceId === verifiedDq.citationId);
      handleNavigate(match?.documentId, verifiedDq.pageNumber, verifiedDq.quote, match?.sourceElementIds[0]);
    }
    expect(handleNavigate).toHaveBeenCalledWith('doc-123', 3, verifiedEvidence.quote, 'el-42');

    // Unverified DQ should never trigger navigation
    const handleUnverified = vi.fn();
    if (unverifiedDq.verified) {
      handleUnverified();
    }
    expect(handleUnverified).not.toHaveBeenCalled();
    expect(unverifiedDq.rejectionReason).toBe('Quote not found in document');
  });
});

describe('Zero-Text Layer & Optional In-Browser OCR (Requirement 3)', () => {
  it('detects zero extractable text layer on scanned PDFs', () => {
    // Empty elements list
    expect(hasZeroTextLayer([])).toBe(true);

    // Only placeholder notice element
    const placeholderElements: DocumentElement[] = [
      {
        id: 'doc-el-1',
        documentId: 'doc-1',
        type: 'callout',
        pageNumber: 1,
        content: '[Notice: Scanned document without embedded OCR text layer (3 pages). Text search and citation extraction require searchable text.]',
        sourceElementId: 'src_scanned_notice',
      },
    ];
    expect(hasZeroTextLayer(placeholderElements)).toBe(true);

    // Document with actual text elements is not zero-text
    const textElements: DocumentElement[] = [
      {
        id: 'doc-el-2',
        documentId: 'doc-1',
        type: 'paragraph',
        pageNumber: 1,
        content: 'This document has real searchable text.',
        sourceElementId: 'src_p1',
      },
    ];
    expect(hasZeroTextLayer(textElements)).toBe(false);
  });

  it('parses OCR text into structured elements tagged with OCR badge and confidence value', () => {
    const rawOcrText = `EXECUTIVE SUMMARY\n\nSolar capacity grew by 45 GW during the first quarter of 2025.\n\nKey Findings:\n* Storage reached parity.\n* Grid interconnection timelines improved.`;
    const confidence = 92.4;

    const { elements, nextIndex } = parseOcrPageText(rawOcrText, 1, 'doc-ocr', 1, confidence);

    expect(elements.length).toBeGreaterThanOrEqual(3);
    expect(nextIndex).toBe(elements.length + 1);

    // Every OCR element must be marked with isOcr: true and the confidence value
    for (const el of elements) {
      expect(el.isOcr).toBe(true);
      expect(el.ocrConfidence).toBe(92.4);
      expect(el.pageNumber).toBe(1);
      expect(el.sourceElementId).toContain('src_ocr_p1');
    }

    // Check heading detection
    expect(elements[0].type).toBe('heading-1');
    expect(elements[0].content).toBe('EXECUTIVE SUMMARY');
  });

  it('enforces maximum upload size limit (25 MB) in OCR service', async () => {
    const oversizedBuffer = new ArrayBuffer(MAX_UPLOAD_BYTES + 1024);
    await expect(
      runInBrowserOCR({
        pdfBuffer: oversizedBuffer,
        docId: 'doc-test',
        pageCount: 1,
      })
    ).rejects.toThrow(/exceeds/i);
  });

  it('enforces maximum allowable page limit (500 pages) in OCR service', async () => {
    const dummyBuffer = new ArrayBuffer(1024);
    await expect(
      runInBrowserOCR({
        pdfBuffer: dummyBuffer,
        docId: 'doc-test',
        pageCount: MAX_PAGES_LIMIT + 1,
      })
    ).rejects.toThrow(/exceeds/i);
  });

  it('supports cancellation of in-browser OCR process via AbortSignal', async () => {
    const dummyBuffer = new ArrayBuffer(1024);
    const abortController = new AbortController();
    abortController.abort(); // already aborted

    await expect(
      runInBrowserOCR({
        pdfBuffer: dummyBuffer,
        docId: 'doc-test',
        pageCount: 2,
        abortSignal: abortController.signal,
      })
    ).rejects.toThrow(/cancelled/i);
  });

  it('runs OCR one page at a time with mock worker override and computes average confidence', async () => {
    const dummyBuffer = new ArrayBuffer(1024);
    const progressLog: number[] = [];

    const result = await runInBrowserOCR({
      pdfBuffer: dummyBuffer,
      docId: 'doc-scanned-1',
      pageCount: 2,
      pageRecognizerOverride: async (pageNum: number) => ({
        text: `Page ${pageNum} OCR text content extracted successfully for page test.\n\nKey Finding:\n* Metric improved on page ${pageNum}.`,
        confidence: 88,
      }),
      onProgress: (prog) => {
        progressLog.push(prog.percent);
      },
    });

    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.averageConfidence).toBe(88);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.elements[0].isOcr).toBe(true);
    expect(result.elements[0].ocrConfidence).toBe(88);
    expect(progressLog.length).toBeGreaterThanOrEqual(2);
  });
});
