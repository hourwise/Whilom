import { readFileSync } from 'node:fs';
import type { ExternalId, PlaceCandidate } from '../pipeline/candidate';
import type { Enrichment, EnrichmentSource } from './enrichment-source';

/**
 * Wikidata enrichment, keyed by NHLE list entry number (Wikidata property
 * P1216, "National Heritage List for England number").
 *
 * Wikidata earns its place here for one reason above all: it is a *cross-source
 * identifier*. Two NHLE records that resolve to the same Wikidata item are the
 * same real-world place according to a third party — which is far stronger
 * evidence than any name or distance heuristic. In the Yorkshire POC, NHLE
 * 1014395 (scheduled monument) and 1149811 (listed building) both resolve to
 * Q540237, Fountains Abbey.
 *
 * Structured data only. No description, article text or image is copied: the
 * Commons category is recorded as a pointer for later, and imagery ingestion
 * stays closed until licence/creator/attribution storage is proven end to end.
 *
 * Live SPARQL is deliberately not wired up in this batch — the query shape is
 * documented in the README and the interface is the same either way, so
 * swapping the fixture for the endpoint is a contained change.
 */

export const WIKIDATA_SOURCE_ID = 'wikidata';
export const WIKIDATA_LICENCE = 'CC0-1.0';
export const WIKIDATA_IMPORTER_VERSION = '0.1.0';

interface WikidataEntry {
  qid: string;
  label?: string;
  coordinates?: { lng: number; lat: number };
  inceptionYear?: number;
  officialWebsite?: string;
  commonsCategory?: string;
  altNames?: string[];
}

interface WikidataFixture {
  _source?: { retrievedAt?: string };
  byNhleId?: Record<string, WikidataEntry>;
}

export class WikidataEnrichmentSource implements EnrichmentSource {
  readonly id = WIKIDATA_SOURCE_ID;
  readonly displayName = 'Wikidata';
  readonly licence = WIKIDATA_LICENCE;

  private readonly entries: Record<string, WikidataEntry>;
  private readonly retrievedAt: string;

  constructor(fixturePath: string) {
    const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as WikidataFixture;
    this.entries = parsed.byNhleId ?? {};
    this.retrievedAt = parsed._source?.retrievedAt ?? new Date().toISOString();
  }

  async enrich(candidate: PlaceCandidate): Promise<Enrichment | null> {
    const nhleId = candidate.externalIds.find((id) => id.scheme === 'nhle')?.value;
    if (!nhleId) return null;
    const entry = this.entries[nhleId];
    if (!entry) return null;

    const externalIds: ExternalId[] = [{ scheme: 'wikidata', value: entry.qid }];

    return {
      provenance: {
        sourceId: WIKIDATA_SOURCE_ID,
        sourceRecordId: entry.qid,
        originalUrl: `https://www.wikidata.org/wiki/${entry.qid}`,
        licence: WIKIDATA_LICENCE,
        attribution: 'Wikidata contributors, CC0 1.0',
        retrievedAt: this.retrievedAt,
        importerVersion: WIKIDATA_IMPORTER_VERSION,
      },
      externalIds,
      altNames: [entry.label, ...(entry.altNames ?? [])].filter(
        (n): n is string => typeof n === 'string' && n.trim() !== '',
      ),
      ...(entry.coordinates ? { coordinates: entry.coordinates } : {}),
      ...(entry.inceptionYear !== undefined ? { inceptionYear: entry.inceptionYear } : {}),
      ...(entry.officialWebsite ? { officialWebsite: entry.officialWebsite } : {}),
      ...(entry.commonsCategory ? { commonsCategory: entry.commonsCategory } : {}),
      relatedPeople: [],
    };
  }
}

/**
 * Apply an enrichment to a candidate without letting it overwrite anything.
 *
 * Only additive fields move: new external identifiers and new alternative
 * names. The enriching source's coordinate is *not* written over the primary
 * source's — position stays the responsibility of whichever source is
 * authoritative for it, and disagreement is raised as a warning instead.
 */
export function applyEnrichment(
  candidate: PlaceCandidate,
  enrichment: Enrichment,
  coordinateToleranceMeters: number,
  distance: (a: { lng: number; lat: number }, b: { lng: number; lat: number }) => number,
): PlaceCandidate {
  const knownIds = new Set(candidate.externalIds.map((id) => `${id.scheme}:${id.value}`));
  const externalIds = [...candidate.externalIds];
  for (const id of enrichment.externalIds) {
    if (!knownIds.has(`${id.scheme}:${id.value}`)) externalIds.push(id);
  }

  const knownNames = new Set([candidate.name, ...candidate.altNames].map((n) => n.toLowerCase()));
  const altNames = [...candidate.altNames];
  for (const name of enrichment.altNames) {
    if (!knownNames.has(name.toLowerCase())) altNames.push(name);
  }

  const warnings = [...candidate.warnings];
  if (enrichment.coordinates) {
    const meters = distance(candidate.location, enrichment.coordinates);
    if (meters > coordinateToleranceMeters) {
      warnings.push(
        `${enrichment.provenance.sourceId} places this ${Math.round(meters)}m from the primary source's coordinate`,
      );
    }
  }

  return { ...candidate, externalIds, altNames, warnings };
}
