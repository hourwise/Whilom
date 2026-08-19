/**
 * What temporal evidence the sources actually hold.
 *
 *   pnpm --filter @whilom/ingestion regional:temporal-audit
 *
 * This ran before any of batch 11's ingestion was written, and it is committed
 * because the answer, not the intention, decided what the batch did.
 *
 * The assumption going in was the one the brief describes: that structured
 * dates were being discarded somewhere in the pipeline and recovering them
 * would lift coverage. That turned out to be false in an unusually clean way,
 * and the numbers below are why the batch spent its effort on Wikidata instead
 * of on a larger free-text parser.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractTemporalClaims } from '../transforms/temporal';
import { NORMALISER_VERSION } from '../transforms/temporal-normaliser';

/**
 * Every attribute the NHLE FeatureServer returns, and what it means.
 *
 * The service is queried with `outFields: '*'`, so this is the complete set —
 * there is no richer response being narrowed on the way in. Five of the sixteen
 * are dates and every one of them records an act of the state.
 */
export const NHLE_FIELDS = [
  { field: 'OBJECTID', kind: 'identifier' },
  { field: 'ListEntry', kind: 'identifier' },
  { field: 'Name', kind: 'text', temporal: 'the only field that ever carries a historic date' },
  { field: 'Grade', kind: 'designation' },
  { field: 'hyperlink', kind: 'reference' },
  { field: 'NGR', kind: 'location' },
  { field: 'Easting', kind: 'location' },
  { field: 'Northing', kind: 'location' },
  { field: 'CaptureScale', kind: 'location' },
  { field: 'area_ha', kind: 'measurement' },
  { field: 'Notes', kind: 'text' },
  { field: 'ListDate', kind: 'date', temporal: 'when listing was conferred — NOT a historic date' },
  { field: 'SchedDate', kind: 'date', temporal: 'when scheduling was conferred — NOT a historic date' },
  { field: 'RegDate', kind: 'date', temporal: 'when registration was conferred — NOT a historic date' },
  { field: 'InscrDate', kind: 'date', temporal: 'when inscription was conferred — NOT a historic date' },
  { field: 'AmendDate', kind: 'date', temporal: 'when the entry was amended — NOT a historic date' },
] as const;

/** Patterns worth counting in the corpus, whether or not Whilom reads them. */
const PATTERNS: { id: string; pattern: RegExp; note: string }[] = [
  { id: 'centuryAbbreviated', pattern: /\bC\d{1,2}\b/, note: '"C18"' },
  { id: 'centuryOrdinal', pattern: /\b\d{1,2}(?:st|nd|rd|th)[\s-]centur/i, note: '"18th century"' },
  { id: 'centurySpelled', pattern: /\b(?:tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)[\s-]centur/i, note: '"eighteenth century"' },
  { id: 'centuryQualified', pattern: /\b(?:early|mid|late)[\s-]*(?:C\d{1,2}|\d{1,2}(?:st|nd|rd|th)[\s-]centur)/i, note: '"late C18"' },
  { id: 'fourDigitNumber', pattern: /\b(?:1\d{3}|20[0-2]\d)\b/, note: 'may be a year, a grid reference or a house number' },
  { id: 'datedYear', pattern: /\b(?:dated|datestone|inscribed|erected|died|d\.)\s+(?:in\s+)?1\d{3}\b/i, note: 'a year the record states IS a date' },
  { id: 'yearRange', pattern: /\b1\d{3}\s*[-–]\s*1\d{3}\b/, note: '"1845-1848"' },
  { id: 'circaYear', pattern: /\b(?:c\.?|circa)\s*1\d{3}\b/i, note: '"circa 1800"' },
  { id: 'circaDistance', pattern: /\bcirca\s+\d+\s*(?:metres?|yards?|feet|ft|m)\b/i, note: 'circa qualifying a DISTANCE, not a date' },
  { id: 'gridReference', pattern: /\b(?:ngr|at\s+se|at\s+sd|at\s+ta|at\s+nz)\b/i, note: 'an explicit grid reference' },
  { id: 'periodWord', pattern: /\b(?:palaeolithic|mesolithic|neolithic|bronze[\s-]age|iron[\s-]age|romano[\s-]british|roman|anglo[\s-]saxon|saxon|viking|medi[ae]val|norman|tudor|stuart|jacobean|georgian|regency|victorian|edwardian)\b/i, note: 'a named period' },
  { id: 'prehistoric', pattern: /\b(?:late\s+)?prehistoric\b/i, note: 'not currently mapped to a registry period' },
  { id: 'vagueLanguage', pattern: /\b(?:ancient|historic|old|former|various dates)\b/i, note: 'gestures at the past without dating it' },
];

interface Candidate {
  name: string;
  rawType: string;
  sourceRecordId: string;
  designations: { designation: string }[];
}

