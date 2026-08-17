import type { PlaceCandidate } from '../pipeline/candidate';
import { distanceMeters } from '../transforms/osgb';
import { typesAreCompatible } from '../transforms/place-type';
import { bestNameSimilarity } from './name';

/**
 * Cross-source comparison (spec §36).
 *
 * Once two sources describe the same place, the interesting question stops
 * being "are these the same thing" and becomes "do they agree". Three answers
 * matter and they are not the same:
 *
 *   AGREEMENT      both sources assert the same value. Corroboration.
 *   COMPLEMENTARY  one asserts a value the other is silent about. Nearly all
 *                  useful cross-source data is this, and treating it as
 *                  disagreement would drown a reviewer in noise.
 *   CONFLICT       both assert, and the assertions cannot both be true.
 *
 * The distinction that keeps this honest is *predicate identity*. "Construction
 * began 1150" and "completed 1180" are not contradictory — they answer
 * different questions. Only like predicates are ever compared.
 */

export const FieldOutcome = {
  Agreement: 'AGREEMENT',
  Complementary: 'COMPLEMENTARY',
  Conflict: 'CONFLICT',
} as const;
export type FieldOutcome = (typeof FieldOutcome)[keyof typeof FieldOutcome];

export const ComparisonOutcome = {
  /** Same place, sources corroborate and add nothing contradictory. */
  Agreement: 'MATCH_AGREEMENT',
  /** Same place; the second source adds facts the first did not have. */
  Complementary: 'MATCH_COMPLEMENTARY',
  /** Same place, but at least one assertion cannot be reconciled. */
  Conflict: 'MATCH_CONFLICT',
  /** Cannot say which existing place this is. */
  Ambiguous: 'MATCH_AMBIGUOUS',
  /** Not the same place as anything known. */
  NoMatch: 'NO_MATCH',
  /** Structurally unusable. */
  Invalid: 'INVALID',
} as const;
export type ComparisonOutcome = (typeof ComparisonOutcome)[keyof typeof ComparisonOutcome];

export interface FieldComparison {
  /** Predicate being compared. Only like predicates are ever compared. */
  field: string;
  outcome: FieldOutcome;
  /** Value already held (source A / canonical). */
  existingValue?: string;
  /** Value the incoming source asserts (source B). */
  incomingValue?: string;
  reason: string;
}

export interface SourceComparison {
  outcome: ComparisonOutcome;
  fields: FieldComparison[];
  /** Convenience view of `fields`, since conflicts drive the review queue. */
  conflicts: FieldComparison[];
  complementary: FieldComparison[];
  agreements: FieldComparison[];
}

/** Two coordinates disagree only beyond what BOTH sources claim to resolve. */
export function positionsConflict(a: PlaceCandidate, b: PlaceCandidate): { meters: number; tolerance: number; conflict: boolean } {
  const meters = distanceMeters(a.location, b.location);
  // Sum, not max: each source's uncertainty is independent, so the honest
  // tolerance is how far apart two points can be while both still describe the
  // same feature. A 5m NHLE point and a 30m Wikidata point disagree only past
  // ~35m plus a small allowance for the feature itself.
  const tolerance = a.locationAccuracyMeters + b.locationAccuracyMeters + 25;
  return { meters, tolerance, conflict: meters > tolerance };
}

function push(
  fields: FieldComparison[],
  field: string,
  outcome: FieldOutcome,
  reason: string,
  existingValue?: string,
  incomingValue?: string,
): void {
  fields.push({
    field,
    outcome,
    reason,
    ...(existingValue !== undefined ? { existingValue } : {}),
    ...(incomingValue !== undefined ? { incomingValue } : {}),
  });
}

/**
 * Compare an incoming candidate against what is already held for the same
 * place. `existing` is another candidate (cross-source in one run) or the
 * canonical record projected into the same shape.
 */
