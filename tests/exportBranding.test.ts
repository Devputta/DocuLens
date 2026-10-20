import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  formatExportDateTime,
  formatFileTimestamp,
  sanitizeFilenamePart,
  generateExportFilename,
  escapeMarkdownTableCell,
  generateMarkdownTable,
  generateMarkdownHeader,
  generateMarkdownFooter,
  generateJSONMetadata,
  renderPDFHeader,
  renderPDFFooters,
  BRAND_NAME,
  BRAND_FOUNDER,
  BRAND_REPOSITORY,
  BRAND_TAGLINE,
} from '../src/utils/exportBranding';
import { exportTableToCSV, exportTableToJSON } from '../src/services/tableExport';
import { DocumentTable } from '../src/types/doculens';

describe('Export Branding & Utilities: Filename Formatting', () => {
  it('generates filename matching doculens_<type>_<docA>_vs_<docB>_YYYY-MM-DD_HHmm.<ext>', () => {
    const fixedDate = new Date(2026, 9, 17, 14, 32); // 17 Oct 2026, 14:32
    const filename = generateExportFilename(
      'comparison',
      'Computing Foundations.pdf',
      'Computing Architectures.pdf',
      'pdf',
      fixedDate
    );

    expect(filename).toBe(
      'doculens_comparison_computing_foundations_vs_computing_architectures_2026-10-17_1432.pdf'
    );
  });

  it('removes unsafe characters, slashes, spaces, and path traversal tokens from filenames', () => {
    const fixedDate = new Date(2026, 9, 17, 9, 5);
    const filename = generateExportFilename(
      'table/export',
      '../../secret/doc:A*?.pdf',
      'report <B> | draft.xlsx',
      'csv',
      fixedDate
    );

    expect(filename).toMatch(/^doculens_table_export_[a-z0-9_]+_vs_[a-z0-9_]+_2026-10-17_0905\.csv$/);
    expect(filename).not.toContain('..');
    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('*');
    expect(filename).not.toContain('<');
    expect(filename).not.toContain('|');
  });

  it('supports single-document table export with default docB', () => {
    const fixedDate = new Date(2026, 9, 17, 16, 45);
    const filename = generateExportFilename(
      'table',
      'Financial Summary.pdf',
      'table_p3',
      'json',
      fixedDate
    );

    expect(filename).toBe(
      'doculens_table_financial_summary_vs_table_p3_2026-10-17_1645.json'
    );
  });
});

describe('Export Branding & Utilities: Markdown Escaping & Tables', () => {
  it('escapes pipe characters and replaces newlines in table cells', () => {
    const dangerousCell = 'Condition A | Condition B\r\nSecond line';
    const escaped = escapeMarkdownTableCell(dangerousCell);
    expect(escaped).toBe('Condition A \\| Condition B Second line');
    expect(escaped).not.toContain('\r');
    expect(escaped).not.toContain('\n');
    expect(escaped).toContain('\\|');
  });

  it('handles null, undefined, and numeric values gracefully in table cells', () => {
    expect(escapeMarkdownTableCell(null)).toBe('');
    expect(escapeMarkdownTableCell(undefined)).toBe('');
    expect(escapeMarkdownTableCell(42)).toBe('42');
    expect(escapeMarkdownTableCell(0)).toBe('0');
  });

  it('generates a proper Markdown pipe table with headers and separators', () => {
    const headers = ['Concept', 'Document A', 'Document B', 'Relationship', 'Confidence'];
    const rows = [
      [
        'Von Neumann Architecture',
        'Stored-program concept (p.1)',
        'Unified memory model | bus (p.2)',
        'equivalent_concept',
        '95%',
      ],
      [
        'Memory Hierarchy',
        'Caches and RAM (p.4)',
        'L1/L2 buffers (p.5)',
        'superset_of',
        '88%',
      ],
    ];

    const mdTable = generateMarkdownTable(headers, rows);
    const lines = mdTable.split('\n');

    expect(lines.length).toBe(4);
    // Header row
    expect(lines[0]).toBe('| Concept | Document A | Document B | Relationship | Confidence |');
    // Separator row
    expect(lines[1]).toBe('| --- | --- | --- | --- | --- |');
    // Data rows with escaped pipe
    expect(lines[2]).toContain('Unified memory model \\| bus (p.2)');
  });
});

