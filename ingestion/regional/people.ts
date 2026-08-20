/**
 * Bounded people enrichment for the regional dataset.
 *
 *   pnpm --filter @whilom/ingestion regional:people
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it deliberately is not
 * ---------------------------------------------------------------------------
 *
 * The National Heritage List names no people at all, so the regional corpus
 * arrived with a person graph of exactly one row. Without people there is
 * nothing for "who do you want to follow through history" to follow.
 *
 * This fills that gap from Wikidata — an already-approved source, not a new one
 * — and it is bounded in the way that matters: it asks only for people already
 * attached to places Whilom has published. Nobody is imported because they are
 * famous. If a person is not connected to the regional corpus they do not
 * appear, which is why the resulting cast is Victorian country-house architects
 * rather than the monarchs an example sentence would prefer.
 *
 * Only structured claims are taken: name, birth, death, and the property that
 * links the person to the place. No biography prose is ingested from anywhere.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSparql } from '../sources/wikidata/sparql';
import { readRegionalManifest } from './capture';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PEOPLE_CACHE_DIR = resolve(HERE, '../.regional-cache');
export const PEOPLE_CACHE_FILE = resolve(PEOPLE_CACHE_DIR, 'regional-people.json');

export const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
export const WIKIDATA_SOURCE_KEY = 'wikidata';
export const PEOPLE_IMPORTER_VERSION = '0.1.0';

/**
 * The Wikidata properties worth following, and the Whilom predicate each maps
 * onto.
 *
 * Deliberately narrow. These are the four that reliably connect a *person* to a
 * *listed structure*; broader properties drag in organisations, dynasties and
 * everyone who ever owned a field.
 */
export const PERSON_PROPERTIES = [
  { property: 'P84', role: 'architect', predicate: 'built_by', label: 'designed' },
  { property: 'P112', role: 'founder', predicate: 'built_by', label: 'founded' },
  { property: 'P127', role: 'owner', predicate: 'owned_by', label: 'owned' },
  { property: 'P138', role: 'named_after', predicate: 'associated_with', label: 'named after' },
] as const;

/** Cap on people imported, so a bounded enrichment stays bounded. */
export const PEOPLE_CAP = 400;

export interface PersonClaim {
  qid: string;
  name: string;
  /** Signed year, historical convention. Null when the source does not say. */
  birthYear: number | null;
  deathYear: number | null;
  /** The source's own date strings, kept verbatim as the evidence. */
  birthRaw: string | null;
  deathRaw: string | null;
  /** How precisely the source gave the date. */
  birthPrecision: 'day' | 'year' | 'unknown';
  deathPrecision: 'day' | 'year' | 'unknown';
}

export interface PersonPlaceLink {
  qid: string;
  /** NHLE list entry of the regional place. */
  sourceRecordId: string;
  predicate: string;
  /** The source's own word for the role, kept so mapping loses no nuance. */
  role: string;
}

export interface PeopleCapture {
  retrievedAt: string;
  endpoint: string;
  properties: typeof PERSON_PROPERTIES;
  people: PersonClaim[];
  links: PersonPlaceLink[];
  /** Rows the query returned before the regional intersection. */
  candidateRows: number;
}

/**
 * Read a signed year out of a Wikidata time literal.
 *
 * Wikidata writes BCE years with a leading minus and pads to four digits
 * ("-0500-01-01T00:00:00Z"). The historical convention has no year zero, so a
 * literal year 0 — which Wikidata does emit for 1 BCE — is normalised to -1
 * rather than carried through as a year that does not exist.
 */
export function parseWikidataYear(value: string | null | undefined): {
  year: number | null;
  precision: 'day' | 'year' | 'unknown';
} {
  if (!value) return { year: null, precision: 'unknown' };
  const match = /^(-?)(\d{4,})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return { year: null, precision: 'unknown' };
  const sign = match[1] === '-' ? -1 : 1;
  const magnitude = Number(match[2]);
  let year = sign * magnitude;
  if (year === 0) year = -1;
  // Wikidata uses 00-00 for year-only precision.
  const precision = match[3] === '00' || match[4] === '00' ? 'year' : 'day';
  return { year, precision };
}


