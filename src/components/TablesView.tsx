import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Table as TableIcon,
  Download,
  Search,
  ArrowUpDown,
  BarChart2,
  FileSpreadsheet,
  Edit3,
  RotateCcw,
  Undo2,
  Redo2,
  Plus,
  Trash2,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { DocumentTable, DocumentEntity } from '../types/doculens';
import {
  downloadCSVFile,
  downloadJSONFile,
  downloadXLSXFile,
  analyzeColumn,
} from '../services/tableExport';
import { ExportMenu } from './ExportMenu';
import { storage } from '../services/storage';

interface TablesViewProps {
  tables: DocumentTable[];
  documents: DocumentEntity[];
  selectedDocId?: string;
  onSelectDoc: (id?: string) => void;
  onNavigateToReader: (docId: string, pageNumber: number) => void;
  onUpdateTable?: (table: DocumentTable) => Promise<void>;
}

interface TableSnapshot {
  headers: string[];
  rows: string[][];
}

const MAX_HISTORY = 50;

export const TablesView: React.FC<TablesViewProps> = ({
  tables,
  documents,
  selectedDocId,
  onSelectDoc,
  onNavigateToReader,
  onUpdateTable,
}) => {
  const filteredTables = selectedDocId
    ? tables.filter((t) => t.documentId === selectedDocId)
    : tables;

  const [activeTableId, setActiveTableId] = useState<string>(
    filteredTables[0]?.id || ''
  );

  // Sync activeTableId if list changes
  useEffect(() => {
    if (!filteredTables.some((t) => t.id === activeTableId)) {
      if (filteredTables[0]) {
        setActiveTableId(filteredTables[0].id);
      }
    }
  }, [filteredTables, activeTableId]);

  const activeTable =
    filteredTables.find((t) => t.id === activeTableId) || filteredTables[0];
  const currentDoc = documents.find((d) => d.id === activeTable?.documentId);

  // Edit Mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [cellDraftValue, setCellDraftValue] = useState<string>('');

  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(null);
  const [headerDraftValue, setHeaderDraftValue] = useState<string>('');

  // Undo/Redo history stack (capped at last 50 actions)
  const [history, setHistory] = useState<TableSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Sorting and filtering
  const [filterQuery, setFilterQuery] = useState('');
  const [sortColIndex, setSortColIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // When active table changes, reset edit & history state
  useEffect(() => {
    if (activeTable) {
      setHistory([{ headers: [...activeTable.headers], rows: activeTable.rows.map((r) => [...r]) }]);
      setHistoryIndex(0);
      setEditingCell(null);
      setEditingHeaderIndex(null);
    }
  }, [activeTable?.id]);

  const pushHistory = useCallback(
    (newHeaders: string[], newRows: string[][]) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const updated = [...sliced, { headers: [...newHeaders], rows: newRows.map((r) => [...r]) }];
        if (updated.length > MAX_HISTORY) {
          return updated.slice(updated.length - MAX_HISTORY);
        }
        return updated;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [historyIndex]
  );

  const saveTableData = useCallback(
    async (newHeaders: string[], newRows: string[][]) => {
      if (!activeTable) return;

      const originalHeaders =
        activeTable.originalHeaders || [...activeTable.headers];
      const originalRows =
        activeTable.originalRows || activeTable.rows.map((r) => [...r]);

      const updatedTable: DocumentTable = {
        ...activeTable,
        headers: newHeaders,
        rows: newRows,
        columnCount: newHeaders.length,
        rowCount: newRows.length,
        isEdited: true,
        originalHeaders,
        originalRows,
        updatedAt: Date.now(),
      };

      await storage.saveTable(updatedTable);
      if (onUpdateTable) {
        await onUpdateTable(updatedTable);
      }
    },
    [activeTable, onUpdateTable]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevSnapshot = history[historyIndex - 1];
      setHistoryIndex((idx) => idx - 1);
      saveTableData(prevSnapshot.headers, prevSnapshot.rows);
      setEditingCell(null);
      setEditingHeaderIndex(null);
    }
  }, [historyIndex, history, saveTableData]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextSnapshot = history[historyIndex + 1];
      setHistoryIndex((idx) => idx + 1);
      saveTableData(nextSnapshot.headers, nextSnapshot.rows);
      setEditingCell(null);
      setEditingHeaderIndex(null);
    }
  }, [historyIndex, history, saveTableData]);

  // Global Ctrl+Z / Ctrl+Y keyboard shortcuts in Edit Mode
  useEffect(() => {
    if (!isEditMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, handleUndo, handleRedo]);

  // Cell editing actions
  const startEditCell = (rowIndex: number, colIndex: number) => {
    if (!isEditMode || !activeTable) return;
    setEditingCell({ row: rowIndex, col: colIndex });
    setCellDraftValue(activeTable.rows[rowIndex]?.[colIndex] || '');
  };

  const commitCellEdit = () => {
    if (!editingCell || !activeTable) return;
    const { row, col } = editingCell;
    const currentVal = activeTable.rows[row]?.[col] || '';
    if (currentVal !== cellDraftValue) {
      const nextRows = activeTable.rows.map((r, rIdx) =>
        rIdx === row
          ? r.map((c, cIdx) => (cIdx === col ? cellDraftValue : c))
          : [...r]
      );
      pushHistory(activeTable.headers, nextRows);
      saveTableData(activeTable.headers, nextRows);
    }
    setEditingCell(null);
  };

  // Header editing actions
  const startEditHeader = (colIndex: number) => {
    if (!isEditMode || !activeTable) return;
    setEditingHeaderIndex(colIndex);
    setHeaderDraftValue(activeTable.headers[colIndex] || '');
  };

  const commitHeaderEdit = () => {
    if (editingHeaderIndex === null || !activeTable) return;
    const trimmed = headerDraftValue.trim() || `Col ${editingHeaderIndex + 1}`;
    const currentVal = activeTable.headers[editingHeaderIndex] || '';
    if (currentVal !== trimmed) {
      const nextHeaders = activeTable.headers.map((h, idx) =>
        idx === editingHeaderIndex ? trimmed : h
      );
      pushHistory(nextHeaders, activeTable.rows);
      saveTableData(nextHeaders, activeTable.rows);
    }
    setEditingHeaderIndex(null);
  };

  // Row and Column structural additions/deletions
  const handleAddRow = () => {
    if (!activeTable) return;
    const newRow = new Array(activeTable.headers.length).fill('');
    const nextRows = [...activeTable.rows, newRow];
    pushHistory(activeTable.headers, nextRows);
    saveTableData(activeTable.headers, nextRows);
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!activeTable || activeTable.rows.length <= 1) return;
    const nextRows = activeTable.rows.filter((_, idx) => idx !== rowIndex);
    pushHistory(activeTable.headers, nextRows);
    saveTableData(activeTable.headers, nextRows);
  };

  const handleAddColumn = () => {
    if (!activeTable) return;
    const newColName = `Column ${activeTable.headers.length + 1}`;
    const nextHeaders = [...activeTable.headers, newColName];
    const nextRows = activeTable.rows.map((row) => [...row, '']);
    pushHistory(nextHeaders, nextRows);
    saveTableData(nextHeaders, nextRows);
  };

  const handleDeleteColumn = (colIndex: number) => {
    if (!activeTable || activeTable.headers.length <= 1) return;
    const nextHeaders = activeTable.headers.filter((_, idx) => idx !== colIndex);
    const nextRows = activeTable.rows.map((row) =>
      row.filter((_, idx) => idx !== colIndex)
    );
    pushHistory(nextHeaders, nextRows);
    saveTableData(nextHeaders, nextRows);
  };

  // Reset to original extracted version
  const handleResetToExtracted = async () => {
    if (!activeTable) return;
    const origHeaders = activeTable.originalHeaders || activeTable.headers;
    const origRows = activeTable.originalRows || activeTable.rows;

    const resetTable: DocumentTable = {
      ...activeTable,
      headers: [...origHeaders],
      rows: origRows.map((r) => [...r]),
      columnCount: origHeaders.length,
      rowCount: origRows.length,
      isEdited: false,
      updatedAt: Date.now(),
    };

    setHistory([{ headers: [...origHeaders], rows: origRows.map((r) => [...r]) }]);
    setHistoryIndex(0);
    setEditingCell(null);
    setEditingHeaderIndex(null);

    await storage.saveTable(resetTable);
    if (onUpdateTable) {
      await onUpdateTable(resetTable);
    }
  };

  // Process rows for filter & sort
  const processedRows = useMemo(() => {
    if (!activeTable) return [];
    let rowsWithIndex = activeTable.rows.map((row, index) => ({ row, index }));

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      rowsWithIndex = rowsWithIndex.filter(({ row }) =>
        row.some((cell) => cell.toLowerCase().includes(q))
      );
    }

    if (sortColIndex !== null && !isEditMode) {
      rowsWithIndex.sort((a, b) => {
        const valA = a.row[sortColIndex] || '';
        const valB = b.row[sortColIndex] || '';

        const numA = parseFloat(valA.replace(/[^0-9.-]/g, ''));
        const numB = parseFloat(valB.replace(/[^0-9.-]/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      });
    }

    return rowsWithIndex;
  }, [activeTable, filterQuery, sortColIndex, sortDirection, isEditMode]);

  // Numeric column statistics (automatically recomputes after edits)
  const columnStats = useMemo(() => {
    if (!activeTable) return [];
    return activeTable.headers.map((header, idx) => {
      const columnValues = activeTable.rows.map((r) => r[idx] || '');
      return {
        header,
        ...analyzeColumn(columnValues),
      };
    });
  }, [activeTable]);

  const handleHeaderClick = (colIdx: number) => {
    if (isEditMode) {
      startEditHeader(colIdx);
      return;
    }
    if (sortColIndex === colIdx) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColIndex(colIdx);
      setSortDirection('asc');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-paper-border pb-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-ink">
            Table Extraction & Editable Safe Studio
          </h1>
        </div>

        {/* Scope selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label
              htmlFor="tables-doc-scope-select"
              className="text-[13px] text-ink-muted whitespace-nowrap"
            >
              Scope:
            </label>
            <select
              id="tables-doc-scope-select"
              value={selectedDocId || ''}
              onChange={(e) => onSelectDoc(e.target.value || undefined)}
              className="text-[13px] bg-paper-light border border-paper-border hover:border-accent rounded-md px-3 py-2 min-h-[36px] text-ink focus:border-accent transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="" className="bg-paper-light text-ink">
                All Documents ({tables.length} tables)
              </option>
              {documents.map((d) => (
                <option key={d.id} value={d.id} className="bg-paper-light text-ink">
                  {d.originalName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredTables.length === 0 ? (
        <div className="border border-paper-border bg-paper-light rounded-lg p-8 sm:p-12 text-center text-ink-muted space-y-4 shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-full bg-paper border border-paper-border flex items-center justify-center">
            <TableIcon className="w-6 h-6 text-ink-faint" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <p className="font-serif text-lg font-semibold text-ink">
              No Tabular Grids Available
            </p>
            <p className="text-[13px] text-ink-muted leading-relaxed">
              No tables were detected or uploaded for this scope.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Table Tab Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {filteredTables.map((t) => {
              const isActive = activeTable?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTableId(t.id);
                    setFilterQuery('');
                    setSortColIndex(null);
                    setEditingCell(null);
                    setEditingHeaderIndex(null);
                  }}
                  className={`px-3 py-2 min-h-[36px] text-[13px] font-sans rounded-md border text-left whitespace-nowrap transition-all duration-150 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isActive
                      ? 'border-accent bg-accent-subtle text-accent font-semibold shadow-xs'
                      : 'border-paper-border bg-paper text-ink-muted hover:text-ink hover:bg-paper-dim'
                  }`}
                >
                  <span className="font-medium">
                    {t.title || `Table p.${t.pageNumber}`}
                  </span>
                  {t.isEdited && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Edited" />
                  )}
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-paper-dim text-ink-muted">
                    {t.rows.length}r × {t.headers.length}c
                  </span>
                </button>
              );
            })}
          </div>

          {activeTable && (
            <div className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-5 shadow-xs">
              {/* Active Table Header & Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-paper-border pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-serif text-lg font-semibold text-ink">
                      {activeTable.title || 'Extracted Table'}
                    </h2>

                    {/* Edited Badge */}
                    {activeTable.isEdited && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded border uppercase tracking-wider font-semibold bg-amber-500/10 text-amber-400 border-amber-500/30">
                        Edited
                      </span>
                    )}

                    {activeTable.confidence && (
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded border uppercase tracking-wider font-semibold ${
                          activeTable.confidence === 'high'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : activeTable.confidence === 'medium'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {activeTable.confidence} confidence
                      </span>
                    )}

                    {activeTable.extractionMethod && (
                      <span className="text-xs font-mono text-ink-faint px-2 py-0.5 rounded bg-paper border border-paper-border">
                        {activeTable.extractionMethod}
                      </span>
                    )}
                  </div>

                  {/* Provenance Metadata Line */}
                  <div className="text-[13px] text-ink-muted flex items-center gap-2 mt-1.5 flex-wrap">
                    <span>Source: {currentDoc?.originalName || 'Document'}</span>
                    <span aria-hidden="true" className="text-ink-faint">·</span>
                    <span className="font-mono text-accent">Page {activeTable.pageNumber}</span>
                    <span aria-hidden="true" className="text-ink-faint">·</span>
                    <span>
                      {activeTable.headers.length} columns × {activeTable.rows.length} rows
                    </span>
                    <span aria-hidden="true" className="text-ink-faint">·</span>
                    <span className="font-mono text-xs text-ink-faint">
                      Provenance: {activeTable.sourceElementId}
                    </span>
                  </div>
                </div>

                {/* Right Top Buttons */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Edit Mode Toggle Button */}
                  <button
                    onClick={() => {
                      setIsEditMode(!isEditMode);
                      setEditingCell(null);
                      setEditingHeaderIndex(null);
                    }}
                    className={`h-8 px-3 text-[13px] font-medium flex items-center gap-1.5 rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isEditMode
                        ? 'border-accent bg-accent-subtle text-accent ring-1 ring-accent'
                        : 'border-paper-border text-ink-muted hover:text-ink hover:bg-paper-dim bg-paper'
                    }`}
                    title="Toggle cell and table editing"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditMode ? 'Exit Edit Mode' : 'Edit Table'}</span>
                  </button>

                  {/* Reset to Extracted Button */}
                  {(activeTable.isEdited || activeTable.originalHeaders) && (
                    <button
                      onClick={handleResetToExtracted}
                      className="h-8 px-3 text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border hover:bg-paper-dim rounded-md bg-paper transition-all duration-150 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title="Reset table data to original extracted version"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-accent" />
                      <span>Reset to extracted</span>
                    </button>
                  )}

                  {currentDoc && (
                    <button
                      onClick={() => onNavigateToReader(currentDoc.id, activeTable.pageNumber)}
                      className="h-8 px-3 text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border hover:bg-paper-dim rounded-md bg-paper transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title="Open table in context on document page"
                    >
                      Open in Reader (p.{activeTable.pageNumber})
                    </button>
                  )}

                  {/* Export Menu with Excel (.xlsx), CSV, and JSON */}
                  <ExportMenu
                    items={[
                      {
                        label: 'Excel (.xlsx)',
                        hint: 'Formula-safe local workbook (.xlsx)',
                        icon: <FileSpreadsheet className="w-4 h-4 text-emerald-400" />,
                        onClick: () =>
                          downloadXLSXFile(activeTable, currentDoc?.originalName || 'document'),
                      },
                      {
                        label: 'CSV (formula-safe)',
                        hint: 'RFC-4180 with injection defense',
                        icon: <FileSpreadsheet className="w-4 h-4 text-accent" />,
                        onClick: () =>
                          downloadCSVFile(activeTable, currentDoc?.originalName || 'document'),
                      },
                      {
                        label: 'JSON',
                        hint: 'Structured data with metadata',
                        icon: <Download className="w-4 h-4 text-ink-faint" />,
                        onClick: () =>
                          downloadJSONFile(activeTable, currentDoc?.originalName || 'document'),
                      },
                    ]}
                  />
                </div>
              </div>

              {/* Edit Toolbar when Edit Mode is active */}
              {isEditMode && (
                <div className="p-3 bg-paper border border-accent/40 rounded-lg flex items-center justify-between gap-3 flex-wrap text-xs font-mono">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-accent font-semibold flex items-center gap-1.5 font-sans">
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Mode:
                    </span>
                    <span className="text-ink-muted">
                      Double-click or Enter edits a cell/header
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Undo */}
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={historyIndex <= 0}
                      title="Undo (Ctrl+Z)"
                      className="px-2.5 py-1.5 rounded border border-paper-border bg-paper-light hover:bg-paper-dim disabled:opacity-30 disabled:cursor-not-allowed text-ink flex items-center gap-1 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>

                    {/* Redo */}
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={historyIndex >= history.length - 1}
                      title="Redo (Ctrl+Y)"
                      className="px-2.5 py-1.5 rounded border border-paper-border bg-paper-light hover:bg-paper-dim disabled:opacity-30 disabled:cursor-not-allowed text-ink flex items-center gap-1 transition-colors"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>Redo</span>
                    </button>

                    <div className="h-4 w-px bg-paper-border mx-1" />

                    {/* Add Row */}
                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="px-2.5 py-1.5 rounded border border-paper-border bg-paper-light hover:bg-paper-dim text-accent flex items-center gap-1 transition-colors"
                      title="Add empty row at bottom"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Row</span>
                    </button>

                    {/* Add Column */}
                    <button
                      type="button"
                      onClick={handleAddColumn}
                      className="px-2.5 py-1.5 rounded border border-paper-border bg-paper-light hover:bg-paper-dim text-accent flex items-center gap-1 transition-colors"
                      title="Add column"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Column</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Search filter within table */}
              {!isEditMode && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="relative max-w-xs w-full">
                    <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="Filter rows by text or value..."
                      className="w-full text-[13px] bg-paper border border-paper-border focus:border-accent rounded-md pl-9 pr-3 py-2 min-h-[36px] text-ink placeholder:text-ink-faint transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </div>

                  <span className="text-xs text-ink-faint font-mono">
                    Showing {processedRows.length} of {activeTable.rows.length} rows
                  </span>
                </div>
              )}

              {/* Data Grid Table */}
              <div className="overflow-x-auto border border-paper-border rounded-lg">
                <table className="w-full text-left text-[13px] border-collapse font-sans">
                  <thead>
                    <tr className="bg-paper border-b border-paper-border text-ink">
                      {isEditMode && (
                        <th className="p-2 w-10 text-center font-mono text-[11px] text-ink-faint border-r border-paper-border">
                          #
                        </th>
                      )}
                      {activeTable.headers.map((h, colIdx) => {
                        const isSorted = sortColIndex === colIdx;
                        const isEditingThisHeader = editingHeaderIndex === colIdx;

                        return (
                          <th
                            key={colIdx}
                            onClick={() => handleHeaderClick(colIdx)}
                            className={`p-3.5 font-semibold font-sans transition-colors select-none whitespace-nowrap ${
                              isEditMode
                                ? 'cursor-pointer hover:bg-paper-dim border-r border-paper-border'
                                : 'cursor-pointer hover:bg-paper-dim'
                            }`}
                          >
                            {isEditingThisHeader ? (
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={headerDraftValue}
                                  onChange={(e) => setHeaderDraftValue(e.target.value)}
                                  onBlur={commitHeaderEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitHeaderEdit();
                                    if (e.key === 'Escape') setEditingHeaderIndex(null);
                                  }}
                                  className="bg-paper-light border border-accent rounded px-2 py-0.5 text-xs text-ink font-semibold focus-visible:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={commitHeaderEdit}
                                  className="text-emerald-400 p-0.5 rounded hover:bg-paper"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span>{h}</span>
                                  {!isEditMode && (
                                    <ArrowUpDown
                                      className={`w-3.5 h-3.5 ${
                                        isSorted ? 'text-accent' : 'text-ink-faint'
                                      }`}
                                    />
                                  )}
                                </div>
                                {isEditMode && activeTable.headers.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteColumn(colIdx);
                                    }}
                                    title="Delete this column"
                                    className="p-1 text-ink-faint hover:text-red-400 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-border bg-paper-light">
                    {processedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={activeTable.headers.length + (isEditMode ? 1 : 0)}
                          className="p-8 text-center text-[13px] text-ink-faint"
                        >
                          No rows match the filter query.
                        </td>
                      </tr>
                    ) : (
                      processedRows.map(({ row, index: originalRowIndex }, displayIdx) => (
                        <tr
                          key={originalRowIndex}
                          className="hover:bg-paper-dim transition-colors font-mono text-xs group"
                        >
                          {isEditMode && (
                            <td className="p-2 w-10 text-center text-ink-faint border-r border-paper-border text-[11px] select-none">
                              <div className="flex items-center justify-center gap-1">
                                <span>{displayIdx + 1}</span>
                                {activeTable.rows.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRow(originalRowIndex)}
                                    title="Delete row"
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-faint hover:text-red-400 transition-opacity"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}

                          {row.map((cell, cIdx) => {
                            const isEditingThisCell =
                              editingCell?.row === originalRowIndex &&
                              editingCell?.col === cIdx;

                            return (
                              <td
                                key={cIdx}
                                onDoubleClick={() => startEditCell(originalRowIndex, cIdx)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !isEditingThisCell) {
                                    startEditCell(originalRowIndex, cIdx);
                                  }
                                }}
                                tabIndex={isEditMode ? 0 : undefined}
                                className={`p-3 text-ink whitespace-nowrap ${
                                  isEditMode
                                    ? 'cursor-pointer hover:bg-paper focus:bg-paper focus:outline-none focus:ring-1 focus:ring-accent'
                                    : ''
                                }`}
                              >
                                {isEditingThisCell ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={cellDraftValue}
                                      onChange={(e) => setCellDraftValue(e.target.value)}
                                      onBlur={commitCellEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      className="bg-paper border border-accent rounded px-2 py-1 text-xs text-ink w-full focus-visible:outline-none"
                                    />
                                  </div>
                                ) : (
                                  <span>{cell}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Numerical Column Analytics (Recomputes automatically upon edit) */}
              {columnStats.some((c) => c.isNumeric) && (
                <div className="pt-2 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <BarChart2 className="w-3.5 h-3.5 text-accent" />
                    <span>Numeric Column Statistics:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {columnStats
                      .filter((c) => c.isNumeric)
                      .map((stat, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 bg-paper border border-paper-border rounded-md text-xs space-y-1.5 font-mono"
                        >
                          <div className="font-sans font-semibold text-ink truncate text-[13px]">
                            {stat.header}
                          </div>
                          <div className="text-xs text-ink-muted flex justify-between">
                            <span>Count: {stat.count}</span>
                            <span>Avg: {stat.average}</span>
                          </div>
                          <div className="text-xs text-ink-muted flex justify-between">
                            <span>Min: {stat.min}</span>
                            <span>Max: {stat.max}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
