# DocuLens Automated & Manual Testing Guide

This document outlines the testing strategy, test file coverage directory, automated test commands, and an end-to-end manual validation protocol.

---

## 1. Automated Testing with Vitest

DocuLens uses [Vitest](https://vitest.dev/) for blazing-fast unit and integration testing:

```bash
# Run all automated test suites
npm test

# Run tests with file watching during development
npx vitest

# Run a specific test suite
npx vitest run tests/pdfBufferDetach.test.ts

# Run the complete verification pipeline (lint + test + build)
npm run verify
```

---

## 2. Test Suite Directory & Coverage Mapping

The test suite consists of **22 test files** comprising **199 unit and integration tests**:

| Test File | Primary Coverage Domain |
| :--- | :--- |
| `tests/backupRestore.test.ts` | Backup archive creation, schema v1 validation, collision detection, and atomic IndexedDB restore transactions. |
| `tests/captionDetectionAndLinking.test.ts` | Regex heuristics for figure captions (`Figure X: ...`), spatial bounding, and document element linking. |
| `tests/citationNavigationAndOCR.test.ts` | Citation jump coordinates, quote provenance verification, scanned PDF detection, and local Web Worker OCR. |
| `tests/comparisonAndHighlighting.test.ts` | Concept matching, definition comparison, Jaccard topic matrix, and sentence-level diff algorithms. |
| `tests/documentManagement.test.ts` | PDF `%PDF-` signature checks, 25 MB limit, 500 page limit, SHA-256 deduplication, and cascading delete integrity. |
| `tests/docxTxtIngestion.test.ts` | Plain text paragraph splitting, heading detection, virtual paging (`reflowed`), and DOCX zip container validation. |
| `tests/editableTables.test.ts` | Tabular cell edits, row/column addition and deletion, and table dimensions synchronization. |
| `tests/exportBranding.test.ts` | Standardized export filenames, timestamp formatting, path sanitization, and brand headers/footers. |
| `tests/exportMenuAndHighlighting.test.ts` | Editorial palette compliance, export dropdown states, and keyword highlighting range algorithms. |
| `tests/figureOCRAndSearch.test.ts` | Tesseract OCR over extracted figure crops, token indexing, and lexical search against image contents. |
| `tests/figuresExportZip.test.ts` | Minimal store-only ZIP archive generation, CRC32 checksums, and folder hierarchies. |
| `tests/figuresExtraction.test.ts` | PDF embedded raster extraction, vector drawing detection, dimension thresholds (64px), and duplicate hash skipping. |
| `tests/inquiryConversations.test.ts` | Multi-turn conversation state, sidebar thread persistence, thread renaming, and conversation deletion. |
| `tests/inquiryReliability.test.ts` | Gemini prompt escaping, prompt injection defenses, citation token checks, and server rate limiting. |
| `tests/installDialog.test.ts` | PWA installation dialog states, iframe warning notice, platform-specific instructions, and `install()` prompt triggering. |
| `tests/pageThumbnails.test.ts` | 120px thumbnail canvas rasterization, background queue scheduling, and abortive cancelation on document switch. |
| `tests/pdfBufferDetach.test.ts` | Proof that `pdfBytes()` prevents Web Worker ArrayBuffer detachment, preserving non-empty buffers for IndexedDB persistence. |
| `tests/pwaInstallAndOffline.test.ts` | Manifest.json compliance, Service Worker offline precache, and production registration lifecycles. |
| `tests/readerAnnotations.test.ts` | Non-destructive range splitting for overlapping marginalia notes, colors, and Markdown annotation export. |
| `tests/regionCapture.test.ts` | Screen-to-PDF point math across arbitrary zoom levels and 2x native rasterization. |
| `tests/security.test.ts` | HTTP security headers, CSP compliance, CSV formula injection neutralization, and rate limiter enforcement. |
| `tests/tableExtraction.test.ts` | Tabular heuristics from coordinate streams and CSV formatting according to RFC-4180. |

---

## 3. Manual End-to-End Validation Plan

To validate user workflows manually, prepare two sample PDF files:
- **Aurora Report v1** (`Aurora_Energy_Audit_2025.pdf`): Baseline document containing tables, an embedded diagram, and energy metrics.
- **Aurora Report v2** (`Aurora_Energy_Audit_2026.pdf`): Revised edition with updated metrics, new definitions, and an additional summary section.

### Test Procedure

#### Step 1: Ingestion & Duplicate Fingerprinting
1. In the **Library**, drop `Aurora_Energy_Audit_2025.pdf`. Confirm parsing finishes with page count and element badges.
2. Attempt to upload the identical file a second time. Confirm that the **"Duplicate Document Detected"** modal displays the existing document name and SHA-256 fingerprint without creating redundant storage.

#### Step 2: Reader & In-Reader Highlighting
1. Open the document in the **Reader**.
2. Verify page thumbnails load in the left drawer.
3. Select a sentence, choose the **Amber** highlight tag, and type a marginalia note (e.g., `"Review baseline target"`). Confirm the note appears in the right sidebar.
4. Activate the **Capture Region** tool, drag a box around a diagram, and click **Copy**. Verify the clipboard contains the high-res PNG.

#### Step 3: Evidence-Based Search
1. Navigate to **Search** and query `"thermal efficiency"`.
2. Confirm frequency counts and exact-phrase weighting place the most relevant page first.
3. Click the result; confirm the Reader opens with matching terms highlighted in emerald and amber.

#### Step 4: Ask Documents & Citation Provenance
1. Navigate to **Ask Documents**.
2. Enter: `"What was the baseline energy consumption reported in 2025?"`
3. Verify that the generated answer cites supporting evidence with brackets (e.g. `[ev-1]`).
4. Click the `[ev-1]` citation chip. Verify that the Reader instantly jumps to the exact supporting sentence.
5. In the conversation sidebar, rename the thread to `"Aurora Baseline Analysis"`.
6. Click **"Export conversation (Markdown)"** and confirm the downloaded file includes full citation provenance.

#### Step 5: Table Extraction & Safe CSV Export
1. Navigate to **Tables**.
2. Open a detected energy table. Edit a cell value (e.g. change `1200` to `1250`).
3. Click **"Export CSV"**. Open the CSV in a text editor to confirm proper RFC-4180 quoting and absence of unescaped formula characters.

#### Step 6: Figure Extraction & OCR
1. Navigate to **Figures**.
2. Verify that extracted diagrams from the report are displayed with thumbnail previews.
3. Click on a diagram containing text and click **"Run OCR on Figure"**.
4. Confirm that extracted text appears in the figure metadata and is searchable in the main search bar.

#### Step 7: Document Revision Comparison
1. Upload `Aurora_Energy_Audit_2026.pdf`.
2. Navigate to **Compare** and select `Aurora Report v1` on the left and `Aurora Report v2` on the right.
3. Test all four modes:
   - **Concept Comparison**: Inspect cross-document conceptual alignments.
   - **Definition Comparison**: Verify definition shifts are flagged.
   - **Topic Overlap Matrix**: Check the computed Jaccard index.
   - **Content Differences**: Verify added and removed sentences are highlighted with revision colors.
4. Click **Export Menu > Export comparison (PDF)** with **"Include figures"** enabled. Verify the generated PDF embeds figures with provenance labels.

#### Step 8: Backup & Restore
1. Click **Settings > "Export backup"**. Save the JSON file.
2. In the Library, delete `Aurora Report v1`.
3. Click **Settings > "Import backup"**, choose the saved file, and select **"Merge"**.
4. Confirm that `Aurora Report v1` and its marginalia notes are restored cleanly.

#### Step 9: PWA Installation & Offline Resiliency
1. In the header, click **"Install"**.
2. Confirm the three status chips report **Online**, **Offline-ready**, and **Web App**.
3. In Chrome/Edge, click **"Install DocuLens"** to install to your desktop.
4. Turn off Wi-Fi or toggle DevTools to Offline. Refresh the application.
5. Confirm that the application loads, search functions, and stored documents remain fully readable offline.
