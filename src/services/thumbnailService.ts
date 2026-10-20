/**
 * DocuLens PDF Page Thumbnail Service
 * - Renders pages with pdf.js to small canvases (~120px wide)
 * - Background queue processing one at a time
 * - Caches rendered images as Blobs in IndexedDB
 * - Lazy rendering integration with IntersectionObserver
 * - Enforces 25 MB file limit & 500 page limit
 * - Cancels pending renders on view exit or document switch
 * - Graceful neutral fallback for documents without PDF source (e.g. demo documents)
 */

import { storage } from './storage';
import { pdfBytes } from '../utils/bytes';
import { loadPdfjs } from './pdfjsLoader';

export const TARGET_THUMBNAIL_WIDTH = 120; // about 120px wide
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB limit
export const MAX_PAGES_LIMIT = 500; // 500 pages limit

interface QueueTask {
  id: string;
  documentId: string;
  pageNumber: number;
  viewScope?: string;
  resolve: (url: string | null) => void;
  reject: (err: any) => void;
  cancelled: boolean;
}

export type MockRendererFn = (
  documentId: string,
  pageNumber: number
) => Promise<Blob | null>;

class ThumbnailService {
  private queue: QueueTask[] = [];
  private pendingTasks = new Set<QueueTask>();
  private isProcessing = false;
  private activeTask: QueueTask | null = null;
  private activeRenderTask: any = null; // pdf.js page.render() promise controller
  private urlCache = new Map<string, string>(); // `${documentId}_p${pageNumber}` -> ObjectURL
  private inFlightPromises = new Map<string, Promise<string | null>>();
  private pdfDocCache = new Map<string, any>(); // PDFDocumentProxy cache
  private mockRenderer: MockRendererFn | null = null;
  private noPdfSourceSet = new Set<string>(); // Known docIds without PDF sources

  /**
   * Set a custom mock renderer for unit testing.
   */
  public setMockRenderer(renderer: MockRendererFn | null) {
    this.mockRenderer = renderer;
  }

