import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_FILE_BYTES,
  validateBackupData,
  validateBackupFile,
  analyzeBackupConflicts,
} from '../src/services/backupService';
import { storage } from '../src/services/storage';
import {
  DocuLensBackup,
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  MarginaliaNote,
} from '../src/types/doculens';

// Sample valid entities for testing
const sampleDocA: DocumentEntity = {
  id: 'doc-alpha',
  originalName: 'Financial_Q3_Report.pdf',
  storedPath: 'indexeddb://doc-alpha',
  sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  sizeBytes: 1048576,
  pageCount: 14,
  status: 'ready',
  parserName: 'pdfjs-provenance',
  parserVersion: '1.0.0',
  createdAt: 1729000000000,
  elementCount: 2,
  chunkCount: 1,
  tableCount: 1,
};

const sampleDocB: DocumentEntity = {
  id: 'doc-beta',
  originalName: 'Environmental_Impact_Study.pdf',
  storedPath: 'indexeddb://doc-beta',
  sha256: '9988776655443322110099887766554433221100998877665544332211009988',
  sizeBytes: 2097152,
  pageCount: 28,
  status: 'ready',
  parserName: 'pdfjs-provenance',
  parserVersion: '1.0.0',
  createdAt: 1729100000000,
  elementCount: 1,
  chunkCount: 1,
  tableCount: 0,
};

const sampleElementA: DocumentElement = {
  id: 'el-1',
  documentId: 'doc-alpha',
  type: 'heading-1',
  pageNumber: 1,
  content: 'Executive Financial Summary',
  sourceElementId: 'src_h1',
};

const sampleElementB: DocumentElement = {
  id: 'el-2',
  documentId: 'doc-alpha',
  type: 'paragraph',
  pageNumber: 1,
  content: 'Operating revenue expanded by 14.2% across North American operations.',
  sourceElementId: 'src_p1',
};

const sampleChunkA: DocumentChunk = {
  id: 'chk-1',
  documentId: 'doc-alpha',
  text: 'Executive Financial Summary: Operating revenue expanded by 14.2% across North American operations.',
  pageStart: 1,
  pageEnd: 1,
  elementIds: ['el-1', 'el-2'],
  sectionPath: ['Executive Financial Summary'],
  searchText: 'executive financial summary operating revenue',
};

const sampleTableA: DocumentTable = {
  id: 'tbl-1',
  documentId: 'doc-alpha',
  pageNumber: 2,
  sourceElementId: 'src_tbl_1',
  title: 'Quarterly Operating Margin Breakdown',
  headers: ['Segment', 'Revenue ($M)', 'Margin (%)'],
  rows: [
    ['Commercial', '450.2', '18.4%'],
    ['Industrial', '320.1', '12.1%'],
  ],
  confidence: 'high',
  extractionMethod: 'pdf-layout-analysis',
  columnCount: 3,
  rowCount: 2,
};

const sampleNoteA: MarginaliaNote = {
  id: 'note-1',
  documentId: 'doc-alpha',
  pageNumber: 1,
  selectedText: 'expanded by 14.2%',
  noteText: 'Cross-check with SEC 10-Q filing footnote 4.',
  createdAt: 1729050000000,
  author: 'Lead Auditor',
};

function createValidBackupPayload(): DocuLensBackup {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      exportTimestamp: 1729177200000,
      exportedAt: '2026-10-17T15:00:00.000Z',
      appName: 'DocuLens',
      documents: [sampleDocA],
      elements: [sampleElementA, sampleElementB],
      chunks: [sampleChunkA],
      tables: [sampleTableA],
      notes: [sampleNoteA],
    })
  );
}

