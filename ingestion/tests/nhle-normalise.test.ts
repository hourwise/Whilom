import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { placeCandidateSchema } from '@whilom/validation';
import {
  HistoricEnglandNhleAdapter,
  NHLE_SOURCE_ID,
  epochToIso,
} from '../sources/historic-england/nhle-adapter';
import { deriveAltNames, normaliseNhleRecord, tidyName } from '../transforms/normalise-nhle';
import { inferPlaceType } from '../transforms/place-type';
import type { RawPlaceRecord } from '../sources/source-adapter';

const FIXTURE = fileURLToPath(
  new URL('../sources/historic-england/fixtures/yorkshire-poc.json', import.meta.url),
);

async function collect(): Promise<RawPlaceRecord[]> {
  const adapter = new HistoricEnglandNhleAdapter({ kind: 'file', path: FIXTURE });
  const out: RawPlaceRecord[] = [];
  for await (const record of adapter.fetch()) out.push(record);
  return out;
}

describe('HistoricEnglandNhleAdapter (file mode)', () => {
  it('reads the Yorkshire POC fixture', async () => {
    const records = await collect();
    expect(records).toHaveLength(30);
  });

  it('gives every record complete provenance', async () => {
    for (const record of await collect()) {
      const p = record.provenance;
      expect(p.sourceId).toBe(NHLE_SOURCE_ID);
      expect(p.sourceRecordId).toMatch(/^\d+$/);
      expect(p.originalUrl).toContain('historicengland.org.uk');
      expect(p.licence).toBe('OGL-UK-3.0');
      expect(p.attribution).toContain('Open Government Licence');
      expect(() => new Date(p.retrievedAt).toISOString()).not.toThrow();
      expect(p.importerVersion).toBeTruthy();
    }
  });

  it('keeps the untouched source attributes for audit', async () => {
    const [first] = await collect();
    const extra = first!.extra as { attributes: Record<string, unknown>; layerId: number };
    expect(extra.attributes['ListEntry']).toBeTypeOf('number');
    expect(extra.attributes['NGR']).toBeTypeOf('string');
    expect(extra.layerId).toBeTypeOf('number');
  });

  it('drops rows with no usable identity but keeps everything else', async () => {
    // A row missing ListEntry or Name has no identity at all and cannot be
    // reported against; anything else must survive to be rejected explicitly.
    const adapter = new HistoricEnglandNhleAdapter({ kind: 'file', path: FIXTURE });
    const records: RawPlaceRecord[] = [];
    for await (const r of adapter.fetch()) records.push(r);
    expect(records.every((r) => r.name.trim() !== '')).toBe(true);
  });
});

describe('epochToIso', () => {
  it('handles the pre-1970 dates NHLE is full of', () => {
    // Scheduled monuments carry scheduling dates from the 1910s onward, which
    // ArcGIS returns as negative epoch milliseconds.
    // -1732406400000 is the scheduling date on NHLE 1014395 (Fountains Abbey).
    expect(epochToIso(-1732406400000)).toBe('1915-02-08T00:00:00.000Z');
    expect(epochToIso(null)).toBeUndefined();
    expect(epochToIso('1915')).toBeUndefined();
  });
});

describe('tidyName / deriveAltNames', () => {
  it('title-cases legacy shouting names but leaves mixed case alone', () => {
    expect(tidyName('BURTON CONSTABLE HALL')).toBe('Burton Constable Hall');
    expect(tidyName('CHURCH OF ST MARY')).toBe('Church of St Mary');
    expect(tidyName('Old Malton Priory Church (ruined portions)')).toBe(
      'Old Malton Priory Church (ruined portions)',
    );
  });

  it('keeps the site name from a long scheduling description', () => {
    const scheduled =
      'Fountains Cistercian Abbey; monastic precinct, mill, water management works, agricultural and industrial features and 18th century gardens';
    expect(deriveAltNames(scheduled, scheduled)).toContain('Fountains Cistercian Abbey');
  });
});

