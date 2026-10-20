import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Trash2,
  Cpu,
  Globe,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Quote,
  CheckSquare,
  Sparkles,
  Info,
  Plus,
  MessageSquare,
  Search,
  Edit2,
  Check,
  X,
  Download,
  FileText,
} from 'lucide-react';
import {
  DocumentChunk,
  DocumentEntity,
  InquiryMessage,
  InquiryConversation,
  CitationEvidence,
} from '../types/doculens';
import { processInquiry, exportConversationToMarkdown } from '../services/inquiryEngine';
import { storage } from '../services/storage';

interface InquiryViewProps {
  documents: DocumentEntity[];
  chunks: DocumentChunk[];
  selectedDocId?: string;
  inquiries: InquiryMessage[];
  onSaveInquiry: (msg: InquiryMessage) => Promise<void>;
  onClearInquiries: () => Promise<void>;
  onNavigateToReader: (
    docId: string,
    pageNumber: number,
    highlightQuery?: string,
    targetElementId?: string
  ) => void;
  isOnline: boolean;
}

export const InquiryView: React.FC<InquiryViewProps> = ({
  documents,
  chunks,
  selectedDocId: initialDocId,
  inquiries: legacyInquiries,
  onSaveInquiry,
  onClearInquiries,
  onNavigateToReader,
  isOnline,
}) => {
  const [conversations, setConversations] = useState<InquiryConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState('');

  const [question, setQuestion] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [useRemoteAssist, setUseRemoteAssist] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationEvidence | null>(null);
  const [currentScopeDocId, setCurrentScopeDocId] = useState<string | undefined>(initialDocId);

  // Sync initial scope if passed
  useEffect(() => {
    if (initialDocId) {
      setCurrentScopeDocId(initialDocId);
    }
  }, [initialDocId]);

  // Load conversations from IndexedDB
  useEffect(() => {
    let mounted = true;
    storage.getConversations().then((loaded) => {
      if (!mounted) return;
      if (loaded.length > 0) {
        setConversations(loaded);
        setActiveConversationId(loaded[0].id);
      } else if (legacyInquiries.length > 0) {
        // Migrate any pre-existing loose inquiry messages into an initial conversation
        const firstUserQ = legacyInquiries.find((m) => m.role === 'user')?.content || 'Initial Inquiry';
        const initialConv: InquiryConversation = {
          id: `conv-${crypto.randomUUID().slice(0, 8)}`,
          title: firstUserQ.slice(0, 45),
          documentScopeId: initialDocId,
          createdAt: legacyInquiries[0]?.timestamp || Date.now(),
          updatedAt: Date.now(),
          messages: legacyInquiries,
        };
        storage.saveConversation(initialConv);
        setConversations([initialConv]);
        setActiveConversationId(initialConv.id);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const activeMessages = activeConversation?.messages || [];

  // Filter conversations for the sidebar search
  const filteredConversations = useMemo(() => {
    if (!conversationSearch.trim()) return conversations;
    const q = conversationSearch.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, conversationSearch]);

  const handleCreateNewConversation = () => {
    const newConv: InquiryConversation = {
      id: `conv-${crypto.randomUUID().slice(0, 8)}`,
      title: 'New Conversation',
      documentScopeId: currentScopeDocId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    storage.saveConversation(newConv);
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setQuestion('');
  };

  const handleDeleteConversation = async (convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await storage.deleteConversation(convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConversationId === convId) {
      const remaining = conversations.filter((c) => c.id !== convId);
      setActiveConversationId(remaining[0]?.id || null);
    }
  };

  const handleStartRename = (conv: InquiryConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditingTitleDraft(conv.title);
  };

  const handleSaveRename = async (convId: string) => {
    const trimmed = editingTitleDraft.trim() || 'Untitled Conversation';
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      const updated = { ...conv, title: trimmed, updatedAt: Date.now() };
      await storage.saveConversation(updated);
      setConversations((prev) => prev.map((c) => (c.id === convId ? updated : c)));
    }
    setEditingConvId(null);
  };

  const handleExportConversationMarkdown = () => {
    if (!activeConversation) return;
    const md = exportConversationToMarkdown(activeConversation, documents);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = activeConversation.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    a.download = `doculens_conversation_${cleanTitle}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sampleQuestions = [
    {
      q: 'What were the total clean energy investments and battery storage additions in 2025?',
      desc: 'Retrieves solar & battery expenditure figures from Energy Audit',
    },
    {
      q: 'What are the patient eligibility criteria and age ranges in Protocol B-709 Rev 2?',
      desc: 'Retrieves EASI scores, age bounds, and disease duration',
    },
    {
      q: 'Was mild hepatic impairment permitted or excluded in Protocol Revision 3?',
      desc: 'Retrieves the Amendment 1 safety rule on Child-Pugh Class A',
    },
    {
      q: 'What is the nuclear fission capital investment in Brazil?',
      desc: 'Triggers honest Insufficient Evidence status',
    },
  ];

  const handleSubmit = async (e?: React.FormEvent, customQ?: string) => {
    if (e) e.preventDefault();
    const query = customQ || question;
    if (!query.trim() || isSynthesizing) return;

    let targetConv = activeConversation;
    if (!targetConv) {
      const newConv: InquiryConversation = {
        id: `conv-${crypto.randomUUID().slice(0, 8)}`,
        title: query.trim().slice(0, 45),
        documentScopeId: currentScopeDocId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      await storage.saveConversation(newConv);
      targetConv = newConv;
      setConversations([newConv]);
      setActiveConversationId(newConv.id);
    }

    const isFirstQuestion = targetConv.messages.length === 0 || targetConv.title === 'New Conversation';
    const newTitle = isFirstQuestion ? query.trim().slice(0, 45) : targetConv.title;

    const userMsg: InquiryMessage = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      role: 'user',
      content: query.trim(),
      timestamp: Date.now(),
      documentScopeId: targetConv.documentScopeId || currentScopeDocId,
      evidence: [],
      verificationStatus: 'verified',
      provider: 'local-deterministic',
      conversationId: targetConv.id,
    };

    const updatedWithUser: InquiryConversation = {
      ...targetConv,
      title: newTitle,
      updatedAt: Date.now(),
      messages: [...targetConv.messages, userMsg],
    };

    setConversations((prev) =>
      prev.map((c) => (c.id === updatedWithUser.id ? updatedWithUser : c))
    );
    await storage.saveConversation(updatedWithUser);
    await onSaveInquiry(userMsg);
    setQuestion('');
    setIsSynthesizing(true);

    try {
      // Pass the last 3 Q/A pairs (last 6 messages) for pronoun & topic resolution
      const responseMsg = await processInquiry(
        query,
        chunks,
        documents,
        targetConv.documentScopeId || currentScopeDocId,
        useRemoteAssist && isOnline,
        targetConv.messages
      );
      responseMsg.conversationId = targetConv.id;

      const finalConv: InquiryConversation = {
        ...updatedWithUser,
        updatedAt: Date.now(),
        messages: [...updatedWithUser.messages, responseMsg],
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === finalConv.id ? finalConv : c))
      );
      await storage.saveConversation(finalConv);
      await onSaveInquiry(responseMsg);
    } catch (err: any) {
      const errorMsg: InquiryMessage = {
        id: `err-${crypto.randomUUID().slice(0, 8)}`,
        role: 'assistant',
        content: `Error during evidence retrieval: ${err?.message || 'Processing failed'}`,
        timestamp: Date.now(),
        documentScopeId: targetConv.documentScopeId || currentScopeDocId,
        evidence: [],
        verificationStatus: 'insufficient_evidence',
        provider: 'local-deterministic',
        conversationId: targetConv.id,
      };

      const finalConv: InquiryConversation = {
        ...updatedWithUser,
        updatedAt: Date.now(),
        messages: [...updatedWithUser.messages, errorMsg],
      };
      setConversations((prev) =>
        prev.map((c) => (c.id === finalConv.id ? finalConv : c))
      );
      await storage.saveConversation(finalConv);
      await onSaveInquiry(errorMsg);
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-paper-border pb-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-ink">
            Grounded Inquiry & Conversation Intelligence
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Document Scope Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-muted">Scope:</span>
            <select
              value={currentScopeDocId || ''}
              onChange={(e) => {
                const newScope = e.target.value || undefined;
                setCurrentScopeDocId(newScope);
                if (activeConversation) {
                  const updated = { ...activeConversation, documentScopeId: newScope, updatedAt: Date.now() };
                  storage.saveConversation(updated);
                  setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                }
              }}
              className="text-[13px] bg-paper-light border border-paper-border hover:border-accent rounded-md px-3 py-1.5 min-h-[36px] text-ink focus:border-accent transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="" className="bg-paper-light text-ink">
                All Ingested Documents ({documents.length})
              </option>
              {documents.map((d) => (
                <option key={d.id} value={d.id} className="bg-paper-light text-ink">
                  {d.originalName} ({d.pageCount}p)
                </option>
              ))}
            </select>
          </div>

          {activeConversation && activeConversation.messages.length > 0 && (
            <button
              onClick={handleExportConversationMarkdown}
              title="Export Conversation as Markdown"
              className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink border border-paper-border rounded-md px-3 py-1.5 min-h-[36px] bg-paper-light hover:bg-paper-dim transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Download className="w-3.5 h-3.5 text-accent" />
              <span>Export (Markdown)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Split: Conversations Sidebar + Active Chat Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Conversations List */}
        <aside
          aria-label="Past conversations"
          className="lg:col-span-4 border border-paper-border bg-paper-light rounded-lg p-3 sm:p-4 space-y-3.5 shadow-xs lg:sticky lg:top-4 max-h-[calc(100vh-6rem)] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-paper-border pb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <MessageSquare className="w-3.5 h-3.5 text-accent" />
              <span>Conversations ({conversations.length})</span>
            </div>
            <button
              type="button"
              onClick={handleCreateNewConversation}
              className="inline-flex items-center gap-1 text-xs bg-accent text-accent-text hover:bg-accent-hover px-2.5 py-1 rounded font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Conversation Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-paper border border-paper-border rounded-md text-ink placeholder:text-ink-faint focus:border-accent focus-visible:outline-none"
            />
          </div>

          {/* Conversations List */}
          <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-6 text-xs text-ink-faint">
                {conversationSearch ? 'No matching conversations' : 'No saved conversations yet'}
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const isEditing = editingConvId === conv.id;
                const scopeDoc = documents.find((d) => d.id === conv.documentScopeId);

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveConversationId(conv.id);
                        if (conv.documentScopeId) {
                          setCurrentScopeDocId(conv.documentScopeId);
                        }
                      }
                    }}
                    className={`p-2.5 rounded-md border text-left text-xs cursor-pointer group transition-all duration-150 space-y-1 ${
                      isActive
                        ? 'border-accent bg-accent-subtle/40 ring-1 ring-accent'
                        : 'border-paper-border bg-paper hover:bg-paper-dim'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      {isEditing ? (
                        <div
                          className="flex items-center gap-1 w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingTitleDraft}
                            onChange={(e) => setEditingTitleDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(conv.id);
                              if (e.key === 'Escape') setEditingConvId(null);
                            }}
                            className="bg-paper-light border border-accent rounded px-2 py-0.5 text-xs text-ink w-full focus-visible:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(conv.id)}
                            className="p-1 text-emerald-400 hover:bg-paper rounded"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            className={`font-medium truncate flex-1 ${
                              isActive ? 'text-accent font-semibold' : 'text-ink'
                            }`}
                          >
                            {conv.title}
                          </span>

                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => handleStartRename(conv, e)}
                              title="Rename conversation"
                              className="p-1 text-ink-faint hover:text-ink rounded"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteConversation(conv.id, e)}
                              title="Delete conversation"
                              className="p-1 text-ink-faint hover:text-red-400 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-ink-faint">
                      <span>{new Date(conv.updatedAt || conv.createdAt).toLocaleDateString()}</span>
                      <span className="truncate max-w-[120px]">
                        {scopeDoc ? scopeDoc.originalName : 'All Documents'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Area: Conversation Stream & Input */}
        <div className="lg:col-span-8 space-y-5">
          {/* Active Conversation Details Banner */}
          <div className="p-3 bg-paper-light border border-paper-border rounded-lg flex items-center justify-between gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-serif font-semibold text-ink text-sm">
                {activeConversation?.title || 'New Inquiry'}
              </span>
              <span className="font-mono text-ink-faint">
                ({activeMessages.length} message{activeMessages.length === 1 ? '' : 's'})
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useRemoteAssist}
                  onChange={(e) => setUseRemoteAssist(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-paper-border text-accent focus:ring-accent"
                />
                <span className="text-ink-muted">Remote Assist</span>
              </label>
            </div>
          </div>

          {/* Curated Reliability Benchmarks */}
          {activeMessages.length === 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Curated Reliability Benchmarks:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sampleQuestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQuestion(item.q);
                      handleSubmit(undefined, item.q);
                    }}
                    className="text-left p-3.5 rounded-lg border border-paper-border bg-paper-light hover:border-accent hover:bg-paper-dim transition-all duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="text-[13px] font-sans font-medium text-ink group-hover:text-accent">
                      "{item.q}"
                    </div>
                    <div className="text-xs text-ink-faint mt-1">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Messages Stream */}
          <div className="space-y-5">
            {activeMessages.length === 0 ? (
              <div className="border border-paper-border bg-paper-light rounded-lg p-8 sm:p-12 text-center text-ink-muted space-y-4 shadow-xs">
                <div className="w-16 h-16 mx-auto rounded-full bg-paper border border-paper-border p-3 flex items-center justify-center shadow-xs">
                  <img
                    src="/doculens-mark-transparent.png"
                    alt="DocuLens Evidence Engine"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="font-serif text-xl font-medium text-ink">
                  Ask Documents With Grounded Citations
                </p>
                <p className="text-[13px] max-w-md mx-auto text-ink-muted leading-relaxed">
                  Inquire about facts, requirements, tables, or measurements. Follow-up questions maintain context across turns while ensuring every answer is backed by verified document passages.
                </p>
              </div>
            ) : (
              activeMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-5 sm:p-6 rounded-lg border transition-all duration-150 space-y-4 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-paper-light border-paper-border'
                      : msg.verificationStatus === 'insufficient_evidence'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : msg.verificationStatus === 'unverified'
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-paper-light border-paper-border-dark'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs border-b border-paper-border pb-3 flex-wrap gap-2">
                    <span className="font-semibold text-ink">
                      {msg.role === 'user' ? 'Question' : 'Grounded Synthesis'}
                    </span>
                    <span className="font-mono text-ink-faint">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="prose prose-invert max-w-none text-[14px] leading-relaxed font-sans whitespace-pre-line text-ink">
                    {msg.content}
                  </div>

                  {/* Verified Citations List (Click to jump to reader) */}
                  {msg.evidence && msg.evidence.length > 0 && (
                    <div className="space-y-2.5 pt-3 border-t border-paper-border">
                      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5 text-accent" />
                        <span>Source Citations (Click to navigate in Reader):</span>
                      </div>

                      <div className="space-y-2">
                        {msg.evidence.map((ev, evIdx) => {
                          const isSourceRemoved =
                            ev.rejectionReason === 'source removed' ||
                            ev.verificationDetails === 'source removed';

                          return (
                            <button
                              key={evIdx}
                              type="button"
                              disabled={isSourceRemoved}
                              title={
                                isSourceRemoved
                                  ? 'Source document has been removed from library'
                                  : 'Click to view cited passage in Reader'
                              }
                              onClick={() => {
                                if (!isSourceRemoved) {
                                  onNavigateToReader(
                                    ev.documentId,
                                    ev.pageNumber,
                                    ev.quote,
                                    ev.sourceElementIds[0]
                                  );
                                }
                              }}
                              className={`w-full text-left p-3 rounded bg-paper border border-paper-border text-xs space-y-1.5 transition-colors group ${
                                isSourceRemoved
                                  ? 'opacity-70 cursor-not-allowed border-rose-500/20'
                                  : 'hover:border-accent cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-accent">
                                    [{ev.evidenceId}]
                                  </span>
                                  <span className="text-ink font-medium">
                                    {ev.documentName} — Page {ev.pageNumber}
                                  </span>
                                </div>

                                {isSourceRemoved ? (
                                  <span className="font-mono text-[10px] uppercase font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">
                                    Source Removed
                                  </span>
                                ) : ev.verified ? (
                                  <span className="font-mono text-[10px] uppercase font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                    Verified
                                  </span>
                                ) : (
                                  <span className="font-mono text-[10px] uppercase font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                    {ev.rejectionReason || 'Unverified'}
                                  </span>
                                )}
                              </div>

                              <p className="font-serif italic text-ink-muted pl-2 border-l border-paper-border group-hover:text-ink">
                                "{ev.quote}"
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Inquiry Input Form */}
          <form onSubmit={handleSubmit} className="relative mt-4">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question or follow-up regarding the ingested documents..."
              disabled={isSynthesizing}
              className="w-full text-[14px] bg-paper-light border border-paper-border focus:border-accent rounded-lg pl-4 pr-12 py-3.5 text-ink placeholder:text-ink-faint shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!question.trim() || isSynthesizing}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-accent text-accent-text hover:bg-accent-hover rounded-md transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
