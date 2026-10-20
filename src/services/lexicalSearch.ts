/**
 * Local-First Lexical Search Engine
 * BM25 / TF-IDF term ranking, chunk length normalization, query term coordination,
 * exact phrase matching, and contextual multi-match highlighting.
 * Runs 100% locally and offline.
 */

import {
  DocumentChunk,
  DocumentEntity,
  SearchResult,
  SearchNoResultsAdvice,
  TextHighlightSegment,
} from '../types/doculens';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren', 'arent', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
  'isn', 'isnt', 'it', 'its', 'itself', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'were',
  'werent', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

/**
 * Tokenizes text preserving hyphenated terms and alphanumeric identifiers.
 */
export function tokenizeQuery(text: string): string[] {
  if (!text) return [];
  // Match words, hyphenated compounds (e.g. B-709, Child-Pugh, 12-lead), and numbers
  const tokens = text
    .toLowerCase()
    .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];

  return tokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Levenshtein distance for fuzzy vocabulary suggestions
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const d: number[][] = [];

  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

/**
 * Calculates term frequencies in a chunk
 */
function getChunkTermCounts(text: string): { counts: Map<string, number>; wordCount: number } {
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return { counts, wordCount: Math.max(1, tokens.length) };
}

/**
 * Performs BM25-ranked lexical search across document chunks.
 */
export function searchChunks(
  query: string,
  chunks: DocumentChunk[],
  documents: DocumentEntity[],
  documentScopeId?: string
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const targetChunks = documentScopeId
    ? chunks.filter((c) => c.documentId === documentScopeId)
    : chunks;

  if (targetChunks.length === 0) return [];

  const docMap = new Map(documents.map((d) => [d.id, d]));
  const queryTokens = tokenizeQuery(trimmed);
  const normalizedQuery = trimmed.toLowerCase();

  // If query tokens empty (e.g. only stop words or symbols), fallback to raw alphanumeric words
  const effectiveTokens = queryTokens.length > 0 
    ? queryTokens 
    : (trimmed.toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 0);

  // 1. Calculate corpus statistics for BM25
  const N = targetChunks.length;
  let totalWords = 0;
  const chunkStats = new Map<string, { counts: Map<string, number>; wordCount: number }>();
  const docFrequencies = new Map<string, number>();

  for (const chunk of targetChunks) {
    const stats = getChunkTermCounts(chunk.text);
    chunkStats.set(chunk.id, stats);
    totalWords += stats.wordCount;

    // Check term presence for document frequency
    const seen = new Set<string>();
    for (const token of effectiveTokens) {
      if (stats.counts.has(token) && !seen.has(token)) {
        seen.add(token);
        docFrequencies.set(token, (docFrequencies.get(token) || 0) + 1);
      }
    }
  }

  const avgdl = totalWords / Math.max(1, N);
  const k1 = 1.2;
  const b = 0.75;

  const results: SearchResult[] = [];

  for (const chunk of targetChunks) {
    const doc = docMap.get(chunk.documentId);
    if (!doc || doc.status !== 'ready') continue;

    const stats = chunkStats.get(chunk.id);
    if (!stats) continue;

    const lowerChunkText = chunk.text.toLowerCase();
    let bm25Score = 0;
    const matchedTerms: string[] = [];
    let matchedTokenCount = 0;

    // A. BM25 term frequency scoring with IDF
    for (const token of effectiveTokens) {
      const tf = stats.counts.get(token) || 0;
      if (tf > 0) {
        matchedTokenCount++;
        matchedTerms.push(token);

        const df = docFrequencies.get(token) || 1;
        // Robertson-Spärck Jones IDF
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const safeIdf = Math.max(0.2, idf);

        // BM25 TF component
        const tfComponent = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (stats.wordCount / avgdl)));
        bm25Score += safeIdf * tfComponent;
      } else if (token.length > 3 && lowerChunkText.includes(token)) {
        // Partial substring match for compound tokens
        matchedTerms.push(token);
        bm25Score += 0.5;
      }
    }

    let finalScore = bm25Score;

    // B. Multi-term coordination bonus: penalize matching only 1 out of 5 query terms
    if (effectiveTokens.length > 1 && matchedTokenCount > 0) {
      const coverageRatio = matchedTokenCount / effectiveTokens.length;
      finalScore *= (1 + coverageRatio * 1.5);
    }

    // C. Exact phrase match bonus
    if (normalizedQuery.length > 2 && lowerChunkText.includes(normalizedQuery)) {
      finalScore += 45;
      matchedTerms.unshift(trimmed);
    }

    // D. Section path match bonus (e.g. searching for section headers)
    const sectionText = (chunk.sectionPath || []).join(' ').toLowerCase();
    for (const token of effectiveTokens) {
      if (sectionText.includes(token)) {
        finalScore += 8;
        matchedTerms.push(`§ ${token}`);
      }
    }

    // E. Numeric and code exact match bonus (e.g. 648, B-709)
    const numbersInQuery = trimmed.match(/\b\d+(?:\.\d+)?\b/g) || [];
    for (const num of numbersInQuery) {
      if (lowerChunkText.includes(num)) {
        finalScore += 12;
      }
    }

    if (finalScore > 0 && matchedTerms.length > 0) {
      // Build highlights around matching terms
      const highlights = generateHighlights(chunk.text, matchedTerms, normalizedQuery);
      const highlightSegments = highlightTextSegments(chunk.text, [normalizedQuery, ...matchedTerms], normalizedQuery);

      // Count total matches in chunk
      const matchCount = highlightSegments.filter((s) => s.isMatch).length;

      results.push({
        chunk,
        document: doc,
        score: Math.round(finalScore * 10) / 10,
        matchHighlights: highlights,
        highlightSegments,
        matchedTerms: Array.from(new Set(matchedTerms)),
        matchCount,
      });
    }
  }

  // Sort descending by relevance score
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Splits text into highlighted segments for exact matching phrases and token occurrences.
 */