export async function capturePeople(): Promise<PeopleCapture> {
  const manifest = readRegionalManifest();
  const regional = new Set(manifest.sourceRecordIds.map(String));

  const people = new Map<string, PersonClaim>();
  const links: PersonPlaceLink[] = [];
  let candidateRows = 0;

  for (const spec of PERSON_PROPERTIES) {
    // One property at a time: the combined UNION form times out on the public
    // endpoint, and four cheap queries are kinder to a shared service than one
    // expensive one.
    const query = `SELECT ?nhle ?person ?personLabel ?birth ?death WHERE {
  ?item wdt:P1216 ?nhle ; wdt:${spec.property} ?person .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?person wdt:P569 ?birth }
  OPTIONAL { ?person wdt:P570 ?death }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 4000`;

    const rows = await runSparql(query, {
      userAgent: `Whilom/${PEOPLE_IMPORTER_VERSION} (bounded regional people enrichment)`,
    });
    candidateRows += rows.length;

    for (const row of rows) {
      const nhle = row['nhle']?.value?.trim();
      const personUri = row['person']?.value;
      const name = row['personLabel']?.value;
      if (!nhle || !personUri || !name) continue;
      // The intersection that makes this bounded: only people attached to a
      // place this region actually published.
      if (!regional.has(nhle)) continue;

      const qid = personUri.split('/').pop()!;
      // A Wikidata label that is still a QID means the item has no English
      // label; a person Whilom cannot name is not a person Whilom can show.
      if (/^Q\d+$/.test(name)) continue;

      if (!people.has(qid)) {
        const birth = parseWikidataYear(row['birth']?.value);
        const death = parseWikidataYear(row['death']?.value);
        people.set(qid, {
          qid,
          name,
          birthYear: birth.year,
          deathYear: death.year,
          birthRaw: row['birth']?.value ?? null,
          deathRaw: row['death']?.value ?? null,
          birthPrecision: birth.precision,
          deathPrecision: death.precision,
        });
      }
      links.push({ qid, sourceRecordId: nhle, predicate: spec.predicate, role: spec.role });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Cap deterministically by QID so a rebuild takes the same people.
  const ordered = [...people.values()].sort((a, b) =>
    Number(a.qid.slice(1)) - Number(b.qid.slice(1)),
  );
  const kept = ordered.slice(0, PEOPLE_CAP);
  const keptIds = new Set(kept.map((p) => p.qid));

  const capture: PeopleCapture = {
    retrievedAt: new Date().toISOString(),
    endpoint: WIKIDATA_SPARQL_ENDPOINT,
    properties: PERSON_PROPERTIES,
    people: kept,
    links: links.filter((l) => keptIds.has(l.qid)),
    candidateRows,
  };

  mkdirSync(PEOPLE_CACHE_DIR, { recursive: true });
  writeFileSync(PEOPLE_CACHE_FILE, JSON.stringify(capture, null, 2) + '\n');
  return capture;
}

export function readPeopleCapture(): PeopleCapture {
  return JSON.parse(readFileSync(PEOPLE_CACHE_FILE, 'utf8')) as PeopleCapture;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** A stable slug per person, disambiguated by QID rather than by name. */
export function personSlug(person: PersonClaim): string {
  const base = person.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // Names are not identities. Two people called Henry IV are two people, so the
  // slug carries the canonical identifier rather than trusting the name.
  return `${base || 'person'}-${person.qid.toLowerCase()}`;
}

/** Emit the CSVs the activation SQL loads. */
export function writePeopleCsv(capture: PeopleCapture, outDir: string): void {
  const people = capture.people.map((p) =>
    [
      csvField(p.qid),
      csvField(personSlug(p)),
      csvField(p.name),
      csvField(p.birthYear === null ? '' : String(p.birthYear)),
      csvField(p.deathYear === null ? '' : String(p.deathYear)),
      csvField(p.birthRaw ?? ''),
      csvField(p.deathRaw ?? ''),
      csvField(p.birthPrecision),
      csvField(p.deathPrecision),
    ].join(','),
  );
  const links = capture.links.map((l) =>
    [csvField(l.qid), csvField(l.sourceRecordId), csvField(l.predicate), csvField(l.role)].join(','),
  );
  writeFileSync(resolve(outDir, 'regional-people.csv'), people.join('\n') + (people.length ? '\n' : ''));
  writeFileSync(resolve(outDir, 'regional-person-links.csv'), links.join('\n') + (links.length ? '\n' : ''));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.cwd();
  const run = async () => {
    const capture =
      existsSync(PEOPLE_CACHE_FILE) && !process.argv.includes('--refresh')
        ? readPeopleCapture()
        : await capturePeople();

    writePeopleCsv(capture, outDir);

    const withDates = capture.people.filter((p) => p.birthYear !== null || p.deathYear !== null);
    const places = new Set(capture.links.map((l) => l.sourceRecordId));
    console.log(`candidate rows   ${capture.candidateRows} (before the regional intersection)`);
    console.log(`people           ${capture.people.length} (cap ${PEOPLE_CAP})`);
    console.log(`with a date      ${withDates.length} (${((withDates.length / Math.max(1, capture.people.length)) * 100).toFixed(0)}%)`);
    console.log(`person-place     ${capture.links.length} links across ${places.size} places`);
    const digest = createHash('sha256').update(JSON.stringify(capture.people)).digest('hex');
    console.log(`people digest    ${digest.slice(0, 16)}`);
  };
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
