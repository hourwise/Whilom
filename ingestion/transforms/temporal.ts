/**
 * Extracting when something is from, without inventing it.
 *
 * ---------------------------------------------------------------------------
 * What this may not use
 * ---------------------------------------------------------------------------
 *
 * The National Heritage List carries six date fields — `ListDate`, `SchedDate`,
 * `RegDate`, `InscrDate`, `DesigDate`, `AmendDate` — and **not one of them is a
 * historic date**. Every one records when the state conferred or amended
 * protection. A church listed in 1967 was not built in 1967, and treating that
 * field as a construction date would fill the map with Victorian abbeys and
 * post-war castles.
 *
 * So the register, for all its 23,315 records in the Yorkshire region, supplies
 * no construction date at all. That is a fact about the source, and the honest
 * response is sparse temporal coverage rather than a plausible-looking fiction.
 *
 * ---------------------------------------------------------------------------
 * What this may use
 * ---------------------------------------------------------------------------
 *
 * Only the source's own words about what a thing IS: "Roman villa", "medieval
 * moated site", "C17 barn", "World War II pillbox". When Historic England names
 * a monument as Roman, that is Historic England's claim about its period, not
 * an inference of ours, and it travels with the original text so it can be
 * checked or withdrawn.
 *
 * The line this holds: extracting "Iron Age" from "Iron Age hillfort" is
 * reading. Concluding "probably Georgian" from a sash window is guessing.
 */

export interface TemporalClaim {
  /** Period id from the registry in migration 0029. */
  periodId: string;
  /** Signed years, historical convention, no year zero. */
  startYear: number;
  endYear: number;
  precision: 'century' | 'period';
  /** The exact substring that produced this claim. */
  originalText: string;
  /** How it was reached, so the claim can be audited. */
  derivation: string;
}

/** Registry spans, mirroring migration 0029. Kept in step by a test. */
export const PERIOD_SPANS: Record<string, { start: number; end: number }> = {
  palaeolithic: { start: -900_000, end: -10_001 },
  mesolithic: { start: -10_000, end: -4_001 },
  neolithic: { start: -4_000, end: -2_201 },
  bronze_age: { start: -2_200, end: -801 },
  iron_age: { start: -800, end: 42 },
  roman: { start: 43, end: 409 },
  early_medieval: { start: 410, end: 1065 },
  norman: { start: 1066, end: 1153 },
  medieval: { start: 1154, end: 1484 },
  tudor: { start: 1485, end: 1602 },
  stuart: { start: 1603, end: 1713 },
  georgian: { start: 1714, end: 1836 },
  victorian: { start: 1837, end: 1900 },
  edwardian: { start: 1901, end: 1913 },
  wwi: { start: 1914, end: 1918 },
  interwar: { start: 1919, end: 1938 },
  wwii: { start: 1939, end: 1945 },
  postwar: { start: 1946, end: 1979 },
  late_20th: { start: 1980, end: 1999 },
  contemporary: { start: 2000, end: 2100 },
};

/**
 * Phrases that contain a period word but are not a period claim.
 *
 * "Roman Catholic Church of St Anne" is a denomination, not a Roman building,
 * and there are 92 apparent "Roman" matches in the Yorkshire region of which a
 * good number are exactly this. Cheap to exclude, embarrassing not to.
 */
const FALSE_POSITIVES: RegExp[] = [
  /\broman\s+catholic\b/i,
  /\bnorman\s+(?:road|street|avenue|close|court|terrace|way|house|cottage|lodge|farm)\b/i,
  /\bvictoria\b(?!n)/i, // "Victoria Road" is not the Victorian period
];

/**
 * A period word used as a proper name rather than a date.
 *
 * "TUDOR COTTAGE" is, far more often than not, a 19th-century house with a name.
 * The pattern is a period word immediately followed by a dwelling word and
 * nothing else of substance — a real period claim reads "Tudor range of the
 * north wing", not "Tudor Cottage".
 */
const PROPER_NAME_USE =
  /\b(tudor|georgian|victorian|norman|roman|saxon|stuart)\s+(cottage|house|barn|farm|farmhouse|hall|lodge|cottages|bungalow|inn|court|lea|view|mount|bank|croft)\b/i;

