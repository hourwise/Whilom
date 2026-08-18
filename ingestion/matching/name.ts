/**
 * Name normalisation and comparison for matching (spec §36).
 *
 * Heritage names are hostile to naive comparison. NHLE alone contains hundreds
 * of records named exactly "CHURCH OF ST MARY", dozens of "VILLAGE CROSS", and
 * long scheduling descriptions like "Fountains Cistercian Abbey; monastic
 * precinct, mill, water management works…" for a site every other source calls
 * "Fountains Abbey". So this module does two separate jobs: make names
 * comparable, and judge whether a name is distinctive enough for its similarity
 * to mean anything at all.
 *
 * It also does a third job, added after the 5,000-record scale tier showed why
 * it was needed: recognise when a name says, in the source's own words, that
 * its subject is NOT the thing it is named after. The statutory list is full of
 * separately designated curtilage structures — "Sundial to South of Church of
 * St Mary", "Stable Block at Brattleby Hall", "Railings, Gate Piers and Gate to
 * Burnley College" — and every one of those is a different protected object
 * from the building in its name. Treating the containment of one name inside
 * another as evidence of identity merged a sundial into a church.
 */

/** Words that carry no identifying force in an English heritage name. */
const STOPWORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'at', 'in', 'on', 'to', 'near', 'by', 'with',
]);

/**
 * Tokens that appear in so many heritage names that a name built only from
 * them identifies nothing. "Church of St Mary" is not a name that can be
 * matched on — it is a description that hundreds of separate buildings share.
 */
const GENERIC_TOKENS = new Set([
  // Building / site words
  'church', 'chapel', 'churchyard', 'cross', 'monument', 'memorial', 'milestone',
  'bridge', 'barn', 'house', 'farm', 'farmhouse', 'cottage', 'cottages', 'hall',
  'mill', 'windmill', 'station', 'castle', 'abbey', 'priory', 'grange', 'lodge',
  'gate', 'gates', 'wall', 'walls', 'stocks', 'well', 'tower', 'school', 'inn',
  'village', 'green', 'manor', 'court', 'park', 'garden', 'gardens', 'site',
  'remains', 'ruins', 'former', 'building', 'buildings', 'works', 'yard',
  'boundary', 'marker', 'lock', 'aqueduct', 'canal', 'railway', 'signal', 'box',
  'pillbox', 'shelter', 'barrow', 'cairn', 'earthwork', 'enclosure', 'settlement',
  // Saints and dedications
  'st', 'saint', 'saints', 'all', 'holy', 'trinity', 'mary', 'virgin', 'john',
  'peter', 'paul', 'james', 'andrew', 'michael', 'george', 'nicholas', 'margaret',
  'helen', 'lawrence', 'laurence', 'martin', 'giles', 'oswald', 'cuthbert',
  'bartholomew', 'gregory', 'matthew', 'hilda', 'edmund', 'leonard', 'chad',
  'magdalene', 'baptist', 'evangelist', 'stephen', 'thomas', 'anne', 'ann',
  // Position / scale words
  'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western',
  'great', 'little', 'upper', 'lower', 'old', 'new', 'high', 'low', 'middle',
  'number', 'no', 'approximately', 'metres', 'metre', 'yards', 'yard',
]);

/**
 * Phrases that place a record's subject relative to something else.
 *
 * Everything from the first of these onwards describes WHERE the thing is, not
 * WHAT it is. The compass forms are listed before the bare prepositions so that
 * "to the South of X" splits at "to", not at the later "of".
 */
const RELATION_PATTERN = new RegExp(
  [
    // "…approximately 10 metres east of…", "…300m south west of…"
    String.raw`\b(?:approximately|approx|about|circa)?\s*\d+(?:\.\d+)?\s*(?:m|metres?|meters?|yards?|yds?|ft|feet)\b[\s\S]*?\bof\b`,
    // "…to the south of…", "…north-west of…"
    String.raw`\b(?:to\s+(?:the\s+)?)?(?:north|south|east|west)(?:[\s-]?(?:east|west))?\s+of\b`,
    String.raw`\b(?:n|s|e|w|ne|nw|se|sw)\s+of\b`,
    // Explicit attachment / adjacency
    String.raw`\battached\s+to\b`,
    String.raw`\badjoining\b`,
    String.raw`\badjacent\s+to\b`,
    String.raw`\bin\s+front\s+of\b`,
    String.raw`\bin\s+the\s+(?:garden|grounds|churchyard|precinct|forecourt)s?\s+of\b`,
    String.raw`\bforecourt\s+of\b`,
    String.raw`\bassociated\s+with\b`,
    String.raw`\boutside\b`,
    String.raw`\bwithin\b`,
    // Bare prepositions, last so the richer forms win.
    String.raw`\bat\b`,
    String.raw`\bto\b`,
  ].join('|'),
  'i',
);

