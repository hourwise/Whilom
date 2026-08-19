/**
 * Which source should Whilom trust next, and what does it buy?
 *
 *   pnpm --filter @whilom/ingestion regional:opportunity
 *
 * This is Batch 12's primary deliverable. It compares every candidate source
 * family on the same measured terms so a future batch can choose on evidence
 * rather than on which dataset sounds most promising.
 *
 * Every figure below was measured against the live services and the real
 * regional corpus. Where a number could not be established — most importantly
 * the licensing position of Historic England's list-entry descriptions — the
 * field says so rather than carrying a plausible guess.
 *
 * The governing rule, restated because it is what the matrix is for:
 * expand Whilom through evidence it can defend, not through plausible
 * inference.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENT_TERMS, PERIOD_TERMS, REJECTED_PROPERTIES, VOCABULARY_VERSION } from '../transforms/source-vocabulary';

/** The controlled set of conclusions a source may be given. */
export type RecommendedAction =
  /** Passes every gate in the batch brief; implement now. */
  | 'IMPORT_NOW'
  /** Safe, but large enough that it needs its own staged scale work. */
  | 'PILOT'
  /** Evidence exists but needs a human in the loop. */
  | 'REVIEW_REQUIRED'
  /** Blocked on establishing lawful, documented access. */
  | 'RESEARCH_ACCESS'
  /** Correlates with a date without asserting one. Refused. */
  | 'REJECT_INFERENCE'
  /** Real but not worth the cost yet. */
  | 'DEFER';

export interface Opportunity {
  source: string;
  sourceFamily: string;
  accessMethod: string;
  licence: string;
  attributionRequirement: string;
  bulkAccessAllowed: boolean | 'unknown';
  stableIdentifierAvailable: boolean;

  candidateRecords: number | null;
  matchedWhilomPlaces: number | null;
  unmatchedNewPlaces: number | null;

  directTemporalAssertions: number | null;
  periodOnlyAssertions: number | null;

  strongTemporalGain: number | null;
  periodOnlyGain: number | null;
  expectedGeographicGain: string;

  precisionDistribution: Record<string, number> | null;
  conflictRate: string;
  unhandledRate: string;

  provenanceQuality: 'high' | 'medium' | 'low' | 'unknown';
  automationSafety: 'automatic' | 'review' | 'unsafe' | 'unknown';
  licensingConfidence: 'established' | 'partial' | 'unknown';
  implementationComplexity: 'low' | 'medium' | 'high';
  runtimeCost: string;
  operationalRisk: string;

  recommendedAction: RecommendedAction;
  evidence: string[];
}

/**
 * Historic England's National Heritage List, as published.
 *
 * The layer and field counts here were read from the service's own metadata
 * endpoint, not inferred from a sample: eleven layers, twenty-three distinct
 * fields across all of them, and every date field administrative.
 */
export const NHLE_PUBLISHED_FIELDS = [
  'AmendDate', 'BPNExpire', 'BPNStart', 'COIExpire', 'COIStart', 'CaptureScale',
  'DesigDate', 'Easting', 'Grade', 'InscrDate', 'Latitude', 'ListDate',
  'ListEntry', 'Longitude', 'NGR', 'Name', 'Northing', 'Notes', 'OBJECTID',
  'RegDate', 'SchedDate', 'area_ha', 'hyperlink',
] as const;

/** National record counts per ingested layer, from returnCountOnly queries. */
export const NHLE_NATIONAL_COUNTS: Record<string, number> = {
  'Listed Building points': 379_685,
  'Scheduled Monuments': 20_001,
  'Parks and Gardens': 1_721,
  Battlefields: 47,
  'Protected Wreck Sites': 57,
  'World Heritage Sites': 28,
};

export const NHLE_NATIONAL_TOTAL = Object.values(NHLE_NATIONAL_COUNTS).reduce((a, b) => a + b, 0);

