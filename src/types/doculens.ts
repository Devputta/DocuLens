/**
 * DocuLens - Local-First PDF Intelligence Data Contracts
 * Strict adherence to provenance, element-level references, and verification.
 */

export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type ElementType = 
  | 'heading-1' 
  | 'heading-2' 
  | 'heading-3' 
  | 'paragraph' 
  | 'table' 
  | 'list-item' 
  | 'footnote' 
  | 'callout';

export interface DocumentElement {
  id: string;
  documentId: string;
  type: ElementType;
  pageNumber: number; // 1-indexed
  content: string;
  headingLevel?: number;
  bbox?: [number, number, number, number]; // [x, y, width, height] normalized (0-100) or pts
  sourceElementId: string;
  isOcr?: boolean;
  ocrConfidence?: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  text: string;
  pageStart: number;
  pageEnd: number;
  elementIds: string[];
  sectionPath: string[];
  searchText: string;
  sourceType?: 'document' | 'figure';
  figureId?: string;
}

export interface DocumentTable {
  id: string;
  documentId: string;
  pageNumber: number;
  sourceElementId: string;
  title?: string;
  headers: string[];
  rows: string[][];
  warnings?: string[];
  confidence?: 'high' | 'medium' | 'low';
  extractionMethod?: 'pdf-layout-analysis' | 'markdown-syntax' | 'user-adjusted';
  columnCount?: number;
  rowCount?: number;
  isEdited?: boolean;
  originalHeaders?: string[];
  originalRows?: string[][];
  updatedAt?: number;
}

export interface DocumentEntity {
  id: string;
  originalName: string;
  storedPath: string;
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  status: DocumentStatus;
  parserName: string;
  parserVersion: string;
  createdAt: number;
  processedAt?: number;
  errorCode?: string;
  errorMessage?: string;
  summary?: string;
  elementCount: number;
  chunkCount: number;
  tableCount: number;
  isScanned?: boolean;
  isReflowed?: boolean;
  fileType?: 'pdf' | 'docx' | 'txt';
  warningMessage?: string;
  ocrProcessed?: boolean;
  ocrConfidence?: number;
}

export interface UploadProgress {
  stage: 'reading' | 'validating' | 'parsing' | 'chunking' | 'storing' | 'ocr' | 'complete';
  percent: number;
  message: string;
  currentPage?: number;
  totalPages?: number;
}

export interface OcrProgress {
  page: number;
  totalPages: number;
  percent: number;
  message: string;
}

export interface OcrPromptState {
  file: File;
  buffer: ArrayBuffer;
  pageCount: number;
  docId: string;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  status: 'prompt' | 'processing' | 'cancelled';
  progress: OcrProgress;
}

export interface CitationEvidence {
  evidenceId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkId: string;
  quote: string;
  sourceElementIds: string[];
  verified: boolean;
  verificationDetails?: string;
  rejectionReason?: string;
}

export interface StructuredCitationQuote {
  quote: string;
  citationId: string;
  pageNumber: number;
  documentName: string;
  verified: boolean;
  rejectionReason?: string;
}

export interface StructuredSynthesis {
  directQuotations: StructuredCitationQuote[];
  extractedFacts: string[];
  summary: string;
  aiInterpretation?: string;
}

export interface InquiryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  documentScopeId?: string; // specific doc ID or undefined for all
  evidence: CitationEvidence[];
  verificationStatus: 'verified' | 'unverified' | 'insufficient_evidence';
  provider: 'local-deterministic' | 'remote-disclosed';
  structured?: StructuredSynthesis;
  disclosures?: string[];
  validationErrors?: string[];
  conversationId?: string;
}

export interface InquiryConversation {
  id: string;
  title: string;
  documentScopeId?: string;
  createdAt: number;
  updatedAt: number;
  messages: InquiryMessage[];
}

export type DiffChangeType = 'addition' | 'removal' | 'modification' | 'unchanged';

export type ComparisonMode =
  | 'content-diff'
  | 'concept-comparison'
  | 'definition-comparison'
  | 'topic-overlap';

export interface ComparisonChange {
  id: string;
  type: DiffChangeType;
  leftChunkId?: string;
  rightChunkId?: string;
  leftPage?: number;
  rightPage?: number;
  leftText?: string;
  rightText?: string;
  summary: string;
  confidence: number;
  sectionPath?: string[];
}

export interface ConceptMatch {
  id: string;
  conceptTitle: string;
  category?: string;
  leftExcerpt: string;
  leftPage: number;
  leftChunkId?: string;
  rightExcerpt: string;
  rightPage: number;
  rightChunkId?: string;
  relationshipType:
    | 'synonymous_terminology'
    | 'differing_perspective'
    | 'overlapping_definition'
    | 'possible_relationship';
  confidence: number;
  confidenceLabel: 'High Confidence' | 'Moderate Confidence' | 'Possible Relationship';
  explanation: string;
  nuanceNotes: string;
}

export interface DefinitionComparisonItem {
  id: string;
  term: string;
  category?: string;
  leftDefinition?: string;
  leftPage?: number;
  leftExcerpt?: string;
  rightDefinition?: string;
  rightPage?: number;
  rightExcerpt?: string;
  alignment: 'consistent' | 'differing_scope' | 'conflicting' | 'only_in_doc_a' | 'only_in_doc_b';
  keySimilarities?: string;
  keyDifferences?: string;
  verifiable: boolean;
}