/** Leading street number(s): "2,", "255-261,", "273 and 275". */
const STREET_NUMBER_PATTERN = /^\s*(\d+[a-z]?(?:\s*(?:-|–|and|&)\s*\d+[a-z]?)*)\b/i;

/** Strip accents, punctuation and case so two spellings can be compared. */
export function normaliseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** What a heritage name is actually asserting. */
export interface NameAnalysis {
  /** The subject: everything before the first relational phrase. */
  head: string;
  headTokens: string[];
  /** The positional phrase, if the name has one. */
  relation: string | null;
  /** The thing the subject is positioned against. */
  relationObjectTokens: string[];
  /** The full relational tail, tokenised — the discriminator between siblings. */
  relationTokens: string[];
  /** Leading street numbers, so "2, X" and "8, X" are not confused. */
  streetNumbers: string[];
}

function tokenise(value: string): string[] {
  return normaliseName(value)
    .split(' ')
    .filter((token) => token !== '' && !STOPWORDS.has(token));
}

/**
 * Split a name into what it is and where it is.
 *
 * The descriptive tail after a semicolon is dropped first — that is a scheduling
 * description, not a position — then the name is cut at its first relational
 * phrase.
 */
export function analyseName(value: string): NameAnalysis {
  const beforeSemicolon = value.split(/[;:]/)[0] ?? value;

  const streetMatch = STREET_NUMBER_PATTERN.exec(beforeSemicolon);
  const streetNumbers = streetMatch
    ? (streetMatch[1] ?? '').split(/\s*(?:-|–|and|&)\s*/i).map((n) => n.trim().toLowerCase()).filter(Boolean)
    : [];

  const relationMatch = RELATION_PATTERN.exec(beforeSemicolon);
  if (!relationMatch || relationMatch.index === 0) {
    // No relation, or the name begins with one and therefore has no subject to
    // separate — treat the whole thing as the subject.
    return {
      head: beforeSemicolon.trim(),
      headTokens: tokenise(beforeSemicolon),
      relation: null,
      relationObjectTokens: [],
      relationTokens: [],
      streetNumbers,
    };
  }

  const head = beforeSemicolon.slice(0, relationMatch.index).trim();
  const relation = beforeSemicolon.slice(relationMatch.index).trim();
  // The object is what follows the relational phrase itself.
  const object = relation.slice(relationMatch[0].length).trim();

  return {
    head,
    headTokens: tokenise(head),
    relation,
    relationObjectTokens: tokenise(object),
    relationTokens: tokenise(relation),
    streetNumbers,
  };
}

/**
 * The identifying part of a name: normalised, with the descriptive tail after a
 * semicolon or a positional phrase removed, and stopwords dropped.
 */
export function nameTokens(value: string): string[] {
  return analyseName(value).headTokens;
}

/**
 * True when a name is built entirely from words that thousands of heritage
 * records share, so similarity between two such names is not evidence they are
 * the same place.
 */
export function isGenericName(value: string): boolean {
  const tokens = nameTokens(value);
  if (tokens.length === 0) return true;
  return tokens.every((token) => GENERIC_TOKENS.has(token) || /^\d+$/.test(token));
}

function bigrams(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const left = bigrams(a);
  const right = bigrams(b);
  let overlap = 0;
  let leftTotal = 0;
  for (const [gram, count] of left) {
    leftTotal += count;
    overlap += Math.min(count, right.get(gram) ?? 0);
  }
  let rightTotal = 0;
  for (const count of right.values()) rightTotal += count;
  return (2 * overlap) / (leftTotal + rightTotal);
}

function subsetOf(inner: readonly string[], outer: readonly string[]): boolean {
  if (inner.length === 0) return false;
  const set = new Set(outer);
  return inner.every((token) => set.has(token));
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((token, index) => token === right[index]);
}

export interface DistinctVerdict {
  distinct: boolean;
  reason?: string;
}

/**
 * Whether two names assert, on their own terms, that they denote different
 * things.
 *
 * This is a veto, not a score. It exists because the register routinely names a
 * protected object after the building it stands beside, and no amount of
 * similarity weighting can distinguish "the sundial by the church" from "the
 * church" — only reading the relation can.
 *
 * Every rule here can only ever SPLIT two records, never merge them, which is
 * the direction the matcher is allowed to be wrong in.
 */
