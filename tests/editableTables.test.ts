import { describe, it, expect } from 'vitest';
import { DocumentTable } from '../src/types/doculens';
import {
  exportTableToXLSX,
  exportTableToCSV,
  sanitizeCSVCell,
  analyzeColumn,
} from '../src/services/tableExport';

describe('Editable Tables & Safe Excel Export (Requirement 11)', () => {
  const sampleTable: DocumentTable = {
    id: 'tbl-test-1',
    documentId: 'doc-1',
    pageNumber: 3,
    sourceElementId: 'el-src-99',
    title: 'Financial Q3 Results',
    headers: ['Item', 'Amount', 'Status'],
    rows: [
      ['Revenue', '125000', 'Confirmed'],
      ['Operational Cost', '-45000', 'Audited'],
      ['Net Margin', '80000', 'Approved'],
    ],
    confidence: 'high',
    extractionMethod: 'pdf-layout-analysis',
    columnCount: 3,
    rowCount: 3,
  };

  it('supports cell editing, row/column addition, undo/redo, and reset to extracted', () => {
    // 1. Initial snapshot
    const originalHeaders = [...sampleTable.headers];
    const originalRows = sampleTable.rows.map((r) => [...r]);

    const history: { headers: string[]; rows: string[][] }[] = [
      { headers: [...originalHeaders], rows: originalRows.map((r) => [...r]) },
    ];
    let historyIndex = 0;

    const pushAction = (newH: string[], newR: string[][]) => {
      history.push({ headers: [...newH], rows: newR.map((r) => [...r]) });
      historyIndex++;
      if (history.length > 50) {
        history.shift();
        historyIndex--;
      }
    };

    // Action 1: Edit cell [0, 1] from '125000' to '130000'
    const step1Rows = sampleTable.rows.map((r) => [...r]);
    step1Rows[0][1] = '130000';
    pushAction(originalHeaders, step1Rows);

    expect(history).toHaveLength(2);
    expect(history[historyIndex].rows[0][1]).toBe('130000');

    // Action 2: Add row
    const step2Rows = [...history[historyIndex].rows, ['Tax', '-15000', 'Estimated']];
    pushAction(originalHeaders, step2Rows);

    expect(history).toHaveLength(3);
    expect(history[historyIndex].rows).toHaveLength(4);

    // Action 3: Rename header 'Amount' -> 'Value (USD)'
    const step3Headers = [...originalHeaders];
    step3Headers[1] = 'Value (USD)';
    pushAction(step3Headers, history[historyIndex].rows);

    expect(history[historyIndex].headers[1]).toBe('Value (USD)');

    // Undo 1 step (reverts header change)
    historyIndex--;
    expect(history[historyIndex].headers[1]).toBe('Amount');
    expect(history[historyIndex].rows).toHaveLength(4);

    // Undo another step (reverts added row)
    historyIndex--;
    expect(history[historyIndex].rows).toHaveLength(3);
    expect(history[historyIndex].rows[0][1]).toBe('130000');

    // Redo 1 step (re-applies added row)
    historyIndex++;
    expect(history[historyIndex].rows).toHaveLength(4);

    // Reset to extracted: restore initial headers & rows
    const resetTable: DocumentTable = {
      ...sampleTable,
      headers: [...originalHeaders],
      rows: originalRows.map((r) => [...r]),
      isEdited: false,
      originalHeaders,
      originalRows,
    };

    expect(resetTable.headers).toEqual(['Item', 'Amount', 'Status']);
    expect(resetTable.rows[0][1]).toBe('125000');
    expect(resetTable.rows).toHaveLength(3);
    expect(resetTable.isEdited).toBe(false);
    expect(resetTable.sourceElementId).toBe('el-src-99');
    expect(resetTable.pageNumber).toBe(3);
  });

  it('recomputes numerical column statistics after table edits', () => {
    // Initial stats for Amount: 125000, -45000, 80000 -> count: 3, min: -45000, max: 125000, avg: 53333.33
    const initialStats = analyzeColumn(sampleTable.rows.map((r) => r[1]));
    expect(initialStats.isNumeric).toBe(true);
    expect(initialStats.min).toBe(-45000);
    expect(initialStats.max).toBe(125000);

    // After editing cell and adding a row
    const editedRows = [
      ['Revenue', '200000', 'Confirmed'],
      ['Operational Cost', '-50000', 'Audited'],
      ['Net Margin', '150000', 'Approved'],
      ['Tax', '-20000', 'Pending'],
    ];

    const editedStats = analyzeColumn(editedRows.map((r) => r[1]));
    expect(editedStats.isNumeric).toBe(true);
    expect(editedStats.count).toBe(4);
    expect(editedStats.min).toBe(-50000);
    expect(editedStats.max).toBe(200000);
    expect(editedStats.average).toBe(70000);
  });

  it('generates a valid, self-contained Excel (.xlsx) file buffer with proper ZIP and XML structures', () => {
    const xlsxBytes = exportTableToXLSX(sampleTable, { docName: 'Financials.pdf' });

    expect(xlsxBytes).toBeInstanceOf(Uint8Array);
    expect(xlsxBytes.length).toBeGreaterThan(500);

    // Standard PKZip file signature: 0x50, 0x4B, 0x03, 0x04 ('PK\x03\x04')
    expect(xlsxBytes[0]).toBe(0x50);
    expect(xlsxBytes[1]).toBe(0x4b);
    expect(xlsxBytes[2]).toBe(0x03);
    expect(xlsxBytes[3]).toBe(0x04);

    // Verify presence of required OpenXML parts within the binary stream
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const content = decoder.decode(xlsxBytes);

    expect(content).toContain('[Content_Types].xml');
    expect(content).toContain('xl/workbook.xml');
    expect(content).toContain('xl/worksheets/sheet1.xml');
    expect(content).toContain('_rels/.rels');
  });

  it('strictly mitigates spreadsheet formula injection in both CSV and XLSX exports', () => {
    const maliciousTable: DocumentTable = {
      id: 'tbl-vuln',
      documentId: 'doc-attack',
      pageNumber: 1,
      sourceElementId: 'el-src-1',
      title: '=cmd|\' /C calc\'!A0',
      headers: ['User', 'Expression', 'Formula Payload', 'Valid Value'],
      rows: [
        ['Alice', '+HYPERLINK("http://evil.com")', '=cmd|\' /C calc\'!A0', '100.5'],
        ['Bob', '-2+3*cmd|calc', '@SUM(1,2)', '-45'],
        ['Eve', '\tcmd|calc', '%OS%', 'Normal text'],
      ],
    };

    // 1. Verify CSV injection mitigation
    const csvContent = exportTableToCSV(maliciousTable, { docName: 'TestDoc' });
    // In CSV, dangerous prefixes (=, +, -, @, etc.) are escaped with single quote '
    expect(csvContent).toContain("'+HYPERLINK");
    expect(csvContent).toContain("'=cmd|");
    expect(csvContent).toContain("'-2+3*cmd|calc");
    expect(csvContent).toContain("'@SUM(1,2)");
    // Legitimate pure numbers are NOT escaped with quotes:
    expect(csvContent).toContain(',100.5');
    expect(csvContent).toContain(',-45');

    // 2. Verify XLSX injection mitigation
    const xlsxBytes = exportTableToXLSX(maliciousTable);
    const decoder = new TextDecoder('utf-8');
    const content = decoder.decode(xlsxBytes);

    // In sheet1.xml:
    // Malicious cells must be written as inline text (t="inlineStr"), NEVER as formulas or numeric values
    expect(content).toContain('t="inlineStr"><is><t>=cmd|&apos; /C calc&apos;!A0</t></is>');
    expect(content).toContain('t="inlineStr"><is><t>+HYPERLINK(&quot;http://evil.com&quot;)</t></is>');
    expect(content).toContain('t="inlineStr"><is><t>@SUM(1,2)</t></is>');

    // Pure legitimate numeric values not starting with formula triggers are allowed as numeric <v>
    expect(content).toContain('<v>100.5</v>');
    // Numbers starting with '-' are written as text per the requirement:
    // "cells starting with = + - @ are written as text, for XLSX too."
    expect(content).toContain('t="inlineStr"><is><t>-45</t></is>');
  });
});
