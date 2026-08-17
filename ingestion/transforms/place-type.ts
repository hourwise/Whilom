import { PlaceType } from '@whilom/domain';

/**
 * Map a heritage record onto Whilom's `PlaceType` vocabulary.
 *
 * NHLE PUBLISHES NO TYPE FIELD. A record is a name, a designation, a grade and
 * a grid reference — nothing more. So the type has to be inferred from the
 * name, which works well for "Rievaulx Abbey Cistercian monastery…" and poorly
 * for "Numbers 12 And 14 And Attached Railings". Rather than let a guess
 * masquerade as data, every rule carries a confidence, and an unmatched name
 * falls back to the generic `structure` classification at low confidence, which
 * the matcher treats as "type not established".
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

/**
 * Where a name yields no specific type.
 *
 * Every NHLE entry is by definition a designated built work, so `Structure` —
 * "a built work with no more specific classification" — is a true statement
 * about it, unlike the old fallback of `Monument`, which asserted something
 * commemorative that was usually false. The confidence stays low because the
 * *specific* type really is unknown, and the matcher must keep treating it as
 * "type not established" rather than as evidence about identity.
 *
 * This is a genuine classification, not a placeholder, so it is reported
 * separately (via `rule`) rather than by pretending confidence is zero.
 */
export const GENERIC_FALLBACK: PlaceType = PlaceType.Structure;
export const GENERIC_FALLBACK_RULE = 'generic-structure';

export function inferPlaceType(name: string, layerName?: string): TypeInference {
  // The battlefield and WHS layers are authoritative about what they contain,
  // so they win over anything the name might suggest.
  if (layerName === 'Battlefields') {
    return { placeType: PlaceType.Battlefield, confidence: 0.98, rule: 'layer:battlefields' };
  }
  if (layerName === 'Parks and Gardens') {
    return { placeType: PlaceType.HistoricLandscape, confidence: 0.9, rule: 'layer:parks-and-gardens' };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(name)) {
      return { placeType: rule.placeType, confidence: rule.confidence, rule: rule.rule };
    }
  }

  return { placeType: GENERIC_FALLBACK, confidence: 0.25, rule: GENERIC_FALLBACK_RULE };
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
  // `structure` is the deliberate catch-all for "a built work we cannot type
  // more precisely". It is a true statement about almost any heritage record,
  // so it must never be the thing that argues two records are different places.
  if (a === PlaceType.Structure || b === PlaceType.Structure) return true;
  return COMPATIBLE_GROUPS.some((group) => group.includes(a) && group.includes(b));
}
