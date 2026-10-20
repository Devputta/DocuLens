# DocuLens System Architecture

DocuLens is built upon a **strict client-server boundary with local-first authority**. All primary document processing, layout parsing, lexical indexing, tabular extraction, and storage are executed entirely within the user's browser sandbox. The server functions exclusively as a stateless, non-retaining AI proxy and citation validation guardrail.

---

## 1. Client-Server Architecture & Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Client Sandbox (Browser)                          │
│                                                                         │
│  ┌───────────────────────┐         ┌─────────────────────────────────┐  │
│  │ Ingestion Pipeline    │         │ Client Storage (IndexedDB)      │  │
│  │ - PDF.js (Local MJS)  │────────▶│ - documents, elements, chunks   │  │
│  │ - Mammoth (DOCX)      │         │ - tables, figures, notes        │  │
│  │ - TXT Heuristics      │         │ - pdf_sources, conversations    │  │
│  │ - Tesseract.js (OCR)  │         │ - inquiries, thumbnails         │  │
│  └───────────────────────┘         └─────────────────────────────────┘  │
│             │                                       │                   │
│             ▼                                       ▼                   │
│  ┌───────────────────────┐         ┌─────────────────────────────────┐  │
│  │ Lexical BM25 Engine   │         │ Deterministic Offline Engine    │  │
│  │ - Exact Phrase Bonus  │◀────────│ - Local Evidence Ranking        │  │
│  │ - Token Inverted Index│         │ - Verbatim Quote Matching       │  │
│  └───────────────────────┘         └─────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Only when online & configured:
                                     │ Query + Top Evidence Excerpts ONLY
                                     │ (Raw document binaries NEVER sent)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Stateless Server Proxy                             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Express Proxy (`server.ts`)                                       │  │
│  │ - Compression & Trust Proxy (Cloud Run Ingress)                   │  │
│  │ - Rate Limiting (25 req/min inquiry, 60 req/min validation)       │  │
│  │ - 2MB Body Limit & 25s Execution Timeout                          │  │
│  │ - Server Secret Isolation (GEMINI_API_KEY never leaks to client)   │  │
│  │ - Strict Citation Validation Endpoint (`/api/validate-citations`)  │  │
│  │ - Health & Privacy Endpoints (`/api/health`, `/api/privacy-status`)│  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────────────┼────────────────────────────────────┘
                                     ▼
                      Google Gemini API (gemini-3.5-flash)
```

### Trust Boundary Principles
1. **Raw Binaries Never Leave the Device**: Neither original PDF files, DOCX packages, nor raw text documents are ever transmitted over the network.
2. **Local Authority**: Document IDs, chunk IDs, element coordinates, and extracted tables originate in the client.
3. **Stateless Server**: The Express server never writes to disk, maintains no database connection, and logs zero user document contents.
4. **Data Minimization**: AI synthesis requests transmit solely the sanitized question string and the top-ranked text chunks (bounded by token caps).

---

## 2. IndexedDB Storage Schemas (`doculens_store_v1`)

All persistence runs in client IndexedDB (`doculens_store_v1`). Ten dedicated object stores guarantee relational integrity without external database overhead:

| Store Name | Key Path | Indices | Description |
| :--- | :--- | :--- | :--- |
| `documents` | `id` | `by_sha256`, `by_created` | Metadata records for uploaded documents (name, SHA-256, page count, OCR status). |
| `elements` | `id` | `by_doc`, `by_page`, `by_doc_page` | Structural layout elements (paragraphs, headings, tables, lists) with bounding boxes. |
| `chunks` | `id` | `by_doc`, `by_page` | Overlapping lexical retrieval units (~400–600 tokens) linked to source elements. |
| `tables` | `id` | `by_doc`, `by_page` | Extracted tabular records (headers, cell matrices, row/col counts, confidence). |
| `notes` | `id` | `by_doc`, `by_page` | User marginalia notes attached to exact document offsets or selected text regions. |
| `pdf_sources` | `id` | *(none)* | Original binary document buffers (`ArrayBuffer`/`Blob`) for rendering and capture. |
| `conversations`| `id` | `by_updated` | Multi-turn inquiry conversation threads with title, document scope, and history. |
| `inquiries` | `id` | `by_doc`, `by_conv` | Cached question-and-answer pairs with citation validation metadata and evidence IDs. |
| `figures` | `id` | `by_doc`, `by_page` | Extracted raster images, vector drawings, or scan crops with caption associations. |
| `thumbnails` | `id` | `by_doc` | Cached 120px WebP/PNG page thumbnails rendered in the background for quick navigation. |

---

## 3. Ingestion Pipeline

DocuLens supports heterogeneous document formats through a unified ingestion pipeline:

```
[Uploaded File] ──▶ File Type Detection & Signature Check
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
  PDF Handler         DOCX Handler        TXT Handler
  - %PDF- magic bytes - PK\x03\x04 zip    - Blank line split
  - pdfjsLoader       - Mammoth parse     - Heading heuristics
  - Text Layer Check  - Virtual paging    - Virtual paging (~3000 ch)
       │                   │                   │
       ▼                   │                   │
  [Zero Text?]             │                   │
  ├── Yes ──▶ OCR Prompt   │                   │
  └── No  ──▶ Extract Text │                   │
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
              Hierarchy Construction (Elements)
                           │
                           ▼
          Provenance Chunking (400-600 tokens)
                           │
                           ▼
             Persist to IndexedDB & Index
