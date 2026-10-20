# DocuLens — Local-First Document Intelligence

DocuLens is a minimalist, local-first document intelligence workbench for PDF, DOCX, and TXT ingestion, evidence-based lexical search, citation-verified conversational inquiries, tabular data extraction, and document revision comparison.

Built with an editorial aesthetic, DocuLens prioritizes document provenance, verifiable citations, privacy, and zero-loss local storage.

---

## Architecture Overview

DocuLens operates on a **split-boundary, local-first architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Browser                         │
│  ┌───────────────────┐    ┌───────────────────────────────┐ │
│  │   PDF.js Parser   │───▶│ IndexedDB (doculens_store_v1) │ │
│  │  Signature Check  │    │ - Documents, Chunks, Elements │ │
│  │  Page/Size Limits │    │ - Extracted Tables, Notes     │ │
│  └───────────────────┘    └───────────────────────────────┘ │
│            │                             │                  │
│            ▼                             ▼                  │
│  ┌───────────────────┐    ┌───────────────────────────────┐ │
│  │  Lexical Search   │    │  Deterministic Offline Engine │ │
│  │  BM25-style Rank  │◀───│  Local Citation Extraction    │ │
│  └───────────────────┘    └───────────────────────────────┘ │
└──────────────────────────────────────┬──────────────────────┘
                                       │ (Optional: Question + Excerpts only)
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Stateless Proxy Server                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Express Proxy (2MB Body Cap, 25 req/min, 25s Timeout)  │ │
│  │ Secret Isolation: GEMINI_API_KEY never leaks to client │ │
│  │ Strict Citation Verification & Delimiter Escaping     │ │
│  └───────────────────────────┬────────────────────────────┘ │
└──────────────────────────────┼──────────────────────────────┘
                               ▼
                Google Gemini API (gemini-3.5-flash)
```

1. **Client Sandbox (Browser)**:
   - All PDF parsing, binary signature validation, text extraction, layout reconstruction, and lexical indexing run 100% within the browser.
   - All documents, chunks, extracted tables, and notes are persisted exclusively in client-side IndexedDB (`doculens_store_v1`).
   - Browser Same-Origin Policy (SOP) strictly isolates stored documents from external origins.
   - 100% offline-capable via Service Worker caching and local bundled PDF.js worker.

2. **Stateless Proxy Server (`server.ts`)**:
   - Acts as a secured proxy between the client and Google Gemini (`gemini-3.5-flash`).
   - Keeps `GEMINI_API_KEY` strictly on the server; never exposed to the client bundle or network responses.
   - Enforces strict request body limits (2 MB), sliding-window rate limiting (25 requests/min per IP), and 25-second request timeouts.
   - Sanitizes all errors to ensure internal stack traces, system paths, or environment variables are never leaked.
   - Full PDF files are **never** transmitted to the server or any external API.

3. **Deterministic Offline Fallback**:
   - If the server is offline or no `GEMINI_API_KEY` is configured, DocuLens automatically falls back to an on-device deterministic synthesis engine.
   - Questions are answered by ranking passages, synthesizing extracted findings, and validating citations directly against the local document chunk store.

---

## Core Capabilities

- **Heterogeneous Document Ingestion**:
  - **PDF**: Strict `%PDF-` signature checks, 25 MB file limit, and 500-page limit.
  - **DOCX**: Local parsing via Mammoth without external network requests; blocks encrypted compound binaries.
  - **TXT**: Blank-line paragraph chunking, heading heuristics (ALL CAPS, numbered sections), and virtual pagination (`reflowed` label).
  - **In-Browser OCR**: Scanned PDFs trigger a local Tesseract Web Worker using locally bundled `/eng.traineddata`.
- **Lexical Search & Dynamic In-Reader Highlighting**:
  - BM25-style frequency scoring with 3.0× exact phrase multiplier and heading boosts.
  - In-Reader "Find & Highlight" toolbar with live occurrence counts and auto-scroll.
- **Citation-Verified Conversational Inquiry**:
  - Multi-turn conversation threads with automatic title extraction and history search.
  - Every answer cites verifiable sources with bracketed tokens (`[ev-1]`).
  - Verifies cited quotes verbatim against stored document chunks; flags hallucinations and missing sources.
  - Export full Q&A conversations to Markdown with citation provenance.
- **Table Extraction & Safe Export**:
  - Automatic tabular detection from document coordinates and structures.
  - In-place spreadsheet editor for cell, row, and column manipulation.
  - Export to CSV adhering to RFC-4180 with defense against CSV Formula Injection.
- **Figure Extraction & OCR Lightbox**:
  - Extracts embedded raster figures, vector drawings, and page scans.
  - Runs on-demand OCR over diagrams to index chart text for search.
  - Export all figures in an offline, store-only ZIP archive.
- **4-Mode Document Comparison**:
  - Concept Comparison, Definition Comparison, Topic Overlap Matrix (Jaccard Index), and Content Differences (Revision Diff).
  - Export comprehensive PDF reports with embedded figures or Markdown ZIP archives.
- **Full System Backup & Restore**:
  - Single-file JSON export adhering to schema v1.
  - Atomic transaction restores with "Merge" or "Replace All" conflict handling.
- **Progressive Web App (PWA)**:
  - Installable standalone app on desktop (Chrome, Edge) and mobile (Android, iOS).
  - Versioned service worker cache (`doculens-v1.2.0`) enabling complete offline use.

---

## Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

```bash
# 1. Clone repository
git clone https://github.com/Devputta/DocuLens.git
cd DocuLens

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Optional: Set GEMINI_API_KEY in .env