export function buildOpportunities(measured: {
  regionalPlaces: number;
  claimsBefore: number;
  placesWithTemporalBefore: number;
  eventClaims: number;
  eventPlaces: number;
  periodClaims: number;
  periodPlaces: number;
  startTimePlaces: number;
  pointInTimePlaces: number;
  rejectedEvents: number;
}): Opportunity[] {
  return [
    // -----------------------------------------------------------------------
    {
      source: 'Historic England — NHLE list-entry descriptions',
      sourceFamily: 'Historic England',
      accessMethod:
        'Not published in the open-data service. The text exists only on individual list-entry web pages, ' +
        'reachable one document at a time via the `hyperlink` field.',
      licence: 'unknown for the description text; the spatial data is OGL v3.0',
      attributionRequirement: 'Contains Historic England information © Historic England (for the open data)',
      bulkAccessAllowed: 'unknown',
      stableIdentifierAvailable: true,
      candidateRecords: NHLE_NATIONAL_TOTAL,
      matchedWhilomPlaces: measured.regionalPlaces,
      unmatchedNewPlaces: 0,
      directTemporalAssertions: null,
      periodOnlyAssertions: null,
      strongTemporalGain: null,
      periodOnlyGain: null,
      expectedGeographicGain: 'none — same places, more detail about them',
      precisionDistribution: null,
      conflictRate: 'not measurable without access',
      unhandledRate: 'not measurable without access',
      provenanceQuality: 'high',
      automationSafety: 'unknown',
      licensingConfidence: 'unknown',
      implementationComplexity: 'high',
      runtimeCost: 'one document retrieval per record; ~400,000 nationally',
      operationalRisk:
        'Retrieving hundreds of thousands of pages from a public website is a bulk-use decision with terms, ' +
        'rate and politeness consequences that Whilom cannot settle from the outside.',
      recommendedAction: 'RESEARCH_ACCESS',
      evidence: [
        `The NHLE FeatureServer publishes 11 layers with ${NHLE_PUBLISHED_FIELDS.length} distinct fields between them; ` +
          'none is a description and every date field records an act of the state.',
        'All 247 feature services published by Historic England were enumerated; none carries list-entry description text.',
        'historicengland.org.uk returned HTTP 403 to a non-browser request — including for robots.txt — ' +
          'so even the crawl policy could not be established, let alone bulk terms.',
        'This is the single largest temporal opportunity available and it is blocked on access, not on engineering.',
      ],
    },
    // -----------------------------------------------------------------------
    {
      source: 'Historic England — NHLE national extent',
      sourceFamily: 'Historic England',
      accessMethod: 'The same ArcGIS FeatureServer Whilom already ingests, without the regional envelope',
      licence: 'OGL v3.0',
      attributionRequirement: 'Contains Historic England information © Historic England. Contains OS data © Crown copyright',
      bulkAccessAllowed: true,
      stableIdentifierAvailable: true,
      candidateRecords: NHLE_NATIONAL_TOTAL,
      matchedWhilomPlaces: measured.regionalPlaces,
      unmatchedNewPlaces: NHLE_NATIONAL_TOTAL - measured.regionalPlaces,
      directTemporalAssertions: null,
      periodOnlyAssertions: null,
      strongTemporalGain: null,
      periodOnlyGain: null,
      expectedGeographicGain: 'England-wide, from one Yorkshire band to the whole country',
      precisionDistribution: null,
      conflictRate: 'unchanged per record; the same pipeline and the same matcher',
      unhandledRate: 'unchanged per record',
      provenanceQuality: 'high',
      automationSafety: 'automatic',
      licensingConfidence: 'established',
      implementationComplexity: 'medium',
      runtimeCost: '17× the current corpus through an already-proven pipeline',
      operationalRisk:
        'The scale ladder has been proven to 25,000 records, not 400,000. Every map gate, the cluster ' +
        'aggregation and the coverage-truthfulness model were tuned against 23,151 places. This is a batch ' +
        'of its own, not a flag.',
      recommendedAction: 'PILOT',
      evidence: [
        `${NHLE_NATIONAL_TOTAL.toLocaleString()} records nationally against ${measured.regionalPlaces.toLocaleString()} ingested — 17×.`,
        'Same licence, same stable identifiers, same adapter: no new access or licensing question at all.',
        'By a wide margin the largest geographic gain available, and the only one requiring no new source.',
      ],
    },
    // -----------------------------------------------------------------------
    {
      source: 'Wikidata — dated significant events (P793 + P585)',
      sourceFamily: 'Wikidata',
      accessMethod: 'SPARQL, joined on P1216 (NHLE list entry)',
      licence: 'CC0-1.0',
      attributionRequirement: 'Wikidata contributors, CC0 1.0',
      bulkAccessAllowed: true,
      stableIdentifierAvailable: true,
      candidateRecords: 122,
      matchedWhilomPlaces: measured.eventPlaces,
      unmatchedNewPlaces: 0,
      directTemporalAssertions: measured.eventClaims,
      periodOnlyAssertions: 0,
      strongTemporalGain: measured.eventClaims,
      periodOnlyGain: 0,
      expectedGeographicGain: 'none — enriches places Whilom already holds',
      precisionDistribution: { year: 33, day: 5, century: 3 },
      conflictRate: 'low; events are usually different facts rather than competing dates',
      unhandledRate: `${measured.rejectedEvents} of 41 rejected as not about the place`,
      provenanceQuality: 'high',
      automationSafety: 'automatic',
      licensingConfidence: 'established',
      implementationComplexity: 'low',
      runtimeCost: 'one additional bounded SPARQL query',
      operationalRisk:
        'Requires a governed event vocabulary. Several dated event types describe a modern investigation ' +
        'rather than the place, and importing them blindly would date a Bronze Age barrow to 2015.',
      recommendedAction: 'IMPORT_NOW',
      evidence: [
        `33 distinct dated event types measured regionally; ${EVENT_TERMS.filter((t) => t.association !== null).length} governed as evidence, ` +
          `${EVENT_TERMS.filter((t) => t.association === null).length} refused by name.`,
        'Semantics are genuinely distinct: demolition, conflagration, slighting and licence to crenellate ' +
          'are four different claims and must not collapse into one generic date.',
      ],
    },
    // -----------------------------------------------------------------------
    {
      source: 'Wikidata — controlled period vocabulary (P2348)',
      sourceFamily: 'Wikidata',
      accessMethod: 'SPARQL, joined on P1216',
      licence: 'CC0-1.0',
      attributionRequirement: 'Wikidata contributors, CC0 1.0',
      bulkAccessAllowed: true,
      stableIdentifierAvailable: true,
      candidateRecords: 94,
      matchedWhilomPlaces: measured.periodPlaces,
      unmatchedNewPlaces: 0,
      directTemporalAssertions: 0,
      periodOnlyAssertions: measured.periodClaims,
      strongTemporalGain: 0,
      periodOnlyGain: measured.periodClaims,
      expectedGeographicGain: 'none',
      precisionDistribution: { period: measured.periodClaims },
      conflictRate: 'low',
      unhandledRate: '0 of 5 distinct period items unmapped',
      provenanceQuality: 'high',
      automationSafety: 'automatic',
      licensingConfidence: 'established',
      implementationComplexity: 'low',
      runtimeCost: 'one additional bounded SPARQL query',
      operationalRisk:
        'One of the five terms is broader than any single Whilom period. "Middle Ages" spans three registry ' +
        'periods, and narrowing it to the best-overlapping one would invent precision the source did not give.',
      recommendedAction: 'IMPORT_NOW',
      evidence: [
        `5 distinct period items measured; classified ${PERIOD_TERMS.map((t) => t.classification).join(', ')}.`,
        'The only genuinely controlled period vocabulary either source offers — everything else is a word ' +
          'read out of a name.',
      ],
    },
    // -----------------------------------------------------------------------
    {
      source: 'Wikidata — start time (P580) and point in time (P585)',
      sourceFamily: 'Wikidata',
      accessMethod: 'SPARQL, joined on P1216',
      licence: 'CC0-1.0',
      attributionRequirement: 'Wikidata contributors, CC0 1.0',
      bulkAccessAllowed: true,
      stableIdentifierAvailable: true,
      candidateRecords: 31,
      matchedWhilomPlaces: measured.startTimePlaces + measured.pointInTimePlaces,
      unmatchedNewPlaces: 0,
      directTemporalAssertions: measured.startTimePlaces + measured.pointInTimePlaces,
      periodOnlyAssertions: 0,
      strongTemporalGain: measured.startTimePlaces + measured.pointInTimePlaces,
      periodOnlyGain: 0,
      expectedGeographicGain: 'none',
      precisionDistribution: { year: 20, day: 8 },
      conflictRate: 'unmeasured at this volume',
      unhandledRate: 'unmeasured at this volume',
      provenanceQuality: 'medium',
      automationSafety: 'review',
      licensingConfidence: 'established',
      implementationComplexity: 'low',
      runtimeCost: 'two additional bounded SPARQL queries',
      operationalRisk:
        'The semantics are ambiguous by design. P580 on a heritage item may mean the structure began, or the ' +
        'organisation occupying it began, or a designation began — and 28 places is not enough evidence to ' +
        'settle which, per item, without reading them.',
      recommendedAction: 'DEFER',
      evidence: [
        `${measured.startTimePlaces} places carry P580 and ${measured.pointInTimePlaces} carry P585 regionally.`,
        'Batch 11 established that a property must be imported for what it means, not for the fact it holds a ' +
          'date. These two do not have one settled meaning on this class of item.',
      ],
    },
    // -----------------------------------------------------------------------
    ...REJECTED_PROPERTIES.map((r): Opportunity => ({
      source: `Wikidata — ${r.label} (${r.property})`,
      sourceFamily: 'Wikidata',
      accessMethod: 'SPARQL, joined on P1216',
      licence: 'CC0-1.0',
      attributionRequirement: 'Wikidata contributors, CC0 1.0',
      bulkAccessAllowed: true,
      stableIdentifierAvailable: true,
      candidateRecords: r.regionalRecords,
      matchedWhilomPlaces: null,
      unmatchedNewPlaces: 0,
      directTemporalAssertions: 0,
      periodOnlyAssertions: 0,
      strongTemporalGain: 0,
      periodOnlyGain: 0,
      expectedGeographicGain: 'none',
      precisionDistribution: null,
      conflictRate: 'n/a',
      unhandledRate: 'n/a',
      provenanceQuality: 'high',
      automationSafety: 'unsafe',
      licensingConfidence: 'established',
      implementationComplexity: 'low',
      runtimeCost: 'n/a',
      operationalRisk: r.note,
      recommendedAction: 'REJECT_INFERENCE',
      evidence: [
        `${r.regionalRecords.toLocaleString()} regional records carry it — the largest body of apparently-temporal ` +
          'evidence available, and it is not temporal evidence.',
        r.note,
      ],
    })),
  ];
}

