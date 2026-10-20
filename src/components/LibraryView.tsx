import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  BookOpen,
  Table,
  GitCompare,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  ArrowUpDown,
  X,
  FileWarning,
  Image as ImageIcon,
} from 'lucide-react';
import { DocumentEntity, UploadProgress, OcrPromptState } from '../types/doculens';
import { PageThumbnail } from './PageThumbnail';
import { thumbnailService } from '../services/thumbnailService';

export interface DuplicateNotice {
  existingDoc: DocumentEntity;
  uploadedName: string;
  file?: File;
}

export type LibrarySortOption =
  | 'newest'
  | 'oldest'
  | 'name-asc'
  | 'name-desc'
  | 'size-desc'
  | 'pages-desc';

interface LibraryViewProps {
  documents: DocumentEntity[];
  onUploadFile: (file: File) => Promise<void>;
  onLoadSampleData: () => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onSelectDocumentForReader: (id: string) => void;
  onSelectDocumentForTables: (id: string) => void;
  onSelectDocumentForCompare: (id: string) => void;
  onSelectDocumentForFigures?: (id: string) => void;
  isProcessing: boolean;
  uploadProgress: UploadProgress | null;
  uploadError: string | null;
  uploadSuccess: string | null;
  deleteSuccess: string | null;
  duplicateNotice: DuplicateNotice | null;
  onClearDuplicateNotice: () => void;
  onReplaceDuplicate?: (existingId: string, file: File) => Promise<void>;
  onDismissUploadError: () => void;
  onDismissUploadSuccess: () => void;
  onDismissDeleteSuccess: () => void;
  ocrPrompt?: OcrPromptState | null;
  onConfirmRunOcr?: () => Promise<void>;
  onCancelOcr?: () => void;
  onProceedWithoutOcr?: () => Promise<void>;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  documents,
  onUploadFile,
  onLoadSampleData,
  onDeleteDocument,
  onSelectDocumentForReader,
  onSelectDocumentForTables,
  onSelectDocumentForCompare,
  onSelectDocumentForFigures,
  isProcessing,
  uploadProgress,
  uploadError,
  uploadSuccess,
  deleteSuccess,
  duplicateNotice,
  onClearDuplicateNotice,
  onReplaceDuplicate,
  onDismissUploadError,
  onDismissUploadSuccess,
  onDismissDeleteSuccess,
  ocrPrompt,
  onConfirmRunOcr,
  onCancelOcr,
  onProceedWithoutOcr,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentEntity | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<LibrarySortOption>('newest');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cancel pending thumbnail renders when LibraryView unmounts
  useEffect(() => {
    return () => {
      thumbnailService.cancelPendingRenders('library');
    };
  }, []);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await onUploadFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await onUploadFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Filter and sort documents
  const filteredAndSortedDocs = useMemo(() => {
    let result = [...documents];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (doc) =>
          doc.originalName.toLowerCase().includes(q) ||
          doc.sha256.toLowerCase().includes(q) ||
          (doc.summary && doc.summary.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'name-asc':
          return a.originalName.localeCompare(b.originalName);
        case 'name-desc':
          return b.originalName.localeCompare(a.originalName);
        case 'size-desc':
          return b.sizeBytes - a.sizeBytes;
        case 'pages-desc':
          return b.pageCount - a.pageCount;
        default:
          return b.createdAt - a.createdAt;
      }
    });