# 4. Start local development server
npm run dev
```

Visit `http://localhost:3000` to launch DocuLens.

---

## Scripts Table

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts the Express server with live Vite middleware via `tsx server.ts`. |
| `npm start` | Starts the production server (`NODE_ENV=production tsx server.ts`). |
| `npm run build` | Compiles and bundles production client assets into `dist/` with Vite. |
| `npm run preview` | Locally serves the production `dist/` build using Vite preview. |
| `npm run verify` | Complete verification pipeline: runs `lint`, `test`, and `build` in sequence. |
| `npm run clean` | Removes build output directories (`dist/` and `server.js`). |
| `npm run lint` | Runs TypeScript compiler checks without emitting files (`tsc --noEmit`). |
| `npm test` | Runs the complete Vitest test suite (22 files, 199 tests). |

---

## Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Recommended | *(none)* | Google Gemini API key for server-side AI inquiry answering (`gemini-3.5-flash`). If absent, on-device deterministic synthesis is used. |
| `GEMINI_MODEL` | Optional | `gemini-3.5-flash` | The Gemini model used for editorial synthesis. |
| `APP_URL` | Optional | `http://localhost:3000` | Canonical origin URL for self-referential links, PWA scope, and client-server communication. |
| `PORT` | Optional | `3000` | Port for the Express server. Cloud Run injects `8080`. |
| `DEFAULT_APP_PORT`| Optional | `3000` | Fallback port if `PORT` is not specified. |
| `NODE_ENV` | Optional | `development` | Set to `production` to activate Content-Security-Policy headers, compression, and static asset caching. |
| `DISABLE_HMR` | Optional | `false` | Disables Vite file watcher and HMR in development to prevent CPU spikes. |

---

## Technology Stack

- **Client Runtime**: React 19, TypeScript, Vite 8
- **Styling**: Tailwind CSS v4, Editorial dark aesthetic
- **Document Processing**: PDF.js (locally bundled worker), Mammoth (DOCX), Tesseract.js (local OCR)
- **Export Engines**: jsPDF & jsPDF-AutoTable (PDF reports), custom RFC-4180 CSV serializer, store-only ZIP writer
- **Client Database**: Browser IndexedDB (`doculens_store_v1`)
- **Server Runtime**: Express 4, Node.js 22, Compression, Rate Limiting
- **AI Integration**: `@google/genai` (Gemini 2.5 Flash)
- **Testing**: Vitest, fake-indexeddb

