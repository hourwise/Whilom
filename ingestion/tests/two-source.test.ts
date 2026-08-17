import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ComparisonOutcome } from '../matching/compare';
import { MatchOutcome } from '../pipeline/candidate';
import { runIngestion } from '../pipeline/run';
import { HistoricEnglandNhleAdapter } from '../sources/historic-england/nhle-adapter';
import { WikidataSourceAdapter } from '../sources/wikidata/wikidata-adapter';
import { normaliseNhleRecord } from '../transforms/normalise-nhle';
import { normaliseWikidataRecord } from '../transforms/normalise-wikidata';

/**
 * The Phase 0B proof: two genuinely independent sources describing overlapping
 * heritage, run through one pipeline with no per-source branching.
 *
 * Historic England is authoritative on designation and position but publishes
 * no type and no dates. Wikidata publishes types, inception dates and websites
 * but places its points by hand. Neither is a superset of the other, which is
 * exactly why cross-source behaviour cannot be proven with one of them.
 */

const NHLE_FIXTURE = fileURLToPath(
  new URL('../sources/historic-england/fixtures/yorkshire-poc.json', import.meta.url),
);
const WIKIDATA_FIXTURE = fileURLToPath(
  new URL('../sources/wikidata/fixtures/yorkshire-wikidata.json', import.meta.url),
);

function twoSourceRun() {
  return runIngestion({
    importRunId: 'poc-two-source',
    sources: [
      {
        adapter: new HistoricEnglandNhleAdapter({ kind: 'file', path: NHLE_FIXTURE }),
        normalise: normaliseNhleRecord,
      },
      {
        adapter: new WikidataSourceAdapter({ kind: 'file', path: WIKIDATA_FIXTURE }),
        normalise: normaliseWikidataRecord,
      },
    ],
  });
}

describe('Wikidata as an independent source', () => {
  it('carries the same provenance contract as any other source', async () => {
    const adapter = new WikidataSourceAdapter({ kind: 'file', path: WIKIDATA_FIXTURE });
    let count = 0;
    for await (const raw of adapter.fetch()) {
      count += 1;
      expect(raw.provenance.sourceId).toBe('wikidata');
      expect(raw.provenance.sourceRecordId).toMatch(/^Q\d+$/);
      expect(raw.provenance.originalUrl).toContain('wikidata.org/wiki/Q');
      expect(raw.provenance.licence).toBe('CC0-1.0');
      expect(raw.provenance.attribution).toContain('CC0');
      expect(() => new Date(raw.provenance.retrievedAt).toISOString()).not.toThrow();
      expect(raw.provenance.importerVersion).toBeTruthy();
    }
    expect(count).toBeGreaterThanOrEqual(20);
    expect(count).toBeLessThanOrEqual(40);
  });

  it('never trusts a Wikidata point as a survey fix', async () => {
    // Items in this sample claim 0.000001 degrees — about 11cm. No volunteer
    // dropping a pin on an abbey means that, and believing it would let the
    // matcher merge things it should not.
    const adapter = new WikidataSourceAdapter({ kind: 'file', path: WIKIDATA_FIXTURE });
    for await (const raw of adapter.fetch()) {
      const result = normaliseWikidataRecord(raw, 'run');
      if (!result.ok) continue;
      expect(result.candidate.locationAccuracyMeters).toBeGreaterThanOrEqual(25);
      expect(result.candidate.sourcePosition?.crs).toBe('EPSG:4326');
      expect(result.candidate.sourcePosition?.conversion).toBe('none/wgs84-native');
    }
  });

  it('supplies types where Historic England had none', async () => {
    // NHLE publishes no type vocabulary at all. Wikidata does — this is the
    // clearest case of the second source being complementary rather than
    // redundant.
    const adapter = new WikidataSourceAdapter({ kind: 'file', path: WIKIDATA_FIXTURE });
    const typed: string[] = [];
    for await (const raw of adapter.fetch()) {
      const result = normaliseWikidataRecord(raw, 'run');
      if (result.ok && result.candidate.placeTypeConfidence >= 0.7) {
        typed.push(result.candidate.placeType);
      }
    }
    expect(typed.length).toBeGreaterThan(10);
    expect(typed).toContain('castle');
    expect(typed).toContain('battlefield');
  });
});