/**
 * A period word being used as a street name or a surname.
 *
 * Measured against the real region, these were the extractor's worst mistakes:
 * "19 AND 21, ROMAN ROAD" is an address and "STATUE OF JAMES STUART" is a man,
 * and both produced confident period claims that were simply false.
 */
const NOT_A_PERIOD_CONTEXT: RegExp[] = [
  /\b(?:roman|norman|victoria|stuart|tudor|george|albert)\s+(?:road|street|avenue|lane|close|drive|way|terrace|crescent|gardens|place|square|walk|rise|grove)\b/i,
  /\bstatue\s+of\b/i,
  /\b(?:king|queen|sir|lord|lady|saint|st)\s+\w*\s*(?:stuart|tudor|norman)\b/i,
];

/**
 * Nouns that make a period word descriptive rather than decorative.
 *
 * "Roman villa" is a claim about a period; "Roman Road" is a postal address. The
 * difference is what the period word is attached to, so a bare period word is
 * only accepted when a monument noun sits nearby — or when the record is a
 * scheduled monument, whose names are formal archaeological descriptions rather
 * than addresses.
 */
const MONUMENT_NOUNS =
  /\b(?:villa|fort|fortlet|camp|settlement|enclosure|barrow|cairn|henge|tumulus|earthwork|dyke|hillfort|rampart|burial|cemetery|cist|monument|monastery|nunnery|abbey|priory|friary|chapel|church|minster|castle|motte|bailey|keep|moat|moated|manor|grange|mill|kiln|furnace|bloomery|quarry|mine|bridge|causeway|signal\s+station|watchtower|pillbox|bunker|decoy|radar|battery|aerodrome|airfield|defences?|site|remains|ruins?|cross|font|sundial|tomb|effigy|gatehouse|arch|tower|platform|deserted\s+(?:medieval\s+)?village|field\s+system|trackway)\b/i;

interface PeriodPattern {
  periodId: string;
  pattern: RegExp;
}

/**
 * Explicit period language. Ordered so that the more specific wins — "Romano-
 * British" must not be consumed by a bare "Roman" rule that then loses the
 * distinction.
 */
const PERIOD_PATTERNS: PeriodPattern[] = [
  { periodId: 'palaeolithic', pattern: /\b(?:palaeolithic|paleolithic)\b/i },
  { periodId: 'mesolithic', pattern: /\bmesolithic\b/i },
  { periodId: 'neolithic', pattern: /\bneolithic\b/i },
  { periodId: 'bronze_age', pattern: /\bbronze[\s-]age\b/i },
  { periodId: 'iron_age', pattern: /\biron[\s-]age\b/i },
  { periodId: 'roman', pattern: /\b(?:romano[\s-]british|roman)\b/i },
  { periodId: 'early_medieval', pattern: /\b(?:anglo[\s-]saxon|saxon|viking|early[\s-]medi(?:e|ae)val)\b/i },
  { periodId: 'norman', pattern: /\bnorman\b/i },
  { periodId: 'medieval', pattern: /\bmedi(?:e|ae)val\b/i },
  { periodId: 'tudor', pattern: /\btudor\b/i },
  { periodId: 'stuart', pattern: /\b(?:stuart|jacobean|civil war)\b/i },
  { periodId: 'georgian', pattern: /\b(?:georgian|regency)\b/i },
  { periodId: 'victorian', pattern: /\bvictorian\b/i },
  { periodId: 'edwardian', pattern: /\bedwardian\b/i },
  { periodId: 'wwi', pattern: /\b(?:first world war|world war (?:i|one)|ww1|wwi)\b/i },
  { periodId: 'wwii', pattern: /\b(?:second world war|world war (?:ii|two)|ww2|wwii)\b/i },
  { periodId: 'postwar', pattern: /\b(?:cold war)\b/i },
];

const SPELLED_CENTURIES: Record<string, number> = {
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
  fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20,
};

/** The CE years a century number covers. C17 is 1601-1700. */
export function centurySpan(century: number): { start: number; end: number } {
  return { start: (century - 1) * 100 + 1, end: century * 100 };
}

