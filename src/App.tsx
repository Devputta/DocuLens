/**
 * DocuLens — Local-First PDF Intelligence Workspace
 * Human-centric minimalist tool for document ingestion,
 * evidence-grounded search, citation-verified inquiries,
 * table extraction, and revision comparison.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  InquiryMessage,
  MarginaliaNote,
  UploadProgress,
  OcrPromptState,
} from './types/doculens';
import { storage } from './services/storage';
import { generateSampleBundles, generateSampleFigures } from './services/sampleDocuments';
import { parsePDFFile, calculateSHA256, ParseResult } from './services/pdfParser';
import { runInBrowserOCR } from './services/ocrService';
import { thumbnailService } from './services/thumbnailService';
import { figureExtractor } from './services/figureExtractor';

import { Header, ActiveTab } from './components/Header';
import { LibraryView, DuplicateNotice } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SearchView } from './components/SearchView';
import { InquiryView } from './components/InquiryView';
import { TablesView } from './components/TablesView';
import { FiguresView } from './components/FiguresView';
import { CompareView } from './components/CompareView';
import { WorkspaceView } from './components/WorkspaceView';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('library');
  const [documents, setDocuments] = useState<DocumentEntity[]>([]);
  const [elements, setElements] = useState<DocumentElement[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [tables, setTables] = useState<DocumentTable[]>([]);
  const [inquiries, setInquiries] = useState<InquiryMessage[]>([]);
  const [notes, setNotes] = useState<MarginaliaNote[]>([]);

  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(undefined);
  const [readerTargetPage, setReaderTargetPage] = useState<number>(1);
  const [readerHighlightQuery, setReaderHighlightQuery] = useState<string | undefined>(undefined);
  const [readerTargetElementId, setReaderTargetElementId] = useState<string | undefined>(undefined);
  const [compareLeftDocId, setCompareLeftDocId] = useState<string | undefined>(undefined);
  const [compareRightDocId, setCompareRightDocId] = useState<string | undefined>(undefined);

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<DuplicateNotice | null>(null);
  const [ocrPrompt, setOcrPrompt] = useState<OcrPromptState | null>(null);
  const [pendingZeroTextParsed, setPendingZeroTextParsed] = useState<ParseResult | null>(null);
  const [ocrAbortController, setOcrAbortController] = useState<AbortController | null>(null);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Live online / offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cancel pending background thumbnail renders when switching views
  useEffect(() => {
    thumbnailService.cancelPendingRenders();
  }, [activeTab]);

  // Refresh all state from local storage.
  // Note: Sample documents are NEVER automatically seeded on empty library;
  // they are only loaded through an explicit user demo action.
  const loadAllData = useCallback(async () => {
    const docs = await storage.getDocuments();

    setDocuments(docs);
    const allChunks = await storage.getAllChunks();
    const allTables = await storage.getAllTables();
    const allInquiries = await storage.getInquiries();

    setChunks(allChunks);
    setTables(allTables);
    setInquiries(allInquiries);

    const allElements: DocumentElement[] = [];
    for (const doc of docs) {
      const elList = await storage.getElementsByDocument(doc.id);
      allElements.push(...elList);
    }
    setElements(allElements);

    // Sync active document selection
    setSelectedDocId((prev) => {
      if (prev && docs.some((d) => d.id === prev)) {
        return prev;
      }
      return docs[0]?.id || undefined;
    });
  }, []);

  // Initial mount
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Load notes when selectedDocId changes
  useEffect(() => {
    if (selectedDocId) {
      storage.getNotes(selectedDocId).then((n) => setNotes(n));
    } else {
      setNotes([]);
    }
  }, [selectedDocId]);

  // Handle PDF upload with duplicate detection and stage-by-stage progress
  const handleUploadFile = async (file: File) => {
    setIsProcessing(true);
    setUploadError(null);
    setUploadSuccess(null);
    setDuplicateNotice(null);
    setUploadProgress({
      stage: 'reading',
      percent: 5,
      message: `Reading "${file.name}" into memory...`,
    });

    try {
      const buffer = await file.arrayBuffer();
      const pristine = buffer.slice(0);

      // Check for duplicates via SHA-256 fingerprint
      const sha256 = await calculateSHA256(buffer);
      const existingDoc = documents.find((d) => d.sha256.toLowerCase() === sha256.toLowerCase());

      if (existingDoc) {
        setDuplicateNotice({
          existingDoc,
          uploadedName: file.name,
          file,
        });
        setIsProcessing(false);
        setUploadProgress(null);
        return;
      }

      // Parse with progress callbacks
      const parsed = await parsePDFFile(
        { name: file.name, buffer },
        {
          onProgress: (prog) => {
            setUploadProgress(prog);
          },
        }
      );

      // Check if document has no extractable text layer (scanned PDF) -> prompt for OCR
      if (parsed.isZeroText) {
        setOcrPrompt({
          file,
          buffer: pristine,
          pageCount: parsed.document.pageCount,
          docId: parsed.document.id,
          originalName: file.name,
          sha256,
          sizeBytes: pristine.byteLength,
          status: 'prompt',
          progress: {
            page: 1,
            totalPages: parsed.document.pageCount,
            percent: 0,
            message: 'No text layer found. Ready to run OCR...',
          },
        });
        setPendingZeroTextParsed(parsed);
        setIsProcessing(false);
        setUploadProgress(null);
        return;
      }

      // Persist into IndexedDB
      await storage.saveDocument(parsed.document);
      await storage.saveElements(parsed.elements);
      await storage.saveChunks(parsed.chunks);
      await storage.saveTables(parsed.tables);
      await storage.savePdfSource(parsed.document.id, pristine);

      // Ingestion: Extract embedded figures and vector drawings
      try {
        await figureExtractor.extractFiguresForDocument(parsed.document.id);
      } catch (figErr) {
        console.debug('Figure extraction notice:', figErr);
      }

      setDocuments((prev) => [parsed.document, ...prev.filter((d) => d.id !== parsed.document.id)]);
      setElements((prev) => [...parsed.elements, ...prev]);
      setChunks((prev) => [...parsed.chunks, ...prev]);
      setTables((prev) => [...parsed.tables, ...prev]);
      setSelectedDocId(parsed.document.id);

      setUploadSuccess(
        `Successfully ingested "${parsed.document.originalName}" (${parsed.document.pageCount} page${parsed.document.pageCount > 1 ? 's' : ''}, ${parsed.document.elementCount} elements).`
      );
    } catch (err: any) {
      console.error('Document upload error:', err);
      setUploadError(err?.message || 'Failed to process document');
    } finally {
      setIsProcessing(false);
      setUploadProgress(null);
    }
  };

  // In-Browser OCR Handlers
  const handleConfirmRunOcr = async () => {
    if (!ocrPrompt) return;
    const controller = new AbortController();
    setOcrAbortController(controller);

    setOcrPrompt((prev) =>
      prev
        ? {
            ...prev,
            status: 'processing',
            progress: {
              page: 1,
              totalPages: prev.pageCount,
              percent: 5,
              message: 'Initializing local Tesseract OCR web worker...',
            },
          }
        : null
    );

    try {
      const ocrResult = await runInBrowserOCR({
        pdfBuffer: ocrPrompt.buffer,
        docId: ocrPrompt.docId,
        pageCount: ocrPrompt.pageCount,
        abortSignal: controller.signal,
        onProgress: (prog) => {
          setOcrPrompt((prev) => (prev ? { ...prev, progress: prog } : null));
        },
      });

      const ocrDoc: DocumentEntity = {
        id: ocrPrompt.docId,
        originalName: ocrPrompt.originalName,
        storedPath: `local://doculens/storage/${ocrPrompt.docId}-${ocrPrompt.originalName.replace(/\s+/g, '_')}`,
        sha256: ocrPrompt.sha256,
        sizeBytes: ocrPrompt.sizeBytes,
        pageCount: ocrResult.pageCount,
        status: 'ready',
        parserName: 'Tesseract.js (Local Web Worker)',
        parserVersion: '5.x',
        createdAt: Date.now(),
        processedAt: Date.now(),
        summary: ocrResult.elements.slice(0, 4).map((e) => e.content).join(' ').slice(0, 240),
        elementCount: ocrResult.elements.length,
        chunkCount: ocrResult.chunks.length,
        tableCount: ocrResult.tables.length,
        isScanned: false,
        ocrProcessed: true,
        ocrConfidence: ocrResult.averageConfidence,
      };

      await storage.saveDocument(ocrDoc);
      await storage.saveElements(ocrResult.elements);
      await storage.saveChunks(ocrResult.chunks);
      if (ocrResult.tables.length > 0) {
        await storage.saveTables(ocrResult.tables);
      }
      await storage.savePdfSource(ocrDoc.id, ocrPrompt.buffer);

      // Extract figures from scanned document
      try {
        await figureExtractor.extractFiguresForDocument(ocrDoc.id);
      } catch (figErr) {
        console.debug('Figure extraction after OCR notice:', figErr);
      }

      setDocuments((prev) => [ocrDoc, ...prev.filter((d) => d.id !== ocrDoc.id)]);
      setElements((prev) => [...ocrResult.elements, ...prev]);
      setChunks((prev) => [...ocrResult.chunks, ...prev]);
      setTables((prev) => [...ocrResult.tables, ...prev]);
      setSelectedDocId(ocrDoc.id);

      setOcrPrompt(null);
      setPendingZeroTextParsed(null);
      setUploadSuccess(
        `OCR complete for "${ocrDoc.originalName}" (${ocrResult.elements.length} elements extracted, confidence ${ocrResult.averageConfidence}%).`
      );
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        setUploadError('OCR process was cancelled by user.');
      } else {
        console.error('OCR process error:', err);
        setUploadError(`OCR Failed: ${err?.message || 'Processing failed'}`);
      }
      setOcrPrompt(null);
      setPendingZeroTextParsed(null);
    } finally {
      setOcrAbortController(null);
    }
  };

  const handleCancelOcr = () => {
    if (ocrAbortController) {
      ocrAbortController.abort();
      setOcrAbortController(null);
    }
    setOcrPrompt(null);
    setPendingZeroTextParsed(null);
  };

  const handleProceedWithoutOcr = async () => {
    if (!pendingZeroTextParsed) return;
    const parsed = pendingZeroTextParsed;
    await storage.saveDocument(parsed.document);
    await storage.saveElements(parsed.elements);
    await storage.saveChunks(parsed.chunks);
    await storage.saveTables(parsed.tables);
    if (ocrPrompt?.buffer) {
      await storage.savePdfSource(parsed.document.id, ocrPrompt.buffer);
    }

    setDocuments((prev) => [parsed.document, ...prev.filter((d) => d.id !== parsed.document.id)]);
    setElements((prev) => [...parsed.elements, ...prev]);
    setChunks((prev) => [...parsed.chunks, ...prev]);
    setTables((prev) => [...parsed.tables, ...prev]);
    setSelectedDocId(parsed.document.id);

    setOcrPrompt(null);
    setPendingZeroTextParsed(null);
    setUploadSuccess(`Saved "${parsed.document.originalName}" as scanned document without text layer.`);
  };

  // Replace existing duplicate document
  const handleReplaceDuplicate = async (existingId: string, file: File) => {
    await handleDeleteDocument(existingId);
    setDuplicateNotice(null);
    await handleUploadFile(file);
  };

  // Explicit demo action: Loads the curated benchmark suite
  const handleLoadSampleData = async () => {
    setIsProcessing(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const samples = generateSampleBundles();
      for (const sample of samples) {
        await storage.saveDocument(sample.document);
        await storage.saveElements(sample.elements);
        await storage.saveChunks(sample.chunks);
        await storage.saveTables(sample.tables);
      }
      // Load sample figures
      try {
        const sampleFigures = await generateSampleFigures();
        if (sampleFigures.length > 0) {
          await storage.saveFigures(sampleFigures);
        }
      } catch (figErr) {
        console.debug('Failed to generate sample figures:', figErr);
      }

      await loadAllData();
      setUploadSuccess(
        `Curated benchmark suite loaded (${samples.length} documents, ${samples.reduce((a, s) => a + s.tables.length, 0)} tables).`
      );
    } catch (err: any) {
      setUploadError(`Failed to load benchmark suite: ${err?.message || 'Storage error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirmed document deletion with cascading cleanup
  const handleDeleteDocument = async (id: string) => {
    const docToDelete = documents.find((d) => d.id === id);
    const docName = docToDelete?.originalName || 'Document';

    try {
      await storage.deleteDocument(id);
      await storage.deleteFiguresByDocument(id);
      thumbnailService.purgeDocument(id);

      const remaining = documents.filter((d) => d.id !== id);
      setDocuments(remaining);
      setElements((prev) => prev.filter((e) => e.documentId !== id));
      setChunks((prev) => prev.filter((c) => c.documentId !== id));
      setTables((prev) => prev.filter((t) => t.documentId !== id));
      setNotes((prev) => prev.filter((n) => n.documentId !== id));

      if (selectedDocId === id) {
        setSelectedDocId(remaining[0]?.id || undefined);
      }

      setDeleteSuccess(
        `Document "${docName}" and all associated chunks and tables were permanently deleted.`
      );
      setTimeout(() => setDeleteSuccess(null), 5000);
    } catch (err: any) {
      setUploadError(`Failed to delete document: ${err?.message || 'Storage deletion failure'}`);
    }
  };

  // Navigation helpers
  const handleNavigateToReader = (
    docId: string,
    pageNumber: number,
    highlightQuery?: string,
    targetElementId?: string
  ) => {
    setSelectedDocId(docId);
    setReaderTargetPage(pageNumber);
    setReaderHighlightQuery(highlightQuery);
    setReaderTargetElementId(targetElementId);
    setActiveTab('reader');
  };

  const handleSelectForTables = (docId: string) => {
    setSelectedDocId(docId);
    setActiveTab('tables');
  };

  const handleSelectForFigures = (docId: string) => {
    setSelectedDocId(docId);
    setActiveTab('figures');
  };

  const handleSelectForCompare = (docId: string) => {
    setCompareLeftDocId(docId);
    const other = documents.find((d) => d.id !== docId);
    if (other) setCompareRightDocId(other.id);
    setActiveTab('compare');
  };

  // Note actions
  const handleAddNote = async (
    noteData: Partial<MarginaliaNote> & {
      documentId: string;
      pageNumber: number;
      selectedText: string;
      noteText: string;
    }
  ) => {
    const newNote: MarginaliaNote = {
      id: `note-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: Date.now(),
      ...noteData,
    };
    await storage.saveNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
  };

  const handleUpdateNote = async (updatedNote: MarginaliaNote) => {
    await storage.saveNote(updatedNote);
    setNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)));
  };

  const handleDeleteNote = async (id: string) => {
    await storage.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Table actions
  const handleUpdateTable = async (updatedTable: DocumentTable) => {
    await storage.saveTable(updatedTable);
    setTables((prev) => prev.map((t) => (t.id === updatedTable.id ? updatedTable : t)));
  };

  // Inquiry actions
  const handleSaveInquiry = async (msg: InquiryMessage) => {
    await storage.saveInquiry(msg);
    setInquiries((prev) => [...prev, msg]);
  };

  const handleClearInquiries = async () => {
    await storage.clearInquiries();
    setInquiries([]);
  };

  return (
    <div className="min-h-full flex flex-col bg-paper text-ink">
      {/* Editorial Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDoc={setSelectedDocId}
        isOnline={isOnline}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'library' && (
          <LibraryView
            documents={documents}
            onUploadFile={handleUploadFile}
            onLoadSampleData={handleLoadSampleData}
            onDeleteDocument={handleDeleteDocument}
            onSelectDocumentForReader={(id) => handleNavigateToReader(id, 1)}
            onSelectDocumentForTables={handleSelectForTables}
            onSelectDocumentForFigures={handleSelectForFigures}
            onSelectDocumentForCompare={handleSelectForCompare}
            isProcessing={isProcessing}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
            uploadSuccess={uploadSuccess}
            deleteSuccess={deleteSuccess}
            duplicateNotice={duplicateNotice}
            onClearDuplicateNotice={() => setDuplicateNotice(null)}
            onReplaceDuplicate={handleReplaceDuplicate}
            onDismissUploadError={() => setUploadError(null)}
            onDismissUploadSuccess={() => setUploadSuccess(null)}
            onDismissDeleteSuccess={() => setDeleteSuccess(null)}
            ocrPrompt={ocrPrompt}
            onConfirmRunOcr={handleConfirmRunOcr}
            onCancelOcr={handleCancelOcr}
            onProceedWithoutOcr={handleProceedWithoutOcr}
          />
        )}

        {activeTab === 'reader' && (
          <ReaderView
            documents={documents}
            selectedDocId={selectedDocId}
            onSelectDoc={(id) => setSelectedDocId(id)}
            elements={elements}
            notes={notes}
            onAddNote={handleAddNote}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            targetPage={readerTargetPage}
            highlightQuery={readerHighlightQuery}
            targetElementId={readerTargetElementId}
            onClearHighlight={() => setReaderHighlightQuery(undefined)}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            documents={documents}
            chunks={chunks}
            selectedDocId={selectedDocId}
            onSelectDoc={setSelectedDocId}
            onNavigateToReader={handleNavigateToReader}
          />
        )}

        {activeTab === 'inquiry' && (
          <InquiryView
            documents={documents}
            chunks={chunks}
            selectedDocId={selectedDocId}
            inquiries={inquiries}
            onSaveInquiry={handleSaveInquiry}
            onClearInquiries={handleClearInquiries}
            onNavigateToReader={handleNavigateToReader}
            isOnline={isOnline}
          />
        )}

        {activeTab === 'tables' && (
          <TablesView
            tables={tables}
            documents={documents}
            selectedDocId={selectedDocId}
            onSelectDoc={setSelectedDocId}
            onNavigateToReader={handleNavigateToReader}
            onUpdateTable={handleUpdateTable}
          />
        )}

        {activeTab === 'figures' && (
          <FiguresView
            documents={documents}
            onNavigateToReader={handleNavigateToReader}
          />
        )}

        {activeTab === 'compare' && (
          <CompareView
            documents={documents}
            chunks={chunks}
            initialLeftDocId={compareLeftDocId}
            initialRightDocId={compareRightDocId}
            onNavigateToReader={handleNavigateToReader}
          />
        )}

        {activeTab === 'workspace' && (
          <WorkspaceView
            documents={documents}
            documentsCount={documents.length}
            chunksCount={chunks.length}
            tablesCount={tables.length}
            inquiriesCount={inquiries.length}
            notesCount={notes.length}
            onRefreshAllData={loadAllData}
            isOnline={isOnline}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-paper-border bg-paper-light py-3.5 text-[13px] text-ink-muted no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-start">
            <img
              src="/doculens-mark-transparent.png"
              alt="DocuLens"
              className="w-4 h-4 object-contain"
            />
            <span className="font-serif font-semibold text-ink">DocuLens</span>
            <span className="text-ink-faint">·</span>
            <span>Local-First Document Intelligence</span>
            <span className="text-ink-faint">·</span>
            <span className="font-mono text-xs text-ink-faint">v1.0.0</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-ink-muted flex-wrap justify-center sm:justify-end">
            <span>Privacy-Preserving On-Device Storage</span>
            <span className="text-ink-faint">·</span>
            <span>Zero Remote Telemetry</span>
            <span className="text-ink-faint">·</span>
            <span className="text-accent font-medium">Offline Operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
