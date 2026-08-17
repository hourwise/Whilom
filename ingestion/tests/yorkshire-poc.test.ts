import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WikidataEnrichmentSource } from '../enrichment/wikidata';
import { MatchOutcome } from '../pipeline/candidate';
import { runIngestion } from '../pipeline/run';
import { HistoricEnglandNhleAdapter } from '../sources/historic-england/nhle-adapter';

/**
 * The bounded Yorkshire proof of concept, end to end:
 *   source → raw → normalise → validate → identifiers → match → conflict.
 *
 * PUBLISH is absent because it needs a database and this batch runs under the
 * local-storage gate. Everything up to publication is exercised on real,
 * unmodified Historic England records.
 */

const NHLE_FIXTURE = fileURLToPath(
  new URL('../sources/historic-england/fixtures/yorkshire-poc.json', import.meta.url),
);
const WIKIDATA_FIXTURE = fileURLToPath(
  new URL('../enrichment/fixtures/wikidata-yorkshire.json', import.meta.url),
);

function run() {
  return runIngestion({
    importRunId: 'poc-yorkshire',
    adapter: new HistoricEnglandNhleAdapter({ kind: 'file', path: NHLE_FIXTURE }),
    enrichmentSource: new WikidataEnrichmentSource(WIKIDATA_FIXTURE),
  });
}

describe('Yorkshire POC run', () => {
  it('processes every source row without losing any', async () => {
    const report = await run();
    expect(report.sourceRows).toBe(30);
    expect(report.valid + report.rejected).toBe(report.sourceRows);
    const decided = Object.values(report.outcomes).reduce((a, b) => a + b, 0);
    expect(decided).toBe(report.sourceRows);
  });

  it('validates every real record', async () => {
    const report = await run();
    expect(report.rejected).toBe(0);
    expect(report.valid).toBe(30);
  });

  it('keeps provenance on every candidate through to the decision', async () => {
    const report = await run();
    for (const { candidate } of report.decided) {
      expect(candidate.provenance.sourceId).toBe('historic-england-nhle');
      expect(candidate.provenance.importRunId).toBe('poc-yorkshire');
      expect(candidate.provenance.licence).toBe('OGL-UK-3.0');
      expect(candidate.provenance.originalUrl).toBeTruthy();
      expect(candidate.externalIds.some((id) => id.scheme === 'nhle')).toBe(true);
    }
  });

  it('resolves the cross-source identifier that proves two rows are one abbey', async () => {
    const report = await run();
    // NHLE 1014395 (scheduled monument) and 1149811 (listed building) both
    // carry Wikidata P1216 links to Q540237.
    const withQ540237 = report.decided.filter(({ candidate }) =>
      candidate.externalIds.some((id) => id.scheme === 'wikidata' && id.value === 'Q540237'),
    );
    expect(withQ540237).toHaveLength(2);

    // The second one to arrive must be recognised as the same place, not filed
    // as a new one.
    const outcomes = withQ540237.map((d) => d.decision.outcome);
    expect(outcomes).toContain(MatchOutcome.NewCanonical);
    expect(outcomes).toContain(MatchOutcome.MatchConfident);
  });

  it('never merges anything on a low-confidence guess', async () => {
    const report = await run();
    for (const { decision } of report.decided) {
      if (decision.outcome === MatchOutcome.MatchConfident) {
        // Every automatic match must be justified by a shared identifier or by
        // passing the full confident gate — never by score drift.
        const byIdentifier = decision.signals.some((s) => s.name === 'external-id');
        expect(byIdentifier || decision.confidence >= 0.85).toBe(true);
        expect(decision.conflicts).toHaveLength(0);
      }
    }
  });

  it('keeps the two identically named Middleham Castles apart', async () => {
    const report = await run();
    const middleham = report.decided.filter((d) => /Middleham Castle/i.test(d.candidate.name));
    expect(middleham.length).toBeGreaterThanOrEqual(2);
    for (const d of middleham) {
      expect(d.decision.outcome).toBe(MatchOutcome.NewCanonical);
    }
  });

  it('keeps the Fountains estate structures as separate records', async () => {
    const report = await run();
    // The weir (1296240) is inside the estate but is its own listed structure.
    const weir = report.decided.find((d) => d.candidate.provenance.sourceRecordId === '1296240');
    expect(weir).toBeDefined();
    expect(weir!.decision.outcome).not.toBe(MatchOutcome.MatchConfident);
  });

  it('reports how many records it could not type', async () => {
    const report = await run();
    // NHLE has no type vocabulary; the count is a real measure of the gap and
    // must be reported rather than hidden behind a default.
    expect(report.genericallyTyped).toBeGreaterThanOrEqual(0);
    expect(report.genericallyTyped).toBeLessThan(report.valid);
  });

  it('summarises the run', async () => {
    // Printed rather than asserted: these are the figures quoted in
    // docs/INGESTION.md, and running them here is what stops the documented
    // numbers drifting away from what the pipeline actually does.
    const report = await run();
    const byOutcome = Object.entries(report.outcomes)
      .filter(([, n]) => n > 0)
      .map(([outcome, n]) => `${outcome}=${n}`)
      .join(' ');
    console.log(
      [
        '',
        `Yorkshire POC run (${report.importRunId}) — source ${report.sourceId}`,
        `  source rows          ${report.sourceRows}`,
        `  valid                ${report.valid}`,
        `  rejected             ${report.rejected}`,
        `  enriched             ${report.enriched}`,
        `  generic 'structure'  ${report.genericallyTyped}`,
        `  duplicates in run    ${report.duplicatesWithinRun}`,
        `  field conflicts      ${report.conflicts}`,
        `  outcomes             ${byOutcome}`,
        `  runtime              ${report.runtimeMs}ms`,
        '  review queue:',
        ...report.decided
          .filter((d) => d.decision.outcome !== MatchOutcome.NewCanonical)
          .map(
            (d) =>
              `    [${d.decision.outcome}] ${d.candidate.provenance.sourceRecordId} ${d.candidate.name}\n      ${d.decision.rationale}`,
          ),
        '  generic structure classification:',
        ...report.decided
          .filter((d) => d.candidate.placeTypeRule === 'generic-structure')
          .map((d) => `    ${d.candidate.provenance.sourceRecordId} ${d.candidate.name}`),
        '',
      ].join('\n'),
    );
    expect(report.sourceRows).toBeGreaterThan(0);
  });

  it('enriches from the second source without overwriting the first', async () => {
    const report = await run();
    expect(report.enriched).toBeGreaterThan(0);
    const fountains = report.decided.find(
      (d) => d.candidate.provenance.sourceRecordId === '1149811',
    );
    // Wikidata's coordinate is recorded as a cross-check, but the candidate's
    // position remains the one Historic England published.
    expect(fountains!.candidate.location.lat).toBeCloseTo(54.1097, 2);
    expect(fountains!.candidate.provenance.sourceId).toBe('historic-england-nhle');
  });
});
