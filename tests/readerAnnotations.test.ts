import { describe, it, expect } from 'vitest';
import {
  splitTextWithAnnotationsAndSearch,
  exportAnnotationsToMarkdown,
  ANNOTATION_COLORS,
  getAnnotationColorMeta,
} from '../src/services/annotationService';
import { MarginaliaNote } from '../src/types/doculens';

describe('Reader Annotations — Range Splitting, Overlap & Export (Requirement 7)', () => {
  it('returns a single slice when there are no annotations or search matches', () => {
    const text = 'Local-first PDF intelligence with client-side verification.';
    const slices = splitTextWithAnnotationsAndSearch(text, []);

    expect(slices).toHaveLength(1);
    expect(slices[0].text).toBe(text);
    expect(slices[0].start).toBe(0);
    expect(slices[0].end).toBe(text.length);
    expect(slices[0].annotations).toHaveLength(0);
    expect(slices[0].isSearchMatch).toBe(false);
  });

  it('handles a single isolated annotation within paragraph bounds', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const note: MarginaliaNote = {
      id: 'note-1',
      documentId: 'doc-1',
      pageNumber: 1,
      selectedText: 'brown fox',
      noteText: 'Observation on wildlife',
      createdAt: 1000,
      elementId: 'el-1',
      startOffset: 10,
      endOffset: 19,
      color: 'amber',
    };

    const slices = splitTextWithAnnotationsAndSearch(text, [note]);

    expect(slices).toHaveLength(3);
    // Slice 0: before annotation
    expect(slices[0].text).toBe('The quick ');
    expect(slices[0].annotations).toHaveLength(0);

    // Slice 1: annotation
    expect(slices[1].text).toBe('brown fox');
    expect(slices[1].start).toBe(10);
    expect(slices[1].end).toBe(19);
    expect(slices[1].annotations).toHaveLength(1);
    expect(slices[1].activeColor).toBe('amber');

    // Slice 2: after annotation
    expect(slices[2].text).toBe(' jumps over the lazy dog.');
    expect(slices[2].annotations).toHaveLength(0);
  });

  it('splits overlapping annotation ranges correctly without gaps or duplication', () => {
    // Text: "ABCDEFGHIJ"
    // Ann 1: [2, 6] -> "CDEF" (amber, createdAt: 100)
    // Ann 2: [4, 8] -> "EFGH" (green, createdAt: 200)
    const text = 'ABCDEFGHIJ';
    const note1: MarginaliaNote = {
      id: 'note-1',
      documentId: 'doc-1',
      pageNumber: 1,
      selectedText: 'CDEF',
      noteText: 'First highlight',
      createdAt: 100,
      elementId: 'el-1',
      startOffset: 2,
      endOffset: 6,
      color: 'amber',
    };
    const note2: MarginaliaNote = {
      id: 'note-2',
      documentId: 'doc-1',
      pageNumber: 1,
      selectedText: 'EFGH',
      noteText: 'Second highlight',
      createdAt: 200,
      elementId: 'el-1',
      startOffset: 4,
      endOffset: 8,
      color: 'green',
    };

    const slices = splitTextWithAnnotationsAndSearch(text, [note1, note2]);

    // Expected slices:
    // [0, 2] -> "AB" (no ann)
    // [2, 4] -> "CD" (note 1 only, amber)
    // [4, 6] -> "EF" (both notes! more recent note2 wins: green)
    // [6, 8] -> "GH" (note 2 only, green)
    // [8, 10] -> "IJ" (no ann)
    expect(slices).toHaveLength(5);

    expect(slices[0].text).toBe('AB');
    expect(slices[0].annotations).toHaveLength(0);

    expect(slices[1].text).toBe('CD');
    expect(slices[1].annotations).toHaveLength(1);
    expect(slices[1].annotations[0].id).toBe('note-1');
    expect(slices[1].activeColor).toBe('amber');

    expect(slices[2].text).toBe('EF');
    expect(slices[2].annotations).toHaveLength(2);
    expect(slices[2].activeColor).toBe('green'); // more recent createdAt (200 > 100)

    expect(slices[3].text).toBe('GH');
    expect(slices[3].annotations).toHaveLength(1);
    expect(slices[3].annotations[0].id).toBe('note-2');
    expect(slices[3].activeColor).toBe('green');

    expect(slices[4].text).toBe('IJ');
    expect(slices[4].annotations).toHaveLength(0);

    // Verify reconstruction matches original text
    const reconstructed = slices.map((s) => s.text).join('');
    expect(reconstructed).toBe(text);
  });

  it('handles nested annotation ranges (one annotation completely inside another)', () => {
    // Text: "The Local Workspace Engine"
    // Ann Outer: [4, 19] -> "Local Workspace" (blue)
    // Ann Inner: [10, 19] -> "Workspace" (pink)
    const text = 'The Local Workspace Engine';
    const noteOuter: MarginaliaNote = {
      id: 'note-outer',
      documentId: 'doc-1',
      pageNumber: 1,
      selectedText: 'Local Workspace',
      noteText: 'Outer note',
      createdAt: 100,
      elementId: 'el-1',
      startOffset: 4,
      endOffset: 19,
      color: 'blue',
    };
    const noteInner: MarginaliaNote = {
      id: 'note-inner',
      documentId: 'doc-1',
      pageNumber: 1,
      selectedText: 'Workspace',
      noteText: 'Inner note',
      createdAt: 200,
      elementId: 'el-1',
      startOffset: 10,
      endOffset: 19,
      color: 'pink',
    };

    const slices = splitTextWithAnnotationsAndSearch(text, [noteOuter, noteInner]);

    // Expected:
    // [0, 4] -> "The "
    // [4, 10] -> "Local " (outer only, blue)
    // [10, 19] -> "Workspace" (both, inner more recent, pink)
    // [19, 26] -> " Engine"
    expect(slices).toHaveLength(4);
    expect(slices[0].text).toBe('The ');
    expect(slices[1].text).toBe('Local ');
    expect(slices[1].activeColor).toBe('blue');
    expect(slices[2].text).toBe('Workspace');
    expect(slices[2].activeColor).toBe('pink');
    expect(slices[3].text).toBe(' Engine');
  });

  it('handles ranges that cross inline search highlights', () => {
    // Text: "Deterministic verification protocol"
    // Search query: "verification" [14, 26]
    // Annotation: [8, 20] -> "stic verifi" (amber)
    const text = 'Deterministic verification protocol';
    const note: MarginaliaNote = {
      id: 'note-1',
      documentId: 'doc-1',
      pageNumber: 1,
      selectedText: 'stic verifi',
      noteText: 'Cross term note',
      createdAt: 100,
      elementId: 'el-1',
      startOffset: 8,
      endOffset: 19,
      color: 'amber',
    };

    const slices = splitTextWithAnnotationsAndSearch(text, [note], 'verification');

    // Bounds:
    // 0, 8 (ann start), 14 (search start), 19 (ann end), 26 (search end), 35 (end)
    // Slices:
    // [0, 8]: "Determin" -> neither
    // [8, 14]: "istic " -> annotation only
    // [14, 19]: "verif" -> BOTH annotation and search match!
    // [19, 26]: "ication" -> search match only
    // [26, 35]: " protocol" -> neither
    expect(slices).toHaveLength(5);

    expect(slices[0].text).toBe('Determin');
    expect(slices[0].isSearchMatch).toBe(false);
    expect(slices[0].annotations).toHaveLength(0);

    expect(slices[1].text).toBe('istic ');
    expect(slices[1].isSearchMatch).toBe(false);
    expect(slices[1].annotations).toHaveLength(1);

    expect(slices[2].text).toBe('verif');
    expect(slices[2].isSearchMatch).toBe(true);
    expect(slices[2].annotations).toHaveLength(1);
    expect(slices[2].activeColor).toBe('amber');

    expect(slices[3].text).toBe('ication');
    expect(slices[3].isSearchMatch).toBe(true);
    expect(slices[3].annotations).toHaveLength(0);

    expect(slices[4].text).toBe(' protocol');
    expect(slices[4].isSearchMatch).toBe(false);
  });

  it('supports all 4 highlight colors with readable text and soft backgrounds', () => {
    expect(ANNOTATION_COLORS).toHaveLength(4);
    const colorIds = ANNOTATION_COLORS.map((c) => c.id);
    expect(colorIds).toContain('amber');
    expect(colorIds).toContain('green');
    expect(colorIds).toContain('blue');
    expect(colorIds).toContain('pink');

    // Verify soft backgrounds have high-contrast readable text (#E6E9EF)
    for (const c of ANNOTATION_COLORS) {
      expect(c.bgClass).toContain('text-[#E6E9EF]');
      expect(getAnnotationColorMeta(c.id).id).toBe(c.id);
    }
  });

  it('exports annotations to Markdown with document, page, quoted text, and notes', () => {
    const notes: MarginaliaNote[] = [
      {
        id: 'n-1',
        documentId: 'doc-spec',
        pageNumber: 2,
        selectedText: 'The system must operate without remote dependency.',
        noteText: 'Critical local requirement',
        createdAt: 1700000000000,
        color: 'amber',
        startOffset: 12,
        endOffset: 62,
      },
      {
        id: 'n-2',
        documentId: 'doc-spec',
        pageNumber: 5,
        selectedText: 'Table 4 summarizes latency benchmarks.',
        noteText: 'Check performance on mobile devices',
        createdAt: 1700001000000,
        color: 'blue',
        startOffset: 0,
        endOffset: 38,
      },
    ];

    const md = exportAnnotationsToMarkdown('Architecture_Spec.pdf', notes, new Date(1700002000000));

    expect(md).toContain('# DocuLens Document Annotations');
    expect(md).toContain('**Document:** Architecture_Spec.pdf');
    expect(md).toContain('**Total Annotations:** 2');
    expect(md).toContain('## Page 2');
    expect(md).toContain('> "The system must operate without remote dependency."');
    expect(md).toContain('**Note:** Critical local requirement');
    expect(md).toContain('## Page 5');
    expect(md).toContain('> "Table 4 summarizes latency benchmarks."');
    expect(md).toContain('**Note:** Check performance on mobile devices');
  });
});
