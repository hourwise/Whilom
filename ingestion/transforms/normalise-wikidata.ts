import { LocationMethod, PlaceType } from '@whilom/domain';
import type { DesignationType } from '@whilom/domain';
import type {
  CandidateDesignation,
  CandidateProvenance,
  ExternalId,
  PlaceCandidate,
} from '../pipeline/candidate';
import type { RawPlaceRecord } from '../sources/source-adapter';
import type { WikidataItem } from '../sources/wikidata/wikidata-adapter';
import type { NormaliseResult } from './normalise-nhle';

/**
 * NORMALISE for Wikidata items.
 *
 * Wikidata is the mirror image of NHLE: it has an explicit type vocabulary and
 * often a construction date, but no statutory designation detail and coordinates
 * of wildly varying quality. That complementarity is the point of having it —
 * Wikidata types Saltaire as a model village where NHLE says nothing at all.
 */

/** Degrees → metres along a meridian. Good enough for an uncertainty estimate. */
const METRES_PER_DEGREE = 111_320;

/**
 * Floor on how precisely a Wikidata coordinate is believed, in metres.
 *
 * Wikidata's `geoPrecision` is the precision the *number was stored to*, not a
 * measurement error. Items in this sample claim 0.000001° — about 11 cm — which
 * no volunteer placing a pin on a monastic precinct can possibly mean. Treating
 * that as an 11 cm fix would make the matcher merge things it should not, so a
 * community-contributed point is never trusted below this floor.
 */
export const WIKIDATA_ACCURACY_FLOOR_M = 25;

/** Beyond this the coordinate is an area indication, not a position. */
const APPROXIMATE_THRESHOLD_M = 250;

/**
 * Wikidata `instance of` → Whilom `PlaceType`.
 *
 * Only mappings we are confident about. Anything unlisted yields `unknown`
 * rather than a guess — Wikidata's vocabulary is vast and half-matching it
 * would manufacture disagreement with NHLE that does not exist.
 */
const INSTANCE_OF_TYPES: Readonly<Record<string, PlaceType>> = {
  castle: PlaceType.Castle,
  'episcopal palace': PlaceType.CountryHouse,
  'english country house': PlaceType.CountryHouse,
  'country house': PlaceType.CountryHouse,
  palace: PlaceType.Palace,
  abbey: PlaceType.Abbey,
  monastery: PlaceType.Abbey,
  priory: PlaceType.Priory,
  cathedral: PlaceType.Cathedral,
  'church building': PlaceType.Church,
  church: PlaceType.Church,
  chapel: PlaceType.Church,
  battle: PlaceType.Battlefield,
  battlefield: PlaceType.Battlefield,
  'model village': PlaceType.HistoricVillage,
  village: PlaceType.HistoricVillage,
  'deserted medieval village': PlaceType.ArchaeologicalSite,
  'bowl barrow': PlaceType.ArchaeologicalSite,
  'round barrow': PlaceType.ArchaeologicalSite,
  'archaeological site': PlaceType.ArchaeologicalSite,
  'roman town': PlaceType.ArchaeologicalSite,
  hillfort: PlaceType.Hillfort,
  'mill building': PlaceType.IndustrialSite,
  mill: PlaceType.IndustrialSite,
  mine: PlaceType.IndustrialSite,
  colliery: PlaceType.IndustrialSite,
  lock: PlaceType.CanalStructure,
  weir: PlaceType.CanalStructure,
  'railway station': PlaceType.RailwaySite,
  'botanical garden': PlaceType.Garden,
  'french formal garden': PlaceType.Garden,
  garden: PlaceType.Garden,
  park: PlaceType.HistoricLandscape,
  museum: PlaceType.Museum,
  'market cross': PlaceType.Monument,
  'high cross': PlaceType.Monument,
  monument: PlaceType.Monument,
  memorial: PlaceType.Monument,
  house: PlaceType.Building,
  'architectural structure': PlaceType.Structure,
  wall: PlaceType.Structure,
  bridge: PlaceType.Structure,
  ruins: PlaceType.Ruin,
};

/** Wikidata heritage designation labels → Whilom designation types. */
const HERITAGE_DESIGNATIONS: Readonly<Record<string, DesignationType>> = {
  'grade i listed building': 'listed_building',
  'grade ii* listed building': 'listed_building',
  'grade ii listed building': 'listed_building',
  'listed building': 'listed_building',
  'scheduled monument': 'scheduled_monument',
  'world heritage site': 'world_heritage_site',
  'registered historic park or garden': 'registered_park_garden',
  'registered battlefield': 'registered_battlefield',
};

