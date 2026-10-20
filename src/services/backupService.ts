/**
 * DocuLens — Local Backup & Restore Service
 *
 * Requirements:
 * - "Export backup" downloads one JSON file containing all documents, chunks,
 *   elements, extracted tables and notes from IndexedDB, with a schema version
 *   and an export timestamp.
 * - "Import backup" lets the user choose a file, validates schema version and
 *   structure, shows a summary (documents, tables, notes), and offers
 *   "Merge" or "Replace all". Replace requires explicit confirmation.
 * - Never trust imported data: validate types and sizes, reject malformed files
 *   with a clear error, and never run partial imports (use one transaction).
 * - Everything stays local. No network calls.
 */

import {
  DocuLensBackup,
  BackupSummary,
  BackupValidationResult,
  BackupConflictInfo,
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  MarginaliaNote,
  ImportResult,
  DocumentStatus,
  ElementType,
} from '../types/doculens';
import { storage } from './storage';

export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024; // 50 Megabytes safety ceiling

// Reasonable bounds to prevent memory denial-of-service
const MAX_ALLOWED_DOCUMENTS = 5000;
const MAX_ALLOWED_ELEMENTS = 200000;
const MAX_ALLOWED_CHUNKS = 100000;
const MAX_ALLOWED_TABLES = 10000;
const MAX_ALLOWED_NOTES = 10000;

const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;

/**
 * Compares backup document entities against currently stored documents to detect
 * ID collisions or identical SHA-256 binary fingerprints.
 */
export function analyzeBackupConflicts(
  backupDocs: DocumentEntity[],
  existingDocs: DocumentEntity[]
): BackupConflictInfo {
  const existingIdSet = new Set(existingDocs.map((d) => d.id));
  const existingHashSet = new Set(existingDocs.map((d) => d.sha256.toLowerCase()));

  const conflictingDocIds: string[] = [];
  const conflictingDocNames: string[] = [];
  let newDocCount = 0;
  let matchingSha256Count = 0;

  for (const doc of backupDocs) {
    let hasConflict = false;
    if (existingIdSet.has(doc.id)) {
      conflictingDocIds.push(doc.id);
      conflictingDocNames.push(doc.originalName);
      hasConflict = true;
    }
    if (existingHashSet.has(doc.sha256.toLowerCase())) {
      matchingSha256Count++;
    }
    if (!hasConflict) {
      newDocCount++;
    }
  }

  return {
    conflictingDocIds,
    conflictingDocNames,
    newDocCount,
    matchingSha256Count,
  };
}

/**
 * Validates a parsed JavaScript object representation of a DocuLens backup archive.
 * Rejects malformed structures, improper data types, invalid schemas, or excessive sizes.
 */
