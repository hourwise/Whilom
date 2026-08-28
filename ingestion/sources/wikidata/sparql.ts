/**
 * One SPARQL client for every Wikidata enrichment.
 *
 * The public query service is a shared, free, heavily used endpoint, and it
 * answers a busy moment with 429 or 502 rather than with data. That is not an
 * error in the query — the same query succeeds a few seconds later — but
 * without a retry it becomes an error in the build, and Whilom's people and
 * temporal coverage end up a function of Wikidata's afternoon.
 *
 * This was extracted after the regional workflow failed at "Enrich people" with
 * a bare 502, while the temporal enrichment beside it retried through the same
 * outage because it had its own copy of this logic. One implementation, used by
 * both, is the correct answer to that.
 */

export interface SparqlOptions {
  /** Identifies Whilom to the endpoint, as the service's etiquette asks. */
  userAgent: string;
  /** Total attempts including the first. */
  attempts?: number;
  endpoint?: string;
}

export const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export type SparqlBindings = Record<string, { value: string }>;

/**
 * Run a query, retrying the transient failures a shared endpoint returns under
 * load.
 *
 * 429 and 5xx mean the endpoint is busy; they are retried with exponential
 * backoff. Any other 4xx means the query is wrong, and repeating it would be
 * both pointless and rude, so it fails immediately.
 */
export async function runSparql(
  query: string,
  options: SparqlOptions,
): Promise<SparqlBindings[]> {
  const endpoint = options.endpoint ?? WIKIDATA_SPARQL_ENDPOINT;
  const attempts = options.attempts ?? 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?format=json&query=${encodeURIComponent(query)}`, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': options.userAgent,
        },
      });
      if (response.ok) {
        const body = (await response.json()) as { results?: { bindings?: SparqlBindings[] } };
        return body.results?.bindings ?? [];
      }
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`SPARQL HTTP ${response.status}`);
      }
      lastError = new Error(`SPARQL HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      const wait = 2_000 * 2 ** (attempt - 1);
      console.warn(`SPARQL attempt ${attempt}/${attempts} failed; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('SPARQL query failed');
}
