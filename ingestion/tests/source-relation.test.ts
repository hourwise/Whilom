import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  SameSourceOverlap,
  RegisterCandidateClass,
  SourcePairRelation,
  classifyRegisterCandidate,
  classifySameSourceOverlap,
  classifySourcePair,
  sameRegisterDifferentEntries,
  shouldCompareAcrossSources,
} from '../matching/source-relation';
import { ComparisonOutcome } from '../matching/compare';
import { runIngestion } from '../pipeline/run';
import { HistoricEnglandNhleAdapter } from '../sources/historic-england/nhle-adapter';
import { normaliseNhleRecord } from '../transforms/normalise-nhle';

/**
 * A single-source run must not manufacture cross-source conflicts.
 *
 * Batch 6 did exactly that: every one of the 1,000-record tier's 142
 * "cross-source conflicts" was Historic England compared against Historic
 * England, which inflated the conflict rate to 23.9% and would have told a
 * reviewer that two sources disagreed when only one was ever involved. These
 * tests exist so that cannot return quietly.
 */

const YORKSHIRE_POC = fileURLToPath(
  new URL('../sources/historic-england/fixtures/yorkshire-poc.json', import.meta.url),
);

const nhle = { provenance: { sourceId: 'historic-england-nhle' } };
const wikidata = { provenance: { sourceId: 'wikidata' } };

describe('classifying a pair of records', () => {
  it('calls two records from one source same-source', () => {
    expect(classifySourcePair(nhle, nhle)).toBe(SourcePairRelation.SameSource);
  });

  it('calls two records from different sources cross-source', () => {
    expect(classifySourcePair(nhle, wikidata)).toBe(SourcePairRelation.CrossSource);
  });

  it('gates cross-source comparison on that classification alone', () => {
    expect(shouldCompareAcrossSources(nhle, nhle)).toBe(false);
    expect(shouldCompareAcrossSources(nhle, wikidata)).toBe(true);
    expect(shouldCompareAcrossSources(wikidata, nhle)).toBe(true);
  });
});

describe('describing why one register holds two overlapping entries', () => {
  const entry = (sourceRecordId: string, designations: string[]) => ({
    provenance: { sourceId: 'historic-england-nhle', sourceRecordId },
    designations: designations.map((designation) => ({ designation })),
  });

  it('recognises one entry arriving twice', () => {
    // The NHLE service returns one row per geometry part, so a multi-part World
    // Heritage Site such as Saltaire appears more than once under one id.
    expect(
      classifySameSourceOverlap(
        entry('1000099', ['world_heritage_site']),
        entry('1000099', ['world_heritage_site']),
      ),
    ).toBe(SameSourceOverlap.RepeatedEntry);
  });

  it('recognises one site protected two ways', () => {
    // Fountains Abbey is scheduled monument 1014395 and listed building 1149811.
    expect(
      classifySameSourceOverlap(
        entry('1014395', ['scheduled_monument']),
        entry('1149811', ['listed_building']),
      ),
    ).toBe(SameSourceOverlap.MultiDesignation);
  });

  it('recognises two genuinely separate entries', () => {
    expect(
      classifySameSourceOverlap(entry('1', ['listed_building']), entry('2', ['listed_building'])),
    ).toBe(SameSourceOverlap.DistinctEntries);
  });

  it('never calls any of them a conflict', () => {
    // The vocabulary is deliberately descriptive. None of these values asserts
    // that an entry is wrong, because none of them is evidence that one is.
    const values: string[] = Object.values(SameSourceOverlap);
    expect(values.some((v) => v.toLowerCase().includes('conflict'))).toBe(false);
  });
});

describe('the shared same-register hard veto', () => {
  const candidate = (
    sourceRecordId = 'candidate',
    designations: string[] = ['listed_building'],
  ) => ({
    provenance: { sourceId: 'historic-england-nhle', sourceRecordId },
    designations: designations.map((designation) => ({ designation })),
  });
  const existing = (
    sourceIdentity:
      | {
          sourceId: string;
          sourceRecordId: string;
          designations: string[];
        }
      | undefined = {
      sourceId: 'historic-england-nhle',
      sourceRecordId: 'existing',
      designations: ['listed_building'],
    },
  ) => ({ sourceIdentity });

  it.each([
    [
      'same source, shared designation, different record',
      'SAME_REGISTER_DIFFERENT_ENTRY',
      candidate(),
      existing(),
    ],
    ['same source, same record', 'SAME_SOURCE_SAME_RECORD', candidate('existing'), existing()],
    [
      'same source, different designation',
      'SAME_SOURCE_DIFFERENT_DESIGNATION',
      candidate('candidate', ['scheduled_monument']),
      existing(),
    ],
    [
      'different source',
      'CROSS_SOURCE',
      candidate(),
      existing({
        sourceId: 'wikidata',
        sourceRecordId: 'existing',
        designations: ['listed_building'],
      }),
    ],
    [
      'missing source identity',
      'MISSING_SOURCE_IDENTITY',
      candidate(),
      { sourceIdentity: undefined },
    ],
    [
      'zero candidate designations',
      'SAME_SOURCE_DIFFERENT_DESIGNATION',
      candidate('candidate', []),
      existing(),
    ],
    [
      'one designation overlaps among several',
      'SAME_REGISTER_DIFFERENT_ENTRY',
      candidate('candidate', ['scheduled_monument', 'listed_building']),
      existing({
        sourceId: 'historic-england-nhle',
        sourceRecordId: 'existing',
        designations: ['listed_building', 'world_heritage_site'],
      }),
    ],
    [
      'several designations with no overlap',
      'SAME_SOURCE_DIFFERENT_DESIGNATION',
      candidate('candidate', ['scheduled_monument', 'world_heritage_site']),
      existing({
        sourceId: 'historic-england-nhle',
        sourceRecordId: 'existing',
        designations: ['listed_building'],
      }),
    ],
  ])('%s', (_label, expected, subject, record) => {
    expect(classifyRegisterCandidate(subject, record)).toBe(expected);
    expect(sameRegisterDifferentEntries(subject, record)).toBe(
      expected === RegisterCandidateClass.SameRegisterDifferentEntry,
    );
  });
});

describe('a single-source run', () => {
  it('records same-source overlaps and raises no cross-source comparison', async () => {
    const report = await runIngestion({
      importRunId: 'single-source-test',
      sources: [
        {
          adapter: new HistoricEnglandNhleAdapter({ kind: 'file', path: YORKSHIRE_POC }),
          normalise: normaliseNhleRecord,
        },
      ],
    });

    const comparisonsMade = Object.entries(report.comparisons)
      .filter(([outcome]) => outcome !== ComparisonOutcome.NoMatch)
      .reduce((sum, [, count]) => sum + count, 0);

    expect(comparisonsMade).toBe(0);
    expect(report.comparisons[ComparisonOutcome.Conflict]).toBe(0);

    // Whatever overlaps the register does contain are counted as overlaps.
    const overlaps = Object.values(report.sameSourceOverlaps).reduce((a, b) => a + b, 0);
    expect(overlaps).toBe(report.withinSourceMatches);
  });
});