    return result;
  }, [documents, searchQuery, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-border pb-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-ink">
            Document Library
          </h1>
        </div>

        {documents.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={onLoadSampleData}
              disabled={isProcessing}
              className="text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border hover:border-paper-border-dark bg-paper-light px-3.5 py-2 min-h-[36px] rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Reload Benchmark Suite</span>
            </button>
          </div>
        )}
      </div>

      {/* Upload & Benchmark Zone */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Upload Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label="Upload document file"
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isProcessing) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          title="Supported: Standard PDF, TXT, MD files up to 25 MB, max 500 pages"
          className={`md:col-span-2 border-2 border-dashed rounded-lg p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150 bg-paper-light relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
            dragOver
              ? 'border-accent bg-accent-subtle/30'
              : isProcessing
              ? 'border-accent/40 cursor-wait'
              : 'border-paper-border-dark hover:border-accent/60'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.docx,.txt,.md"
            disabled={isProcessing}
            className="hidden"
            aria-label="Upload document file"
          />

          {!isProcessing ? (
            <>
              <div className="w-12 h-12 rounded-full bg-paper border border-paper-border flex items-center justify-center text-accent mb-3 shadow-xs">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-ink">
                Drop PDF, DOCX, or TXT file here, or{' '}
                <span className="text-accent underline underline-offset-2">browse files</span>
              </p>
              <p className="text-xs text-ink-muted mt-1 font-mono">
                Supports PDF, Word (.docx), and plain text (.txt) up to 25 MB
              </p>
            </>
          ) : (
            <div className="w-full max-w-md space-y-3 py-2">
              <div className="flex items-center justify-center gap-2.5 text-xs text-accent">
                <img
                  src="/doculens-mark-transparent.png"
                  alt="DocuLens"
                  className="w-5 h-5 object-contain animate-pulse shrink-0"
                />
                <Clock className="w-4 h-4 animate-spin shrink-0" />
                <span className="font-medium text-[13px] font-sans">
                  {uploadProgress?.message || 'Processing document...'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-paper h-2 rounded-full overflow-hidden border border-paper-border">
                <div
                  className="bg-accent h-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress?.percent || 20}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-xs text-ink-muted font-mono">
                <span className="capitalize">{uploadProgress?.stage || 'Parsing'}</span>
                <span>{uploadProgress?.percent || 20}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Curated Benchmark Card */}
        <div className="border border-paper-border bg-paper-light rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent font-medium text-[13px] mb-2">
              <img
                src="/doculens-mark-transparent.png"
                alt="DocuLens Logo"
                className="w-4 h-4 object-contain"
              />
              <Sparkles className="w-3.5 h-3.5" />
              <span>Curated Benchmarks (Demo)</span>
            </div>
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Experience the full workspace instantly without locating a file on your device. Loads
              audited clean energy reports and multi-revision clinical protocols for testing diffs.
            </p>
            <ul className="text-xs text-ink-muted mt-3 space-y-1.5 list-disc pl-4 font-sans">
              <li>Renewable Energy Transition Audit 2025</li>
              <li>Clinical Protocol B-709 (Revision 2.0)</li>
              <li>Clinical Protocol B-709 (Revision 3.0 Diff)</li>
            </ul>
          </div>

          <button
            onClick={onLoadSampleData}
            disabled={isProcessing}
            className="mt-4 w-full bg-ink hover:opacity-90 text-paper min-h-[36px] text-[13px] font-semibold py-2 px-3 rounded-md transition-all duration-150 text-center disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Load Benchmark Documents
          </button>
        </div>
      </div>

      {/* Notifications: Failure, Success, Deletion, Duplicate */}
      {uploadError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-300 text-[13px] rounded-lg flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <div>
              <span className="font-semibold block text-red-200 mb-0.5">Upload Failed</span>
              <p className="leading-relaxed">{uploadError}</p>
            </div>
          </div>
          <button
            onClick={onDismissUploadError}
            className="text-red-400 hover:text-red-200 p-1 rounded min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[13px] rounded-lg flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <span className="font-semibold block text-emerald-200 mb-0.5">Document Ingested</span>
              <p className="leading-relaxed">{uploadSuccess}</p>
            </div>
          </div>
          <button
            onClick={onDismissUploadSuccess}
            className="text-emerald-400 hover:text-emerald-200 p-1 rounded min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {deleteSuccess && (
        <div className="p-4 bg-paper-light border border-paper-border text-ink text-[13px] rounded-lg flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <Trash2 className="w-4 h-4 shrink-0 text-ink-muted mt-0.5" />
            <div>
              <span className="font-semibold block text-ink mb-0.5">Record Deleted</span>
              <p className="leading-relaxed text-ink-muted">{deleteSuccess}</p>
            </div>
          </div>
          <button
            onClick={onDismissDeleteSuccess}
            className="text-ink-muted hover:text-ink p-1 rounded min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Duplicate Document Notice */}
      {duplicateNotice && (
        <div className="p-4 bg-accent-subtle border border-accent-border text-ink text-[13px] rounded-lg space-y-3 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <FileWarning className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block text-accent">
                  Duplicate Document Detected
                </span>
                <p className="leading-relaxed text-ink-muted">
                  The uploaded file <strong className="text-ink">"{duplicateNotice.uploadedName}"</strong> has an identical
                  cryptographic fingerprint (SHA-256) to an existing record already stored in your
                  library: <strong className="text-ink">"{duplicateNotice.existingDoc.originalName}"</strong>.
                </p>
                <div className="font-mono text-xs text-accent pt-1">
                  SHA-256: {duplicateNotice.existingDoc.sha256}
                </div>
              </div>
            </div>
            <button
              onClick={onClearDuplicateNotice}
              className="text-ink-muted hover:text-ink p-1 rounded min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Close notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 pt-1 border-t border-accent-border/50 flex-wrap">
            <button
              onClick={() => {
                onSelectDocumentForReader(duplicateNotice.existingDoc.id);
                onClearDuplicateNotice();
              }}
              className="bg-ink hover:opacity-90 text-paper px-3.5 py-2 min-h-[36px] rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <BookOpen className="w-4 h-4" />
              <span>Open Existing in Reader</span>
            </button>

            {onReplaceDuplicate && duplicateNotice.file && (
              <button
                onClick={() =>
                  onReplaceDuplicate(duplicateNotice.existingDoc.id, duplicateNotice.file!)
                }
                className="bg-accent text-accent-text hover:bg-accent-hover px-3.5 py-2 min-h-[36px] rounded-md text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Replace Existing Record
              </button>
            )}

            <button
              onClick={onClearDuplicateNotice}
              className="text-[13px] text-ink-muted hover:text-ink px-3 py-2 min-h-[36px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Library Records & Controls */}
      <div className="space-y-4">
        {/* Search, Sort, and Metrics Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Stored Documents ({documents.length})
            </h2>
            <span className="text-xs text-ink-faint">
              · {formatBytes(documents.reduce((acc, d) => acc + d.sizeBytes, 0))} Total
            </span>
          </div>

          {documents.length > 0 && (
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Search filter */}
              <div className="relative">
                <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by name, hash, or text..."
                  className="bg-paper-light border border-paper-border focus:border-accent rounded-md pl-9 pr-8 py-2 min-h-[36px] text-[13px] text-ink placeholder-ink-faint focus:outline-none w-full sm:w-64 transition-all duration-150 focus-visible:ring-1 focus-visible:ring-accent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-0.5"
                    title="Clear filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1.5 bg-paper-light border border-paper-border rounded-md px-3 py-2 min-h-[36px] text-[13px] text-ink-muted">
                <ArrowUpDown className="w-3.5 h-3.5 text-ink-faint" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as LibrarySortOption)}
                  className="bg-transparent border-none text-[13px] text-ink focus:outline-none cursor-pointer"
                  aria-label="Sort documents"
                >
                  <option value="newest" className="bg-paper-light text-ink">Newest Added</option>
                  <option value="oldest" className="bg-paper-light text-ink">Oldest Added</option>
                  <option value="name-asc" className="bg-paper-light text-ink">Name (A - Z)</option>
                  <option value="name-desc" className="bg-paper-light text-ink">Name (Z - A)</option>
                  <option value="size-desc" className="bg-paper-light text-ink">Size (Largest)</option>
                  <option value="pages-desc" className="bg-paper-light text-ink">Pages (Most)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Skeleton Loaders while PDF is parsing */}
        {isProcessing && (
          <div className="border border-paper-border bg-paper-light rounded-lg overflow-hidden divide-y divide-paper-border animate-pulse shadow-xs">
            {[1, 2].map((idx) => (
              <div key={idx} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-48 bg-paper-dim rounded" />
                    <div className="h-4 w-16 bg-paper-dim rounded" />
                    <div className="h-4 w-20 bg-paper-dim rounded" />
                  </div>
                  <div className="h-3.5 w-3/4 bg-paper-dim rounded" />
                  <div className="h-3 w-1/2 bg-paper-dim rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-9 w-20 bg-paper-dim rounded-md" />
                  <div className="h-9 w-20 bg-paper-dim rounded-md" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty States */}
        {documents.length === 0 ? (
          /* First-use empty state: sample documents are NEVER loaded automatically */
          <div className="border border-paper-border bg-paper-light rounded-lg p-8 sm:p-12 text-center text-ink-muted space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-paper border border-paper-border p-3 flex items-center justify-center shadow-xs">
              <img
                src="/doculens-mark-transparent.png"
                alt="DocuLens Emblem"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="space-y-1.5">
              <p className="font-serif text-xl font-semibold text-ink">
                Your Local Document Library is Empty
              </p>
              <p className="text-[13px] max-w-md mx-auto text-ink-muted leading-relaxed">
                DocuLens operates 100% on your device with zero cloud tracking. Ingest your own PDF
                documents above, or explore the tool using our pre-structured benchmark documents.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-ink hover:opacity-90 text-paper min-h-[36px] text-[13px] font-semibold py-2 px-5 rounded-md transition-all duration-150 flex items-center gap-2 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Upload className="w-4 h-4" />
                <span>Upload a PDF File</span>
              </button>
              <button
                onClick={onLoadSampleData}
                disabled={isProcessing}
                className="bg-paper-light hover:bg-paper-dim text-ink border border-paper-border min-h-[36px] text-[13px] font-medium py-2 px-4 rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Sparkles className="w-4 h-4 text-accent" />
                <span>Load Benchmark Suite (Demo)</span>
              </button>
            </div>
          </div>
        ) : filteredAndSortedDocs.length === 0 ? (
          /* No search matches state */
          <div className="border border-paper-border bg-paper-light rounded-lg p-8 sm:p-10 text-center text-ink-muted space-y-3">
            <Search className="w-8 h-8 mx-auto text-ink-faint" />
            <p className="font-serif text-lg text-ink font-semibold">
              No documents matched "{searchQuery}"
            </p>
            <p className="text-[13px] max-w-sm mx-auto text-ink-muted leading-relaxed">
              No records match your search filter. Try searching for a different keyword or clear the
              filter to view all stored records.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center justify-center min-h-[36px] px-4 py-2 bg-paper-dim hover:bg-paper border border-paper-border rounded-md text-[13px] font-medium text-accent hover:text-accent-hover transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Clear Search Filter
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-paper-border bg-paper-light rounded-lg overflow-hidden divide-y divide-paper-border shadow-xs">
            {filteredAndSortedDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-4 sm:p-5 hover:bg-paper-dim/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  {/* First-Page Thumbnail Preview */}
                  <div
                    onClick={() => onSelectDocumentForReader(doc.id)}
                    className="w-16 sm:w-20 shrink-0 aspect-[3/4] rounded-md overflow-hidden bg-paper border border-paper-border shadow-xs cursor-pointer group hover:border-accent transition-all relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title={`Open "${doc.originalName}" in Reader`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDocumentForReader(doc.id);
                      }
                    }}
                  >
                    <PageThumbnail
                      documentId={doc.id}
                      pageNumber={1}
                      viewScope="library"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                      alt={`Page 1 thumbnail for ${doc.originalName}`}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors pointer-events-none" />
                  </div>

                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-sans font-semibold text-ink text-base truncate">
                        {doc.originalName}
                      </span>
                      <span className="text-xs text-ink-muted">
                        ({doc.pageCount} page{doc.pageCount > 1 ? 's' : ''})
                      </span>
                      <span className="text-xs text-ink-faint">·</span>
                      <span className="text-xs text-ink-muted font-mono">{formatBytes(doc.sizeBytes)}</span>
                      <span className="text-xs text-ink-faint">·</span>
                      <span className="text-xs text-ink-muted font-mono">
                        {doc.elementCount} elements
                      </span>
                      {doc.tableCount > 0 && (
                        <>
                          <span className="text-xs text-ink-faint">·</span>
                          <span className="text-xs text-accent font-medium">
                            {doc.tableCount} table{doc.tableCount > 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                      {doc.isScanned && !doc.ocrProcessed && (
                        <>
                          <span className="text-xs text-ink-faint">·</span>
                          <span className="text-xs text-accent font-medium bg-accent-subtle border border-accent-border px-1.5 py-0.5 rounded">
                            Scanned Image
                          </span>
                        </>
                      )}
                      {doc.ocrProcessed && (
                        <>
                          <span className="text-xs text-ink-faint">·</span>
                          <span
                            className="text-xs text-accent font-medium bg-accent-subtle border border-accent-border px-1.5 py-0.5 rounded font-mono"
                            title={`Extracted via in-browser OCR (${typeof doc.ocrConfidence === 'number' ? Math.round(doc.ocrConfidence) : 0}% Confidence)`}
                          >
                            OCR {typeof doc.ocrConfidence === 'number' ? `(${Math.round(doc.ocrConfidence)}%)` : ''}
                          </span>
                        </>
                      )}
                      {doc.isReflowed && (
                        <>
                          <span className="text-xs text-ink-faint">·</span>
                          <span
                            className="text-[11px] text-amber-300 font-medium bg-[#E8A94A]/10 border border-[#E8A94A]/30 px-1.5 py-0.5 rounded font-mono"
                            title="Virtual paginated pages from reflowed source"
                          >
                            reflowed
                          </span>
                        </>
                      )}
                    </div>

                    {/* Summary / Warning */}
                    {doc.summary && (
                      <p className="text-[13px] text-ink-muted line-clamp-2 max-w-3xl leading-relaxed">
                        {doc.summary}
                      </p>
                    )}

                    {doc.warningMessage && (
                      <p className="text-xs text-accent leading-relaxed font-mono">
                        ⚠️ {doc.warningMessage}
                      </p>
                    )}

                    {/* Cryptographic SHA-256 fingerprint */}
                    <div className="flex items-center gap-2 text-xs text-ink-muted pt-1 flex-wrap">
                      <span className="font-mono text-ink-faint">SHA-256:</span>
                      <span className="font-mono text-ink truncate max-w-[200px] sm:max-w-md">
                        {doc.sha256}
                      </span>
                      <button
                        onClick={() => copyHash(doc.sha256)}
                        title="Copy SHA-256 checksum"
                        className="text-ink-faint hover:text-ink transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      >
                        {copiedHash === doc.sha256 ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="text-ink-faint">·</span>
                      <span className="text-ink-faint">
                        Added {new Date(doc.createdAt).toLocaleDateString()} {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Document Actions */}
                <div className="flex items-center gap-2 shrink-0 self-start md:self-center flex-wrap">
                  <button
                    onClick={() => onSelectDocumentForReader(doc.id)}
                    title="Read with Provenance Inspector"
                    className="flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-[13px] font-medium text-ink bg-paper hover:bg-paper-dim border border-paper-border rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <BookOpen className="w-4 h-4 text-accent" />
                    <span>Reader</span>
                  </button>

                  {doc.tableCount > 0 && (
                    <button
                      onClick={() => onSelectDocumentForTables(doc.id)}
                      title="View & Export Extracted Tables"
                      className="flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-[13px] font-medium text-ink bg-paper hover:bg-paper-dim border border-paper-border rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Table className="w-4 h-4 text-ink-muted" />
                      <span>Tables</span>
                    </button>
                  )}

                  {onSelectDocumentForFigures && (
                    <button
                      onClick={() => onSelectDocumentForFigures(doc.id)}
                      title="View extracted figures & diagrams"
                      className="flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-[13px] font-medium text-ink bg-paper hover:bg-paper-dim border border-paper-border rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ImageIcon className="w-4 h-4 text-ink-muted" />
                      <span>Figures</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSelectDocumentForCompare(doc.id)}
                    title="Compare against another revision"
                    className="flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-[13px] font-medium text-ink bg-paper hover:bg-paper-dim border border-paper-border rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <GitCompare className="w-4 h-4 text-ink-muted" />
                    <span>Compare</span>
                  </button>

                  <button
                    onClick={() => setConfirmDeleteDoc(doc)}
                    title="Delete document and related records"
                    className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-faint hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`Delete ${doc.originalName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmed Deletion Modal */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-paper-light border border-paper-border rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif font-semibold text-lg text-ink">
                  Permanently Delete Document?
                </h3>
                <p className="text-[13px] text-ink-muted leading-relaxed">
                  You are about to delete <strong className="text-ink">"{confirmDeleteDoc.originalName}"</strong> from your
                  local IndexedDB repository.
                </p>
              </div>
            </div>

            <div className="p-3 bg-paper border border-paper-border rounded-lg font-mono text-xs text-ink-muted space-y-1.5">
              <div className="flex justify-between">
                <span>Pages:</span>
                <span className="text-ink font-semibold">{confirmDeleteDoc.pageCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Extracted Elements:</span>
                <span className="text-ink font-semibold">{confirmDeleteDoc.elementCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Provenance Chunks:</span>
                <span className="text-ink font-semibold">{confirmDeleteDoc.chunkCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Tables:</span>
                <span className="text-ink font-semibold">{confirmDeleteDoc.tableCount}</span>
              </div>
            </div>

            <div className="p-3 bg-paper border border-paper-border rounded-lg text-xs text-ink-muted leading-relaxed space-y-1">
              <span className="font-semibold block text-ink">Deletion Scope & Privacy:</span>
              <p>
                This operation immediately and permanently purges the document binary, extracted
                elements, lexical chunks, and extracted tables from your browser's IndexedDB.
                The DocuLens server stores zero copies; no remote or cloud records exist.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteDoc(null)}
                className="px-4 py-2 min-h-[36px] text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const docId = confirmDeleteDoc.id;
                  setConfirmDeleteDoc(null);
                  await onDeleteDocument(docId);
                }}
                className="px-4 py-2 min-h-[36px] text-[13px] font-medium text-white bg-destructive hover:bg-destructive/90 rounded-md transition-all duration-150 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Browser OCR Prompt Modal */}
      {ocrPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ocr-prompt-title"
          className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div className="bg-paper-light border border-paper-border rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent-subtle border border-accent-border flex items-center justify-center text-accent shrink-0">
                <FileWarning className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="ocr-prompt-title" className="font-serif font-semibold text-lg text-ink">
                  No text layer found. Run OCR?
                </h3>
                <p className="text-[13px] text-ink-muted leading-relaxed">
                  <strong className="text-ink font-medium">"{ocrPrompt.originalName}"</strong> ({ocrPrompt.pageCount} page{ocrPrompt.pageCount > 1 ? 's' : ''}, {formatBytes(ocrPrompt.sizeBytes)}) contains zero extractable text elements.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-paper rounded-lg border border-paper-border text-xs text-ink-muted leading-relaxed space-y-1.5">
              <span className="font-semibold block text-ink">Local In-Browser Processing (Tesseract.js Web Worker)</span>
              <p>
                Optical character recognition runs entirely on your device inside a dedicated Web Worker, one page at a time. No document data or images are sent to any remote server.
              </p>
            </div>

            {/* Live Progress Bar and Stage Feedback */}
            {ocrPrompt.status === 'processing' && (
              <div className="p-4 bg-paper rounded-lg border border-paper-border space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-ink-muted">
                  <span className="text-accent font-medium">
                    {ocrPrompt.progress.message || 'Processing pages...'}
                  </span>
                  <span>{ocrPrompt.progress.percent}%</span>
                </div>

                <div className="w-full bg-paper-dim h-2.5 rounded-full overflow-hidden border border-paper-border">
                  <div
                    className="bg-accent h-full transition-all duration-300 ease-out"
                    style={{ width: `${ocrPrompt.progress.percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-ink-faint font-mono">
                  <span>
                    Page {ocrPrompt.progress.page} of {ocrPrompt.progress.totalPages}
                  </span>
                  <span>Tesseract.js Worker</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-paper-border">
              {ocrPrompt.status === 'processing' ? (
                <button
                  type="button"
                  onClick={onCancelOcr}
                  className="px-4 py-2 min-h-[36px] text-[13px] font-medium text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onCancelOcr}
                    className="px-4 py-2 min-h-[36px] text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border rounded-md hover:bg-paper transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Cancel
                  </button>

                  {onProceedWithoutOcr && (
                    <button
                      type="button"
                      onClick={onProceedWithoutOcr}
                      className="px-3.5 py-2 min-h-[36px] text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border rounded-md hover:bg-paper transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title="Save as scanned document without text layer"
                    >
                      Save Without OCR
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onConfirmRunOcr}
                    className="bg-accent hover:bg-accent-hover text-accent-text font-semibold px-4 py-2 min-h-[36px] rounded-md text-[13px] transition-all duration-150 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shadow-xs"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Run OCR</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
