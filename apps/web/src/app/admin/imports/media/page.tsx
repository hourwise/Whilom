import Link from 'next/link';
import { requireEditor } from '@/lib/admin';
import { createClient } from '@/lib/supabase/server';
import { ActionNotice } from '@/components/ActionNotice';
import { publishMedia, reviewMedia } from '@/lib/admin-actions';
import {
  MEDIA_DECISIONS,
  RIGHTS_EXPLANATION,
  canPublishMedia,
  type MediaRightsState,
} from '@/lib/media';

export const metadata = { title: 'Media review' };

/**
 * Imported media review.
 *
 * Shows a reviewer what the file is, who made it, under what licence, and the
 * attribution Whilom would display — and where any of that is missing, says so
 * and offers no way to publish regardless. Rights completeness is decided in
 * the database; this page only explains the decision.
 */

interface MediaRow {
  candidate_id: string;
  source_file_id: string;
  source_title: string | null;
  source_page_url: string;
  thumbnail_url: string | null;
  media_url: string | null;
  creator: string | null;
  licence: string;
  licence_name: string | null;
  licence_url: string | null;
  is_reusable: boolean | null;
  requires_attribution: boolean | null;
  attribution_text: string | null;
  rights_state: string;
  missing_rights_fields: string[];
  association_outcome: string;
  association_confidence: number | null;
  entity_id: string | null;
  entity_name: string | null;
  review_status: string;
  published_image_id: string | null;
  source_key: string;
}

const STATE_COLOUR: Record<string, string> = {
  media_ready: '#2c7a4b',
  media_association_review: '#a15c2c',
  media_creator_unknown: '#a12c2c',
  media_rights_incomplete: '#a12c2c',
  media_licence_unsupported: '#767676',
  media_invalid: '#767676',
};

export default async function MediaReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fields?: string; done?: string; state?: string }>;
}) {
  await requireEditor();
  const filters = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('media_review_queue')
    .select(
      'candidate_id, source_file_id, source_title, source_page_url, thumbnail_url, media_url, creator, licence, licence_name, licence_url, is_reusable, requires_attribution, attribution_text, rights_state, missing_rights_fields, association_outcome, association_confidence, entity_id, entity_name, review_status, published_image_id, source_key',
    )
    .limit(100);

  if (filters.state && filters.state in RIGHTS_EXPLANATION) {
    query = query.eq('rights_state', filters.state as MediaRightsState);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as unknown as MediaRow[];

  return (
    <div className="stack">
      <p className="muted" style={{ marginBottom: 0 }}>
        <Link href="/admin/imports">← Import review</Link>
      </p>
      <div>
        <h1 style={{ marginBottom: '0.25rem' }}>Media review</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Imported open media. A file is only publishable when Whilom can generate valid
          attribution for that exact file from stored metadata.
        </p>
      </div>

      <ActionNotice error={filters.error} fields={filters.fields} done={filters.done} />
      {error && <p className="error" role="alert">Could not load the media queue.</p>}

      <form className="row" style={{ alignItems: 'end' }}>
        <div>
          <label htmlFor="state">Rights state</label>
          <select id="state" name="state" defaultValue={filters.state ?? ''}>
            <option value="">All</option>
            {Object.entries(RIGHTS_EXPLANATION).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
        <button className="secondary">Filter</button>
      </form>

      <p className="muted">
        {rows.length} file{rows.length === 1 ? '' : 's'}
      </p>

      <div className="stack">
        {rows.map((row) => {
          const explanation = RIGHTS_EXPLANATION[row.rights_state as MediaRightsState];
          const publishable = canPublishMedia(row.rights_state);
          return (
            <div key={row.candidate_id} className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {row.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.thumbnail_url}
                    alt={row.source_title ?? row.source_file_id}
                    width={160}
                    style={{ maxWidth: 160, height: 'auto', border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div className="muted" style={{ width: 160 }}>no thumbnail</div>
                )}

                <div style={{ flex: 1 }}>
                  <strong>{row.source_title ?? row.source_file_id}</strong>{' '}
                  <span className="tag">{row.source_key}</span>
                  <p className="muted" style={{ margin: '0.25rem 0' }}>
                    <a href={row.source_page_url} target="_blank" rel="noopener noreferrer">
                      Source record ↗
                    </a>
                  </p>

                  <dl style={{ margin: 0, fontSize: '0.9rem' }}>
                    <div>
                      <strong>Creator:</strong>{' '}
                      {row.creator ?? <span className="error">not stated by the source</span>}
                    </div>
                    <div>
                      <strong>Licence:</strong> {row.licence_name ?? row.licence}
                      {row.licence_url && (
                        <>
                          {' '}
                          <a href={row.licence_url} target="_blank" rel="noopener noreferrer">
                            terms ↗
                          </a>
                        </>
                      )}
                      {row.requires_attribution && <span className="muted"> · attribution required</span>}
                    </div>
                    <div>
                      <strong>Attribution:</strong>{' '}
                      {row.attribution_text ?? (
                        <span className="error">cannot be generated from what the source provides</span>
                      )}
                    </div>
                    <div>
                      <strong>Subject:</strong> {row.entity_name ?? <span className="muted">none proposed</span>}{' '}
                      <span className="muted">
                        ({row.association_outcome.replace(/_/g, ' ')}
                        {row.association_confidence !== null && `, ${row.association_confidence.toFixed(2)}`})
                      </span>
                    </div>
                  </dl>

                  <p style={{ marginBottom: '0.35rem' }}>
                    <span
                      className="tag"
                      style={{
                        color: STATE_COLOUR[row.rights_state],
                        borderColor: STATE_COLOUR[row.rights_state],
                      }}
                    >
                      {explanation?.label ?? row.rights_state}
                    </span>{' '}
                    <span className="muted">{explanation?.detail}</span>
                    {row.missing_rights_fields.length > 0 && (
                      <span className="error"> Missing: {row.missing_rights_fields.join(', ')}.</span>
                    )}
                  </p>

                  {row.published_image_id ? (
                    <p className="muted">Published.</p>
                  ) : (
                    <div className="row" style={{ alignItems: 'end' }}>
                      <form action={reviewMedia} className="row" style={{ alignItems: 'end' }}>
                        <input type="hidden" name="candidate_id" value={row.candidate_id} />
                        <div>
                          <label htmlFor={`decision-${row.candidate_id}`}>Decision</label>
                          <select id={`decision-${row.candidate_id}`} name="decision">
                            {MEDIA_DECISIONS.map((d) => (
                              <option key={d.value} value={d.value}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button className="secondary">Record</button>
                      </form>

                      <form action={publishMedia}>
                        <input type="hidden" name="candidate_id" value={row.candidate_id} />
                        <button disabled={!publishable}>Publish</button>
                      </form>
                    </div>
                  )}

                  {!publishable && !row.published_image_id && (
                    <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
                      There is no override. A reviewer may confirm what an image shows, but cannot
                      supply a creator or licence the source did not state.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
