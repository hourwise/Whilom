import Link from 'next/link';
import { requireEditor } from '@/lib/admin';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Import review' };

/**
 * The review queue.
 *
 * Internal editorial tooling, not public UI. Deliberately a plain table: a
 * reviewer's job is to read differences and decide, and anything that competes
 * for attention with the data works against that.
 */

interface QueueRow {
  candidate_id: string;
  review_status: string;
  match_confidence: number | null;
  candidate_name: string | null;
  source_key: string | null;
  source_record_external_id: string | null;
  candidate_place_type: string | null;
  matched_entity_id: string | null;
  matched_place_name: string | null;
  distance_to_match_m: number | null;
  conflict_count: number;
  unresolved_conflict_count: number;
  published_entity_id: string | null;
  reviewed_at: string | null;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const;

type ReviewStatus = Exclude<(typeof STATUS_FILTERS)[number]['value'], ''>;

/** A query string is untrusted input; only known states reach the query. */
function asReviewStatus(value: string | undefined): ReviewStatus | null {
  return STATUS_FILTERS.some((s) => s.value !== '' && s.value === value)
    ? (value as ReviewStatus)
    : null;
}

export default async function ImportQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; conflicts?: string; type?: string }>;
}) {
  await requireEditor();
  const filters = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('import_review_queue')
    .select(
      'candidate_id, review_status, match_confidence, candidate_name, source_key, source_record_external_id, candidate_place_type, matched_entity_id, matched_place_name, distance_to_match_m, conflict_count, unresolved_conflict_count, published_entity_id, reviewed_at',
    )
    .order('unresolved_conflict_count', { ascending: false })
    .limit(200);

  const status = asReviewStatus(filters.status);
  if (status) query = query.eq('review_status', status);
  if (filters.source) query = query.eq('source_key', filters.source);
  if (filters.type) query = query.eq('candidate_place_type', filters.type);
  if (filters.conflicts === '1') query = query.gt('unresolved_conflict_count', 0);

  const { data, error } = await query;
  const rows = (data ?? []) as unknown as QueueRow[];

  // Source list for the filter, taken from what is actually in the queue.
  const sources = [...new Set(rows.map((r) => r.source_key).filter(Boolean))] as string[];

  return (
    <div className="stack">
      <div>
        <h1 style={{ marginBottom: '0.25rem' }}>Import review</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Internal editorial tool. Candidates from the ingestion pipeline awaiting a decision.
        </p>
      </div>

      {error && (
        <p className="error" role="alert">
          Could not load the review queue.
        </p>
      )}

      <form className="row" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={filters.status ?? ''}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="source">Source</label>
          <select id="source" name="source" defaultValue={filters.source ?? ''}>
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="conflicts">Conflicts</label>
          <select id="conflicts" name="conflicts" defaultValue={filters.conflicts ?? ''}>
            <option value="">All</option>
            <option value="1">Unresolved only</option>
          </select>
        </div>
        <button className="secondary">Filter</button>
      </form>

      <p className="muted">
        {rows.length} candidate{rows.length === 1 ? '' : 's'}
      </p>

      {rows.length === 0 ? (
        <p className="muted">Nothing matches these filters.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Candidate</th>
                <th>Source</th>
                <th>Proposed match</th>
                <th>Distance</th>
                <th>Confidence</th>
                <th>Conflicts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.candidate_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>
                    <Link href={`/admin/imports/${row.candidate_id}`}>
                      {row.candidate_name ?? '(unnamed)'}
                    </Link>
                    {row.candidate_place_type && (
                      <span className="muted"> · {row.candidate_place_type}</span>
                    )}
                  </td>
                  <td>
                    <span className="tag">{row.source_key}</span>{' '}
                    <span className="muted">{row.source_record_external_id}</span>
                  </td>
                  <td>{row.matched_place_name ?? <span className="muted">new place</span>}</td>
                  <td>
                    {row.distance_to_match_m === null
                      ? '—'
                      : `${Math.round(row.distance_to_match_m)} m`}
                  </td>
                  <td>
                    {row.match_confidence === null ? '—' : row.match_confidence.toFixed(2)}
                  </td>
                  <td>
                    {row.unresolved_conflict_count > 0 ? (
                      <strong className="error">{row.unresolved_conflict_count} unresolved</strong>
                    ) : row.conflict_count > 0 ? (
                      <span className="muted">{row.conflict_count} resolved</span>
                    ) : (
                      <span className="muted">none</span>
                    )}
                  </td>
                  <td>
                    {row.published_entity_id ? (
                      <span className="tag">published</span>
                    ) : (
                      <span className="tag">{row.review_status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
