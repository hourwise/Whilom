import type {
  CanonicalPlaceRef,
  FieldConflict,
  MatchDecision,
  MatchSignal,
  PlaceCandidate,
} from '../pipeline/candidate';
import { MatchOutcome } from '../pipeline/candidate';
import { distanceMeters } from '../transforms/osgb';
import { typesAreCompatible } from '../transforms/place-type';
import { bestNameSimilarity, isGenericName } from './name';

/**
 * Conservative matcher v1 (spec §36).
 *
 * The governing rule is asymmetric: wrongly splitting one castle into two
 * records is a tidy-up job for an editor, while wrongly merging two castles
 * destroys information and is very hard to notice afterwards. So this matcher
 * is built to produce false negatives. Anything it is not near-certain about
 * goes to a human queue; nothing is merged on a hunch.
 *
 * Only two things earn an automatic match: an identifier the two records
 * literally share, or a combination of a distinctive name and coordinates
 * inside the sources' own stated positional uncertainty. Everything else is
 * MATCH_REVIEW or CONFLICT_REVIEW.
 */

export const THRESHOLDS = {
  /** Beyond this, two records cannot be the same place whatever else agrees. */
  maxPlausibleDistanceMeters: 5000,
  /** Score at or above which a match may be automatic, if the gates also pass. */
  confidentScore: 0.85,
  /** Score at or above which a match is offered to a human. */
  reviewScore: 0.5,
  /** Name similarity required before an automatic match is even considered. */
  confidentNameSimilarity: 0.9,
  /** Distance floor for an automatic match, widened by positional uncertainty. */
  confidentDistanceFloorMeters: 150,
  /** Coordinates further apart than this, on a match, are raised as a conflict. */
  coordinateConflictMeters: 500,
} as const;

/** How the score responds to distance. Bands, not a curve, so it is explicable. */
function distanceSignal(meters: number, uncertainty: number): MatchSignal {
  const tight = Math.max(50, uncertainty);
  if (meters <= tight) {
    return { name: 'distance', weight: 0.45, detail: `${Math.round(meters)}m, within positional uncertainty (${Math.round(uncertainty)}m)` };
  }
  if (meters <= 250) return { name: 'distance', weight: 0.3, detail: `${Math.round(meters)}m apart` };
  if (meters <= 1000) return { name: 'distance', weight: 0.1, detail: `${Math.round(meters)}m apart` };
  return { name: 'distance', weight: -0.1, detail: `${Math.round(meters)}m apart` };
}

function nameSignal(similarity: number, generic: boolean): MatchSignal {
  if (similarity >= 0.92) {
    return generic
      ? { name: 'name', weight: 0.1, detail: `names match (${similarity.toFixed(2)}) but the name is not distinctive` }
      : { name: 'name', weight: 0.4, detail: `distinctive names match (${similarity.toFixed(2)})` };
  }
  if (similarity >= 0.75) return { name: 'name', weight: 0.2, detail: `names similar (${similarity.toFixed(2)})` };
  if (similarity >= 0.55) return { name: 'name', weight: 0.05, detail: `names loosely similar (${similarity.toFixed(2)})` };
  return { name: 'name', weight: -0.2, detail: `names differ (${similarity.toFixed(2)})` };
}

function scoreOf(signals: readonly MatchSignal[]): number {
  const total = signals.reduce((sum, s) => sum + s.weight, 0);
  return Math.max(0, Math.min(1, total));
}

/** Identifiers the two records literally share. */
function sharedExternalId(
  candidate: PlaceCandidate,
  existing: CanonicalPlaceRef,
): { scheme: string; value: string } | undefined {
  for (const id of candidate.externalIds) {
    const hit = existing.externalIds.find(
      (other) => other.scheme === id.scheme && other.value === id.value,
    );
    if (hit) return hit;
  }
  // A designation reference (an NHLE list entry) identifies just as strongly.
  for (const designation of candidate.designations) {
    if (designation.reference && existing.designationReferences.includes(designation.reference)) {
      return { scheme: 'designation-reference', value: designation.reference };
    }
  }
  return undefined;
}

