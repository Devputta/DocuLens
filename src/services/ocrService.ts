/**
 * DocuLens In-Browser OCR Service
 * Powered by Tesseract.js in a dedicated Web Worker.
 * Purely local, privacy-first processing for scanned PDFs without text layers.
 * One page at a time with live progress callbacks, cancelation support,
 * and provenance confidence tagging.
 */

import {
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  OcrProgress,
} from '../types/doculens';
import { createProvenanceChunks, MAX_UPLOAD_BYTES, MAX_PAGES_LIMIT } from './pdfParser';
import { pdfBytes } from '../utils/bytes';
import { loadPdfjs } from './pdfjsLoader';

export interface PageOcrOutput {
  pageNum: number;
  text: string;
  confidence: number;
}

export interface OcrProcessingResult {
  elements: DocumentElement[];
  chunks: DocumentChunk[];
  tables: DocumentTable[];
  averageConfidence: number;
  pageCount: number;
}

// Polyfill Promise.try for environments where it is not yet natively supported
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function <T>(fn: () => T | PromiseLike<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn());
      } catch (err) {
        reject(err);
      }
    });
  };
}

export interface OcrRunOptions {
  pdfBuffer: ArrayBuffer;
  docId: string;
  pageCount: number;
  onProgress?: (progress: OcrProgress) => void;
  abortSignal?: AbortSignal;
  // Optional worker override for unit testing or custom environments
  workerOverride?: {
    recognize: (image: any) => Promise<{ data: { text: string; confidence: number } }>;
    terminate: () => Promise<any>;
  };
  pageRecognizerOverride?: (pageNum: number) => Promise<{ text: string; confidence: number }>;
}

/**
 * Checks if extracted elements represent zero real text layer (i.e. scanned document).
 */
export function hasZeroTextLayer(elements: DocumentElement[]): boolean {
  if (!elements || elements.length === 0) return true;
  // If only placeholder scanned notices exist
  const substantive = elements.filter(
    (e) =>
      e.content &&
      e.content.trim().length > 0 &&
      !e.sourceElementId.startsWith('src_scanned_notice') &&
      !e.content.startsWith('[Notice: Scanned document')
  );
  return substantive.length === 0;
}

/**
 * Converts OCR text output for a page into structured DocumentElements with OCR badge and confidence.
 */
export function parseOcrPageText(
  pageText: string,
  pageNum: number,
  docId: string,
  startElementIndex: number,
  confidence: number
): { elements: DocumentElement[]; nextIndex: number } {
  const elements: DocumentElement[] = [];
  let currentIndex = startElementIndex;

  const rawBlocks = pageText
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  if (rawBlocks.length === 0) {
    const singleLine = pageText.trim();
    if (singleLine.length > 0) {
      elements.push({
        id: `${docId}-el-${currentIndex}`,
        documentId: docId,
        type: 'paragraph',
        pageNumber: pageNum,
        content: singleLine,
        sourceElementId: `src_ocr_p${pageNum}_e${currentIndex}`,
        isOcr: true,
        ocrConfidence: Math.round(confidence * 10) / 10,
        bbox: [10, 20, 80, 10],
      });
      currentIndex++;
    }
    return { elements, nextIndex: currentIndex };
  }

  for (let bIdx = 0; bIdx < rawBlocks.length; bIdx++) {
    const block = rawBlocks[bIdx];
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const text = lines.join(' ');

    let type: DocumentElement['type'] = 'paragraph';
    let headingLevel: number | undefined;

    if (text.length < 75 && (text === text.toUpperCase() || /^([A-Z0-9\s]{3,}|Chapter|Section)/.test(text))) {
      type = 'heading-1';
      headingLevel = 1;
    } else if (text.length < 100 && /^[0-9]\.[0-9]/.test(text)) {
      type = 'heading-2';
      headingLevel = 2;
    } else if (/^[•\-\*\u2022\u25E6]|\d{1,2}\.\s/.test(text)) {
      type = 'list-item';
    }

    const approxY = Math.min(90, Math.max(5, Math.round((bIdx / rawBlocks.length) * 85)));

    elements.push({
      id: `${docId}-el-${currentIndex}`,
      documentId: docId,
      type,
      headingLevel,
      pageNumber: pageNum,
      content: text,
      sourceElementId: `src_ocr_p${pageNum}_e${currentIndex}`,
      isOcr: true,
      ocrConfidence: Math.round(confidence * 10) / 10,
      bbox: [10, approxY, 80, 8],
    });
    currentIndex++;
  }

  return { elements, nextIndex: currentIndex };
}

