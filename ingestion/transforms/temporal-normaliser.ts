/**
 * The one place a raw temporal value becomes a bounded span.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 *
 * Whilom's temporal claims arrive as text and as structured source values, and
 * every one of them has to answer two different questions without confusing
 * them:
 *
 *   - **What years should this match?** Filtering needs a bounded span, even
 *     for "14th century" or "Iron Age".
 *   - **What may Whilom say out loud?** A source that said "14th century" must
 *     never be quoted back as "1350", however convenient the span is.
 *
 * Those are different answers, so a claim carries both: a span for matching and
 * a precision that caps what may be displayed. Scattering these conversions
 * through ingestion code is how the two quietly merge, so there is exactly one
 * module that owns them and it is versioned.
 *
 * ---------------------------------------------------------------------------
 * Conventions, stated as conventions
 * ---------------------------------------------------------------------------
 *
 * Several rules below are choices rather than facts. They are collected here,
 * documented, and tested, so they can be argued with:
 *
 *   - A century runs from year 01 to year 00: C17 is 1601–1700. This is the
 *     common historical convention and the one migration 0029 already uses.
 *   - "Early", "mid" and "late" split a century into thirds. No source defines
 *     these precisely; thirds are even-handed and, crucially, the precision
 *     stays `century` so the narrower span never becomes a narrower claim.
 *   - "c." widens a year by ±10 years. Nothing licenses a specific number; the
 *     span exists so filtering behaves sensibly, and the displayed claim stays
 *     "c. 1720".
 *
 * ---------------------------------------------------------------------------
 * Years
 * ---------------------------------------------------------------------------
 *
 * Signed integers, historical convention: -1 is 1 BCE, 1 is 1 CE, and there is
 * no year zero. Every span produced here is checked against that before it is
 * returned, because a silently-generated year 0 would be rejected by the
 * database constraint far away from the code that caused it.
 */

export const NORMALISER_VERSION = '1.0.0';

/** Mirrors `public.temporal_precision` in migration 0029. */
export type TemporalPrecision =
  | 'exact_year'
  | 'circa'
  | 'decade'
  | 'century'
  | 'period'
  | 'range'
  | 'before'
  | 'after'
  | 'unknown';

/** Which third of a century a claim points at, when the source says. */
export type CenturyQualifier = 'early' | 'mid' | 'late';

export interface NormalisedSpan {
  /** Signed years, inclusive, no year zero. */
  startYear: number;
  endYear: number;
  /** Caps what may be displayed. Never raised to suit a narrow span. */
  precision: TemporalPrecision;
  /** Set only when the source qualified a century. */
  qualifier: CenturyQualifier | null;
  /**
   * What Whilom may say. Derived from the precision, not from the span, so a
   * century claim renders as a century however narrow its bounds are.
   */
  label: string;
  /** How the span was reached, in words, so a claim can be audited. */
  derivation: string;
  /** The version of these rules that produced it. */
  normaliserVersion: string;
}

/** Why a value could not be turned into a defensible span. */
export type RejectionReason =
  | 'no_temporal_content'
  | 'vague_language'
  | 'precision_too_coarse'
  | 'unparseable_structure'
  | 'out_of_range'
  | 'contradictory_range';

export interface Rejection {
  reason: RejectionReason;
  /** The value exactly as the source gave it. */
  value: string;
  /** Why this rule fired, for the quarantine report. */
  note: string;
}

export type NormalisationResult =
  | { ok: true; span: NormalisedSpan }
  | { ok: false; rejection: Rejection };

// ---------------------------------------------------------------------------
// Year arithmetic
// ---------------------------------------------------------------------------

/** The earliest year Whilom will accept from any source. */
export const MIN_YEAR = -900_000;
/** Late enough for anything heritage, early enough to catch a parsing slip. */
export const MAX_YEAR = 2100;

/**
 * Guard every span before it leaves this module.
 *
 * Year zero does not exist, and a span that contains it has been built by
 * arithmetic that forgot. Catching it here rather than at the database keeps
 * the error next to the rule that caused it.
 */
function checked(span: NormalisedSpan): NormalisationResult {
  const { startYear, endYear } = span;
  if (startYear === 0 || endYear === 0) {
    return {
      ok: false,
      rejection: {
        reason: 'unparseable_structure',
        value: span.label,
        note: 'produced year zero, which does not exist in the historical convention',
      },
    };
  }
  if (endYear < startYear) {
    return {
      ok: false,
      rejection: { reason: 'contradictory_range', value: span.label, note: 'end year precedes start year' },
    };
  }
  if (startYear < MIN_YEAR || endYear > MAX_YEAR) {
    return {
      ok: false,
      rejection: { reason: 'out_of_range', value: span.label, note: `outside ${MIN_YEAR}..${MAX_YEAR}` },
    };
  }
  return { ok: true, span };
}

