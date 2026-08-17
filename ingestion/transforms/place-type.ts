import { PlaceType } from '@whilom/domain';
import type { DesignationType } from '@whilom/domain';

/**
 * Map a heritage record onto Whilom's `PlaceType` vocabulary.
 *
 * NHLE PUBLISHES NO TYPE FIELD. A record is a name, a designation, a grade and
 * a grid reference — nothing more. So the type has to be inferred from the
 * name, which works well for "Rievaulx Abbey Cistercian monastery…" and poorly
 * for "Numbers 12 And 14 And Attached Railings". Rather than let a guess
 * masquerade as data, every rule carries a confidence, and an unmatched name
 * falls back to whatever the *designation* honestly implies — or to `unknown`
 * when it implies nothing. `structure` is a constructed-work fallback only; it
 * is never applied to a battlefield, a designed landscape or a wreck.
 *
 * This is the single largest fidelity gap in the NHLE import and is recorded as
 * such in docs/INGESTION.md.
 */

export interface TypeInference {
  placeType: PlaceType;
  /** 0..1; 0 means "no rule matched, this is a placeholder". */
  confidence: number;
  /** Which rule fired, for auditability. */
  rule: string;
}

interface Rule {
  rule: string;
  pattern: RegExp;
  placeType: PlaceType;
  confidence: number;
}

/**
 * Ordered; first match wins, so the specific must precede the general.
 * "Castle Farmhouse" has to be caught before "castle", and "Abbeydale Works"
 * before "abbey".
 */
