# DocuLens Privacy Architecture & Data Policy

DocuLens is built upon the philosophy of **computational privacy by default**. We believe that confidential agreements, financial records, medical protocols, and proprietary engineering designs should never be stored on third-party servers.

---

## 1. Summary of Data Boundaries

| Data Category | Where It Lives | Ever Transmitted to Server? | Ever Stored on Cloud? |
| :--- | :--- | :--- | :--- |
| **Original PDF / DOCX / TXT Files** | Browser IndexedDB (`pdf_sources`) | **Never** | **Never** |
| **Extracted Text Elements & Layout** | Browser IndexedDB (`elements`) | **Never** | **Never** |
| **Lexical Search Inverted Index** | Browser In-Memory Cache | **Never** | **Never** |
| **Extracted Tables & Spreadsheets** | Browser IndexedDB (`tables`) | **Never** | **Never** |
| **Extracted Figures & Diagrams** | Browser IndexedDB (`figures`) | **Never** | **Never** |
| **User Marginalia Notes & Highlights** | Browser IndexedDB (`notes`) | **Never** | **Never** |
| **Conversation Threads & History** | Browser IndexedDB (`conversations`) | **Never** | **Never** |
| **User Inquiry Questions** | Ephemeral Transit to Server | **Yes** (when remote AI enabled) | **Never** (Zero retention) |
| **Retrieved Evidence Excerpts** | Ephemeral Transit to Server | **Yes** (selected quotes only) | **Never** (Zero retention) |

---

## 2. What Stays Exclusively in the Browser

All core functionality runs completely offline inside your browser sandbox:
- **PDF Layout Parsing**: Page streams and glyph positions are decoded inside an in-browser Web Worker using PDF.js.
- **DOCX Processing**: Word processing packages are unzipped and translated directly in the client using Mammoth.
- **Local OCR**: When processing scanned PDFs or figures, Tesseract.js executes inside a local Web Worker using `/eng.traineddata` served from your origin.
- **Storage Isolation**: Stored records are written to IndexedDB (`doculens_store_v1`). Under the web's **Same-Origin Policy (SOP)**, no other website or external script can access your stored documents.

---

## 3. What Is Transmitted During AI Inquiries

When you submit a question in **Ask Documents** and the remote AI provider is enabled:

1. **Local Lexical Retrieval First**: The browser performs a local BM25 search to identify the top 3–5 most relevant text chunks (maximum ~1,500 tokens).
2. **Payload Minimization**: The browser transmits an HTTP POST request to `/api/inquiry` containing:
   - Your question string.
   - The selected excerpt text quotes.
   - Associated document IDs and page numbers for citation tracking.
3. **What is NEVER Sent**:
   - The original PDF binary file.
   - Unrelated pages or paragraphs from your documents.
   - Other documents in your library.
   - Marginalia notes or private highlights.

---

## 4. Server-Side Zero-Retention Guarantee

The DocuLens server (`server.ts`) operates as a **strictly stateless proxy**:
- **Zero Disk Writes**: The server has no database, no file storage, and no cache on disk.
- **Zero Query Logging**: Neither user questions, document text, nor AI responses are logged to server console or disk.
- **In-Memory Lifespan**: Request payloads exist solely in RAM for the duration of the HTTP connection (typically 1–3 seconds) and are immediately garbage collected.
- **Transparent Audit Endpoint**: You can query the live server privacy status at any time:
  ```bash
  curl http://localhost:3000/api/privacy-status
  ```
  Returns:
  ```json
  {
    "serverStorage": "none",
    "serverDocumentRetention": "zero (stateless proxy)",
    "rateLimitWindowSeconds": 60,
    "maxInquiryPayloadBytes": "2mb",
    "requestTimeoutSeconds": 25,
    "remoteAiProvider": "Google Gemini (gemini-3.5-flash)",
    "dataTransmittedToProvider": "Query string and selected retrieved excerpt quotes only (no full PDF binaries)",
    "browserStorageTechnology": "IndexedDB (Origin-isolated via Same-Origin Policy)"
  }
  ```

---

## 5. Offline Fallback Mode

If you disconnect your computer from the internet or run DocuLens without a `GEMINI_API_KEY`:
- DocuLens switches automatically to its **Deterministic On-Device Synthesis Engine**.
- Responses are generated and verified entirely inside your browser JavaScript runtime with **zero network packets transmitted**.
