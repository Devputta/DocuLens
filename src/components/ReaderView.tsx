import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
  Crosshair,
  Printer,
  FileWarning,
  Search,
  X,
  Highlighter,
  FileText,
  PanelLeft,
  PanelLeftOpen,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Crop,
  Copy,
  Check,
  Edit2,
  Filter,
} from 'lucide-react';
import {
  DocumentEntity,
  DocumentElement,
  MarginaliaNote,
  DocumentFigure,
  AnnotationColor,
} from '../types/doculens';
import { PageThumbnail } from './PageThumbnail';
import { thumbnailService } from '../services/thumbnailService';
import { storage } from '../services/storage';
import {
  splitTextWithAnnotationsAndSearch,
  ANNOTATION_COLORS,
  getAnnotationColorMeta,
  downloadAnnotationsMarkdown,
} from '../services/annotationService';
import {
  screenToPdfCoordinates,
  normalizeScreenRect,
  renderPdfRegionAt2x,
  copyImageToClipboard,
  downloadImageBlob,
  ScreenRect,
  PdfRect,
  NormalizedRect,
} from '../services/regionCapture';
import { ExportMenu } from './ExportMenu';

interface ReaderViewProps {
  documents: DocumentEntity[];
  selectedDocId?: string;
  onSelectDoc: (id: string) => void;
  elements: DocumentElement[];
  notes: MarginaliaNote[];
  onAddNote: (note: {
    documentId: string;
    pageNumber: number;
    selectedText: string;
    noteText: string;
    elementId?: string;
    startOffset?: number;
    endOffset?: number;
    color?: AnnotationColor;
    imageBlob?: Blob;
  }) => Promise<void>;
  onUpdateNote?: (note: MarginaliaNote) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  targetPage?: number;
  highlightQuery?: string;
  targetElementId?: string;
  onClearHighlight?: () => void;
  onOpenFigure?: (figureId: string) => void;
}

