/**
 * DocuLens Annotation & Highlighting Range Engine
 * 
 * Provides:
 * - Deterministic, interval-splitting algorithm for overlapping annotation ranges
 * - Seamless intersection with inline lexical search highlights
 * - Zero-animation soft background color rendering (amber, green, blue, pink)
 * - Markdown export for document annotations
 */

import { MarginaliaNote, AnnotationColor } from '../types/doculens';
import { formatExportDateTime } from '../utils/exportBranding';

export interface TextAnnotationSlice {
  text: string;
  start: number;
  end: number;
  annotations: MarginaliaNote[];
  isSearchMatch: boolean;
  activeColor?: AnnotationColor;
}

export const ANNOTATION_COLORS: {
  id: AnnotationColor;
  label: string;
  bgClass: string;
  borderClass: string;
  swatchClass: string;
  hex: string;
}[] = [
  {
    id: 'amber',
    label: 'Amber',
    bgClass: 'bg-[#E8A94A]/25 text-[#E6E9EF]',
    borderClass: 'border-b border-[#E8A94A]/60',
    swatchClass: 'bg-[#E8A94A]',
    hex: '#E8A94A',
  },
  {
    id: 'green',
    label: 'Green',
    bgClass: 'bg-[#10B981]/25 text-[#E6E9EF]',
    borderClass: 'border-b border-[#10B981]/60',
    swatchClass: 'bg-[#10B981]',
    hex: '#10B981',
  },
  {
    id: 'blue',
    label: 'Blue',
    bgClass: 'bg-[#3B82F6]/25 text-[#E6E9EF]',
    borderClass: 'border-b border-[#3B82F6]/60',
    swatchClass: 'bg-[#3B82F6]',
    hex: '#3B82F6',
  },
  {
    id: 'pink',
    label: 'Pink',
    bgClass: 'bg-[#EC4899]/25 text-[#E6E9EF]',
    borderClass: 'border-b border-[#EC4899]/60',
    swatchClass: 'bg-[#EC4899]',
    hex: '#EC4899',
  },
];

export function getAnnotationColorMeta(color?: AnnotationColor) {
  return ANNOTATION_COLORS.find((c) => c.id === color) || ANNOTATION_COLORS[0];
}

/**
 * Splits text into contiguous, non-overlapping intervals partitioned by all
 * annotation boundaries and search match boundaries.
 * 
 * Handles:
 * - Overlapping annotation ranges
 * - Nested ranges
 * - Search query matches intersecting with annotations
 * - Zero-animation guarantees
 */
