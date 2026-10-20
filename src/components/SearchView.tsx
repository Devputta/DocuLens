import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  BookOpen,
  ArrowRight,
  Sparkles,
  Filter,
  AlertCircle,
  X,
  SlidersHorizontal,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import {
  DocumentChunk,
  DocumentEntity,
  SearchResult,
  SearchNoResultsAdvice,
} from '../types/doculens';
import { searchChunks, analyzeNoResults, highlightTextSegments } from '../services/lexicalSearch';
import { storage } from '../services/storage';

interface SearchViewProps {
  documents: DocumentEntity[];
  chunks: DocumentChunk[];
  selectedDocId?: string;
  onSelectDoc: (id?: string) => void;
  onNavigateToReader: (docId: string, pageNumber: number, highlightQuery?: string) => void;
  onOpenFigure?: (figureId: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  documents,
  chunks,
  selectedDocId,
  onSelectDoc,
  onNavigateToReader,
  onOpenFigure,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'page'>('relevance');
  const [figureThumbs, setFigureThumbs] = useState<Map<string, string>>(new Map());

  // Load figure thumbnails for visual search preview
  useEffect(() => {
    storage.getAllFigureSummaries().then((summaries) => {
      const map = new Map<string, string>();
      for (const s of summaries) {
        if (s.thumbnailUrl) {
          map.set(s.id, s.thumbnailUrl);
        }
      }
      setFigureThumbs(map);
    });
  }, []);

  const sampleQueries = [
    '648 billion',
    'interconnection delays',
    'Child-Pugh Class A',
    '12-lead electrocardiogram',
    'step-by-step procedure',
    'retention memory',
    'dynamic line rating',
    'stored-program',
  ];

  const noResultsAdvice = useMemo<SearchNoResultsAdvice | null>(() => {
    if (hasSearched && results.length === 0 && query.trim()) {
      return analyzeNoResults(query, chunks, documents, selectedDocId);
    }
    return null;
  }, [hasSearched, results.length, query, chunks, documents, selectedDocId]);

  const handleSearch = (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = customQuery !== undefined ? customQuery : query;
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setHasSearched(true);
    const searchRes = searchChunks(q, chunks, documents, selectedDocId);
    setResults(searchRes);
  };

  const executeSample = (q: string) => {
    setQuery(q);
    handleSearch(undefined, q);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  // Sorted results
  const displayedResults = useMemo(() => {
    if (sortBy === 'page') {
      return [...results].sort((a, b) => {
        if (a.document.id !== b.document.id) {
          return a.document.originalName.localeCompare(b.document.originalName);
        }
        return a.chunk.pageStart - b.chunk.pageStart;
      });
    }
    return results; // Default BM25 score descending
  }, [results, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="border-b border-paper-border pb-4">
        <h1 className="text-2xl font-serif font-semibold text-ink">
          Lexical Search Engine
        </h1>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={(e) => handleSearch(e)} className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim().length > 1) {
                  const instant = searchChunks(e.target.value, chunks, documents, selectedDocId);
                  setResults(instant);
                  setHasSearched(true);
                } else if (!e.target.value.trim()) {
                  setResults([]);
                  setHasSearched(false);
                }
              }}
              placeholder="Search phrases, numbers, terms, or sections (e.g. '648 billion', 'step-by-step', 'Child-Pugh')..."
              className="w-full min-h-[36px] bg-paper-light border border-paper-border focus:border-accent rounded-md pl-10 pr-9 py-2 text-[13px] sm:text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search input"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1 min-h-[28px] min-w-[28px] flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={selectedDocId || ''}
              onChange={(e) => {
                const newId = e.target.value || undefined;
                onSelectDoc(newId);
                if (query.trim()) {
                  const res = searchChunks(query, chunks, documents, newId);
                  setResults(res);
                }
              }}
              aria-label="Filter search by document"
              className="bg-paper-light border border-paper-border rounded-md px-3 py-2 min-h-[36px] text-[13px] text-ink focus:border-accent transition-all duration-150 max-w-[190px] truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="" className="bg-paper-light text-ink">All Documents ({documents.length})</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id} className="bg-paper-light text-ink">
                  {d.originalName}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="bg-ink hover:opacity-90 text-paper px-5 py-2 min-h-[36px] rounded-md text-[13px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Search
            </button>
          </div>
        </div>

        {/* Suggested Query Buttons */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-ink-muted">
          <span className="font-medium text-ink-faint">Suggested tests:</span>
          {sampleQueries.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => executeSample(q)}
              className="px-2.5 py-1 min-h-[28px] rounded-md border border-paper-border bg-paper hover:border-accent hover:text-accent transition-all duration-150 text-xs text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {q}
            </button>
          ))}
        </div>
      </form>

      {/* Results Header / Controls */}
      {hasSearched && results.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-paper-border pb-3 text-[13px] text-ink-muted">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">
              Found {results.length} matching passage{results.length === 1 ? '' : 's'} for "{query}"
            </span>
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-ink-faint" />
            <span className="text-ink-faint text-xs">Sort by:</span>
            <button
              onClick={() => setSortBy('relevance')}
              className={`px-2.5 py-1 min-h-[32px] rounded-md border text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                sortBy === 'relevance'
                  ? 'bg-accent-subtle text-accent border-accent-border font-semibold'
                  : 'bg-paper-light border-paper-border text-ink-muted hover:text-ink'
              }`}
            >
              BM25 Relevance
            </button>
            <button
              onClick={() => setSortBy('page')}
              className={`px-2.5 py-1 min-h-[32px] rounded-md border text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                sortBy === 'page'
                  ? 'bg-accent-subtle text-accent border-accent-border font-semibold'
                  : 'bg-paper-light border-paper-border text-ink-muted hover:text-ink'
              }`}
            >
              Page Order
            </button>
          </div>
        </div>
      )}

      {/* Empty / Zero state */}
      {!hasSearched && (
        <div className="border border-paper-border bg-paper-light rounded-lg p-8 sm:p-12 text-center text-ink-muted space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-paper border border-paper-border p-3 flex items-center justify-center shadow-xs">
            <img
              src="/doculens-mark-transparent.png"
              alt="DocuLens Search"
              className="w-full h-full object-contain"
            />
          </div>
          <p className="font-serif text-xl font-medium text-ink">
            Evidence-Based Lexical Search
          </p>
          <p className="text-[13px] max-w-md mx-auto text-ink-muted leading-relaxed">
            Query exact terms, numbers, or phrases across all indexed documents. Results display
            term highlights and provide one-click jump to Reader with active highlight overlays.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            {sampleQueries.slice(0, 4).map((q) => (
              <button
                key={q}
                onClick={() => executeSample(q)}
                className="px-3 py-1.5 min-h-[36px] bg-paper hover:bg-paper-dim border border-paper-border text-ink rounded-md text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Try "{q}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Results Handling */}
      {hasSearched && results.length === 0 && (
        <div className="border border-paper-border bg-paper-light rounded-lg p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-subtle border border-accent-border p-2.5 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-accent" />
            </div>
            <div className="text-center sm:text-left space-y-2.5 flex-1">
              <h3 className="font-serif text-lg font-semibold text-ink">
                No matching passages found for "{query}"
              </h3>
              <p className="text-[13px] text-ink-muted leading-relaxed max-w-2xl">
                {noResultsAdvice?.message ||
                  'Lexical retrieval requires exact tokens, numbers, or phrases present in the stored document chunks.'}
              </p>

              {/* Scope Relaxation Option */}
              {noResultsAdvice?.reason === 'scoped_out' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDoc(undefined);
                      const res = searchChunks(query, chunks, documents, undefined);
                      setResults(res);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 min-h-[36px] bg-ink hover:opacity-90 text-paper rounded-md text-[13px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Filter className="w-4 h-4" />
                    <span>
                      Search across All Documents ({noResultsAdvice.scopeRelaxationDocCount} have matches)
                    </span>
                  </button>
                </div>
              )}

              {/* Suggested Vocabulary / Spelling */}
              {noResultsAdvice?.suggestedTerms && noResultsAdvice.suggestedTerms.length > 0 && (
                <div className="pt-3 border-t border-paper-border space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Similar terms indexed in documents:</span>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {noResultsAdvice.suggestedTerms.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => executeSample(term)}
                        className="px-3 py-1.5 min-h-[32px] rounded-md border border-paper-border bg-paper hover:border-accent hover:text-accent text-xs font-mono transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Section Titles */}
              {noResultsAdvice?.availableSectionTitles &&
                noResultsAdvice.availableSectionTitles.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                      Document Sections You Can Search:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {noResultsAdvice.availableSectionTitles.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => executeSample(sec)}
                          className="px-2.5 py-1 min-h-[30px] rounded-md border border-paper-border bg-paper hover:border-ink-muted text-xs text-ink-muted truncate max-w-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          § {sec}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Results Listing with Multi-Term Highlighting */}
      <div className="space-y-4">
        {displayedResults.map((res, idx) => {
          // Build snippet highlighting: if highlightSegments exist, render directly
          const segments =
            res.highlightSegments && res.highlightSegments.length > 0
              ? res.highlightSegments
              : highlightTextSegments(res.chunk.text, [query, ...res.matchedTerms], query);

          return (
            <div
              key={`${res.chunk.id}-${idx}`}
              className="border border-paper-border bg-paper-light hover:border-paper-border-dark rounded-lg p-5 space-y-3.5 transition-all duration-150 shadow-xs"
            >
              {/* Header / Provenance */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {res.chunk.sourceType === 'figure' ? (
                      <ImageIcon className="w-4 h-4 text-accent" />
                    ) : (
                      <FileText className="w-4 h-4 text-ink-faint" />
                    )}
                    <span className="font-serif font-semibold text-ink">
                      {res.document.originalName}
                    </span>
                  </div>
                  <span className="text-ink-faint">·</span>
                  <span className="font-mono text-accent font-semibold bg-accent-subtle border border-accent-border px-2 py-0.5 rounded text-xs">
                    Page {res.chunk.pageStart}
                  </span>
                  {res.chunk.sourceType === 'figure' && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Figure OCR
                    </span>
                  )}
                  {res.chunk.sectionPath.length > 0 && (
                    <>
                      <span className="text-ink-faint">·</span>
                      <span className="text-ink-muted truncate max-w-xs font-mono text-xs">
                        § {res.chunk.sectionPath.join(' / ')}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="font-mono text-xs text-ink-faint">
                    BM25: {Math.round(res.score)}
                  </span>
                  {/* Open Figure in Lightbox button */}
                  {res.chunk.figureId && onOpenFigure && (
                    <button
                      onClick={() => onOpenFigure(res.chunk.figureId!)}
                      title="Open figure in Lightbox"
                      className="flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover font-semibold bg-accent-subtle hover:bg-accent/20 px-3 py-1.5 min-h-[36px] rounded-md border border-accent-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ImageIcon className="w-4 h-4 text-accent" />
                      <span>Open figure</span>
                    </button>
                  )}
                  <button
                    onClick={() => onNavigateToReader(res.document.id, res.chunk.pageStart, query)}
                    className="flex items-center gap-1.5 text-[13px] text-ink hover:text-accent font-medium bg-paper hover:bg-paper-dim px-3 py-1.5 min-h-[36px] rounded-md border border-paper-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <BookOpen className="w-4 h-4 text-accent" />
                    <span>Inspect in Reader</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Snippet with optional Figure Thumbnail and Rich Multi-Term Highlight */}
              <div className="p-4 bg-paper rounded-md border border-paper-border font-serif text-[13px] sm:text-sm text-ink leading-relaxed">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  {/* Figure Thumbnail if available */}
                  {res.chunk.figureId && figureThumbs.get(res.chunk.figureId) && (
                    <div
                      onClick={() => onOpenFigure && onOpenFigure(res.chunk.figureId!)}
                      title="Click to view figure in Lightbox"
                      className="w-28 h-20 shrink-0 bg-paper-dim border border-paper-border rounded overflow-hidden flex items-center justify-center cursor-pointer group shadow-xs"
                    >
                      <img
                        src={figureThumbs.get(res.chunk.figureId)}
                        alt="Figure Thumbnail"
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {segments.map((seg, sIdx) => {
                      if (seg.isMatch) {
                        return (
                          <mark
                            key={sIdx}
                            className={`font-normal no-underline rounded-[3px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-none animate-none px-1 py-0.5 ${
                              seg.isPrimary
                                ? 'bg-[#E8A94A]/65 text-[#0F1217]'
                                : 'bg-[#E8A94A]/30 text-[#0F1217]'
                            }`}
                            title={seg.term ? `Matched term: "${seg.term}"` : undefined}
                          >
                            {seg.text}
                          </mark>
                        );
                      }
                      return <span key={sIdx}>{seg.text}</span>;
                    })}
                  </div>
                </div>
              </div>

              {/* Chunk footer with term tags */}
              <div className="flex items-center justify-between text-xs text-ink-faint font-mono flex-wrap gap-2 pt-2 border-t border-paper-border">
                <span>Chunk ID: {res.chunk.id}</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>Matched:</span>
                  {res.matchedTerms.map((t, tIdx) => (
                    <span
                      key={tIdx}
                      className="px-2 py-0.5 rounded bg-paper border border-paper-border text-ink-muted text-[11px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
