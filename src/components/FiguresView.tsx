import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  Scan,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  FileText,
  StickyNote,
} from 'lucide-react';
import { DocumentEntity, FigureSummary, DocumentFigure, DocumentChunk } from '../types/doculens';
import { storage } from '../services/storage';
import { figureExtractor } from '../services/figureExtractor';
import { runFigureOCR } from '../services/ocrService';

interface FiguresViewProps {
  documents: DocumentEntity[];
  onNavigateToReader: (documentId: string, pageNumber: number) => void;
  initialFigureId?: string;
  onAddNote?: (noteData: {
    documentId: string;
    pageNumber: number;
    selectedText: string;
    noteText: string;
  }) => void;
}

export const FiguresView: React.FC<FiguresViewProps> = ({
  documents,
  onNavigateToReader,
  initialFigureId,
  onAddNote,
}) => {
  // State: figure summaries only (Never keep full-size bitmaps in React state)
  const [figureSummaries, setFigureSummaries] = useState<FigureSummary[]>([]);
  const [isLoadingFigures, setIsLoadingFigures] = useState(true);

  // Filters
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>('all');
  const [selectedPageFilter, setSelectedPageFilter] = useState<string>('all');

  // Lightbox State (stores only active ID, loads full blob on demand)
  const [activeFigureId, setActiveFigureId] = useState<string | null>(initialFigureId || null);
  const [lightboxFullFigure, setLightboxFullFigure] = useState<DocumentFigure | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isLightboxLoading, setIsLightboxLoading] = useState(false);

  // Figure OCR in Lightbox State
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ percent: number; message: string } | null>(null);
  const [ocrAbortController, setOcrAbortController] = useState<AbortController | null>(null);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [noteAddedMessage, setNoteAddedMessage] = useState<string | null>(null);

  // Scan for figures state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ percent: number; message: string } | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Load figure summaries from storage
  const loadFigureSummaries = useCallback(async () => {
    setIsLoadingFigures(true);
    try {
      const summaries = await storage.getAllFigureSummaries();
      setFigureSummaries(summaries);
    } catch (err) {
      console.debug('Figure summaries notice:', err);
    } finally {
      setIsLoadingFigures(false);
    }
  }, []);

  useEffect(() => {
    loadFigureSummaries();
  }, [loadFigureSummaries]);

  // Clean up object URLs when component unmounts
  useEffect(() => {
    return () => {
      for (const fig of figureSummaries) {
        if (fig.thumbnailUrl) {
          try {
            URL.revokeObjectURL(fig.thumbnailUrl);
          } catch {
            // ignore
          }
        }
      }
    };
  }, [figureSummaries]);

  // Document name lookup map
  const docNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of documents) {
      map.set(d.id, d.originalName);
    }
    return map;
  }, [documents]);

  // Filtered figure summaries
  const filteredFigures = useMemo(() => {
    return figureSummaries.filter((fig) => {
      if (selectedDocFilter !== 'all' && fig.documentId !== selectedDocFilter) {
        return false;
      }
      if (selectedPageFilter !== 'all' && String(fig.pageNumber) !== selectedPageFilter) {
        return false;
      }
      return true;
    });
  }, [figureSummaries, selectedDocFilter, selectedPageFilter]);

  // Available pages for the page filter dropdown
  const availablePages = useMemo(() => {
    const pages = new Set<number>();
    for (const fig of figureSummaries) {
      if (selectedDocFilter === 'all' || fig.documentId === selectedDocFilter) {
        pages.add(fig.pageNumber);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [figureSummaries, selectedDocFilter]);

  // Reset page filter if selected page is not in available pages
  useEffect(() => {
    if (selectedPageFilter !== 'all' && !availablePages.includes(Number(selectedPageFilter))) {
      setSelectedPageFilter('all');
    }
  }, [selectedDocFilter, availablePages, selectedPageFilter]);

  // Lightbox: load full-size image blob from IndexedDB only when a figure is opened
  useEffect(() => {
    if (!activeFigureId) {
      if (lightboxImageUrl) {
        URL.revokeObjectURL(lightboxImageUrl);
        setLightboxImageUrl(null);
      }
      setLightboxFullFigure(null);
      setZoomLevel(1);
      return;
    }

    let isSubscribed = true;
    setIsLightboxLoading(true);

    storage
      .getFigure(activeFigureId)
      .then((fig) => {
        if (!isSubscribed) return;
        if (fig && fig.imageBlob) {
          const url = URL.createObjectURL(fig.imageBlob);
          setLightboxFullFigure(fig);
          setLightboxImageUrl(url);
          setZoomLevel(1);
        } else {
          setLightboxFullFigure(null);
          setLightboxImageUrl(null);
        }
      })
      .catch((err) => {
        console.debug('Lightbox figure notice:', err);
      })
      .finally(() => {
        if (isSubscribed) {
          setIsLightboxLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
      if (lightboxImageUrl) {
        URL.revokeObjectURL(lightboxImageUrl);
      }
    };
  }, [activeFigureId]);

  // Lightbox navigation (Next / Previous)
  const currentFigureIndex = useMemo(() => {
    if (!activeFigureId) return -1;
    return filteredFigures.findIndex((f) => f.id === activeFigureId);
  }, [activeFigureId, filteredFigures]);

  const handlePrevFigure = useCallback(() => {
    if (currentFigureIndex > 0) {
      setActiveFigureId(filteredFigures[currentFigureIndex - 1].id);
    }
  }, [currentFigureIndex, filteredFigures]);

  const handleNextFigure = useCallback(() => {
    if (currentFigureIndex < filteredFigures.length - 1) {
      setActiveFigureId(filteredFigures[currentFigureIndex + 1].id);
    }
  }, [currentFigureIndex, filteredFigures]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeFigureId) return;
      if (e.key === 'Escape') {
        setActiveFigureId(null);
      } else if (e.key === 'ArrowLeft') {
        handlePrevFigure();
      } else if (e.key === 'ArrowRight') {
        handleNextFigure();
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel((z) => Math.min(3, z + 0.25));
      } else if (e.key === '-') {
        setZoomLevel((z) => Math.max(0.5, z - 0.25));
      } else if (e.key === '0') {
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFigureId, handlePrevFigure, handleNextFigure]);

  // Download high-resolution PNG
  const handleDownloadPNG = () => {
    if (!lightboxFullFigure || !lightboxImageUrl) return;
    const link = document.createElement('a');
    link.href = lightboxImageUrl;
    link.download = `doculens-figure-${lightboxFullFigure.documentId}-p${lightboxFullFigure.pageNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Run in-browser OCR on active figure
  const handleExtractOcr = async () => {
    if (!lightboxFullFigure || !lightboxFullFigure.imageBlob) return;

    const controller = new AbortController();
    setOcrAbortController(controller);
    setIsOcrRunning(true);
    setOcrProgress({ percent: 10, message: 'Launching in-browser OCR worker...' });
    setOcrNotice(null);
    setNoteAddedMessage(null);

    try {
      const ocrResult = await runFigureOCR({
        imageBlob: lightboxFullFigure.imageBlob,
        abortSignal: controller.signal,
        onProgress: (percent, message) => setOcrProgress({ percent, message }),
      });

      const confidence = Math.round(ocrResult.confidence);
      const text = ocrResult.text.trim();

      // 1. Update Figure in IndexedDB
      const updatedFig: DocumentFigure = {
        ...lightboxFullFigure,
        ocrText: text,
        ocrConfidence: confidence,
        ocrLanguage: ocrResult.language,
        ocrAt: Date.now(),
      };
      await storage.saveFigure(updatedFig);
      setLightboxFullFigure(updatedFig);

      // Also update summaries in memory so gallery and thumbnails reflect OCR badge
      setFigureSummaries((prev) =>
        prev.map((s) =>
          s.id === updatedFig.id
            ? {
                ...s,
                ocrText: text,
                ocrConfidence: confidence,
                ocrLanguage: ocrResult.language,
                ocrAt: updatedFig.ocrAt,
              }
            : s
        )
      );

      // 2. Search Indexing:
      // "Skip figures with very low confidence (under 30%) when indexing, and say so."
      if (confidence < 30) {
        setOcrNotice('Low OCR confidence (under 30%). Skipped from search index.');
        // Remove any previously indexed chunk if any
        await storage.deleteChunksByFigure(updatedFig.id);
      } else if (text.length > 0) {
        const figureChunk: DocumentChunk = {
          id: `chunk-fig-${updatedFig.id}`,
          documentId: updatedFig.documentId,
          text: text,
          pageStart: updatedFig.pageNumber,
          pageEnd: updatedFig.pageNumber,
          elementIds: updatedFig.captionElementId ? [updatedFig.captionElementId] : [],
          sectionPath: [updatedFig.captionLabel || 'Figure', `Page ${updatedFig.pageNumber}`],
          searchText: text.toLowerCase(),
          sourceType: 'figure',
          figureId: updatedFig.id,
        };
        await storage.saveChunks([figureChunk]);
        setOcrNotice(`Extracted text indexed for lexical search (${confidence}% confidence).`);
      } else {
        setOcrNotice('OCR completed. No legible text detected.');
      }
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        setOcrNotice('OCR extraction cancelled.');
      } else {
        setOcrNotice(`OCR failed: ${err?.message || 'Extraction error'}`);
      }
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
      setOcrAbortController(null);
    }
  };

  const handleCancelOcr = () => {
    if (ocrAbortController) {
      ocrAbortController.abort();
    }
  };

  const handleAddFigureTextAsNote = async () => {
    if (!lightboxFullFigure || !lightboxFullFigure.ocrText) return;
    const noteData = {
      documentId: lightboxFullFigure.documentId,
      pageNumber: lightboxFullFigure.pageNumber,
      selectedText:
        lightboxFullFigure.captionLabel ||
        lightboxFullFigure.caption ||
        `Figure on page ${lightboxFullFigure.pageNumber}`,
      noteText: lightboxFullFigure.ocrText,
    };

    if (onAddNote) {
      onAddNote(noteData);
    } else {
      await storage.saveNote({
        id: `note-${crypto.randomUUID().slice(0, 8)}`,
        createdAt: Date.now(),
        ...noteData,
      });
    }
    setNoteAddedMessage('Saved to document notes!');
    setTimeout(() => setNoteAddedMessage(null), 3000);
  };

  // Scan document(s) for figures
  const handleScanForFigures = async (docIdToScan?: string) => {
    if (documents.length === 0) {
      setScanError('Please ingest a document first before scanning for figures.');
      setTimeout(() => setScanError(null), 4000);
      return;
    }

    setIsScanning(true);
    setScanProgress({ percent: 5, message: 'Preparing figure extraction queue...' });
    setScanError(null);
    setScanSuccess(null);

    const docsToScan = docIdToScan
      ? documents.filter((d) => d.id === docIdToScan)
      : selectedDocFilter !== 'all'
      ? documents.filter((d) => d.id === selectedDocFilter)
      : documents;

    let totalExtractedCount = 0;

    try {
      // Process one document at a time per requirement
      for (let i = 0; i < docsToScan.length; i++) {
        const doc = docsToScan[i];
        const docBasePercent = Math.round((i / docsToScan.length) * 100);

        await figureExtractor.extractFiguresForDocument(doc.id, (progPercent, msg) => {
          const overall = Math.min(99, Math.round(docBasePercent + (progPercent / docsToScan.length)));
          setScanProgress({
            percent: overall,
            message: `[${i + 1}/${docsToScan.length}] ${doc.originalName}: ${msg}`,
          });
        });

        const docFigs = await storage.getFiguresByDocument(doc.id);
        totalExtractedCount += docFigs.length;
      }

      await loadFigureSummaries();
      setScanSuccess(
        `Figure scan complete: ${totalExtractedCount} figure(s) indexed across ${docsToScan.length} document(s).`
      );
      setTimeout(() => setScanSuccess(null), 5000);
    } catch (err: any) {
      setScanError(`Figure scanning failed: ${err?.message || 'Extraction error'}`);
      setTimeout(() => setScanError(null), 5000);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* View Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-paper-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">
              Figure Intelligence & Extracted Visuals
            </h1>
            <span className="text-xs font-mono text-ink-muted bg-paper px-2 py-0.5 rounded border border-paper-border">
              {filteredFigures.length} {filteredFigures.length === 1 ? 'figure' : 'figures'}
            </span>
          </div>
          <p className="text-[13px] text-ink-muted mt-1">
            Embedded raster images, vector schematics, and regional page scan diagrams extracted with
            zero external dependencies.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleScanForFigures()}
            disabled={isScanning || documents.length === 0}
            className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-2 bg-ink hover:opacity-90 text-paper text-[13px] font-semibold rounded-md shadow-xs transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Scan className={`w-4 h-4 text-accent ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan for figures'}</span>
          </button>

          <button
            onClick={loadFigureSummaries}
            disabled={isLoadingFigures}
            title="Refresh figures list"
            aria-label="Refresh figures list"
            className="p-2 border border-paper-border bg-paper hover:bg-paper-dim text-ink-muted hover:text-ink rounded-md transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingFigures ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Progress & Alert Banners */}
      {isScanning && scanProgress && (
        <div className="border border-accent-border bg-paper-light rounded-lg p-4 space-y-2.5 shadow-xs">
          <div className="flex justify-between items-center text-xs text-accent font-medium">
            <span className="flex items-center gap-2">
              <Scan className="w-4 h-4 animate-spin text-accent" />
              <span>{scanProgress.message}</span>
            </span>
            <span className="font-mono">{scanProgress.percent}%</span>
          </div>
          <div className="w-full bg-paper h-2 rounded-full overflow-hidden border border-paper-border">
            <div
              className="bg-accent h-full transition-all duration-300 ease-out"
              style={{ width: `${scanProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {scanSuccess && (
        <div className="border border-emerald-500/40 bg-emerald-950/20 rounded-lg p-3.5 flex items-center gap-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{scanSuccess}</span>
        </div>
      )}

      {scanError && (
        <div className="border border-red-500/40 bg-red-950/20 rounded-lg p-3.5 flex items-center gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{scanError}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-paper-light border border-paper-border p-3 rounded-lg text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Document Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="doc-filter" className="text-ink-muted font-medium whitespace-nowrap">
              Document:
            </label>
            <select
              id="doc-filter"
              value={selectedDocFilter}
              onChange={(e) => setSelectedDocFilter(e.target.value)}
              className="bg-paper border border-paper-border focus:border-accent rounded px-2.5 py-1.5 text-xs text-ink focus:outline-none transition-colors"
            >
              <option value="all">All Documents ({documents.length})</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.originalName}
                </option>
              ))}
            </select>
          </div>

          {/* Page Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="page-filter" className="text-ink-muted font-medium whitespace-nowrap">
              Page:
            </label>
            <select
              id="page-filter"
              value={selectedPageFilter}
              onChange={(e) => setSelectedPageFilter(e.target.value)}
              className="bg-paper border border-paper-border focus:border-accent rounded px-2.5 py-1.5 text-xs text-ink focus:outline-none transition-colors"
            >
              <option value="all">All Pages</option>
              {availablePages.map((pg) => (
                <option key={pg} value={String(pg)}>
                  Page {pg}
                </option>
              ))}
            </select>
          </div>

          {(selectedDocFilter !== 'all' || selectedPageFilter !== 'all') && (
            <button
              onClick={() => {
                setSelectedDocFilter('all');
                setSelectedPageFilter('all');
              }}
              className="text-accent hover:underline text-xs ml-1"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Metadata summary */}
        <div className="text-ink-faint text-right font-mono text-[11px]">
          Showing {filteredFigures.length} of {figureSummaries.length} total
        </div>
      </div>

      {/* Figures Grid or Empty State */}
      {filteredFigures.length === 0 ? (
        /* Empty state: "No figures found" */
        <div className="border border-paper-border bg-paper-light rounded-lg p-10 sm:p-14 text-center text-ink-muted space-y-4">
          <div className="w-14 h-14 rounded-full bg-paper border border-paper-border flex items-center justify-center text-accent mx-auto shadow-xs">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-serif text-xl font-semibold text-ink">No figures found</h3>
            <p className="text-[13px] text-ink-muted max-w-md mx-auto leading-relaxed">
              {figureSummaries.length > 0
                ? 'No figures match the selected document and page filters. Try adjusting your filter settings.'
                : 'No embedded figures or diagrams detected yet. Ingest a PDF or run "Scan for figures" on existing library documents.'}
            </p>
          </div>

          <div className="pt-2">
            {figureSummaries.length > 0 ? (
              <button
                onClick={() => {
                  setSelectedDocFilter('all');
                  setSelectedPageFilter('all');
                }}
                className="inline-flex items-center justify-center min-h-[36px] px-4 py-2 bg-paper-dim hover:bg-paper border border-paper-border rounded-md text-[13px] font-medium text-accent hover:text-accent-hover transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Clear Filters
              </button>
            ) : (
              <button
                onClick={() => handleScanForFigures()}
                disabled={isScanning || documents.length === 0}
                className="inline-flex items-center gap-2 min-h-[38px] px-5 py-2.5 bg-ink hover:opacity-90 text-paper text-[13px] font-semibold rounded-md shadow-xs transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Scan className="w-4 h-4 text-accent" />
                <span>Scan for figures</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Responsive Grid of Thumbnails with Lazy Loading */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFigures.map((fig) => {
            const docName = docNameMap.get(fig.documentId) || 'Document';
            return (
              <div
                key={fig.id}
                onClick={() => setActiveFigureId(fig.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveFigureId(fig.id);
                  }
                }}
                className="group border border-paper-border hover:border-accent bg-paper-light rounded-lg overflow-hidden flex flex-col justify-between shadow-xs transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title={`Open figure from ${docName} (Page ${fig.pageNumber})`}
              >
                {/* Thumbnail container */}
                <div className="relative aspect-[4/3] bg-paper-dim/40 overflow-hidden flex items-center justify-center">
                  {fig.thumbnailUrl ? (
                    <img
                      src={fig.thumbnailUrl}
                      alt={fig.caption || `Figure on page ${fig.pageNumber}`}
                      loading="lazy"
                      className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105 select-none pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-ink-faint gap-1">
                      <ImageIcon className="w-5 h-5 opacity-40" />
                      <span className="text-[10px] font-mono">p.{fig.pageNumber}</span>
                    </div>
                  )}

                  {/* Hover Overlay with Zoom Icon */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="p-1.5 rounded-full bg-paper/90 text-accent shadow-md">
                      <ZoomIn className="w-4 h-4" />
                    </span>
                  </div>

                  {/* Page Badge */}
                  <div className="absolute top-1.5 left-1.5 bg-paper/90 backdrop-blur-xs border border-paper-border px-1.5 py-0.5 rounded text-[10px] font-mono text-accent">
                    p.{fig.pageNumber}
                  </div>
                </div>

                {/* Card Details: Caption under thumbnail */}
                <div className="p-2.5 space-y-1.5 border-t border-paper-border/60">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fig.captionLabel ? (
                        <span className="font-mono text-[10px] font-semibold text-accent bg-accent-subtle border border-accent-border px-1.5 py-0.5 rounded shrink-0">
                          {fig.captionLabel}
                        </span>
                      ) : fig.captionStatus === 'unlinked' ? (
                        <span className="font-mono text-[10px] text-ink-faint bg-paper-dim border border-paper-border px-1 py-0.5 rounded shrink-0">
                          Unlinked
                        </span>
                      ) : null}
                      {fig.ocrText && (
                        <span
                          className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1 py-0.5 rounded shrink-0"
                          title={`OCR Text Extracted (${fig.ocrConfidence || 0}% confidence)`}
                        >
                          OCR
                        </span>
                      )}
                    </div>
                    <div
                      className="font-sans text-xs text-ink line-clamp-2 leading-snug"
                      title={fig.caption || docName}
                    >
                      {fig.caption || `${docName} (p.${fig.pageNumber})`}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-ink-faint pt-1 border-t border-paper-border/40">
                    <span className="truncate max-w-[90px]" title={docName}>
                      {docName}
                    </span>
                    <span>
                      {fig.width}×{fig.height}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {activeFigureId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Figure detail lightbox"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-150"
        >
          {/* Lightbox Top Navigation & Action Bar */}
          <div className="flex items-center justify-between gap-3 text-ink bg-paper-light/90 border border-paper-border rounded-lg px-4 py-2.5 shadow-md">
            {/* Left: Metadata info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-ink truncate">
                  {lightboxFullFigure
                    ? docNameMap.get(lightboxFullFigure.documentId) || 'Document'
                    : 'Loading figure...'}
                </span>
                {lightboxFullFigure && (
                  <span className="text-xs text-accent font-mono">
                    Page {lightboxFullFigure.pageNumber}
                  </span>
                )}
                {lightboxFullFigure && (
                  <span className="text-xs text-ink-faint font-mono hidden sm:inline">
                    · {lightboxFullFigure.width} × {lightboxFullFigure.height}px
                  </span>
                )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Zoom Out */}
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                title="Zoom Out (-)"
                className="p-1.5 rounded hover:bg-paper-dim text-ink-muted hover:text-ink transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono text-ink-muted px-1 min-w-[3rem] text-center select-none">
                {Math.round(zoomLevel * 100)}%
              </span>

              {/* Zoom In */}
              <button
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                title="Zoom In (+)"
                className="p-1.5 rounded hover:bg-paper-dim text-ink-muted hover:text-ink transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Reset Zoom */}
              <button
                onClick={() => setZoomLevel(1)}
                title="Reset Zoom (0)"
                className="p-1.5 rounded hover:bg-paper-dim text-ink-muted hover:text-ink transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-paper-border mx-1" />

              {/* Open in Reader (p.N) */}
              {lightboxFullFigure && (
                <button
                  onClick={() => {
                    const docId = lightboxFullFigure.documentId;
                    const pageNum = lightboxFullFigure.pageNumber;
                    setActiveFigureId(null);
                    onNavigateToReader(docId, pageNum);
                  }}
                  title={`Jump to Page ${lightboxFullFigure.pageNumber} in Reader`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper hover:bg-paper-dim border border-paper-border text-xs font-medium text-ink rounded-md transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <BookOpen className="w-3.5 h-3.5 text-accent" />
                  <span>Open in Reader (p.{lightboxFullFigure.pageNumber})</span>
                </button>
              )}

              {/* Extract text (OCR) */}
              {lightboxFullFigure && (
                <button
                  onClick={handleExtractOcr}
                  disabled={isOcrRunning}
                  title="Extract text from this figure via in-browser OCR"
                  aria-label="Extract text (OCR)"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper hover:bg-paper-dim border border-paper-border text-xs font-medium text-ink rounded-md transition-colors min-h-[36px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <FileText className="w-3.5 h-3.5 text-accent" />
                  <span>{lightboxFullFigure.ocrText ? 'Re-run OCR' : 'Extract text (OCR)'}</span>
                </button>
              )}

              {/* Download PNG */}
              <button
                onClick={handleDownloadPNG}
                title="Download full-resolution PNG"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-text hover:bg-accent-hover text-xs font-semibold rounded-md transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download PNG</span>
              </button>

              <div className="h-4 w-px bg-paper-border mx-1" />

              {/* Close Button */}
              <button
                onClick={() => setActiveFigureId(null)}
                title="Close Lightbox (Esc)"
                aria-label="Close Lightbox"
                className="p-1.5 rounded hover:bg-paper-dim text-ink-muted hover:text-ink transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* OCR Progress Bar & Cancel Button */}
          {isOcrRunning && ocrProgress && (
            <div className="bg-paper-light border border-accent/40 rounded-lg p-3 my-2 flex items-center justify-between gap-4 shadow-md">
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-accent font-medium truncate">{ocrProgress.message}</span>
                  <span className="text-ink font-semibold">{ocrProgress.percent}%</span>
                </div>
                <div className="w-full bg-paper-dim rounded-full h-2 overflow-hidden border border-paper-border">
                  <div
                    className="bg-accent h-full transition-all duration-200 rounded-full"
                    style={{ width: `${ocrProgress.percent}%` }}
                  />
                </div>
              </div>
              <button
                onClick={handleCancelOcr}
                className="px-3 py-1.5 min-h-[32px] rounded border border-rose-500/50 hover:bg-rose-500/10 text-rose-400 text-xs font-medium transition-colors shrink-0"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Lightbox Center Image Stage */}
          <div className="flex-1 relative flex items-center justify-center overflow-auto my-3 p-2">
            {/* Previous Button */}
            {currentFigureIndex > 0 && (
              <button
                onClick={handlePrevFigure}
                title="Previous Figure (Left Arrow)"
                aria-label="Previous Figure"
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-paper-light/80 hover:bg-paper text-ink border border-paper-border shadow-lg transition-transform hover:scale-105 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Next Button */}
            {currentFigureIndex < filteredFigures.length - 1 && (
              <button
                onClick={handleNextFigure}
                title="Next Figure (Right Arrow)"
                aria-label="Next Figure"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-paper-light/80 hover:bg-paper text-ink border border-paper-border shadow-lg transition-transform hover:scale-105 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* Image Canvas / Viewport */}
            {isLightboxLoading ? (
              <div className="flex flex-col items-center gap-3 text-ink-muted">
                <RefreshCw className="w-6 h-6 animate-spin text-accent" />
                <span className="text-xs font-mono">Loading full-resolution bitmap from IndexedDB...</span>
              </div>
            ) : lightboxImageUrl ? (
              <div
                className="flex items-center justify-center max-w-full max-h-full transition-transform duration-150"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'center center',
                }}
              >
                <img
                  src={lightboxImageUrl}
                  alt={lightboxFullFigure?.caption || 'Full resolution figure'}
                  className="max-w-[85vw] max-h-[65vh] object-contain rounded border border-paper-border shadow-2xl select-none"
                  onDoubleClick={() => setZoomLevel((z) => (z === 1 ? 2 : 1))}
                  title="Double click to toggle 2x zoom"
                />
              </div>
            ) : (
              <div className="text-xs text-ink-muted font-mono">
                Failed to load full-size figure bitmap.
              </div>
            )}
          </div>

          {/* Extracted OCR Text Panel & Note Button */}
          {lightboxFullFigure?.ocrText && (
            <div className="bg-paper-light border border-paper-border rounded-lg p-3 shadow-md space-y-2 max-h-40 overflow-y-auto shrink-0 mb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-accent bg-accent-subtle border border-accent-border px-1.5 py-0.5 rounded">
                    OCR
                  </span>
                  <span className="font-mono text-xs text-ink-muted">
                    Confidence: <strong className="text-ink">{lightboxFullFigure.ocrConfidence || 0}%</strong>
                  </span>
                  {lightboxFullFigure.captionLabel && (
                    <span className="font-mono text-xs text-ink-faint">
                      · {lightboxFullFigure.captionLabel}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {noteAddedMessage && (
                    <span className="text-xs text-emerald-400 font-medium animate-in fade-in">
                      {noteAddedMessage}
                    </span>
                  )}
                  <button
                    onClick={handleAddFigureTextAsNote}
                    title="Save extracted OCR text as a document note"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-paper hover:bg-paper-dim border border-paper-border text-xs font-medium text-ink rounded transition-colors"
                  >
                    <StickyNote className="w-3.5 h-3.5 text-accent" />
                    <span>Add as note</span>
                  </button>
                </div>
              </div>

              {/* Text content */}
              <div className="p-2 bg-paper rounded border border-paper-border font-mono text-xs text-ink leading-relaxed whitespace-pre-wrap select-text">
                {lightboxFullFigure.ocrText}
              </div>

              {ocrNotice && (
                <div className="text-[11px] font-mono text-amber-400/90 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{ocrNotice}</span>
                </div>
              )}
            </div>
          )}

          {/* OCR Notice if no text currently but notice exists */}
          {!lightboxFullFigure?.ocrText && ocrNotice && (
            <div className="bg-paper-light border border-paper-border rounded-lg p-2.5 text-xs font-mono text-amber-400 flex items-center justify-between gap-2 shadow-xs shrink-0 mb-2">
              <span>{ocrNotice}</span>
              <button
                onClick={() => setOcrNotice(null)}
                className="text-ink-faint hover:text-ink p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Lightbox Footer Provenance */}
          <div className="text-center text-[11px] font-mono text-ink-faint py-1">
            Figure {currentFigureIndex + 1} of {filteredFigures.length} · Use Left/Right keys to navigate, + / - to zoom, Esc to exit
          </div>
        </div>
      )}
    </div>
  );
};