export function validateBackupData(
  rawData: unknown,
  existingDocs: DocumentEntity[] = []
): BackupValidationResult {
  // 1. Root object validation
  if (typeof rawData !== 'object' || rawData === null || Array.isArray(rawData)) {
    return {
      valid: false,
      error: 'Malformed backup: The file must contain a single JSON object at its root.',
    };
  }

  const obj = rawData as Record<string, any>;

  // 2. Schema version validation
  if (obj.schemaVersion === undefined || obj.schemaVersion === null) {
    return {
      valid: false,
      error: "Malformed backup: Missing required 'schemaVersion' field.",
    };
  }

  if (typeof obj.schemaVersion !== 'number' || !Number.isInteger(obj.schemaVersion)) {
    return {
      valid: false,
      error: "Malformed backup: 'schemaVersion' must be an integer.",
    };
  }

  if (obj.schemaVersion < 1 || obj.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Unsupported backup schema version ${obj.schemaVersion}. Supported version is ${BACKUP_SCHEMA_VERSION}.`,
    };
  }

  // 3. Export timestamp / date validation
  let exportTimestamp = Date.now();
  let exportedAt = new Date().toISOString();

  if (typeof obj.exportTimestamp === 'number' && Number.isFinite(obj.exportTimestamp) && obj.exportTimestamp > 0) {
    exportTimestamp = obj.exportTimestamp;
  } else if (typeof obj.exportedAt === 'string' && !isNaN(Date.parse(obj.exportedAt))) {
    exportTimestamp = Date.parse(obj.exportedAt);
  } else {
    return {
      valid: false,
      error: "Malformed backup: Missing or invalid 'exportTimestamp' or 'exportedAt' date.",
    };
  }

  if (typeof obj.exportedAt === 'string' && !isNaN(Date.parse(obj.exportedAt))) {
    exportedAt = obj.exportedAt;
  } else {
    exportedAt = new Date(exportTimestamp).toISOString();
  }

  // 4. Required stores presence and array types
  const requiredStores = ['documents', 'chunks', 'elements', 'tables', 'notes'] as const;
  for (const store of requiredStores) {
    if (!Array.isArray(obj[store])) {
      return {
        valid: false,
        error: `Malformed backup: Required store '${store}' is missing or is not an array.`,
      };
    }
  }

  const rawDocs = obj.documents as unknown[];
  const rawElements = obj.elements as unknown[];
  const rawChunks = obj.chunks as unknown[];
  const rawTables = obj.tables as unknown[];
  const rawNotes = obj.notes as unknown[];

  // 5. Volume ceilings check
  if (rawDocs.length > MAX_ALLOWED_DOCUMENTS) {
    return {
      valid: false,
      error: `Backup contains ${rawDocs.length} documents, exceeding the safety limit of ${MAX_ALLOWED_DOCUMENTS}.`,
    };
  }
  if (rawElements.length > MAX_ALLOWED_ELEMENTS) {
    return {
      valid: false,
      error: `Backup contains ${rawElements.length} elements, exceeding the safety limit of ${MAX_ALLOWED_ELEMENTS}.`,
    };
  }
  if (rawChunks.length > MAX_ALLOWED_CHUNKS) {
    return {
      valid: false,
      error: `Backup contains ${rawChunks.length} chunks, exceeding the safety limit of ${MAX_ALLOWED_CHUNKS}.`,
    };
  }
  if (rawTables.length > MAX_ALLOWED_TABLES) {
    return {
      valid: false,
      error: `Backup contains ${rawTables.length} tables, exceeding the safety limit of ${MAX_ALLOWED_TABLES}.`,
    };
  }
  if (rawNotes.length > MAX_ALLOWED_NOTES) {
    return {
      valid: false,
      error: `Backup contains ${rawNotes.length} notes, exceeding the safety limit of ${MAX_ALLOWED_NOTES}.`,
    };
  }

  // 6. Deep item validation for Documents
  const validatedDocs: DocumentEntity[] = [];
  const docIdSet = new Set<string>();

  for (let i = 0; i < rawDocs.length; i++) {
    const item = rawDocs[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { valid: false, error: `Document at index ${i} is not a valid object.` };
    }
    const d = item as Record<string, any>;

    if (typeof d.id !== 'string' || !d.id.trim() || d.id.length > 128) {
      return { valid: false, error: `Document at index ${i} is missing a valid 'id'.` };
    }
    if (typeof d.originalName !== 'string' || !d.originalName.trim() || d.originalName.length > 500) {
      return { valid: false, error: `Document at index ${i} has an invalid or missing 'originalName'.` };
    }
    if (typeof d.sha256 !== 'string' || !SHA256_REGEX.test(d.sha256)) {
      return {
        valid: false,
        error: `Document at index ${i} ("${d.originalName}") is missing a valid 64-character SHA-256 fingerprint.`,
      };
    }
    if (typeof d.pageCount !== 'number' || !Number.isFinite(d.pageCount) || d.pageCount < 0) {
      return { valid: false, error: `Document at index ${i} has an invalid 'pageCount'.` };
    }
    const validStatuses = ['queued', 'processing', 'ready', 'failed'];
    if (typeof d.status !== 'string' || !validStatuses.includes(d.status)) {
      return { valid: false, error: `Document at index ${i} has an unrecognized 'status' ("${d.status}").` };
    }

    docIdSet.add(d.id);
    validatedDocs.push({
      id: d.id,
      originalName: d.originalName,
      storedPath: typeof d.storedPath === 'string' ? d.storedPath : `indexeddb://${d.id}`,
      sha256: d.sha256,
      sizeBytes: typeof d.sizeBytes === 'number' && Number.isFinite(d.sizeBytes) ? d.sizeBytes : 0,
      pageCount: d.pageCount,
      status: d.status as DocumentStatus,
      parserName: typeof d.parserName === 'string' ? d.parserName : 'pdfjs-provenance',
      parserVersion: typeof d.parserVersion === 'string' ? d.parserVersion : '1.0.0',
      createdAt: typeof d.createdAt === 'number' && Number.isFinite(d.createdAt) ? d.createdAt : Date.now(),
      processedAt: typeof d.processedAt === 'number' ? d.processedAt : undefined,
      errorCode: typeof d.errorCode === 'string' ? d.errorCode : undefined,
      errorMessage: typeof d.errorMessage === 'string' ? d.errorMessage : undefined,
      summary: typeof d.summary === 'string' ? d.summary : undefined,
      elementCount: typeof d.elementCount === 'number' ? d.elementCount : 0,
      chunkCount: typeof d.chunkCount === 'number' ? d.chunkCount : 0,
      tableCount: typeof d.tableCount === 'number' ? d.tableCount : 0,
      isScanned: Boolean(d.isScanned),
      warningMessage: typeof d.warningMessage === 'string' ? d.warningMessage : undefined,
    });
  }

  // 7. Deep item validation for Elements
  const validatedElements: DocumentElement[] = [];
  for (let i = 0; i < rawElements.length; i++) {
    const item = rawElements[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { valid: false, error: `Element at index ${i} is not a valid object.` };
    }
    const el = item as Record<string, any>;

    if (typeof el.id !== 'string' || !el.id.trim()) {
      return { valid: false, error: `Element at index ${i} is missing a valid 'id'.` };
    }
    if (typeof el.documentId !== 'string' || !el.documentId.trim()) {
      return { valid: false, error: `Element at index ${i} is missing a valid 'documentId'.` };
    }
    if (typeof el.pageNumber !== 'number' || !Number.isFinite(el.pageNumber) || el.pageNumber < 1) {
      return { valid: false, error: `Element at index ${i} has an invalid 'pageNumber'.` };
    }
    if (typeof el.content !== 'string') {
      return { valid: false, error: `Element at index ${i} has invalid 'content' (expected string).` };
    }
    if (typeof el.type !== 'string' || !el.type.trim()) {
      return { valid: false, error: `Element at index ${i} has an invalid 'type'.` };
    }

    validatedElements.push({
      id: el.id,
      documentId: el.documentId,
      type: el.type as ElementType,
      pageNumber: el.pageNumber,
      content: el.content,
      headingLevel: typeof el.headingLevel === 'number' ? el.headingLevel : undefined,
      bbox: Array.isArray(el.bbox) && el.bbox.length === 4 ? (el.bbox as [number, number, number, number]) : undefined,
      sourceElementId: typeof el.sourceElementId === 'string' ? el.sourceElementId : `src_${el.id}`,
    });
  }

  // 8. Deep item validation for Chunks
  const validatedChunks: DocumentChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const item = rawChunks[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { valid: false, error: `Chunk at index ${i} is not a valid object.` };
    }
    const c = item as Record<string, any>;

    if (typeof c.id !== 'string' || !c.id.trim()) {
      return { valid: false, error: `Chunk at index ${i} is missing a valid 'id'.` };
    }
    if (typeof c.documentId !== 'string' || !c.documentId.trim()) {
      return { valid: false, error: `Chunk at index ${i} is missing a valid 'documentId'.` };
    }
    if (typeof c.text !== 'string') {
      return { valid: false, error: `Chunk at index ${i} has invalid 'text' (expected string).` };
    }
    if (typeof c.pageStart !== 'number' || !Number.isFinite(c.pageStart) || c.pageStart < 1) {
      return { valid: false, error: `Chunk at index ${i} has an invalid 'pageStart'.` };
    }
    if (typeof c.pageEnd !== 'number' || !Number.isFinite(c.pageEnd) || c.pageEnd < 1) {
      return { valid: false, error: `Chunk at index ${i} has an invalid 'pageEnd'.` };
    }
    if (!Array.isArray(c.elementIds) || !c.elementIds.every((id: any) => typeof id === 'string')) {
      return { valid: false, error: `Chunk at index ${i} has invalid 'elementIds' (expected string array).` };
    }

    validatedChunks.push({
      id: c.id,
      documentId: c.documentId,
      text: c.text,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      elementIds: c.elementIds,
      sectionPath: Array.isArray(c.sectionPath) ? c.sectionPath.filter((s: any) => typeof s === 'string') : [],
      searchText: typeof c.searchText === 'string' ? c.searchText : c.text.toLowerCase(),
    });
  }

  // 9. Deep item validation for Tables
  const validatedTables: DocumentTable[] = [];
  for (let i = 0; i < rawTables.length; i++) {
    const item = rawTables[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { valid: false, error: `Table at index ${i} is not a valid object.` };
    }
    const tbl = item as Record<string, any>;

    if (typeof tbl.id !== 'string' || !tbl.id.trim()) {
      return { valid: false, error: `Table at index ${i} is missing a valid 'id'.` };
    }
    if (typeof tbl.documentId !== 'string' || !tbl.documentId.trim()) {
      return { valid: false, error: `Table at index ${i} is missing a valid 'documentId'.` };
    }
    if (typeof tbl.pageNumber !== 'number' || !Number.isFinite(tbl.pageNumber) || tbl.pageNumber < 1) {
      return { valid: false, error: `Table at index ${i} has an invalid 'pageNumber'.` };
    }
    if (!Array.isArray(tbl.headers) || !tbl.headers.every((h: any) => typeof h === 'string')) {
      return { valid: false, error: `Table at index ${i} has invalid 'headers' (expected string array).` };
    }
    if (
      !Array.isArray(tbl.rows) ||
      !tbl.rows.every((row: any) => Array.isArray(row) && row.every((cell: any) => typeof cell === 'string'))
    ) {
      return { valid: false, error: `Table at index ${i} has invalid 'rows' (expected 2D array of strings).` };
    }

    validatedTables.push({
      id: tbl.id,
      documentId: tbl.documentId,
      pageNumber: tbl.pageNumber,
      sourceElementId: typeof tbl.sourceElementId === 'string' ? tbl.sourceElementId : `src_${tbl.id}`,
      title: typeof tbl.title === 'string' ? tbl.title : undefined,
      headers: tbl.headers,
      rows: tbl.rows,
      warnings: Array.isArray(tbl.warnings) ? tbl.warnings.filter((w: any) => typeof w === 'string') : undefined,
      confidence: ['high', 'medium', 'low'].includes(tbl.confidence) ? tbl.confidence : 'medium',
      extractionMethod: ['pdf-layout-analysis', 'markdown-syntax', 'user-adjusted'].includes(tbl.extractionMethod)
        ? (tbl.extractionMethod as 'pdf-layout-analysis' | 'markdown-syntax' | 'user-adjusted')
        : 'pdf-layout-analysis',
      columnCount: tbl.headers.length,
      rowCount: tbl.rows.length,
      isEdited: Boolean(tbl.isEdited),
      originalHeaders: Array.isArray(tbl.originalHeaders) ? tbl.originalHeaders : undefined,
      originalRows: Array.isArray(tbl.originalRows) ? tbl.originalRows : undefined,
      updatedAt: typeof tbl.updatedAt === 'number' ? tbl.updatedAt : undefined,
    });
  }

  // 10. Deep item validation for Notes
  const validatedNotes: MarginaliaNote[] = [];
  for (let i = 0; i < rawNotes.length; i++) {
    const item = rawNotes[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { valid: false, error: `Note at index ${i} is not a valid object.` };
    }
    const n = item as Record<string, any>;

    if (typeof n.id !== 'string' || !n.id.trim()) {
      return { valid: false, error: `Note at index ${i} is missing a valid 'id'.` };
    }
    if (typeof n.documentId !== 'string' || !n.documentId.trim()) {
      return { valid: false, error: `Note at index ${i} is missing a valid 'documentId'.` };
    }
    if (typeof n.pageNumber !== 'number' || !Number.isFinite(n.pageNumber) || n.pageNumber < 1) {
      return { valid: false, error: `Note at index ${i} has an invalid 'pageNumber'.` };
    }
    if (typeof n.selectedText !== 'string') {
      return { valid: false, error: `Note at index ${i} has invalid 'selectedText' (expected string).` };
    }
    if (typeof n.noteText !== 'string' || !n.noteText.trim()) {
      return { valid: false, error: `Note at index ${i} has missing or empty 'noteText'.` };
    }
    if (typeof n.createdAt !== 'number' || !Number.isFinite(n.createdAt)) {
      return { valid: false, error: `Note at index ${i} has an invalid 'createdAt' timestamp.` };
    }

    validatedNotes.push({
      id: n.id,
      documentId: n.documentId,
      pageNumber: n.pageNumber,
      selectedText: n.selectedText,
      noteText: n.noteText,
      createdAt: n.createdAt,
      author: typeof n.author === 'string' ? n.author : 'Local Analyst',
      elementId: typeof n.elementId === 'string' ? n.elementId : undefined,
      startOffset: typeof n.startOffset === 'number' ? n.startOffset : undefined,
      endOffset: typeof n.endOffset === 'number' ? n.endOffset : undefined,
      color: ['amber', 'green', 'blue', 'pink'].includes(n.color) ? n.color : undefined,
    });
  }

  // Build clean backup object
  const backup: DocuLensBackup = {
    schemaVersion: obj.schemaVersion,
    exportTimestamp,
    exportedAt,
    appName: typeof obj.appName === 'string' ? obj.appName : 'DocuLens',
    documents: validatedDocs,
    chunks: validatedChunks,
    elements: validatedElements,
    tables: validatedTables,
    notes: validatedNotes,
    inquiries: Array.isArray(obj.inquiries) ? obj.inquiries : undefined,
    conversations: Array.isArray(obj.conversations) ? obj.conversations : undefined,
    comparisons: Array.isArray(obj.comparisons) ? obj.comparisons : undefined,
  };

  // Compute conflict and summary details
  const conflicts = analyzeBackupConflicts(validatedDocs, existingDocs);

  const summary: BackupSummary = {
    schemaVersion: backup.schemaVersion,
    exportTimestamp: backup.exportTimestamp,
    exportedAt: backup.exportedAt,
    documentCount: validatedDocs.length,
    tableCount: validatedTables.length,
    noteCount: validatedNotes.length,
    chunkCount: validatedChunks.length,
    elementCount: validatedElements.length,
    documentNames: validatedDocs.map((d) => d.originalName),
    conflicts,
  };

  return {
    valid: true,
    backup,
    summary,
  };
}

