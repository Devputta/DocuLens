DocuLens Synthetic PDF Test Pack

Files:
- Document A: definitions, algorithm steps, repeated search terms, tables, evidence passages.
- Document B: related concepts using different terminology, designed for comparison.
- Document C: punctuation, Unicode, tables, security notes, manual QA checklist.

Suggested test:
1. Upload all three PDFs.
2. Search computer, algorithm, data, then multiple terms together.
3. Use Inspect in Reader and verify document/page navigation and distinct highlight colours.
4. Compare A and B using content differences, concept comparison, definition comparison, and topic overlap.
5. Check every finding against source text and page numbers.
6. Export tables and check formula-like values are treated as untrusted text.
7. Delete documents and reload to verify persistence and no unwanted sample reseeding.

Limitations:
- PDFs contain selectable text; they do not test OCR on scanned pages.
- They do not simulate encrypted, malformed, or oversized PDFs.
- =1+1 is included as a synthetic CSV formula-injection test string.
- Content is fictional and not professional advice.
