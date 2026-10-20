/**
 * DocuLens PDF.js Dynamic Loader
 *
 * Configures PDF.js with local bundled worker from 'pdfjs-dist/build/pdf.worker.min.mjs'.
 * - 100% offline, zero external CDN dependencies
 * - Version-locked to the installed pdfjs-dist dependency
 * - Initializes GlobalWorkerOptions.workerSrc exactly once
 */

let pdfjsModule: typeof import('pdfjs-dist') | null = null;
let isConfigured = false;

export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (pdfjsModule) {
    return pdfjsModule;
  }

  const pdfjs = await import('pdfjs-dist');

  if (!isConfigured) {
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    }
    isConfigured = true;
  }

  pdfjsModule = pdfjs;
  return pdfjs;
}