/**
 * Runs in-browser OCR one page at a time in a Web Worker using Tesseract.js.
 * Strictly respects file size limit (25 MB) and page limit (500 pages).
 */
export async function runInBrowserOCR(options: OcrRunOptions): Promise<OcrProcessingResult> {
  const { pdfBuffer, docId, pageCount, onProgress, abortSignal, workerOverride } = options;

  // 1. Enforce limits
  if (pdfBuffer.byteLength > MAX_UPLOAD_BYTES) {
    const sizeMB = (pdfBuffer.byteLength / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File size (${sizeMB} MB) exceeds maximum allowable threshold of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
    );
  }

  if (pageCount > MAX_PAGES_LIMIT) {
    throw new Error(
      `Document page count (${pageCount}) exceeds the maximum allowable limit of ${MAX_PAGES_LIMIT} pages.`
    );
  }

  if (abortSignal?.aborted) {
    throw new Error('OCR process was cancelled before starting.');
  }

  onProgress?.({
    page: 1,
    totalPages: pageCount,
    percent: 5,
    message: 'Initializing local Tesseract OCR web worker...',
  });

  // 2. Initialize worker
  let worker: any = workerOverride;
  let ownsWorker = false;

  if (!worker && !options.pageRecognizerOverride) {
    try {
      const { createWorker } = await import('tesseract.js');
      const isBrowser = typeof window !== 'undefined';
      const langPath = isBrowser
        ? window.location.origin
        : typeof process !== 'undefined' && process.cwd
        ? `${process.cwd()}/public`
        : undefined;
      const workerPath = isBrowser ? window.location.origin + '/ocr/worker.min.js' : undefined;
      const corePath = isBrowser ? window.location.origin + '/ocr/' : undefined;

      worker = await createWorker('eng', 1, {
        workerBlobURL: true,
        langPath,
        workerPath,
        corePath,
        gzip: false,
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            // sub-page progress if useful
          }
        },
      });
      ownsWorker = true;
    } catch (workerErr: any) {
      console.error('Failed to initialize Tesseract web worker:', workerErr);
      throw new Error(`Unable to launch OCR Web Worker: ${workerErr?.message || 'Worker initialization failed'}`);
    }
  }

  const allElements: DocumentElement[] = [];
  const allTables: DocumentTable[] = [];
  const confidences: number[] = [];
  let nextElementIndex = 1;

  try {
    if (options.pageRecognizerOverride) {
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        if (abortSignal?.aborted) {
          throw new Error('OCR process was cancelled by user.');
        }

        const percent = Math.round(((pageNum - 1) / pageCount) * 90) + 5;
        onProgress?.({
          page: pageNum,
          totalPages: pageCount,
          percent,
          message: `Running OCR: processing page ${pageNum} of ${pageCount}...`,
        });

        const rec = await options.pageRecognizerOverride(pageNum);
        const recognizedText = rec.text || '';
        const confidence = rec.confidence || 85;
        confidences.push(confidence);

        if (recognizedText.trim().length > 0) {
          const { elements: pageElements, nextIndex } = parseOcrPageText(
            recognizedText,
            pageNum,
            docId,
            nextElementIndex,
            confidence
          );
          allElements.push(...pageElements);
          nextElementIndex = nextIndex;
        } else {
          allElements.push({
            id: `${docId}-el-${nextElementIndex++}`,
            documentId: docId,
            type: 'paragraph',
            pageNumber: pageNum,
            content: `[Page ${pageNum}: No text detected by OCR scan]`,
            sourceElementId: `src_ocr_p${pageNum}_empty`,
            isOcr: true,
            ocrConfidence: Math.round(confidence * 10) / 10,
          });
        }
      }
    } else {
      // 3. Load PDF via PDF.js
      const pdfjs = await loadPdfjs();

      const loadingTask = pdfjs.getDocument({
        data: pdfBytes(pdfBuffer),
        useSystemFonts: true,
      });
      const pdf = await loadingTask.promise;

      const actualPages = Math.min(pdf.numPages, pageCount);

      // 4. Process each page sequentially in Web Worker
      for (let pageNum = 1; pageNum <= actualPages; pageNum++) {
        if (abortSignal?.aborted) {
          throw new Error('OCR process was cancelled by user.');
        }

        const percent = Math.round(((pageNum - 1) / actualPages) * 90) + 5;
        onProgress?.({
          page: pageNum,
          totalPages: actualPages,
          percent,
          message: `Running OCR: processing page ${pageNum} of ${actualPages}...`,
        });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });

        let recognizedText = '';
        let confidence = 85;

        // Render page to canvas in browser environment
        if (typeof document !== 'undefined') {
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport,
            } as any).promise;

            const rec = await worker.recognize(canvas);
            recognizedText = rec?.data?.text || '';
            confidence = rec?.data?.confidence || 85;
          }
        } else {
          // Non-browser fallback
          const rec = await worker.recognize({ pageNum });
          recognizedText = rec?.data?.text || '';
          confidence = rec?.data?.confidence || 85;
        }

        confidences.push(confidence);

        if (recognizedText.trim().length > 0) {
          const { elements: pageElements, nextIndex } = parseOcrPageText(
            recognizedText,
            pageNum,
            docId,
            nextElementIndex,
            confidence
          );
          allElements.push(...pageElements);
          nextElementIndex = nextIndex;
        } else {
          allElements.push({
            id: `${docId}-el-${nextElementIndex++}`,
            documentId: docId,
            type: 'paragraph',
            pageNumber: pageNum,
            content: `[Page ${pageNum}: No text detected by OCR scan]`,
            sourceElementId: `src_ocr_p${pageNum}_empty`,
            isOcr: true,
            ocrConfidence: Math.round(confidence * 10) / 10,
          });
        }
      }
    }
  } finally {
    if (ownsWorker && worker && typeof worker.terminate === 'function') {
      try {
        await worker.terminate();
      } catch (termErr) {
        console.debug('Worker termination cleanup notice:', termErr);
      }
    }
  }

  // 5. Build provenance chunks
  const chunks = createProvenanceChunks(allElements, docId);
  const avgConfidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10
      : 80;

  onProgress?.({
    page: pageCount,
    totalPages: pageCount,
    percent: 100,
    message: 'OCR processing complete.',
  });

  return {
    elements: allElements,
    chunks,
    tables: allTables,
    averageConfidence: avgConfidence,
    pageCount,
  };
}