/**
 * The years a century covers, in the era given.
 *
 * C17 CE is 1601–1700. The 1st century BCE is 100 BCE to 1 BCE. Neither touches
 * year zero, which is the point of computing it this way rather than by adding
 * and subtracting from a notional origin.
 */
export function centurySpanSigned(
  century: number,
  era: 'ce' | 'bce',
): { start: number; end: number } {
  if (era === 'ce') return { start: (century - 1) * 100 + 1, end: century * 100 };
  return { start: -(century * 100), end: -((century - 1) * 100 + 1) };
}

/** The century a signed year falls in, with its era. */
export function centuryOfYear(year: number): { century: number; era: 'ce' | 'bce' } {
  if (year > 0) return { century: Math.ceil(year / 100), era: 'ce' };
  return { century: Math.ceil(-year / 100), era: 'bce' };
}

/** "17th", "1st", "22nd" — used in labels so they read like English. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** A year as a reader expects it: never negative, never zero. */
export function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : String(year);
}

function centuryLabel(century: number, era: 'ce' | 'bce', qualifier: CenturyQualifier | null): string {
  const base = `${ordinal(century)} century${era === 'bce' ? ' BCE' : ''}`;
  return qualifier ? `${qualifier} ${base}` : base;
}

/**
 * Narrow a century to the third a qualifier points at.
 *
 * A century is 100 years and does not divide into three evenly, so the middle
 * third absorbs the remainder. The precision stays `century` regardless: this
 * narrows what matches, never what Whilom claims.
 */
function thirdOfCentury(
  span: { start: number; end: number },
  qualifier: CenturyQualifier,
): { start: number; end: number } {
  const first = span.start + 32;
  const second = span.start + 66;
  if (qualifier === 'early') return { start: span.start, end: first };
  if (qualifier === 'mid') return { start: first + 1, end: second };
  return { start: second + 1, end: span.end };
}

// ---------------------------------------------------------------------------
// Structured source values: Wikidata
// ---------------------------------------------------------------------------

/**
 * Wikidata's `timePrecision` codes.
 *
 * This is the single most important table in the batch. Wikidata stores "14th
 * century" as the *time value* `+1350-01-01` with precision 7, and an importer
 * that reads only the time value records the year 1350 for a claim that never
 * mentioned a year. Roughly half the temporal statements attached to English
 * listed buildings are century-precision, so ignoring this field would make
 * about half of everything imported quietly false.
 */
export const WIKIDATA_PRECISION = {
  Millennium: 6,
  Century: 7,
  Decade: 8,
  Year: 9,
  Month: 10,
  Day: 11,
} as const;

/**
 * Parse a Wikidata time literal into a signed year.
 *
 * Wikidata writes `+1350-01-01T00:00:00Z` and `-0044-03-15T00:00:00Z`, and the
 * negative form already means "44 BCE" in the historical sense, so it maps onto
 * Whilom's convention directly. The one value that does not is `+0000`, which
 * some statements carry and which no historical convention accepts; it is read
 * as 1 BCE, the same way the people importer reads it.
 */
export function parseWikidataYear(literal: string): number | null {
  const match = /^([+-])(\d{1,16})-/.exec(literal.trim());
  if (!match) return null;
  const magnitude = Number(match[2]);
  if (!Number.isFinite(magnitude)) return null;
  if (magnitude === 0) return -1;
  return match[1] === '-' ? -magnitude : magnitude;
}

/**
 * Turn a Wikidata time statement into a span that says only what it knows.
 *
 * `year` and finer collapse to the year: Whilom's temporal model is annual, and
 * a day-precision inception is still a claim about that year.
 */