export function splitTextWithAnnotationsAndSearch(
  content: string,
  elementAnnotations: MarginaliaNote[],
  searchQuery?: string
): TextAnnotationSlice[] {
  if (!content) return [];

  const textLength = content.length;

  // 1. Collect valid annotation ranges clamped to content length
  interface ValidRange {
    note: MarginaliaNote;
    start: number;
    end: number;
  }

  const validAnnotations: ValidRange[] = [];
  for (const note of elementAnnotations) {
    if (
      typeof note.startOffset === 'number' &&
      typeof note.endOffset === 'number' &&
      note.startOffset < note.endOffset &&
      note.startOffset >= 0
    ) {
      const clampedStart = Math.max(0, Math.min(note.startOffset, textLength));
      const clampedEnd = Math.max(clampedStart, Math.min(note.endOffset, textLength));
      if (clampedEnd > clampedStart) {
        validAnnotations.push({
          note,
          start: clampedStart,
          end: clampedEnd,
        });
      }
    }
  }

  // 2. Collect search match intervals
  interface MatchRange {
    start: number;
    end: number;
  }
  const searchMatches: MatchRange[] = [];
  const trimmedQuery = searchQuery?.trim() || '';

  if (trimmedQuery.length > 0) {
    const lowerContent = content.toLowerCase();
    const lowerQuery = trimmedQuery.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < textLength) {
      const matchIndex = lowerContent.indexOf(lowerQuery, searchFrom);
      if (matchIndex === -1) break;
      searchMatches.push({
        start: matchIndex,
        end: matchIndex + lowerQuery.length,
      });
      searchFrom = matchIndex + Math.max(1, lowerQuery.length);
    }
  }

  // If there are neither annotations nor search matches, return a single slice
  if (validAnnotations.length === 0 && searchMatches.length === 0) {
    return [
      {
        text: content,
        start: 0,
        end: textLength,
        annotations: [],
        isSearchMatch: false,
      },
    ];
  }

  // 3. Collect all critical boundary cut points
  const cutPointSet = new Set<number>();
  cutPointSet.add(0);
  cutPointSet.add(textLength);

  for (const a of validAnnotations) {
    cutPointSet.add(a.start);
    cutPointSet.add(a.end);
  }

  for (const m of searchMatches) {
    cutPointSet.add(m.start);
    cutPointSet.add(m.end);
  }

  const sortedPoints = Array.from(cutPointSet).sort((a, b) => a - b);

  // 4. Build contiguous slices
  const slices: TextAnnotationSlice[] = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const sliceStart = sortedPoints[i];
    const sliceEnd = sortedPoints[i + 1];

    if (sliceStart >= sliceEnd) continue;

    const sliceText = content.slice(sliceStart, sliceEnd);

    // Find all annotations covering this slice completely
    const coveringNotes = validAnnotations
      .filter((a) => a.start <= sliceStart && a.end >= sliceEnd)
      .map((a) => a.note);

    // Find if search query covers this slice
    const isSearchMatch = searchMatches.some(
      (m) => m.start <= sliceStart && m.end >= sliceEnd
    );

    // Pick active color: if multiple annotations overlap, pick the latest created one
    let activeColor: AnnotationColor | undefined = undefined;
    if (coveringNotes.length > 0) {
      // Sort by createdAt descending
      const sortedByRecency = [...coveringNotes].sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      activeColor = sortedByRecency[0].color || 'amber';
    }

    slices.push({
      text: sliceText,
      start: sliceStart,
      end: sliceEnd,
      annotations: coveringNotes,
      isSearchMatch,
      activeColor,
    });
  }

  return slices;
}

/**
 * Exports annotations to Markdown format
 */
export function exportAnnotationsToMarkdown(
  docName: string,
  annotations: MarginaliaNote[],
  date: Date = new Date()
): string {
  const formattedDate = formatExportDateTime(date, true);
  const lines: string[] = [];

  lines.push(`# DocuLens Document Annotations`);
  lines.push(`**Document:** ${docName}`);
  lines.push(`**Generated:** ${formattedDate}`);
  lines.push(`**Total Annotations:** ${annotations.length}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  if (annotations.length === 0) {
    lines.push(`*No annotations recorded for this document.*`);
    return lines.join('\n');
  }

  // Sort annotations by page number, then createdAt
  const sorted = [...annotations].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  // Group by page number
  let currentPage = -1;
  for (const ann of sorted) {
    if (ann.pageNumber !== currentPage) {
      currentPage = ann.pageNumber;
      lines.push(`## Page ${currentPage}`);
      lines.push(``);
    }

    const colorName = ann.color ? ann.color.toUpperCase() : 'AMBER';
    const timeStr = new Date(ann.createdAt).toLocaleString();

    lines.push(`### [${colorName}] ${timeStr}`);
    if (ann.selectedText) {
      lines.push(`> "${ann.selectedText}"`);
      lines.push(``);
    }
    if (ann.noteText && ann.noteText.trim()) {
      lines.push(`**Note:** ${ann.noteText}`);
    } else {
      lines.push(`*(Highlight only)*`);
    }
    if (typeof ann.startOffset === 'number' && typeof ann.endOffset === 'number') {
      lines.push(`*Character Range: [${ann.startOffset}–${ann.endOffset}]*`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Triggers safe browser download of annotations as Markdown
 */
export function downloadAnnotationsMarkdown(
  docName: string,
  annotations: MarginaliaNote[]
): void {
  const mdContent = exportAnnotationsToMarkdown(docName, annotations);
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);

  const cleanDoc = docName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('download', `doculens_annotations_${cleanDoc}_${dateStr}.md`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
