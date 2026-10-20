import React, { useState, useMemo } from 'react';
import {
  GitCompare,
  ArrowLeftRight,
  PlusCircle,
  MinusCircle,
  FileEdit,
  CheckCircle,
  BookOpen,
  Filter,
  Download,
  AlertTriangle,
  Lightbulb,
  BookMarked,
  PieChart,
  HelpCircle,
  FileText,
  Layers,
  Info,
  FileDown,
  Image as ImageIcon,
  Archive,
  X,
  Check,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExportMenu } from './ExportMenu';
import {
  getLogoDataUrl,
  renderPDFHeader,
  renderPDFFooters,
  getStandardAutoTableOptions,
  generateExportFilename,
  generateMarkdownHeader,
  generateMarkdownFooter,
  generateMarkdownTable,
} from '../utils/exportBranding';
import {
  DocumentEntity,
  DocumentChunk,
  ComparisonResult,
  DiffChangeType,
  ComparisonMode,
  ConceptMatch,
  DefinitionComparisonItem,
  TopicItem,
} from '../types/doculens';
import { compareDocuments } from '../services/comparisonEngine';
import { storage } from '../services/storage';
import {
  createComparisonZipArchive,
  buildMarkdownWithFigures,
  calculateFiguresTotalSize,
  blobToDataUrl,
  checkFigureSplitAndAddPage,
  MAX_EXPORT_FIGURES,
  ExportableFigure,
} from '../services/comparisonFigureExport';

interface CompareViewProps {
  documents: DocumentEntity[];
  chunks: DocumentChunk[];
  initialLeftDocId?: string;
  initialRightDocId?: string;
  onNavigateToReader: (docId: string, pageNumber: number, highlightQuery?: string) => void;
}