export function normaliseWikidataTime(
  literal: string,
  wikidataPrecision: number,
  context: { field: string },
): NormalisationResult {
  const year = parseWikidataYear(literal);
  if (year === null) {
    return {
      ok: false,
      rejection: {
        reason: 'unparseable_structure',
        value: literal,
        note: 'not a Wikidata time literal',
      },
    };
  }

  const base = { qualifier: null, normaliserVersion: NORMALISER_VERSION } as const;

  if (wikidataPrecision <= WIKIDATA_PRECISION.Millennium) {
    // A millennium is too coarse to be worth a claim on a heritage map, and
    // silently promoting it to a century would be exactly the invention this
    // module exists to prevent.
    return {
      ok: false,
      rejection: {
        reason: 'precision_too_coarse',
        value: literal,
        note: `Wikidata precision ${wikidataPrecision} is millennium or coarser`,
      },
    };
  }

  if (wikidataPrecision === WIKIDATA_PRECISION.Century) {
    const { century, era } = centuryOfYear(year);
    const span = centurySpanSigned(century, era);
    return checked({
      ...base,
      startYear: span.start,
      endYear: span.end,
      precision: 'century',
      label: centuryLabel(century, era, null),
      derivation:
        `Wikidata ${context.field} "${literal}" at century precision; ` +
        `read as the ${centuryLabel(century, era, null)} (${formatYear(span.start)}–${formatYear(span.end)}), not as a year`,
    });
  }

  if (wikidataPrecision === WIKIDATA_PRECISION.Decade) {
    // Wikidata names a decade by its first year going forward in time, so the
    // 1870s are stored as 1870 and the 500s BCE as -500.
    const span = year > 0 ? { start: year, end: year + 9 } : { start: year - 9, end: year };
    return checked({
      ...base,
      startYear: span.start,
      endYear: span.end,
      precision: 'decade',
      label: year > 0 ? `${year}s` : `${-span.end}s BCE`,
      derivation: `Wikidata ${context.field} "${literal}" at decade precision; read as ${formatYear(span.start)}–${formatYear(span.end)}`,
    });
  }

  // Year, month or day. All are claims about a single year as far as Whilom's
  // model is concerned.
  return checked({
    ...base,
    startYear: year,
    endYear: year,
    precision: 'exact_year',
    label: formatYear(year),
    derivation: `Wikidata ${context.field} "${literal}" at year precision or finer`,
  });
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

/**
 * Language that gestures at the past without dating it.
 *
 * These must never become years. "Ancient" spans four thousand years and
 * "probably early" does not say early *what*. They are quarantined rather than
 * dropped, so the ranking in the audit can show what a future batch would gain
 * by handling them — and so nobody re-adds them as a guess.
 */
const VAGUE_LANGUAGE: RegExp[] = [
  /^\s*(?:old|ancient|historic(?:al)?|former|early|late|mid)\s*$/i,
  /\bvarious\s+dates?\b/i,
  /\b(?:medi(?:e|ae)val\s+or\s+later|or\s+earlier|and\s+earlier|undated|date\s+unknown)\b/i,
  /^\s*probably\s+(?:early|late|mid)\s*$/i,
];

const SPELLED_CENTURIES: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21,
};

const QUALIFIER_WORDS: Record<string, CenturyQualifier> = {
  early: 'early',
  earlier: 'early',
  beginning: 'early',
  mid: 'mid',
  middle: 'mid',
  late: 'late',
  later: 'late',
  end: 'late',
};

/** How far either side of a circa year Whilom will look. A convention. */
export const CIRCA_TOLERANCE_YEARS = 10;

/**
 * Read a single temporal phrase.
 *
 * Deliberately ordered most specific first: a range must be recognised before
 * the bare year inside it is, and a qualified century before the century.
 *
 * Returns a rejection rather than null so the caller can quarantine and rank
 * what is not yet handled instead of losing it.
 */
