import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  thumbnailService,
  TARGET_THUMBNAIL_WIDTH,
  MAX_UPLOAD_BYTES,
  MAX_PAGES_LIMIT,
} from '../src/services/thumbnailService';
import { storage } from '../src/services/storage';

if (typeof URL.createObjectURL !== 'function') {
  let objectUrlCounter = 1;
  URL.createObjectURL = () => `blob:mock-thumbnail-url-${objectUrlCounter++}`;
  URL.revokeObjectURL = () => {};
}

describe('PDF Page Thumbnail Service (v2 Requirements)', () => {
  beforeEach(async () => {
    thumbnailService.clearMemoryCache();
    thumbnailService.setMockRenderer(null);
  });

  afterEach(async () => {
    thumbnailService.clearMemoryCache();
    thumbnailService.setMockRenderer(null);
  });

  it('defines the standard thumbnail width of about 120px', () => {
    expect(TARGET_THUMBNAIL_WIDTH).toBe(120);
  });

  it('enforces maximum allowable file size of 25 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it('enforces maximum allowable page limit of 500 pages', () => {
    expect(MAX_PAGES_LIMIT).toBe(500);
  });

  it('returns null for documents without a PDF source (e.g. demo benchmark documents)', async () => {
    // doc-demo-no-pdf has no binary saved in storage
    const result = await thumbnailService.requestThumbnail('doc-demo-no-pdf', 1, 'library');
    expect(result).toBeNull();
  });

  it('rejects page numbers exceeding 500 page limit', async () => {
    const result = await thumbnailService.requestThumbnail('doc-test', 501, 'reader');
    expect(result).toBeNull();

    const zeroResult = await thumbnailService.requestThumbnail('doc-test', 0, 'reader');
    expect(zeroResult).toBeNull();
  });

  it('rejects documents exceeding 25 MB limit', async () => {
    const oversized = new ArrayBuffer(MAX_UPLOAD_BYTES + 1024);
    await storage.savePdfSource('doc-oversized', oversized);

    const result = await thumbnailService.requestThumbnail('doc-oversized', 1, 'reader');
    expect(result).toBeNull();
  });

  it('processes rendering tasks one at a time through the background queue', async () => {
    const dummyBuffer = new ArrayBuffer(1024);
    await storage.savePdfSource('doc-queue-test', dummyBuffer);

    let activeRenders = 0;
    let maxConcurrentRenders = 0;
    const completedPages: number[] = [];

    thumbnailService.setMockRenderer(async (_docId, pageNum) => {
      activeRenders++;
      maxConcurrentRenders = Math.max(maxConcurrentRenders, activeRenders);

      // Simulate asynchronous rendering work
      await new Promise((resolve) => setTimeout(resolve, 15));

      activeRenders--;
      completedPages.push(pageNum);
      return new Blob([`mock-page-${pageNum}`], { type: 'image/webp' });
    });

    // Request multiple pages concurrently
    const req1 = thumbnailService.requestThumbnail('doc-queue-test', 1, 'reader');
    const req2 = thumbnailService.requestThumbnail('doc-queue-test', 2, 'reader');
    const req3 = thumbnailService.requestThumbnail('doc-queue-test', 3, 'reader');

    const [res1, res2, res3] = await Promise.all([req1, req2, req3]);

    expect(maxConcurrentRenders).toBe(1); // strictly one at a time!
    expect(completedPages).toEqual([1, 2, 3]);
    expect(res1).toBeTruthy();
    expect(res2).toBeTruthy();
    expect(res3).toBeTruthy();
  });

  it('caches rendered blobs in IndexedDB and reuses them on subsequent requests', async () => {
    const dummyBuffer = new ArrayBuffer(1024);
    await storage.savePdfSource('doc-cache-test', dummyBuffer);

    let renderCallCount = 0;
    thumbnailService.setMockRenderer(async () => {
      renderCallCount++;
      return new Blob(['rendered-thumbnail-blob'], { type: 'image/webp' });
    });

    // 1st request -> triggers renderer
    const url1 = await thumbnailService.requestThumbnail('doc-cache-test', 1, 'library');
    expect(url1).toBeTruthy();
    expect(renderCallCount).toBe(1);

    // Verify stored in IndexedDB
    const idbBlob = await storage.getThumbnail('doc-cache-test', 1);
    expect(idbBlob).toBeDefined();

    // Clear memory cache to test IndexedDB retrieval
    thumbnailService.clearMemoryCache();

    // 2nd request -> loaded from IndexedDB cache, renderer NOT called again
    const url2 = await thumbnailService.requestThumbnail('doc-cache-test', 1, 'library');
    expect(url2).toBeTruthy();
    expect(renderCallCount).toBe(1);
  });

  it('cancels pending queue renders when the user leaves the view', async () => {
    const dummyBuffer = new ArrayBuffer(1024);
    await storage.savePdfSource('doc-cancel-test', dummyBuffer);

    let rendersStarted = 0;
    thumbnailService.setMockRenderer(async () => {
      rendersStarted++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Blob(['img'], { type: 'image/webp' });
    });

    const p1 = thumbnailService.requestThumbnail('doc-cancel-test', 1, 'reader');
    const p2 = thumbnailService.requestThumbnail('doc-cancel-test', 2, 'reader');
    const p3 = thumbnailService.requestThumbnail('doc-cancel-test', 3, 'reader');

    // Simulate user immediately switching views
    thumbnailService.cancelPendingRenders('reader');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Pending queued items were cancelled and resolved to null
    expect(r2).toBeNull();
    expect(r3).toBeNull();
    expect(rendersStarted).toBeLessThanOrEqual(1);
  });

  it('purges cached URLs and IndexedDB records when a document is deleted', async () => {
    const dummyBuffer = new ArrayBuffer(512);
    await storage.savePdfSource('doc-to-delete', dummyBuffer);
    const mockBlob = new Blob(['sample-thumb'], { type: 'image/webp' });
    await storage.saveThumbnail('doc-to-delete', 1, mockBlob);

    // Verify saved
    const beforeBlob = await storage.getThumbnail('doc-to-delete', 1);
    expect(beforeBlob).toBeDefined();

    // Purge
    thumbnailService.purgeDocument('doc-to-delete');
    await storage.deleteThumbnailsByDocument('doc-to-delete');
    await storage.deletePdfSource('doc-to-delete');

    const afterThumb = await storage.getThumbnail('doc-to-delete', 1);
    expect(afterThumb).toBeNull();
    const afterPdf = await storage.getPdfSource('doc-to-delete');
    expect(afterPdf).toBeNull();
  });
});
