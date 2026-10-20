import { describe, it, expect } from 'vitest';
import {
  extractPageLayoutAndTables,
  PDFTextItemLike,
  validatePDFHeader,
} from '../src/services/pdfParser';

describe('Table Extraction & Layout Analysis Suite', () => {
  it('extracts cleanly aligned multi-column table with headers and data rows', () => {
    // Synthetic PDF text stream items representing a 3-column algorithm complexity table
    const items: PDFTextItemLike[] = [
      // Table Title
      { str: 'Table 1: Computational Complexity of Core Algorithms', transform: [1, 0, 0, 1, 50, 700], width: 300, height: 14 },

      // Header Row (y = 660)
      { str: 'Algorithm', transform: [1, 0, 0, 1, 50, 660], width: 80, height: 10 },
      { str: 'Time Complexity', transform: [1, 0, 0, 1, 200, 660], width: 100, height: 10 },
      { str: 'Space Complexity', transform: [1, 0, 0, 1, 380, 660], width: 100, height: 10 },

      // Data Row 1 (y = 635)
      { str: 'Binary Search', transform: [1, 0, 0, 1, 50, 635], width: 75, height: 10 },
      { str: 'O(log n)', transform: [1, 0, 0, 1, 200, 635], width: 45, height: 10 },
      { str: 'O(1)', transform: [1, 0, 0, 1, 380, 635], width: 25, height: 10 },

      // Data Row 2 (y = 610)
      { str: 'Merge Sort', transform: [1, 0, 0, 1, 50, 610], width: 60, height: 10 },
      { str: 'O(n log n)', transform: [1, 0, 0, 1, 200, 610], width: 55, height: 10 },
      { str: 'O(n)', transform: [1, 0, 0, 1, 380, 610], width: 25, height: 10 },

      // Data Row 3 (y = 585)
      { str: 'Quick Sort', transform: [1, 0, 0, 1, 50, 585], width: 55, height: 10 },
      { str: 'O(n log n)', transform: [1, 0, 0, 1, 200, 585], width: 55, height: 10 },
      { str: 'O(log n)', transform: [1, 0, 0, 1, 380, 585], width: 45, height: 10 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-table-1', 792, 1);

    expect(result.tables.length).toBe(1);
    const table = result.tables[0];

    expect(table.title).toContain('Table 1');
    expect(table.headers).toEqual(['Algorithm', 'Time Complexity', 'Space Complexity']);
    expect(table.rows.length).toBe(3);
    expect(table.rows[0]).toEqual(['Binary Search', 'O(log n)', 'O(1)']);
    expect(table.rows[1]).toEqual(['Merge Sort', 'O(n log n)', 'O(n)']);
    expect(table.rows[2]).toEqual(['Quick Sort', 'O(n log n)', 'O(log n)']);
    expect(table.confidence).toBe('high');
    expect(table.extractionMethod).toBe('pdf-layout-analysis');

    // Provenance element check
    const tableEl = result.elements.find((e) => e.type === 'table');
    expect(tableEl).toBeDefined();
    expect(tableEl?.sourceElementId).toBe(`src_${table.id}`);
  });

  it('handles vertical baseline alignment differences within row tolerances', () => {
    // Items with small baseline jitter (+/- 2 pt), e.g. different superscripts or font rendering
    const items: PDFTextItemLike[] = [
      // Header (y ~ 650 with small variations)
      { str: 'Protocol Phase', transform: [1, 0, 0, 1, 60, 651], width: 80, height: 11 },
      { str: 'Target Enrollment', transform: [1, 0, 0, 1, 220, 649], width: 100, height: 10 },
      { str: 'Primary Endpoint', transform: [1, 0, 0, 1, 400, 650], width: 90, height: 10 },

      // Row 1 (y ~ 620 with minor baseline jitter)
      { str: 'Dose Escalation', transform: [1, 0, 0, 1, 60, 622], width: 85, height: 10 },
      { str: '36 Subjects', transform: [1, 0, 0, 1, 220, 619], width: 65, height: 10 },
      { str: 'Maximum Tolerated Dose', transform: [1, 0, 0, 1, 400, 621], width: 120, height: 10 },

      // Row 2 (y ~ 590)
      { str: 'Dose Expansion', transform: [1, 0, 0, 1, 60, 591], width: 80, height: 10 },
      { str: '80 Subjects', transform: [1, 0, 0, 1, 220, 589], width: 65, height: 10 },
      { str: 'Objective Response Rate', transform: [1, 0, 0, 1, 400, 590], width: 125, height: 10 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-jitter', 792, 1);

    expect(result.tables.length).toBe(1);
    const table = result.tables[0];
    expect(table.headers).toEqual(['Protocol Phase', 'Target Enrollment', 'Primary Endpoint']);
    expect(table.rows.length).toBe(2);
    expect(table.rows[0][0]).toBe('Dose Escalation');
    expect(table.rows[1][0]).toBe('Dose Expansion');
  });

  it('handles wrapped multi-line cell entries without creating false additional rows', () => {
    // Cell text in column 2 wraps onto next line
    const items: PDFTextItemLike[] = [
      // Header
      { str: 'Architecture', transform: [1, 0, 0, 1, 50, 650], width: 80, height: 10 },
      { str: 'Description', transform: [1, 0, 0, 1, 200, 650], width: 100, height: 10 },

      // Row 1 Line A
      { str: 'Von Neumann', transform: [1, 0, 0, 1, 50, 620], width: 70, height: 10 },
      { str: 'Unified memory space for both instructions', transform: [1, 0, 0, 1, 200, 620], width: 180, height: 10 },
      // Row 1 Line B (continuation of column 2)
      { str: 'and operational data operands.', transform: [1, 0, 0, 1, 200, 608], width: 140, height: 10 },

      // Row 2
      { str: 'Harvard', transform: [1, 0, 0, 1, 50, 580], width: 50, height: 10 },
      { str: 'Physically separated signal pathways.', transform: [1, 0, 0, 1, 200, 580], width: 160, height: 10 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-wrap', 792, 1);

    expect(result.tables.length).toBe(1);
    const table = result.tables[0];
    expect(table.rows.length).toBe(2);
    // Verified that wrapped line was merged into the previous row cell
    expect(table.rows[0][1]).toContain('Unified memory space for both instructions and operational data operands.');
    expect(table.rows[1][0]).toBe('Harvard');
  });

  it('handles empty / missing cells across columns without synthetic fabrication', () => {
    const items: PDFTextItemLike[] = [
      // Header: 3 columns
      { str: 'Feature', transform: [1, 0, 0, 1, 50, 600], width: 50, height: 10 },
      { str: 'Standard Edition', transform: [1, 0, 0, 1, 200, 600], width: 80, height: 10 },
      { str: 'Enterprise Edition', transform: [1, 0, 0, 1, 380, 600], width: 90, height: 10 },

      // Row 1: column 1 has value, column 2 is EMPTY, column 3 has value
      { str: 'Single Sign-On', transform: [1, 0, 0, 1, 50, 570], width: 80, height: 10 },
      { str: 'Supported (SAML 2.0)', transform: [1, 0, 0, 1, 380, 570], width: 100, height: 10 },

      // Row 2: all 3 columns populated
      { str: 'Audit Logging', transform: [1, 0, 0, 1, 50, 540], width: 70, height: 10 },
      { str: '30 Days', transform: [1, 0, 0, 1, 200, 540], width: 45, height: 10 },
      { str: '365 Days', transform: [1, 0, 0, 1, 380, 540], width: 50, height: 10 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-empty', 792, 1);

    expect(result.tables.length).toBe(1);
    const table = result.tables[0];
    expect(table.rows.length).toBe(2);
    // Crucial requirement: Missing cell must be empty string, NEVER synthetic fabricated data
    expect(table.rows[0][1]).toBe('');
    expect(table.rows[0][2]).toBe('Supported (SAML 2.0)');
    expect(table.rows[1][1]).toBe('30 Days');
  });

  it('supports multiple distinct tables on the same page', () => {
    const items: PDFTextItemLike[] = [
      // Table 1
      { str: 'Table 1: Sorting Runtimes', transform: [1, 0, 0, 1, 50, 720], width: 140, height: 12 },
      { str: 'Name', transform: [1, 0, 0, 1, 50, 690], width: 40, height: 10 },
      { str: 'Average Case', transform: [1, 0, 0, 1, 220, 690], width: 70, height: 10 },
      { str: 'Heapsort', transform: [1, 0, 0, 1, 50, 665], width: 50, height: 10 },
      { str: 'O(n log n)', transform: [1, 0, 0, 1, 220, 665], width: 55, height: 10 },

      // Non-table narrative paragraph separating tables
      {
        str: 'Section 4. Hash Table Operations and Collision Resolution Mechanisms.',
        transform: [1, 0, 0, 1, 50, 580],
        width: 380,
        height: 12,
      },

      // Table 2
      { str: 'Table 2: Hashing Complexity', transform: [1, 0, 0, 1, 50, 510], width: 150, height: 12 },
      { str: 'Operation', transform: [1, 0, 0, 1, 50, 480], width: 55, height: 10 },
      { str: 'Expected Time', transform: [1, 0, 0, 1, 220, 480], width: 75, height: 10 },
      { str: 'Lookup', transform: [1, 0, 0, 1, 50, 455], width: 40, height: 10 },
      { str: 'O(1)', transform: [1, 0, 0, 1, 220, 455], width: 25, height: 10 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-multitable', 792, 1);

    expect(result.tables.length).toBe(2);
    expect(result.tables[0].title).toContain('Table 1');
    expect(result.tables[0].rows[0][0]).toBe('Heapsort');
    expect(result.tables[1].title).toContain('Table 2');
    expect(result.tables[1].rows[0][0]).toBe('Lookup');

    // The intermediate text is preserved as a narrative heading/paragraph element
    const narrativeEl = result.elements.find((e) => e.content.includes('Hash Table Operations'));
    expect(narrativeEl).toBeDefined();
    expect(narrativeEl?.type).not.toBe('table');
  });

  it('excludes ordinary prose paragraphs and does not create false tables', () => {
    // Normal paragraph lines where words flow naturally across the page
    const items: PDFTextItemLike[] = [
      { str: 'The stored-program computer concept relies on instruction memory.', transform: [1, 0, 0, 1, 50, 700], width: 340, height: 11 },
      { str: 'Each instruction contains an operational code and one or more operands.', transform: [1, 0, 0, 1, 50, 680], width: 360, height: 11 },
      { str: 'Execution proceeds sequentially unless altered by branch instructions.', transform: [1, 0, 0, 1, 50, 660], width: 350, height: 11 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-prose', 792, 1);

    expect(result.tables.length).toBe(0);
    expect(result.elements.length).toBe(3);
    expect(result.elements.every((e) => e.type === 'paragraph')).toBe(true);
  });

  it('excludes bulleted and numbered lists from false table classification', () => {
    const items: PDFTextItemLike[] = [
      { str: '•', transform: [1, 0, 0, 1, 50, 700], width: 8, height: 10 },
      { str: 'Primary memory storage stores all operational codes.', transform: [1, 0, 0, 1, 75, 700], width: 280, height: 10 },

      { str: '•', transform: [1, 0, 0, 1, 50, 675], width: 8, height: 10 },
      { str: 'Control units step through clock cycles deterministically.', transform: [1, 0, 0, 1, 75, 675], width: 290, height: 10 },

      { str: '•', transform: [1, 0, 0, 1, 50, 650], width: 8, height: 10 },
      { str: 'Arithmetic circuits execute elementary additions and shifts.', transform: [1, 0, 0, 1, 75, 650], width: 295, height: 10 },
    ];

    const result = extractPageLayoutAndTables(items, 1, 'doc-test-bullets', 792, 1);

    // Bullet list must not be treated as a 2-column table!
    expect(result.tables.length).toBe(0);
    expect(result.elements.length).toBe(3);
  });
});