describe('two-source run', () => {
  it('processes both sources through one pipeline', async () => {
    const report = await twoSourceRun();
    expect(report.sourceIds).toEqual(['historic-england-nhle', 'wikidata']);
    expect(report.sourceRows).toBeGreaterThan(60);
    expect(report.valid + report.rejected).toBe(report.sourceRows);
  });

  it('recognises the same abbey across two independent sources', async () => {
    const report = await twoSourceRun();
    // Wikidata Q540237 carries P1216 links to NHLE 1014395 and 1149811.
    const fountains = report.decided.find(
      (d) => d.candidate.provenance.sourceRecordId === 'Q540237',
    );
    expect(fountains).toBeDefined();
    expect(fountains!.decision.outcome).not.toBe(MatchOutcome.NewCanonical);
    expect(fountains!.decision.signals.some((s) => s.name === 'external-id')).toBe(true);
  });

  it('produces complementary outcomes, not just agreement', async () => {
    const report = await twoSourceRun();
    const complementary = report.comparisons[ComparisonOutcome.Complementary];
    expect(complementary).toBeGreaterThan(0);
  });

  it('keeps the regression protections that predate the second source', async () => {
    const report = await twoSourceRun();

    // Two different places both named "Middleham Castle", 48km apart.
    const middleham = report.decided.filter((d) => /^Middleham Castle$/i.test(d.candidate.name));
    for (const d of middleham) {
      if (d.candidate.provenance.sourceId === 'historic-england-nhle') {
        expect(d.decision.outcome).toBe(MatchOutcome.NewCanonical);
      }
    }

    // The weir inside the Fountains estate is its own listed structure.
    const weir = report.decided.find((d) => d.candidate.provenance.sourceRecordId === '1296240');
    expect(weir!.decision.outcome).not.toBe(MatchOutcome.MatchConfident);

    // Saltaire the World Heritage Site is not Saltaire Mills.
    const saltaire = report.decided.find((d) => d.candidate.provenance.sourceRecordId === '1000099');
    expect(saltaire!.decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('never auto-merges on a low-confidence guess, with either source', async () => {
    const report = await twoSourceRun();
    for (const { decision } of report.decided) {
      if (decision.outcome === MatchOutcome.MatchConfident) {
        const byIdentifier = decision.signals.some((s) => s.name === 'external-id');
        expect(byIdentifier || decision.confidence >= 0.85).toBe(true);
      }
    }
  });

  it('summarises the two-source run', async () => {
    const report = await twoSourceRun();
    const line = (label: string, value: unknown) => `  ${label.padEnd(22)}${value}`;
    console.log(
      [
        '',
        `Two-source run (${report.importRunId}) — ${report.sourceIds.join(' + ')}`,
        line('source rows', report.sourceRows),
        line('valid', report.valid),
        line('rejected', report.rejected),
        line('match outcomes', Object.entries(report.outcomes).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' ')),
        line('comparisons', Object.entries(report.comparisons).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' ')),
        line('field conflicts', report.conflicts),
        line('fallback-typed', report.genericallyTyped),
        '  cross-source matches:',
        ...report.decided
          .filter((d) => d.comparison)
          .map(
            (d) =>
              `    [${d.comparison!.outcome}] ${d.candidate.provenance.sourceId}:${d.candidate.provenance.sourceRecordId} ${d.candidate.name}\n` +
              `      agree=${d.comparison!.agreements.length} complementary=${d.comparison!.complementary.length} conflict=${d.comparison!.conflicts.length}` +
              (d.comparison!.conflicts.length
                ? `\n      conflicts: ${d.comparison!.conflicts.map((c) => `${c.field} (${c.existingValue} vs ${c.incomingValue})`).join('; ')}`
                : ''),
          ),
        '',
      ].join('\n'),
    );
    expect(report.sourceRows).toBeGreaterThan(0);
  });
});