export function normaliseWikidataRecord(
  raw: RawPlaceRecord,
  importRunId: string,
): NormaliseResult {
  const provenance: CandidateProvenance = { ...raw.provenance, importRunId };
  const item = ((raw.extra ?? {}) as { item?: WikidataItem }).item;
  const warnings: string[] = [];

  if (!item) {
    return { ok: false, rejected: { provenance, name: raw.name, reasons: ['no Wikidata item payload'] } };
  }

  // --- Coordinates ----------------------------------------------------------
  if (item.lat === undefined || item.lon === undefined) {
    return {
      ok: false,
      rejected: { provenance, name: raw.name, reasons: ['Wikidata item has no coordinate (P625)'] },
    };
  }
  if (Math.abs(item.lat) > 90 || Math.abs(item.lon) > 180) {
    return {
      ok: false,
      rejected: { provenance, name: raw.name, reasons: [`impossible coordinate ${item.lat},${item.lon}`] },
    };
  }

  const statedMetres =
    item.geoPrecision !== undefined && Number.isFinite(item.geoPrecision)
      ? item.geoPrecision * METRES_PER_DEGREE
      : undefined;
  const accuracyMeters = Math.max(statedMetres ?? WIKIDATA_ACCURACY_FLOOR_M, WIKIDATA_ACCURACY_FLOOR_M);
  const locationMethod =
    accuracyMeters > APPROXIMATE_THRESHOLD_M ? LocationMethod.Approximate : LocationMethod.SourceCoordinate;

  if (statedMetres !== undefined && statedMetres < WIKIDATA_ACCURACY_FLOOR_M) {
    warnings.push(
      `Wikidata states ${statedMetres.toFixed(2)}m coordinate precision; treated as ${WIKIDATA_ACCURACY_FLOOR_M}m because stored precision is not measured accuracy`,
    );
  }

  // --- Type -----------------------------------------------------------------
  const instanceOf = (item.instanceOf ?? []).map((s) => s.toLowerCase().trim());
  let placeType: PlaceType = PlaceType.Unknown;
  let placeTypeConfidence = 0;
  let placeTypeRule = 'wikidata:unmapped';
  for (const label of instanceOf) {
    const mapped = INSTANCE_OF_TYPES[label];
    if (mapped) {
      placeType = mapped;
      placeTypeConfidence = 0.85;
      placeTypeRule = `wikidata:instance-of:${label}`;
      break;
    }
  }
  if (placeTypeConfidence === 0 && instanceOf.length > 0) {
    warnings.push(`Wikidata instance-of ${JSON.stringify(instanceOf)} is not mapped to a Whilom place type`);
  }

  // --- Identifiers ----------------------------------------------------------
  const externalIds: ExternalId[] = [{ scheme: 'wikidata', value: item.qid }];
  for (const nhleId of item.nhleIds ?? []) {
    externalIds.push({ scheme: 'nhle', value: nhleId });
  }
  if ((item.nhleIds ?? []).length > 1) {
    // Real and interesting: Wikidata sometimes carries several NHLE list
    // entries for one item, because the site is covered by several designations.
    warnings.push(`Wikidata item carries ${item.nhleIds!.length} NHLE identifiers`);
  }

  // --- Designations ---------------------------------------------------------
  const designations: CandidateDesignation[] = [];
  for (const label of item.heritageDesignations ?? []) {
    const mapped = HERITAGE_DESIGNATIONS[label.toLowerCase().trim()];
    if (mapped && !designations.some((d) => d.designation === mapped)) {
      designations.push({ designation: mapped });
    }
  }

  const facts = wikidataFacts(item);

  const candidate: PlaceCandidate = {
    provenance,
    name: raw.name,
    altNames: (item.aliases ?? []).filter((a) => a && a !== raw.name),
    placeType,
    placeTypeConfidence,
    placeTypeRule,
    ...(raw.rawType ? { rawType: raw.rawType } : {}),
    location: { lng: item.lon, lat: item.lat },
    locationMethod,
    locationAccuracyMeters: Math.round(accuracyMeters * 10) / 10,
    sourcePosition: {
      // Wikidata publishes WGS84 directly, so nothing is reprojected — but the
      // fields are still recorded so every source answers the same questions.
      crs: 'EPSG:4326',
      coordinates: { lng: item.lon, lat: item.lat },
      conversion: 'none/wgs84-native',
      ...(statedMetres !== undefined ? { sourcePrecisionMeters: Math.round(statedMetres * 100) / 100 } : {}),
      accuracyBasis:
        statedMetres === undefined
          ? `no stated precision; floored at ${WIKIDATA_ACCURACY_FLOOR_M}m for a community-contributed point`
          : `Wikidata geoPrecision ${item.geoPrecision}° (${statedMetres.toFixed(2)}m), floored at ${WIKIDATA_ACCURACY_FLOOR_M}m`,
    },
    designations,
    externalIds,
    ...(facts.inceptionYear !== undefined ? { inceptionYear: facts.inceptionYear } : {}),
    ...(facts.officialWebsite ? { officialWebsite: facts.officialWebsite } : {}),
    ...(facts.commonsCategory ? { commonsCategory: facts.commonsCategory } : {}),
    ...(item.relatedPeople?.length
      ? {
          relatedPeople: item.relatedPeople.map((person) => ({
            label: person.label,
            role: person.role,
            // The QID, so publication resolves the person by identifier rather
            // than by name — two people called John Carr stay two people.
            ...(person.qid ? { externalId: person.qid } : {}),
          })),
        }
      : facts.architects.length
        ? { relatedPeople: facts.architects.map((label) => ({ label, role: 'architect' })) }
        : {}),
    warnings,
  };

  return { ok: true, candidate };
}

/** Facts Wikidata supplies that NHLE does not, kept separate from identity. */
export interface WikidataFacts {
  inceptionYear?: number;
  officialWebsite?: string;
  commonsCategory?: string;
  architects: string[];
}

export function wikidataFacts(item: WikidataItem): WikidataFacts {
  const year = item.inception ? parseInceptionYear(item.inception) : undefined;
  return {
    ...(year !== undefined ? { inceptionYear: year } : {}),
    ...(item.website ? { officialWebsite: item.website } : {}),
    ...(item.commons ? { commonsCategory: item.commons } : {}),
    architects: item.architects ?? [],
  };
}

/** Wikidata dates are ISO-ish and may be negative for BCE. */
export function parseInceptionYear(value: string): number | undefined {
  const match = /^(-?\d{1,6})/.exec(value.trim());
  if (!match?.[1]) return undefined;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : undefined;
}
