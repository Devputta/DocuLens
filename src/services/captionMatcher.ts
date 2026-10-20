/**
 * DocuLens Figure Caption Detection and Proximity Linking
 * - Matches caption prefixes such as "Figure 3:", "Fig. 3.", "Chart 2 -", "Diagram 1:"
 *   at the beginning of paragraph elements on the same or the next page.
 * - Links captions to the nearest figure using vertical bounding box proximity.
 * - Stores figureId <-> captionElementId and a canonical label (e.g. "Figure 3").
 * - Marks matches as "unlinked" if uncertain rather than guessing.
 */

import { DocumentElement, DocumentFigure } from '../types/doculens';

export interface CaptionDetectionResult {
  isCaption: boolean;
  prefix?: string;
  number?: string;
  separator?: string;
  label?: string; // e.g. "Figure 3", "Fig. 3.", "Chart 2", "Diagram 1"
  captionText?: string;
  fullText?: string;
}

// Regex matching caption prefixes at the beginning of a string or paragraph
export const CAPTION_REGEX =
  /^\s*(Figure|Fig\.?|Chart|Diagram|Illustration|Plate)\s+([0-9]+[A-Za-z0-9\.\-]*)\s*([:\.\-—–])\s*([\s\S]*)$/i;

/**
 * Detects whether an element content starts with a figure caption pattern.
 */
export function detectCaptionInText(text: string): CaptionDetectionResult {
  if (!text || typeof text !== 'string') {
    return { isCaption: false };
  }

  const trimmed = text.trim();
  const match = trimmed.match(CAPTION_REGEX);

  if (!match) {
    return { isCaption: false };
  }

  const prefix = match[1];
  const number = match[2];
  const separator = match[3];
  const remainingText = match[4]?.trim() || '';

  // Standardized label preserving original prefix form, e.g. "Figure 3" or "Fig. 3"
  const label = `${prefix} ${number}`;

  return {
    isCaption: true,
    prefix,
    number,
    separator,
    label,
    captionText: remainingText,
    fullText: trimmed,
  };
}

export function detectCaptionInElement(element: DocumentElement): CaptionDetectionResult {
  if (!element || !element.content) {
    return { isCaption: false };
  }
  return detectCaptionInText(element.content);
}

/**
 * Calculates vertical distance between a figure and a caption element.
 * Both bounding boxes are [x, y, width, height] normalized (0-100) or pts.
 */
export function calculateVerticalDistance(
  figBbox: [number, number, number, number] | undefined,
  figPage: number,
  elBbox: [number, number, number, number] | undefined,
  elPage: number,
  figIndexOnPage = 0,
  elIndexOnPage = 0
): number {
  // If caption is on the previous page before figure, invalid layout
  if (elPage < figPage) {
    return Infinity;
  }

  // If caption is more than 1 page after figure, too far
  if (elPage > figPage + 1) {
    return Infinity;
  }

  // Figure vertical coordinates [top, bottom]
  const fy1 = figBbox ? figBbox[1] : 20 + figIndexOnPage * 30;
  const fy2 = figBbox ? figBbox[1] + figBbox[3] : fy1 + 25;

  // Element vertical coordinates [top, bottom]
  const ey1 = elBbox ? elBbox[1] : 15 + elIndexOnPage * 15;
  const ey2 = elBbox ? elBbox[1] + elBbox[3] : ey1 + 10;

  if (figPage === elPage) {
    // Same page:
    // Case 1: Caption is below figure
    if (ey1 >= fy2) {
      return ey1 - fy2;
    }
    // Case 2: Caption is above figure
    if (fy1 >= ey2) {
      return fy1 - ey2;
    }
    // Overlapping vertically
    return 0;
  } else {
    // Caption is on the next page (figPage + 1)
    // Only plausibly linked if figure was in the bottom half of the previous page
    // and caption is near the top of the next page
    if (fy2 < 45 || ey1 > 40) {
      return Infinity; // Too far / unnatural break
    }
    // Vertical distance across page boundary + boundary penalty
    const distToBottom = Math.max(0, 100 - fy2);
    const distFromTop = ey1;
    return distToBottom + distFromTop + 15;
  }
}

/**
 * Links a set of figures with document elements by detecting captions and calculating vertical proximity.
 * If proximity is ambiguous, conflicting, or uncertain, marks as "unlinked".
 */
