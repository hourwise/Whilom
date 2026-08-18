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
import { allNamePairsDistinct, bestNameSimilarity, isGenericName } from './name';

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
  /** Positions always count as agreeing within this, even for exact coordinates. */
  positionAgreementFloorMeters: 50,
  /**
   * Hard ceiling on how far positional uncertainty may widen that.
   *
   * Uncertainty must make the matcher more *cautious*, never more permissive.
   * Without this ceiling a vague record earns a wider automatic-match radius
   * purely by being vague — and the Yorkshire sample shows exactly what that
   * costs: the Saltaire World Heritage Site is 1,628 hectares, so its centroid
   * has a ~2.3 km equivalent radius, and a listed mill 382 m away fell inside
   * it. But a mill inside a World Heritage Site is *contained by* it, not
   * identical to it. Beyond this distance a human decides, however imprecise
   * the coordinates are.
   */
  positionAgreementCeilingMeters: 150,
  /** Coordinates further apart than this, on a match, are raised as a conflict. */
  coordinateConflictMeters: 500,
} as const;

/**
 * Optional sink for how much work a match actually cost.
 *
 * Matching compares each candidate against the canonical records it is given,
 * so the honest measure of scalability is not wall-clock time but how many
 * comparisons each record provokes and how many the distance veto discards
 * before scoring. Callers that do not care pass nothing and the matcher
 * behaves identically.
 */
export interface MatchStats {
  comparisons: number;
  vetoedByDistance: number;
  /** Comparisons discarded because the names denote different things. */
  vetoedByName: number;
  /** Comparisons discarded because one source's register lists them separately. */
  vetoedByRegister: number;
  /**
   * Comparisons where the two records are beyond the plausible-distance limit,
   * counted independently of which veto actually rejected them.
   *
   * This is the size of the prize for a spatial pre-filter: every one of these
   * is a comparison a locality-bounded candidate set would never have made, and
   * discarding them cannot change an outcome, because the matcher already
   * refuses to match at this distance.
   */
  beyondMaxDistance: number;
}

/**
 * The distance at which two records' positions still count as agreeing.
 *
 * Widened by the less precise of the two records — comparing a 6 m survey point
 * against a 327 m polygon centroid, the honest tolerance is the centroid's —
 * but bounded, so imprecision can never buy an automatic match.
 */
function agreementRadius(candidateAccuracy: number, existingAccuracy: number | undefined): number {
  const worst = Math.max(candidateAccuracy, existingAccuracy ?? 0);
  return Math.min(
    Math.max(THRESHOLDS.positionAgreementFloorMeters, worst),
    THRESHOLDS.positionAgreementCeilingMeters,
  );
}

