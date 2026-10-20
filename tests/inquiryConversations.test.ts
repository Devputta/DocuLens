import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { storage } from '../src/services/storage';
import {
  processInquiry,
  resolveQueryWithHistory,
  exportConversationToMarkdown,
} from '../src/services/inquiryEngine';
import {
  DocumentEntity,
  DocumentChunk,
  InquiryConversation,
  InquiryMessage,
  CitationEvidence,
} from '../src/types/doculens';

const mockDoc1: DocumentEntity = {
  id: 'doc-ai-audit',
  originalName: 'Global AI Safety Audit 2026.pdf',
  storedPath: 'local://doc-ai-audit.pdf',
  sha256: 'e1e2e3e4e5e6e1e2e3e4e5e6e1e2e3e4e5e6e1e2e3e4e5e6e1e2e3e4e5e6e1e2',
  sizeBytes: 150000,
  pageCount: 5,
  status: 'ready',
  parserName: 'pdfjs-dist',
  parserVersion: '4.0.379',
  createdAt: Date.now() - 50000,
  elementCount: 30,
  chunkCount: 3,
  tableCount: 1,
};

const mockDoc2: DocumentEntity = {
  id: 'doc-quantum-v1',
  originalName: 'Quantum Cryptography Protocol 2026.pdf',
  storedPath: 'local://doc-quantum.pdf',
  sha256: 'f1f2f3f4f5f6f1f2f3f4f5f6f1f2f3f4f5f6f1f2f3f4f5f6f1f2f3f4f5f6f1f2',
  sizeBytes: 200000,
  pageCount: 8,
  status: 'ready',
  parserName: 'pdfjs-dist',
  parserVersion: '4.0.379',
  createdAt: Date.now() - 20000,
  elementCount: 40,
  chunkCount: 4,
  tableCount: 2,
};

const mockChunks: DocumentChunk[] = [
  {
    id: 'chk-ai-1',
    documentId: 'doc-ai-audit',
    text: 'Global AI safety audits evaluated 120 frontier models in 2026, finding that 45 models exhibited alignment degradation under adversarial conditions.',
    pageStart: 1,
    pageEnd: 1,
    elementIds: ['el-ai-1'],
    sectionPath: ['Executive Summary', 'Alignment Findings'],
    searchText: 'global ai safety audits evaluated 120 frontier models 2026 alignment degradation 45',
  },
  {
    id: 'chk-ai-2',
    documentId: 'doc-ai-audit',
    text: 'Red-teaming evaluations revealed prompt injection vulnerability rates of 18.5% across automated customer support systems.',
    pageStart: 2,
    pageEnd: 2,
    elementIds: ['el-ai-2'],
    sectionPath: ['Technical Risks', 'Vulnerabilities'],
    searchText: 'red teaming evaluations prompt injection vulnerability rates 18.5 customer support',
  },
];

