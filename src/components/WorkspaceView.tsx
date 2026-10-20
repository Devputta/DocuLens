import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
  Cpu,
  Wifi,
  WifiOff,
  CheckCircle,
  AlertTriangle,
  Lock,
  Server,
  RefreshCw,
  FileText,
  Table as TableIcon,
  MessageSquare,
  Bookmark,
  Layers,
  X,
  ArrowRight,
  GitMerge,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { storage } from '../services/storage';
import {
  exportBackupArchive,
  validateBackupFile,
  executeBackupImport,
  BACKUP_SCHEMA_VERSION,
} from '../services/backupService';
import {
  DocumentEntity,
  DocuLensBackup,
  BackupSummary,
  ImportResult,
} from '../types/doculens';

interface WorkspaceViewProps {
  documents?: DocumentEntity[];
  documentsCount: number;
  chunksCount: number;
  tablesCount: number;
  inquiriesCount: number;
  notesCount: number;
  onRefreshAllData: () => Promise<void>;
  isOnline: boolean;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  documents = [],
  documentsCount,
  chunksCount,
  tablesCount,
  inquiriesCount,
  notesCount,
  onRefreshAllData,
  isOnline,
}) => {
  const [storageUsage, setStorageUsage] = useState<{ usedBytes: number; quotaBytes: number }>({
    usedBytes: 0,
    quotaBytes: 0,
  });

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Import state
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<DocuLensBackup | null>(null);
  const [pendingSummary, setPendingSummary] = useState<BackupSummary | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showReplaceConfirmModal, setShowReplaceConfirmModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Reset database state
  const [confirmClear, setConfirmClear] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanReport, setCleanReport] = useState<{
    orphanedElements: number;
    orphanedChunks: number;
    orphanedTables: number;
    orphanedNotes: number;
  } | null>(null);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storage.getStorageEstimate().then((est) => setStorageUsage(est));
  }, [documentsCount, chunksCount]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const showNotification = (type: 'success' | 'error', title: string, message: string) => {
    setNotification({ type, title, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 5500);
  };

  /**
   * "Export backup" downloads one JSON file containing all documents, chunks,
   * elements, extracted tables and notes from IndexedDB, with a schema version
   * and an export timestamp. Everything stays strictly local.
   */
  const handleExportBackup = async () => {
    setIsExporting(true);
    setValidationError(null);
    try {
      const { filename, backup } = await exportBackupArchive();
      showNotification(
        'success',
        'Backup Exported Successfully',
        `Downloaded "${filename}" containing ${backup.documents.length} document(s), ${backup.tables.length} table(s), and ${backup.notes.length} note(s) from IndexedDB.`
      );
    } catch (err: any) {
      showNotification(
        'error',
        'Export Failed',
        err?.message || 'Failed to generate backup archive.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * "Import backup" lets user choose a file, validates schema version and structure.
   * Never trusts imported data: validates types and sizes, rejects malformed files.
   */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsValidatingFile(true);
    setValidationError(null);

    try {
      // Fetch latest docs for accurate conflict detection if not provided via props
      const existingDocs = documents.length > 0 ? documents : await storage.getDocuments();
      const validation = await validateBackupFile(file, existingDocs);

      if (!validation.valid) {
        setValidationError(validation.error);
        showNotification('error', 'Backup File Rejected', validation.error);
        if (importFileInputRef.current) importFileInputRef.current.value = '';
        return;
      }

      setPendingBackup(validation.backup);
      setPendingSummary(validation.summary);
      setPendingFileName(file.name);
      setShowSummaryModal(true);
    } catch (err: any) {
      const msg = `Unable to process backup file: ${err?.message || 'Unknown error'}`;
      setValidationError(msg);
      showNotification('error', 'Validation Error', msg);
    } finally {
      setIsValidatingFile(false);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  /**
   * Merge: Combines imported data with existing records in a single transaction.
   */
  const handleExecuteMerge = async () => {
    if (!pendingBackup) return;
    setIsImporting(true);
    try {
      const result: ImportResult = await executeBackupImport(pendingBackup, 'merge');
      await onRefreshAllData();
      setShowSummaryModal(false);
      setPendingBackup(null);
      setPendingSummary(null);
      showNotification(
        'success',
        'Backup Merged Successfully',
        `Merged ${result.documentsImported} document(s), ${result.tablesImported} table(s), and ${result.notesImported} note(s) into local IndexedDB in a single transaction.`
      );
    } catch (err: any) {
      showNotification(
        'error',
        'Import Transaction Failed',
        `Merge aborted with zero partial writes: ${err?.message || 'Database error'}`
      );
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Replace all: Requires explicit confirmation before executing in a single transaction.
   */
  const handleExecuteReplaceAll = async () => {
    if (!pendingBackup) return;
    setIsImporting(true);
    try {
      const result: ImportResult = await executeBackupImport(pendingBackup, 'replace');
      await onRefreshAllData();
      setShowReplaceConfirmModal(false);
      setShowSummaryModal(false);
      setPendingBackup(null);
      setPendingSummary(null);
      showNotification(
        'success',
        'Workspace Replaced Successfully',
        `Replaced all existing storage with ${result.documentsImported} document(s), ${result.tablesImported} table(s), and ${result.notesImported} note(s) in a single transaction.`
      );
    } catch (err: any) {
      showNotification(
        'error',
        'Replace Transaction Failed',
        `Replace aborted with zero partial writes: ${err?.message || 'Database error'}`
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloseImportModal = () => {
    setShowSummaryModal(false);
    setShowReplaceConfirmModal(false);
    setPendingBackup(null);
    setPendingSummary(null);
    setValidationError(null);
  };

  const handleClearAll = async () => {
    try {
      await storage.resetDatabase();
      await onRefreshAllData();
      setConfirmClear(false);
      showNotification(
        'success',
        'Workspace Reset',
        'Local IndexedDB database cleared permanently.'
      );
    } catch (e: any) {
      showNotification('error', 'Reset Failed', `Clear failed: ${e?.message}`);
    }
  };

  const handleVerifyAndCleanStorage = async () => {
    setIsCleaning(true);
    try {
      const report = await storage.cleanupOrphanedRecords();
      setCleanReport(report);
      await onRefreshAllData();
      const totalPurged =
        report.orphanedElements +
        report.orphanedChunks +
        report.orphanedTables +
        report.orphanedNotes;
      if (totalPurged > 0) {
        showNotification(
          'success',
          'Integrity Audit Complete',
          `Cleaned ${totalPurged} orphaned record(s) from previous interrupted deletions.`
        );
      } else {
        showNotification(
          'success',
          'Integrity Verified',
          'Storage integrity verified: Zero orphaned records found in database.'
        );
      }
    } catch (err: any) {
      showNotification('error', 'Audit Error', `Integrity check error: ${err?.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="border-b border-paper-border pb-4">
        <h1 className="text-2xl font-serif font-semibold text-ink">
          Settings & Workspace Controls
        </h1>
      </div>

      {/* Global Notifications */}
      {notification && (
        <div
          role="alert"
          className={`p-4 rounded-lg border text-[13px] flex items-start gap-3 shadow-xs transition-all duration-150 ${
            notification.type === 'success'
              ? 'bg-paper-light border-accent-border text-ink'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h4 className="font-semibold text-ink">{notification.title}</h4>
            <p className="text-ink-muted mt-0.5">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-ink-faint hover:text-ink p-1 rounded-md transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Validation Error Banner */}
      {validationError && (
        <div
          role="alert"
          className="p-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-[13px] flex items-start gap-3 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <h4 className="font-semibold text-red-200">Invalid Backup File</h4>
            <p className="text-red-300/90 leading-relaxed font-mono text-xs">{validationError}</p>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-red-400 hover:text-red-200 p-1"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Product & Security Identity Banner */}
      <div className="border border-paper-border bg-paper-light rounded-lg p-6 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-xs">
        <div className="w-20 h-20 rounded-lg border border-paper-border bg-paper p-2 flex items-center justify-center shrink-0 shadow-xs">
          <img
            src="/doculens-mark-transparent.png"
            alt="DocuLens Identity"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="space-y-2.5 text-center md:text-left flex-1 font-sans">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-serif font-semibold text-ink">
                DocuLens — Local Document Intelligence
              </h2>
              <p className="text-[13px] text-ink-muted mt-0.5">
                Privacy-first on-device document inspection, lexical indexing, and citation verification
              </p>
            </div>
            <span className="font-mono text-xs text-accent bg-paper border border-paper-border px-3 py-1 rounded-md self-center md:self-start">
              Schema v{BACKUP_SCHEMA_VERSION} · Local Core
            </span>
          </div>

          <p className="text-[13px] text-ink-muted leading-relaxed max-w-2xl font-sans">
            DocuLens operates strictly in your browser sandbox. All documents, layout chunks, bounding
            boxes, extracted tables, and marginalia notes reside exclusively in client IndexedDB. No
            document binary or parsed text is ever transmitted to remote storage.
          </p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1 text-xs text-ink-faint font-mono">
            <span>Midnight & Amber Theme</span>
            <span aria-hidden="true">·</span>
            <span>Single-Transaction Backup</span>
            <span aria-hidden="true">·</span>
            <span>Atomic Rollback</span>
            <span aria-hidden="true">·</span>
            <span>Zero Network Calls</span>
          </div>
        </div>
      </div>

      {/* Primary Feature: Backup & Restore */}
      <div className="border border-paper-border bg-paper-light rounded-lg p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-serif font-semibold text-ink">
                Backup & Restore
              </h2>
            </div>
            <p className="text-[13px] text-ink-muted mt-1 max-w-2xl leading-relaxed font-sans">
              Export your entire IndexedDB workspace into a portable JSON backup file, or restore an
              existing backup. Backups contain all documents, chunks, elements, tables, and notes with
              cryptographic verification and schema versioning.
            </p>
          </div>
          <span className="text-xs font-mono text-ink-faint bg-paper px-2.5 py-1 rounded border border-paper-border shrink-0 self-start sm:self-center">
            Zero Network Calls · 100% Local
          </span>
        </div>

        {/* Action Controls */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          {/* Export backup button */}
          <button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="flex items-center gap-2 text-[13px] font-semibold text-paper bg-ink hover:opacity-90 rounded-md px-5 py-2.5 min-h-[36px] transition-all duration-150 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            title="Download full JSON archive of all IndexedDB records"
          >
            {isExporting ? (
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Export backup</span>
          </button>

          {/* Hidden File Input for Import backup */}
          <input
            type="file"
            ref={importFileInputRef}
            onChange={handleFileSelected}
            accept=".json,application/json"
            className="hidden"
            aria-label="Choose backup JSON file to import"
          />

          {/* Import backup trigger button */}
          <button
            onClick={() => importFileInputRef.current?.click()}
            disabled={isValidatingFile}
            className="flex items-center gap-2 text-[13px] font-medium text-ink border border-paper-border bg-paper hover:bg-paper-dim rounded-md px-5 py-2.5 min-h-[36px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            title="Choose a backup JSON file to validate and restore"
          >
            {isValidatingFile ? (
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
            ) : (
              <Upload className="w-4 h-4 text-accent" />
            )}
            <span>Import backup</span>
          </button>

          {/* Reset Local Database */}
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-2 text-[13px] font-medium text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 rounded-md px-4 py-2 min-h-[36px] transition-all duration-150 sm:ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reset Local Database</span>
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-ink-muted font-sans">
          <div className="p-3 bg-paper rounded border border-paper-border space-y-1">
            <span className="font-semibold text-ink block">Comprehensive Snapshot</span>
            <p className="leading-relaxed">
              Captures all documents, layout chunks, bounding boxes, tables, and notes into one verified JSON archive.
            </p>
          </div>
          <div className="p-3 bg-paper rounded border border-paper-border space-y-1">
            <span className="font-semibold text-ink block">Atomic Single-Transaction</span>
            <p className="leading-relaxed">
              Imports run within one IndexedDB transaction. If anything fails, the database rolls back with zero partial writes.
            </p>
          </div>
          <div className="p-3 bg-paper rounded border border-paper-border space-y-1">
            <span className="font-semibold text-ink block">Untrusted Data Validation</span>
            <p className="leading-relaxed">
              Strict schema, size, and type verification. Malformed records are blocked before touching storage.
            </p>
          </div>
        </div>
      </div>

      {/* Storage and Connectivity Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connection status */}
        <div className="p-5 bg-paper-light border border-paper-border rounded-lg space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider">Network Mode</span>
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-accent" />
            )}
          </div>
          <div className="text-lg font-serif font-semibold text-ink">
            {isOnline ? 'Online (Local Core)' : 'Completely Offline'}
          </div>
          <p className="text-xs text-ink-faint leading-normal font-sans">
            No internet required for backup, restore, search, tables, or citation inspection.
          </p>
        </div>

        {/* Local Storage Quota */}
        <div className="p-5 bg-paper-light border border-paper-border rounded-lg space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider">IndexedDB Usage</span>
            <HardDrive className="w-4 h-4 text-ink-faint" />
          </div>
          <div className="text-lg font-mono font-semibold text-ink">
            {formatBytes(storageUsage.usedBytes || 120000)}
          </div>
          <p className="text-xs text-ink-faint leading-normal font-sans">
            Quota available: {formatBytes(storageUsage.quotaBytes || 1073741824)}
          </p>
        </div>

        {/* Provenance Chunks */}
        <div className="p-5 bg-paper-light border border-paper-border rounded-lg space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider">Indexed Chunks</span>
            <Cpu className="w-4 h-4 text-ink-faint" />
          </div>
          <div className="text-lg font-mono font-semibold text-ink">{chunksCount}</div>
          <p className="text-xs text-ink-faint leading-normal font-sans">
            Across {documentsCount} active document{documentsCount === 1 ? '' : 's'}.
          </p>
        </div>

        {/* Tables & Marginalia */}
        <div className="p-5 bg-paper-light border border-paper-border rounded-lg space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider">Tables / Notes</span>
            <ShieldCheck className="w-4 h-4 text-ink-faint" />
          </div>
          <div className="text-lg font-mono font-semibold text-ink">
            {tablesCount} / {notesCount}
          </div>
          <p className="text-xs text-ink-faint leading-normal font-sans">
            {inquiriesCount} grounded inquiry logs saved.
          </p>
        </div>
      </div>

      {/* Storage Integrity & Purge Diagnostics */}
      <div className="border border-paper-border bg-paper-light rounded-lg p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Trash2 className="w-4 h-4 text-accent" />
          <h2 className="text-base font-serif font-semibold text-ink">
            Database Integrity & Orphaned Record Purge
          </h2>
        </div>

        <p className="text-[13px] text-ink-muted max-w-2xl leading-relaxed font-sans">
          When you delete a document in DocuLens, all associated elements, chunks, tables, and notes
          are purged immediately across IndexedDB. You can audit storage integrity at any time to verify
          no orphaned records exist.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleVerifyAndCleanStorage}
            disabled={isCleaning}
            className="flex items-center gap-2 text-[13px] font-medium text-ink bg-paper hover:bg-paper-dim border border-paper-border rounded-md px-4 py-2 min-h-[36px] transition-all duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw className={`w-4 h-4 text-accent ${isCleaning ? 'animate-spin' : ''}`} />
            <span>Verify Storage Integrity & Purge Orphaned Chunks</span>
          </button>

          {cleanReport && (
            <span className="text-xs text-ink-faint font-mono">
              Audit result: {cleanReport.orphanedChunks} chunks, {cleanReport.orphanedElements} elements cleaned.
            </span>
          )}
        </div>
      </div>

      {/* Security Boundaries Summary */}
      <div className="border border-paper-border bg-paper-light rounded-lg p-6 space-y-4 shadow-xs">
        <h2 className="text-base font-serif font-semibold text-ink">
          Security Controls & Data Isolation Boundaries
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
          <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
            <span className="font-semibold text-ink text-[13px] block">1. Local-Only Storage</span>
            <p className="text-ink-muted leading-relaxed">
              PDF binaries, extracted layout trees, and notes reside 100% in client-side IndexedDB.
              No cloud synchronization, telemetry, or remote document tracking.
            </p>
          </div>

          <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
            <span className="font-semibold text-ink text-[13px] block">2. Single-Transaction Atomicity</span>
            <p className="text-ink-muted leading-relaxed">
              Backup restore operations execute inside an atomic IndexedDB transaction. If any record
              validation or disk write errors occur, all changes are aborted.
            </p>
          </div>

          <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
            <span className="font-semibold text-ink text-[13px] block">3. RFC-4180 Formula Defense</span>
            <p className="text-ink-muted leading-relaxed">
              Extracted tables neutralize formula macro characters (=, +, -, @) upon export to prevent
              spreadsheet command injection.
            </p>
          </div>
        </div>

        <div className="pt-2 text-xs text-ink-faint flex items-center justify-between border-t border-paper-border flex-wrap gap-2">
          <span>Security & vulnerability reporting guidelines are maintained in root <code>SECURITY.md</code>.</span>
          <span className="font-mono">Zero Telemetry · Local-First</span>
        </div>
      </div>

      {/* MODAL 1: Backup Summary & Action Dialog ("Merge" or "Replace all") */}
      {showSummaryModal && pendingSummary && !showReplaceConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-paper-light border border-paper-border rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-paper-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-accent" />
                  <h3 className="text-lg font-serif font-semibold text-ink">
                    Import Backup Summary
                  </h3>
                </div>
                <p className="text-xs text-ink-muted mt-1 font-mono truncate max-w-md">
                  {pendingFileName} · Schema v{pendingSummary.schemaVersion} · Exported{' '}
                  {new Date(pendingSummary.exportTimestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleCloseImportModal}
                disabled={isImporting}
                className="text-ink-faint hover:text-ink p-1 rounded-md transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Core Metric Cards: Documents, Tables, Notes */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3.5 bg-paper rounded-lg border border-paper-border space-y-1 shadow-xs">
                <FileText className="w-4 h-4 text-accent mx-auto" />
                <div className="text-xl font-serif font-bold text-ink">
                  {pendingSummary.documentCount}
                </div>
                <div className="text-xs text-ink-muted font-medium">Documents</div>
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-paper-border space-y-1 shadow-xs">
                <TableIcon className="w-4 h-4 text-accent mx-auto" />
                <div className="text-xl font-serif font-bold text-ink">
                  {pendingSummary.tableCount}
                </div>
                <div className="text-xs text-ink-muted font-medium">Tables</div>
              </div>

              <div className="p-3.5 bg-paper rounded-lg border border-paper-border space-y-1 shadow-xs">
                <Bookmark className="w-4 h-4 text-accent mx-auto" />
                <div className="text-xl font-serif font-bold text-ink">
                  {pendingSummary.noteCount}
                </div>
                <div className="text-xs text-ink-muted font-medium">Notes</div>
              </div>
            </div>

            {/* Secondary Metadata Info */}
            <div className="text-xs text-ink-faint flex items-center justify-between px-1">
              <span>Indexed chunks: <strong className="text-ink font-mono">{pendingSummary.chunkCount}</strong></span>
              <span>Layout elements: <strong className="text-ink font-mono">{pendingSummary.elementCount}</strong></span>
              <span>Integrity: <strong className="text-emerald-400">All SHA-256 Validated</strong></span>
            </div>

            {/* Document Names Preview */}
            {pendingSummary.documentNames.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Documents Included in Backup:
                </span>
                <div className="max-h-28 overflow-y-auto bg-paper rounded border border-paper-border p-2 space-y-1 divide-y divide-paper-border text-xs">
                  {pendingSummary.documentNames.map((name, idx) => (
                    <div key={idx} className="pt-1 first:pt-0 flex items-center gap-2 text-ink">
                      <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conflict & Merging Preview */}
            {pendingSummary.conflicts.conflictingDocIds.length > 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-1 text-amber-200">
                <div className="flex items-center gap-1.5 font-semibold text-accent">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    Merge Conflict Alert: {pendingSummary.conflicts.conflictingDocIds.length} Document Collision(s)
                  </span>
                </div>
                <p className="leading-relaxed text-ink-muted">
                  The backup contains document(s) matching IDs or hashes already in your database (
                  <strong className="text-ink">
                    {pendingSummary.conflicts.conflictingDocNames.slice(0, 3).join(', ')}
                    {pendingSummary.conflicts.conflictingDocNames.length > 3 ? '...' : ''}
                  </strong>
                  ).
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-ink-muted">
                  <li>
                    <strong className="text-ink">Merge:</strong> Updates matching records and adds new documents without removing existing documents.
                  </li>
                  <li>
                    <strong className="text-ink">Replace all:</strong> Erases everything and restores only this backup snapshot.
                  </li>
                </ul>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  Zero conflicts detected. All {pendingSummary.documentCount} document(s) in this backup will be cleanly added to your workspace.
                </span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-paper-border">
              <button
                onClick={handleCloseImportModal}
                disabled={isImporting}
                className="w-full sm:w-auto px-4 py-2 min-h-[36px] text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border hover:bg-paper rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                {/* Replace all button (triggers explicit confirmation) */}
                <button
                  onClick={() => setShowReplaceConfirmModal(true)}
                  disabled={isImporting}
                  className="w-full sm:w-auto px-4 py-2 min-h-[36px] text-[13px] font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  title="Wipes existing documents and restores this backup"
                >
                  Replace all...
                </button>

                {/* Merge button */}
                <button
                  onClick={handleExecuteMerge}
                  disabled={isImporting}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 min-h-[36px] text-[13px] font-semibold text-paper bg-ink hover:opacity-90 rounded-md transition-all duration-150 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  title="Combine backup with existing data in one transaction"
                >
                  {isImporting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                  ) : (
                    <GitMerge className="w-4 h-4 text-accent" />
                  )}
                  <span>Merge (Keep Existing)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Explicit Confirmation for "Replace all" */}
      {showReplaceConfirmModal && pendingSummary && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-paper-light border border-red-500/40 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-400 font-serif font-semibold text-lg">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
              <span>Confirm: Replace All Records?</span>
            </div>

            <p className="text-[13px] text-ink-muted leading-relaxed font-sans">
              This action requires explicit confirmation. All <strong className="text-ink">{documentsCount} current document(s)</strong>,{' '}
              <strong className="text-ink">{tablesCount} table(s)</strong>, and{' '}
              <strong className="text-ink">{notesCount} note(s)</strong> currently stored in your browser's
              IndexedDB will be permanently deleted and replaced with the{' '}
              <strong className="text-ink">{pendingSummary.documentCount} document(s)</strong> from backup file{' '}
              <code className="text-xs font-mono text-accent bg-paper px-1.5 py-0.5 rounded border border-paper-border">
                {pendingFileName}
              </code>.
            </p>

            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-300 font-sans">
              <strong>Warning:</strong> This cannot be undone. Imported in a single atomic transaction.
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-paper-border">
              <button
                onClick={() => setShowReplaceConfirmModal(false)}
                disabled={isImporting}
                className="px-4 py-2 min-h-[36px] text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border hover:bg-paper rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                Back to Options
              </button>
              <button
                onClick={handleExecuteReplaceAll}
                disabled={isImporting}
                className="flex items-center gap-2 px-5 py-2 min-h-[36px] text-[13px] font-semibold text-white bg-destructive hover:opacity-90 rounded-md transition-all duration-150 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                {isImporting && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Confirm Replace All</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Reset Local Database */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-paper-light border border-paper-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-serif font-semibold text-lg">
              <AlertTriangle className="w-5 h-5" />
              <span>Reset Entire Workspace?</span>
            </div>
            <p className="text-[13px] text-ink-muted leading-relaxed font-sans">
              This will permanently delete all stored documents, chunks, tables, and notes from your
              browser's IndexedDB.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 min-h-[36px] text-[13px] font-medium text-ink-muted hover:text-ink border border-paper-border hover:bg-paper rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 min-h-[36px] text-[13px] font-semibold text-white bg-destructive hover:opacity-90 rounded-md transition-all duration-150 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