export interface FigureOcrResult {
  text: string;
  confidence: number;
  language: string;
}

export interface FigureOcrOptions {
  imageBlob: Blob;
  onProgress?: (percent: number, message: string) => void;
  abortSignal?: AbortSignal;
  workerOverride?: {
    recognize: (image: any) => Promise<{ data: { text: string; confidence: number } }>;
    terminate: () => Promise<any>;
  };
}

/**
 * Runs in-browser OCR on a single figure image Blob.
 * Supports cancellation via AbortSignal and live progress reporting.
 */
export async function runFigureOCR(options: FigureOcrOptions): Promise<FigureOcrResult> {
  const { imageBlob, onProgress, abortSignal, workerOverride } = options;

  if (abortSignal?.aborted) {
    throw new Error('OCR process was cancelled by user.');
  }

  onProgress?.(10, 'Initializing OCR worker...');

  let worker: any = workerOverride;
  let ownsWorker = false;

  if (!worker) {
    try {
      const { createWorker } = await import('tesseract.js');
      const isBrowser = typeof window !== 'undefined';
      const langPath = isBrowser
        ? window.location.origin
        : typeof process !== 'undefined' && process.cwd
        ? `${process.cwd()}/public`
        : undefined;
      const workerPath = isBrowser ? window.location.origin + '/ocr/worker.min.js' : undefined;
      const corePath = isBrowser ? window.location.origin + '/ocr/' : undefined;

      worker = await createWorker('eng', 1, {
        workerBlobURL: true,
        langPath,
        workerPath,
        corePath,
        gzip: false,
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const p = Math.round(20 + m.progress * 75);
            onProgress?.(p, `Extracting text: ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      ownsWorker = true;
    } catch (workerErr: any) {
      console.error('Failed to initialize Tesseract web worker for figure OCR:', workerErr);
      throw new Error(
        `Unable to launch OCR Web Worker: ${workerErr?.message || 'Worker initialization failed'}`
      );
    }
  }

  try {
    if (abortSignal?.aborted) {
      throw new Error('OCR process was cancelled by user.');
    }

    onProgress?.(30, 'Analyzing figure image pixels...');

    const res = await worker.recognize(imageBlob);

    if (abortSignal?.aborted) {
      throw new Error('OCR process was cancelled by user.');
    }

    onProgress?.(100, 'OCR extraction complete.');

    return {
      text: res?.data?.text?.trim() || '',
      confidence: typeof res?.data?.confidence === 'number' ? res.data.confidence : 85,
      language: 'eng',
    };
  } finally {
    if (ownsWorker && worker && typeof worker.terminate === 'function') {
      try {
        await worker.terminate();
      } catch (termErr) {
        console.debug('Figure OCR worker termination cleanup notice:', termErr);
      }
    }
  }
}
