import { describe, it, expect } from 'vitest';
import {
  generateFigureFilename,
  buildMarkdownWithFigures,
  createComparisonZipArchive,
  calculateFiguresTotalSize,
  checkFigureSplitAndAddPage,
  MAX_EXPORT_FIGURES,
  ExportableFigure,
} from '../src/services/comparisonFigureExport';
import { parseZipStructure, createStoreZipBlob } from '../src/services/zipWriter';

const mockFigure1: ExportableFigure = {
  id: 'fig-battery-1234',
  documentId: 'doc-a',
  docLabel: 'Doc A',
  docName: 'Energy Audit 2025.pdf',
  pageNumber: 3,
  width: 800,
  height: 600,
  imageBlob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: 'image/png' }),
  thumbnailBlob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
  hash: 'hash-fig-1',
  caption: 'Grid-scale battery installation trends across utility regions',
  captionLabel: 'Figure 1',
  createdAt: Date.now(),
};

const mockFigure2: ExportableFigure = {
  id: 'fig-flow-5678',
  documentId: 'doc-b',
  docLabel: 'Doc B',
  docName: 'Energy Audit Revision 2026.pdf',
  pageNumber: 5,
  width: 1024,
  height: 768,
  imageBlob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])], { type: 'image/png' }),
  thumbnailBlob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
  hash: 'hash-fig-2',
  caption: 'Transmission interconnection queuing delays',
  captionLabel: 'Chart 2',
  createdAt: Date.now(),
};

describe('Figures Export & ZIP Archive Engine (Requirement 6)', () => {
  it('generates standardized, deterministic filenames for exported figures', () => {
    const filenameA = generateFigureFilename('Doc A', 3, 'fig-battery-1234');
    expect(filenameA).toBe('doc_a_p3_figbatte.png');

    const filenameB = generateFigureFilename('Doc B', 5, 'fig-flow-5678');
    expect(filenameB).toBe('doc_b_p5_figflow5.png');
  });

  it('builds Markdown report with ./doculens_figures/<name>.png references and provenance labels', () => {
    const baseMarkdown = '# Comparison Report\n\nExecutive Summary of findings.\n';
    const { markdown, figureRefs } = buildMarkdownWithFigures(baseMarkdown, [mockFigure1, mockFigure2]);

    expect(markdown).toContain('## 6. Visual Figures & Exhibits');
    expect(markdown).toContain('./doculens_figures/doc_a_p3_figbatte.png');
    expect(markdown).toContain('./doculens_figures/doc_b_p5_figflow5.png');
    expect(markdown).toContain('Doc A (Energy Audit 2025.pdf), Page 3');
    expect(markdown).toContain('Doc B (Energy Audit Revision 2026.pdf), Page 5');

    expect(figureRefs.length).toBe(2);
    expect(figureRefs[0].filename).toBe('doc_a_p3_figbatte.png');
    expect(figureRefs[1].filename).toBe('doc_b_p5_figflow5.png');
  });

  it('packages comparison Markdown and figures into a valid store-only ZIP archive', async () => {
    const markdown = '# Comparison Report\n\n![Figure 1](./doculens_figures/doc_a_p3_figbatte.png)\n';
    const figureEntries = [
      {
        filename: 'doc_a_p3_figbatte.png',
        blob: mockFigure1.imageBlob,
      },
      {
        filename: 'doc_b_p5_figflow5.png',
        blob: mockFigure2.imageBlob,
      },
    ];

    const zipBlob = await createComparisonZipArchive(markdown, figureEntries);
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(100);

    const buffer = await zipBlob.arrayBuffer();
    const structure = parseZipStructure(buffer);

    expect(structure.valid).toBe(true);
    expect(structure.fileCount).toBe(3);
    expect(structure.filenames).toContain('comparison_report.md');
    expect(structure.filenames).toContain('doculens_figures/doc_a_p3_figbatte.png');
    expect(structure.filenames).toContain('doculens_figures/doc_b_p5_figflow5.png');
  });

  it('calculates total size and flags warning threshold when exceeding 5 MB', () => {
    // Normal small figures
    const normal = calculateFiguresTotalSize([mockFigure1, mockFigure2]);
    expect(normal.isOverWarningThreshold).toBe(false);

    // Large figure exceeding 5 MB (6 MB blob)
    const largeBlob = new Blob([new Uint8Array(6 * 1024 * 1024)]);
    const warningResult = calculateFiguresTotalSize([{ imageBlob: largeBlob }]);
    expect(warningResult.isOverWarningThreshold).toBe(true);
    expect(warningResult.formattedSize).toContain('6.0 MB');
  });

  it('enforces figure split check logic so figures are never split across PDF pages', () => {
    const pageHeight = 842; // A4 height in pts
    const margin = 36;
    const figureHeight = 350;

    // With plenty of space left on page (currentY = 100), should NOT add page
    const noSplit = checkFigureSplitAndAddPage(100, figureHeight, pageHeight, margin, margin);
    expect(noSplit.shouldAddPage).toBe(false);
    expect(noSplit.nextY).toBe(100);

    // Near the bottom (currentY = 600 + figureHeight 350 > 842 - 45), MUST add new page
    const mustSplit = checkFigureSplitAndAddPage(600, figureHeight, pageHeight, margin, margin);
    expect(mustSplit.shouldAddPage).toBe(true);
    expect(mustSplit.nextY).toBe(margin); // Reset to top margin on new page
  });

  it('verifies max 20 figure selection limit constant', () => {
    expect(MAX_EXPORT_FIGURES).toBe(20);
  });
});
