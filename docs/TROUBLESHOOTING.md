# DocuLens Troubleshooting Guide

Common issues, diagnostic explanations, and resolutions for DocuLens.

---

## 1. "DataCloneError: An ArrayBuffer is detached and could not be cloned"

### Root Cause
When passing an `ArrayBuffer` to PDF.js via `pdfjs.getDocument({ data: new Uint8Array(buffer) })`, the PDF.js Web Worker transfers ownership of the underlying buffer to the worker thread via `postMessage(..., [transferable])`. This detaches the original buffer in the main thread (`buffer.byteLength` drops to `0`). Subsequent attempts to persist that original buffer into IndexedDB throw a `DataCloneError`.

### Resolution
DocuLens includes a buffer isolation utility (`src/utils/bytes.ts`):
```ts
export function pdfBytes(buf: ArrayBuffer): Uint8Array {
  // Hands PDF.js an independent cloned copy so the caller's buffer is never detached
  return new Uint8Array(buf.slice(0));
}
```
All PDF loading paths (`pdfParser.ts`, `ocrService.ts`, `regionCapture.ts`, `thumbnailService.ts`, `figureExtractor.ts`) use `pdfBytes(buffer)`. Additionally, `storage.savePdfSource` converts buffers into `Blob` instances synchronously to ensure persistence safety.

---

## 2. "WebSocket closed without opened" in Dev Console

### Root Cause
In cloud sandbox environments such as Google AI Studio, Vite's Hot Module Replacement (HMR) WebSocket connections to port 3000 are blocked or filtered by the platform's multi-tenant reverse proxy.

### Resolution
This rejection is completely harmless. DocuLens includes a dev-only unhandled rejection listener in `src/main.tsx` that calls `event.preventDefault()` specifically when the rejection message matches `"WebSocket closed without opened"`. Real runtime application errors continue to surface normally.

---

## 3. Install Button or PWA Prompt Not Showing

### Diagnostic Checklist
1. **Running inside an Iframe**: Web browsers (Chrome, Edge, Safari) deliberately block PWA `beforeinstallprompt` events inside embedded iframes. Click the **Install** button in the header, and click **"Open in new tab"** inside the `InstallDialog` to run in a top-level window.
2. **HTTP vs HTTPS**: Service Workers and PWA installation require a secure origin (`https://` or `http://localhost`). If deploying to a remote host, verify SSL/TLS is active.
3. **Already Installed**: If the app is already running in standalone window mode, the Install button in the header is hidden because the application is already installed.
4. **Firefox Desktop**: Mozilla Firefox does not support standalone desktop PWA installation. The `InstallDialog` informs users and recommends Chrome or Edge for standalone window use.

---

## 4. OCR Language File (`/eng.traineddata`) Not Found

### Root Cause
Tesseract.js by default attempts to fetch language models from a third-party GitHub CDN. In air-gapped, offline, or restricted network environments, this request fails.

### Resolution
DocuLens bundles `/public/eng.traineddata` locally and configures the Tesseract Web Worker with:
```ts
worker = await createWorker('eng', 1, {
  workerBlobURL: true,
  langPath: window.location.origin,
  gzip: false,
});
```
This forces Tesseract to fetch the uncompressed language model directly from your local server origin. The Service Worker precaches `/eng.traineddata` on first load for permanent offline availability.

---

## 5. HTTP 429 "Too Many Requests" (Rate Limit Exceeded)

### Root Cause
To protect against runaway API consumption, the stateless proxy server enforces in-memory sliding-window rate limits:
- `/api/inquiry`: 25 requests per minute per IP.
- `/api/validate-citations`: 60 requests per minute per IP.

### Resolution
If rate limited, the response headers include `Retry-After: <seconds>`. Wait for the window to reset (typically under 60 seconds). If running behind a reverse proxy (Cloud Run, Nginx), verify that the proxy forwards real client IPs via `X-Forwarded-For`; DocuLens has `app.set('trust proxy', 1);` enabled to parse upstream client IPs properly.

---

## 6. Missing or Invalid `GEMINI_API_KEY`

### Symptom
Submitting a question returns an answer quickly, but the model details in Settings show `"Remote AI: Disabled (Deterministic On-Device Engine Active)"`.

### Resolution
DocuLens features a zero-configuration graceful fallback:
- Without an API key, inquiries are answered using local BM25 ranking and on-device passage extraction.
- To enable Gemini 2.5 Flash synthesis, provide `GEMINI_API_KEY` in your environment or Secret Manager:
  ```bash
  export GEMINI_API_KEY="AIzaSy..."
  npm start
  ```
- In Google Cloud Run, mount the secret:
  ```bash
  gcloud run deploy doculens --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest ...
  ```
