/**
 * DocuLens Figure Extraction Engine
 * - Extracts embedded images from PDF pages using pdf.js
 * - Fallback to canvas rendering for vector drawings or full page scans
 * - Skips images smaller than 64x64px
 * - Deduplicates images based on pixel data hashing
 * - Generates full PNG/JPEG blobs and lightweight thumbnails
 * - Stores figures into IndexedDB without keeping full-size bitmaps in React state
 * - Provides step-by-step progress for on-demand scanning
 */

import { storage } from './storage';
import { DocumentFigure, FigureType } from '../types/doculens';
import { linkFiguresAndCaptions } from './captionMatcher';
import { pdfBytes } from '../utils/bytes';
import { loadPdfjs } from './pdfjsLoader';

export const MIN_FIGURE_DIMENSION = 64; // skip images < 64x64
export const MAX_THUMBNAIL_DIMENSION = 240; // thumbnail max width/height

export type MockFigureExtractorFn = (
  documentId: string,
  pageCount: number
) => Promise<DocumentFigure[]>;

/**
 * Calculates a SHA-256 or robust cryptographic hash of image pixel data.
 */
export async function computePixelHash(data: Uint8ClampedArray | Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const copy = new Uint8Array(data.byteLength);
      copy.set(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
      const hashBuffer = await crypto.subtle.digest('SHA-256', copy);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback if subtle digest fails
    }
  }

  // Deterministic fast 64-bit sampling hash fallback
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const step = Math.max(1, Math.floor(data.length / 5000));
  for (let i = 0; i < data.length; i += step) {
    const byte = data[i];
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Converts a HTMLCanvasElement into a Blob.
 */
function canvasToBlob(canvas: HTMLCanvasElement, mimeType = 'image/png', quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

class FigureExtractorService {
  private mockExtractor: MockFigureExtractorFn | null = null;

  public setMockExtractor(mock: MockFigureExtractorFn | null) {
    this.mockExtractor = mock;
  }

  /**
   * Scans a single document for figures page by page.
   * Reports progress and saves extracted figures into IndexedDB.
   */
  public async extractFiguresForDocument(
    documentId: string,
    onProgress?: (percent: number, message: string) => void
  ): Promise<DocumentFigure[]> {
    // 1. Check for mock extractor (for testing)
    if (this.mockExtractor) {
      const mockFigs = await this.mockExtractor(documentId, 3);
      if (mockFigs.length > 0) {
        await storage.saveFigures(mockFigs);
      }
      return mockFigs;
    }

    const doc = (await storage.getDocuments()).find((d) => d.id === documentId);
    if (!doc) {
      return [];
    }

    const pdfBuffer = await storage.getPdfSource(documentId);
    if (!pdfBuffer || typeof document === 'undefined') {
      // Document has no PDF source (e.g. demo benchmark document), check if already has synthetic figures
      const existing = await storage.getFiguresByDocument(documentId);
      return existing;
    }

    onProgress?.(5, `Initializing PDF parser for "${doc.originalName}"...`);

    const pdfjs = await loadPdfjs();

    const loadingTask = pdfjs.getDocument({
      data: pdfBytes(pdfBuffer),
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const totalPages = Math.min(pdfDoc.numPages, 500);

    const extractedFigures: DocumentFigure[] = [];
    const seenHashes = new Set<string>();

    // Load any already stored figure hashes to prevent duplicates across rescans
    const existingFigures = await storage.getFiguresByDocument(documentId);
    for (const ef of existingFigures) {
      if (ef.hash) seenHashes.add(ef.hash);
    }

    let figureCounter = existingFigures.length + 1;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pagePercent = Math.round(10 + ((pageNum - 1) / totalPages) * 85);
      onProgress?.(
        pagePercent,
        `Scanning page ${pageNum} of ${totalPages} for embedded figures...`
      );

      const page = await pdfDoc.getPage(pageNum);
      const pageViewport = page.getViewport({ scale: 1.5 });
      const ops = await page.getOperatorList();

      let pageFoundFigures = 0;

      // 1. Scan operator list for embedded raster image XObjects
      const imageObjIds: string[] = [];
      const OPS = pdfjs.OPS || {};

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (
          fn === OPS.paintImageXObject ||
          fn === OPS.paintInlineImageXObject ||
          fn === OPS.paintImageMaskXObject
        ) {
          const arg = ops.argsArray[i]?.[0];
          if (typeof arg === 'string' && !imageObjIds.includes(arg)) {
            imageObjIds.push(arg);
          }
        }
      }

      // Extract each unique embedded image
      for (const objId of imageObjIds) {
        try {
          const imgData = await this.resolvePageImageObject(page, objId);
          if (!imgData) continue;

          const width = imgData.width;
          const height = imgData.height;

          // Skip images smaller than 64x64px per requirement
          if (!width || !height || width < MIN_FIGURE_DIMENSION || height < MIN_FIGURE_DIMENSION) {
            continue;
          }

          // Render image onto offscreen canvas
          const imgCanvas = document.createElement('canvas');
          imgCanvas.width = width;
          imgCanvas.height = height;
          const ctx = imgCanvas.getContext('2d');
          if (!ctx) continue;

          if (imgData.bitmap && typeof ctx.drawImage === 'function') {
            ctx.drawImage(imgData.bitmap, 0, 0);
          } else if (imgData.data) {
            const rawData = imgData.data;
            const rgbaArray = this.normalizeToRGBA(rawData, width, height, imgData.kind);
            const imgDataObj = ctx.createImageData(width, height);
            imgDataObj.data.set(rgbaArray);
            ctx.putImageData(imgDataObj, 0, 0);
          } else {
            continue;
          }

          // Check pixel hash to avoid duplicates
          const pixelData = ctx.getImageData(0, 0, width, height).data;
          const hash = await computePixelHash(pixelData);
          if (seenHashes.has(hash)) {
            continue; // duplicate image skipped
          }
          seenHashes.add(hash);

          // Full-size Blob (PNG)
          const fullBlob = await canvasToBlob(imgCanvas, 'image/png');
          if (!fullBlob) continue;

          // Small Thumbnail Blob
          const thumbBlob = await this.createThumbnailBlob(imgCanvas);
          if (!thumbBlob) continue;

          const figId = `fig-${documentId}-p${pageNum}-${figureCounter++}`;
          const newFigure: DocumentFigure = {
            id: figId,
            documentId,
            pageNumber: pageNum,
            bbox: [10, 10, 80, 80],
            width,
            height,
            imageBlob: fullBlob,
            thumbnailBlob: thumbBlob,
            type: 'embedded-image',
            hash,
            caption: `Figure ${extractedFigures.length + 1} (Page ${pageNum})`,
            createdAt: Date.now(),
          };

          extractedFigures.push(newFigure);
          pageFoundFigures++;
        } catch (imgErr) {
          console.debug(`[FigureExtractor] Could not extract image ${objId}:`, imgErr);
        }
      }

      // 2. Vector Drawings or Page Scan Fallback:
      // If no embedded raster images were found on this page, or the page has substantial vector artwork / scan
      let hasVectorDrawings = false;
      let vectorOpCount = 0;
      for (const fn of ops.fnArray) {
        if (
          fn === OPS.constructPath ||
          fn === OPS.stroke ||
          fn === OPS.fill ||
          fn === OPS.eoFill
        ) {
          vectorOpCount++;
          if (vectorOpCount >= 18) {
            hasVectorDrawings = true;
            break;
          }
        }
      }

      const isScanPage = Boolean(doc.isScanned);

      if (pageFoundFigures === 0 && (hasVectorDrawings || isScanPage)) {
        try {
          const regionFig = await this.renderPageRegionFallback(
            page,
            pageViewport,
            documentId,
            pageNum,
            figureCounter,
            seenHashes,
            hasVectorDrawings ? 'vector-drawing' : 'page-scan'
          );

          if (regionFig) {
            figureCounter++;
            extractedFigures.push(regionFig);
          }
        } catch (regionErr) {
          console.debug(`[FigureExtractor] Region fallback notice on page ${pageNum}:`, regionErr);
        }
      }
    }

    // Link extracted figures to captions detected in document elements
    try {
      const docElements = await storage.getElementsByDocument(documentId);
      if (docElements.length > 0) {
        const linked = linkFiguresAndCaptions(extractedFigures, docElements);
        extractedFigures.splice(0, extractedFigures.length, ...linked);
      }
    } catch (linkErr) {
      console.debug('[FigureExtractor] Caption linking notice:', linkErr);
    }

    // Persist extracted figures in IndexedDB
    if (extractedFigures.length > 0) {
      await storage.saveFigures(extractedFigures);
    }

    onProgress?.(100, `Completed scanning: ${extractedFigures.length} figure(s) extracted.`);
    return extractedFigures;
  }

  /**
   * Safely retrieves an image object from PDF.js page objects.
   */
  private resolvePageImageObject(page: any, objId: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        if (page.objs && typeof page.objs.get === 'function') {
          // If page.objs.get accepts a callback
          if (page.objs.get.length >= 2) {
            page.objs.get(objId, (data: any) => resolve(data));
          } else {
            const res = page.objs.get(objId);
            if (res && typeof res.then === 'function') {
              res.then((resolved: any) => resolve(resolved)).catch(() => resolve(null));
            } else {
              resolve(res);
            }
          }
        } else if (page.commonObjs && typeof page.commonObjs.get === 'function') {
          if (page.commonObjs.get.length >= 2) {
            page.commonObjs.get(objId, (data: any) => resolve(data));
          } else {
            resolve(page.commonObjs.get(objId));
          }
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Normalizes arbitrary PDF pixel byte streams to RGBA Uint8ClampedArray.
   */
  private normalizeToRGBA(
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    kind?: number
  ): Uint8ClampedArray {
    const totalPixels = width * height;
    const rgba = new Uint8ClampedArray(totalPixels * 4);

    if (data.length === totalPixels * 4) {
      // Already RGBA
      rgba.set(data);
      return rgba;
    }

    if (data.length === totalPixels * 3) {
      // RGB 24bpp
      let srcIdx = 0;
      let dstIdx = 0;
      for (let i = 0; i < totalPixels; i++) {
        rgba[dstIdx] = data[srcIdx];
        rgba[dstIdx + 1] = data[srcIdx + 1];
        rgba[dstIdx + 2] = data[srcIdx + 2];
        rgba[dstIdx + 3] = 255;
        srcIdx += 3;
        dstIdx += 4;
      }
      return rgba;
    }

    if (data.length >= totalPixels) {
      // Grayscale 8bpp
      let dstIdx = 0;
      for (let i = 0; i < totalPixels; i++) {
        const gray = data[i];
        rgba[dstIdx] = gray;
        rgba[dstIdx + 1] = gray;
        rgba[dstIdx + 2] = gray;
        rgba[dstIdx + 3] = 255;
        dstIdx += 4;
      }
      return rgba;
    }

    // Default white fill
    rgba.fill(255);
    return rgba;
  }

  /**
   * Fallback for vector drawings or page scans:
   * Renders the page onto a canvas, crops the visual figure region, and creates a figure entity.
   */
  private async renderPageRegionFallback(
    page: any,
    viewport: any,
    documentId: string,
    pageNum: number,
    figureIndex: number,
    seenHashes: Set<string>,
    figureType: FigureType
  ): Promise<DocumentFigure | null> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // Detect graphic boundaries by scanning for non-white pixels
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let nonWhiteCount = 0;

    // Step across pixels for performance
    const step = 4;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        // If not white/near-white background
        if (r < 240 || g < 240 || b < 240) {
          nonWhiteCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Ensure content is bounded and exceeds 64x64px
    const cropW = Math.max(0, maxX - minX);
    const cropH = Math.max(0, maxY - minY);

    if (cropW < MIN_FIGURE_DIMENSION || cropH < MIN_FIGURE_DIMENSION || nonWhiteCount < 100) {
      return null;
    }

    // Crop to bounding box
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const cropCtx = croppedCanvas.getContext('2d');
    if (!cropCtx) return null;

    cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    // Compute pixel hash
    const croppedData = cropCtx.getImageData(0, 0, cropW, cropH).data;
    const hash = await computePixelHash(croppedData);
    if (seenHashes.has(hash)) {
      return null;
    }
    seenHashes.add(hash);

    const fullBlob = await canvasToBlob(croppedCanvas, 'image/png');
    if (!fullBlob) return null;

    const thumbBlob = await this.createThumbnailBlob(croppedCanvas);
    if (!thumbBlob) return null;

    const normX = Math.round((minX / width) * 100);
    const normY = Math.round((minY / height) * 100);
    const normW = Math.round((cropW / width) * 100);
    const normH = Math.round((cropH / height) * 100);

    return {
      id: `fig-${documentId}-p${pageNum}-${figureIndex}`,
      documentId,
      pageNumber: pageNum,
      bbox: [normX, normY, normW, normH],
      width: cropW,
      height: cropH,
      imageBlob: fullBlob,
      thumbnailBlob: thumbBlob,
      type: figureType,
      hash,
      caption: `${figureType === 'vector-drawing' ? 'Vector Diagram' : 'Scanned Figure'} (Page ${pageNum})`,
      createdAt: Date.now(),
    };
  }

  /**
   * Scales a canvas down to thumbnail dimensions (max 240px) and converts to WebP/PNG Blob.
   */
  public async createThumbnailBlob(sourceCanvas: HTMLCanvasElement): Promise<Blob | null> {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;

    const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.floor(srcW * scale));
    const targetH = Math.max(1, Math.floor(srcH * scale));

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = targetW;
    thumbCanvas.height = targetH;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

    // Try webp first, fall back to png
    let blob = await canvasToBlob(thumbCanvas, 'image/webp', 0.85);
    if (!blob) {
      blob = await canvasToBlob(thumbCanvas, 'image/png');
    }
    return blob;
  }
}

export const figureExtractor = new FigureExtractorService();