export function normalisePhrase(raw: string | null | undefined): NormalisationResult {
  const value = (raw ?? '').trim();
  if (value === '') {
    return { ok: false, rejection: { reason: 'no_temporal_content', value: '', note: 'empty' } };
  }
  if (VAGUE_LANGUAGE.some((p) => p.test(value))) {
    return {
      ok: false,
      rejection: {
        reason: 'vague_language',
        value,
        note: 'gestures at the past without dating it; a year here would be invented',
      },
    };
  }

  const base = { normaliserVersion: NORMALISER_VERSION } as const;

  // --- An explicit year range: "1845-1848", "1845–48" ----------------------
  const range = /\b(1\d{3}|20[0-2]\d)\s*(?:-|–|—|to)\s*(1\d{3}|20[0-2]\d|\d{2})\b/i.exec(value);
  if (range) {
    const start = Number(range[1]);
    // "1845–48" is a real and common abbreviation; expand it within the century
    // rather than reading 48 as the year 48.
    const tail = range[2]!;
    const end = tail.length === 2 ? Number(String(start).slice(0, 2) + tail) : Number(tail);
    return checked({
      ...base,
      startYear: start,
      endYear: end,
      precision: 'range',
      qualifier: null,
      label: `${start}–${end}`,
      derivation: `source gives the explicit range "${range[0]}"`,
    });
  }

  // --- Circa: "c.1720", "c 1720", "circa 1720", "about 1720" ---------------
  const circa = /\b(?:c\.?|ca\.?|circa|about|around)\s*(1\d{3}|20[0-2]\d)\b/i.exec(value);
  if (circa) {
    const year = Number(circa[1]);
    return checked({
      ...base,
      startYear: year - CIRCA_TOLERANCE_YEARS,
      endYear: year + CIRCA_TOLERANCE_YEARS,
      precision: 'circa',
      qualifier: null,
      label: `c. ${year}`,
      derivation:
        `source gives "${circa[0]}"; matched across ±${CIRCA_TOLERANCE_YEARS} years by Whilom convention, ` +
        'and displayed as circa rather than as a year',
    });
  }

  // --- A qualified or bare century -----------------------------------------
  const century = readCentury(value);
  if (century) {
    const full = centurySpanSigned(century.century, century.era);
    const span = century.qualifier ? thirdOfCentury(full, century.qualifier) : full;
    return checked({
      ...base,
      startYear: span.start,
      endYear: span.end,
      precision: 'century',
      qualifier: century.qualifier,
      label: centuryLabel(century.century, century.era, century.qualifier),
      derivation: century.qualifier
        ? `source gives "${century.matched}"; the ${century.qualifier} third of the ` +
          `${centuryLabel(century.century, century.era, null)} by Whilom convention, and still a century-level claim`
        : `source gives "${century.matched}"; the ${centuryLabel(century.century, century.era, null)} is ` +
          `${formatYear(full.start)}–${formatYear(full.end)}`,
    });
  }

  // --- A decade: "the 1730s" ------------------------------------------------
  const decade = /\b(1\d{2}0|20[0-2]0)s\b/.exec(value);
  if (decade) {
    const start = Number(decade[1]);
    return checked({
      ...base,
      startYear: start,
      endYear: start + 9,
      precision: 'decade',
      qualifier: null,
      label: `${start}s`,
      derivation: `source gives the decade "${decade[0]}"`,
    });
  }

  // --- A bare year ----------------------------------------------------------
  const year = /\b(1\d{3}|20[0-2]\d)\b/.exec(value);
  if (year) {
    const y = Number(year[1]);
    return checked({
      ...base,
      startYear: y,
      endYear: y,
      precision: 'exact_year',
      qualifier: null,
      label: String(y),
      derivation: `source gives the year "${year[0]}"`,
    });
  }

  return {
    ok: false,
    rejection: {
      reason: 'no_temporal_content',
      value,
      note: 'no year, range, century or decade found',
    },
  };
}

interface CenturyRead {
  century: number;
  era: 'ce' | 'bce';
  qualifier: CenturyQualifier | null;
  matched: string;
}

/**
 * Recognise a century, with an optional early/mid/late qualifier and an
 * optional BCE marker.
 *
 * Three spellings are accepted because all three appear in heritage writing:
 * the abbreviation "C18", the ordinal "18th century", and the word "eighteenth
 * century".
 */
export function readCentury(value: string): CenturyRead | null {
  const qualifierPattern = '(?:(early|earlier|mid|middle|late|later|beginning|end)(?:\\s+of\\s+the)?[\\s-]+)?';
  const eraPattern = '(?:\\s*(bce|bc))?';

  const patterns: { re: RegExp; read: (m: RegExpExecArray) => number | null }[] = [
    {
      re: new RegExp(`\\b${qualifierPattern}C(\\d{1,2})\\b${eraPattern}`, 'i'),
      read: (m) => Number(m[2]),
    },
    {
      re: new RegExp(`\\b${qualifierPattern}(\\d{1,2})(?:st|nd|rd|th)[\\s-]+century${eraPattern}`, 'i'),
      read: (m) => Number(m[2]),
    },
    {
      re: new RegExp(
        `\\b${qualifierPattern}(${Object.keys(SPELLED_CENTURIES).join('|')})[\\s-]+century${eraPattern}`,
        'i',
      ),
      read: (m) => SPELLED_CENTURIES[m[2]!.toLowerCase()] ?? null,
    },
  ];

  for (const { re, read } of patterns) {
    const m = re.exec(value);
    if (!m) continue;
    const century = read(m);
    if (century === null || century < 1 || century > 21) continue;
    const word = m[1]?.toLowerCase();
    return {
      century,
      era: m[3] ? 'bce' : 'ce',
      qualifier: word ? (QUALIFIER_WORDS[word] ?? null) : null,
      matched: m[0].trim(),
    };
  }
  return null;
}