function collectConflicts(
  candidate: PlaceCandidate,
  existing: CanonicalPlaceRef,
  meters: number,
): FieldConflict[] {
  const conflicts: FieldConflict[] = [];

  const typedBothWays = candidate.placeTypeConfidence >= 0.7;
  if (typedBothWays && !typesAreCompatible(candidate.placeType, existing.placeType)) {
    conflicts.push({
      field: 'place_type',
      existingValue: existing.placeType,
      candidateValue: candidate.placeType,
    });
  }

  if (meters > THRESHOLDS.coordinateConflictMeters) {
    conflicts.push({
      field: 'location',
      existingValue: `${existing.location.lat.toFixed(5)},${existing.location.lng.toFixed(5)}`,
      candidateValue: `${candidate.location.lat.toFixed(5)},${candidate.location.lng.toFixed(5)}`,
    });
  }

  if (candidate.postcode && existing.postcode && candidate.postcode !== existing.postcode) {
    conflicts.push({
      field: 'postcode',
      existingValue: existing.postcode,
      candidateValue: candidate.postcode,
    });
  }

  // A differing name is deliberately NOT a conflict. Two sources describing one
  // site rarely agree on its name — NHLE calls Fountains Abbey "Fountains
  // Cistercian Abbey; monastic precinct…" while its own listed-building entry
  // calls it "FOUNTAINS ABBEY, WITH ANCILLARY BUILDINGS", and a renamed site
  // (Elsecar New Colliery → Elsecar Heritage Centre) is the same place under a
  // later name. Those are alternative names to record, not disagreements for a
  // human to arbitrate. Conflicts are reserved for claims that cannot both be
  // true: incompatible type, irreconcilable position, different postcode.

  return conflicts;
}

interface ScoredMatch {
  existing: CanonicalPlaceRef;
  score: number;
  signals: MatchSignal[];
  conflicts: FieldConflict[];
  meters: number;
  nameScore: number;
  generic: boolean;
}

function scoreAgainst(candidate: PlaceCandidate, existing: CanonicalPlaceRef): ScoredMatch | null {
  const meters = distanceMeters(candidate.location, existing.location);
  // Hard geographic veto. Two heritage sites 5km apart are not the same site,
  // however alike their names — this is what stops the two "Middleham Castle"
  // records, 48km apart, from ever being considered a match.
  if (meters > THRESHOLDS.maxPlausibleDistanceMeters) return null;

  const candidateNames = [candidate.name, ...candidate.altNames];
  const existingNames = [existing.name, ...existing.altNames];
  const nameScore = bestNameSimilarity(candidateNames, existingNames);
  const generic = isGenericName(candidate.name) && isGenericName(existing.name);

  const uncertainty = candidate.locationUncertaintyMeters;
  const signals: MatchSignal[] = [distanceSignal(meters, uncertainty), nameSignal(nameScore, generic)];

  const bothTyped = candidate.placeTypeConfidence >= 0.7;
  if (bothTyped) {
    if (typesAreCompatible(candidate.placeType, existing.placeType)) {
      signals.push({ name: 'type', weight: 0.1, detail: `types compatible (${candidate.placeType}/${existing.placeType})` });
    } else {
      signals.push({ name: 'type', weight: -0.35, detail: `types incompatible (${candidate.placeType}/${existing.placeType})` });
    }
  } else {
    signals.push({ name: 'type', weight: 0, detail: 'candidate type not confidently known; ignored' });
  }

  if (candidate.postcode && existing.postcode) {
    const same = candidate.postcode.replace(/\s+/g, '').toUpperCase() === existing.postcode.replace(/\s+/g, '').toUpperCase();
    signals.push(
      same
        ? { name: 'postcode', weight: 0.2, detail: 'postcodes match' }
        : { name: 'postcode', weight: -0.15, detail: 'postcodes differ' },
    );
  }

  if (candidate.town && existing.town && candidate.town.toLowerCase() === existing.town.toLowerCase()) {
    signals.push({ name: 'town', weight: 0.05, detail: `same town (${existing.town})` });
  }

  return {
    existing,
    score: scoreOf(signals),
    signals,
    conflicts: collectConflicts(candidate, existing, meters),
    meters,
    nameScore,
    generic,
  };
}

/**
 * Decide what to do with one candidate against the canonical places already
 * known. `existingPlaces` is expected to be a locality-bounded shortlist — in a
 * real run, the rows within a few kilometres of the candidate.
 */