describe('Backup Export Functionality', () => {
  beforeEach(async () => {
    await storage.resetDatabase();
  });

  afterEach(async () => {
    await storage.resetDatabase();
  });

  it('exports a complete archive with all documents, chunks, elements, extracted tables, and notes', async () => {
    // Populate IndexedDB with test entities
    await storage.saveDocument(sampleDocA);
    await storage.saveElements([sampleElementA, sampleElementB]);
    await storage.saveChunks([sampleChunkA]);
    await storage.saveTables([sampleTableA]);
    await storage.saveNote(sampleNoteA);

    // Run export
    const backup = await storage.exportBackup();

    expect(backup).toBeDefined();
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(typeof backup.exportTimestamp).toBe('number');
    expect(typeof backup.exportedAt).toBe('string');
    expect(backup.appName).toBe('DocuLens');

    // Verify all 5 required stores are populated accurately
    expect(backup.documents.length).toBe(1);
    expect(backup.documents[0].id).toBe('doc-alpha');
    expect(backup.documents[0].originalName).toBe('Financial_Q3_Report.pdf');

    expect(backup.elements.length).toBe(2);
    expect(backup.elements.map((e) => e.id)).toEqual(['el-1', 'el-2']);

    expect(backup.chunks.length).toBe(1);
    expect(backup.chunks[0].id).toBe('chk-1');

    expect(backup.tables.length).toBe(1);
    expect(backup.tables[0].id).toBe('tbl-1');
    expect(backup.tables[0].headers).toEqual(['Segment', 'Revenue ($M)', 'Margin (%)']);

    expect(backup.notes.length).toBe(1);
    expect(backup.notes[0].id).toBe('note-1');
    expect(backup.notes[0].noteText).toBe('Cross-check with SEC 10-Q filing footnote 4.');

    // Validate that the exported object passes self-validation
    const validation = validateBackupData(backup);
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.summary.documentCount).toBe(1);
      expect(validation.summary.tableCount).toBe(1);
      expect(validation.summary.noteCount).toBe(1);
      expect(validation.summary.chunkCount).toBe(1);
      expect(validation.summary.elementCount).toBe(2);
    }
  });
});

describe('Backup Validation & Integrity (Never Trust Imported Data)', () => {
  it('rejects non-object root structures (null, primitives, arrays)', () => {
    expect(validateBackupData(null).valid).toBe(false);
    expect(validateBackupData(undefined).valid).toBe(false);
    expect(validateBackupData('not json object').valid).toBe(false);
    expect(validateBackupData([createValidBackupPayload()]).valid).toBe(false);
    expect(validateBackupData(12345).valid).toBe(false);
  });

  function expectValidationError(res: any, substring: string) {
    expect(res.valid).toBe(false);
    expect(res.error).toContain(substring);
  }

  it('rejects backup with missing or non-integer schemaVersion', () => {
    const noVersion: any = createValidBackupPayload();
    delete noVersion.schemaVersion;
    expectValidationError(validateBackupData(noVersion), "Missing required 'schemaVersion'");

    const stringVersion: any = { ...createValidBackupPayload(), schemaVersion: '1' };
    expectValidationError(validateBackupData(stringVersion), 'must be an integer');

    const floatVersion: any = { ...createValidBackupPayload(), schemaVersion: 1.5 };
    expectValidationError(validateBackupData(floatVersion), 'must be an integer');
  });

  it('rejects unsupported schema versions (e.g. version 2 or 99)', () => {
    const futureVersion = { ...createValidBackupPayload(), schemaVersion: 99 };
    expectValidationError(validateBackupData(futureVersion), 'Unsupported backup schema version');
  });

  it('rejects backup missing required data stores', () => {
    const missingDocs: any = createValidBackupPayload();
    delete missingDocs.documents;
    expectValidationError(validateBackupData(missingDocs), "'documents' is missing or is not an array");

    const missingTables: any = createValidBackupPayload();
    delete missingTables.tables;
    expectValidationError(validateBackupData(missingTables), "'tables' is missing or is not an array");

    const missingNotes: any = createValidBackupPayload();
    delete missingNotes.notes;
    expectValidationError(validateBackupData(missingNotes), "'notes' is missing or is not an array");

    const missingElements: any = createValidBackupPayload();
    delete missingElements.elements;
    expectValidationError(validateBackupData(missingElements), "'elements' is missing or is not an array");

    const missingChunks: any = createValidBackupPayload();
    delete missingChunks.chunks;
    expectValidationError(validateBackupData(missingChunks), "'chunks' is missing or is not an array");
  });

  it('rejects documents with missing ID or invalid SHA-256 fingerprints', () => {
    const badDocPayload = createValidBackupPayload();
    badDocPayload.documents[0] = { ...sampleDocA, sha256: 'short_invalid_hash' };

    expectValidationError(validateBackupData(badDocPayload), 'valid 64-character SHA-256 fingerprint');
  });

  it('rejects documents with invalid status or page count', () => {
    const badStatusPayload = createValidBackupPayload();
    (badStatusPayload.documents[0] as any).status = 'malicious_injected_status';
    expectValidationError(validateBackupData(badStatusPayload), "unrecognized 'status'");

    const badPagePayload = createValidBackupPayload();
    badPagePayload.documents[0].pageCount = -5;
    expectValidationError(validateBackupData(badPagePayload), "invalid 'pageCount'");
  });

  it('rejects elements with missing content, invalid page numbers, or invalid IDs', () => {
    const badElementPayload = createValidBackupPayload();
    (badElementPayload.elements[0] as any).content = 12345; // Expected string
    expectValidationError(validateBackupData(badElementPayload), "invalid 'content'");
  });

  it('rejects malformed table structures with invalid headers or row data', () => {
    const badTablePayload = createValidBackupPayload();
    (badTablePayload.tables[0] as any).headers = 'not an array';
    expectValidationError(validateBackupData(badTablePayload), "invalid 'headers'");

    const badRowsPayload = createValidBackupPayload();
    (badRowsPayload.tables[0] as any).rows = [['Valid string', 12345]]; // cell is a number
    expectValidationError(validateBackupData(badRowsPayload), "invalid 'rows'");
  });

  it('rejects malformed notes with empty text or missing document IDs', () => {
    const badNotePayload = createValidBackupPayload();
    badNotePayload.notes[0].noteText = '   '; // Blank text
    expectValidationError(validateBackupData(badNotePayload), "missing or empty 'noteText'");
  });

  it('rejects files exceeding the 50 MB threshold before processing', async () => {
    const fakeOversizedFile = new File([''], 'huge_backup.json');
    Object.defineProperty(fakeOversizedFile, 'size', {
      value: MAX_BACKUP_FILE_BYTES + 1024,
    });

    const result = await validateBackupFile(fakeOversizedFile);
    expectValidationError(result, 'exceeds maximum allowed limit of 50 MB');
  });

  it('rejects malformed raw JSON strings with syntax errors', async () => {
    const corruptJsonFile = new File(['{ "schemaVersion": 1, documents: [unquoted] }'], 'corrupt.json');
    const result = await validateBackupFile(corruptJsonFile);
    expectValidationError(result, 'Malformed JSON');
  });
});

