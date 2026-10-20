/**
 * DocuLens Comparison Figures Export Engine
 * 
 * Provides:
 * - Branded Comparison PDF embedding with jsPDF (scaled to page width, never split across pages)
 * - Markdown report generation with `./doculens_figures/<name>.png` references
 * - Store-only ZIP archive packager (md + images folder) with zero network
 * - 20-figure limit validation and 5 MB size warning logic
 */

import { DocumentFigure } from '../types/doculens';
import { createStoreZipBlob } from './zipWriter';

export const MAX_EXPORT_FIGURES = 20;
export const SIZE_WARNING_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ExportableFigure extends DocumentFigure {
  docLabel: 'Doc A' | 'Doc B';
  docName: string;
}

/**
 * Generates a clean, deterministic relative filename for an exported figure.
 */
export function generateFigureFilename(
  docLabel: string,
  pageNumber: number,
  figureId: string
): string {
  const cleanDoc = docLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cleanId = figureId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return `${cleanDoc}_p${pageNumber}_${cleanId}.png`;
}

/**
 * Calculates total byte size of selected figures and checks warning threshold.
 */
export function calculateFiguresTotalSize(figures: Array<{ imageBlob?: Blob; width?: number; height?: number }>): {
  totalBytes: number;
  isOverWarningThreshold: boolean;
  formattedSize: string;
} {
  let totalBytes = 0;
  for (const f of figures) {
    if (f.imageBlob) {
      totalBytes += f.imageBlob.size;
    } else if (f.width && f.height) {
      // Estimate 4 bytes per pixel uncompressed / ~0.5 bytes compressed PNG
      totalBytes += Math.round(f.width * f.height * 0.5);
    }
  }

  const isOverWarningThreshold = totalBytes > SIZE_WARNING_THRESHOLD_BYTES;
  const sizeMb = (totalBytes / (1024 * 1024)).toFixed(1);
  const formattedSize = totalBytes > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(totalBytes / 1024)} KB`;

  return {
    totalBytes,
    isOverWarningThreshold,
    formattedSize,
  };
}

/**
 * Formats Markdown report incorporating figures as ./doculens_figures/<name>.png references.
 */
export function buildMarkdownWithFigures(
  baseMarkdown: string,
  figures: ExportableFigure[]
): {
  markdown: string;
  figureRefs: Array<{ figure: ExportableFigure; filename: string; relativePath: string }>;
} {
  const figureRefs: Array<{
    figure: ExportableFigure;
    filename: string;
    relativePath: string;
  }> = [];

  const lines: string[] = [baseMarkdown];
  lines.push('\n\n## 6. Visual Figures & Exhibits\n\n');

  for (const fig of figures) {
    const filename = generateFigureFilename(fig.docLabel, fig.pageNumber, fig.id);
    const relativePath = `./doculens_figures/${filename}`;

    figureRefs.push({
      figure: fig,
      filename,
      relativePath,
    });

    const captionLabel = fig.captionLabel || 'Figure';
    const captionText = fig.caption || 'Visual exhibit from source document';
    const provenanceLabel = `${fig.docLabel} (${fig.docName}), Page ${fig.pageNumber}`;

    lines.push(`### ${captionLabel} — ${provenanceLabel}\n\n`);
    lines.push(`![${captionLabel}: ${captionText}](${relativePath})\n\n`);
    lines.push(`*Caption: ${captionText} (${provenanceLabel})*\n\n`);
  }

  return {
    markdown: lines.join(''),
    figureRefs,
  };
}

/**
 * Creates one store-only ZIP archive containing the Markdown report and doculens_figures folder.
 */
export async function createComparisonZipArchive(
  markdownContent: string,
  figureEntries: Array<{ filename: string; blob: Blob }>
): Promise<Blob> {
  const zipFiles: Array<{ path: string; data: Uint8Array | string }> = [
    {
      path: 'comparison_report.md',
      data: markdownContent,
    },
  ];

  for (const entry of figureEntries) {
    const arrayBuffer = await entry.blob.arrayBuffer();
    zipFiles.push({
      path: `doculens_figures/${entry.filename}`,
      data: new Uint8Array(arrayBuffer),
    });
  }

  return createStoreZipBlob(zipFiles);
}

/**
 * Converts a Blob to a base64 Data URL for jsPDF embedding.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to Data URL'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Determines whether adding a figure would exceed page bounds, ensuring figures are never split across pages.
 */
export function checkFigureSplitAndAddPage(
  currentY: number,
  figureHeight: number,
  pageHeight: number,
  bottomMargin = 45,
  topMargin = 36
): { shouldAddPage: boolean; nextY: number } {
  // If figure height + captions + spacing would overshoot bottom margin
  if (currentY + figureHeight + 35 > pageHeight - bottomMargin) {
    return { shouldAddPage: true, nextY: topMargin };
  }
  return { shouldAddPage: false, nextY: currentY };
}
