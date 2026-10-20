import { describe, it, expect } from 'vitest';
import {
  detectCaptionInText,
  calculateVerticalDistance,
  linkFiguresAndCaptions,
} from '../src/services/captionMatcher';
import { DocumentFigure, DocumentElement } from '../src/types/doculens';

describe('Figure Caption Detection and Linking (Requirement 2)', () => {
  describe('detectCaptionInText', () => {
    it('matches standard caption patterns: Figure 3:, Fig. 3., Chart 2 -, Diagram 1:', () => {
      const res1 = detectCaptionInText('Figure 3: System Architecture of the Local-First Pipeline');
      expect(res1.isCaption).toBe(true);
      expect(res1.prefix).toBe('Figure');
      expect(res1.number).toBe('3');
      expect(res1.separator).toBe(':');
      expect(res1.label).toBe('Figure 3');
      expect(res1.captionText).toBe('System Architecture of the Local-First Pipeline');

      const res2 = detectCaptionInText('Fig. 3. Memory consumption across multi-page document parsing.');
      expect(res2.isCaption).toBe(true);
      expect(res2.prefix).toBe('Fig.');
      expect(res2.number).toBe('3');
      expect(res2.separator).toBe('.');
      expect(res2.label).toBe('Fig. 3');

      const res3 = detectCaptionInText('Chart 2 - BM25 Term Frequency Distribution');
      expect(res3.isCaption).toBe(true);
      expect(res3.prefix).toBe('Chart');
      expect(res3.number).toBe('2');
      expect(res3.separator).toBe('-');
      expect(res3.label).toBe('Chart 2');

      const res4 = detectCaptionInText('Diagram 1: End-to-End Cryptographic Data Flow');
      expect(res4.isCaption).toBe(true);
      expect(res4.prefix).toBe('Diagram');
      expect(res4.number).toBe('1');
      expect(res4.separator).toBe(':');
      expect(res4.label).toBe('Diagram 1');
    });

    it('handles multi-line captions correctly preserving full caption content', () => {
      const multilineText = `Figure 4A: Distributed consensus and peer heartbeat protocol.
This diagram illustrates the state transitions under network partitions,
showing message exchanges between node clusters.`;

      const res = detectCaptionInText(multilineText);
      expect(res.isCaption).toBe(true);
      expect(res.label).toBe('Figure 4A');
      expect(res.captionText).toContain('Distributed consensus');
      expect(res.fullText).toBe(multilineText.trim());
    });

    it('rejects regular body text or paragraphs that do not start with caption prefixes', () => {
      expect(detectCaptionInText('This document discusses the figures in chapter 2.').isCaption).toBe(false);
      expect(detectCaptionInText('As shown in Figure 3, the latency drops.').isCaption).toBe(false);
      expect(detectCaptionInText('').isCaption).toBe(false);
      expect(detectCaptionInText('Table 1: Financial Results').isCaption).toBe(false);
    });
  });

  describe('Vertical Proximity & Bounding Box Distance', () => {
    it('calculates vertical distance between figure and caption on the same page', () => {
      // Figure at [10, 20, 80, 30] (top 20, bottom 50)
      // Caption at [10, 55, 80, 5] (top 55, bottom 60) -> distance is 55 - 50 = 5
      const dist = calculateVerticalDistance([10, 20, 80, 30], 1, [10, 55, 80, 5], 1);
      expect(dist).toBe(5);
    });

    it('calculates distance when caption is directly above figure', () => {
      // Caption at [10, 10, 80, 5] (top 10, bottom 15)
      // Figure at [10, 20, 80, 30] (top 20, bottom 50) -> distance is 20 - 15 = 5
      const dist = calculateVerticalDistance([10, 20, 80, 30], 1, [10, 10, 80, 5], 1);
      expect(dist).toBe(5);
    });

    it('allows caption on the next page if figure is near the bottom and caption is near the top', () => {
      // Figure on page 1 at bottom: [10, 75, 80, 20] (top 75, bottom 95)
      // Caption on page 2 at top: [10, 5, 80, 5] (top 5)
      const dist = calculateVerticalDistance([10, 75, 80, 20], 1, [10, 5, 80, 5], 2);
      expect(dist).toBeLessThan(40);
    });

    it('rejects captions that are on previous pages or more than 1 page away', () => {
      const distPrev = calculateVerticalDistance([10, 20, 80, 30], 2, [10, 55, 80, 5], 1);
      expect(distPrev).toBe(Infinity);

      const distTooFar = calculateVerticalDistance([10, 20, 80, 30], 1, [10, 55, 80, 5], 3);
      expect(distTooFar).toBe(Infinity);
    });
  });

  describe('linkFiguresAndCaptions with Multiple Figures & Edge Cases', () => {
    it('links each caption to the nearest figure on a page with several figures', () => {
      // Page 1 has 2 figures: Fig Top and Fig Bottom
      const figureTop: DocumentFigure = {
        id: 'fig-top',
        documentId: 'doc1',
        pageNumber: 1,
        bbox: [10, 10, 80, 25], // top=10, bottom=35
        width: 600,
        height: 300,
        imageBlob: new Blob(['top']),
        thumbnailBlob: new Blob(['t1']),
        hash: 'h-top',
        createdAt: Date.now(),
      };

      const figureBottom: DocumentFigure = {
        id: 'fig-bottom',
        documentId: 'doc1',
        pageNumber: 1,
        bbox: [10, 55, 80, 25], // top=55, bottom=80
        width: 600,
        height: 300,
        imageBlob: new Blob(['bottom']),
        thumbnailBlob: new Blob(['t2']),
        hash: 'h-bottom',
        createdAt: Date.now(),
      };

      const caption1: DocumentElement = {
        id: 'el-cap-1',
        documentId: 'doc1',
        pageNumber: 1,
        type: 'paragraph',
        content: 'Figure 1: Top Architecture Overview',
        bbox: [10, 37, 80, 5], // top=37 (2 units below Fig Top)
        sourceElementId: 'src-1',
      };

      const caption2: DocumentElement = {
        id: 'el-cap-2',
        documentId: 'doc1',
        pageNumber: 1,
        type: 'paragraph',
        content: 'Figure 2: Bottom Flow Chart',
        bbox: [10, 82, 80, 5], // top=82 (2 units below Fig Bottom)
        sourceElementId: 'src-2',
      };

      const bodyParagraph: DocumentElement = {
        id: 'el-body',
        documentId: 'doc1',
        pageNumber: 1,
        type: 'paragraph',
        content: 'This is unrelated text discussion explaining the system in details.',
        bbox: [10, 45, 80, 8],
        sourceElementId: 'src-body',
      };

      const linked = linkFiguresAndCaptions(
        [figureTop, figureBottom],
        [caption1, bodyParagraph, caption2]
      );

      const topResult = linked.find((f) => f.id === 'fig-top');
      const bottomResult = linked.find((f) => f.id === 'fig-bottom');

      expect(topResult?.captionStatus).toBe('linked');
      expect(topResult?.captionElementId).toBe('el-cap-1');
      expect(topResult?.captionLabel).toBe('Figure 1');

      expect(bottomResult?.captionStatus).toBe('linked');
      expect(bottomResult?.captionElementId).toBe('el-cap-2');
      expect(bottomResult?.captionLabel).toBe('Figure 2');
    });

    it('marks figure as unlinked when no caption is within reasonable proximity', () => {
      const figure: DocumentFigure = {
        id: 'fig-lonely',
        documentId: 'doc1',
        pageNumber: 1,
        bbox: [10, 10, 80, 20],
        width: 500,
        height: 300,
        imageBlob: new Blob(['data']),
        thumbnailBlob: new Blob(['thumb']),
        hash: 'h-lonely',
        createdAt: Date.now(),
      };

      // Caption is on page 3 (too far)
      const farCaption: DocumentElement = {
        id: 'el-far',
        documentId: 'doc1',
        pageNumber: 3,
        type: 'paragraph',
        content: 'Figure 1: Something far away',
        bbox: [10, 80, 80, 5],
        sourceElementId: 'src-far',
      };

      const linked = linkFiguresAndCaptions([figure], [farCaption]);
      expect(linked[0].captionStatus).toBe('unlinked');
      expect(linked[0].captionElementId).toBeUndefined();
    });

    it('marks figure as unlinked when proximity match is ambiguous between multiple equidistant captions', () => {
      const figure: DocumentFigure = {
        id: 'fig-ambiguous',
        documentId: 'doc1',
        pageNumber: 1,
        bbox: [10, 45, 80, 10], // middle: 45..55
        width: 500,
        height: 300,
        imageBlob: new Blob(['data']),
        thumbnailBlob: new Blob(['thumb']),
        hash: 'h-ambig',
        createdAt: Date.now(),
      };

      // Caption A above at distance 10
      const capA: DocumentElement = {
        id: 'el-capA',
        documentId: 'doc1',
        pageNumber: 1,
        type: 'paragraph',
        content: 'Figure 1: Option A',
        bbox: [10, 30, 80, 5], // bottom is 35 -> dist = 10
        sourceElementId: 'src-capA',
      };

      // Caption B below at distance 10
      const capB: DocumentElement = {
        id: 'el-capB',
        documentId: 'doc1',
        pageNumber: 1,
        type: 'paragraph',
        content: 'Diagram 2: Option B',
        bbox: [10, 65, 80, 5], // top is 65 -> dist = 10
        sourceElementId: 'src-capB',
      };

      const linked = linkFiguresAndCaptions([figure], [capA, capB]);
      // Equidistant conflicting captions: marks unlinked rather than guessing
      expect(linked[0].captionStatus).toBe('unlinked');
    });
  });
});