  /**
   * Requests a page thumbnail for a document.
   * Resolves with an Object URL, or null if the document has no PDF source
   * or exceeds allowable limits.
   */
  public async requestThumbnail(
    documentId: string,
    pageNumber: number,
    viewScope?: string
  ): Promise<string | null> {
    const key = `${documentId}_p${pageNumber}`;

    // 1. Check in-memory Object URL cache
    const existingUrl = this.urlCache.get(key);
    if (existingUrl) {
      return existingUrl;
    }

    // 2. Return in-flight promise if currently queued or rendering
    const inFlight = this.inFlightPromises.get(key);
    if (inFlight) {
      return inFlight;
    }

    // 3. Check bounds
    if (pageNumber < 1 || pageNumber > MAX_PAGES_LIMIT) {
      return null;
    }

    // 4. If we already know this doc has no PDF source (e.g. demo docs), return null immediately
    if (this.noPdfSourceSet.has(documentId)) {
      return null;
    }

    // Create execution promise with synchronous task registration for instant cancellation
    let taskRef!: QueueTask;
    const promise = new Promise<string | null>((resolve, reject) => {
      taskRef = {
        id: `${key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        documentId,
        pageNumber,
        viewScope,
        resolve,
        reject,
        cancelled: false,
      };
      this.pendingTasks.add(taskRef);
      this.executeTaskLifecycle(taskRef);
    });

    this.inFlightPromises.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingTasks.delete(taskRef);
      this.inFlightPromises.delete(key);
    }
  }

  /**
   * Runs the async validation and queue lifecycle for a task.
   */
  private async executeTaskLifecycle(task: QueueTask): Promise<void> {
    const key = `${task.documentId}_p${task.pageNumber}`;

    if (task.cancelled) {
      task.resolve(null);
      return;
    }

    try {
      // 1. Check IndexedDB persistent store first before running pdf.js
      const cachedBlob = await storage.getThumbnail(task.documentId, task.pageNumber);
      if (task.cancelled) {
        task.resolve(null);
        return;
      }
      if (cachedBlob) {
        const url = URL.createObjectURL(cachedBlob);
        this.urlCache.set(key, url);
        task.resolve(url);
        return;
      }

      // 2. Check if PDF binary source exists in IndexedDB
      const pdfSource = await storage.getPdfSource(task.documentId);
      if (task.cancelled) {
        task.resolve(null);
        return;
      }
      if (!pdfSource) {
        // Document has no PDF source (for example benchmark / demo documents)
        this.noPdfSourceSet.add(task.documentId);
        task.resolve(null);
        return;
      }

      // 3. Enforce maximum file size limit (25 MB)
      if (pdfSource.byteLength > MAX_UPLOAD_BYTES) {
        console.warn(`[ThumbnailService] Document ${task.documentId} exceeds 25 MB limit.`);
        task.resolve(null);
        return;
      }

      // 4. Place into sequential queue if not cancelled
      this.pendingTasks.delete(task);
      if (task.cancelled) {
        task.resolve(null);
        return;
      }
      this.queue.push(task);
      this.processQueue();
    } catch (err: any) {
      task.resolve(null);
    }
  }

  /**
   * Processes queue items one at a time in the background.
   */
  private async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeTask = task;

      if (task.cancelled) {
        task.resolve(null);
        this.activeTask = null;
        continue;
      }

      const key = `${task.documentId}_p${task.pageNumber}`;

      // Re-check URL cache in case another task for the same key resolved
      if (this.urlCache.has(key)) {
        task.resolve(this.urlCache.get(key)!);
        this.activeTask = null;
        continue;
      }

      try {
        let blob: Blob | null = null;

        if (this.mockRenderer) {
          blob = await this.mockRenderer(task.documentId, task.pageNumber);
        } else {
          blob = await this.renderPageToBlob(task.documentId, task.pageNumber, task);
        }

        if (task.cancelled) {
          task.resolve(null);
          this.activeTask = null;
          continue;
        }

        if (blob) {
          // Cache in IndexedDB persistent storage
          await storage.saveThumbnail(task.documentId, task.pageNumber, blob);

          // Create Object URL and cache in memory
          const url = URL.createObjectURL(blob);
          this.urlCache.set(key, url);
          task.resolve(url);
        } else {
          task.resolve(null);
        }
      } catch (err: any) {
        if (task.cancelled || err?.name === 'RenderingCancelledException') {
          task.resolve(null);
        } else {
          console.debug(`[ThumbnailService] Render notice for ${key}:`, err);
          task.resolve(null);
        }
      } finally {
        this.activeTask = null;
        this.activeRenderTask = null;
      }
    }

    this.isProcessing = false;
  }

  /**
   * Renders a specific page using pdf.js to a small canvas (~120px wide)
   * and converts it to an image/webp or image/png Blob.
   */
  private async renderPageToBlob(
    documentId: string,
    pageNumber: number,
    task: QueueTask
  ): Promise<Blob | null> {
    const pdfBuffer = await storage.getPdfSource(documentId);
    if (!pdfBuffer || pdfBuffer.byteLength > MAX_UPLOAD_BYTES) {
      return null;
    }

    // Retrieve or instantiate PDFDocumentProxy
    let pdfDoc = this.pdfDocCache.get(documentId);
    if (!pdfDoc) {
      const pdfjs = await loadPdfjs();

      const loadingTask = pdfjs.getDocument({
        data: pdfBytes(pdfBuffer),
        useSystemFonts: true,
      });

      pdfDoc = await loadingTask.promise;
      this.pdfDocCache.set(documentId, pdfDoc);
    }

    if (pageNumber > pdfDoc.numPages || pageNumber > MAX_PAGES_LIMIT) {
      return null;
    }

    if (task.cancelled) {
      return null;
    }

    const page = await pdfDoc.getPage(pageNumber);

    if (task.cancelled) {
      return null;
    }

    // Calculate scale to achieve target ~120px width
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const scale = TARGET_THUMBNAIL_WIDTH / Math.max(1, unscaledViewport.width);
    const viewport = page.getViewport({ scale });

    if (typeof document === 'undefined') {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return null;
    }

    // Fill white paper background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    } as any);

    this.activeRenderTask = renderTask;
    await renderTask.promise;
    this.activeRenderTask = null;

    if (task.cancelled) {
      return null;
    }

    // Convert canvas to Blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            // Fallback to png if webp unsupported
            canvas.toBlob((pngB) => resolve(pngB), 'image/png');
          }
        },
        'image/webp',
        0.85
      );
    });

    return blob;
  }

  /**
   * Cancels pending renders when the user leaves a view (e.g. Reader or Library)
   * or when switching active documents.
   */
  public cancelPendingRenders(viewScope?: string): void {
    // 1. Cancel pending unqueued tasks (awaiting IndexedDB / validation)
    for (const task of this.pendingTasks) {
      if (!viewScope || task.viewScope === viewScope) {
        task.cancelled = true;
        task.resolve(null);
      }
    }

    // 2. Cancel unstarted tasks in the queue
    for (const task of this.queue) {
      if (!viewScope || task.viewScope === viewScope) {
        task.cancelled = true;
        task.resolve(null);
      }
    }

    // Filter out all cancelled tasks
    this.queue = this.queue.filter((t) => !t.cancelled);

    // 3. Abort active render task if belonging to the matching view scope
    if (this.activeTask && (!viewScope || this.activeTask.viewScope === viewScope)) {
      this.activeTask.cancelled = true;
      if (this.activeRenderTask && typeof this.activeRenderTask.cancel === 'function') {
        try {
          this.activeRenderTask.cancel();
        } catch {
          // ignore cancellation errors
        }
      }
      this.activeRenderTask = null;
    }
  }

  /**
   * Purges PDF proxies and revokes Object URLs (e.g. on database reset or document delete).
   */
  public clearMemoryCache(): void {
    this.cancelPendingRenders();
    for (const url of this.urlCache.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.urlCache.clear();
    this.pdfDocCache.clear();
    this.noPdfSourceSet.clear();
  }

  /**
   * Removes cached data for a deleted document.
   */
  public purgeDocument(documentId: string): void {
    // Revoke and remove cached URLs for this document
    for (const [key, url] of this.urlCache.entries()) {
      if (key.startsWith(`${documentId}_`)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        this.urlCache.delete(key);
      }
    }

    this.pdfDocCache.delete(documentId);
    this.noPdfSourceSet.delete(documentId);
    this.cancelPendingRenders();
  }
}

export const thumbnailService = new ThumbnailService();