describe('inferPlaceType', () => {
  it('reads types out of names where it can', () => {
    expect(inferPlaceType('Rievaulx Abbey Cistercian monastery').placeType).toBe('abbey');
    expect(inferPlaceType('Middleham Castle').placeType).toBe('castle');
    expect(inferPlaceType('WW2 Pillbox And 2 Fire Posts').placeType).toBe('pillbox');
    expect(inferPlaceType('Weighton Lock').placeType).toBe('canal_structure');
    expect(inferPlaceType('Battle of Towton, 1461', 'Battlefields').placeType).toBe('battlefield');
  });

  it('does not let a false friend fool it', () => {
    // "Castle Farmhouse" is a farmhouse, not a castle.
    expect(inferPlaceType('CASTLE FARMHOUSE AND ADJOINING BARN').placeType).not.toBe('castle');
  });

  it('reports zero confidence rather than guessing', () => {
    const inferred = inferPlaceType('Numbers 12 And 14 And Attached Railings');
    expect(inferred.confidence).toBe(0);
    expect(inferred.rule).toBe('unmatched');
  });
});

describe('normaliseNhleRecord', () => {
  it('produces candidates that satisfy the shared validation schema', async () => {
    for (const raw of await collect()) {
      const result = normaliseNhleRecord(raw, 'test-run');
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const parsed = placeCandidateSchema.safeParse(result.candidate);
      if (!parsed.success) {
        throw new Error(
          `${result.candidate.name}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
        );
      }
    }
  });

  it('carries provenance and the source identifier through normalisation', async () => {
    const [raw] = await collect();
    const result = normaliseNhleRecord(raw!, 'run-42');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.provenance.importRunId).toBe('run-42');
    expect(result.candidate.provenance.sourceRecordId).toBe(raw!.provenance.sourceRecordId);
    expect(result.candidate.externalIds).toContainEqual({
      scheme: 'nhle',
      value: raw!.provenance.sourceRecordId,
    });
  });

  it('attaches the designation the layer implies, with its reference', async () => {
    const records = await collect();
    const fountains = records.find((r) => r.provenance.sourceRecordId === '1149811');
    const result = normaliseNhleRecord(fountains!, 'run');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [designation] = result.candidate.designations;
    expect(designation?.designation).toBe('listed_building');
    expect(designation?.grade).toBe('I');
    expect(designation?.reference).toBe('1149811');
  });

  it('rejects a record with no coordinates instead of inventing one', () => {
    const broken: RawPlaceRecord = {
      provenance: {
        sourceId: NHLE_SOURCE_ID,
        sourceRecordId: '1',
        retrievedAt: '2026-08-17T00:00:00.000Z',
        importerVersion: '0.1.0',
      },
      name: 'Nowhere',
      extra: { layerName: 'Scheduled Monuments', designation: 'scheduled_monument', attributes: {} },
    };
    const result = normaliseNhleRecord(broken, 'run');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.reasons.join(' ')).toContain('Easting');
    // A rejection still has to say where it came from.
    expect(result.rejected.provenance.sourceRecordId).toBe('1');
  });

  it('rejects a grid reference outside Great Britain', () => {
    const broken: RawPlaceRecord = {
      provenance: {
        sourceId: NHLE_SOURCE_ID,
        sourceRecordId: '2',
        retrievedAt: '2026-08-17T00:00:00.000Z',
        importerVersion: '0.1.0',
      },
      name: 'Impossible Place',
      extra: {
        layerName: 'Scheduled Monuments',
        designation: 'scheduled_monument',
        attributes: { Easting: 9_000_000, Northing: 42 },
      },
    };
    const result = normaliseNhleRecord(broken, 'run');
    expect(result.ok).toBe(false);
  });

  it('records what NHLE cannot tell us rather than filling it in', async () => {
    const [raw] = await collect();
    const result = normaliseNhleRecord(raw!, 'run');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.town).toBeUndefined();
    expect(result.candidate.county).toBeUndefined();
    expect(result.candidate.postcode).toBeUndefined();
    expect(result.candidate.warnings.join(' ')).toContain('no town/county/postcode');
  });
});
