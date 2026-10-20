# Changelog

All notable changes to DocuLens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Local PDF.js Worker Integration**: Configured `pdfjsLoader.ts` using `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` to bundle the worker with Vite, enabling 100% offline PDF processing without external CDN dependencies.
- **Enhanced PWA Install Experience (`InstallDialog.tsx`)**: Replaced platform-gated buttons with an always-accessible Install / Download dialog featuring live status chips (Online, Offline-ready, Installed), iframe detection with "Open in new tab", platform-specific manual install guidance, one-click backup downloads, and a collapsible "Run on my computer" terminal snippet.
- **Deployment Hardening**: Multi-stage Dockerfile (`node:22-slim`) with non-root security, healthcheck, `compression` middleware, `trust proxy` configuration, immutable static caching headers for assets, and Content-Security-Policy (CSP) headers in production.

### Fixed
- **ArrayBuffer Detachment Bug**: Resolved `DataCloneError: An ArrayBuffer is detached and could not be cloned` caused by PDF.js worker transferring the caller's ArrayBuffer. Created `pdfBytes()` utility to supply isolated buffer clones to all PDF.js loading routines, and updated `storage.savePdfSource` to accept Blobs and reject detached empty buffers safely.
- **Console Log Hygiene**: Downgraded benign fallback conditions (PDF decode fallbacks, missing vector figures, optional worker cleanup) to `console.debug`, ensuring a clean browser console.
- **Vite HMR WebSocket Guard**: Dev-only unhandled rejection handler in `main.tsx` silences proxy-blocked WebSocket rejections in AI Studio without hiding real errors.

---

## [1.2.0] - 2026-10-19

### Added
- **DOCX and Plain Text Ingestion**: Support for Microsoft Word (`.docx`) packages via local Mammoth parsing and Plain Text (`.txt`) files with heading heuristic detection and virtual paging (`reflowed` badge).
- **Embedded Figures in Comparison Exports**: Comparison PDF reports include an interactive "Include figures" selector embedding up to 20 diagrams and charts with provenance captions.
- **Store-Only ZIP Archive Engine**: Pure JavaScript offline ZIP writer (`zipWriter.ts`) adhering to PKWare APPNOTE.TXT for exporting figures and Markdown comparison packages without third-party network libraries.
- **Multi-Turn Conversation Threads**: Sidebar thread management for Ask Documents with title extraction, conversation search, and full Markdown transcript export.

---

## [1.1.0] - 2026-10-18

### Added
- **Figure Extraction Engine**: Automatic extraction of embedded raster graphics, full-page scans, and vector drawings with caption matching and spatial bounding.
- **On-Demand Figure OCR**: Local Tesseract OCR scanning over extracted figures to index diagram text into the lexical search engine.
- **Editable Tabular Datasets**: Interactive table cell editor with row/column insertion and formula-safe CSV export.
- **PWA Service Worker v1.1.0**: Cache-first offline asset strategy precaching Tesseract language models.

---

## [1.0.0] - 2026-10-17

### Added
- **Initial Release of DocuLens Workbench**.
- Strict PDF parser with `%PDF-` signature verification and SHA-256 fingerprint deduplication.
- Evidence-based lexical search with exact-phrase scoring bonus and in-reader highlighting.
- Citation-verified question answering backed by stateless Express proxy and Google Gemini (`gemini-3.5-flash`).
- Side-by-side 4-mode document comparison workspace.
- Complete IndexedDB client storage with zero cloud retention.