export function highlightTextSegments(
  text: string,
  queryOrTerms: string | string[],
  primaryPhrase?: string
): TextHighlightSegment[] {
  if (!text) return [];

  // Gather unique terms and sort by length descending (longest first to avoid nested slicing)
  const termsSet = new Set<string>();

  if (typeof queryOrTerms === 'string') {
    const trimmed = queryOrTerms.trim().toLowerCase();
    if (trimmed.length > 1) {
      termsSet.add(trimmed);
      const tokens = tokenizeQuery(trimmed);
      for (const t of tokens) if (t.length > 2) termsSet.add(t);
    }
  } else if (Array.isArray(queryOrTerms)) {
    for (const item of queryOrTerms) {
      if (!item) continue;
      const clean = item.replace(/^§\s*/, '').trim().toLowerCase();
      if (clean.length > 1) termsSet.add(clean);
    }
  }

  if (termsSet.size === 0) {
    return [{ text, isMatch: false }];
  }

  const terms = Array.from(termsSet).sort((a, b) => b.length - a.length);
  const lowerText = text.toLowerCase();

  // Find all match intervals [start, end, term, isPrimary]
  interface Interval {
    start: number;
    end: number;
    term: string;
    isPrimary: boolean;
  }

  const intervals: Interval[] = [];

  for (const term of terms) {
    let pos = 0;
    while (pos < lowerText.length) {
      const idx = lowerText.indexOf(term, pos);
      if (idx === -1) break;

      const isPrimary = Boolean(primaryPhrase && term === primaryPhrase.toLowerCase());
      intervals.push({
        start: idx,
        end: idx + term.length,
        term,
        isPrimary,
      });
      pos = idx + Math.max(1, term.length);
    }
  }

  if (intervals.length === 0) {
    return [{ text, isMatch: false }];
  }

  // Sort intervals by start ascending, then length descending
  intervals.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Merge overlapping intervals, keeping the longer/primary interval
  const merged: Interval[] = [];
  for (const curr of intervals) {
    if (merged.length === 0) {
      merged.push(curr);
      continue;
    }

    const prev = merged[merged.length - 1];
    if (curr.start < prev.end) {
      // Overlap: if curr extends further and is longer/primary, expand
      if (curr.end > prev.end) {
        prev.end = curr.end;
        if (curr.isPrimary) prev.isPrimary = true;
      }
    } else {
      merged.push(curr);
    }
  }

  // Build segments from merged intervals
  const segments: TextHighlightSegment[] = [];
  let cursor = 0;

  for (const interval of merged) {
    if (interval.start > cursor) {
      segments.push({
        text: text.slice(cursor, interval.start),
        isMatch: false,
      });
    }

    segments.push({
      text: text.slice(interval.start, interval.end),
      isMatch: true,
      term: interval.term,
      isPrimary: interval.isPrimary,
    });

    cursor = interval.end;
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      isMatch: false,
    });
  }

  return segments;
}

/**
 * Generates contextual highlights centered on the best matched terms.
 */