export interface TopicItem {
  id: string;
  topicName: string;
  presence: 'both' | 'only_a' | 'only_b';
  leftExcerpt?: string;
  leftPage?: number;
  rightExcerpt?: string;
  rightPage?: number;
  relevanceScore: number;
  contextSummary: string;
}

export interface TopicOverlapAnalysis {
  sharedTopics: TopicItem[];
  uniqueToLeft: TopicItem[];
  uniqueToRight: TopicItem[];
  jaccardSimilarity: number;
  overlapPercentage: number;
  calculationMethod: string;
  limitations: string;
}

export interface ComparisonResult {
  id: string;
  leftDocumentId: string;
  rightDocumentId: string;
  leftDocumentName: string;
  rightDocumentName: string;
  status: 'processing' | 'ready' | 'failed' | 'insufficient_evidence';
  createdAt: number;
  changes: ComparisonChange[];
  statistics: {
    added: number;
    removed: number;
    modified: number;
    identical: number;
  };
  conceptMatches?: ConceptMatch[];
  definitionComparisons?: DefinitionComparisonItem[];
  topicOverlap?: TopicOverlapAnalysis;
  activeMode?: ComparisonMode;
  inconclusiveReason?: string;
}

export type AnnotationColor = 'amber' | 'green' | 'blue' | 'pink';

export interface MarginaliaNote {
  id: string;
  documentId: string;
  pageNumber: number;
  selectedText: string;
  noteText: string;
  createdAt: number;
  author?: string;
  elementId?: string;
  startOffset?: number;
  endOffset?: number;
  color?: AnnotationColor;
  imageBlob?: Blob;
}

export interface TextHighlightSegment {
  text: string;
  isMatch: boolean;
  term?: string;
  isPrimary?: boolean;
}

export interface SearchResult {
  chunk: DocumentChunk;
  document: DocumentEntity;
  score: number;
  matchHighlights: { before: string; match: string; after: string }[];
  highlightSegments?: TextHighlightSegment[];
  matchedTerms: string[];
  matchCount?: number;
}

export interface SearchNoResultsAdvice {
  reason: 'zero_matches' | 'scoped_out' | 'overly_specific';
  suggestedTerms: string[];
  scopeRelaxationDocCount: number;
  availableSectionTitles: string[];
  message: string;
}

export interface DocuLensBackup {
  schemaVersion: number;
  exportTimestamp: number;
  exportedAt: string;
  appName?: string;
  documents: DocumentEntity[];
  chunks: DocumentChunk[];
  elements: DocumentElement[];
  tables: DocumentTable[];
  notes: MarginaliaNote[];
  inquiries?: InquiryMessage[];
  conversations?: InquiryConversation[];
  comparisons?: ComparisonResult[];
}

export interface BackupConflictInfo {
  conflictingDocIds: string[];
  conflictingDocNames: string[];
  newDocCount: number;
  matchingSha256Count: number;
}

export interface BackupSummary {
  schemaVersion: number;
  exportTimestamp: number;
  exportedAt: string;
  documentCount: number;
  tableCount: number;
  noteCount: number;
  chunkCount: number;
  elementCount: number;
  documentNames: string[];
  conflicts: BackupConflictInfo;
}

export type BackupValidationResult =
  | {
      valid: true;
      backup: DocuLensBackup;
      summary: BackupSummary;
    }
  | {
      valid: false;
      error: string;
    };

export interface ImportResult {
  documentsImported: number;
  elementsImported: number;
  chunksImported: number;
  tablesImported: number;
  notesImported: number;
  mode: 'merge' | 'replace';
}

export type FigureType = 'embedded-image' | 'vector-drawing' | 'page-scan' | 'synthetic';

export interface DocumentFigure {
  id: string;
  documentId: string;
  pageNumber: number; // 1-indexed
  bbox?: [number, number, number, number]; // [x, y, width, height]
  width: number;
  height: number;
  imageBlob: Blob; // PNG / JPEG blob stored in IndexedDB
  thumbnailBlob: Blob; // small thumbnail blob
  type?: FigureType;
  hash: string; // pixel data hash to skip duplicates
  caption?: string;
  captionElementId?: string;
  captionLabel?: string; // e.g. "Figure 3", "Fig. 3", "Chart 2", "Diagram 1"
  captionStatus?: 'linked' | 'unlinked';
  ocrText?: string;
  ocrConfidence?: number; // 0-100
  ocrLanguage?: string;
  ocrAt?: number;
  createdAt: number;
}

export interface FigureSummary {
  id: string;
  documentId: string;
  pageNumber: number;
  bbox?: [number, number, number, number];
  width: number;
  height: number;
  type?: FigureType;
  hash: string;
  caption?: string;
  captionElementId?: string;
  captionLabel?: string;
  captionStatus?: 'linked' | 'unlinked';
  ocrText?: string;
  ocrConfidence?: number;
  ocrLanguage?: string;
  ocrAt?: number;
  createdAt: number;
  thumbnailUrl?: string;
}

