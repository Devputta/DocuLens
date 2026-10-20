# DocuLens User Guide

Welcome to DocuLens! This guide explains every feature, navigation view, and workflow available in the workbench.

---

## 1. Interface Overview & Navigation

The primary navigation bar provides instant access to the core analytical views:

| View | Icon | Purpose |
| :--- | :--- | :--- |
| **Library** | `FileText` | Manage uploaded documents, view metadata, monitor storage usage, and upload new files. |
| **Reader** | `BookOpen` | Read documents with high-fidelity rendering, page thumbnails, text selection, and marginalia notes. |
| **Search** | `Search` | Fast token and phrase lexical search with live frequency counts and click-to-page navigation. |
| **Ask Documents** | `MessageSquare` | Multi-turn conversational question answering with byte-verified citations and provenance links. |
| **Tables** | `Table` | View and edit detected tabular datasets with formula-safe CSV, JSON, and Markdown export. |
| **Figures** | `Image` | Inspect embedded images, vector diagrams, and page scans with OCR search and lightbox inspection. |
| **Compare** | `GitCompare` | Side-by-side document revision analysis across 4 comparative lenses. |
| **Settings** | `Settings` | Inspect IndexedDB storage metrics, configure API keys, export backups, and run integrity checks. |

---

## 2. Ingesting Documents (PDF, DOCX, TXT)

### Drag-and-Drop & File Picker
- Drag files directly onto the ingestion zone in the **Library** or click **"Choose Document to Ingest"**.
- Supported file types: `.pdf`, `.docx`, and `.txt`.
- Limits: Maximum **25 MB** file size and **500 pages** per document.

### Duplicate Fingerprint Detection
When uploading a file whose SHA-256 binary hash matches an existing document in your library, DocuLens displays a non-destructive warning modal:
- **Replace Existing**: Deletes the older record and ingests the new file.
- **Cancel**: Keeps the existing record intact without duplicate storage waste.

### Zero-Text Scanned PDF Detection & OCR
If you upload a scanned PDF without an embedded text layer:
1. DocuLens detects zero text characters and presents the **OCR In-Browser Processing Prompt**.
2. Click **"Run Local OCR"** to launch the on-device Tesseract Web Worker.
3. Live progress reports current page numbers and extraction confidence percentages.
4. You may cancel at any time via **"Cancel OCR"**.
5. Alternatively, click **"Proceed Without OCR"** to store the document as an image-only scan.

---

## 3. Reading Documents & Marginalia Notes

- **Thumbnails Sidebar**: Expand the left thumbnail drawer to preview pages and jump instantly.
- **Zoom & Page Controls**: Adjust zoom from 50% to 200% or fit to page width.
- **Reflowed Badging**: For TXT and DOCX files, virtual page headers display a clean `reflowed` label to indicate that pagination is synthetic.
- **Marginalia Notes**:
  - Select text on any page and choose a highlight color (`Amber`, `Emerald`, `Blue`, `Violet`).
  - Attach a private note. Notes appear in the right-hand marginalia sidebar and are exportable to Markdown.
- **Region Capture**:
  - Click the **Capture Region** tool in the Reader toolbar.
  - Drag a box over any diagram, equation, or paragraph.
  - Copy the 2x high-resolution crop to your clipboard or download it as a PNG image.

---

## 4. Evidence-Based Lexical Search

- Enter keywords or exact phrases in quotes (e.g., `"thermal efficiency"`).
- Filter search scope by document or search across the entire library.
- Click any search result to jump directly to the target page and element inside the Reader.
- The Reader automatically illuminates matching terms using multi-color keyword highlighting.

---

## 5. Ask Documents (Conversational Intelligence)

- **Multi-Turn Inquiries**: Ask technical, clinical, or comparative questions across your documents.
- **Conversation Management**:
  - Conversations are retained in the sidebar with automatic title extraction and timestamps.
  - Create new conversations, rename threads, or delete historical inquiries.
  - Search through past conversation history using the live filter input.
- **Provenance Citations**:
  - Answers cite verifiable sources using brackets (e.g. `[ev-1]`).
  - Click any citation chip to jump directly to the exact page and paragraph in the Reader.
  - Hover over a citation to inspect the verbatim supporting quote.
  - If a source document was deleted, the citation clearly indicates **"source removed"**.
- **Markdown Export**: Click **"Export conversation (Markdown)"** to download the complete Q&A record with full citation evidence.

---

## 6. Table Extraction & Safe CSV Export

- DocuLens identifies tabular data from PDF layout coordinates, DOCX tables, and text tables.
- **Editable Tables**: Click any table to open the editor. Add, edit, or remove rows and columns.
- **Export Formats**:
  - **CSV (RFC-4180)**: Includes automatic defenses against Spreadsheet Formula Injection by prefixing formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`, `%`, `|`) with single quotes.
  - **JSON**: Clean structured array format.
  - **Markdown**: Formatted ASCII table blocks.

---

## 7. Figure Extraction & Lightbox

- Automatically extracts raster graphics, charts, and vector diagrams from documents.
- **Optical Character Recognition (OCR) on Figures**: Run on-demand OCR on diagrams and charts to make text within images searchable.
- **Lightbox**: Click any figure thumbnail to open the pan-and-zoom modal.
- **ZIP Export**: Download all extracted figures for a document in an offline, store-only ZIP archive.

---

## 8. Document Comparison Workspace

Compare two documents side-by-side using four distinct modes:
1. **Concept Comparison**: Discovers related concepts described with differing terminology.
2. **Definition Comparison**: Extracts formal definitions and flags scope discrepancies.
3. **Topic Overlap Matrix**: Displays shared and unique topics with Jaccard similarity metrics.
4. **Content Differences (Revision Diff)**: Highlights added, deleted, and modified sentences between document editions.

### Exporting Comparison Reports
- **PDF Report**: Formatted multi-page PDF using jsPDF with DocuLens branding, headers, footers, page-break protections, and an optional **"Include figures"** selector.
- **Markdown & ZIP**: Clean Markdown summary or complete ZIP archive containing the Markdown file and linked `./doculens_figures/` images.

---

## 9. Backup & Restore

Protect your library and synchronize between devices without cloud reliance:
- Open the **Install / Download** dialog or **Settings** view.
- Click **"Download my data backup"**.
- Saves a single validated JSON file containing all documents, chunks, elements, tables, marginalia notes, and conversation threads.
- When restoring, choose:
  - **Merge**: Adds new documents and non-conflicting items.
  - **Replace All**: Safely purges and replaces the library after explicit confirmation.

---

## 10. Installing as a Standalone App (PWA)

DocuLens is a fully compliant Progressive Web App (PWA):
1. Click the **"Install"** button in the header to open the `InstallDialog`.
2. Inspect the live status chips: **Online/Offline**, **Offline-ready**, and **Installed**.
3. If supported by your browser (Chrome/Edge/Android), click **"Install DocuLens"** to install directly.
4. If running in Safari or unsupported browsers, follow the platform-specific instructions (e.g. Share > "Add to Home Screen" on iOS, File > "Add to Dock" on macOS Safari).
5. If running inside the AI Studio preview iframe, click **"Open in new tab"** to launch the top-level app where PWA installation is enabled.
6. Once installed, DocuLens launches in a dedicated, distraction-free application window with full offline access.