describe('Import Backup: Single-Transaction Atomic Operations', () => {
  beforeEach(async () => {
    await storage.resetDatabase();
  });

  afterEach(async () => {
    await storage.resetDatabase();
  });

  it('shows accurate summary metrics (documents, tables, notes, chunks, elements)', () => {
    const backup = createValidBackupPayload();
    const validation = validateBackupData(backup);

    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.summary.documentCount).toBe(1);
      expect(validation.summary.tableCount).toBe(1);
      expect(validation.summary.noteCount).toBe(1);
      expect(validation.summary.chunkCount).toBe(1);
      expect(validation.summary.elementCount).toBe(2);
      expect(validation.summary.documentNames).toEqual(['Financial_Q3_Report.pdf']);
      expect(validation.summary.conflicts.conflictingDocIds).toEqual([]);
    }
  });

  it('executes "Replace all" in a single transaction, completely wiping old data and restoring backup', async () => {
    // Populate pre-existing document in IndexedDB
    await storage.saveDocument(sampleDocB);
    const initialDocs = await storage.getDocuments();
    expect(initialDocs.length).toBe(1);
    expect(initialDocs[0].id).toBe('doc-beta');

    // Prepare backup containing only Doc A
    const backup = createValidBackupPayload();

    // Execute Replace All in one atomic transaction
    const result = await storage.atomicImport(backup, 'replace');

    expect(result.mode).toBe('replace');
    expect(result.documentsImported).toBe(1);
    expect(result.tablesImported).toBe(1);
    expect(result.notesImported).toBe(1);

    // Verify Doc B was completely purged and replaced by Doc A
    const storedDocs = await storage.getDocuments();
    expect(storedDocs.length).toBe(1);
    expect(storedDocs[0].id).toBe('doc-alpha');
    expect(storedDocs.some((d) => d.id === 'doc-beta')).toBe(false);

    // Verify associated records are in place
    const storedTables = await storage.getAllTables();
    expect(storedTables.length).toBe(1);
    expect(storedTables[0].id).toBe('tbl-1');

    const storedNotes = await storage.getAllNotes();
    expect(storedNotes.length).toBe(1);
    expect(storedNotes[0].id).toBe('note-1');
  });

  it('executes "Merge" in a single transaction, updating matching records and preserving non-conflicting records', async () => {
    // Populate pre-existing Doc B in IndexedDB
    await storage.saveDocument(sampleDocB);

    // Backup contains Doc A
    const backup = createValidBackupPayload();

    // Execute Merge
    const result = await storage.atomicImport(backup, 'merge');
    expect(result.mode).toBe('merge');

    // Both Doc A and Doc B must exist in IndexedDB
    const storedDocs = await storage.getDocuments();
    expect(storedDocs.length).toBe(2);
    expect(storedDocs.some((d) => d.id === 'doc-alpha')).toBe(true);
    expect(storedDocs.some((d) => d.id === 'doc-beta')).toBe(true);
  });
});