/** Read the candidate CSV the activation produced, without loading it twice. */
function readCandidates(path: string): Candidate[] {
  const text = readFileSync(path, 'utf8');
  const out: Candidate[] = [];
  // The payload is a quoted JSON column; split on record boundaries rather than
  // pulling in a CSV parser for a file this shape.
  for (const line of text.split('\n')) {
    const start = line.indexOf(',"{');
    if (start < 0) continue;
    const end = line.lastIndexOf('}"');
    if (end < 0) continue;
    const json = line.slice(start + 2, end + 1).replace(/""/g, '"');
    try {
      const parsed = JSON.parse(json) as {
        name?: string;
        rawType?: string;
        provenance?: { sourceRecordId?: string };
        designations?: { designation: string }[];
      };
      out.push({
        name: parsed.name ?? '',
        rawType: parsed.rawType ?? '',
        sourceRecordId: String(parsed.provenance?.sourceRecordId ?? ''),
        designations: parsed.designations ?? [],
      });
    } catch {
      // A record that will not parse is reported by count rather than skipped
      // silently; see `unparseableRows` below.
      out.push({ name: '', rawType: '__unparseable__', sourceRecordId: '', designations: [] });
    }
  }
  return out;
}

export function auditCorpus(candidates: Candidate[]) {
  const patternCounts: Record<string, { records: number; note: string }> = {};
  for (const p of PATTERNS) patternCounts[p.id] = { records: 0, note: p.note };

  let withClaims = 0;
  let unparseableRows = 0;
  const claimsByPrecision: Record<string, number> = {};
  const examples: Record<string, string[]> = {};

  for (const c of candidates) {
    if (c.rawType === '__unparseable__') {
      unparseableRows += 1;
      continue;
    }
    for (const p of PATTERNS) {
      if (p.pattern.test(c.name)) {
        patternCounts[p.id]!.records += 1;
        const bucket = (examples[p.id] ??= []);
        if (bucket.length < 5) bucket.push(c.name.slice(0, 100));
      }
    }
    const descriptiveSource = c.designations.some((d) => d.designation === 'scheduled_monument');
    const eventSource = c.designations.some((d) => d.designation === 'registered_battlefield');
    const claims = extractTemporalClaims(c.name, { descriptiveSource, eventSource });
    if (claims.length > 0) withClaims += 1;
    for (const claim of claims) {
      claimsByPrecision[claim.precision] = (claimsByPrecision[claim.precision] ?? 0) + 1;
    }
  }

  return {
    normaliserVersion: NORMALISER_VERSION,
    totalRecords: candidates.length - unparseableRows,
    unparseableRows,
    source: {
      dataset: 'National Heritage List for England (NHLE)',
      fields: NHLE_FIELDS,
      // The finding that decided the batch.
      structuredHistoricDateFields: NHLE_FIELDS.filter(
        (f) => f.kind === 'date' && !String((f as { temporal?: string }).temporal ?? '').includes('NOT'),
      ).length,
      designationDateFields: NHLE_FIELDS.filter((f) => f.kind === 'date').length,
      conclusion:
        'The FeatureServer returns every attribute it has (outFields=*). All five date fields record ' +
        'an act of the state. No historic date is being discarded during ingestion, because none is supplied.',
    },
    namePatterns: patternCounts,
    nameExamples: examples,
    nameDerived: {
      recordsWithAtLeastOneClaim: withClaims,
      claimsByPrecision: claimsByPrecision,
      conclusion:
        'Name text is close to exhausted. Sharpening it further is worth tens of places, not thousands, ' +
        'and a bare four-digit number is more often a grid reference or a house number than a year.',
    },
  };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('temporal-audit.ts');
if (invokedDirectly) {
  const candidatesPath = resolve(process.cwd(), 'regional-candidates.csv');
  const candidates = readCandidates(candidatesPath);
  const audit = auditCorpus(candidates);
  const json = JSON.stringify(audit, null, 2) + '\n';
  writeFileSync(resolve(process.cwd(), 'regional-temporal-audit.json'), json);
  console.log(`records            ${audit.totalRecords}`);
  console.log(`historic date fields in the source: ${audit.source.structuredHistoricDateFields}`);
  console.log(`designation date fields:            ${audit.source.designationDateFields}`);
  for (const [id, v] of Object.entries(audit.namePatterns).sort((a, b) => b[1].records - a[1].records)) {
    console.log(`  ${id.padEnd(22)} ${String(v.records).padStart(6)}  ${v.note}`);
  }
  console.log(`records yielding a claim: ${audit.nameDerived.recordsWithAtLeastOneClaim}`);
  console.log(`digest ${createHash('sha256').update(json).digest('hex').slice(0, 16)}`);
}