export function compareSources(existing: PlaceCandidate, incoming: PlaceCandidate): SourceComparison {
  const fields: FieldComparison[] = [];

  // --- Identifiers ---------------------------------------------------------
  // Compared as SETS per scheme, not value by value. A site with several
  // designations legitimately carries several list entries — Wikidata's item
  // for Fountains Abbey links to both the scheduled monument (1014395) and the
  // listed building (1149811). Overlapping sets corroborate each other and the
  // extras are additional knowledge; only sets that share nothing at all are a
  // real disagreement about which record this is.
  const bySchemeExisting = groupIds(existing.externalIds);
  const bySchemeIncoming = groupIds(incoming.externalIds);

  for (const [scheme, incomingValues] of bySchemeIncoming) {
    const knownValues = bySchemeExisting.get(scheme);
    const field = `external_id:${scheme}`;

    if (!knownValues || knownValues.size === 0) {
      push(fields, field, FieldOutcome.Complementary,
        `${incoming.provenance.sourceId} supplies a ${scheme} identifier the other source does not carry`,
        undefined, [...incomingValues].join(', '));
      continue;
    }

    const shared = [...incomingValues].filter((v) => knownValues.has(v));
    if (shared.length === 0) {
      push(fields, field, FieldOutcome.Conflict,
        `sources give entirely different ${scheme} identifiers for what was matched as one place`,
        [...knownValues].join(', '), [...incomingValues].join(', '));
      continue;
    }

    push(fields, field, FieldOutcome.Agreement,
      `both sources give ${scheme} ${shared.join(', ')}`, shared.join(', '), shared.join(', '));

    const extra = [...incomingValues].filter((v) => !knownValues.has(v));
    if (extra.length) {
      push(fields, field, FieldOutcome.Complementary,
        `${incoming.provenance.sourceId} additionally links ${scheme} ${extra.join(', ')} to the same place`,
        [...knownValues].join(', '), extra.join(', '));
    }
  }

  // --- Name ----------------------------------------------------------------
  // Never a conflict. Sources routinely name the same site differently, and a
  // second name is an alias to record, not a disagreement to arbitrate.
  const nameScore = bestNameSimilarity(
    [existing.name, ...existing.altNames],
    [incoming.name, ...incoming.altNames],
  );
  if (nameScore >= 0.92) {
    push(fields, 'name', FieldOutcome.Agreement, `names agree (${nameScore.toFixed(2)})`, existing.name, incoming.name);
  } else {
    push(fields, 'name', FieldOutcome.Complementary,
      `different name for the same place (${nameScore.toFixed(2)}); recorded as an alternative name`,
      existing.name, incoming.name);
  }

  // --- Place type ----------------------------------------------------------
  const existingTyped = existing.placeTypeConfidence >= 0.7;
  const incomingTyped = incoming.placeTypeConfidence >= 0.7;
  if (!existingTyped && incomingTyped) {
    push(fields, 'place_type', FieldOutcome.Complementary,
      `${incoming.provenance.sourceId} establishes a type the other source could not`,
      existing.placeType, incoming.placeType);
  } else if (existingTyped && incomingTyped) {
    if (typesAreCompatible(existing.placeType, incoming.placeType)) {
      push(fields, 'place_type', FieldOutcome.Agreement, 'types are compatible', existing.placeType, incoming.placeType);
    } else {
      push(fields, 'place_type', FieldOutcome.Conflict,
        'sources describe incompatible kinds of place', existing.placeType, incoming.placeType);
    }
  }

  // --- Position ------------------------------------------------------------
  const position = positionsConflict(existing, incoming);
  const positionDetail = `${Math.round(position.meters)}m apart, combined tolerance ${Math.round(position.tolerance)}m`;
  if (position.conflict) {
    push(fields, 'location', FieldOutcome.Conflict, `coordinates disagree: ${positionDetail}`,
      `${existing.location.lat.toFixed(5)},${existing.location.lng.toFixed(5)}`,
      `${incoming.location.lat.toFixed(5)},${incoming.location.lng.toFixed(5)}`);
  } else {
    push(fields, 'location', FieldOutcome.Agreement, `coordinates agree: ${positionDetail}`,
      `${existing.location.lat.toFixed(5)},${existing.location.lng.toFixed(5)}`,
      `${incoming.location.lat.toFixed(5)},${incoming.location.lng.toFixed(5)}`);
  }

  // --- Inception -----------------------------------------------------------
  // Compared only against another inception. A source stating when something
  // was *completed* is answering a different question and is never compared
  // against a source stating when it was *begun*.
  if (incoming.inceptionYear !== undefined) {
    if (existing.inceptionYear === undefined) {
      push(fields, 'inception_year', FieldOutcome.Complementary,
        `${incoming.provenance.sourceId} supplies an inception date the other source lacks`,
        undefined, String(incoming.inceptionYear));
    } else if (Math.abs(existing.inceptionYear - incoming.inceptionYear) <= INCEPTION_TOLERANCE_YEARS) {
      push(fields, 'inception_year', FieldOutcome.Agreement, 'inception dates agree within tolerance',
        String(existing.inceptionYear), String(incoming.inceptionYear));
    } else {
      push(fields, 'inception_year', FieldOutcome.Conflict,
        `inception dates differ by ${Math.abs(existing.inceptionYear - incoming.inceptionYear)} years`,
        String(existing.inceptionYear), String(incoming.inceptionYear));
    }
  }

  // --- Official website ----------------------------------------------------
  if (incoming.officialWebsite) {
    if (!existing.officialWebsite) {
      push(fields, 'official_website', FieldOutcome.Complementary,
        `${incoming.provenance.sourceId} supplies an official website`, undefined, incoming.officialWebsite);
    } else if (sameSite(existing.officialWebsite, incoming.officialWebsite)) {
      push(fields, 'official_website', FieldOutcome.Agreement, 'same official website',
        existing.officialWebsite, incoming.officialWebsite);
    } else {
      push(fields, 'official_website', FieldOutcome.Conflict,
        'sources give different official websites', existing.officialWebsite, incoming.officialWebsite);
    }
  }

  // --- Designations --------------------------------------------------------
  const existingDesignations = new Set(existing.designations.map((d) => d.designation));
  for (const designation of incoming.designations) {
    if (existingDesignations.has(designation.designation)) {
      push(fields, `designation:${designation.designation}`, FieldOutcome.Agreement,
        'both sources record this designation');
    } else {
      push(fields, `designation:${designation.designation}`, FieldOutcome.Complementary,
        `${incoming.provenance.sourceId} records a designation the other source does not`,
        undefined, designation.designation);
    }
  }

  const conflicts = fields.filter((f) => f.outcome === FieldOutcome.Conflict);
  const complementary = fields.filter((f) => f.outcome === FieldOutcome.Complementary);
  const agreements = fields.filter((f) => f.outcome === FieldOutcome.Agreement);

  const outcome: ComparisonOutcome = conflicts.length
    ? ComparisonOutcome.Conflict
    : complementary.length
      ? ComparisonOutcome.Complementary
      : ComparisonOutcome.Agreement;

  return { outcome, fields, conflicts, complementary, agreements };
}

function groupIds(ids: readonly { scheme: string; value: string }[]): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const id of ids) {
    if (!grouped.has(id.scheme)) grouped.set(id.scheme, new Set());
    grouped.get(id.scheme)!.add(id.value);
  }
  return grouped;
}

/** Two inception dates this far apart are describing different events. */
export const INCEPTION_TOLERANCE_YEARS = 25;

function sameSite(a: string, b: string): boolean {
  const host = (url: string) => {
    try {
      return new URL(url).host.replace(/^www\./, '').toLowerCase();
    } catch {
      return url.trim().toLowerCase();
    }
  };
  return host(a) === host(b);
}