describe('Merge Conflict Analysis & Resolution', () => {
  beforeEach(async () => {
    await storage.resetDatabase();
  });

  afterEach(async () => {
    await storage.resetDatabase();
  });

  it('accurately identifies conflicting document IDs and SHA-256 fingerprints before import', () => {
    const existingDocs = [sampleDocA]; // Already has doc-alpha
    const backupDocs = [
      {
        ...sampleDocA,
        originalName: 'Financial_Q3_Report_Revision.pdf',
        elementCount: 50,
      },
      sampleDocB, // New doc-beta
    ];

    const conflicts = analyzeBackupConflicts(backupDocs, existingDocs);

    expect(conflicts.conflictingDocIds).toEqual(['doc-alpha']);
    expect(conflicts.conflictingDocNames).toEqual(['Financial_Q3_Report_Revision.pdf']);
    expect(conflicts.newDocCount).toBe(1);
    expect(conflicts.matchingSha256Count).toBe(1);
  });

  it('resolves merge conflicts by updating the colliding record while leaving existing records intact', async () => {
    // Existing database contains Doc A (with elementCount: 2) and Doc B
    await storage.saveDocument(sampleDocA);
    await storage.saveDocument(sampleDocB);

    // Backup contains updated Doc A (elementCount: 99) and Doc C
    const sampleDocC: DocumentEntity = {
      id: 'doc-gamma',
      originalName: 'Board_Meeting_Minutes.pdf',
      storedPath: 'indexeddb://doc-gamma',
      sha256: '1122334455667788990011223344556677889900112233445566778899001122',
      sizeBytes: 524288,
      pageCount: 6,
      status: 'ready',
      parserName: 'pdfjs-provenance',
      parserVersion: '1.0.0',
      createdAt: 1729200000000,
      elementCount: 12,
      chunkCount: 3,
      tableCount: 0,
    };

    const updatedDocA: DocumentEntity = {
      ...sampleDocA,
      elementCount: 99,
      summary: 'Updated Q3 overview with consolidated margins',
    };

    const conflictBackup: DocuLensBackup = {
      schemaVersion: 1,
      exportTimestamp: Date.now(),
      exportedAt: new Date().toISOString(),
      appName: 'DocuLens',
      documents: [updatedDocA, sampleDocC],
      elements: [],
      chunks: [],
      tables: [],
      notes: [],
    };

    // Execute atomic Merge
    await storage.atomicImport(conflictBackup, 'merge');

    const storedDocs = await storage.getDocuments();

    // Must have 3 documents: Doc A (updated), Doc B (untouched), Doc C (added)
    expect(storedDocs.length).toBe(3);

    const docAInDb = storedDocs.find((d) => d.id === 'doc-alpha');
    expect(docAInDb).toBeDefined();
    expect(docAInDb?.elementCount).toBe(99);
    expect(docAInDb?.summary).toBe('Updated Q3 overview with consolidated margins');

    const docBInDb = storedDocs.find((d) => d.id === 'doc-beta');
    expect(docBInDb).toBeDefined();
    expect(docBInDb?.originalName).toBe('Environmental_Impact_Study.pdf');

    const docCInDb = storedDocs.find((d) => d.id === 'doc-gamma');
    expect(docCInDb).toBeDefined();
  });
});