export function linkFiguresAndCaptions(
  figures: DocumentFigure[],
  elements: DocumentElement[]
): DocumentFigure[] {
  if (!figures || figures.length === 0) {
    return [];
  }

  // 1. Identify all caption elements
  interface CaptionCandidate {
    element: DocumentElement;
    detection: CaptionDetectionResult;
    page: number;
    indexOnPage: number;
  }

  const captionCandidates: CaptionCandidate[] = [];
  const pageElementCounts = new Map<number, number>();

  for (const el of elements) {
    const page = el.pageNumber || 1;
    const idx = pageElementCounts.get(page) || 0;
    pageElementCounts.set(page, idx + 1);

    const detection = detectCaptionInElement(el);
    if (detection.isCaption) {
      captionCandidates.push({
        element: el,
        detection,
        page,
        indexOnPage: idx,
      });
    }
  }

  // 2. Clone figures to prevent mutating inputs
  const updatedFigures: DocumentFigure[] = figures.map((f) => ({ ...f }));

  // Track assigned captions to prevent multiple figures claiming the same caption element
  const assignedCaptionIds = new Set<string>();

  // Page figure counts for fallback indices
  const pageFigCounts = new Map<number, number>();
  for (const fig of updatedFigures) {
    const page = fig.pageNumber || 1;
    pageFigCounts.set(page, (pageFigCounts.get(page) || 0) + 1);
  }

  // Process figures
  for (let fIdx = 0; fIdx < updatedFigures.length; fIdx++) {
    const fig = updatedFigures[fIdx];
    const figPage = fig.pageNumber || 1;

    // Find all matching captions on the same page or the next page
    const potentialCaptions = captionCandidates.filter(
      (c) =>
        (c.page === figPage || c.page === figPage + 1) &&
        !assignedCaptionIds.has(c.element.id)
    );

    if (potentialCaptions.length === 0) {
      fig.captionStatus = 'unlinked';
      continue;
    }

    // Measure vertical distance to each potential caption
    const candidatesWithDistance = potentialCaptions
      .map((c) => {
        const dist = calculateVerticalDistance(
          fig.bbox,
          figPage,
          c.element.bbox,
          c.page,
          fIdx,
          c.indexOnPage
        );
        return { candidate: c, distance: dist };
      })
      .filter((item) => item.distance < Infinity)
      .sort((a, b) => a.distance - b.distance);

    if (candidatesWithDistance.length === 0) {
      fig.captionStatus = 'unlinked';
      continue;
    }

    const best = candidatesWithDistance[0];

    // Uncertainty checks:
    // 1. Distance exceeds maximum reasonable threshold (65% of page)
    if (best.distance > 65) {
      fig.captionStatus = 'unlinked';
      continue;
    }

    // 2. If multiple candidates exist with nearly identical distance (< 3% difference) and different labels
    if (
      candidatesWithDistance.length > 1 &&
      candidatesWithDistance[1].distance - best.distance < 3 &&
      candidatesWithDistance[1].candidate.detection.label !== best.candidate.detection.label
    ) {
      // Ambiguous / uncertain match
      fig.captionStatus = 'unlinked';
      continue;
    }

    // Check if another unassigned figure on the same page is significantly closer to this same caption
    const otherFiguresOnPage = updatedFigures.filter(
      (other, oIdx) => oIdx !== fIdx && (other.pageNumber === figPage || other.pageNumber === figPage + 1)
    );
    let anotherFigureIsCloser = false;
    for (const otherFig of otherFiguresOnPage) {
      const otherDist = calculateVerticalDistance(
        otherFig.bbox,
        otherFig.pageNumber,
        best.candidate.element.bbox,
        best.candidate.page
      );
      if (otherDist < best.distance - 2) {
        anotherFigureIsCloser = true;
        break;
      }
    }

    if (anotherFigureIsCloser) {
      fig.captionStatus = 'unlinked';
      continue;
    }

    // Valid confident match!
    assignedCaptionIds.add(best.candidate.element.id);
    fig.captionElementId = best.candidate.element.id;
    fig.captionLabel = best.candidate.detection.label;
    fig.caption = best.candidate.detection.fullText;
    fig.captionStatus = 'linked';
  }

  return updatedFigures;
}