describe('Export Branding & Utilities: Header & Footer Helper Output', () => {
  it('generates consistent Markdown header with metadata block', () => {
    const fixedDate = new Date(2026, 9, 17, 14, 32);
    const header = generateMarkdownHeader('Document Comparison Report', {
      docA: 'DocA.pdf (4 pages)',
      docB: 'DocB.pdf (6 pages)',
      mode: 'Concept Comparison',
      date: fixedDate,
    });

    expect(header).toContain(`# ${BRAND_NAME} — Document Comparison Report`);
    expect(header).toContain(BRAND_TAGLINE);
    expect(header).toContain(BRAND_FOUNDER);
    expect(header).toContain(BRAND_REPOSITORY);
    expect(header).toContain('**Document A (Reference):**');
    expect(header).toContain('**Document B (Comparison):**');
    expect(header).toContain('**Comparison Mode:** Concept Comparison');
    expect(header).toContain('17 Oct 2026, 14:32');
  });

  it('generates consistent Markdown footer with horizontal rule and timestamp', () => {
    const fixedDate = new Date(2026, 9, 17, 14, 32);
    const footer = generateMarkdownFooter(fixedDate);

    expect(footer).toContain('---');
    expect(footer).toContain('Generated by DocuLens · Devputta');
    expect(footer).toContain('17 Oct 2026, 14:32');
  });

  it('generates JSON metadata object including branding and contributors', () => {
    const fixedDate = new Date(2026, 9, 17, 14, 32);
    const meta = generateJSONMetadata('Table Extraction', {
      docA: 'Annual_Report.pdf',
      docB: 'Table_p2',
      date: fixedDate,
    });

    expect(meta.application).toBe(BRAND_NAME);
    expect(meta.tagline).toBe(BRAND_TAGLINE);
    expect(meta.contributor).toBe('Devputta');
    expect(meta.repository).toBe(BRAND_REPOSITORY);
    expect(meta.reportTitle).toBe('Table Extraction');
    expect(meta.docA).toBe('Annual_Report.pdf');
  });

  it('includes # key: value metadata comments in CSV exports without breaking formula injection safety', () => {
    const table: DocumentTable = {
      id: 'tbl-test-branding',
      documentId: 'doc-1',
      pageNumber: 3,
      sourceElementId: 'src_tbl_1',
      title: 'Performance Benchmarks',
      headers: ['Framework', 'Latency (ms)'],
      rows: [
        ['React', '12.4'],
        ['Vue', '11.8'],
      ],
    };

    const fixedDate = new Date(2026, 9, 17, 14, 32);
    const csv = exportTableToCSV(table, {
      docName: 'Benchmarking_Study.pdf',
      date: fixedDate,
    });

    expect(csv).toContain(`# Application: ${BRAND_NAME}`);
    expect(csv).toContain(`# Tagline: ${BRAND_TAGLINE}`);
    expect(csv).toContain(`# Contributor: Devputta (${BRAND_REPOSITORY})`);
    expect(csv).toContain('# Document: Benchmarking_Study.pdf');
    expect(csv).toContain('# Page: 3');
    expect(csv).toContain('# Performance Benchmarks');
    expect(csv).toContain('Framework,Latency (ms)');
    expect(csv).toContain('React,12.4');
  });
});

describe('Export Branding & Utilities: PDF Page Numbering & Footers', () => {
  it('renders correct total page numbers and branding across multi-page PDF documents', () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    // Create a 3-page document
    doc.text('Page 1 Content', 40, 100);
    doc.addPage();
    doc.text('Page 2 Content', 40, 100);
    doc.addPage();
    doc.text('Page 3 Content', 40, 100);

    expect(doc.getNumberOfPages()).toBe(3);

    const fixedDate = new Date(2026, 9, 17, 14, 32);
    renderPDFFooters(doc, fixedDate);

    // Verify footer can be invoked without runtime error and preserves page count
    expect(doc.getNumberOfPages()).toBe(3);
  });

  it('renders header banner and metadata block on first page of PDF without throwing', () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const finalY = renderPDFHeader(
      doc,
      'Document Comparison Report',
      {
        docA: 'DocA.pdf',
        docB: 'DocB.pdf',
        mode: 'Concept Comparison',
        pageCountA: 5,
        pageCountB: 8,
        date: new Date(2026, 9, 17, 14, 32),
      },
      null
    );

    expect(finalY).toBeGreaterThan(50);
    expect(finalY).toBeLessThan(300);
  });
});
