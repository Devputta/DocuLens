# DocuLens Documentation Index

Welcome to the comprehensive documentation suite for DocuLens. Use the index below to navigate the guides, architecture specifications, deployment procedures, and testing plans.

---

## Technical & Architecture Documentation

* **[Architecture Specification](./ARCHITECTURE.md)**  
  Detailed system design, client-server trust boundaries, IndexedDB schema definitions (`doculens_store_v1`), ingestion pipeline stages (PDF, DOCX, TXT, OCR), BM25 lexical ranking, and citation verification algorithms.

* **[Privacy & Data Boundary Architecture](./PRIVACY.md)**  
  Comprehensive breakdown of what data lives exclusively in the client, what minimal excerpt tokens are transmitted to the server proxy, stateless zero-retention guarantees, and origin sandboxing.

* **[Troubleshooting Guide](./TROUBLESHOOTING.md)**  
  Diagnostic steps and resolutions for ArrayBuffer detachment, Vite HMR WebSocket proxy rejections, PWA installation hurdles, local OCR language assets, and rate limits.

---

## Operations, Testing & Deployment

* **[Deployment Guide](./DEPLOYMENT.md)**  
  End-to-end instructions for running locally, multi-stage Docker containerization (`node:22-slim`), Google Cloud Run deployment, generic Node hosts, health monitoring, and pre/post-deploy checklists.

* **[Testing & Quality Assurance Guide](./TESTING.md)**  
  Vitest test suite mapping across all 22 test files (199 tests), verification command workflows, and a step-by-step manual validation protocol using sample energy audit reports.

---

## User & Community Guides

* **[User Guide](./USER_GUIDE.md)**  
  Feature-by-feature operational walkthrough covering Library ingestion, Reader annotations, Region Capture, Evidence Search, Ask Documents inquiries, Table editor & safe export, Figure OCR, and Side-by-Side Comparison.

* **[Security Policy & Threat Model](../SECURITY.md)**  
  Vulnerability reporting protocol, threat modeling, Content-Security-Policy (CSP) headers, prompt injection boundaries, and CSV formula injection defenses.

* **[Contributing Guide](../CONTRIBUTING.md)**  
  Development setup, commit conventions, verification gates, and step-by-step guidelines for implementing and testing new services.

* **[Changelog](../CHANGELOG.md)**  
  Detailed release history and unreleased development milestones adhering to Keep a Changelog.

* **[Code of Conduct](../CODE_OF_CONDUCT.md)**  
  Contributor Covenant 2.1 community pledge and standards.