export function namesDenoteDistinctThings(a: string, b: string): DistinctVerdict {
  const left = analyseName(a);
  const right = analyseName(b);

  // --- Different street numbers on the same street -------------------------
  // "2, Westfield Road" and "8, Westfield Road" are two houses. Character
  // bigrams score them 0.93 because they differ by one character, which is
  // precisely the character that identifies them.
  if (left.streetNumbers.length > 0 && right.streetNumbers.length > 0) {
    const overlap = left.streetNumbers.some((n) => right.streetNumbers.includes(n));
    if (!overlap) {
      return {
        distinct: true,
        reason: `different street numbers (${left.streetNumbers.join('/')} vs ${right.streetNumbers.join('/')})`,
      };
    }
  }

  // --- Both positioned against something, but differently ------------------
  // Two round barrows described as "300m south west of Cot Nab Farm" and "350m
  // west of Cot Nab Farm" are two barrows. The old code stripped both tails and
  // was left comparing "round barrow" with "round barrow".
  if (left.relation !== null && right.relation !== null) {
    const sameSubject = sameTokens(left.headTokens, right.headTokens);
    const sameRelation = sameTokens(left.relationTokens, right.relationTokens);
    if (sameSubject && !sameRelation) {
      return {
        distinct: true,
        reason: `same kind of thing in two different positions ("${left.relation}" vs "${right.relation}")`,
      };
    }
  }

  // --- One is positioned against the other ---------------------------------
  // "Sundial to South of Church of St Mary" versus "Church of St Mary": the
  // name states that the subject sits beside the other record, not that it is
  // the other record.
  const positionedAgainst = (
    subject: NameAnalysis,
    other: NameAnalysis,
  ): string | null => {
    if (subject.relation === null || subject.relationObjectTokens.length === 0) return null;
    if (other.relation !== null) return null;
    // The other record must be the thing this one is positioned against …
    if (!subsetOf(other.headTokens, subject.relationObjectTokens)) return null;
    // … and this one's own subject must be something else.
    if (subsetOf(subject.headTokens, other.headTokens)) return null;
    if (subject.headTokens.length === 0) return null;
    return `"${subject.head}" is described as standing at or near "${other.head}", not as being it`;
  };

  const leftAgainstRight = positionedAgainst(left, right);
  if (leftAgainstRight) return { distinct: true, reason: leftAgainstRight };
  const rightAgainstLeft = positionedAgainst(right, left);
  if (rightAgainstLeft) return { distinct: true, reason: rightAgainstLeft };

  return { distinct: false };
}

/**
 * How alike two heritage names are, 0..1.
 *
 * Combines a token-containment measure with character bigrams, and takes the
 * higher. Containment matters because "Fountains Abbey" is fully contained in
 * "Fountains Cistercian Abbey; monastic precinct…", which bigrams alone would
 * score poorly on given the length difference.
 *
 * Containment is only allowed to carry that weight when NEITHER name is
 * positional. Once a name says "…at Ranby Hall", the fact that "Ranby Hall" is
 * contained in it is a statement about location, not about identity.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = analyseName(a);
  const right = analyseName(b);
  const tokensA = left.headTokens;
  const tokensB = right.headTokens;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  const containment = shared / Math.min(setA.size, setB.size);

  const dice = diceSimilarity(tokensA.join(' '), tokensB.join(' '));
  const positional = left.relation !== null || right.relation !== null;
  return positional ? Math.max(dice, containment * 0.7) : Math.max(dice, containment * 0.95);
}

/** Best similarity across a record's primary name and its alternatives. */
export function bestNameSimilarity(
  candidateNames: readonly string[],
  existingNames: readonly string[],
): number {
  let best = 0;
  for (const a of candidateNames) {
    for (const b of existingNames) {
      const score = nameSimilarity(a, b);
      if (score > best) best = score;
    }
  }
  return best;
}

/** True when every name pairing says the two records denote different things. */
export function allNamePairsDistinct(
  candidateNames: readonly string[],
  existingNames: readonly string[],
): DistinctVerdict {
  let reason: string | undefined;
  for (const a of candidateNames) {
    for (const b of existingNames) {
      const verdict = namesDenoteDistinctThings(a, b);
      if (!verdict.distinct) return { distinct: false };
      reason ??= verdict.reason;
    }
  }
  return candidateNames.length > 0 && existingNames.length > 0
    ? { distinct: true, ...(reason ? { reason } : {}) }
    : { distinct: false };
}
