import type { DesignationGrade, DesignationType } from '@whilom/domain';
import type {
  CandidateDesignation,
  CandidateProvenance,
  PlaceCandidate,
  RejectedRecord,
} from '../pipeline/candidate';
import type { RawPlaceRecord } from '../sources/source-adapter';
import { epochToIso } from '../sources/historic-england/nhle-adapter';
import { osgbToWgs84 } from './osgb';
import { GENERIC_FALLBACK_RULE, inferPlaceType } from './place-type';
import { OSGB36_CONVERSION_ID, estimatePosition } from './position';

/**
 * NORMALISE for Historic England NHLE records: source vocabulary → domain
 * vocabulary, British National Grid → WGS84, and the source's own identifiers
 * preserved as external ids.
 *
 * Nothing is invented here. Where NHLE simply does not publish a field — town,
 * county, postcode, and any notion of what a site *is* — the candidate is left
 * without it and a warning is recorded, rather than a plausible value being
 * derived and then indistinguishable from a real one.
 */

export type NormaliseResult =
  | { ok: true; candidate: PlaceCandidate }
  | { ok: false; rejected: RejectedRecord };

const VALID_GRADES = new Set<string>(['I', 'II*', 'II', 'A', 'B', 'C']);

export function normaliseNhleRecord(raw: RawPlaceRecord, importRunId: string): NormaliseResult {
  const provenance: CandidateProvenance = { ...raw.provenance, importRunId };
  const extra = (raw.extra ?? {}) as {
    layerName?: unknown;
    designation?: unknown;
    designatedDateField?: unknown;
    attributes?: Record<string, unknown>;
  };
  const attributes = extra.attributes ?? {};
  const reasons: string[] = [];
  const warnings: string[] = [];

  // --- Coordinates ----------------------------------------------------------
  const easting = numeric(attributes['Easting']);
  const northing = numeric(attributes['Northing']);
  if (easting === undefined || northing === undefined) {
    reasons.push('missing Easting/Northing');
    return { ok: false, rejected: { provenance, name: raw.name, reasons } };
  }

  const location = osgbToWgs84(easting, northing);
  if (location === null) {
    reasons.push(`grid reference outside Great Britain (E${easting} N${northing})`);
    return { ok: false, rejected: { provenance, name: raw.name, reasons } };
  }

  // --- Type -----------------------------------------------------------------
  const layerName = typeof extra.layerName === 'string' ? extra.layerName : undefined;
  const inferred = inferPlaceType(raw.name, layerName);
  if (inferred.rule === GENERIC_FALLBACK_RULE) {
    warnings.push(
      `no specific type could be inferred from the name; classified generically as ${inferred.placeType}`,
    );
  }

  // --- Designation ----------------------------------------------------------
  const designation = extra.designation as DesignationType | undefined;
  const designations: CandidateDesignation[] = [];
  if (designation) {
    const dateField =
      typeof extra.designatedDateField === 'string' ? extra.designatedDateField : undefined;
    const firstDesignated = dateField ? epochToIso(attributes[dateField]) : undefined;
    const grade = normaliseGrade(raw.grade, warnings);
    designations.push({
      designation,
      ...(grade ? { grade } : {}),
      reference: provenance.sourceRecordId,
      ...(firstDesignated ? { firstDesignated } : {}),
      ...(provenance.originalUrl ? { url: provenance.originalUrl } : {}),
    });
  } else {
    warnings.push('record carries no statutory designation');
  }

  // --- Names ----------------------------------------------------------------
  const name = tidyName(raw.name);
  const altNames = deriveAltNames(raw.name, name);

  // NHLE publishes no address fields on these layers, so a place imported from
  // it alone can never be filtered by town or county. Recorded, not guessed.
  warnings.push('NHLE provides no town/county/postcode for this layer');

  const captureScale = typeof attributes['CaptureScale'] === 'string' ? attributes['CaptureScale'] : undefined;
  const areaHectares = numeric(attributes['area_ha']);
  const notes = typeof attributes['Notes'] === 'string' && attributes['Notes'].trim() !== ''
    ? attributes['Notes'].trim()
    : undefined;

  // --- Position ------------------------------------------------------------
  // NHLE's point layers publish a coordinate for the feature; its polygon
  // layers publish Easting/Northing as a representative point for an area, and
  // `area_ha` tells us how big that area is. Those are different claims and are
  // recorded as such — see transforms/position.ts for why the 0.44 mm
  // conversion precision has nothing to do with either figure.
  const isAreaFeature = areaHectares !== undefined;
  const position = estimatePosition({ captureScale, areaHectares, isAreaFeature });

  const candidate: PlaceCandidate = {
    provenance,
    name,
    altNames,
    placeType: inferred.placeType,
    placeTypeConfidence: inferred.confidence,
    placeTypeRule: inferred.rule,
    ...(raw.rawType ? { rawType: raw.rawType } : {}),
    location,
    locationMethod: position.method,
    locationAccuracyMeters: position.accuracyMeters,
    sourcePosition: {
      crs: 'EPSG:27700',
      coordinates: { easting, northing },
      conversion: OSGB36_CONVERSION_ID,
      accuracyBasis: position.basis,
    },
    designations,
    externalIds: [{ scheme: 'nhle', value: provenance.sourceRecordId }],
    ...(areaHectares !== undefined ? { areaHectares } : {}),
    ...(notes ? { sourceNotes: notes } : {}),
    warnings,
  };

  return { ok: true, candidate };
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normaliseGrade(
  grade: string | undefined,
  warnings: string[],
): DesignationGrade | undefined {
  if (!grade) return undefined;
  const trimmed = grade.trim();
  if (VALID_GRADES.has(trimmed)) return trimmed as DesignationGrade;
  warnings.push(`unrecognised designation grade "${grade}"`);
  return undefined;
}

/**
 * NHLE names are inconsistently cased — many legacy listed-building entries are
 * fully upper case ("BURTON CONSTABLE HALL") while newer ones are sentence case.
 * Upper-case-only names are title-cased so the UI is not shouting; anything with
 * existing mixed case is left exactly as published.
 */
export function tidyName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed !== trimmed.toUpperCase()) return trimmed;

  const SMALL = new Set(['of', 'the', 'and', 'to', 'at', 'in', 'on', 'for', 'a', 'an']);
  return trimmed
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index > 0 && SMALL.has(word)) return word;
      // Keep Roman-numeral grades and initialisms intact.
      if (/^(i{1,3}|iv|v|vi{1,3}|ix|x)$/i.test(word) && index > 0) return word.toUpperCase();
      return word.replace(/^([a-z])/, (c) => c.toUpperCase());
    })
    .join(' ');
}

/**
 * Alternative names that genuinely help matching.
 *
 * NHLE scheduled-monument names are often a site name followed by a
 * semicolon-delimited inventory of what the scheduling covers — "Fountains
 * Cistercian Abbey; monastic precinct, mill, water management works…". The
 * leading clause is the name a human would use and the one another source is
 * likely to publish, so it is kept as an alternative.
 */
export function deriveAltNames(original: string, primary: string): string[] {
  const alts = new Set<string>();
  const head = original.split(/[;:]/)[0]?.trim();
  if (head && head.length > 2) {
    const tidied = tidyName(head);
    if (tidied !== primary) alts.add(tidied);
  }
  if (original.trim() !== primary) alts.add(original.trim());
  return [...alts];
}