interface FloatingToolbarState {
  top: number;
  left: number;
  elementId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

interface CaptureResultState {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  norm: NormalizedRect;
  pdfRect: PdfRect;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  documents,
  selectedDocId,
  onSelectDoc,
  elements,
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  targetPage,
  highlightQuery: initialHighlightQuery,
  targetElementId,
  onClearHighlight,
  onOpenFigure,
}) => {
  const currentDoc = documents.find((d) => d.id === selectedDocId) || documents[0];
  const [currentPage, setCurrentPage] = useState<number>(targetPage || 1);
  const [pageInput, setPageInput] = useState<string>(String(targetPage || 1));
  const [selectedElement, setSelectedElement] = useState<DocumentElement | null>(null);
  const [citedElementId, setCitedElementId] = useState<string | null>(targetElementId || null);

  // Document figures and in-reader lightbox state
  const [docFigures, setDocFigures] = useState<DocumentFigure[]>([]);
  const [activeLightboxFigure, setActiveLightboxFigure] = useState<DocumentFigure | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);

  // Load figures for current document
  useEffect(() => {
    if (!currentDoc?.id) {
      setDocFigures([]);
      return;
    }
    let isMounted = true;
    storage.getFiguresByDocument(currentDoc.id).then((figs) => {
      if (isMounted) {
        setDocFigures(figs);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentDoc?.id]);

  // Handle lightbox image url lifecycle
  useEffect(() => {
    if (activeLightboxFigure?.imageBlob) {
      const url = URL.createObjectURL(activeLightboxFigure.imageBlob);
      setLightboxImageUrl(url);
      setLightboxZoom(1);
      return () => {
        URL.revokeObjectURL(url);
        setLightboxImageUrl(null);
      };
    } else {
      setLightboxImageUrl(null);
    }
  }, [activeLightboxFigure]);

  const [newNoteText, setNewNoteText] = useState('');
  const [selectedTextForNote, setSelectedTextForNote] = useState('');
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isThumbnailStripOpen, setIsThumbnailStripOpen] = useState(true);
  const activeThumbButtonRef = useRef<HTMLButtonElement | null>(null);

  // In-Reader Search & Term Highlighting State
  const [activeHighlightQuery, setActiveHighlightQuery] = useState<string>(
    initialHighlightQuery || ''
  );
  const [debouncedHighlightQuery, setDebouncedHighlightQuery] = useState<string>(
    initialHighlightQuery || ''
  );
  const [isSearchToolbarOpen, setIsSearchToolbarOpen] = useState(
    Boolean(initialHighlightQuery)
  );

  // Debounce the highlight query by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHighlightQuery(activeHighlightQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [activeHighlightQuery]);

  // Floating Annotation Selection Toolbar State
  const [selectionToolbar, setSelectionToolbar] = useState<FloatingToolbarState | null>(null);
  const [isAddingNoteInline, setIsAddingNoteInline] = useState(false);
  const [inlineNoteDraft, setInlineNoteDraft] = useState('');
  const [selectedColorForInlineNote, setSelectedColorForInlineNote] = useState<AnnotationColor>('amber');

  // Annotation Panel Filter & Edit State
  const [annotationColorFilter, setAnnotationColorFilter] = useState<AnnotationColor | 'all'>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState<string>('');

  // Region Capture State
  const [isCaptureModeActive, setIsCaptureModeActive] = useState(false);
  const [captureStartPoint, setCaptureStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [captureCurrentRect, setCaptureCurrentRect] = useState<ScreenRect | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResultState | null>(null);
  const [isCapturingPdf, setIsCapturingPdf] = useState(false);
  const [captureActionFeedback, setCaptureActionFeedback] = useState<string | null>(null);
  const [captureNoteDraft, setCaptureNoteDraft] = useState<string>('');
  const [isAttachingCaptureToNote, setIsAttachingCaptureToNote] = useState(false);

  // Cancel pending thumbnail renders
  useEffect(() => {
    return () => {
      thumbnailService.cancelPendingRenders('reader');
    };
  }, []);

  useEffect(() => {
    thumbnailService.cancelPendingRenders('reader');
  }, [currentDoc?.id]);

  // Smoothly scroll active thumbnail button into view
  useEffect(() => {
    if (activeThumbButtonRef.current && isThumbnailStripOpen) {
      activeThumbButtonRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [currentPage, isThumbnailStripOpen]);

  const handleThumbnailClick = (pageNum: number) => {
    if (pageNum === currentPage) return;
    setCurrentPage(pageNum);
    setPageInput(String(pageNum));
    setSelectedElement(null);
    setCitedElementId(null);
    setSelectionToolbar(null);
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const firstMatchRef = useRef<HTMLSpanElement>(null);
  const lastHandledNavRef = useRef<string | null>(null);
  const lastScrolledQueryRef = useRef<string>('');

  // Sync highlight query from external navigation
  useEffect(() => {
    if (initialHighlightQuery !== undefined) {
      setActiveHighlightQuery(initialHighlightQuery);
      setDebouncedHighlightQuery(initialHighlightQuery);
      if (initialHighlightQuery) {
        setIsSearchToolbarOpen(true);
      }
    }
  }, [initialHighlightQuery]);

  // Filter elements for the current document
  const docElements = React.useMemo(
    () => (currentDoc ? elements.filter((e) => e.documentId === currentDoc.id) : []),
    [currentDoc?.id, elements]
  );
  const totalPages = currentDoc
    ? Math.max(1, currentDoc.pageCount, ...docElements.map((e) => e.pageNumber))
    : 1;

  // Sync targetPage prop when it changes
  useEffect(() => {
    if (targetPage && targetPage >= 1 && targetPage <= totalPages) {
      setCurrentPage(targetPage);
      setPageInput(String(targetPage));
    }
  }, [targetPage, totalPages]);

  // Auto-scroll to cited or highlighted element
  useEffect(() => {
    if (!targetElementId && !initialHighlightQuery) {
      return;
    }

    const navToken = `${currentDoc?.id || ''}:${targetPage || 1}:${targetElementId || ''}:${initialHighlightQuery || ''}`;
    if (lastHandledNavRef.current === navToken) {
      return;
    }

    const matchEl = targetElementId
      ? elements.find((e) => e.id === targetElementId && (!currentDoc || e.documentId === currentDoc.id))
      : initialHighlightQuery
      ? elements.find(
          (e) =>
            (!currentDoc || e.documentId === currentDoc.id) &&
            e.content.toLowerCase().includes(initialHighlightQuery.toLowerCase())
        )
      : null;

    if (!matchEl) {
      return;
    }

    lastHandledNavRef.current = navToken;
    setSelectedElement(matchEl);
    setCitedElementId(matchEl.id);
    if (matchEl.pageNumber !== currentPage) {
      setCurrentPage(matchEl.pageNumber);
      setPageInput(String(matchEl.pageNumber));
    }

    const timer = setTimeout(() => {
      const domEl = document.getElementById(`doc-el-${matchEl.id}`);
      if (domEl) {
        domEl.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }, 80);
  }, [targetElementId, initialHighlightQuery, currentDoc?.id, targetPage, elements]);

  // Auto-scroll to the first search match
  useEffect(() => {
    const trimmed = debouncedHighlightQuery.trim();
    if (!trimmed) {
      lastScrolledQueryRef.current = '';
      return;
    }
    if (lastScrolledQueryRef.current === trimmed) {
      return;
    }
    lastScrolledQueryRef.current = trimmed;
    if (firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [debouncedHighlightQuery]);

  // Keep page within bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
      setPageInput(String(totalPages));
    }
  }, [totalPages, currentPage]);

  // Keyboard navigation & Esc cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCaptureModeActive) {
          setIsCaptureModeActive(false);
          setCaptureStartPoint(null);
          setCaptureCurrentRect(null);
          return;
        }
        if (selectionToolbar) {
          setSelectionToolbar(null);
          setIsAddingNoteInline(false);
          window.getSelection()?.removeAllRanges();
          return;
        }
        setSelectedElement(null);
        setCitedElementId(null);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (currentPage > 1) {
          setCurrentPage((p) => {
            const next = p - 1;
            setPageInput(String(next));
            return next;
          });
          setSelectedElement(null);
          setCitedElementId(null);
          setSelectionToolbar(null);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentPage < totalPages) {
          setCurrentPage((p) => {
            const next = p + 1;
            setPageInput(String(next));
            return next;
          });
          setSelectedElement(null);
          setCitedElementId(null);
          setSelectionToolbar(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, isCaptureModeActive, selectionToolbar]);

  // Page elements & notes
  const pageElements = docElements.filter((e) => e.pageNumber === currentPage);
  const documentNotes = notes.filter((n) => n.documentId === currentDoc?.id);
  const pageNotes = documentNotes.filter((n) => n.pageNumber === currentPage);

  // Filter notes by color
  const filteredNotes = React.useMemo(() => {
    if (annotationColorFilter === 'all') {
      return documentNotes;
    }
    return documentNotes.filter((n) => n.color === annotationColorFilter);
  }, [documentNotes, annotationColorFilter]);

  // Count search matches
  const pageMatchesCount = React.useMemo(() => {
    if (!debouncedHighlightQuery.trim()) return 0;
    const lowerQ = debouncedHighlightQuery.toLowerCase();
    let count = 0;
    for (const el of pageElements) {
      let idx = 0;
      const lower = el.content.toLowerCase();
      while ((idx = lower.indexOf(lowerQ, idx)) !== -1) {
        count++;
        idx += Math.max(1, lowerQ.length);
      }
    }
    return count;
  }, [pageElements, debouncedHighlightQuery]);

  // Handle Text Selection in Paragraphs to pop up the 4-color + Note Toolbar
  const handleCanvasMouseUp = useCallback(() => {
    // If capture mode is active, do not trigger text selection toolbar
    if (isCaptureModeActive) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (!isAddingNoteInline) {
        setSelectionToolbar(null);
      }
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      if (!isAddingNoteInline) {
        setSelectionToolbar(null);
      }
      return;
    }

    // Identify which element was selected
    let anchorNode = selection.anchorNode;
    let elementContainer: HTMLElement | null = null;

    while (anchorNode && anchorNode !== canvasRef.current) {
      if (anchorNode instanceof HTMLElement && anchorNode.hasAttribute('data-element-id')) {
        elementContainer = anchorNode;
        break;
      }
      anchorNode = anchorNode.parentNode;
    }

    if (!elementContainer) {
      return;
    }

    const elId = elementContainer.getAttribute('data-element-id');
    const matchedEl = docElements.find((e) => e.id === elId);
    if (!matchedEl) {
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(elementContainer);
      preRange.setEnd(range.startContainer, range.startOffset);

      let startOffset = preRange.toString().length;
      let endOffset = startOffset + selectedText.length;

      // Adjust with indexOf in content for robustness
      const exactIndex = matchedEl.content.indexOf(selectedText, Math.max(0, startOffset - 15));
      if (exactIndex !== -1) {
        startOffset = exactIndex;
        endOffset = exactIndex + selectedText.length;
      }

      const rect = range.getBoundingClientRect();
      const canvasRect = canvasRef.current?.getBoundingClientRect();

      if (canvasRect) {
        setSelectionToolbar({
          top: Math.max(10, rect.top - canvasRect.top - 46),
          left: Math.max(10, Math.min(canvasRect.width - 250, rect.left - canvasRect.left + rect.width / 2 - 120)),
          elementId: matchedEl.id,
          selectedText,
          startOffset,
          endOffset,
        });
        setIsAddingNoteInline(false);
        setInlineNoteDraft('');
      }
    } catch {
      // Range calculation fallback
    }
  }, [isCaptureModeActive, docElements, isAddingNoteInline]);

  // Create an annotation from the selection toolbar
  const handleCreateAnnotation = async (color: AnnotationColor, noteText: string = '') => {
    if (!selectionToolbar || !currentDoc) return;

    await onAddNote({
      documentId: currentDoc.id,
      pageNumber: currentPage,
      selectedText: selectionToolbar.selectedText,
      noteText,
      elementId: selectionToolbar.elementId,
      startOffset: selectionToolbar.startOffset,
      endOffset: selectionToolbar.endOffset,
      color,
    });

    setSelectionToolbar(null);
    setIsAddingNoteInline(false);
    setInlineNoteDraft('');
    window.getSelection()?.removeAllRanges();
  };

  // Region Capture Drag Mechanics
  const handleCaptureMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCaptureModeActive || !canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCaptureStartPoint({ x, y });
    setCaptureCurrentRect({ x, y, width: 0, height: 0 });
  };

  const handleCaptureMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCaptureModeActive || !captureStartPoint || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const x = Math.min(captureStartPoint.x, currentX);
    const y = Math.min(captureStartPoint.y, currentY);
    const width = Math.abs(currentX - captureStartPoint.x);
    const height = Math.abs(currentY - captureStartPoint.y);

    setCaptureCurrentRect({ x, y, width, height });
  };

  const finalizeCapture = async () => {
    if (!captureCurrentRect || !canvasRef.current || !currentDoc) {
      setCaptureStartPoint(null);
      setCaptureCurrentRect(null);
      return;
    }

    if (captureCurrentRect.width < 10 || captureCurrentRect.height < 10) {
      setCaptureStartPoint(null);
      setCaptureCurrentRect(null);
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const normalized = normalizeScreenRect(captureCurrentRect, rect.width, rect.height, 1.0);

    // Standard unscaled PDF dimensions (letter 612x792 or proportional)
    const pdfW = 612;
    const pdfH = Math.round((rect.height / rect.width) * 612);

    const pdfCoords = screenToPdfCoordinates({
      screenRect: captureCurrentRect,
      domWidth: rect.width,
      domHeight: rect.height,
      pdfWidth: pdfW,
      pdfHeight: pdfH,
      zoomLevel: 1.0,
    });

    setIsCapturingPdf(true);
    setIsCaptureModeActive(false);

    try {
      const result = await renderPdfRegionAt2x({
        documentId: currentDoc.id,
        pageNumber: currentPage,
        normalizedRect: normalized,
        fallbackText: `DocuLens Page ${currentPage} Region`,
      });

      const previewUrl = URL.createObjectURL(result.blob);
      setCaptureResult({
        blob: result.blob,
        previewUrl,
        width: result.width,
        height: result.height,
        norm: normalized,
        pdfRect: pdfCoords,
      });
    } catch (err) {
      console.debug('Region capture notice:', err);
    } finally {
      setIsCapturingPdf(false);
      setCaptureStartPoint(null);
      setCaptureCurrentRect(null);
    }
  };

  const handleCaptureMouseUp = () => {
    if (captureStartPoint) {
      finalizeCapture();
    }
  };

  // Touch support for region capture
  const handleCaptureTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isCaptureModeActive || !canvasRef.current || !e.touches[0]) return;
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    setCaptureStartPoint({ x, y });
    setCaptureCurrentRect({ x, y, width: 0, height: 0 });
  };

  const handleCaptureTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isCaptureModeActive || !captureStartPoint || !canvasRef.current || !e.touches[0]) return;
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, touch.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, touch.clientY - rect.top));

    const x = Math.min(captureStartPoint.x, currentX);
    const y = Math.min(captureStartPoint.y, currentY);
    const width = Math.abs(currentX - captureStartPoint.x);
    const height = Math.abs(currentY - captureStartPoint.y);

    setCaptureCurrentRect({ x, y, width, height });
  };

  const handleCaptureTouchEnd = () => {
    if (captureStartPoint) {
      finalizeCapture();
    }
  };

  // Capture Actions
  const handleDownloadCapture = () => {
    if (!captureResult || !currentDoc) return;
    downloadImageBlob(
      captureResult.blob,
      `doculens_${currentDoc.originalName.replace(/\s+/g, '_')}_p${currentPage}_capture.png`
    );
  };

  const handleCopyCapture = async () => {
    if (!captureResult) return;
    const success = await copyImageToClipboard(captureResult.blob);
    if (success) {
      setCaptureActionFeedback('Copied PNG to clipboard!');
      setTimeout(() => setCaptureActionFeedback(null), 2500);
    } else {
      setCaptureActionFeedback('Clipboard access restricted');
      setTimeout(() => setCaptureActionFeedback(null), 2500);
    }
  };

  const handleSaveCaptureToFigures = async () => {
    if (!captureResult || !currentDoc) return;

    const newFig: DocumentFigure = {
      id: `fig-cap-${crypto.randomUUID().slice(0, 8)}`,
      documentId: currentDoc.id,
      pageNumber: currentPage,
      bbox: [
        captureResult.pdfRect.x,
        captureResult.pdfRect.y,
        captureResult.pdfRect.width,
        captureResult.pdfRect.height,
      ],
      width: captureResult.width,
      height: captureResult.height,
      imageBlob: captureResult.blob,
      thumbnailBlob: captureResult.blob,
      type: 'embedded-image',
      hash: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      caption: `Captured region from page ${currentPage}`,
      captionLabel: `Region p.${currentPage}`,
      createdAt: Date.now(),
    };

    await storage.saveFigure(newFig);
    setDocFigures((prev) => [newFig, ...prev]);
    setCaptureActionFeedback('Saved to Figures library!');
    setTimeout(() => setCaptureActionFeedback(null), 2500);
  };

  const handleAttachCaptureToNote = async () => {
    if (!captureResult || !currentDoc) return;

    await onAddNote({
      documentId: currentDoc.id,
      pageNumber: currentPage,
      selectedText: `Region capture [${Math.round(captureResult.norm.x * 100)}%, ${Math.round(captureResult.norm.y * 100)}%]`,
      noteText: captureNoteDraft.trim() || `Page ${currentPage} captured region`,
      color: 'amber',
      imageBlob: captureResult.blob,
    });

    setIsAttachingCaptureToNote(false);
    setCaptureNoteDraft('');
    setCaptureActionFeedback('Attached capture to Marginalia note!');
    setTimeout(() => {
      setCaptureActionFeedback(null);
      setCaptureResult(null);
    }, 1500);
  };

  const handleCloseCaptureResult = () => {
    if (captureResult?.previewUrl) {
      URL.revokeObjectURL(captureResult.previewUrl);
    }
    setCaptureResult(null);
    setIsAttachingCaptureToNote(false);
    setCaptureNoteDraft('');
  };

  if (!currentDoc) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-muted space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-paper-light border border-paper-border p-3 flex items-center justify-center shadow-xs">
          <img
            src="/doculens-mark-transparent.png"
            alt="DocuLens Emblem"
            className="w-full h-full object-contain"
          />
        </div>
        <p className="font-serif text-xl font-medium text-ink">
          No documents loaded for reading
        </p>
      </div>
    );
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prev = currentPage - 1;
      setCurrentPage(prev);
      setPageInput(String(prev));
      setSelectedElement(null);
      setCitedElementId(null);
      setSelectionToolbar(null);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const next = currentPage + 1;
      setCurrentPage(next);
      setPageInput(String(next));
      setSelectedElement(null);
      setCitedElementId(null);
      setSelectionToolbar(null);
    }
  };

  const handlePageJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      setCurrentPage(parsed);
      setSelectedElement(null);
      setCitedElementId(null);
      setSelectionToolbar(null);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    await onAddNote({
      documentId: currentDoc.id,
      pageNumber: currentPage,
      selectedText: selectedTextForNote.trim() || `Page ${currentPage} observation`,
      noteText: newNoteText.trim(),
      color: 'amber',
    });
    setNewNoteText('');
    setSelectedTextForNote('');
  };

  const clearHighlighting = () => {
    setActiveHighlightQuery('');
    setDebouncedHighlightQuery('');
    setSelectedElement(null);
    setCitedElementId(null);
    if (onClearHighlight) onClearHighlight();
  };

  /**
   * Renders paragraph text combining annotations and search highlights without animations
   */
  const renderAnnotatedAndHighlightedContent = (el: DocumentElement, isFirstEl: boolean) => {
    const elAnnotations = pageNotes.filter((n) => n.elementId === el.id);

    // If neither annotations nor search query exist, return plain text
    if (elAnnotations.length === 0 && !debouncedHighlightQuery.trim()) {
      return <span>{el.content}</span>;
    }

    const slices = splitTextWithAnnotationsAndSearch(
      el.content,
      elAnnotations,
      debouncedHighlightQuery
    );

    let isFirstMatchAssigned = false;

    return (
      <>
        {slices.map((slice, i) => {
          const colorMeta = slice.activeColor ? getAnnotationColorMeta(slice.activeColor) : null;
          const assignRef = isFirstEl && slice.isSearchMatch && !isFirstMatchAssigned;
          if (assignRef) isFirstMatchAssigned = true;

          // Combined search highlight + annotation
          if (slice.isSearchMatch && colorMeta) {
            return (
              <mark
                key={i}
                ref={assignRef ? (firstMatchRef as any) : undefined}
                className={`${colorMeta.bgClass} outline outline-1 outline-[#E8A94A] font-medium rounded-[2px] transition-none animate-none px-0.5`}
                title={`Annotation (${colorMeta.label}) + Search Match`}
              >
                {slice.text}
              </mark>
            );
          }

          // Search match only
          if (slice.isSearchMatch) {
            return (
              <mark
                key={i}
                ref={assignRef ? (firstMatchRef as any) : undefined}
                className="bg-[#E8A94A]/65 text-[#0F1217] font-normal no-underline rounded-[3px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-none animate-none px-1 py-0.5"
                title={`Match for "${debouncedHighlightQuery}"`}
              >
                {slice.text}
              </mark>
            );
          }

          // Annotation only
          if (colorMeta) {
            const hasNote = slice.annotations.some((a) => a.noteText && a.noteText.trim());
            return (
              <span
                key={i}
                className={`${colorMeta.bgClass} ${colorMeta.borderClass} rounded-[2px] px-0.5 transition-none animate-none`}
                title={hasNote ? `Note: ${slice.annotations[0].noteText}` : `Highlight (${colorMeta.label})`}
              >
                {slice.text}
              </span>
            );
          }

          return <span key={i}>{slice.text}</span>;
        })}
      </>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Top Reading Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-paper-border bg-paper-light p-3 sm:p-4 rounded-lg shadow-xs">
        {/* Document Switcher */}
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="w-4 h-4 text-ink-faint shrink-0" />
          <select
            id="reader-doc-select"
            aria-label="Select document to read"
            value={currentDoc.id}
            onChange={(e) => {
              onSelectDoc(e.target.value);
              setCurrentPage(1);
              setPageInput('1');
              setSelectedElement(null);
              setSelectionToolbar(null);
            }}
            className="text-[13px] font-sans font-medium bg-paper border border-paper-border hover:border-accent text-ink rounded-md px-3 py-1.5 min-h-[36px] max-w-xs truncate cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id} className="bg-paper-light text-ink">
                {d.originalName} ({d.pageCount}p){d.ocrProcessed ? ' [OCR]' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Page Stepper, Capture Tool & Provenance Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            aria-label="Previous Page (Left Arrow)"
            title="Previous Page (←)"
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-dim border border-paper-border rounded-md transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Direct page jump form */}
          <form onSubmit={handlePageJumpSubmit} className="flex items-center gap-1.5 text-[13px] text-ink font-sans">
            <span className="text-ink-faint">Page</span>
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => {
                const p = parseInt(pageInput, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                  setCurrentPage(p);
                } else {
                  setPageInput(String(currentPage));
                }
              }}
              className="w-14 min-h-[36px] text-center font-mono font-medium bg-paper border border-paper-border focus:border-accent rounded-md py-1 px-2 text-[13px] text-ink transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Go to page"
            />
            <span className="text-ink-faint">of {totalPages}</span>
            {currentDoc?.isReflowed && (
              <span
                className="ml-1 px-1.5 py-0.5 text-[10px] font-mono tracking-wide rounded bg-[#262D38] text-[#9AA3B2] border border-[#343D4B]"
                title="Virtual paginated pages from reflowed source"
              >
                reflowed
              </span>
            )}
          </form>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            aria-label="Next Page (Right Arrow)"
            title="Next Page (→)"
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-dim border border-paper-border rounded-md transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-paper-border mx-1" />

          {/* Region Capture Button */}
          <button
            onClick={() => {
              setIsCaptureModeActive(!isCaptureModeActive);
              setCaptureStartPoint(null);
              setCaptureCurrentRect(null);
              setSelectionToolbar(null);
            }}
            title={isCaptureModeActive ? 'Cancel Region Capture (Esc)' : 'Capture Region on Canvas'}
            aria-label="Capture Region"
            className={`px-3 py-1.5 min-h-[36px] border rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isCaptureModeActive
                ? 'border-accent text-accent bg-accent-subtle ring-1 ring-accent'
                : 'border-paper-border text-ink-muted hover:text-ink hover:bg-paper-dim bg-paper'
            }`}
          >
            <Crop className="w-4 h-4" />
            <span className="hidden sm:inline">{isCaptureModeActive ? 'Cancel' : 'Capture'}</span>
          </button>

          {/* Toggle Thumbnail Strip */}
          <button
            onClick={() => setIsThumbnailStripOpen(!isThumbnailStripOpen)}
            title="Toggle Page Thumbnail Strip"
            aria-label="Toggle Page Thumbnail Strip"
            className={`px-3 py-1.5 min-h-[36px] border rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isThumbnailStripOpen
                ? 'border-accent text-accent bg-accent-subtle'
                : 'border-paper-border text-ink-muted hover:text-ink hover:bg-paper-dim bg-paper'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Thumbnails</span>
          </button>

          {/* Toggle In-Page Search Toolbar */}
          <button
            onClick={() => setIsSearchToolbarOpen(!isSearchToolbarOpen)}
            title="Find & Highlight on Page"
            aria-label="Toggle Page Search Highlighting"
            className={`px-3 py-1.5 min-h-[36px] border rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isSearchToolbarOpen || activeHighlightQuery
                ? 'border-accent text-accent bg-accent-subtle'
                : 'border-paper-border text-ink-muted hover:text-ink hover:bg-paper-dim bg-paper'
            }`}
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Highlight</span>
          </button>

          {/* Export Menu for Annotations & Print */}
          <ExportMenu
            items={[
              {
                label: 'Export Annotations (Markdown)',
                hint: 'Clean markdown with pages & quotes',
                icon: <Bookmark className="w-4 h-4 text-accent" />,
                onClick: () =>
                  downloadAnnotationsMarkdown(currentDoc.originalName, documentNotes),
              },
              {
                label: 'Print Page View',
                hint: 'Printer-friendly page layout',
                icon: <Printer className="w-4 h-4 text-ink-faint" />,
                onClick: () => window.print(),
              },
            ]}
          />

          {/* Toggle Inspector */}
          <button
            onClick={() => setIsInspectorOpen(!isInspectorOpen)}
            title="Toggle Annotations & Inspector Sidebar"
            aria-label="Toggle Annotations Sidebar"
            className={`px-3 py-1.5 min-h-[36px] border rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isInspectorOpen
                ? 'border-accent text-accent bg-accent-subtle'
                : 'border-paper-border text-ink-muted hover:text-ink hover:bg-paper-dim bg-paper'
            }`}
          >
            {isInspectorOpen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">Annotations</span>
          </button>
        </div>
      </div>

      {/* In-Reader Search & Highlight Toolbar */}
      {isSearchToolbarOpen && (
        <div className="border border-paper-border bg-paper p-3 sm:p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2.5 flex-1">
            <Highlighter className="w-4 h-4 text-accent shrink-0" />
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={activeHighlightQuery}
                onChange={(e) => setActiveHighlightQuery(e.target.value)}
                placeholder="Type word or phrase to highlight..."
                className="w-full min-h-[36px] bg-paper-light border border-paper-border focus:border-accent rounded-md px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-faint transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              {activeHighlightQuery && (
                <button
                  type="button"
                  onClick={clearHighlighting}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1 min-h-[28px] min-w-[28px] flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {activeHighlightQuery.trim() ? (
              <span className="font-mono text-xs text-ink-muted bg-paper-light px-2.5 py-1.5 rounded-md border border-paper-border">
                {pageMatchesCount} match{pageMatchesCount === 1 ? '' : 'es'} on Page {currentPage}
              </span>
            ) : null}

            {activeHighlightQuery && (
              <button
                onClick={clearHighlighting}
                className="text-xs text-ink-faint hover:text-accent px-2 py-1.5 underline transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Region Capture Banner when selection mode is active */}
      {isCaptureModeActive && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg text-[13px] flex items-center justify-between gap-2 shadow-xs transition-none animate-none">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-accent shrink-0" />
            <span>
              <strong>Capture Mode:</strong> Click and drag a rectangle over the page canvas to capture at 2x. Press <strong>Esc</strong> to cancel.
            </span>
          </div>
          <button
            onClick={() => setIsCaptureModeActive(false)}
            className="text-xs font-mono text-ink hover:text-accent px-2 py-1 border border-paper-border rounded bg-paper"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Main Reading Workspace Split */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Collapsible Left Thumbnail Strip */}
        {isThumbnailStripOpen ? (
          <aside
            aria-label="Page Thumbnails"
            className="w-full lg:w-44 shrink-0 border border-paper-border bg-paper-light rounded-lg p-3 space-y-3 shadow-xs lg:sticky lg:top-4 max-h-[340px] lg:max-h-[calc(100vh-6rem)] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-paper-border pb-2 text-xs font-mono text-ink-muted">
              <span>{totalPages} Pages</span>
              <button
                type="button"
                onClick={() => setIsThumbnailStripOpen(false)}
                title="Collapse thumbnail strip"
                aria-label="Collapse thumbnail strip"
                className="p-1 text-ink-faint hover:text-ink rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-x-hidden pb-1 lg:pb-0">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => {
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    ref={isActive ? (activeThumbButtonRef as any) : undefined}
                    type="button"
                    onClick={() => handleThumbnailClick(pageNum)}
                    aria-label={`Jump to page ${pageNum}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`shrink-0 w-28 lg:w-full text-left p-1.5 rounded-md border transition-all text-xs flex flex-col items-center gap-1.5 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isActive
                        ? 'border-accent bg-accent-subtle/50 ring-1 ring-accent'
                        : 'border-paper-border bg-paper hover:border-paper-border-dark hover:bg-paper-dim'
                    }`}
                  >
                    <div className="w-full aspect-[3/4] rounded overflow-hidden bg-paper-light border border-paper-border/60">
                      <PageThumbnail
                        documentId={currentDoc.id}
                        pageNumber={pageNum}
                        viewScope="reader"
                        alt={`Page ${pageNum} thumbnail`}
                      />
                    </div>
                    <span
                      className={`font-mono text-[11px] ${
                        isActive ? 'text-accent font-semibold' : 'text-ink-muted group-hover:text-ink'
                      }`}
                    >
                      Page {pageNum}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        ) : (
          <div className="hidden lg:block shrink-0 sticky top-4">
            <button
              type="button"
              onClick={() => setIsThumbnailStripOpen(true)}
              title="Expand page thumbnails"
              aria-label="Expand page thumbnails"
              className="p-2 border border-paper-border bg-paper-light hover:bg-paper-dim text-ink-muted hover:text-accent rounded-lg flex flex-col items-center gap-2 transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PanelLeftOpen className="w-4 h-4 text-accent" />
              <span className="[writing-mode:vertical-rl] rotate-180 font-mono text-[11px] tracking-wider text-ink-faint">
                Pages ({totalPages})
              </span>
            </button>
          </div>
        )}

        {/* Center Canvas and Right Inspector */}
        <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Document Canvas (Page Surface) */}
          <div
            ref={canvasRef}
            onMouseUp={handleCanvasMouseUp}
            className={`${
              isInspectorOpen ? 'lg:col-span-8' : 'lg:col-span-12'
            } border border-paper-border-dark bg-paper-light rounded-lg shadow-xs min-h-[680px] p-6 sm:p-10 space-y-6 relative select-text`}
          >
            {/* Region Capture Drag Selection Overlay (Only active when Capture Mode is on) */}
            {isCaptureModeActive && (
              <div
                onMouseDown={handleCaptureMouseDown}
                onMouseMove={handleCaptureMouseMove}
                onMouseUp={handleCaptureMouseUp}
                onTouchStart={handleCaptureTouchStart}
                onTouchMove={handleCaptureTouchMove}
                onTouchEnd={handleCaptureTouchEnd}
                className="absolute inset-0 z-30 cursor-crosshair select-none bg-black/5"
              >
                {captureCurrentRect && (
                  <div
                    style={{
                      left: captureCurrentRect.x,
                      top: captureCurrentRect.y,
                      width: captureCurrentRect.width,
                      height: captureCurrentRect.height,
                    }}
                    className="absolute border border-[#E8A94A] bg-[#E8A94A]/10 pointer-events-none transition-none animate-none"
                  >
                    <div className="absolute -top-6 left-0 bg-paper border border-accent/60 text-accent font-mono text-[10px] px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap">
                      {Math.round(captureCurrentRect.width)} × {Math.round(captureCurrentRect.height)} px
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Floating 4-Color & Note Toolbar upon paragraph text selection */}
            {selectionToolbar && !isCaptureModeActive && (
              <div
                style={{
                  top: selectionToolbar.top,
                  left: selectionToolbar.left,
                }}
                className="absolute z-40 bg-paper border border-paper-border-dark rounded-lg p-1.5 shadow-xl flex items-center gap-1.5 transition-none animate-none"
              >
                {isAddingNoteInline ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateAnnotation(selectedColorForInlineNote, inlineNoteDraft);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      autoFocus
                      placeholder="Add note..."
                      value={inlineNoteDraft}
                      onChange={(e) => setInlineNoteDraft(e.target.value)}
                      className="bg-paper-light border border-paper-border rounded px-2 py-1 text-xs text-ink w-36 focus:border-accent focus-visible:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-accent text-accent-text text-xs px-2 py-1 rounded font-medium hover:bg-accent-hover"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingNoteInline(false)}
                      className="text-ink-faint hover:text-ink p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    {/* 4 Soft Highlight Colors */}
                    {ANNOTATION_COLORS.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => handleCreateAnnotation(col.id)}
                        title={`Highlight with ${col.label}`}
                        className="w-6 h-6 rounded-full flex items-center justify-center border border-paper-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: col.hex }}
                      />
                    ))}

                    <div className="h-4 w-px bg-paper-border mx-1" />

                    {/* Add Note Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedColorForInlineNote('amber');
                        setIsAddingNoteInline(true);
                      }}
                      className="text-xs font-sans text-ink hover:text-accent px-2 py-1 rounded hover:bg-paper-dim flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-accent" />
                      <span>Add note</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectionToolbar(null);
                        window.getSelection()?.removeAllRanges();
                      }}
                      className="text-ink-faint hover:text-ink p-1 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Page Header Watermark / Provenance Kicker */}
            <div className="flex items-center justify-between text-xs text-ink-faint border-b border-paper-border pb-3 mb-6 font-mono">
              <span>DOCULENS PROVENANCE SURFACE</span>
              <span className="truncate max-w-sm">
                {currentDoc.originalName} — PAGE {currentPage}
              </span>
            </div>

            {pageElements.length === 0 ? (
              <div className="text-center py-20 text-ink-muted space-y-2">
                <p className="font-serif text-lg text-ink">No text elements on page {currentPage}</p>
              </div>
            ) : (
              <div className="space-y-4 font-serif text-ink leading-relaxed">
                {pageElements.map((el, elIdx) => {
                  const isSelected = selectedElement?.id === el.id;
                  const isCited = citedElementId === el.id || targetElementId === el.id;
                  const isTargetPassage = isSelected || isCited;
                  const hasMatch =
                    Boolean(debouncedHighlightQuery.trim()) &&
                    el.content.toLowerCase().includes(debouncedHighlightQuery.toLowerCase());

                  const baseClass = `relative cursor-pointer p-3 rounded-md transition-none select-text ${
                    isTargetPassage
                      ? 'bg-[#E8A94A]/10 border-l-2 border-[#E8A94A]'
                      : hasMatch
                      ? 'border-l-2 border-[#E8A94A]/40 hover:bg-paper-dim'
                      : 'border-l-2 border-transparent hover:bg-paper-dim'
                  }`;

                  const renderPassageHeader = () => {
                    if (!isCited && !el.isOcr) return null;
                    return (
                      <div className="mb-1 flex items-center gap-2 select-none flex-wrap">
                        {isCited && (
                          <span className="font-mono text-[10px] font-semibold text-[#E8A94A] tracking-wider uppercase">
                            Cited Passage
                          </span>
                        )}
                        {el.isOcr && !isCited && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase text-accent bg-accent-subtle border border-accent-border px-1.5 py-0.5 rounded">
                            OCR {typeof el.ocrConfidence === 'number' ? `${Math.round(el.ocrConfidence)}%` : ''}
                          </span>
                        )}
                      </div>
                    );
                  };

                  if (el.type === 'heading-1') {
                    return (
                      <div
                        key={el.id}
                        id={`doc-el-${el.id}`}
                        data-element-id={el.id}
                        onClick={() => {
                          setSelectedElement(el);
                          setSelectedTextForNote(el.content);
                          setCitedElementId(null);
                        }}
                        className={baseClass}
                      >
                        {renderPassageHeader()}
                        <h1 className="text-xl sm:text-2xl font-semibold text-ink">
                          {renderAnnotatedAndHighlightedContent(el, elIdx === 0)}
                        </h1>
                      </div>
                    );
                  }

                  if (el.type === 'heading-2') {
                    return (
                      <div
                        key={el.id}
                        id={`doc-el-${el.id}`}
                        data-element-id={el.id}
                        onClick={() => {
                          setSelectedElement(el);
                          setSelectedTextForNote(el.content);
                          setCitedElementId(null);
                        }}
                        className={baseClass}
                      >
                        {renderPassageHeader()}
                        <h2 className="text-lg font-semibold text-ink mt-2">
                          {renderAnnotatedAndHighlightedContent(el, elIdx === 0)}
                        </h2>
                      </div>
                    );
                  }

                  if (el.type === 'heading-3') {
                    return (
                      <div
                        key={el.id}
                        id={`doc-el-${el.id}`}
                        data-element-id={el.id}
                        onClick={() => {
                          setSelectedElement(el);
                          setSelectedTextForNote(el.content);
                          setCitedElementId(null);
                        }}
                        className={baseClass}
                      >
                        {renderPassageHeader()}
                        <h3 className="text-base font-semibold text-ink">
                          {renderAnnotatedAndHighlightedContent(el, elIdx === 0)}
                        </h3>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={el.id}
                      id={`doc-el-${el.id}`}
                      data-element-id={el.id}
                      onClick={() => {
                        setSelectedElement(el);
                        setSelectedTextForNote(el.content);
                        setCitedElementId(null);
                      }}
                      className={baseClass}
                    >
                      {renderPassageHeader()}
                      <p className="text-[14px] sm:text-base text-[#E6E9EF] leading-relaxed">
                        {renderAnnotatedAndHighlightedContent(el, elIdx === 0)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Page Footer Footprint */}
            <div className="flex items-center justify-between text-xs text-ink-faint border-t border-paper-border pt-4 mt-8 font-mono">
              <span>SHA: {currentDoc.sha256.slice(0, 16)}...</span>
              <span>— {currentPage} of {totalPages} —</span>
              <span>{currentDoc.parserName}</span>
            </div>
          </div>

          {/* Sidebar: Annotations & Element Inspector */}
          {isInspectorOpen && (
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              {/* Element Provenance Card */}
              <div className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  <Crosshair className="w-3.5 h-3.5 text-accent" />
                  <span>Provenance Inspector</span>
                </div>

                {selectedElement ? (
                  <div className="space-y-3 text-[13px]">
                    <div className="p-3 bg-paper rounded-md border border-paper-border font-mono space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Element ID:</span>
                        <span className="font-semibold text-ink">{selectedElement.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Type:</span>
                        <span className="text-accent font-semibold">{selectedElement.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Page:</span>
                        <span className="text-ink">{selectedElement.pageNumber}</span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-xs text-ink-muted font-medium">Selected Passage:</span>
                      <p className="mt-1.5 p-3 bg-paper rounded-md border border-paper-border text-[13px] text-ink italic max-h-36 overflow-y-auto font-serif leading-relaxed">
                        "{selectedElement.content}"
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-[13px] text-ink-faint">
                    <p>Click any passage to view provenance</p>
                  </div>
                )}
              </div>

              {/* Annotations & Notes Panel */}
              <div className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <Bookmark className="w-3.5 h-3.5 text-accent" />
                    <span>Annotations ({documentNotes.length})</span>
                  </div>
                  <span className="text-xs text-ink-faint font-mono">
                    p.{currentPage} ({pageNotes.length})
                  </span>
                </div>

                {/* Color Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setAnnotationColorFilter('all')}
                    className={`px-2 py-1 rounded border transition-colors ${
                      annotationColorFilter === 'all'
                        ? 'border-accent bg-accent-subtle text-accent font-semibold'
                        : 'border-paper-border bg-paper text-ink-muted hover:text-ink'
                    }`}
                  >
                    All ({documentNotes.length})
                  </button>
                  {ANNOTATION_COLORS.map((col) => {
                    const count = documentNotes.filter((n) => n.color === col.id).length;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setAnnotationColorFilter(col.id)}
                        className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
                          annotationColorFilter === col.id
                            ? 'border-accent bg-accent-subtle text-accent font-semibold'
                            : 'border-paper-border bg-paper text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.hex }} />
                        <span>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Attach Manual Page Note */}
                <form onSubmit={handleCreateNote} className="space-y-2.5">
                  <textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Annotate this page with research or audit notes..."
                    rows={2}
                    className="w-full text-[13px] p-3 bg-paper border border-paper-border rounded-md text-ink placeholder:text-ink-faint focus:border-accent transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button
                    type="submit"
                    disabled={!newNoteText.trim()}
                    className="w-full min-h-[36px] flex items-center justify-center gap-2 bg-ink hover:opacity-90 text-paper text-[13px] font-medium py-2 px-3 rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Attach Note to Page {currentPage}</span>
                  </button>
                </form>

                {/* List of Annotations (by page, click to jump, edit, delete) */}
                <div className="space-y-2.5 pt-2 max-h-80 overflow-y-auto">
                  {filteredNotes.length === 0 ? (
                    <p className="text-xs text-ink-faint text-center py-4">
                      No annotations matching filter.
                    </p>
                  ) : (
                    filteredNotes.map((note) => {
                      const colorMeta = getAnnotationColorMeta(note.color);
                      const isEditing = editingNoteId === note.id;

                      return (
                        <div
                          key={note.id}
                          onClick={() => {
                            if (note.pageNumber !== currentPage) {
                              setCurrentPage(note.pageNumber);
                              setPageInput(String(note.pageNumber));
                            }
                            if (note.elementId) {
                              setCitedElementId(note.elementId);
                              const domEl = document.getElementById(`doc-el-${note.elementId}`);
                              if (domEl) {
                                domEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }
                            }
                          }}
                          className="p-3 bg-paper border border-paper-border hover:border-paper-border-dark rounded-md space-y-2 relative group cursor-pointer transition-colors"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorMeta.hex }} />
                              <span className="font-mono text-xs text-accent font-semibold">
                                Page {note.pageNumber}
                              </span>
                              <span className="text-[11px] font-mono text-ink-faint">
                                {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNoteId(note.id);
                                  setEditingNoteDraft(note.noteText);
                                }}
                                title="Edit note"
                                className="p-1 text-ink-faint hover:text-ink rounded"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteNote(note.id);
                                }}
                                title="Delete annotation"
                                className="p-1 text-ink-faint hover:text-red-400 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Quoted Text */}
                          {note.selectedText && (
                            <p className="text-xs text-ink-muted italic border-l-2 border-paper-border pl-2 font-serif line-clamp-3">
                              "{note.selectedText}"
                            </p>
                          )}

                          {/* Image Blob thumbnail if attached from capture */}
                          {note.imageBlob && (
                            <div className="my-1 rounded border border-paper-border overflow-hidden bg-paper-light max-h-24 flex items-center justify-center">
                              <img
                                src={URL.createObjectURL(note.imageBlob)}
                                alt="Annotation capture attachment"
                                className="object-contain max-h-24 w-auto"
                              />
                            </div>
                          )}

                          {/* Note text / Edit Mode */}
                          {isEditing ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="space-y-1.5 pt-1"
                            >
                              <textarea
                                value={editingNoteDraft}
                                onChange={(e) => setEditingNoteDraft(e.target.value)}
                                rows={2}
                                className="w-full text-xs p-2 bg-paper-light border border-accent rounded text-ink focus:outline-none"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingNoteId(null)}
                                  className="text-xs text-ink-faint hover:text-ink px-2 py-1"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (onUpdateNote) {
                                      await onUpdateNote({
                                        ...note,
                                        noteText: editingNoteDraft,
                                      });
                                    }
                                    setEditingNoteId(null);
                                  }}
                                  className="text-xs bg-accent text-accent-text px-2 py-1 rounded font-medium hover:bg-accent-hover"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            note.noteText && (
                              <p className="text-[13px] text-ink leading-relaxed font-sans">
                                {note.noteText}
                              </p>
                            )
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Region Capture Result Modal */}
      {captureResult && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-paper-light border border-paper-border rounded-lg max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-paper-border pb-3">
              <div className="flex items-center gap-2">
                <Crop className="w-4 h-4 text-accent" />
                <h3 className="font-serif font-semibold text-ink text-base">
                  Captured Region at 2x (Page {currentPage})
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseCaptureResult}
                className="text-ink-faint hover:text-ink p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="max-h-60 overflow-auto bg-black/40 rounded border border-paper-border p-2 flex items-center justify-center">
              <img
                src={captureResult.previewUrl}
                alt="Captured region preview"
                className="max-h-56 object-contain rounded"
              />
            </div>

            <div className="text-xs font-mono text-ink-faint flex justify-between">
              <span>Resolution: {captureResult.width} × {captureResult.height}px</span>
              <span>2x Native PDF Render</span>
            </div>

            {captureActionFeedback && (
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded text-center font-mono">
                {captureActionFeedback}
              </div>
            )}

            {/* Attach Note Field */}
            {isAttachingCaptureToNote ? (
              <div className="space-y-2 pt-2 border-t border-paper-border">
                <label className="text-xs text-ink-muted">Annotation Note Text:</label>
                <textarea
                  value={captureNoteDraft}
                  onChange={(e) => setCaptureNoteDraft(e.target.value)}
                  placeholder="Observation regarding this captured diagram or table..."
                  rows={2}
                  className="w-full text-xs p-2 bg-paper border border-paper-border rounded text-ink focus:border-accent"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAttachingCaptureToNote(false)}
                    className="text-xs px-3 py-1.5 text-ink-faint hover:text-ink"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleAttachCaptureToNote}
                    className="text-xs px-3 py-1.5 bg-accent text-accent-text font-medium rounded hover:bg-accent-hover"
                  >
                    Confirm Attachment
                  </button>
                </div>
              </div>
            ) : (
              /* Action Buttons Grid */
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadCapture}
                  className="px-3 py-2 bg-paper hover:bg-paper-dim border border-paper-border text-ink text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyCapture}
                  className="px-3 py-2 bg-paper hover:bg-paper-dim border border-paper-border text-ink text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-accent" />
                  <span>Copy to Clipboard</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveCaptureToFigures}
                  className="px-3 py-2 bg-paper hover:bg-paper-dim border border-paper-border text-ink text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-accent" />
                  <span>Save to Figures</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAttachingCaptureToNote(true)}
                  className="px-3 py-2 bg-paper hover:bg-paper-dim border border-paper-border text-ink text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5 text-accent" />
                  <span>Attach to Note</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxFigure && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between gap-3 text-ink bg-paper-light/90 border border-paper-border rounded-lg px-4 py-2.5 shadow-md">
            <span className="font-semibold text-sm text-ink truncate">
              {activeLightboxFigure.captionLabel || 'Figure'} (p.{activeLightboxFigure.pageNumber})
            </span>
            <button
              onClick={() => setActiveLightboxFigure(null)}
              className="p-1.5 rounded hover:bg-paper-dim text-ink-muted hover:text-ink"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative flex items-center justify-center overflow-auto my-3 p-2">
            {lightboxImageUrl && (
              <img
                src={lightboxImageUrl}
                alt="Figure detail"
                className="max-w-[85vw] max-h-[75vh] object-contain rounded border border-paper-border"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