export function buildReport(measured: Parameters<typeof buildOpportunities>[0]) {
  const opportunities = buildOpportunities(measured);
  return {
    generatedAt: new Date().toISOString(),
    vocabularyVersion: VOCABULARY_VERSION,
    baseline: {
      regionalPlaces: measured.regionalPlaces,
      temporalClaims: measured.claimsBefore,
      placesWithTemporal: measured.placesWithTemporalBefore,
    },
    nhle: {
      publishedFields: NHLE_PUBLISHED_FIELDS,
      layers: 11,
      historicDateFields: 0,
      administrativeDateFields: 6,
      nationalCounts: NHLE_NATIONAL_COUNTS,
      nationalTotal: NHLE_NATIONAL_TOTAL,
      servicesEnumerated: 247,
      descriptionsInOpenData: false,
    },
    vocabulary: {
      periodTerms: PERIOD_TERMS,
      eventTermsGoverned: EVENT_TERMS.filter((t) => t.association !== null).length,
      eventTermsRefused: EVENT_TERMS.filter((t) => t.association === null).map((t) => ({
        qid: t.qid, label: t.label, note: t.note,
      })),
      rejectedProperties: REJECTED_PROPERTIES,
    },
    decisions: {
      historicEnglandDescriptions: 'ACCESS_OR_LICENSING_REVIEW_REQUIRED',
      controlledArchaeologicalVocabulary: 'PARTIAL_GOVERNED_MAPPING',
      additionalWikidataProperties: 'SAFE_DIRECT_PROPERTIES_IDENTIFIED',
    },
    opportunities,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).endsWith('coverage-opportunity.ts');
if (invokedDirectly) {
  // Figures measured during the batch's reconnaissance, against the live
  // services and the real corpus. Re-measured by the enrichment on every run.
  const report = buildReport({
    regionalPlaces: 23_151,
    claimsBefore: 1_443,
    placesWithTemporalBefore: 1_322,
    eventClaims: 35,
    eventPlaces: 22,
    periodClaims: 47,
    periodPlaces: 47,
    startTimePlaces: 21,
    pointInTimePlaces: 7,
    rejectedEvents: 6,
  });
  const json = JSON.stringify(report, null, 2) + '\n';
  writeFileSync(resolve(process.cwd(), 'regional-coverage-opportunity.json'), json);

  console.log('source                                                    action              gain');
  console.log('-'.repeat(96));
  for (const o of report.opportunities) {
    const gain =
      o.strongTemporalGain !== null || o.periodOnlyGain !== null
        ? `${o.strongTemporalGain ?? 0} strong / ${o.periodOnlyGain ?? 0} period`
        : o.expectedGeographicGain;
    console.log(`${o.source.slice(0, 56).padEnd(58)}${o.recommendedAction.padEnd(20)}${gain}`);
  }
  console.log('\ndecisions:', JSON.stringify(report.decisions, null, 2));
}