export const CompareView: React.FC<CompareViewProps> = ({
  documents,
  chunks,
  initialLeftDocId,
  initialRightDocId,
  onNavigateToReader,
}) => {
  const readyDocs = documents.filter((d) => d.status === 'ready');

  // Choose sensible defaults if available
  const defaultLeft =
    initialLeftDocId ||
    readyDocs.find((d) => d.id.includes('computing-foundations'))?.id ||
    readyDocs[1]?.id ||
    readyDocs[0]?.id ||
    '';

  const defaultRight =
    initialRightDocId ||
    readyDocs.find((d) => d.id.includes('computing-architectures'))?.id ||
    readyDocs.find((d) => d.id !== defaultLeft)?.id ||
    '';

  const [leftDocId, setLeftDocId] = useState<string>(defaultLeft);
  const [rightDocId, setRightDocId] = useState<string>(defaultRight);
  const [activeMode, setActiveMode] = useState<ComparisonMode>('concept-comparison');
  const [diffFilter, setDiffFilter] = useState<DiffChangeType | 'all'>('all');
  const [conceptFilter, setConceptFilter] = useState<string>('all');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Figure Export Modal State
  const [isFigureModalOpen, setIsFigureModalOpen] = useState(false);
  const [exportTargetFormat, setExportTargetFormat] = useState<'pdf' | 'zip'>('pdf');
  const [availableFigures, setAvailableFigures] = useState<ExportableFigure[]>([]);
  const [selectedFigureIds, setSelectedFigureIds] = useState<Set<string>>(new Set());
  const [isLoadingFigures, setIsLoadingFigures] = useState(false);
  const [figureLimitNotice, setFigureLimitNotice] = useState<string | null>(null);

  const leftDoc = readyDocs.find((d) => d.id === leftDocId);
  const rightDoc = readyDocs.find((d) => d.id === rightDocId);

  // Swap Document A and Document B
  const handleSwap = () => {
    const temp = leftDocId;
    setLeftDocId(rightDocId);
    setRightDocId(temp);
  };

  // Compute full comparison result
  const comparisonResult: ComparisonResult | null = useMemo(() => {
    if (!leftDoc || !rightDoc || leftDoc.id === rightDoc.id) return null;

    const leftChunks = chunks.filter((c) => c.documentId === leftDoc.id);
    const rightChunks = chunks.filter((c) => c.documentId === rightDoc.id);

    return compareDocuments(leftDoc, rightDoc, leftChunks, rightChunks, { mode: activeMode });
  }, [leftDoc, rightDoc, chunks, activeMode]);

  // Filtered changes for Content Differences mode
  const filteredChanges = useMemo(() => {
    if (!comparisonResult) return [];
    if (diffFilter === 'all') return comparisonResult.changes;
    return comparisonResult.changes.filter((c) => c.type === diffFilter);
  }, [comparisonResult, diffFilter]);

  // Filtered concepts
  const filteredConcepts = useMemo(() => {
    if (!comparisonResult?.conceptMatches) return [];
    if (conceptFilter === 'all') return comparisonResult.conceptMatches;
    return comparisonResult.conceptMatches.filter((c) => c.relationshipType === conceptFilter);
  }, [comparisonResult, conceptFilter]);

  // Open figure selection dialog for PDF or ZIP export
  const handleOpenFigureModal = async (format: 'pdf' | 'zip') => {
    if (!comparisonResult || !leftDoc || !rightDoc) return;
    setExportTargetFormat(format);
    setIsLoadingFigures(true);
    setIsFigureModalOpen(true);
    setFigureLimitNotice(null);

    try {
      const [figsA, figsB] = await Promise.all([
        storage.getFiguresByDocument(leftDoc.id),
        storage.getFiguresByDocument(rightDoc.id),
      ]);

      const combined: ExportableFigure[] = [
        ...figsA.map((f) => ({ ...f, docLabel: 'Doc A' as const, docName: leftDoc.originalName })),
        ...figsB.map((f) => ({ ...f, docLabel: 'Doc B' as const, docName: rightDoc.originalName })),
      ];

      setAvailableFigures(combined);
      const defaultSelected = new Set(combined.slice(0, MAX_EXPORT_FIGURES).map((f) => f.id));
      setSelectedFigureIds(defaultSelected);
    } catch (err) {
      console.debug('Comparison figures notice:', err);
    } finally {
      setIsLoadingFigures(false);
    }
  };

  const handleToggleFigureSelection = (figureId: string) => {
    setSelectedFigureIds((prev) => {
      const next = new Set(prev);
      if (next.has(figureId)) {
        next.delete(figureId);
        setFigureLimitNotice(null);
      } else {
        if (next.size >= MAX_EXPORT_FIGURES) {
          setFigureLimitNotice(`Maximum limit of ${MAX_EXPORT_FIGURES} figures per export.`);
          setTimeout(() => setFigureLimitNotice(null), 3500);
          return prev;
        }
        next.add(figureId);
      }
      return next;
    });
  };

  const handleSelectAllFigures = () => {
    const ids = availableFigures.slice(0, MAX_EXPORT_FIGURES).map((f) => f.id);
    setSelectedFigureIds(new Set(ids));
    if (availableFigures.length > MAX_EXPORT_FIGURES) {
      setFigureLimitNotice(`Selected maximum limit of ${MAX_EXPORT_FIGURES} figures.`);
      setTimeout(() => setFigureLimitNotice(null), 3500);
    }
  };

  const handleDeselectAllFigures = () => {
    setSelectedFigureIds(new Set());
    setFigureLimitNotice(null);
  };

  // Base Markdown report generation with aligned pipe tables
  const buildBaseMarkdownReport = (exportDate: Date = new Date()): string => {
    if (!comparisonResult || !leftDoc || !rightDoc) return '';

    const modeLabel = activeMode
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    let md = generateMarkdownHeader('Document Comparison Report', {
      docA: `${leftDoc.originalName} (${leftDoc.pageCount} pages, ${leftDoc.chunkCount} chunks)`,
      docB: `${rightDoc.originalName} (${rightDoc.pageCount} pages, ${rightDoc.chunkCount} chunks)`,
      mode: modeLabel,
      date: exportDate,
    });

    // 1. Summary Table
    md += `## 1. Executive Comparison Summary\n\n`;
    const summaryHeaders = ['Comparison Metric', 'Metric Value', 'Analytical Details'];
    const diffCount = comparisonResult.changes?.length || (comparisonResult.statistics.added + comparisonResult.statistics.removed + comparisonResult.statistics.modified);
    const summaryRows = [
      ['Concept Matches', String(comparisonResult.conceptMatches?.length || 0), 'Cross-vocabulary semantic alignments mapped'],
      ['Content Differences', `${diffCount} clauses`, `${comparisonResult.statistics.added} additions, ${comparisonResult.statistics.removed} removals, ${comparisonResult.statistics.modified} modifications`],
      ['Shared Topics', `${comparisonResult.topicOverlap?.sharedTopics.length || 0} topics`, `${comparisonResult.topicOverlap?.uniqueToLeft.length || 0} unique to Doc A, ${comparisonResult.topicOverlap?.uniqueToRight.length || 0} unique to Doc B`],
      ['Similarity Score', `${comparisonResult.topicOverlap?.overlapPercentage || 0}%`, 'Jaccard vocabulary overlap index'],
    ];
    md += generateMarkdownTable(summaryHeaders, summaryRows) + '\n\n';

    // 2. Concept Comparison Table
    if (comparisonResult.conceptMatches && comparisonResult.conceptMatches.length > 0) {
      md += `## 2. Concept Comparison (Cross-Vocabulary Alignment)\n\n`;
      const conceptHeaders = ['Concept', 'Document A (quote, page)', 'Document B (quote, page)', 'Relationship', 'Confidence'];
      const conceptRows = comparisonResult.conceptMatches.map((cpt) => [
        cpt.conceptTitle,
        `"${cpt.leftExcerpt}" (p.${cpt.leftPage})`,
        `"${cpt.rightExcerpt}" (p.${cpt.rightPage})`,
        cpt.relationshipType.replace(/_/g, ' '),
        cpt.confidenceLabel || `${Math.round(cpt.confidence * 100)}%`,
      ]);
      md += generateMarkdownTable(conceptHeaders, conceptRows) + '\n\n';
    }

    // 3. Definition Comparison Table
    if (comparisonResult.definitionComparisons && comparisonResult.definitionComparisons.length > 0) {
      md += `## 3. Definition Comparison\n\n`;
      const defHeaders = ['Term', 'Document A definition', 'Document B definition', 'Scope difference'];
      const defRows = comparisonResult.definitionComparisons.map((def) => [
        def.term,
        def.leftDefinition ? `${def.leftDefinition} (p.${def.leftPage})` : '—',
        def.rightDefinition ? `${def.rightDefinition} (p.${def.rightPage})` : '—',
        def.keyDifferences || def.alignment.replace(/_/g, ' '),
      ]);
      md += generateMarkdownTable(defHeaders, defRows) + '\n\n';
    }

    // 4. Topic Overlap Table
    if (comparisonResult.topicOverlap) {
      md += `## 4. Topic Overlap (Jaccard Index: ${comparisonResult.topicOverlap.overlapPercentage}%)\n\n`;
      const topicHeaders = ['Topic', 'In A', 'In B', 'Shared', 'Jaccard Similarity'];
      const topicRows: string[][] = [];

      for (const t of comparisonResult.topicOverlap.sharedTopics) {
        topicRows.push([
          t.topicName,
          `Yes (p.${t.leftPage})`,
          `Yes (p.${t.rightPage})`,
          'Yes',
          `${comparisonResult.topicOverlap.overlapPercentage}%`,
        ]);
      }
      for (const t of comparisonResult.topicOverlap.uniqueToLeft) {
        topicRows.push([
          t.topicName,
          `Yes (p.${t.leftPage})`,
          'No',
          'No',
          `${comparisonResult.topicOverlap.overlapPercentage}%`,
        ]);
      }
      for (const t of comparisonResult.topicOverlap.uniqueToRight) {
        topicRows.push([
          t.topicName,
          'No',
          `Yes (p.${t.rightPage})`,
          'No',
          `${comparisonResult.topicOverlap.overlapPercentage}%`,
        ]);
      }
      md += generateMarkdownTable(topicHeaders, topicRows) + '\n\n';
    }

    // 5. Content Differences Table
    if (comparisonResult.changes && comparisonResult.changes.length > 0) {
      md += `## 5. Content Differences (${comparisonResult.changes.length} Clauses)\n\n`;
      const diffHeaders = ['Change type', 'Document A clause (page)', 'Document B clause (page)'];
      const diffRows = comparisonResult.changes.map((c) => [
        c.type === 'addition' ? 'Added' : c.type === 'removal' ? 'Removed' : 'Modified',
        c.leftText ? `${c.leftText} (p.${c.leftPage || 1})` : '—',
        c.rightText ? `${c.rightText} (p.${c.rightPage || 1})` : '—',
      ]);
      md += generateMarkdownTable(diffHeaders, diffRows) + '\n\n';
    }

    return md;
  };

  // Standard Markdown export
  const handleExportMarkdown = () => {
    if (!comparisonResult || !leftDoc || !rightDoc) return;
    const exportDate = new Date();
    let md = buildBaseMarkdownReport(exportDate);
    md += generateMarkdownFooter(exportDate);

    const filename = generateExportFilename(
      'comparison',
      leftDoc.originalName,
      rightDoc.originalName,
      'md',
      exportDate
    );

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice('Comparison report downloaded as Markdown.');
    setTimeout(() => setExportNotice(null), 4000);
  };

  // Markdown ZIP Archive with figures
  const handleExportMarkdownWithFigures = async (chosenFigures: ExportableFigure[]) => {
    if (!comparisonResult || !leftDoc || !rightDoc) return;
    try {
      const exportDate = new Date();
      const baseMd = buildBaseMarkdownReport(exportDate);
      const { markdown: mdWithFigures, figureRefs } = buildMarkdownWithFigures(baseMd, chosenFigures);
      const finalMd = mdWithFigures + generateMarkdownFooter(exportDate);

      const figureEntries: Array<{ filename: string; blob: Blob }> = [];
      for (const ref of figureRefs) {
        const blob = ref.figure.imageBlob || ref.figure.thumbnailBlob;
        if (blob) {
          figureEntries.push({
            filename: ref.filename,
            blob,
          });
        }
      }

      const zipBlob = await createComparisonZipArchive(finalMd, figureEntries);
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      const cleanA = leftDoc.originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanB = rightDoc.originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = exportDate.toISOString().slice(0, 10);
      link.download = `doculens_comparison_${cleanA}_vs_${cleanB}_with_figures_${dateStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportNotice(`Comparison report with ${chosenFigures.length} figure(s) downloaded as ZIP.`);
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: any) {
      console.error('ZIP export error:', err);
      setExportNotice('Failed to export ZIP with figures: ' + (err?.message || 'unknown error'));
      setTimeout(() => setExportNotice(null), 5000);
    }
  };

  // Export comparison report as a professional, light, print-friendly PDF with autotable
  const handleExportPDF = async (chosenFiguresArg?: any) => {
    const chosenFigures: ExportableFigure[] | undefined = Array.isArray(chosenFiguresArg)
      ? chosenFiguresArg
      : undefined;
    if (!comparisonResult || !leftDoc || !rightDoc) return;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;
      const exportDate = new Date();

      const logoDataUrl = await getLogoDataUrl();
      const modeLabel = activeMode
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      // 1. Branded Header on first page
      let currentY = renderPDFHeader(
        doc,
        'Document Comparison Report',
        {
          docA: leftDoc.originalName,
          docB: rightDoc.originalName,
          mode: modeLabel,
          date: exportDate,
          pageCountA: leftDoc.pageCount,
          pageCountB: rightDoc.pageCount,
        },
        logoDataUrl
      );

      const checkAddSectionTitle = (title: string, neededHeight = 45) => {
        if (currentY + neededHeight > pageHeight - 45) {
          doc.addPage();
          currentY = 36;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(15, 18, 23);
        doc.text(title, margin, currentY);
        currentY += 8;
      };

      // 2. Summary Table at the top of the report
      checkAddSectionTitle('1. Executive Comparison Summary');
      const diffCount = comparisonResult.changes?.length || (comparisonResult.statistics.added + comparisonResult.statistics.removed + comparisonResult.statistics.modified);
      autoTable(
        doc,
        getStandardAutoTableOptions(currentY, contentWidth, {
          head: [['Metric', 'Value', 'Details']],
          body: [
            ['Concept Matches', String(comparisonResult.conceptMatches?.length || 0), 'Cross-vocabulary semantic alignments mapped'],
            ['Content Differences', `${diffCount} clauses`, `${comparisonResult.statistics.added} additions, ${comparisonResult.statistics.removed} removals, ${comparisonResult.statistics.modified} modifications`],
            ['Shared Topics', `${comparisonResult.topicOverlap?.sharedTopics.length || 0} topics`, `${comparisonResult.topicOverlap?.uniqueToLeft.length || 0} in A, ${comparisonResult.topicOverlap?.uniqueToRight.length || 0} in B`],
            ['Similarity Score', `${comparisonResult.topicOverlap?.overlapPercentage || 0}%`, 'Jaccard vocabulary overlap index'],
          ],
          columnStyles: {
            0: { cellWidth: 130, fontStyle: 'bold' },
            1: { cellWidth: 120 },
            2: { cellWidth: 273.28 },
          },
        })
      );
      currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;

      // 3. Concept Comparison Table
      if (comparisonResult.conceptMatches && comparisonResult.conceptMatches.length > 0) {
        checkAddSectionTitle('2. Concept Comparison (Cross-Vocabulary Alignment)');
        const conceptRows = comparisonResult.conceptMatches.map((cpt) => [
          cpt.conceptTitle,
          `"${cpt.leftExcerpt}" (p.${cpt.leftPage})`,
          `"${cpt.rightExcerpt}" (p.${cpt.rightPage})`,
          cpt.relationshipType.replace(/_/g, ' '),
          cpt.confidenceLabel || `${Math.round(cpt.confidence * 100)}%`,
        ]);
        autoTable(
          doc,
          getStandardAutoTableOptions(currentY, contentWidth, {
            head: [['Concept', 'Document A (quote, page)', 'Document B (quote, page)', 'Relationship', 'Confidence']],
            body: conceptRows,
            columnStyles: {
              0: { cellWidth: 90, fontStyle: 'bold' },
              1: { cellWidth: 160 },
              2: { cellWidth: 160 },
              3: { cellWidth: 65 },
              4: { cellWidth: 48.28 },
            },
          })
        );
        currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;
      }

      // 4. Definition Comparison Table
      if (comparisonResult.definitionComparisons && comparisonResult.definitionComparisons.length > 0) {
        checkAddSectionTitle('3. Definition Comparison');
        const defRows = comparisonResult.definitionComparisons.map((def) => [
          def.term,
          def.leftDefinition ? `${def.leftDefinition} (p.${def.leftPage})` : '—',
          def.rightDefinition ? `${def.rightDefinition} (p.${def.rightPage})` : '—',
          def.keyDifferences || def.alignment.replace(/_/g, ' '),
        ]);
        autoTable(
          doc,
          getStandardAutoTableOptions(currentY, contentWidth, {
            head: [['Term', 'Document A definition', 'Document B definition', 'Scope difference']],
            body: defRows,
            columnStyles: {
              0: { cellWidth: 100, fontStyle: 'bold' },
              1: { cellWidth: 155 },
              2: { cellWidth: 155 },
              3: { cellWidth: 113.28 },
            },
          })
        );
        currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;
      }

      // 5. Topic Overlap Table
      if (comparisonResult.topicOverlap) {
        checkAddSectionTitle(`4. Topic Overlap (Jaccard Index: ${comparisonResult.topicOverlap.overlapPercentage}%)`);
        const topicRows: string[][] = [];
        for (const t of comparisonResult.topicOverlap.sharedTopics) {
          topicRows.push([
            t.topicName,
            `Yes (p.${t.leftPage})`,
            `Yes (p.${t.rightPage})`,
            'Yes',
            `${comparisonResult.topicOverlap.overlapPercentage}%`,
          ]);
        }
        for (const t of comparisonResult.topicOverlap.uniqueToLeft) {
          topicRows.push([
            t.topicName,
            `Yes (p.${t.leftPage})`,
            'No',
            'No',
            `${comparisonResult.topicOverlap.overlapPercentage}%`,
          ]);
        }
        for (const t of comparisonResult.topicOverlap.uniqueToRight) {
          topicRows.push([
            t.topicName,
            'No',
            `Yes (p.${t.rightPage})`,
            'No',
            `${comparisonResult.topicOverlap.overlapPercentage}%`,
          ]);
        }
        autoTable(
          doc,
          getStandardAutoTableOptions(currentY, contentWidth, {
            head: [['Topic', 'In A', 'In B', 'Shared', 'Jaccard Similarity']],
            body: topicRows,
            columnStyles: {
              0: { cellWidth: 160, fontStyle: 'bold' },
              1: { cellWidth: 90 },
              2: { cellWidth: 90 },
              3: { cellWidth: 65 },
              4: { cellWidth: 118.28 },
            },
          })
        );
        currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;
      }

      // 6. Content Differences Table
      if (comparisonResult.changes && comparisonResult.changes.length > 0) {
        checkAddSectionTitle(`5. Content Differences (${comparisonResult.changes.length} Clauses)`);
        const diffRows = comparisonResult.changes.map((c) => [
          c.type === 'addition' ? 'Added' : c.type === 'removal' ? 'Removed' : 'Modified',
          c.leftText ? `${c.leftText} (p.${c.leftPage || 1})` : '—',
          c.rightText ? `${c.rightText} (p.${c.rightPage || 1})` : '—',
        ]);
        autoTable(
          doc,
          getStandardAutoTableOptions(currentY, contentWidth, {
            head: [['Change type', 'Document A clause (page)', 'Document B clause (page)']],
            body: diffRows,
            columnStyles: {
              0: { cellWidth: 75, fontStyle: 'bold' },
              1: { cellWidth: 224.14 },
              2: { cellWidth: 224.14 },
            },
          })
        );
        currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;
      }

      // 7. Visual Figures & Exhibits (scaled to page width, never split across pages)
      if (chosenFigures && chosenFigures.length > 0) {
        checkAddSectionTitle(`6. Visual Figures & Exhibits (${chosenFigures.length} Figures)`);

        for (const fig of chosenFigures) {
          try {
            const blob = fig.imageBlob || fig.thumbnailBlob;
            if (!blob) continue;
            const dataUrl = await blobToDataUrl(blob);
            const origW = fig.width || 600;
            const origH = fig.height || 400;

            const targetWidth = Math.min(contentWidth, origW);
            const targetHeight = (targetWidth / origW) * origH;

            const maxHeight = pageHeight - margin * 2 - 55;
            let finalW = targetWidth;
            let finalH = targetHeight;
            if (finalH > maxHeight) {
              finalH = maxHeight;
              finalW = (finalH / targetHeight) * targetWidth;
            }

            // Never split across pages: add new page if insufficient space
            const splitCheck = checkFigureSplitAndAddPage(currentY, finalH + 30, pageHeight, margin, margin);
            if (splitCheck.shouldAddPage) {
              doc.addPage();
              currentY = splitCheck.nextY;
            }

            // Figure Label & Caption
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(15, 18, 23);
            const captionLabel = fig.captionLabel || 'Figure';
            const captionText = fig.caption ? `: ${fig.caption}` : '';
            const docProvenance = ` (${fig.docLabel}, page ${fig.pageNumber})`;
            doc.text(`${captionLabel}${captionText}${docProvenance}`, margin, currentY);
            currentY += 12;

            // Center image horizontally within printable content area
            const imgX = margin + (contentWidth - finalW) / 2;
            doc.addImage(dataUrl, 'PNG', imgX, currentY, finalW, finalH);
            currentY += finalH + 20;
          } catch (figErr) {
            console.debug('PDF figure embedding notice:', figErr);
          }
        }
      }

      // 8. Footer on EVERY page
      renderPDFFooters(doc, exportDate);

      // 9. Download with standardized filename
      const filename = generateExportFilename(
        'comparison',
        leftDoc.originalName,
        rightDoc.originalName,
        'pdf',
        exportDate
      );
      doc.save(filename);

      setExportNotice(
        chosenFigures && chosenFigures.length > 0
          ? `Comparison report with ${chosenFigures.length} figure(s) downloaded as PDF.`
          : 'Comparison report downloaded as PDF.'
      );
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: any) {
      console.error('PDF report generation error:', err);
      setExportNotice('Failed to generate PDF report: ' + (err?.message || 'unknown error'));
      setTimeout(() => setExportNotice(null), 5000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="border-b border-paper-border pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-ink">
            Intelligent Document Comparison Workspace
          </h1>
        </div>

        {/* Export dropdown menu */}
        <div className="flex items-center gap-2 shrink-0">
          <ExportMenu
            disabled={!comparisonResult}
            disabledTooltip={!comparisonResult ? 'Select two documents to enable comparison export' : undefined}
            items={[
              {
                label: 'PDF report',
                hint: 'Formatted PDF with tables and branding',
                icon: <FileDown className="w-4 h-4 text-accent" />,
                onClick: handleExportPDF,
              },
              {
                label: 'PDF report (Include figures)...',
                hint: 'Embed selected figures from Doc A & B',
                icon: <ImageIcon className="w-4 h-4 text-accent" />,
                onClick: () => handleOpenFigureModal('pdf'),
              },
              {
                label: 'Markdown summary',
                hint: 'Pipe tables and document metadata',
                icon: <Download className="w-4 h-4 text-ink-faint" />,
                onClick: handleExportMarkdown,
              },
              {
                label: 'Markdown archive (Include figures)...',
                hint: 'Downloads .zip with Markdown & ./doculens_figures/',
                icon: <Archive className="w-4 h-4 text-emerald-400" />,
                onClick: () => handleOpenFigureModal('zip'),
              },
            ]}
          />
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-md text-[13px]">
          {exportNotice}
        </div>
      )}

      {/* Document Selection Toolbar */}
      <div className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Select Two Documents to Compare:
          </span>
          <span className="text-xs text-ink-faint font-mono">
            {readyDocs.length} ready documents in library
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
          {/* Document A Selector (Reference) */}
          <div className="md:col-span-5 p-4 bg-paper border border-paper-border rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-accent font-bold uppercase tracking-wider">
                Document A — Reference Document:
              </span>
              {leftDoc && (
                <span className="text-xs font-mono text-ink-faint">
                  {leftDoc.pageCount}p · {leftDoc.chunkCount} chunks
                </span>
              )}
            </div>

            <select
              value={leftDocId}
              onChange={(e) => setLeftDocId(e.target.value)}
              aria-label="Document A — Reference Document"
              className="w-full text-[13px] font-sans font-medium bg-paper-light border border-paper-border hover:border-accent rounded-md px-3 py-2 min-h-[36px] text-ink focus:border-accent transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {readyDocs.map((d) => (
                <option key={d.id} value={d.id} className="bg-paper-light text-ink">
                  {d.originalName} ({d.pageCount}p)
                </option>
              ))}
            </select>

            {leftDoc?.summary && (
              <p className="text-xs text-ink-muted line-clamp-2 italic font-serif leading-relaxed">
                "{leftDoc.summary}"
              </p>
            )}
          </div>

          {/* Swap Action Button */}
          <div className="md:col-span-1 flex justify-center py-1">
            <button
              onClick={handleSwap}
              title="Swap Document A and Document B"
              aria-label="Swap Document A and Document B"
              className="p-2.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-paper border border-paper-border hover:border-accent text-ink-muted hover:text-accent shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Document B Selector (Comparison) */}
          <div className="md:col-span-5 p-4 bg-paper border border-paper-border rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-ink-muted font-bold uppercase tracking-wider">
                Document B — Comparison Document:
              </span>
              {rightDoc && (
                <span className="text-xs font-mono text-ink-faint">
                  {rightDoc.pageCount}p · {rightDoc.chunkCount} chunks
                </span>
              )}
            </div>

            <select
              value={rightDocId}
              onChange={(e) => setRightDocId(e.target.value)}
              aria-label="Document B — Comparison Document"
              className="w-full text-[13px] font-sans font-medium bg-paper-light border border-paper-border hover:border-accent rounded-md px-3 py-2 min-h-[36px] text-ink focus:border-accent transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {readyDocs.map((d) => (
                <option key={d.id} value={d.id} className="bg-paper-light text-ink">
                  {d.originalName} ({d.pageCount}p)
                </option>
              ))}
            </select>

            {rightDoc?.summary && (
              <p className="text-xs text-ink-muted line-clamp-2 italic font-serif leading-relaxed">
                "{rightDoc.summary}"
              </p>
            )}
          </div>
        </div>

        {/* Warning if same document selected */}
        {leftDocId === rightDocId && (
          <div className="text-[13px] text-amber-300 bg-amber-500/10 p-3.5 rounded-md border border-amber-500/30 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Please select two distinct documents above to execute a cross-document comparison.
            </span>
          </div>
        )}
      </div>

      {/* Comparison Mode Selector Tabs */}
      {comparisonResult && (
        <div className="border-b border-paper-border">
          <div className="flex items-center gap-2 overflow-x-auto pb-px" role="tablist">
            {[
              {
                id: 'concept-comparison' as ComparisonMode,
                label: 'Concept Comparison',
                icon: Lightbulb,
                badge: comparisonResult.conceptMatches?.length || 0,
                desc: 'Passages discussing the same subject with different words',
              },
              {
                id: 'definition-comparison' as ComparisonMode,
                label: 'Definition Comparison',
                icon: BookMarked,
                badge: comparisonResult.definitionComparisons?.length || 0,
                desc: 'Compare extracted term definitions and algorithmic rules',
              },
              {
                id: 'topic-overlap' as ComparisonMode,
                label: 'Topic Overlap',
                icon: PieChart,
                badge: `${comparisonResult.topicOverlap?.overlapPercentage || 0}%`,
                desc: 'Shared subjects vs unique coverage breakdown',
              },
              {
                id: 'content-diff' as ComparisonMode,
                label: 'Content Differences',
                icon: GitCompare,
                badge: comparisonResult.changes.length,
                desc: 'Clause additions, removals, and modifications',
              },
            ].map((mode) => {
              const Icon = mode.icon;
              const isActive = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id)}
                  role="tab"
                  aria-selected={isActive}
                  className={`flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-[13px] font-sans font-medium rounded-t-md border-b-2 transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isActive
                      ? 'border-accent bg-paper-light text-accent font-semibold'
                      : 'border-transparent text-ink-muted hover:text-ink hover:bg-paper-dim'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-ink-faint'}`} />
                  <span>{mode.label}</span>
                  <span
                    className={`font-mono text-xs px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-accent-subtle text-accent border border-accent-border' : 'bg-paper text-ink-muted'
                    }`}
                  >
                    {mode.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty / Unselected State */}
      {!comparisonResult && (
        <div className="border border-paper-border bg-paper-light rounded-lg p-8 sm:p-12 text-center text-ink-muted space-y-4 shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-full bg-paper border border-paper-border p-3 flex items-center justify-center shadow-xs">
            <img
              src="/doculens-mark-transparent.png"
              alt="DocuLens Compare"
              className="w-full h-full object-contain"
            />
          </div>
          <p className="font-serif text-xl font-medium text-ink">
            Select Two Documents to Initiate Comparison
          </p>
          <p className="text-[13px] max-w-md mx-auto text-ink-muted leading-relaxed">
            Select Reference Document A and Comparison Document B above to explore concept
            alignments, differing terminology, rule definitions, and structural changes.
          </p>
        </div>
      )}

      {/* MODE 1: CONCEPT COMPARISON WORKSPACE */}
      {comparisonResult && activeMode === 'concept-comparison' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-paper-light border border-paper-border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-accent" />
              <span className="font-medium text-ink">
                Cross-Vocabulary Concept Matches ({comparisonResult.conceptMatches?.length || 0} found)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-ink-faint text-xs">Filter Relationship:</span>
              <select
                value={conceptFilter}
                onChange={(e) => setConceptFilter(e.target.value)}
                className="bg-paper border border-paper-border rounded-md px-3 py-1.5 min-h-[36px] text-[13px] text-ink focus:border-accent transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="all" className="bg-paper-light text-ink">All Relationships</option>
                <option value="synonymous_terminology" className="bg-paper-light text-ink">Synonymous Terminology</option>
                <option value="overlapping_definition" className="bg-paper-light text-ink">Overlapping Definition</option>
                <option value="differing_perspective" className="bg-paper-light text-ink">Differing Perspective</option>
                <option value="possible_relationship" className="bg-paper-light text-ink">Possible Relationship</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {filteredConcepts.length === 0 ? (
              <div className="border border-paper-border bg-paper-light rounded-lg p-10 text-center text-ink-muted space-y-2">
                <Info className="w-6 h-6 mx-auto text-ink-faint" />
                <p className="font-serif text-ink">No concepts match the selected filter.</p>
              </div>
            ) : (
              filteredConcepts.map((cpt) => {
                const isSynonym = cpt.relationshipType === 'synonymous_terminology';
                const isPerspective = cpt.relationshipType === 'differing_perspective';
                const isOverlap = cpt.relationshipType === 'overlapping_definition';

                return (
                  <div
                    key={cpt.id}
                    className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-4 shadow-xs hover:border-paper-border-dark transition-all duration-150"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-paper-border pb-3 text-[13px]">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-serif font-bold text-base text-ink">
                          {cpt.conceptTitle}
                        </span>
                        {cpt.category && (
                          <span className="font-mono text-xs bg-paper border border-paper-border text-ink-muted px-2 py-0.5 rounded">
                            {cpt.category}
                          </span>
                        )}
                        <span
                          className={`font-mono text-xs px-2.5 py-0.5 rounded font-semibold ${
                            cpt.confidenceLabel === 'High Confidence'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : cpt.confidenceLabel === 'Moderate Confidence'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-paper text-ink-muted border border-paper-border'
                          }`}
                        >
                          {cpt.confidenceLabel} ({Math.round(cpt.confidence * 100)}%)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded border ${
                            isSynonym
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : isPerspective
                              ? 'border-accent-border bg-accent-subtle text-accent'
                              : isOverlap
                              ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                              : 'border-paper-border bg-paper text-ink-muted'
                          }`}
                        >
                          {cpt.relationshipType.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Side-by-side Evidence Passages */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] font-serif leading-relaxed">
                      {/* Document A Passage */}
                      <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono text-ink-muted border-b border-paper-border pb-2">
                          <span className="font-semibold text-accent truncate max-w-[200px]">
                            Doc A: {leftDoc?.originalName}
                          </span>
                          <button
                            onClick={() =>
                              onNavigateToReader(leftDoc!.id, cpt.leftPage, cpt.conceptTitle)
                            }
                            className="flex items-center gap-1 text-xs text-ink hover:text-accent font-sans transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-accent" />
                            <span>Page {cpt.leftPage}</span>
                          </button>
                        </div>
                        <p className="text-ink">"{cpt.leftExcerpt}"</p>
                      </div>

                      {/* Document B Passage */}
                      <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono text-ink-muted border-b border-paper-border pb-2">
                          <span className="font-semibold text-ink truncate max-w-[200px]">
                            Doc B: {rightDoc?.originalName}
                          </span>
                          <button
                            onClick={() =>
                              onNavigateToReader(rightDoc!.id, cpt.rightPage, cpt.conceptTitle)
                            }
                            className="flex items-center gap-1 text-xs text-ink hover:text-accent font-sans transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-accent" />
                            <span>Page {cpt.rightPage}</span>
                          </button>
                        </div>
                        <p className="text-ink">"{cpt.rightExcerpt}"</p>
                      </div>
                    </div>

                    {/* Nuance & Distinction Commentary */}
                    <div className="p-3.5 bg-paper rounded-md border border-paper-border text-xs space-y-1 font-sans">
                      <div className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-accent" />
                        <span>Semantic Nuance & Preserved Distinctions:</span>
                      </div>
                      <p className="text-ink-muted leading-relaxed">{cpt.nuanceNotes}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MODE 2: DEFINITION COMPARISON WORKSPACE */}
      {comparisonResult && activeMode === 'definition-comparison' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-paper-light border border-paper-border rounded-lg flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-accent" />
              <span className="font-medium text-ink">
                Side-by-Side Term Definitions & Criteria ({comparisonResult.definitionComparisons?.length || 0} terms)
              </span>
            </div>
            <span className="text-xs text-ink-faint font-mono">
              Extracted directly from source text
            </span>
          </div>

          <div className="space-y-4">
            {(!comparisonResult.definitionComparisons ||
              comparisonResult.definitionComparisons.length === 0) && (
              <div className="border border-paper-border bg-paper-light rounded-lg p-10 text-center text-ink-muted">
                <p className="font-serif text-ink">No explicit definitions found in these documents.</p>
              </div>
            )}

            {comparisonResult.definitionComparisons?.map((def) => {
              const isConsistent = def.alignment === 'consistent';
              const isDifferingScope = def.alignment === 'differing_scope';
              const isConflicting = def.alignment === 'conflicting';

              return (
                <div
                  key={def.id}
                  className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-4 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-paper-border pb-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-lg text-ink">
                        {def.term}
                      </span>
                    </div>

                    <div>
                      <span
                        className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded border uppercase ${
                          isConsistent
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : isDifferingScope
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : isConflicting
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'bg-paper border-paper-border text-ink-muted'
                        }`}
                      >
                        {def.alignment.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Side-by-Side Definitions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] font-serif leading-relaxed">
                    {/* Left Def */}
                    <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-ink-muted border-b border-paper-border pb-2">
                        <span className="font-semibold text-accent">Doc A Definition</span>
                        {def.leftPage && (
                          <button
                            onClick={() =>
                              onNavigateToReader(leftDoc!.id, def.leftPage!, def.term)
                            }
                            className="flex items-center gap-1 text-xs text-ink hover:text-accent font-sans transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-accent" />
                            <span>Page {def.leftPage}</span>
                          </button>
                        )}
                      </div>
                      {def.leftDefinition ? (
                        <p className="text-ink">"{def.leftDefinition}"</p>
                      ) : (
                        <p className="text-ink-faint italic font-sans">[Not defined in Document A]</p>
                      )}
                    </div>

                    {/* Right Def */}
                    <div className="p-4 bg-paper border border-paper-border rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-ink-muted border-b border-paper-border pb-2">
                        <span className="font-semibold text-ink">Doc B Definition</span>
                        {def.rightPage && (
                          <button
                            onClick={() =>
                              onNavigateToReader(rightDoc!.id, def.rightPage!, def.term)
                            }
                            className="flex items-center gap-1 text-xs text-ink hover:text-accent font-sans transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-accent" />
                            <span>Page {def.rightPage}</span>
                          </button>
                        )}
                      </div>
                      {def.rightDefinition ? (
                        <p className="text-ink">"{def.rightDefinition}"</p>
                      ) : (
                        <p className="text-ink-faint italic font-sans">[Not defined in Document B]</p>
                      )}
                    </div>
                  </div>

                  {/* Key Similarities & Differences */}
                  {(def.keySimilarities || def.keyDifferences) && (
                    <div className="p-3.5 bg-paper border border-paper-border rounded-lg space-y-1.5 text-xs font-sans">
                      {def.keySimilarities && (
                        <p className="text-ink-muted">
                          <strong className="text-ink font-semibold">Key Similarities:</strong>{' '}
                          {def.keySimilarities}
                        </p>
                      )}
                      {def.keyDifferences && (
                        <p className="text-accent">
                          <strong className="text-accent font-semibold">Meaningful Distinctions:</strong>{' '}
                          {def.keyDifferences}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 3: TOPIC OVERLAP WORKSPACE */}
      {comparisonResult && activeMode === 'topic-overlap' && (
        <div className="space-y-6">
          {/* Overlap Index Bar */}
          {comparisonResult.topicOverlap && (
            <div className="border border-paper-border bg-paper-light rounded-lg p-5 space-y-3.5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-serif font-bold text-base text-ink">
                    Topic Overlap Index: {comparisonResult.topicOverlap.overlapPercentage}%
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {comparisonResult.topicOverlap.calculationMethod}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="font-mono text-2xl font-bold text-accent">
                    {comparisonResult.topicOverlap.jaccardSimilarity}
                  </span>
                  <span className="text-xs text-ink-faint block font-mono">
                    Jaccard Similarity
                  </span>
                </div>
              </div>

              {/* Progress visual */}
              <div className="w-full bg-paper h-2.5 rounded-full overflow-hidden border border-paper-border">
                <div
                  className="bg-accent h-full transition-all duration-500"
                  style={{ width: `${comparisonResult.topicOverlap.overlapPercentage}%` }}
                />
              </div>

              <p className="text-xs text-ink-faint italic font-sans border-t border-paper-border pt-2.5">
                Note on limitations: {comparisonResult.topicOverlap.limitations}
              </p>
            </div>
          )}

          {/* Three Column Matrix: Shared vs Unique A vs Unique B */}
          {comparisonResult.topicOverlap && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Shared Topics */}
              <div className="border border-paper-border bg-paper-light rounded-lg p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-paper-border pb-2.5 text-xs">
                  <span className="font-semibold text-emerald-400 uppercase font-mono">
                    Shared Subjects ({comparisonResult.topicOverlap.sharedTopics.length})
                  </span>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>

                <div className="space-y-2.5">
                  {comparisonResult.topicOverlap.sharedTopics.length === 0 ? (
                    <p className="text-xs text-ink-faint text-center py-4">No shared topics identified.</p>
                  ) : (
                    comparisonResult.topicOverlap.sharedTopics.map((top) => (
                      <div
                        key={top.id}
                        className="p-3.5 bg-paper border border-paper-border rounded-md text-xs space-y-1.5"
                      >
                        <span className="font-serif font-bold text-ink block text-[13px]">
                          {top.topicName}
                        </span>
                        <p className="text-ink-muted text-xs font-sans leading-relaxed">{top.contextSummary}</p>
                        <div className="flex items-center gap-2 pt-1.5 border-t border-paper-border">
                          {top.leftPage && (
                            <button
                              onClick={() =>
                                onNavigateToReader(leftDoc!.id, top.leftPage!, top.topicName)
                              }
                              className="text-xs text-accent font-mono hover:underline"
                            >
                              Doc A p.{top.leftPage}
                            </button>
                          )}
                          <span className="text-ink-faint">·</span>
                          {top.rightPage && (
                            <button
                              onClick={() =>
                                onNavigateToReader(rightDoc!.id, top.rightPage!, top.topicName)
                              }
                              className="text-xs text-ink font-mono hover:underline"
                            >
                              Doc B p.{top.rightPage}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Unique to Doc A */}
              <div className="border border-paper-border bg-paper-light rounded-lg p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-paper-border pb-2.5 text-xs">
                  <span className="font-semibold text-accent uppercase font-mono">
                    Only in Doc A ({comparisonResult.topicOverlap.uniqueToLeft.length})
                  </span>
                  <MinusCircle className="w-4 h-4 text-accent" />
                </div>

                <div className="space-y-2.5">
                  {comparisonResult.topicOverlap.uniqueToLeft.length === 0 ? (
                    <p className="text-xs text-ink-faint text-center py-4">No unique topics in Doc A.</p>
                  ) : (
                    comparisonResult.topicOverlap.uniqueToLeft.map((top) => (
                      <div
                        key={top.id}
                        className="p-3.5 bg-paper border border-paper-border rounded-md text-xs space-y-1.5"
                      >
                        <span className="font-serif font-bold text-ink block text-[13px]">
                          {top.topicName}
                        </span>
                        <p className="text-ink-muted text-xs font-sans leading-relaxed">{top.contextSummary}</p>
                        {top.leftPage && (
                          <button
                            onClick={() =>
                              onNavigateToReader(leftDoc!.id, top.leftPage!, top.topicName)
                            }
                            className="text-xs text-accent font-mono hover:underline block pt-1.5 border-t border-paper-border"
                          >
                            Inspect in Doc A (Page {top.leftPage})
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Unique to Doc B */}
              <div className="border border-paper-border bg-paper-light rounded-lg p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-paper-border pb-2.5 text-xs">
                  <span className="font-semibold text-emerald-400 uppercase font-mono">
                    Only in Doc B ({comparisonResult.topicOverlap.uniqueToRight.length})
                  </span>
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                </div>

                <div className="space-y-2.5">
                  {comparisonResult.topicOverlap.uniqueToRight.length === 0 ? (
                    <p className="text-xs text-ink-faint text-center py-4">No unique topics in Doc B.</p>
                  ) : (
                    comparisonResult.topicOverlap.uniqueToRight.map((top) => (
                      <div
                        key={top.id}
                        className="p-3.5 bg-paper border border-paper-border rounded-md text-xs space-y-1.5"
                      >
                        <span className="font-serif font-bold text-ink block text-[13px]">
                          {top.topicName}
                        </span>
                        <p className="text-ink-muted text-xs font-sans leading-relaxed">{top.contextSummary}</p>
                        {top.rightPage && (
                          <button
                            onClick={() =>
                              onNavigateToReader(rightDoc!.id, top.rightPage!, top.topicName)
                            }
                            className="text-xs text-emerald-400 font-mono hover:underline block pt-1.5 border-t border-paper-border"
                          >
                            Inspect in Doc B (Page {top.rightPage})
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 4: CONTENT DIFFERENCES (REVISION DIFF) */}
      {comparisonResult && activeMode === 'content-diff' && (
        <div className="space-y-4">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-paper-light border border-paper-border rounded-lg text-xs space-y-1">
              <span className="text-xs text-ink-muted flex items-center gap-1.5">
                <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Additions (Doc B)</span>
              </span>
              <div className="text-xl font-mono font-bold text-emerald-400">
                +{comparisonResult.statistics.added}
              </div>
            </div>

            <div className="p-3.5 bg-paper-light border border-paper-border rounded-lg text-xs space-y-1">
              <span className="text-xs text-ink-muted flex items-center gap-1.5">
                <MinusCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Removals (Doc A)</span>
              </span>
              <div className="text-xl font-mono font-bold text-red-400">
                -{comparisonResult.statistics.removed}
              </div>
            </div>

            <div className="p-3.5 bg-paper-light border border-paper-border rounded-lg text-xs space-y-1">
              <span className="text-xs text-ink-muted flex items-center gap-1.5">
                <FileEdit className="w-3.5 h-3.5 text-accent" />
                <span>Modifications</span>
              </span>
              <div className="text-xl font-mono font-bold text-accent">
                ~{comparisonResult.statistics.modified}
              </div>
            </div>

            <div className="p-3.5 bg-paper-light border border-paper-border rounded-lg text-xs space-y-1">
              <span className="text-xs text-ink-muted flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-ink-faint" />
                <span>Unchanged</span>
              </span>
              <div className="text-xl font-mono font-bold text-ink-faint">
                ={comparisonResult.statistics.identical}
              </div>
            </div>
          </div>

          {/* Filter segment tabs */}
          <div className="flex items-center gap-2 overflow-x-auto text-[13px] pb-1">
            <div className="flex items-center gap-1.5 text-ink-muted mr-2">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </div>
            {(['all', 'modification', 'addition', 'removal', 'unchanged'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDiffFilter(type)}
                className={`px-3 py-1.5 min-h-[36px] rounded-md border capitalize transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  diffFilter === type
                    ? 'border-accent bg-accent-subtle text-accent font-semibold'
                    : 'border-paper-border bg-paper text-ink-muted hover:text-ink hover:bg-paper-dim'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Change Entries */}
          <div className="space-y-4">
            {filteredChanges.length === 0 ? (
              <div className="border border-paper-border bg-paper-light rounded-lg p-10 text-center text-ink-muted">
                <p className="font-serif text-ink">No changes match the selected filter.</p>
              </div>
            ) : (
              filteredChanges.map((change) => {
                const isAdd = change.type === 'addition';
                const isRem = change.type === 'removal';
                const isMod = change.type === 'modification';

                return (
                  <div
                    key={change.id}
                    className={`border rounded-lg p-5 space-y-3.5 transition-all duration-150 shadow-xs ${
                      isAdd
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : isRem
                        ? 'border-red-500/30 bg-red-500/10'
                        : isMod
                        ? 'border-accent-border bg-paper-light'
                        : 'border-paper-border bg-paper-light'
                    }`}
                  >
                    {/* Header info */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isAdd && (
                          <span className="font-mono text-emerald-400 font-bold uppercase text-xs">
                            [+ Addition]
                          </span>
                        )}
                        {isRem && (
                          <span className="font-mono text-red-400 font-bold uppercase text-xs">
                            [- Removal]
                          </span>
                        )}
                        {isMod && (
                          <span className="font-mono text-accent font-bold uppercase text-xs">
                            [~ Modification]
                          </span>
                        )}
                        {!isAdd && !isRem && !isMod && (
                          <span className="font-mono text-ink-faint uppercase text-xs">
                            [= Unchanged]
                          </span>
                        )}

                        <span className="text-ink-faint">·</span>
                        <span className="font-medium text-ink">{change.summary}</span>
                      </div>

                      {/* Jump buttons */}
                      <div className="flex items-center gap-3">
                        {change.leftPage && leftDoc && (
                          <button
                            onClick={() =>
                              onNavigateToReader(leftDoc.id, change.leftPage!, change.summary)
                            }
                            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-accent transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-accent" />
                            <span>Doc A p.{change.leftPage}</span>
                          </button>
                        )}
                        {change.rightPage && rightDoc && (
                          <button
                            onClick={() =>
                              onNavigateToReader(rightDoc.id, change.rightPage!, change.summary)
                            }
                            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-accent transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-accent" />
                            <span>Doc B p.{change.rightPage}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Side-by-side / Comparison content */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] font-serif leading-relaxed">
                      {/* Left document text */}
                      <div className="p-3.5 bg-paper border border-paper-border rounded-md space-y-1.5">
                        <div className="text-xs font-mono text-ink-faint flex justify-between">
                          <span>{leftDoc?.originalName}</span>
                          {change.leftPage && <span>Page {change.leftPage}</span>}
                        </div>
                        {change.leftText ? (
                          <p className={`text-ink ${isRem ? 'line-through text-red-400/80' : ''}`}>
                            {change.leftText}
                          </p>
                        ) : (
                          <p className="text-ink-faint italic font-sans">[Clause absent in baseline]</p>
                        )}
                      </div>

                      {/* Right document text */}
                      <div className="p-3.5 bg-paper border border-paper-border rounded-md space-y-1.5">
                        <div className="text-xs font-mono text-ink-faint flex justify-between">
                          <span>{rightDoc?.originalName}</span>
                          {change.rightPage && <span>Page {change.rightPage}</span>}
                        </div>
                        {change.rightText ? (
                          <p className={`text-ink ${isAdd ? 'text-emerald-300 font-medium' : ''}`}>
                            {change.rightText}
                          </p>
                        ) : (
                          <p className="text-ink-faint italic font-sans">[Clause deleted in revision]</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Figures Selection Export Dialog */}
      {isFigureModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#161B22] border border-[#262D38] rounded-xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#262D38]">
              <div>
                <h3 className="text-lg font-serif font-semibold text-[#E6E9EF]">
                  Include Figures in {exportTargetFormat === 'pdf' ? 'PDF Report' : 'Markdown ZIP Archive'}
                </h3>
                <p className="text-xs text-[#9AA3B2] mt-0.5">
                  Select figures from Doc A and Doc B to embed in the export (limit 20).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFigureModalOpen(false)}
                className="p-1.5 text-[#9AA3B2] hover:text-[#E6E9EF] hover:bg-[#1D242E] rounded-md transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selection stats & warnings */}
            <div className="py-3 flex items-center justify-between flex-wrap gap-2 text-xs border-b border-[#262D38]/60">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[#E6E9EF]">
                  {selectedFigureIds.size} of {availableFigures.length} selected
                  <span className="text-[#9AA3B2] ml-1">(max {MAX_EXPORT_FIGURES})</span>
                </span>
                <span className="text-[#9AA3B2]">·</span>
                <span className="font-mono text-[#9AA3B2]">
                  Total size: {calculateFiguresTotalSize(availableFigures.filter((f) => selectedFigureIds.has(f.id))).formattedSize}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllFigures}
                  className="px-2 py-1 text-xs text-[#E8A94A] hover:bg-[#E8A94A]/10 rounded border border-[#E8A94A]/30 transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllFigures}
                  className="px-2 py-1 text-xs text-[#9AA3B2] hover:bg-[#1D242E] rounded border border-[#262D38] transition-colors cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Size warning if > 5 MB */}
            {calculateFiguresTotalSize(availableFigures.filter((f) => selectedFigureIds.has(f.id))).isOverWarningThreshold && (
              <div className="my-2 p-2.5 rounded-md bg-[#E8A94A]/10 border border-[#E8A94A]/30 text-[#E8A94A] text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Size warning: Selected figures exceed 5 MB recommendation ({calculateFiguresTotalSize(availableFigures.filter((f) => selectedFigureIds.has(f.id))).formattedSize}). Export generation or archive download may take longer.
                </span>
              </div>
            )}

            {/* Limit warning notice */}
            {figureLimitNotice && (
              <div className="my-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                {figureLimitNotice}
              </div>
            )}

            {/* Figures list */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 min-h-[160px]">
              {isLoadingFigures ? (
                <div className="flex items-center justify-center h-32 text-xs text-[#9AA3B2]">
                  Loading figures from storage...
                </div>
              ) : availableFigures.length === 0 ? (
                <div className="text-center py-10 text-[#9AA3B2] text-xs">
                  No extracted figures or diagrams found in Document A or Document B.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableFigures.map((fig) => {
                    const isSelected = selectedFigureIds.has(fig.id);
                    return (
                      <div
                        key={fig.id}
                        onClick={() => handleToggleFigureSelection(fig.id)}
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? 'bg-[#E8A94A]/10 border-[#E8A94A]/50 text-[#E6E9EF]'
                            : 'bg-[#0F1217] border-[#262D38] text-[#9AA3B2] hover:border-[#343D4B]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by parent div
                          className="mt-1 accent-[#E8A94A] rounded"
                        />
                        <div className="w-14 h-14 shrink-0 rounded bg-[#161B22] border border-[#262D38] overflow-hidden flex items-center justify-center">
                          {fig.thumbnailBlob ? (
                            <img
                              src={URL.createObjectURL(fig.thumbnailBlob)}
                              alt="thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-[#9AA3B2]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#262D38] text-[#E8A94A]">
                              {fig.docLabel}
                            </span>
                            <span className="text-[11px] font-mono text-[#9AA3B2]">
                              Page {fig.pageNumber}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-[#E6E9EF] line-clamp-1">
                            {fig.captionLabel || 'Figure'}
                          </p>
                          {fig.caption && (
                            <p className="text-[11px] text-[#9AA3B2] line-clamp-2 leading-tight">
                              {fig.caption}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-[#262D38] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsFigureModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[#9AA3B2] hover:text-[#E6E9EF] hover:bg-[#1D242E] rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedFigureIds.size === 0}
                onClick={async () => {
                  const chosen = availableFigures.filter((f) => selectedFigureIds.has(f.id));
                  setIsFigureModalOpen(false);
                  if (exportTargetFormat === 'pdf') {
                    await handleExportPDF(chosen);
                  } else {
                    await handleExportMarkdownWithFigures(chosen);
                  }
                }}
                className="px-4 py-2 text-xs font-medium bg-[#E8A94A] hover:opacity-90 text-[#0F1217] rounded-md transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {exportTargetFormat === 'pdf'
                  ? `Export PDF (${selectedFigureIds.size} figure${selectedFigureIds.size === 1 ? '' : 's'})`
                  : `Download ZIP (${selectedFigureIds.size} figure${selectedFigureIds.size === 1 ? '' : 's'})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