export function matchCandidate(
  candidate: PlaceCandidate,
  existingPlaces: readonly CanonicalPlaceRef[],
): MatchDecision {
  // --- Deterministic identity ----------------------------------------------
  for (const existing of existingPlaces) {
    const shared = sharedExternalId(candidate, existing);
    if (shared) {
      const meters = distanceMeters(candidate.location, existing.location);
      const conflicts = collectConflicts(candidate, existing, meters);
      const signals: MatchSignal[] = [
        { name: 'external-id', weight: 1, detail: `shared ${shared.scheme} identifier ${shared.value}` },
      ];
      // Even a shared identifier does not license a silent overwrite when the
      // records disagree about something material.
      return conflicts.length > 0
        ? {
            outcome: MatchOutcome.ConflictReview,
            confidence: 1,
            matchedPlaceId: existing.id,
            signals,
            conflicts,
            rationale: `Same ${shared.scheme} identifier as "${existing.name}", but the records disagree on ${conflicts.map((c) => c.field).join(', ')}.`,
          }
        : {
            outcome: MatchOutcome.MatchConfident,
            confidence: 1,
            matchedPlaceId: existing.id,
            signals,
            conflicts: [],
            rationale: `Same ${shared.scheme} identifier as "${existing.name}".`,
          };
    }
  }

  // --- Scored comparison ----------------------------------------------------
  const scored = existingPlaces
    .map((existing) => scoreAgainst(candidate, existing))
    .filter((m): m is ScoredMatch => m !== null)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < THRESHOLDS.reviewScore) {
    return {
      outcome: MatchOutcome.NewCanonical,
      confidence: best ? best.score : 0,
      signals: best?.signals ?? [],
      conflicts: [],
      rationale: best
        ? `Closest existing place "${best.existing.name}" scored ${best.score.toFixed(2)}, below the ${THRESHOLDS.reviewScore} review threshold.`
        : 'No existing place within range.',
    };
  }

  // A second candidate scoring nearly as well means we cannot say *which* place
  // this is, even if we are sure it is one of them. That is a review, never a
  // merge — this is the "multiple structures within one estate" case.
  const runnerUp = scored[1];
  const ambiguous = runnerUp !== undefined && best.score - runnerUp.score < 0.1;

  if (best.conflicts.length > 0) {
    return {
      outcome: MatchOutcome.ConflictReview,
      confidence: best.score,
      matchedPlaceId: best.existing.id,
      signals: best.signals,
      conflicts: best.conflicts,
      rationale: `Probably "${best.existing.name}" (${best.score.toFixed(2)}), but the sources disagree on ${best.conflicts.map((c) => c.field).join(', ')}.`,
    };
  }

  const confidentGatesPass =
    best.score >= THRESHOLDS.confidentScore &&
    best.nameScore >= THRESHOLDS.confidentNameSimilarity &&
    !best.generic &&
    !ambiguous &&
    best.meters <=
      Math.max(THRESHOLDS.confidentDistanceFloorMeters, candidate.locationUncertaintyMeters);

  if (confidentGatesPass) {
    return {
      outcome: MatchOutcome.MatchConfident,
      confidence: best.score,
      matchedPlaceId: best.existing.id,
      signals: best.signals,
      conflicts: [],
      rationale: `Distinctive name and position agree with "${best.existing.name}" (${best.score.toFixed(2)}).`,
    };
  }

  const why: string[] = [];
  if (best.generic) why.push('the name is not distinctive');
  if (ambiguous && runnerUp) why.push(`"${runnerUp.existing.name}" scores almost as well`);
  if (best.nameScore < THRESHOLDS.confidentNameSimilarity) why.push('names are not close enough');
  if (best.meters > Math.max(THRESHOLDS.confidentDistanceFloorMeters, candidate.locationUncertaintyMeters)) {
    why.push(`${Math.round(best.meters)}m apart`);
  }
  if (best.score < THRESHOLDS.confidentScore) why.push(`score ${best.score.toFixed(2)} below ${THRESHOLDS.confidentScore}`);

  return {
    outcome: MatchOutcome.MatchReview,
    confidence: best.score,
    matchedPlaceId: best.existing.id,
    signals: best.signals,
    conflicts: [],
    rationale: `Possibly "${best.existing.name}", needs review: ${why.join('; ')}.`,
  };
}
