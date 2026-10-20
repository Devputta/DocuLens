import { describe, it, expect } from 'vitest';
import {
  compareDocuments,
  extractConceptMatches,
  extractDefinitionComparisons,
  analyzeTopicOverlap,
} from '../src/services/comparisonEngine';
import { highlightTextSegments } from '../src/services/lexicalSearch';
import { generateSampleBundles } from '../src/services/sampleDocuments';
import { DocumentEntity } from '../src/types/doculens';

describe('Intelligent Comparison Engine — 4 Analytical Modes', () => {
  const bundles = generateSampleBundles();
  const docEnergy = bundles[0];
  const docProtocolV2 = bundles[1];
  const docProtocolV3 = bundles[2];
  const docComputingFoundations = bundles[3];
  const docComputingArchitectures = bundles[4];

  it('Mode 1: Content Differences detects additions, removals, and modifications with page provenance', () => {
    const diff = compareDocuments(
      docProtocolV2.document,
      docProtocolV3.document,
      docProtocolV2.chunks,
      docProtocolV3.chunks,
      { mode: 'content-diff' }
    );

    expect(diff.status).toBe('ready');
    expect(diff.changes.length).toBeGreaterThan(0);
    expect(diff.statistics.modified).toBeGreaterThan(0);

    for (const chg of diff.changes) {
      if (chg.leftPage) {
        expect(chg.leftPage).toBeGreaterThanOrEqual(1);
        expect(chg.leftPage).toBeLessThanOrEqual(docProtocolV2.document.pageCount);
      }
      if (chg.rightPage) {
        expect(chg.rightPage).toBeGreaterThanOrEqual(1);
        expect(chg.rightPage).toBeLessThanOrEqual(docProtocolV3.document.pageCount);
      }
    }
  });

  it('Mode 2: Concept Comparison matches subjects across differing terminology without assuming identical wording', () => {
    const concepts = extractConceptMatches(
      docComputingFoundations.chunks,
      docComputingArchitectures.chunks,
      docComputingFoundations.document,
      docComputingArchitectures.document
    );

    expect(concepts.length).toBeGreaterThanOrEqual(2);

    // Verify algorithm concept alignment
    const algoConcept = concepts.find((c) =>
      c.conceptTitle.toLowerCase().includes('algorithm')
    );
    expect(algoConcept).toBeDefined();
    expect(algoConcept?.leftExcerpt.toLowerCase()).toContain('step-by-step');
    expect(algoConcept?.rightExcerpt.toLowerCase()).toContain('instruction');
    expect(algoConcept?.leftPage).toBe(1);
    expect(algoConcept?.rightPage).toBe(1);
    expect(['synonymous_terminology', 'differing_perspective', 'overlapping_definition']).toContain(
      algoConcept?.relationshipType
    );
    expect(algoConcept?.confidence).toBeGreaterThan(0.6);

    // Verify computer / computing machine alignment
    const machineConcept = concepts.find((c) =>
      c.conceptTitle.toLowerCase().includes('computing') ||
      c.conceptTitle.toLowerCase().includes('machine') ||
      c.conceptTitle.toLowerCase().includes('engine')
    );
    expect(machineConcept).toBeDefined();
    expect(machineConcept?.leftExcerpt.toLowerCase()).toContain('comput');
    expect(machineConcept?.rightExcerpt.toLowerCase()).toContain('comput');
  });

  it('Mode 3: Definition Comparison extracts side-by-side rules and diagnoses scope divergence', () => {
    const definitions = extractDefinitionComparisons(
      docProtocolV2.chunks,
      docProtocolV3.chunks,
      docProtocolV2.document,
      docProtocolV3.document
    );

    expect(definitions.length).toBeGreaterThanOrEqual(2);

    // Check Hepatic safety definition difference
    const hepaticDef = definitions.find((d) =>
      d.term.toLowerCase().includes('hepatic')
    );
    expect(hepaticDef).toBeDefined();
    expect(hepaticDef?.leftExcerpt).toContain('Child-Pugh Class A, B, or C');
    expect(hepaticDef?.rightExcerpt).toContain('Child-Pugh Class B or C');
    expect(hepaticDef?.leftPage).toBe(1);
    expect(hepaticDef?.rightPage).toBe(1);
    expect(hepaticDef?.alignment).toBe('differing_scope');
  });

  it('Mode 4: Topic Overlap calculates Jaccard index and separates shared vs unique subjects', () => {
    const topicAnalysis = analyzeTopicOverlap(
      docComputingFoundations.chunks,
      docComputingArchitectures.chunks,
      docComputingFoundations.document,
      docComputingArchitectures.document
    );

    expect(topicAnalysis.overlapPercentage).toBeGreaterThanOrEqual(0);
    expect(topicAnalysis.overlapPercentage).toBeLessThanOrEqual(100);
    expect(topicAnalysis.calculationMethod).toContain('Jaccard');
    expect(topicAnalysis.limitations).toBeDefined();
    expect(topicAnalysis.sharedTopics.length + topicAnalysis.uniqueToLeft.length + topicAnalysis.uniqueToRight.length).toBeGreaterThan(0);
  });

  it('handles empty or malformed chunks gracefully with insufficient_evidence status', () => {
    const emptyDoc: DocumentEntity = {
      id: 'empty-doc',
      originalName: 'Empty.pdf',
      storedPath: 'local://empty.pdf',
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      sizeBytes: 100,
      pageCount: 1,
      status: 'ready',
      parserName: 'adapter',
      parserVersion: '1.0',
      createdAt: Date.now(),
      elementCount: 0,
      chunkCount: 0,
      tableCount: 0,
    };

    const result = compareDocuments(emptyDoc, docEnergy.document, [], docEnergy.chunks);
    expect(result.status).toBe('insufficient_evidence');
    expect(result.inconclusiveReason).toContain('no extracted text chunks');

    const bothEmpty = compareDocuments(emptyDoc, emptyDoc, [], []);
    expect(bothEmpty.status).toBe('insufficient_evidence');
    expect(bothEmpty.inconclusiveReason).toContain('zero extracted text chunks');
  });
});

describe('Search Highlighting Engine', () => {
  it('segments text to highlight exact phrase matches and token occurrences', () => {
    const text = 'Capital expenditure reached 648 billion across utility-scale solar PV installations.';
    const segments = highlightTextSegments(text, '648 billion', '648 billion');

    expect(segments.length).toBeGreaterThan(1);
    const matchSegment = segments.find((s) => s.isMatch);
    expect(matchSegment).toBeDefined();
    expect(matchSegment?.text).toBe('648 billion');
    expect(matchSegment?.isPrimary).toBe(true);
  });

  it('handles multi-term queries highlighting each keyword', () => {
    const text = 'Patients with Child-Pugh Class A hepatic impairment are monitored closely.';
    const segments = highlightTextSegments(text, ['child-pugh', 'hepatic']);

    const matchedWords = segments.filter((s) => s.isMatch).map((s) => s.text.toLowerCase());
    expect(matchedWords).toContain('child-pugh');
    expect(matchedWords).toContain('hepatic');
  });

  it('returns single unhighlighted segment when query terms do not appear', () => {
    const text = 'Renewable wind energy deployment.';
    const segments = highlightTextSegments(text, 'nuclear fission');
    expect(segments.length).toBe(1);
    expect(segments[0].isMatch).toBe(false);
    expect(segments[0].text).toBe(text);
  });
});