function generateHighlights(
  text: string,
  matchedTerms: string[],
  normalizedQuery: string
): { before: string; match: string; after: string }[] {
  const highlights: { before: string; match: string; after: string }[] = [];
  const lowerText = text.toLowerCase();

  // Try exact query first
  let primaryTerm = '';
  if (lowerText.includes(normalizedQuery)) {
    primaryTerm = normalizedQuery;
  } else {
    // Pick longest matched term
    const cleanTerms = matchedTerms
      .map((t) => t.replace(/^§\s*/, ''))
      .filter((t) => t.length > 1);
    cleanTerms.sort((a, b) => b.length - a.length);
    primaryTerm = cleanTerms[0] || '';
  }

  if (primaryTerm) {
    const index = lowerText.indexOf(primaryTerm.toLowerCase());
    if (index !== -1) {
      const windowSize = 85;
      const start = Math.max(0, index - windowSize);
      const end = Math.min(text.length, index + primaryTerm.length + windowSize);

      const before = (start > 0 ? '… ' : '') + text.slice(start, index);
      const match = text.slice(index, index + primaryTerm.length);
      const after = text.slice(index + primaryTerm.length, end) + (end < text.length ? ' …' : '');

      highlights.push({ before, match, after });
      return highlights;
    }
  }

  // Fallback snippet
  highlights.push({
    before: '',
    match: text.slice(0, 140),
    after: text.length > 140 ? ' …' : '',
  });

  return highlights;
}

/**
 * Analyzes zero-result queries to provide helpful suggestions,
 * vocabulary terms, scope relaxation advice, and section clues.
 */
export function analyzeNoResults(
  query: string,
  chunks: DocumentChunk[],
  documents: DocumentEntity[],
  documentScopeId?: string
): SearchNoResultsAdvice {
  const trimmed = query.trim();
  const queryTokens = tokenizeQuery(trimmed);

  // 1. Check if scope was filtered and whether results exist in other documents
  if (documentScopeId) {
    const globalResults = searchChunks(trimmed, chunks, documents);
    if (globalResults.length > 0) {
      const docCount = new Set(globalResults.map((r) => r.document.id)).size;
      return {
        reason: 'scoped_out',
        suggestedTerms: [],
        scopeRelaxationDocCount: docCount,
        availableSectionTitles: [],
        message: `No matches in the selected document, but ${globalResults.length} matching passage${
          globalResults.length === 1 ? '' : 's'
        } exist across ${docCount} other document${docCount > 1 ? 's' : ''}. Switch to "All Documents" to view them.`,
      };
    }
  }

  // 2. Extract vocabulary across accessible chunks for fuzzy / spelling suggestions
  const targetChunks = documentScopeId
    ? chunks.filter((c) => c.documentId === documentScopeId)
    : chunks;

  const vocabFrequency = new Map<string, number>();
  const sectionTitles = new Set<string>();

  for (const chunk of targetChunks) {
    // Record section titles
    for (const sec of chunk.sectionPath || []) {
      if (sec.length > 3) sectionTitles.add(sec);
    }

    const words = chunk.text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
    for (const w of words) {
      if (w.length > 3 && !STOP_WORDS.has(w)) {
        vocabFrequency.set(w, (vocabFrequency.get(w) || 0) + 1);
      }
    }
  }

  // 3. Find closest vocabulary terms
  const suggestions: { word: string; distance: number; freq: number }[] = [];
  for (const token of queryTokens) {
    for (const [vocabWord, freq] of vocabFrequency.entries()) {
      if (Math.abs(vocabWord.length - token.length) <= 3) {
        const dist = levenshteinDistance(token, vocabWord);
        if (dist > 0 && dist <= 2) {
          suggestions.push({ word: vocabWord, distance: dist, freq });
        } else if (vocabWord.startsWith(token) && vocabWord.length > token.length) {
          suggestions.push({ word: vocabWord, distance: 1, freq });
        }
      }
    }
  }

  // Sort suggestions by distance asc, then frequency desc
  suggestions.sort((a, b) => a.distance - b.distance || b.freq - a.freq);
  const uniqueSuggestedTerms = Array.from(new Set(suggestions.map((s) => s.word))).slice(0, 5);

  const availableSections = Array.from(sectionTitles).slice(0, 4);

  let message = 'No passages matched this query. Lexical search matches exact terms, numbers, and phrases stored in the document chunks.';
  if (uniqueSuggestedTerms.length > 0) {
    message += ` Did you mean: ${uniqueSuggestedTerms.join(', ')}?`;
  }

  return {
    reason: 'zero_matches',
    suggestedTerms: uniqueSuggestedTerms,
    scopeRelaxationDocCount: 0,
    availableSectionTitles: availableSections,
    message,
  };
}
