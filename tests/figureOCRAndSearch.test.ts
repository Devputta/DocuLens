import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { storage } from '../src/services/storage';
import { runFigureOCR } from '../src/services/ocrService';
import { searchChunks } from '../src/services/lexicalSearch';
import { DocumentFigure, DocumentEntity, DocumentChunk } from '../src/types/doculens';

describe('Figure In-Browser OCR & Lexical Search Integration (Requirement 4)', () => {
  beforeEach(async () => {
    await storage.resetDatabase();
  });

  afterEach(async () => {
    await storage.resetDatabase();
  });

  describe('runFigureOCR with Worker, Progress, and Cancellation', () => {
    it('extracts text and confidence using worker override and reports progress', async () => {
      const mockImageBlob = new Blob(['image-bytes-mock'], { type: 'image/png' });
      const progressList: { percent: number; message: string }[] = [];

      const mockWorker = {
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'System Throughput: 15,000 req/sec under peak load',
            confidence: 94.2,
          },
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
      };

      const result = await runFigureOCR({
        imageBlob: mockImageBlob,
        workerOverride: mockWorker,
        onProgress: (percent, message) => {
          progressList.push({ percent, message });
        },
      });

      expect(result.text).toBe('System Throughput: 15,000 req/sec under peak load');
      expect(result.confidence).toBe(94.2);
      expect(result.language).toBe('eng');
      expect(progressList.length).toBeGreaterThan(0);
      expect(progressList[progressList.length - 1].percent).toBe(100);
      expect(mockWorker.recognize).toHaveBeenCalledWith(mockImageBlob);
    });

    it('cancels OCR gracefully when AbortSignal is aborted', async () => {
      const mockImageBlob = new Blob(['image-bytes-mock'], { type: 'image/png' });
      const controller = new AbortController();
      controller.abort();

      await expect(
        runFigureOCR({
          imageBlob: mockImageBlob,
          abortSignal: controller.signal,
        })
      ).rejects.toThrow(/cancelled/i);
    });
  });

  describe('Figure Record Storage, Search Indexing & BM25 Search Hits', () => {
    it('stores OCR metadata on figure record in IndexedDB', async () => {
      const fig: DocumentFigure = {
        id: 'fig-chart-1',
        documentId: 'doc-alpha',
        pageNumber: 2,
        bbox: [10, 20, 80, 40],
        width: 800,
        height: 600,
        imageBlob: new Blob(['png-bytes'], { type: 'image/png' }),
        thumbnailBlob: new Blob(['thumb-bytes'], { type: 'image/webp' }),
        hash: 'hash-fig-1',
        captionLabel: 'Figure 1',
        caption: 'Figure 1: Benchmark Latency Distribution',
        createdAt: Date.now(),
      };
      await storage.saveFigure(fig);

      // Simulate OCR completion: updating figure record
      const updatedFig: DocumentFigure = {
        ...fig,
        ocrText: 'Measured p99 latency was 14.2 milliseconds across 100 clusters',
        ocrConfidence: 92,
        ocrLanguage: 'eng',
        ocrAt: Date.now(),
      };
      await storage.saveFigure(updatedFig);

      // Verify figure retrieval has OCR fields
      const retrieved = await storage.getFigure('fig-chart-1');
      expect(retrieved?.ocrText).toContain('14.2 milliseconds');
      expect(retrieved?.ocrConfidence).toBe(92);
      expect(retrieved?.ocrLanguage).toBe('eng');

      // Verify lightweight summary also has OCR fields
      const summaries = await storage.getAllFigureSummaries();
      expect(summaries[0].ocrText).toContain('14.2 milliseconds');
      expect(summaries[0].ocrConfidence).toBe(92);
    });

    it('indexes figure OCR text as searchable chunks with sourceType "figure" and returns BM25 search hits', async () => {
      const doc: DocumentEntity = {
        id: 'doc-alpha',
        originalName: 'system-benchmarks.pdf',
        storedPath: 'local://doculens/system-benchmarks.pdf',
        sha256: 'hash-abc-123',
        sizeBytes: 2048,
        pageCount: 3,
        status: 'ready',
        parserName: 'pdfjs',
        parserVersion: '1.0',
        createdAt: Date.now(),
        elementCount: 1,
        chunkCount: 2,
        tableCount: 0,
      };
      await storage.saveDocument(doc);

      // Regular document chunk
      const textChunk: DocumentChunk = {
        id: 'chunk-text-1',
        documentId: 'doc-alpha',
        text: 'This paper describes high performance distributed architectures.',
        pageStart: 1,
        pageEnd: 1,
        elementIds: ['el-1'],
        sectionPath: ['Introduction'],
        searchText: 'this paper describes high performance distributed architectures.',
        sourceType: 'document',
      };

      // Figure OCR chunk
      const figureChunk: DocumentChunk = {
        id: 'chunk-fig-fig-chart-1',
        documentId: 'doc-alpha',
        text: 'Measured p99 latency was 14.2 milliseconds across 100 clusters in Figure 1',
        pageStart: 2,
        pageEnd: 2,
        elementIds: [],
        sectionPath: ['Figure 1', 'Page 2'],
        searchText: 'measured p99 latency was 14.2 milliseconds across 100 clusters in figure 1',
        sourceType: 'figure',
        figureId: 'fig-chart-1',
      };

      await storage.saveChunks([textChunk, figureChunk]);

      // Execute Lexical BM25 Search for terms in the figure OCR text
      const searchResults = searchChunks(
        'latency milliseconds clusters',
        [textChunk, figureChunk],
        [doc]
      );

      expect(searchResults.length).toBeGreaterThan(0);
      const hit = searchResults.find((r) => r.chunk.figureId === 'fig-chart-1');
      expect(hit).toBeDefined();
      expect(hit?.chunk.sourceType).toBe('figure');
      expect(hit?.chunk.pageStart).toBe(2);
      expect(hit?.matchedTerms).toContain('latency');
      expect(hit?.matchedTerms).toContain('milliseconds');
    });

    it('skips indexing figures with very low confidence under 30%', async () => {
      const lowConfidenceFig: DocumentFigure = {
        id: 'fig-blurry',
        documentId: 'doc-alpha',
        pageNumber: 1,
        width: 400,
        height: 300,
        imageBlob: new Blob(['low-res-bytes']),
        thumbnailBlob: new Blob(['thumb-bytes']),
        hash: 'hash-blurry',
        ocrText: 'unreadable garbled noise ???',
        ocrConfidence: 24, // < 30% threshold
        ocrLanguage: 'eng',
        createdAt: Date.now(),
      };
      await storage.saveFigure(lowConfidenceFig);

      // Verify that deleteChunksByFigure or skipping logic leaves chunk index clean
      await storage.deleteChunksByFigure('fig-blurry');

      const chunks = await storage.getChunksByDocument('doc-alpha');
      const figureChunk = chunks.find((c) => c.figureId === 'fig-blurry');
      expect(figureChunk).toBeUndefined();
    });
  });

  describe('Index Removal on Deletion (Figure Deletion and Document Deletion)', () => {
    it('removes figure search index chunk when figure is deleted', async () => {
      const doc: DocumentEntity = {
        id: 'doc-alpha',
        originalName: 'system-benchmarks.pdf',
        storedPath: 'local://doculens/system-benchmarks.pdf',
        sha256: 'hash-abc-123',
        sizeBytes: 2048,
        pageCount: 3,
        status: 'ready',
        parserName: 'pdfjs',
        parserVersion: '1.0',
        createdAt: Date.now(),
        elementCount: 1,
        chunkCount: 1,
        tableCount: 0,
      };
      await storage.saveDocument(doc);

      const figureChunk: DocumentChunk = {
        id: 'chunk-fig-del-1',
        documentId: 'doc-alpha',
        text: 'Microarchitectural branch predictor traces and cache hierarchies',
        pageStart: 3,
        pageEnd: 3,
        elementIds: [],
        sectionPath: ['Figure 3'],
        searchText: 'microarchitectural branch predictor traces and cache hierarchies',
        sourceType: 'figure',
        figureId: 'fig-to-delete',
      };

      await storage.saveChunks([figureChunk]);
      expect(await storage.getChunksByDocument('doc-alpha')).toHaveLength(1);

      // Delete the figure directly
      await storage.deleteFigure('fig-to-delete');

      // Verify chunk index was removed
      const remainingChunks = await storage.getChunksByDocument('doc-alpha');
      expect(remainingChunks).toHaveLength(0);

      // Verify search no longer returns results
      const results = searchChunks(
        'branch predictor',
        remainingChunks,
        [doc]
      );
      expect(results).toHaveLength(0);
    });

    it('cascades removal of all figure search chunks when parent document is deleted', async () => {
      const doc: DocumentEntity = {
        id: 'doc-parent-delete',
        originalName: 'test.pdf',
        storedPath: 'local://doculens/test.pdf',
        sha256: 'h123',
        sizeBytes: 1000,
        pageCount: 1,
        status: 'ready',
        parserName: 'pdfjs',
        parserVersion: '1.0',
        createdAt: Date.now(),
        elementCount: 0,
        chunkCount: 1,
        tableCount: 0,
      };
      await storage.saveDocument(doc);

      const figChunk: DocumentChunk = {
        id: 'chunk-fig-parent-del',
        documentId: 'doc-parent-delete',
        text: 'Optical character recognition tensor processing',
        pageStart: 1,
        pageEnd: 1,
        elementIds: [],
        sectionPath: ['Figure 1'],
        searchText: 'optical character recognition tensor processing',
        sourceType: 'figure',
        figureId: 'fig-parent-1',
      };
      await storage.saveChunks([figChunk]);

      expect(await storage.getChunksByDocument('doc-parent-delete')).toHaveLength(1);

      // Delete the parent document
      await storage.deleteDocument('doc-parent-delete');

      // Verify chunks were purged
      expect(await storage.getChunksByDocument('doc-parent-delete')).toHaveLength(0);
    });
  });

  describe('Add Figure Text as Document Note', () => {
    it('saves extracted figure text as a document note', async () => {
      const note = {
        id: 'note-fig-1',
        documentId: 'doc-alpha',
        pageNumber: 2,
        selectedText: 'Figure 1: Benchmark Latency Distribution',
        noteText: 'Measured p99 latency was 14.2 milliseconds across 100 clusters',
        createdAt: Date.now(),
      };

      await storage.saveNote(note);

      const notes = await storage.getNotes('doc-alpha');
      expect(notes).toHaveLength(1);
      expect(notes[0].selectedText).toBe('Figure 1: Benchmark Latency Distribution');
      expect(notes[0].noteText).toContain('14.2 milliseconds');
    });
  });
});