describe('Inquiry Conversations — Persistence & Context Resolution', () => {
  beforeEach(async () => {
    await storage.resetDatabase();
    await storage.saveDocument(mockDoc1);
    await storage.saveDocument(mockDoc2);
    await storage.saveChunks(mockChunks);
  });

  it('persists inquiry conversations to IndexedDB and retrieves them', async () => {
    const convId = 'conv-test-101';
    const testConv: InquiryConversation = {
      id: convId,
      title: 'AI Safety Evaluations',
      documentScopeId: 'doc-ai-audit',
      createdAt: Date.now() - 10000,
      updatedAt: Date.now(),
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'How many frontier models were evaluated in the 2026 audit?',
          timestamp: Date.now() - 9000,
          documentScopeId: 'doc-ai-audit',
          evidence: [],
          verificationStatus: 'verified',
          provider: 'local-deterministic',
          conversationId: convId,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Global AI safety audits evaluated 120 frontier models [ev-1].',
          timestamp: Date.now() - 8000,
          documentScopeId: 'doc-ai-audit',
          evidence: [
            {
              evidenceId: 'ev-1',
              documentId: 'doc-ai-audit',
              documentName: 'Global AI Safety Audit 2026.pdf',
              pageNumber: 1,
              chunkId: 'chk-ai-1',
              quote: 'Global AI safety audits evaluated 120 frontier models in 2026',
              sourceElementIds: ['el-ai-1'],
              verified: true,
            },
          ],
          verificationStatus: 'verified',
          provider: 'local-deterministic',
          conversationId: convId,
        },
      ],
    };

    await storage.saveConversation(testConv);

    const loaded = await storage.getConversations();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe(convId);
    expect(loaded[0].title).toBe('AI Safety Evaluations');
    expect(loaded[0].messages.length).toBe(2);
    expect(loaded[0].messages[1].evidence[0].verified).toBe(true);
  });

  it('deleting a document marks its conversations citations as "source removed"', async () => {
    const convId = 'conv-test-removal';
    const conv: InquiryConversation = {
      id: convId,
      title: 'Safety Audit Removal Test',
      documentScopeId: 'doc-ai-audit',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: 'msg-u1',
          role: 'user',
          content: 'What was the prompt injection vulnerability rate?',
          timestamp: Date.now() - 5000,
          documentScopeId: 'doc-ai-audit',
          evidence: [],
          verificationStatus: 'verified',
          provider: 'local-deterministic',
          conversationId: convId,
        },
        {
          id: 'msg-a1',
          role: 'assistant',
          content: 'The vulnerability rate was 18.5% [ev-1].',
          timestamp: Date.now() - 4000,
          documentScopeId: 'doc-ai-audit',
          evidence: [
            {
              evidenceId: 'ev-1',
              documentId: 'doc-ai-audit',
              documentName: 'Global AI Safety Audit 2026.pdf',
              pageNumber: 2,
              chunkId: 'chk-ai-2',
              quote: 'prompt injection vulnerability rates of 18.5%',
              sourceElementIds: ['el-ai-2'],
              verified: true,
            },
          ],
          verificationStatus: 'verified',
          provider: 'local-deterministic',
          conversationId: convId,
        },
      ],
    };

    await storage.saveConversation(conv);

    // Delete doc-ai-audit
    await storage.deleteDocument('doc-ai-audit');

    // Retrieve conversation and verify citation state
    const updatedConvs = await storage.getConversations();
    const targetConv = updatedConvs.find((c) => c.id === convId);
    expect(targetConv).toBeDefined();

    const assistantMsg = targetConv!.messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.verificationStatus).toBe('insufficient_evidence');

    const citation = assistantMsg!.evidence[0];
    expect(citation.verified).toBe(false);
    expect(citation.verificationDetails).toBe('source removed');
    expect(citation.rejectionReason).toBe('source removed');
  });

  it('resolves pronouns and topics using the last 3 Q/A pairs in follow-up queries', async () => {
    const history: InquiryMessage[] = [
      {
        id: 'h1',
        role: 'user',
        content: 'What were the AI safety evaluations in 2026?',
        timestamp: Date.now() - 3000,
        evidence: [],
        verificationStatus: 'verified',
        provider: 'local-deterministic',
      },
      {
        id: 'h2',
        role: 'assistant',
        content: 'Evaluations covered 120 frontier models.',
        timestamp: Date.now() - 2000,
        evidence: [],
        verificationStatus: 'verified',
        provider: 'local-deterministic',
      },
    ];

    // Follow-up question using pronoun "they"
    const resolution = resolveQueryWithHistory('How many of them showed alignment degradation?', history);
    expect(resolution.resolvedQuery).toContain('AI');
    expect(resolution.resolvedQuery).toContain('alignment degradation');

    // Process follow-up inquiry with history passed
    const response = await processInquiry(
      'How many of them showed alignment degradation?',
      mockChunks,
      [mockDoc1, mockDoc2],
      undefined,
      false,
      history
    );

    expect(response.verificationStatus).toBe('verified');
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.evidence[0].quote).toContain('45 models');
  });

  it('answers "insufficient evidence" when grounded evidence is missing even with context', async () => {
    const history: InquiryMessage[] = [
      {
        id: 'h1',
        role: 'user',
        content: 'Tell me about AI safety audits',
        timestamp: Date.now(),
        evidence: [],
        verificationStatus: 'verified',
        provider: 'local-deterministic',
      },
    ];

    const response = await processInquiry(
      'What is its rocket propulsion system specifications?',
      mockChunks,
      [mockDoc1],
      undefined,
      false,
      history
    );

    expect(response.verificationStatus).toBe('insufficient_evidence');
    expect(response.content).toContain('The ingested documents do not establish the answer');
    expect(response.evidence.length).toBe(0);
  });

  it('exports conversation to formatted Markdown with citations', () => {
    const conv: InquiryConversation = {
      id: 'conv-export',
      title: 'Safety Audit Discussion',
      documentScopeId: 'doc-ai-audit',
      createdAt: 1776595200000,
      updatedAt: 1776595200000,
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'What were the red-teaming vulnerability rates?',
          timestamp: 1776595210000,
          evidence: [],
          verificationStatus: 'verified',
          provider: 'local-deterministic',
        },
        {
          id: 'a1',
          role: 'assistant',
          content: 'Red-teaming evaluations revealed vulnerability rates of 18.5% [ev-1].',
          timestamp: 1776595220000,
          evidence: [
            {
              evidenceId: 'ev-1',
              documentId: 'doc-ai-audit',
              documentName: 'Global AI Safety Audit 2026.pdf',
              pageNumber: 2,
              chunkId: 'chk-ai-2',
              quote: 'prompt injection vulnerability rates of 18.5%',
              sourceElementIds: ['el-ai-2'],
              verified: true,
            },
          ],
          verificationStatus: 'verified',
          provider: 'local-deterministic',
        },
      ],
    };

    const md = exportConversationToMarkdown(conv, [mockDoc1]);
    expect(md).toContain('# DocuLens Inquiry Conversation: Safety Audit Discussion');
    expect(md).toContain('Global AI Safety Audit 2026.pdf');
    expect(md).toContain('What were the red-teaming vulnerability rates?');
    expect(md).toContain('prompt injection vulnerability rates of 18.5%');
    expect(md).toContain('[ev-1]');
  });
});
