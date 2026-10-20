# DocuLens Security Policy & Threat Model

DocuLens is an editorial, local-first document intelligence workbench designed for confidential document analysis, lexical search, verified question answering, and tabular data extraction.

This document details our vulnerability reporting process, threat model, security controls, dependency audit, verified mitigations, and architectural guardrails.

---

## 1. Vulnerability Reporting Process

If you discover a security vulnerability or potential exposure in DocuLens, please report it responsibly:

- **Security Contact**: Contact the maintainers via email at `security@doculens.local` or submit a private security advisory on the GitHub repository.
- **Required Details**:
  - Description of the vulnerability and attack scenario.
  - Minimal reproducible example (sample PDF, malicious input payload, or reproduction script).
  - Affected components (`server.ts`, `pdfParser.ts`, `docxTxtParser.ts`, `tableExport.ts`, `inquiryEngine.ts`, `storage.ts`).
  - Operating environment, browser, and version.
- **Response Commitment**:
  - Initial acknowledgment: within **48 hours**.
  - Assessment and status update: within **5 business days**.
  - Responsible disclosure: We request reasonable time to remediate any verified issue before public disclosure.

---

## 2. Threat Model & Architecture

DocuLens employs a **defense-in-depth, local-first architecture**. We do not assume that running locally eliminates security risks.

### A. Local-First Client Boundary (Browser Sandbox)
- **Document Processing**: 100% of PDF, DOCX, and TXT file ingestion, parsing, OCR text extraction, element hierarchy construction, lexical chunking, and table extraction run inside the user's browser sandbox.
- **Storage Isolation**: Stored documents, chunks, tables, and notes are persisted exclusively in client-side IndexedDB (`doculens_store_v1`).
- **Origin Sandboxing**: IndexedDB is isolated per-origin (`scheme + host + port`) under the browser's Same-Origin Policy (SOP). Documents cannot be read cross-origin or by other browser profiles.
- **Zero Cloud Storage**: DocuLens has no server-side document database, cloud object storage, tracking cookies, or user telemetry.

### B. Remote AI Boundary & Stateless Server Proxy
- **Stateless Proxy**: The server (`server.ts`) operates strictly as a stateless proxy for Google Gemini (`gemini-3.5-flash`). It never persists, caches, or logs user documents or queries to disk.
- **Data Minimization**: Full PDF files are **never** transmitted to the server or any external API. When remote AI is enabled, only the user's question string and the top-ranked retrieved excerpt passages are transmitted.
- **Server-Only API Keys**: Provider credentials (`GEMINI_API_KEY`) reside exclusively in server environment variables. They are never bundled into frontend assets, emitted in health responses, or written to client-visible logs.
- **Deterministic Offline Fallback**: If the server is unreachable, the network is offline, or the API key is unconfigured, DocuLens seamlessly falls back to 100% on-device deterministic synthesis and citation verification.

### C. Untrusted Document Text & Prompt Injection Defense
- **Untrusted Input Classification**: All PDF binary content, extracted strings, and document metadata are treated strictly as untrusted input.
- **Instruction Boundaries**: When generating AI synthesis, evidence excerpts are encapsulated in explicit `<untrusted_document_context>` tags.
- **Sanitization & Command Neutralization**:
  - Closing delimiter tags (`</untrusted_document_context>`) within quotes are escaped.
  - System tags (`<system>`, `<instruction>`, `<override>`) and override command markers (e.g., `SYSTEM OVERRIDE`, `IGNORE PREVIOUS INSTRUCTIONS`) are stripped and neutralized.
  - System prompts instruct the model that document text must not override system instructions, execute commands, or authorize external tool use.
- **Provenance & Citation Verification**: Citations are verified byte-for-byte against stored document chunks. Fabricated citation IDs, out-of-bounds page numbers, and altered quotes are rejected both on the server and on the client.

### D. Spreadsheet Formula Injection Defense (CSV Export)
- **RFC-4180 & OWASP Compliance**: Extracted tables exported to CSV are guarded against formula injection (CSV macro exploits).
- **Dangerous Character Mitigation**: Any cell starting with dangerous prefix characters (`=`, `+`, `-`, `@`, `\t`, `\r`, `%`, `|`) that is not a legitimate pure number is prefixed with a single quote (`'`) and double-quoted per RFC-4180.
- **Filename Sanitization**: Table titles and export filenames are sanitized to prevent directory traversal (`../`) and illegal filesystem characters.

### E. Server Request Limits & Denial of Service (DoS) Defense
- **Payload Size Limits**: Express request body parser is strictly bounded to **2 MB** (preventing memory exhaustion attacks).
- **In-Memory Rate Limiting**:
  - `/api/inquiry`: Maximum **25 requests per minute** per client IP.
  - `/api/validate-citations`: Maximum **60 requests per minute** per client IP.
  - Returns HTTP `429 Too Many Requests` with a `Retry-After` header when exceeded.
- **Reverse Proxy Client IP Trust**: Configured with `app.set('trust proxy', 1)` to prevent rate limit spoofing behind Cloud Run and reverse proxies.
- **Request Timeout**: AI synthesis requests are bounded by a strict **25-second timeout**. If the remote provider hangs, the connection is aborted and returns HTTP `504 Gateway Timeout`.
- **Information Leakage Prevention**:
  - Catch blocks return sanitized, generic error codes (`SYNTHESIS_ERROR`, `VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`).
  - Stack traces, internal filesystem paths, node module internals, and environment variables are never returned in HTTP responses.
- **Defensive HTTP Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **Content-Security-Policy (CSP)** (Enforced in Production):
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'self' https://aistudio.google.com https://*.google.com;
  ```

---

## 3. Document Deletion Scope & Interrupted Operations

DocuLens provides verifiable, deterministic document deletion:

1. **Deletion Scope**:
   - Deleting a document removes the document record and cascades to all associated records: layout elements, text chunks, extracted tables, and marginalia notes.
   - Deletion occurs immediately in the local IndexedDB.
   - Because the DocuLens server does not maintain server-side document copies, there are no remote or shadow backups to delete.
2. **Interrupted Deletion & Orphan Recovery**:
   - Multi-store deletions are executed within an atomic IndexedDB readwrite transaction.
   - In case of abnormal browser termination mid-operation, the Settings view provides a **"Verify Storage Integrity & Purge Orphaned Chunks"** routine (`storage.cleanupOrphanedRecords()`) to detect and purge any orphaned chunks, elements, tables, or notes.