/** The registry period a span sits most fully inside, if any. */
function periodForSpan(start: number, end: number): string | null {
  let best: { id: string; overlap: number } | null = null;
  for (const [id, span] of Object.entries(PERIOD_SPANS)) {
    const overlap = Math.min(end, span.end) - Math.max(start, span.start);
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) best = { id, overlap };
  }
  return best ? best.id : null;
}

/**
 * Read every defensible temporal claim out of a piece of source text.
 *
 * Returns an empty array far more often than not, which is the correct answer
 * for most of the register and must not be treated as a failure.
 */
export function extractTemporalClaims(
  text: string | null | undefined,
  options: { descriptiveSource?: boolean } = {},
): TemporalClaim[] {
  if (!text) return [];
  if (FALSE_POSITIVES.some((p) => p.test(text))) return [];
  if (NOT_A_PERIOD_CONTEXT.some((p) => p.test(text))) return [];
  if (PROPER_NAME_USE.test(text)) return [];

  // A bare period word only counts when it is describing a monument.
  // `descriptiveSource` is set for record types whose names are formal
  // descriptions — scheduled monuments — rather than postal addresses.
  const descriptive = options.descriptiveSource === true || MONUMENT_NOUNS.test(text);

  const claims = new Map<string, TemporalClaim>();
  const push = (claim: TemporalClaim) => {
    if (!claims.has(claim.periodId)) claims.set(claim.periodId, claim);
  };

  // --- Centuries, the strongest evidence the register offers ----------------
  // "C17", "17th century", "seventeenth century". Unambiguous and precise to
  // the century, which is genuinely more than a period name gives.
  const centuryHits: { century: number; text: string }[] = [];
  for (const m of text.matchAll(/\bC(\d{1,2})\b/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 21) centuryHits.push({ century: n, text: m[0] });
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)[\s-]century\b/gi)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 21) centuryHits.push({ century: n, text: m[0] });
  }
  for (const m of text.matchAll(
    /\b(tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)[\s-]century\b/gi,
  )) {
    const n = SPELLED_CENTURIES[m[1]!.toLowerCase()];
    if (n) centuryHits.push({ century: n, text: m[0] });
  }

  for (const hit of centuryHits) {
    const span = centurySpan(hit.century);
    const periodId = periodForSpan(span.start, span.end);
    if (!periodId) continue;
    push({
      periodId,
      startYear: span.start,
      endYear: span.end,
      precision: 'century',
      originalText: hit.text,
      derivation: `century "${hit.text}" read as ${span.start}-${span.end}, mapped to the period it overlaps most`,
    });
  }

  // --- Named periods --------------------------------------------------------
  // Centuries above are accepted anywhere: "C18" in a listed-building name is a
  // date wherever it appears. A bare period WORD needs the context test.
  if (!descriptive) return [...claims.values()];

  for (const { periodId, pattern } of PERIOD_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const span = PERIOD_SPANS[periodId];
    if (!span) continue;
    push({
      periodId,
      startYear: span.start,
      endYear: span.end,
      precision: 'period',
      originalText: match[0],
      derivation: `source names the period "${match[0]}"; years from the Whilom period registry, which is a navigation convention`,
    });
  }

  return [...claims.values()];
}

/**
 * The association type a claim should carry.
 *
 * Everything extracted from a name is `built` — the source is saying what the
 * thing is and therefore when it was made. `existed`, `event` and `lost` need
 * evidence this source does not provide, and are left for data that has it.
 */
export const NAME_DERIVED_ASSOCIATION = 'built' as const;

/**
 * Field names that must never be read as a historic date.
 *
 * Exported so the rule is testable rather than merely documented. Every one of
 * these records when protection was conferred or amended.
 */
export const FORBIDDEN_DATE_FIELDS = [
  'ListDate',
  'SchedDate',
  'RegDate',
  'InscrDate',
  'DesigDate',
  'AmendDate',
  'first_designated',
] as const;

export function isForbiddenDateField(field: string): boolean {
  return (FORBIDDEN_DATE_FIELDS as readonly string[]).includes(field);
}