/** How the score responds to distance. Bands, not a curve, so it is explicable. */
function distanceSignal(meters: number, radius: number): MatchSignal {
  if (meters <= radius) {
    return {
      name: 'distance',
      weight: 0.45,
      detail: `${Math.round(meters)}m, within the ${Math.round(radius)}m positional agreement radius`,
    };
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
  radius: number;
  nameScore: number;
  generic: boolean;
  /** One record protects a landscape, the other a structure within it. */
  areaVsStructure: boolean;
}

/**
 * Whether one source's own register already says these are two different
 * things.
 *
 * A source with a stable primary key has, by publishing two entries under two
 * keys, asserted that there are two entities. Historic England lists a hall and
 * its stable block, a church and its sundial, three separate buildings all
 * called "New Tame" — each with its own list entry number — and no similarity
 * measure should be permitted to overrule the register on the question of how
 * many things it contains.
 *
 * The comparison is scoped to a shared designation, because one site CAN hold
 * two designations and appear twice: Fountains Abbey is scheduled monument
 * 1014395 and listed building 1149811, and recognising those as one abbey is
 * the whole point of matching. Different designations therefore remain
 * matchable; a repeated designation does not.
 *
 * Rows sharing a record id are the same entry arriving twice — the NHLE service
 * returns one row per geometry part, so multi-part World Heritage Sites like
 * Saltaire do exactly this — and those must still merge.
 */
/**
 * Designations that protect an AREA of landscape rather than a single work.
 *
 * A listed building standing inside a registered park is contained by it, not
 * identical to it — the same lesson the Saltaire World Heritage Site taught the
 * positional radius, arriving again through a different door. The 5,000-record
 * tier merged "Falinge Park" into "Falinge Park Hall Facade and Pavilions" and
 * a registered park into "Babworth Hall", because a park's centroid naturally
 * sits a few tens of metres from the house it was laid out around and shares
 * its name.
 */
const AREA_DESIGNATIONS = new Set([
  'registered_park_garden',
  'registered_battlefield',
  'world_heritage_site',
]);

/** True when one record protects a landscape and the other a structure in it. */
function areaAgainstStructure(ours: readonly string[], theirs: readonly string[]): boolean {
  if (ours.length === 0 || theirs.length === 0) return false;
  const ourArea = ours.every((d) => AREA_DESIGNATIONS.has(d));
  const theirArea = theirs.every((d) => AREA_DESIGNATIONS.has(d));
  return ourArea !== theirArea;
}

function sameRegisterDifferentEntries(
  candidate: PlaceCandidate,
  existing: CanonicalPlaceRef,
): boolean {
  const theirs = existing.sourceIdentity;
  if (!theirs) return false;
  if (theirs.sourceId !== candidate.provenance.sourceId) return false;
  if (theirs.sourceRecordId === candidate.provenance.sourceRecordId) return false;

  const ours = candidate.designations.map((d) => d.designation).sort();
  if (ours.length === 0 || theirs.designations.length === 0) return false;
  return ours.some((designation) => theirs.designations.includes(designation));
}

function scoreAgainst(candidate: PlaceCandidate, existing: CanonicalPlaceRef): ScoredMatch | null {
  // Hard register veto. Two entries in one source's register, under the same
  // designation, are two different protected things by that source's own
  // account. This is stronger evidence than any similarity signal, and it is
  // what the 5,000-record tier showed to be missing: the statutory list names
  // curtilage structures after their parent building and puts them metres away,
  // so name and distance are at their most persuasive exactly where the records
  // are most certainly distinct.
  if (sameRegisterDifferentEntries(candidate, existing)) return null;

  const meters = distanceMeters(candidate.location, existing.location);
  // Hard geographic veto. Two heritage sites 5km apart are not the same site,
  // however alike their names — this is what stops the two "Middleham Castle"
  // records, 48km apart, from ever being considered a match.
  if (meters > THRESHOLDS.maxPlausibleDistanceMeters) return null;

  const candidateNames = [candidate.name, ...candidate.altNames];
  const existingNames = [existing.name, ...existing.altNames];

  // Hard nominal veto, on the same footing as the geographic one. The statutory
  // list separately designates thousands of curtilage structures and names each
  // after the building it stands beside, so proximity and name overlap are both
  // at their strongest exactly where the two records are most certainly
  // different things. When the names themselves say so, no score can override
  // it. See `namesDenoteDistinctThings`.
  const distinct = allNamePairsDistinct(candidateNames, existingNames);
  if (distinct.distinct) return null;

  const nameScore = bestNameSimilarity(candidateNames, existingNames);
  const generic = isGenericName(candidate.name) && isGenericName(existing.name);

  const radius = agreementRadius(candidate.locationAccuracyMeters, existing.locationAccuracyMeters);
  const signals: MatchSignal[] = [distanceSignal(meters, radius), nameSignal(nameScore, generic)];

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
    radius,
    nameScore,
    generic,
    areaVsStructure: areaAgainstStructure(
      candidate.designations.map((d) => d.designation),
      existing.sourceIdentity?.designations ?? [],
    ),
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
  stats?: MatchStats,
): MatchDecision {
  // --- Deterministic identity ----------------------------------------------
  for (const existing of existingPlaces) {
    const shared = sharedExternalId(candidate, existing);
    if (shared && !sameRegisterDifferentEntries(candidate, existing)) {
      // A shared identifier is the strongest signal there is, but it is still
      // an assertion made by a source, and sources do attach one QID to both a
      // hall and its stable block. If the names say these are different
      // things, that disagreement is for a human, not an automatic merge.
      const namesDistinct = allNamePairsDistinct(
        [candidate.name, ...candidate.altNames],
        [existing.name, ...existing.altNames],
      );
      if (namesDistinct.distinct) {
        return {
          outcome: MatchOutcome.MatchReview,
          confidence: 0.5,
          matchedPlaceId: existing.id,
          signals: [
            { name: 'external-id', weight: 1, detail: `shared ${shared.scheme} identifier ${shared.value}` },
            { name: 'name', weight: -1, detail: namesDistinct.reason ?? 'names denote different things' },
          ],
          conflicts: [],
          rationale: `Shares a ${shared.scheme} identifier with "${existing.name}", but ${namesDistinct.reason ?? 'the names denote different things'}.`,
        };
      }
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
    .map((existing) => {
      const match = scoreAgainst(candidate, existing);
      if (stats) {
        stats.comparisons += 1;
        const meters = distanceMeters(candidate.location, existing.location);
        if (meters > THRESHOLDS.maxPlausibleDistanceMeters) stats.beyondMaxDistance += 1;
        if (match === null) {
          if (sameRegisterDifferentEntries(candidate, existing)) stats.vetoedByRegister += 1;
          else if (meters > THRESHOLDS.maxPlausibleDistanceMeters) stats.vetoedByDistance += 1;
          else stats.vetoedByName += 1;
        }
      }
      return match;
    })
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
    !best.areaVsStructure &&
    best.meters <= best.radius;

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
  if (best.areaVsStructure) {
    why.push('one record protects a landscape and the other a structure within it');
  }
  if (ambiguous && runnerUp) why.push(`"${runnerUp.existing.name}" scores almost as well`);
  if (best.nameScore < THRESHOLDS.confidentNameSimilarity) why.push('names are not close enough');
  if (best.meters > best.radius) {
    why.push(`${Math.round(best.meters)}m apart, outside the ${Math.round(best.radius)}m agreement radius`);
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
