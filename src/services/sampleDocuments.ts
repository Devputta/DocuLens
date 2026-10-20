/**
 * Curated Benchmark Documents for DocuLens
 * Pre-structured with real text, page provenance, element IDs, bounding boxes, and tables.
 */

import {
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  DocumentFigure,
} from '../types/doculens';
import { detectCaptionInText } from './captionMatcher';

export interface SampleBundle {
  document: DocumentEntity;
  elements: DocumentElement[];
  chunks: DocumentChunk[];
  tables: DocumentTable[];
  figures?: DocumentFigure[];
}

export function generateSampleBundles(): SampleBundle[] {
  const now = Date.now() - 3600000;

  // --- Document 1: Global Clean Energy Transition Report 2025 ---
  const doc1Id = 'doc-sample-energy-2025';
  const doc1Elements: DocumentElement[] = [
    {
      id: `${doc1Id}-el-1`,
      documentId: doc1Id,
      type: 'heading-1',
      pageNumber: 1,
      content: 'GLOBAL RENEWABLE ENERGY TRANSITION & GRID INFRASTRUCTURE AUDIT (FY2025)',
      headingLevel: 1,
      bbox: [10, 8, 80, 5],
      sourceElementId: 'src_e1_p1_h1',
    },
    {
      id: `${doc1Id}-el-2`,
      documentId: doc1Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Executive Summary: Throughout fiscal year 2025, global capital expenditure on renewable generation reached an unprecedented $648 billion, representing a 21.4% year-over-year expansion. However, transmission interconnection delays remain the primary bottleneck across OECD nations, with over 1,420 gigawatts of wind and solar capacity idling in interconnection queues worldwide.',
      bbox: [10, 16, 80, 12],
      sourceElementId: 'src_e1_p1_p1',
    },
    {
      id: `${doc1Id}-el-3`,
      documentId: doc1Id,
      type: 'heading-2',
      pageNumber: 1,
      content: '1. Capital Allocations & Generation Mix',
      headingLevel: 2,
      bbox: [10, 30, 80, 4],
      sourceElementId: 'src_e1_p1_h2',
    },
    {
      id: `${doc1Id}-el-4`,
      documentId: doc1Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Utility-scale solar photovoltaics accounted for $342 billion (52.7% of total clean energy deployment), driven by cell cost deflation averaging 34% across mono-PERC and TOPCon architectures. Offshore wind projects in Northern Europe experienced a 12% cost escalation due to supply chain tightening in high-voltage subsea cabling and specialized installation vessel availability.',
      bbox: [10, 36, 80, 14],
      sourceElementId: 'src_e1_p1_p2',
    },
    {
      id: `${doc1Id}-el-5`,
      documentId: doc1Id,
      type: 'table',
      pageNumber: 1,
      content: 'Table 1.1: 2025 Clean Energy Capital Expenditure & Capacity Additions by Technology',
      bbox: [10, 52, 80, 35],
      sourceElementId: 'src_e1_p1_tbl1',
    },
    {
      id: `${doc1Id}-el-6`,
      documentId: doc1Id,
      type: 'heading-2',
      pageNumber: 2,
      content: '2. Critical Mineral Supply Chain Vulnerabilities',
      headingLevel: 2,
      bbox: [10, 10, 80, 4],
      sourceElementId: 'src_e1_p2_h2',
    },
    {
      id: `${doc1Id}-el-7`,
      documentId: doc1Id,
      type: 'paragraph',
      pageNumber: 2,
      content:
        'Battery storage installations tripled to 184 GWh globally. Lithium iron phosphate (LFP) chemistry commanded 78% of stationary utility storage, mitigating cobalt price volatility. Conversely, synthetic graphite and high-purity electrical steel deficits added up to 18 months of lead time for high-voltage direct current (HVDC) converter transformers.',
      bbox: [10, 16, 80, 15],
      sourceElementId: 'src_e1_p2_p1',
    },
    {
      id: `${doc1Id}-el-8`,
      documentId: doc1Id,
      type: 'heading-2',
      pageNumber: 2,
      content: '3. Strategic Recommendations for Grid Operators',
      headingLevel: 2,
      bbox: [10, 34, 80, 4],
      sourceElementId: 'src_e1_p2_h3',
    },
    {
      id: `${doc1Id}-el-9`,
      documentId: doc1Id,
      type: 'paragraph',
      pageNumber: 2,
      content:
        'Regulators must mandate grid-forming inverters for all renewable interconnects exceeding 50 MW to reinforce system inertia. Furthermore, deploying dynamic line rating (DLR) sensors on legacy transmission corridors can unlock 18-28% additional throughput with under 5% of the capital expenditure required for new greenfield rights-of-way.',
      bbox: [10, 40, 80, 15],
      sourceElementId: 'src_e1_p2_p2',
    },
    {
      id: `${doc1Id}-el-10`,
      documentId: doc1Id,
      type: 'footnote',
      pageNumber: 2,
      content:
        'Footnote 1: Data audited against International Energy Agency (IEA) Trackers and BloombergNEF verified registry records as of November 2025.',
      bbox: [10, 88, 80, 6],
      sourceElementId: 'src_e1_p2_fn1',
    },
  ];

  const doc1Tables: DocumentTable[] = [
    {
      id: `${doc1Id}-tbl-1`,
      documentId: doc1Id,
      pageNumber: 1,
      sourceElementId: `${doc1Id}-el-5`,
      title: 'Table 1.1: 2025 Clean Energy Capital Expenditure & Capacity Additions',
      headers: ['Technology Sector', 'Global Investment ($B)', 'New Capacity (GW)', 'YoY Growth (%)', 'Avg Lead Time (Mo)'],
      rows: [
        ['Utility Solar PV', '342.0', '390', '+28.4', '14'],
        ['Distributed Solar', '118.5', '145', '+12.1', '6'],
        ['Onshore Wind', '98.2', '88', '+6.5', '26'],
        ['Offshore Wind', '44.8', '19', '+3.8', '48'],
        ['Battery Storage', '44.5', '82', '+74.2', '11'],
      ],
      warnings: [],
    },
  ];

  const doc1Chunks: DocumentChunk[] = [
    {
      id: `${doc1Id}-chk-1`,
      documentId: doc1Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc1Id}-el-1`, `${doc1Id}-el-2`],
      sectionPath: ['Executive Summary'],
      text:
        'GLOBAL RENEWABLE ENERGY TRANSITION & GRID INFRASTRUCTURE AUDIT (FY2025)\n\nExecutive Summary: Throughout fiscal year 2025, global capital expenditure on renewable generation reached an unprecedented $648 billion, representing a 21.4% year-over-year expansion. However, transmission interconnection delays remain the primary bottleneck across OECD nations, with over 1,420 gigawatts of wind and solar capacity idling in interconnection queues worldwide.',
      searchText: 'global renewable energy transition grid infrastructure audit capital expenditure 648 billion transmission interconnection 1420 gigawatts',
    },
    {
      id: `${doc1Id}-chk-2`,
      documentId: doc1Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc1Id}-el-3`, `${doc1Id}-el-4`, `${doc1Id}-el-5`],
      sectionPath: ['Capital Allocations & Generation Mix'],
      text:
        'Utility-scale solar photovoltaics accounted for $342 billion (52.7% of total clean energy deployment), driven by cell cost deflation averaging 34% across mono-PERC and TOPCon architectures. Offshore wind projects in Northern Europe experienced a 12% cost escalation due to supply chain tightening in high-voltage subsea cabling and specialized installation vessel availability. Table 1.1 records total utility solar at $342.0B with 390 GW added and battery storage at $44.5B with 82 GW added (+74.2% YoY).',
      searchText: 'utility scale solar photovoltaics 342 billion mono perc topcon offshore wind cabling vessel battery storage 44.5 billion 82 gw',
    },
    {
      id: `${doc1Id}-chk-3`,
      documentId: doc1Id,
      pageStart: 2,
      pageEnd: 2,
      elementIds: [`${doc1Id}-el-6`, `${doc1Id}-el-7`],
      sectionPath: ['Critical Mineral Supply Chain Vulnerabilities'],
      text:
        'Battery storage installations tripled to 184 GWh globally. Lithium iron phosphate (LFP) chemistry commanded 78% of stationary utility storage, mitigating cobalt price volatility. Conversely, synthetic graphite and high-purity electrical steel deficits added up to 18 months of lead time for high-voltage direct current (HVDC) converter transformers.',
      searchText: 'battery storage 184 gwh lithium iron phosphate lfp cobalt synthetic graphite electrical steel hvdc converter transformers',
    },
    {
      id: `${doc1Id}-chk-4`,
      documentId: doc1Id,
      pageStart: 2,
      pageEnd: 2,
      elementIds: [`${doc1Id}-el-8`, `${doc1Id}-el-9`, `${doc1Id}-el-10`],
      sectionPath: ['Strategic Recommendations for Grid Operators'],
      text:
        'Regulators must mandate grid-forming inverters for all renewable interconnects exceeding 50 MW to reinforce system inertia. Furthermore, deploying dynamic line rating (DLR) sensors on legacy transmission corridors can unlock 18-28% additional throughput with under 5% of the capital expenditure required for new greenfield rights-of-way. Audited against IEA and BloombergNEF records.',
      searchText: 'grid forming inverters 50 mw inertia dynamic line rating dlr sensors transmission corridors 18 28 throughput iea bloombergnef',
    },
  ];

  const doc1: DocumentEntity = {
    id: doc1Id,
    originalName: 'Global_Renewable_Energy_Grid_Audit_2025.pdf',
    storedPath: 'local://doculens/storage/doc-sample-energy-2025.pdf',
    sha256: '9f83c1b7a403816a75f8224b7a107ef4e4b519a8e2f07d2a8932cfda6e98b041',
    sizeBytes: 842100,
    pageCount: 2,
    status: 'ready',
    parserName: 'OpenDataLoader-Adapter',
    parserVersion: '1.4.2',
    createdAt: now,
    processedAt: now + 1200,
    summary:
      'Audit of 2025 global clean energy investments ($648B total), grid interconnection bottleneck (1,420 GW queued), battery chemistry shift to LFP, and dynamic line rating solutions.',
    elementCount: doc1Elements.length,
    chunkCount: doc1Chunks.length,
    tableCount: doc1Tables.length,
  };

  // --- Document 2: Clinical Protocol B-709 Rev 2 (Original Baseline) ---
  const doc2Id = 'doc-sample-protocol-rev2';
  const doc2Elements: DocumentElement[] = [
    {
      id: `${doc2Id}-el-1`,
      documentId: doc2Id,
      type: 'heading-1',
      pageNumber: 1,
      content: 'CLINICAL TRIAL PROTOCOL B-709 — REVISION 2.0',
      headingLevel: 1,
      bbox: [10, 8, 80, 5],
      sourceElementId: 'src_p2_e1',
    },
    {
      id: `${doc2Id}-el-2`,
      documentId: doc2Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Phase IIb Randomized Double-Blind Placebo-Controlled Study of Compound LX-418 in Adults with Refractory Atopic Dermatitis. Sponsor: Aethelgard Therapeutics Inc. Protocol ID: AT-2024-LX418.',
      bbox: [10, 15, 80, 8],
      sourceElementId: 'src_p2_e2',
    },
    {
      id: `${doc2Id}-el-3`,
      documentId: doc2Id,
      type: 'heading-2',
      pageNumber: 1,
      content: 'Section 4.1: Patient Eligibility Criteria',
      headingLevel: 2,
      bbox: [10, 25, 80, 4],
      sourceElementId: 'src_p2_e3',
    },
    {
      id: `${doc2Id}-el-4`,
      documentId: doc2Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Candidates must be aged 18 to 65 years with documented clinical diagnosis of moderate-to-severe atopic dermatitis for at least 12 months prior to screening. Baseline EASI (Eczema Area and Severity Index) score must be >= 16.0, and validated Investigator Global Assessment (vIGA-AD) must be >= 3 (Moderate).',
      bbox: [10, 31, 80, 12],
      sourceElementId: 'src_p2_e4',
    },
    {
      id: `${doc2Id}-el-5`,
      documentId: doc2Id,
      type: 'heading-2',
      pageNumber: 1,
      content: 'Section 4.2: Exclusion Criteria & Contraindications',
      headingLevel: 2,
      bbox: [10, 46, 80, 4],
      sourceElementId: 'src_p2_e5',
    },
    {
      id: `${doc2Id}-el-6`,
      documentId: doc2Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Exclusion criteria include: Active systemic infection within 28 days of Day 1; history of anaphylaxis to biologic agents; absolute neutrophil count < 1,500/uL; platelets < 100,000/uL; and any diagnosed mild, moderate, or severe hepatic impairment (Child-Pugh Class A, B, or C).',
      bbox: [10, 52, 80, 12],
      sourceElementId: 'src_p2_e6',
    },
    {
      id: `${doc2Id}-el-7`,
      documentId: doc2Id,
      type: 'heading-2',
      pageNumber: 2,
      content: 'Section 5.3: Dosing Administration Schedule',
      headingLevel: 2,
      bbox: [10, 10, 80, 4],
      sourceElementId: 'src_p2_e7',
    },
    {
      id: `${doc2Id}-el-8`,
      documentId: doc2Id,
      type: 'table',
      pageNumber: 2,
      content: 'Table 5.3: Cohort Assignment and Subcutaneous Dose Escalation (Rev 2.0)',
      bbox: [10, 16, 80, 25],
      sourceElementId: 'src_p2_e8',
    },
    {
      id: `${doc2Id}-el-9`,
      documentId: doc2Id,
      type: 'paragraph',
      pageNumber: 2,
      content:
        'Patients are monitored in clinic for 120 minutes following initial injection at Day 1. Vital signs (blood pressure, pulse, SpO2) are recorded at t = 0, 30, 60, and 120 minutes. Routine liver enzyme panel (ALT, AST, alkaline phosphatase) is evaluated at Week 4, Week 8, and Week 12.',
      bbox: [10, 44, 80, 14],
      sourceElementId: 'src_p2_e9',
    },
  ];

  const doc2Tables: DocumentTable[] = [
    {
      id: `${doc2Id}-tbl-1`,
      documentId: doc2Id,
      pageNumber: 2,
      sourceElementId: `${doc2Id}-el-8`,
      title: 'Table 5.3: Cohort Assignment & Subcutaneous Dosing (Rev 2.0)',
      headers: ['Cohort', 'Sample Size (N)', 'Loading Dose (Day 1)', 'Maintenance (Q2W)', 'Duration (Wks)'],
      rows: [
        ['Cohort A (Low)', '45', '150 mg SC', '75 mg SC', '16'],
        ['Cohort B (Mid)', '45', '300 mg SC', '150 mg SC', '16'],
        ['Cohort C (High)', '45', '600 mg SC', '300 mg SC', '16'],
        ['Placebo Control', '45', 'Vehicle SC', 'Vehicle SC', '16'],
      ],
      warnings: [],
    },
  ];

  const doc2Chunks: DocumentChunk[] = [
    {
      id: `${doc2Id}-chk-1`,
      documentId: doc2Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc2Id}-el-1`, `${doc2Id}-el-2`],
      sectionPath: ['Protocol Title & Study Design'],
      text:
        'CLINICAL TRIAL PROTOCOL B-709 — REVISION 2.0\nPhase IIb Randomized Double-Blind Placebo-Controlled Study of Compound LX-418 in Adults with Refractory Atopic Dermatitis. Sponsor: Aethelgard Therapeutics Inc. Protocol ID: AT-2024-LX418.',
      searchText: 'clinical trial protocol b 709 revision 2 lx 418 atopic dermatitis aethelgard therapeutics',
    },
    {
      id: `${doc2Id}-chk-2`,
      documentId: doc2Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc2Id}-el-3`, `${doc2Id}-el-4`, `${doc2Id}-el-5`, `${doc2Id}-el-6`],
      sectionPath: ['Patient Eligibility & Exclusion Criteria'],
      text:
        'Section 4.1 Eligibility: Candidates aged 18 to 65 years with moderate-to-severe atopic dermatitis >= 12 months. EASI >= 16.0, vIGA-AD >= 3. Section 4.2 Exclusion criteria: Active infection within 28 days; biologic anaphylaxis; neutrophil < 1,500/uL; platelets < 100,000/uL; and any diagnosed mild, moderate, or severe hepatic impairment (Child-Pugh Class A, B, or C).',
      searchText: 'eligibility easi 16 viga 3 exclusion infection neutrophil 1500 platelets 100000 hepatic impairment child pugh class a b c',
    },
    {
      id: `${doc2Id}-chk-3`,
      documentId: doc2Id,
      pageStart: 2,
      pageEnd: 2,
      elementIds: [`${doc2Id}-el-7`, `${doc2Id}-el-8`, `${doc2Id}-el-9`],
      sectionPath: ['Dosing Administration & Monitoring'],
      text:
        'Section 5.3 Dosing Schedule: Cohort A (45 pts, 150 mg loading, 75 mg Q2W), Cohort B (45 pts, 300 mg loading, 150 mg Q2W), Cohort C (45 pts, 600 mg loading, 300 mg Q2W), Placebo (45 pts). Post-injection clinic monitoring for 120 minutes. Vital signs at t = 0, 30, 60, 120 min. Liver panel at Week 4, 8, 12.',
      searchText: 'cohort a 150 mg cohort b 300 mg cohort c 600 mg dosing q2w monitoring 120 minutes liver panel week 4 8 12',
    },
  ];

  const doc2: DocumentEntity = {
    id: doc2Id,
    originalName: 'Clinical_Trial_Protocol_B-709_Rev2.pdf',
    storedPath: 'local://doculens/storage/doc-sample-protocol-rev2.pdf',
    sha256: '4a1b8972dc0e599b8214fa35c026da429007f311ebc41932f50d03b78297ea94',
    sizeBytes: 524100,
    pageCount: 2,
    status: 'ready',
    parserName: 'OpenDataLoader-Adapter',
    parserVersion: '1.4.2',
    createdAt: now - 86400000,
    processedAt: now - 86400000 + 950,
    summary:
      'Baseline Phase IIb trial protocol for LX-418 in atopic dermatitis. Strict exclusion for all Child-Pugh A/B/C hepatic impairment and 3-tier dose escalation.',
    elementCount: doc2Elements.length,
    chunkCount: doc2Chunks.length,
    tableCount: doc2Tables.length,
  };

  // --- Document 3: Clinical Protocol B-709 Rev 3 (Amendment Revision for Comparison) ---
  const doc3Id = 'doc-sample-protocol-rev3';
  const doc3Elements: DocumentElement[] = [
    {
      id: `${doc3Id}-el-1`,
      documentId: doc3Id,
      type: 'heading-1',
      pageNumber: 1,
      content: 'CLINICAL TRIAL PROTOCOL B-709 — REVISION 3.0 (AMENDMENT 1)',
      headingLevel: 1,
      bbox: [10, 8, 80, 5],
      sourceElementId: 'src_p3_e1',
    },
    {
      id: `${doc3Id}-el-2`,
      documentId: doc3Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Phase IIb Randomized Double-Blind Placebo-Controlled Study of Compound LX-418 in Adults with Refractory Atopic Dermatitis. Sponsor: Aethelgard Therapeutics Inc. Protocol ID: AT-2024-LX418-AM1. Formally supersedes Protocol Revision 2.0 upon Institutional Review Board (IRB) ratification.',
      bbox: [10, 15, 80, 8],
      sourceElementId: 'src_p3_e2',
    },
    {
      id: `${doc3Id}-el-3`,
      documentId: doc3Id,
      type: 'heading-2',
      pageNumber: 1,
      content: 'Section 4.1: Patient Eligibility Criteria',
      headingLevel: 2,
      bbox: [10, 25, 80, 4],
      sourceElementId: 'src_p3_e3',
    },
    {
      id: `${doc3Id}-el-4`,
      documentId: doc3Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Candidates must be aged 18 to 70 years (expanded from 65) with documented clinical diagnosis of moderate-to-severe atopic dermatitis for at least 6 months (reduced from 12 months) prior to screening. Baseline EASI score must be >= 16.0, and validated Investigator Global Assessment (vIGA-AD) must be >= 3 (Moderate).',
      bbox: [10, 31, 80, 12],
      sourceElementId: 'src_p3_e4',
    },
    {
      id: `${doc3Id}-el-5`,
      documentId: doc3Id,
      type: 'heading-2',
      pageNumber: 1,
      content: 'Section 4.2: Exclusion Criteria & Revised Hepatic Safety',
      headingLevel: 2,
      bbox: [10, 46, 80, 4],
      sourceElementId: 'src_p3_e5',
    },
    {
      id: `${doc3Id}-el-6`,
      documentId: doc3Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Exclusion criteria include: Active systemic infection within 28 days of Day 1; history of anaphylaxis to biologic agents; absolute neutrophil count < 1,500/uL; platelets < 100,000/uL; and moderate to severe hepatic impairment (Child-Pugh Class B or C). Note: Per Amendment 1 safety review, mild hepatic impairment (Child-Pugh Class A) is NO LONGER an exclusion criterion, provided baseline total bilirubin is <= 1.5x ULN.',
      bbox: [10, 52, 80, 14],
      sourceElementId: 'src_p3_e6',
    },
    {
      id: `${doc3Id}-el-7`,
      documentId: doc3Id,
      type: 'heading-2',
      pageNumber: 2,
      content: 'Section 5.3: Dosing Administration Schedule & Mandatory ECG Checkpoints',
      headingLevel: 2,
      bbox: [10, 10, 80, 4],
      sourceElementId: 'src_p3_e7',
    },
    {
      id: `${doc3Id}-el-8`,
      documentId: doc3Id,
      type: 'table',
      pageNumber: 2,
      content: 'Table 5.3: Cohort Assignment and Subcutaneous Dose Escalation (Rev 3.0)',
      bbox: [10, 16, 80, 25],
      sourceElementId: 'src_p3_e8',
    },
    {
      id: `${doc3Id}-el-9`,
      documentId: doc3Id,
      type: 'paragraph',
      pageNumber: 2,
      content:
        'Patients are monitored in clinic for 120 minutes following initial injection at Day 1. Vital signs (blood pressure, pulse, SpO2) are recorded at t = 0, 30, 60, and 120 minutes. NEW REQUIREMENT: A 12-lead electrocardiogram (ECG) is mandatory at Day 14 and Week 8 to evaluate QTc interval changes. Routine liver enzyme panel is evaluated at Week 2, Week 4, Week 8, and Week 12.',
      bbox: [10, 44, 80, 16],
      sourceElementId: 'src_p3_e9',
    },
  ];

  const doc3Tables: DocumentTable[] = [
    {
      id: `${doc3Id}-tbl-1`,
      documentId: doc3Id,
      pageNumber: 2,
      sourceElementId: `${doc3Id}-el-8`,
      title: 'Table 5.3: Cohort Assignment & Subcutaneous Dosing (Rev 3.0)',
      headers: ['Cohort', 'Sample Size (N)', 'Loading Dose (Day 1)', 'Maintenance (Q2W)', 'Duration (Wks)'],
      rows: [
        ['Cohort A (Low)', '55', '150 mg SC', '75 mg SC', '24'],
        ['Cohort B (Mid)', '55', '300 mg SC', '150 mg SC', '24'],
        ['Cohort C (High)', '55', '600 mg SC', '300 mg SC', '24'],
        ['Cohort D (Exploratory)', '30', '450 mg SC', '225 mg SC', '24'],
        ['Placebo Control', '55', 'Vehicle SC', 'Vehicle SC', '24'],
      ],
      warnings: [],
    },
  ];

  const doc3Chunks: DocumentChunk[] = [
    {
      id: `${doc3Id}-chk-1`,
      documentId: doc3Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc3Id}-el-1`, `${doc3Id}-el-2`],
      sectionPath: ['Protocol Title & Study Design'],
      text:
        'CLINICAL TRIAL PROTOCOL B-709 — REVISION 3.0 (AMENDMENT 1)\nPhase IIb Randomized Double-Blind Placebo-Controlled Study of Compound LX-418 in Adults with Refractory Atopic Dermatitis. Sponsor: Aethelgard Therapeutics Inc. Protocol ID: AT-2024-LX418-AM1. Formally supersedes Protocol Revision 2.0 upon IRB ratification.',
      searchText: 'clinical trial protocol b 709 revision 3 amendment 1 lx 418 atopic dermatitis irb ratification',
    },
    {
      id: `${doc3Id}-chk-2`,
      documentId: doc3Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc3Id}-el-3`, `${doc3Id}-el-4`, `${doc3Id}-el-5`, `${doc3Id}-el-6`],
      sectionPath: ['Patient Eligibility & Revised Hepatic Safety'],
      text:
        'Section 4.1 Eligibility: Candidates aged 18 to 70 years with moderate-to-severe atopic dermatitis >= 6 months. EASI >= 16.0, vIGA-AD >= 3. Section 4.2 Exclusion criteria: Active infection; biologic anaphylaxis; neutrophil < 1,500/uL; platelets < 100,000/uL; and moderate to severe hepatic impairment (Child-Pugh Class B or C). Note: Per Amendment 1 safety review, mild hepatic impairment (Child-Pugh Class A) is NO LONGER an exclusion criterion, provided baseline total bilirubin is <= 1.5x ULN.',
      searchText: 'eligibility age 70 atopic dermatitis 6 months child pugh class a no longer exclusion bilirubin mild hepatic impairment permitted',
    },
    {
      id: `${doc3Id}-chk-3`,
      documentId: doc3Id,
      pageStart: 2,
      pageEnd: 2,
      elementIds: [`${doc3Id}-el-7`, `${doc3Id}-el-8`, `${doc3Id}-el-9`],
      sectionPath: ['Dosing Administration Schedule & Mandatory ECG Checkpoints'],
      text:
        'Section 5.3 Dosing Schedule: Cohorts A, B, C expanded to 55 patients each over 24 weeks; added Cohort D (Exploratory 450 mg / 225 mg Q2W, 30 patients); Placebo (55 patients). Post-injection clinic monitoring for 120 minutes. NEW REQUIREMENT: A 12-lead electrocardiogram (ECG) is mandatory at Day 14 and Week 8 to evaluate QTc interval changes. Routine liver enzyme panel evaluated at Week 2, 4, 8, 12.',
      searchText: 'cohort expanded 55 patients 24 weeks cohort d exploratory 450 mg 12 lead ecg mandatory day 14 week 8 qtc interval liver panel week 2',
    },
  ];

  const doc3: DocumentEntity = {
    id: doc3Id,
    originalName: 'Clinical_Trial_Protocol_B-709_Rev3_Amendment1.pdf',
    storedPath: 'local://doculens/storage/doc-sample-protocol-rev3.pdf',
    sha256: 'c834927f12e9b08535a011de98192ca54dfa9807659c238b1d9774a3f5a111b2',
    sizeBytes: 588300,
    pageCount: 2,
    status: 'ready',
    parserName: 'OpenDataLoader-Adapter',
    parserVersion: '1.4.2',
    createdAt: now - 3600000,
    processedAt: now - 3600000 + 1100,
    summary:
      'Amendment 1 to Protocol B-709. Permits mild hepatic impairment (Child-Pugh A), expands patient age to 70, adds Cohort D, extends study to 24 weeks, and adds mandatory Day 14 ECG.',
    elementCount: doc3Elements.length,
    chunkCount: doc3Chunks.length,
    tableCount: doc3Tables.length,
  };

  // --- Document 4: Foundations of Electronic Computing Machines (Reference A) ---
  const doc4Id = 'doc-sample-computing-foundations';
  const doc4Elements: DocumentElement[] = [
    {
      id: `${doc4Id}-el-1`,
      documentId: doc4Id,
      type: 'heading-1',
      pageNumber: 1,
      content: 'FOUNDATIONS OF ELECTRONIC COMPUTING MACHINES & STORED-PROGRAM SYSTEMS',
      headingLevel: 1,
      bbox: [10, 8, 80, 5],
      sourceElementId: 'src_c4_e1',
    },
    {
      id: `${doc4Id}-el-2`,
      documentId: doc4Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Section 1. The Stored-Program Computer. An electronic computer is defined as an automated electronic machine capable of storing both operational instructions and numerical data within a shared internal memory, executing sequential cycles to process information without manual intervention.',
      bbox: [10, 15, 80, 10],
      sourceElementId: 'src_c4_e2',
    },
    {
      id: `${doc4Id}-el-3`,
      documentId: doc4Id,
      type: 'heading-2',
      pageNumber: 1,
      content: 'Section 2. Algorithmic Procedures & Sequence Control',
      headingLevel: 2,
      bbox: [10, 27, 80, 4],
      sourceElementId: 'src_c4_e3',
    },
    {
      id: `${doc4Id}-el-4`,
      documentId: doc4Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'An algorithm is defined as a finite, step-by-step procedure of well-defined rules or computational operations designed to solve a specific mathematical problem. Each step must be unambiguous, mechanically executable, and guaranteed to terminate in a finite duration.',
      bbox: [10, 33, 80, 10],
      sourceElementId: 'src_c4_e4',
    },
    {
      id: `${doc4Id}-el-5`,
      documentId: doc4Id,
      type: 'heading-2',
      pageNumber: 2,
      content: 'Section 3. Primary Memory & Arithmetic Logic Unit (ALU)',
      headingLevel: 2,
      bbox: [10, 10, 80, 4],
      sourceElementId: 'src_c4_e5',
    },
    {
      id: `${doc4Id}-el-6`,
      documentId: doc4Id,
      type: 'paragraph',
      pageNumber: 2,
      content:
        'Primary storage consists of internal memory cells that retain active instructions and intermediate operands during computation. The Central Processing Unit (CPU) couples a control unit with an Arithmetic Logic Unit (ALU) that carries out elementary operations including addition, logical conjunction, and branching.',
      bbox: [10, 16, 80, 12],
      sourceElementId: 'src_c4_e6',
    },
  ];

  const doc4Chunks: DocumentChunk[] = [
    {
      id: `${doc4Id}-chk-1`,
      documentId: doc4Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc4Id}-el-1`, `${doc4Id}-el-2`],
      sectionPath: ['The Stored-Program Computer'],
      text:
        'FOUNDATIONS OF ELECTRONIC COMPUTING MACHINES\nSection 1. The Stored-Program Computer. An electronic computer is defined as an automated electronic machine capable of storing both operational instructions and numerical data within a shared internal memory, executing sequential cycles to process information without manual intervention.',
      searchText: 'electronic computer automated machine stored program operational instructions internal memory',
    },
    {
      id: `${doc4Id}-chk-2`,
      documentId: doc4Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc4Id}-el-3`, `${doc4Id}-el-4`],
      sectionPath: ['Algorithmic Procedures & Sequence Control'],
      text:
        'Section 2. Algorithmic Procedures & Sequence Control: An algorithm is defined as a finite, step-by-step procedure of well-defined rules or computational operations designed to solve a specific mathematical problem. Each step must be unambiguous, mechanically executable, and guaranteed to terminate in a finite duration.',
      searchText: 'algorithm finite step by step procedure rules computational operations unambiguous terminate',
    },
    {
      id: `${doc4Id}-chk-3`,
      documentId: doc4Id,
      pageStart: 2,
      pageEnd: 2,
      elementIds: [`${doc4Id}-el-5`, `${doc4Id}-el-6`],
      sectionPath: ['Primary Memory & Arithmetic Logic Unit'],
      text:
        'Section 3. Primary Memory & Arithmetic Logic Unit (ALU): Primary storage consists of internal memory cells that retain active instructions and intermediate operands during computation. The Central Processing Unit (CPU) couples a control unit with an Arithmetic Logic Unit (ALU) that carries out elementary operations including addition, logical conjunction, and branching.',
      searchText: 'primary storage internal memory cells central processing unit cpu alu arithmetic logic unit',
    },
  ];

  const doc4Tables: DocumentTable[] = [
    {
      id: `${doc4Id}-tbl-1`,
      documentId: doc4Id,
      pageNumber: 2,
      sourceElementId: `${doc4Id}-el-5`,
      title: 'Table 1: Stored-Program Architectural Subsystems & Classical Roles',
      headers: ['Subsystem', 'Classical Function', 'Operational Latency', 'Physical Implementation'],
      rows: [
        ['Arithmetic Logic Unit (ALU)', 'Fixed-point logic & arithmetic execution', '< 5 cycles', 'Vacuum tube & diode matrices'],
        ['Primary Memory', 'Stores instruction words & operand data', '10 - 20 us', 'Mercury delay lines & core memory'],
        ['Control Unit', 'Fetches, decodes, and dispatches instructions', '1 cycle', 'Relay logic & sequential stepping registers'],
        ['Input / Output Channel', 'Translates external punched cards into memory words', '100 - 500 ms', 'Electromechanical paper tape readers'],
      ],
      confidence: 'high',
      extractionMethod: 'pdf-layout-analysis',
      columnCount: 4,
      rowCount: 4,
    },
  ];

  const doc4: DocumentEntity = {
    id: doc4Id,
    originalName: 'Foundations_of_Electronic_Computing_Machines.pdf',
    storedPath: 'local://doculens/storage/doc-sample-computing-foundations.pdf',
    sha256: '5e7a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
    sizeBytes: 312000,
    pageCount: 2,
    status: 'ready',
    parserName: 'OpenDataLoader-Adapter',
    parserVersion: '1.4.2',
    createdAt: now - 1800000,
    processedAt: now - 1800000 + 750,
    summary:
      'Classic formulation of stored-program computers, defining an algorithm as a finite step-by-step procedure and detailing primary memory and ALU components.',
    elementCount: doc4Elements.length,
    chunkCount: doc4Chunks.length,
    tableCount: doc4Tables.length,
  };

  // --- Document 5: Modern Computational Architectures & Algorithmic Processors (Compare B) ---
  const doc5Id = 'doc-sample-computing-architectures';
  const doc5Elements: DocumentElement[] = [
    {
      id: `${doc5Id}-el-1`,
      documentId: doc5Id,
      type: 'heading-1',
      pageNumber: 1,
      content: 'PRINCIPLES OF MODERN COMPUTATIONAL ARCHITECTURES & ALGORITHMIC ENGINES',
      headingLevel: 1,
      bbox: [10, 8, 80, 5],
      sourceElementId: 'src_c5_e1',
    },
    {
      id: `${doc5Id}-el-2`,
      documentId: doc5Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'Section 1. Digital Processing Engines. Modern computing systems operate as integrated digital processing engines that execute codified instruction streams across microarchitectural datapaths, transforming input representations into verified output states.',
      bbox: [10, 15, 80, 10],
      sourceElementId: 'src_c5_e2',
    },
    {
      id: `${doc5Id}-el-3`,
      documentId: doc5Id,
      type: 'heading-2',
      pageNumber: 1,
      content: 'Section 2. Algorithmic Instructions & Computational Recipes',
      headingLevel: 2,
      bbox: [10, 27, 80, 4],
      sourceElementId: 'src_c5_e3',
    },
    {
      id: `${doc5Id}-el-4`,
      documentId: doc5Id,
      type: 'paragraph',
      pageNumber: 1,
      content:
        'An algorithm is characterized as an ordered sequence of discrete deterministic computational instructions that systematically map an initial input state to a final output state through bounded state transitions.',
      bbox: [10, 33, 80, 10],
      sourceElementId: 'src_c5_e4',
    },
    {
      id: `${doc5Id}-el-5`,
      documentId: doc5Id,
      type: 'heading-2',
      pageNumber: 2,
      content: 'Section 3. Memory Hierarchy & Execution Pipelining',
      headingLevel: 2,
      bbox: [10, 10, 80, 4],
      sourceElementId: 'src_c5_e5',
    },
    {
      id: `${doc5Id}-el-6`,
      documentId: doc5Id,
      type: 'paragraph',
      pageNumber: 2,
      content:
        'Retention memory is structured hierarchically across high-speed registers, on-die caches, and primary address space to balance access latency and retention capacity. Execution pipelines stream decoded instructions through parallel arithmetic and functional units.',
      bbox: [10, 16, 80, 12],
      sourceElementId: 'src_c5_e6',
    },
  ];

  const doc5Chunks: DocumentChunk[] = [
    {
      id: `${doc5Id}-chk-1`,
      documentId: doc5Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc5Id}-el-1`, `${doc5Id}-el-2`],
      sectionPath: ['Digital Processing Engines'],
      text:
        'PRINCIPLES OF MODERN COMPUTATIONAL ARCHITECTURES\nSection 1. Digital Processing Engines: Modern computing systems operate as integrated digital processing engines that execute codified instruction streams across microarchitectural datapaths, transforming input representations into verified output states.',
      searchText: 'computing systems digital processing engines codified instruction streams microarchitectural datapaths',
    },
    {
      id: `${doc5Id}-chk-2`,
      documentId: doc5Id,
      pageStart: 1,
      pageEnd: 1,
      elementIds: [`${doc5Id}-el-3`, `${doc5Id}-el-4`],
      sectionPath: ['Algorithmic Instructions & Computational Recipes'],
      text:
        'Section 2. Algorithmic Instructions & Computational Recipes: An algorithm is characterized as an ordered sequence of discrete deterministic computational instructions that systematically map an initial input state to a final output state through bounded state transitions.',
      searchText: 'algorithm ordered sequence discrete deterministic computational instructions state transitions',
    },
    {
      id: `${doc5Id}-chk-3`,
      documentId: doc5Id,
      pageStart: 2,
      pageEnd: 2,
      elementIds: [`${doc5Id}-el-5`, `${doc5Id}-el-6`],
      sectionPath: ['Memory Hierarchy & Execution Pipelining'],
      text:
        'Section 3. Memory Hierarchy & Execution Pipelining: Retention memory is structured hierarchically across high-speed registers, on-die caches, and primary address space to balance access latency and retention capacity. Execution pipelines stream decoded instructions through parallel arithmetic and functional units.',
      searchText: 'retention memory hierarchy registers caches primary address space execution pipelines parallel arithmetic',
    },
  ];

  const doc5Tables: DocumentTable[] = [
    {
      id: `${doc5Id}-tbl-1`,
      documentId: doc5Id,
      pageNumber: 2,
      sourceElementId: `${doc5Id}-el-5`,
      title: 'Table 1: Modern Microarchitectural Execution Engines & Subsystems',
      headers: ['Architecture Unit', 'Core Responsibility', 'Access Latency', 'Contemporary Fabrication'],
      rows: [
        ['Arithmetic & Vector Pipelines', 'SIMD and tensor math execution', '1 - 3 cycles', 'Nanoscale CMOS FinFET logic gates'],
        ['Hierarchical Memory Subsystem', 'L1/L2 caches and multichannel DDR5 DRAM', '0.8 ns - 60 ns', 'On-die SRAM arrays & 3D stacked DRAM'],
        ['Instruction Dispatch Unit', 'Out-of-order superscalar speculative scheduling', '< 1 clock cycle', 'Branch target buffers & reservation stations'],
        ['High-Speed Interconnect Bus', 'PCIe Gen 5 and coherent fabric telemetry', '20 - 40 ns', 'Differential optical/copper serialized traces'],
      ],
      confidence: 'high',
      extractionMethod: 'pdf-layout-analysis',
      columnCount: 4,
      rowCount: 4,
    },
  ];

  const doc5: DocumentEntity = {
    id: doc5Id,
    originalName: 'Modern_Computational_Architectures.pdf',
    storedPath: 'local://doculens/storage/doc-sample-computing-architectures.pdf',
    sha256: '7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c',
    sizeBytes: 345000,
    pageCount: 2,
    status: 'ready',
    parserName: 'OpenDataLoader-Adapter',
    parserVersion: '1.4.2',
    createdAt: now - 900000,
    processedAt: now - 900000 + 820,
    summary:
      'Contemporary computational architecture perspectives: defines algorithms as ordered sequences of deterministic instructions and describes hierarchical retention memory and pipelined execution.',
    elementCount: doc5Elements.length,
    chunkCount: doc5Chunks.length,
    tableCount: doc5Tables.length,
  };

  return [
    { document: doc1, elements: doc1Elements, chunks: doc1Chunks, tables: doc1Tables },
    { document: doc2, elements: doc2Elements, chunks: doc2Chunks, tables: doc2Tables },
    { document: doc3, elements: doc3Elements, chunks: doc3Chunks, tables: doc3Tables },
    { document: doc4, elements: doc4Elements, chunks: doc4Chunks, tables: doc4Tables },
    { document: doc5, elements: doc5Elements, chunks: doc5Chunks, tables: doc5Tables },
  ];
}

/**
 * Creates authentic sample benchmark figures for the demonstration documents.
 */
export async function generateSampleFigures(): Promise<DocumentFigure[]> {
  const figures: DocumentFigure[] = [];

  const figDefs = [
    {
      id: 'fig-sample-energy-p1-1',
      documentId: 'doc-sample-energy-2025',
      pageNumber: 1,
      title: 'Figure 1: Grid Interconnection Bottleneck & Queue Flow Diagram',
      subtitle: 'Global transmission intertie queues and BESS co-location review',
      color: '#E8A94A',
      diagramType: 'flowchart' as const,
    },
    {
      id: 'fig-sample-energy-p2-2',
      documentId: 'doc-sample-energy-2025',
      pageNumber: 2,
      title: 'Figure 2: 2025 Clean Energy Capital Expenditure & Generation Mix',
      subtitle: 'Utility-scale solar vs offshore wind vs storage capital breakdown',
      color: '#3B82F6',
      diagramType: 'barchart' as const,
    },
    {
      id: 'fig-sample-protocol-v2-p1-1',
      documentId: 'doc-sample-protocol-v2',
      pageNumber: 1,
      title: 'Figure 1: Protocol B-709 Cohort Enrollment & Randomization Pathway',
      subtitle: 'Phase III clinical candidate stratification and safety intervals',
      color: '#10B981',
      diagramType: 'grid' as const,
    },
    {
      id: 'fig-sample-protocol-v3-p2-1',
      documentId: 'doc-sample-protocol-v3',
      pageNumber: 2,
      title: 'Figure 2: Protocol B-709 Modified Dose Escalation & Biomarker Matrix',
      subtitle: 'Revision 3.0 updated pharmacodynamic endpoints and titration levels',
      color: '#8B5CF6',
      diagramType: 'grid' as const,
    },
  ];

  for (const def of figDefs) {
    const fig = await createSyntheticSampleFigure(
      def.id,
      def.documentId,
      def.pageNumber,
      def.title,
      def.subtitle,
      def.color,
      def.diagramType
    );
    figures.push(fig);
  }

  return figures;
}

async function createSyntheticSampleFigure(
  id: string,
  documentId: string,
  pageNumber: number,
  title: string,
  subtitle: string,
  color: string,
  diagramType: 'flowchart' | 'barchart' | 'grid'
): Promise<DocumentFigure> {
  const width = 640;
  const height = 400;
  let imageBlob: Blob;
  let thumbBlob: Blob;

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dark slate background
      ctx.fillStyle = '#14181F';
      ctx.fillRect(0, 0, width, height);

      // Border
      ctx.strokeStyle = '#272F3D';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, width - 8, height - 8);

      // Kicker
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText('DOCULENS FIGURE PROVENANCE', 24, 32);

      // Title
      ctx.fillStyle = '#E6E9EF';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(title, 24, 60);

      // Subtitle
      ctx.fillStyle = '#8B95A5';
      ctx.font = '12px sans-serif';
      ctx.fillText(subtitle, 24, 82);

      // Divider line
      ctx.strokeStyle = '#272F3D';
      ctx.beginPath();
      ctx.moveTo(24, 96);
      ctx.lineTo(width - 24, 96);
      ctx.stroke();

      if (diagramType === 'flowchart') {
        const nodes = [
          { label: 'Interconnection Request', x: 40, y: 150, w: 150, h: 56 },
          { label: 'Engineering Feasibility', x: 245, y: 150, w: 150, h: 56 },
          { label: 'Grid Intertie Approval', x: 450, y: 150, w: 150, h: 56 },
          { label: 'BESS Co-location', x: 245, y: 250, w: 150, h: 56 },
        ];
        nodes.forEach((n) => {
          ctx.fillStyle = '#1D2430';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(n.x, n.y, n.w, n.h, 6) : ctx.rect(n.x, n.y, n.w, n.h);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#E6E9EF';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2 + 4);
          ctx.textAlign = 'left';
        });

        // Connecting lines
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(190, 178);
        ctx.lineTo(245, 178);
        ctx.moveTo(395, 178);
        ctx.lineTo(450, 178);
        ctx.moveTo(320, 206);
        ctx.lineTo(320, 250);
        ctx.stroke();
      } else if (diagramType === 'barchart') {
        const bars = [
          { label: 'Solar Photovoltaics', value: 342, max: 400, color: '#E8A94A' },
          { label: 'Onshore Wind Assets', value: 168, max: 400, color: '#3B82F6' },
          { label: 'Offshore Wind Fleet', value: 74, max: 400, color: '#10B981' },
          { label: 'Battery Energy Storage', value: 64, max: 400, color: '#8B5CF6' },
        ];
        bars.forEach((b, i) => {
          const y = 130 + i * 54;
          ctx.fillStyle = '#8B95A5';
          ctx.font = '12px sans-serif';
          ctx.fillText(b.label, 24, y + 16);

          ctx.fillStyle = '#1D2430';
          ctx.fillRect(160, y, 380, 24);

          const barW = (b.value / b.max) * 380;
          ctx.fillStyle = b.color;
          ctx.fillRect(160, y, barW, 24);

          ctx.fillStyle = '#E6E9EF';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`$${b.value}B`, 160 + barW + 10, y + 17);
        });
      } else {
        const cells = [
          { cohort: 'Cohort 1 (10mg PO)', n: 'n=24 subjects', status: 'Completed', color: '#10B981' },
          { cohort: 'Cohort 2 (25mg PO)', n: 'n=24 subjects', status: 'Completed', color: '#10B981' },
          { cohort: 'Cohort 3 (50mg PO)', n: 'n=32 subjects', status: 'Active Enrollment', color: '#E8A94A' },
          { cohort: 'Cohort 4 (100mg PO)', n: 'n=32 subjects', status: 'Safety Hold', color: '#EF4444' },
        ];
        cells.forEach((c, i) => {
          const x = 30 + (i % 2) * 290;
          const y = 135 + Math.floor(i / 2) * 110;
          ctx.fillStyle = '#1D2430';
          ctx.strokeStyle = c.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(x, y, 270, 90, 6) : ctx.rect(x, y, 270, 90);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#E6E9EF';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(c.cohort, x + 16, y + 28);

          ctx.fillStyle = '#8B95A5';
          ctx.font = '12px sans-serif';
          ctx.fillText(c.n, x + 16, y + 52);

          ctx.fillStyle = c.color;
          ctx.font = 'bold 11px monospace';
          ctx.fillText(c.status.toUpperCase(), x + 16, y + 74);
        });
      }

      ctx.fillStyle = '#6B7280';
      ctx.font = '10px monospace';
      ctx.fillText('BENCHMARK FIGURE · RESOLUTION 640x400 · EXTRACTED LOCAL RUNTIME', 24, height - 16);
    }

    imageBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 100;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      thumbCtx.drawImage(canvas, 0, 0, 160, 100);
    }
    thumbBlob = await new Promise<Blob>((res) => thumbCanvas.toBlob((b) => res(b!), 'image/png'));
  } else {
    imageBlob = new Blob(['benchmark-figure-full'], { type: 'image/png' });
    thumbBlob = new Blob(['benchmark-figure-thumb'], { type: 'image/png' });
  }

  const captionMatch = detectCaptionInText(title);

  return {
    id,
    documentId,
    pageNumber,
    bbox: [10, 10, 80, 80],
    width,
    height,
    imageBlob,
    thumbnailBlob: thumbBlob,
    type: 'synthetic',
    hash: `hash_${id}`,
    caption: title,
    captionLabel: captionMatch.label || 'Figure',
    captionStatus: captionMatch.isCaption ? 'linked' : 'unlinked',
    createdAt: Date.now() - 3600000,
  };
}
