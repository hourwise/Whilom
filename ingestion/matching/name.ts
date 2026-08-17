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

/**
 * The identifying part of a name: normalised, with the descriptive tail after a
 * semicolon or a positional phrase removed, and stopwords dropped.
 */
export function nameTokens(value: string): string[] {
  const head = value.split(/[;:]/)[0] ?? value;
  const withoutPosition = head.replace(
    /\b(approximately|about|circa)\b.*$|\b\d+\s*(m|metres?|yards?|yds?)\b.*$/i,
    '',
  );
  return normaliseName(withoutPosition)
    .split(' ')
    .filter((token) => token !== '' && !STOPWORDS.has(token));
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

/**
 * How alike two heritage names are, 0..1.
 *
 * Combines a token-containment measure with character bigrams, and takes the
 * higher. Containment matters because "Fountains Abbey" is fully contained in
 * "Fountains Cistercian Abbey; monastic precinct…", which bigrams alone would
 * score poorly on given the length difference.
 */
export function nameSimilarity(a: string, b: string): number {
  const tokensA = nameTokens(a);
  const tokensB = nameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  const containment = shared / Math.min(setA.size, setB.size);

  const dice = diceSimilarity(tokensA.join(' '), tokensB.join(' '));
  return Math.max(dice, containment * 0.95);
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
