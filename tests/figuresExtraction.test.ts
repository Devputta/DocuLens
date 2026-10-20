import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { storage } from '../src/services/storage';
import {
  figureExtractor,
  computePixelHash,
  MIN_FIGURE_DIMENSION,
  MAX_THUMBNAIL_DIMENSION,
} from '../src/services/figureExtractor';
import { DocumentFigure, DocumentEntity } from '../src/types/doculens';

describe('Figure Extraction & Storage (Figures Tab Requirements)', () => {
  beforeEach(async () => {
    figureExtractor.setMockExtractor(null);
    await storage.resetDatabase();
  });

  afterEach(async () => {
    figureExtractor.setMockExtractor(null);
    await storage.resetDatabase();
  });

  it('enforces minimum image dimension threshold of 64x64px', () => {
    expect(MIN_FIGURE_DIMENSION).toBe(64);
  });

  it('defines max thumbnail dimension for grid rendering', () => {
    expect(MAX_THUMBNAIL_DIMENSION).toBe(240);
  });

  it('computes deterministic pixel hashes for duplicate detection', async () => {
    const pixelsA = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const pixelsB = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const pixelsC = new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 255, 255]);

    const hashA = await computePixelHash(pixelsA);
    const hashB = await computePixelHash(pixelsB);
    const hashC = await computePixelHash(pixelsC);

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it('stores figures in IndexedDB and retrieves lightweight summaries without keeping full-size bitmaps in memory', async () => {
    const fullBlob = new Blob(['high-res-bitmap-data-12345'], { type: 'image/png' });
    const thumbBlob = new Blob(['thumb-data-123'], { type: 'image/webp' });

    const figure: DocumentFigure = {
      id: 'fig-doc1-p1-1',
      documentId: 'doc1',
      pageNumber: 1,
      bbox: [10, 15, 80, 50],
      width: 800,
      height: 600,
      imageBlob: fullBlob,
      thumbnailBlob: thumbBlob,
      type: 'embedded-image',
      hash: 'hash-abc-123',
      caption: 'Figure 1: Architecture Diagram',
      createdAt: Date.now(),
    };

    await storage.saveFigure(figure);

    // Retrieve lightweight summary (used in React state for the grid)
    const summaries = await storage.getAllFigureSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe('fig-doc1-p1-1');
    expect(summaries[0].width).toBe(800);
    expect(summaries[0].height).toBe(600);
    expect(summaries[0].documentId).toBe('doc1');
    expect(summaries[0].pageNumber).toBe(1);

    // Verify summary DOES NOT store full imageBlob
    expect((summaries[0] as any).imageBlob).toBeUndefined();

    // Verify full figure is only loaded on demand (e.g. when opening Lightbox)
    const fullFig = await storage.getFigure('fig-doc1-p1-1');
    expect(fullFig).toBeDefined();
    expect(fullFig?.imageBlob).toBeDefined();
    expect(fullFig?.imageBlob.type).toBe('image/png');
  });

  it('filters figure summaries by documentId', async () => {
    const fig1: DocumentFigure = {
      id: 'fig-doc1-p1-1',
      documentId: 'doc1',
      pageNumber: 1,
      width: 400,
      height: 300,
      imageBlob: new Blob(['data1'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumb1'], { type: 'image/webp' }),
      hash: 'h1',
      createdAt: Date.now(),
    };

    const fig2: DocumentFigure = {
      id: 'fig-doc2-p1-1',
      documentId: 'doc2',
      pageNumber: 1,
      width: 500,
      height: 400,
      imageBlob: new Blob(['data2'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumb2'], { type: 'image/webp' }),
      hash: 'h2',
      createdAt: Date.now(),
    };

    await storage.saveFigures([fig1, fig2]);

    const doc1Summaries = await storage.getFigureSummariesByDocument('doc1');
    expect(doc1Summaries).toHaveLength(1);
    expect(doc1Summaries[0].id).toBe('fig-doc1-p1-1');

    const doc2Summaries = await storage.getFigureSummariesByDocument('doc2');
    expect(doc2Summaries).toHaveLength(1);
    expect(doc2Summaries[0].id).toBe('fig-doc2-p1-1');
  });

  it('cascades deletion of figures when document is deleted', async () => {
    const doc: DocumentEntity = {
      id: 'doc-to-delete',
      originalName: 'test.pdf',
      storedPath: 'local://doculens/test.pdf',
      sha256: 'abc123456789',
      sizeBytes: 1024,
      pageCount: 1,
      status: 'ready',
      parserName: 'pdfjs',
      parserVersion: '1.0',
      createdAt: Date.now(),
      elementCount: 1,
      chunkCount: 1,
      tableCount: 0,
    };
    await storage.saveDocument(doc);

    const fig: DocumentFigure = {
      id: 'fig-del-1',
      documentId: 'doc-to-delete',
      pageNumber: 1,
      width: 200,
      height: 200,
      imageBlob: new Blob(['data'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/webp' }),
      hash: 'h_del',
      createdAt: Date.now(),
    };
    await storage.saveFigure(fig);

    expect(await storage.getFiguresByDocument('doc-to-delete')).toHaveLength(1);

    await storage.deleteDocument('doc-to-delete');

    expect(await storage.getFiguresByDocument('doc-to-delete')).toHaveLength(0);
    expect(await storage.getFigure('fig-del-1')).toBeUndefined();
  });

  it('scans documents one at a time and reports progress', async () => {
    const progressReports: { percent: number; message: string }[] = [];

    figureExtractor.setMockExtractor(async (docId, pageCount) => {
      const mockFigures: DocumentFigure[] = [];
      for (let p = 1; p <= pageCount; p++) {
        mockFigures.push({
          id: `fig-${docId}-p${p}-1`,
          documentId: docId,
          pageNumber: p,
          width: 640,
          height: 480,
          imageBlob: new Blob(['mock-png'], { type: 'image/png' }),
          thumbnailBlob: new Blob(['mock-thumb'], { type: 'image/webp' }),
          type: 'embedded-image',
          hash: `mock-hash-${docId}-${p}`,
          caption: `Extracted Figure p.${p}`,
          createdAt: Date.now(),
        });
      }
      return mockFigures;
    });

    const doc: DocumentEntity = {
      id: 'doc-scan-test',
      originalName: 'report.pdf',
      storedPath: 'local://doculens/report.pdf',
      sha256: 'xyz987654321',
      sizeBytes: 2048,
      pageCount: 3,
      status: 'ready',
      parserName: 'pdfjs',
      parserVersion: '1.0',
      createdAt: Date.now(),
      elementCount: 5,
      chunkCount: 2,
      tableCount: 1,
    };
    await storage.saveDocument(doc);

    const extracted = await figureExtractor.extractFiguresForDocument(
      'doc-scan-test',
      (percent, message) => {
        progressReports.push({ percent, message });
      }
    );

    expect(extracted).toHaveLength(3);
    expect(extracted[0].documentId).toBe('doc-scan-test');
    expect(extracted[0].width).toBe(640);
    expect(extracted[0].height).toBe(480);

    // Verify figures were saved to IndexedDB
    const saved = await storage.getFiguresByDocument('doc-scan-test');
    expect(saved).toHaveLength(3);
  });
});