const RULES: readonly Rule[] = [
  // --- False friends: names containing a heritage word that are not that thing
  { rule: 'farm-not-castle', pattern: /\b(castle|abbey|priory)\s+(farm|farmhouse|cottage|barn|house|inn)\b/i, placeType: PlaceType.Monument, confidence: 0.2 },
  // "Works" only counts as an industrial site when the name *ends* with it
  // ("Abbeydale Works"). Matching it anywhere typed Fountains Abbey as an
  // industrial site, because its scheduling description lists "water
  // management works" among the things the designation covers.
  { rule: 'named-works', pattern: /\bworks\s*$/i, placeType: PlaceType.IndustrialSite, confidence: 0.7 },

  // --- Religious
  { rule: 'cathedral', pattern: /\bcathedrals?\b|\bminster\b/i, placeType: PlaceType.Cathedral, confidence: 0.9 },
  { rule: 'abbey', pattern: /\babbeys?\b/i, placeType: PlaceType.Abbey, confidence: 0.9 },
  { rule: 'priory', pattern: /\bpriory\b|\bpriories\b|\bmonaster(y|ies)\b|\bnunner(y|ies)\b/i, placeType: PlaceType.Priory, confidence: 0.85 },
  { rule: 'churchyard-monument', pattern: /\bchurchyard\s+cross\b|\bchurchyard\s+monument\b|\btombs?\b|\bheadstones?\b/i, placeType: PlaceType.Monument, confidence: 0.85 },
  { rule: 'church', pattern: /\bchurch(es)?\b|\bchapels?\b/i, placeType: PlaceType.Church, confidence: 0.9 },

  // --- Defence and military
  { rule: 'pillbox', pattern: /\bpill\s?box(es)?\b/i, placeType: PlaceType.Pillbox, confidence: 0.9 },
  { rule: 'bunker', pattern: /\bbunkers?\b|\bair\s?raid\s+shelters?\b/i, placeType: PlaceType.Bunker, confidence: 0.85 },
  { rule: 'airfield', pattern: /\bairfields?\b|\baerodromes?\b/i, placeType: PlaceType.Airfield, confidence: 0.85 },
  { rule: 'military', pattern: /\banti-?aircraft\b|\bgun\s+(site|emplacement|battery|batteries)s?\b|\bordnance\s+factor(y|ies)\b|\bbarracks\b|\bmilitary\b/i, placeType: PlaceType.MilitaryInstallation, confidence: 0.8 },
  { rule: 'battlefield', pattern: /\bbattle\s+of\b|\bbattlefield\b/i, placeType: PlaceType.Battlefield, confidence: 0.95 },

  // --- Fortification
  { rule: 'hillfort', pattern: /\bhill\s?forts?\b|\bpromontory\s+forts?\b/i, placeType: PlaceType.Hillfort, confidence: 0.9 },
  { rule: 'castle', pattern: /\bcastles?\b/i, placeType: PlaceType.Castle, confidence: 0.85 },
  { rule: 'fort', pattern: /\bforts?\b|\bfortlets?\b|\bsignal\s+stations?\b/i, placeType: PlaceType.Fort, confidence: 0.8 },

  // --- Roman and prehistoric
  { rule: 'roman-villa', pattern: /\bvillas?\b/i, placeType: PlaceType.RomanVilla, confidence: 0.8 },
  { rule: 'roman-settlement', pattern: /\broman\s+(town|settlement|fort|road|camp)s?\b/i, placeType: PlaceType.ArchaeologicalSite, confidence: 0.75 },
  { rule: 'prehistoric', pattern: /\b(barrows?|cairns?|henges?|tumulus|tumuli|standing\s+stones?|stone\s+circles?|cross-?dykes?|dykes?|earthworks?|enclosures?|oppidum|settlements?)\b/i, placeType: PlaceType.ArchaeologicalSite, confidence: 0.8 },
  { rule: 'deserted-village', pattern: /\bdeserted\b.*\bvillage\b|\bmedieval\s+village\b|\bdeserted\s+settlement\b/i, placeType: PlaceType.ArchaeologicalSite, confidence: 0.85 },

  // --- Industrial, transport
  { rule: 'colliery', pattern: /\bcollier(y|ies)\b|\bmines?\b|\bcoke\s+ovens?\b|\bfoundr(y|ies)\b|\bforges?\b|\bkilns?\b/i, placeType: PlaceType.IndustrialSite, confidence: 0.85 },
  { rule: 'mill', pattern: /\bmills?\b|\bwindmills?\b/i, placeType: PlaceType.IndustrialSite, confidence: 0.75 },
  { rule: 'railway', pattern: /\brailways?\b|\bsignal\s+box(es)?\b|\bstations?\b|\bviaducts?\b|\bengine\s+sheds?\b/i, placeType: PlaceType.RailwaySite, confidence: 0.75 },
  { rule: 'canal', pattern: /\bcanals?\b|\blocks?\b|\baqueducts?\b|\bwharf\b|\btowpaths?\b/i, placeType: PlaceType.CanalStructure, confidence: 0.8 },

  // --- Landscape and settlement
  { rule: 'garden', pattern: /\bgardens?\b|\bpleasure\s+ground\b|\barboretum\b/i, placeType: PlaceType.Garden, confidence: 0.75 },
  { rule: 'park', pattern: /\bpark\b|\bdeer\s+park\b/i, placeType: PlaceType.HistoricLandscape, confidence: 0.7 },
  { rule: 'country-house', pattern: /\bhalls?\b|\bmanors?\b|\bcourt\b|\bpalaces?\b/i, placeType: PlaceType.CountryHouse, confidence: 0.7 },
  { rule: 'monument', pattern: /\bcross(es)?\b|\bmonuments?\b|\bmemorials?\b|\bmilestones?\b|\bobelisks?\b|\bstocks\b/i, placeType: PlaceType.Monument, confidence: 0.8 },
  { rule: 'ruin', pattern: /\bruins?\b/i, placeType: PlaceType.Ruin, confidence: 0.7 },
  { rule: 'lost', pattern: /^\s*(site of|remains of)\b|\bsite\s+of\s+(the\s+)?former\b/i, placeType: PlaceType.LostStructure, confidence: 0.8 },

  // --- Ordinary listed heritage ---------------------------------------------
  // Most of NHLE is this: buildings and built works with no dramatic category.
  // Before `building`/`structure` existed these had nowhere honest to go.
  { rule: 'building', pattern: /\b(house|houses|cottages?|farmhouses?|barns?|terraces?|almshouses?|vicarage|rectory|parsonage|schools?|inns?|hotels?|stables?|granar(y|ies)|warehouses?|dovecotes?|lodges?)\b/i, placeType: PlaceType.Building, confidence: 0.7 },
  { rule: 'structure', pattern: /\b(bridges?|walls?|gates?|gate\s+piers?|piers?|railings?|culverts?|steps?|fountains?|troughs?|pumps?|posts?|boundary\s+stones?|sundials?|gazebos?|follies|folly)\b/i, placeType: PlaceType.Structure, confidence: 0.7 },
];

export const GENERIC_FALLBACK_RULE = 'generic-fallback';

/**
 * What a designation implies when the name says nothing.
 *
 * `structure` is NOT a universal fallback — it means "a constructed work with
 * no more specific type", and most designations do not imply a constructed
 * work at all. A scheduled monument is a nationally important *archaeological*
 * site, frequently an earthwork or a barrow; a registered park is grown rather
 * than built; a protected wreck is a vessel. Only a listed building is
 * definitionally a built work.
 *
 * Where a designation implies nothing about form, the answer is `unknown`.
 * Saying so is honest and reviewable; calling a shipwreck a structure is not.
 */