```

### Format Specifications
- **PDF**: Validated against `%PDF-` binary magic bytes. Checked against a 25 MB file size limit and 500-page ceiling. If zero extractable text characters are found, the user is offered privacy-first in-browser OCR.
- **DOCX**: Verified against ZIP magic bytes `0x50 0x4B 0x03 0x04`. Encrypted Compound Binary containers (`0xD0 0xCF 0x11 0xE0`) are safely rejected. Parsed locally using Mammoth without external network requests.
- **TXT**: Split at blank line boundaries into discrete paragraphs. Automatically recognizes headings (ALL CAPS, numbered `1. `, or short unpunctuated lines) and paginates into virtual pages (~3,000 characters) marked with a `"reflowed"` tag.
- **OCR (Tesseract.js)**: Runs inside a dedicated Web Worker using locally bundled `/eng.traineddata`. Processes one page at a time with live progress, user cancelation, and average confidence score tracking.

---

## 4. Lexical Search & BM25-Style Ranking

Search executes 100% locally in the browser using an in-memory inverted index:
1. **Tokenization & Normalization**: Strips diacritics, punctuation, and downcases query terms.
2. **Term Frequency Weighting**: Calculates term density within each candidate chunk.
3. **Exact Phrase Multiplier**: Bestows an automatic 3.0× score multiplier to chunks containing the exact phrase in order.
4. **Header Bonus**: Chunks derived from heading elements (`heading-1`, `heading-2`) receive an additional relevance boost.
5. **Dynamic Highlighting**: Returns precise text ranges for primary and secondary query terms for rendering inside the document reader.

---

## 5. Citation Verification & Fact Provenance

DocuLens enforces **strict, byte-level citation provenance**:
1. Every answer synthesized by Gemini or the local engine must cite evidence using bracketed tokens: `[ev-1]`, `[ev-2]`.
2. Each cited evidence ID references an exact `chunkId`, `documentId`, `pageNumber`, and verbatim `quote`.
3. The verification algorithm checks:
   - Does `documentId` exist in the local database?
   - Is `pageNumber` valid and within document boundaries?
   - Does the cited `quote` exist verbatim (or within a 92% fuzzy token match threshold) in the designated chunk text?
4. Any citation failing these checks is marked as **Unverified** with an explicit rejection badge, and direct jump navigation is disabled.

---

## 6. Document Comparison Engine

The comparison engine performs side-by-side analysis between two selected documents across four distinct lenses:
1. **Concept Comparison**: Aligns abstract topics across authorial terminology variations (e.g., comparing "stored-program computer" in Doc A with "digital processing unit" in Doc B).
2. **Definition Comparison**: Extracts regulatory, clinical, or technical definitions and highlights scope differences.
3. **Topic Overlap Matrix**: Computes shared and unique topics using a mathematically documented Jaccard similarity index:
   $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
4. **Content Differences (Revision Diff)**: Sentence-level diff identifying insertions, deletions, and modifications between document versions.