/**
 * Validates a user-selected File object.
 * Rejects oversized files (>50 MB) before reading into memory.
 */
export async function validateBackupFile(
  file: File,
  existingDocs: DocumentEntity[] = []
): Promise<BackupValidationResult> {
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Backup file size (${sizeMb} MB) exceeds maximum allowed limit of ${MAX_BACKUP_FILE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr: any) {
      return {
        valid: false,
        error: `Malformed JSON: The selected file could not be parsed as valid JSON (${parseErr?.message || 'SyntaxError'}).`,
      };
    }

    return validateBackupData(parsed, existingDocs);
  } catch (readErr: any) {
    return {
      valid: false,
      error: `Failed to read file: ${readErr?.message || 'Unknown read error'}`,
    };
  }
}

/**
 * Creates and downloads one backup JSON file containing all documents, chunks,
 * elements, extracted tables and notes from IndexedDB.
 */
export async function exportBackupArchive(): Promise<{
  filename: string;
  backup: DocuLensBackup;
  jsonString: string;
}> {
  const backup = await storage.exportBackup();
  const jsonString = JSON.stringify(backup, null, 2);

  const dateStr = new Date(backup.exportTimestamp).toISOString().slice(0, 10);
  const timeStr = new Date(backup.exportTimestamp).toISOString().slice(11, 16).replace(':', '');
  const filename = `doculens-backup-${dateStr}-${timeStr}.json`;

  triggerFileDownload(jsonString, filename);

  return { filename, backup, jsonString };
}

/**
 * Triggers a local browser download for the provided backup JSON string.
 */
export function triggerFileDownload(jsonString: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Executes the atomic backup import in a single IndexedDB transaction.
 * Zero partial imports: if any write fails, transaction aborts and rolls back completely.
 */
export async function executeBackupImport(
  backup: DocuLensBackup,
  mode: 'merge' | 'replace'
): Promise<ImportResult> {
  return storage.atomicImport(backup, mode);
}