const DESIGNATION_FALLBACK: Readonly<Partial<Record<DesignationType, PlaceType>>> = {
  listed_building: PlaceType.Structure,
  scheduled_monument: PlaceType.ArchaeologicalSite,
  registered_park_garden: PlaceType.HistoricLandscape,
  registered_battlefield: PlaceType.Battlefield,
  protected_wreck: PlaceType.ArchaeologicalSite,
  // Deliberately absent: world_heritage_site and conservation_area imply
  // nothing about form. A WHS can be a village (Saltaire), a landscape
  // (Studley Royal) or an industrial complex.
};

export function inferPlaceType(
  name: string,
  layerName?: string,
  designation?: DesignationType,
): TypeInference {
  // A designation that names the form outright beats anything a name suggests.
  if (layerName === 'Battlefields' || designation === 'registered_battlefield') {
    return { placeType: PlaceType.Battlefield, confidence: 0.98, rule: 'designation:battlefield' };
  }
  if (layerName === 'Parks and Gardens' || designation === 'registered_park_garden') {
    return { placeType: PlaceType.HistoricLandscape, confidence: 0.9, rule: 'designation:park-garden' };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(name)) {
      return { placeType: rule.placeType, confidence: rule.confidence, rule: rule.rule };
    }
  }

  const byDesignation = designation ? DESIGNATION_FALLBACK[designation] : undefined;
  if (byDesignation) {
    return {
      placeType: byDesignation,
      confidence: 0.3,
      rule: `${GENERIC_FALLBACK_RULE}:${designation}`,
    };
  }

  // Nothing in the name, nothing implied by the designation. Say so.
  return { placeType: PlaceType.Unknown, confidence: 0, rule: GENERIC_FALLBACK_RULE };
}

/** True when a classification came from a fallback rather than real evidence. */
export function isFallbackClassification(rule: string): boolean {
  return rule.startsWith(GENERIC_FALLBACK_RULE);
}

/**
 * Whether two inferred types are incompatible enough to argue two records are
 * different places. Deliberately permissive: an untyped record is compatible
 * with everything, and related types (abbey/priory/church/ruin) do not count as
 * evidence of difference, because a source describing "Fountains Abbey" as a
 * ruin and another as an abbey is not describing two places.
 */
const COMPATIBLE_GROUPS: readonly (readonly PlaceType[])[] = [
  [PlaceType.Abbey, PlaceType.Priory, PlaceType.Church, PlaceType.Cathedral, PlaceType.Ruin, PlaceType.Monument],
  [PlaceType.Castle, PlaceType.Fort, PlaceType.Hillfort, PlaceType.Ruin, PlaceType.ArchaeologicalSite],
  [PlaceType.CountryHouse, PlaceType.Palace, PlaceType.Garden, PlaceType.HistoricLandscape, PlaceType.Building],
  [PlaceType.IndustrialSite, PlaceType.RailwaySite, PlaceType.CanalStructure, PlaceType.Building],
  [PlaceType.MilitaryInstallation, PlaceType.Pillbox, PlaceType.Bunker, PlaceType.Airfield],
  [PlaceType.ArchaeologicalSite, PlaceType.Settlement, PlaceType.HistoricVillage, PlaceType.LostStructure, PlaceType.RomanVilla],
];

export function typesAreCompatible(a: PlaceType, b: PlaceType): boolean {
  if (a === b) return true;
  // `unknown` asserts nothing, so it can never argue two records differ.
  if (a === PlaceType.Unknown || b === PlaceType.Unknown) return true;
  // `structure` is the low-information classification for a constructed work.
  // It should not contradict a more specific *constructed* type, but it is not
  // a wildcard: a battlefield or a designed landscape is not a structure, and
  // that difference is real evidence.
  const CONSTRUCTED = new Set<PlaceType>([
    PlaceType.Structure, PlaceType.Building, PlaceType.Monument, PlaceType.Castle,
    PlaceType.Church, PlaceType.Abbey, PlaceType.Priory, PlaceType.Cathedral,
    PlaceType.CountryHouse, PlaceType.Palace, PlaceType.Fort, PlaceType.Ruin,
    PlaceType.IndustrialSite, PlaceType.RailwaySite, PlaceType.CanalStructure,
    PlaceType.MilitaryInstallation, PlaceType.Pillbox, PlaceType.Bunker,
    PlaceType.Museum, PlaceType.LostStructure,
  ]);
  if (
    (a === PlaceType.Structure && CONSTRUCTED.has(b)) ||
    (b === PlaceType.Structure && CONSTRUCTED.has(a))
  ) {
    return true;
  }
  return COMPATIBLE_GROUPS.some((group) => group.includes(a) && group.includes(b));
}