---

## Project Structure

```
DocuLens/
├── .dockerignore
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── Dockerfile
├── LICENSE
├── README.md
├── SECURITY.md
├── cloudbuild.yaml
├── package.json
├── package-lock.json
├── server.ts
├── tsconfig.json
├── vite.config.ts
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── PRIVACY.md
│   ├── README.md
│   ├── TESTING.md
│   ├── TROUBLESHOOTING.md
│   └── USER_GUIDE.md
├── public/
│   ├── eng.traineddata
│   ├── favicon.ico
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── components/
│   │   ├── CompareView.tsx
│   │   ├── FiguresView.tsx
│   │   ├── Header.tsx
│   │   ├── InquiryView.tsx
│   │   ├── InstallDialog.tsx
│   │   ├── LibraryView.tsx
│   │   ├── ReaderView.tsx
│   │   ├── SearchView.tsx
│   │   ├── TablesView.tsx
│   │   └── WorkspaceView.tsx
│   ├── hooks/
│   │   └── usePWAInstall.ts
│   ├── services/
│   │   ├── annotationService.ts
│   │   ├── backupService.ts
│   │   ├── captionMatcher.ts
│   │   ├── docxTxtParser.ts
│   │   ├── figureExtractor.ts
│   │   ├── inquiryEngine.ts
│   │   ├── ocrService.ts
│   │   ├── pdfParser.ts
│   │   ├── pdfjsLoader.ts
│   │   ├── regionCapture.ts
│   │   ├── storage.ts
│   │   ├── tableExport.ts
│   │   ├── thumbnailService.ts
│   │   └── zipWriter.ts
│   ├── types/
│   │   └── doculens.ts
│   └── utils/
│       ├── bytes.ts
│       └── exportBranding.ts
└── tests/
    ├── backupRestore.test.ts
    ├── citationNavigationAndOCR.test.ts
    ├── comparisonAndHighlighting.test.ts
    ├── documentManagement.test.ts
    ├── docxTxtIngestion.test.ts
    ├── editableTables.test.ts
    ├── exportBranding.test.ts
    ├── figureOCRAndSearch.test.ts
    ├── figuresExtraction.test.ts
    ├── inquiryConversations.test.ts
    ├── installDialog.test.ts
    ├── pdfBufferDetach.test.ts
    ├── pwaInstallAndOffline.test.ts
    ├── readerAnnotations.test.ts
    ├── regionCapture.test.ts
    └── security.test.ts
```

---

## Documentation Index

Explore the complete technical and operational documentation:

* **[Documentation Index](docs/README.md)** — Master index for all guides and specifications.
* **[Architecture Specification](docs/ARCHITECTURE.md)** — Client/server split, IndexedDB schemas, ingestion pipeline, search, and citations.
* **[User Guide](docs/USER_GUIDE.md)** — Step-by-step feature workflows for every analytical view.
* **[Deployment Guide](docs/DEPLOYMENT.md)** — Local execution, Docker, Google Cloud Run, and checklists.
* **[Testing Guide](docs/TESTING.md)** — Vitest suite directory and manual validation protocols.
* **[Privacy & Data Architecture](docs/PRIVACY.md)** — Client sandbox boundaries and zero-retention guarantees.
* **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** — Solutions for common operational challenges.
* **[Security Policy](SECURITY.md)** — Threat modeling, reporting process, CSP, and defenses.
* **[Contributing Guide](CONTRIBUTING.md)** — Development standards and pull request criteria.
* **[Changelog](CHANGELOG.md)** — Release history and unreleased development notes.
* **[Code of Conduct](CODE_OF_CONDUCT.md)** — Community standards and enforcement contacts.
