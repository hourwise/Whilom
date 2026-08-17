import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireEditor } from '@/lib/admin';
import { createClient } from '@/lib/supabase/server';
import { ActionNotice } from '@/components/ActionNotice';
import { publishCandidate, resolveConflict, reviewCandidate } from '@/lib/admin-actions';
import {
  CONFLICT_RESOLUTIONS,
  DifferenceKind,
  REVIEW_DECISIONS,
  canPublish,
  classifyField,
  sortDifferences,
  type CandidatePreview,
  type FieldDifference,
} from '@/lib/review';

export const metadata = { title: 'Review candidate' };

/**
 * Candidate review.
 *
 * Everything shown comes from `preview_import_candidate()`, so the reviewer
 * sees what the publish engine would actually do rather than the UI's guess at
 * it. Every action posts to a governed database function.
 */

const KIND_STYLE: Record<DifferenceKind, { label: string; colour: string }> = {
  [DifferenceKind.Conflict]: { label: 'Conflict', colour: '#a12c2c' },
  [DifferenceKind.Positional]: { label: 'Position differs', colour: '#a15c2c' },
  [DifferenceKind.Ambiguous]: { label: 'Ambiguous', colour: '#a15c2c' },
  [DifferenceKind.Complementary]: { label: 'New from source', colour: '#2c6ba1' },
  [DifferenceKind.Agreement]: { label: 'Agrees', colour: '#2c7a4b' },
  [DifferenceKind.Missing]: { label: 'Not stated', colour: '#767676' },
};

function DifferenceRow({ difference }: { difference: FieldDifference }) {
  const style = KIND_STYLE[difference.kind];
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', whiteSpace: 'nowrap' }}>{difference.label}</td>
      <td>{difference.canonicalValue ?? <span className="muted">—</span>}</td>
      <td>{difference.incomingValue ?? <span className="muted">—</span>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <span className="tag" style={{ color: style.colour, borderColor: style.colour }}>
          {style.label}
        </span>
        {difference.detail && <div className="muted" style={{ fontSize: '0.8rem' }}>{difference.detail}</div>}
      </td>
    </tr>
  );
}

export default async function ReviewCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; fields?: string; done?: string }>;
}) {
  await requireEditor();
  const { id } = await params;
  const notice = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('preview_import_candidate', { p_candidate_id: id });
  if (error || !data) notFound();
  const preview = data as unknown as CandidatePreview;

  const { data: history } = await supabase
    .from('import_decision_history')
    .select('action_id, action, note, created_at, moderator_name')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  // Field-level comparison. Conflicts come from the engine, never re-derived
  // here — the UI must not disagree with the backend about what a conflict is.
  const conflictedFields = new Set(preview.conflicts.filter((c) => !c.resolved).map((c) => c.field));
  const canonical = preview.canonicalEntity;

  const differences: FieldDifference[] = sortDifferences([
    {
      field: 'name',
      label: 'Name',
      canonicalValue: canonical?.name ?? null,
      incomingValue: preview.candidate.name,
      kind: classifyField(canonical?.name, preview.candidate.name),
    },
    {
      field: 'place_type',
      label: 'Place type',
      canonicalValue: canonical?.placeType ?? null,
      incomingValue: preview.candidate.placeType,
      kind: classifyField(canonical?.placeType, preview.candidate.placeType, {
        conflicted: conflictedFields.has('place_type'),
      }),
    },
    {
      field: 'location',
      label: 'Position',
      canonicalValue: canonical?.locationAccuracyM ? `±${canonical.locationAccuracyM} m` : null,
      incomingValue: preview.candidate.locationAccuracyM
        ? `±${preview.candidate.locationAccuracyM} m`
        : null,
      kind: classifyField(
        canonical?.locationAccuracyM?.toString(),
        preview.candidate.locationAccuracyM,
        { conflicted: conflictedFields.has('location'), positional: true },
      ),
      detail: 'Accuracy is the radius each source claims, not a measurement error.',
    },
  ]);

  const publishable = canPublish(preview);

  return (
    <div className="stack">
      <p className="muted" style={{ marginBottom: 0 }}>
        <Link href="/admin/imports">← Review queue</Link>
      </p>
      <h1 style={{ marginBottom: '0.25rem' }}>{preview.candidate.name ?? '(unnamed candidate)'}</h1>
      <div>
        <span className="tag">{preview.status}</span>{' '}
        <span className="tag">{preview.action.replace(/_/g, ' ')}</span>
        {preview.alreadyPublished && <span className="tag">published</span>}
      </div>

      <ActionNotice error={notice.error} fields={notice.fields} done={notice.done} />

      {preview.blockers.length > 0 && (
        <section className="section">
          <h2>Publication is blocked</h2>
          <ul className="error">
            {preview.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Side-by-side comparison ------------------------------------- */}
      <section className="section">
        <h2>Whilom vs incoming source</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Field</th>
                <th>Whilom holds</th>
                <th>Source says</th>
                <th>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((difference) => (
                <DifferenceRow key={difference.field} difference={difference} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Conflicts ---------------------------------------------------- */}
      {preview.conflicts.length > 0 && (
        <section className="section">
          <h2>Disagreements</h2>
          <div className="stack">
            {preview.conflicts.map((conflict) => (
              <div key={conflict.id} className="card">
                <strong>{conflict.field}</strong>{' '}
                {conflict.resolved ? (
                  <span className="tag">{conflict.resolution}</span>
                ) : (
                  <span className="tag" style={{ color: '#a12c2c', borderColor: '#a12c2c' }}>
                    unresolved
                  </span>
                )}
                <p className="muted" style={{ marginBottom: '0.35rem' }}>
                  {conflict.reason}
                </p>
                <p style={{ marginTop: 0 }}>
                  Whilom: <code>{JSON.stringify(conflict.existingValue)}</code>
                  <br />
                  Source: <code>{JSON.stringify(conflict.incomingValue)}</code>
                </p>
                {!conflict.resolved && (
                  <form action={resolveConflict} className="row" style={{ alignItems: 'end' }}>
                    <input type="hidden" name="candidate_id" value={preview.candidateId} />
                    <input type="hidden" name="conflict_id" value={conflict.id} />
                    <div>
                      <label htmlFor={`outcome-${conflict.id}`}>Resolution</label>
                      <select id={`outcome-${conflict.id}`} name="outcome">
                        {CONFLICT_RESOLUTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`note-${conflict.id}`}>Note</label>
                      <input id={`note-${conflict.id}`} name="note" placeholder="Why?" />
                    </div>
                    <button className="secondary">Resolve</button>
                  </form>
                )}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Resolving records a decision. The original values from both sources are kept either way.
          </p>
        </section>
      )}

      {/* --- What publication would do ------------------------------------ */}
      <section className="section">
        <h2>What publishing would write</h2>
        {preview.facts.length === 0 && preview.relationships.length === 0 ? (
          <p className="muted">No facts or relationships.</p>
        ) : (
          <>
            {preview.facts.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.95rem' }}>Facts</h3>
                <ul>
                  {preview.facts.map((fact) => (
                    <li key={`${fact.predicate}-${String(fact.value)}`}>
                      <strong>{fact.predicate.replace(/_/g, ' ')}</strong>: {String(fact.value)}{' '}
                      {!fact.registered && (
                        <span className="error">— predicate not registered, publish will refuse</span>
                      )}
                      {fact.alreadyPresent && <span className="muted">— already held from this source</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.relationships.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.95rem' }}>Relationships</h3>
                <ul>
                  {preview.relationships.map((rel) => (
                    <li key={`${rel.predicate}-${rel.label}`}>
                      this place — <strong>{rel.predicate.replace(/_/g, ' ')}</strong> → {rel.label}{' '}
                      <span className="muted">(source role: {rel.role}{rel.externalId ? `, ${rel.externalId}` : ''})</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          This is a preview from the publish engine itself. It writes nothing.
        </p>
      </section>

      {/* --- Decisions ---------------------------------------------------- */}
      {!preview.alreadyPublished && (
        <section className="section">
          <h2>Decision</h2>
          <form action={reviewCandidate} className="row" style={{ alignItems: 'end' }}>
            <input type="hidden" name="candidate_id" value={preview.candidateId} />
            <div>
              <label htmlFor="decision">Outcome</label>
              <select id="decision" name="decision">
                {REVIEW_DECISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="review-note">Note</label>
              <input id="review-note" name="note" placeholder="Optional reasoning" />
            </div>
            <button className="secondary">Record decision</button>
          </form>

          <form action={publishCandidate} className="stack" style={{ marginTop: '1rem' }}>
            <input type="hidden" name="candidate_id" value={preview.candidateId} />
            <div>
              <button disabled={!publishable}>Publish to canonical data</button>{' '}
              {!publishable && (
                <span className="muted">
                  {preview.blockers.length > 0
                    ? 'Blocked — see above.'
                    : 'Already published.'}
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* --- Audit -------------------------------------------------------- */}
      <section className="section">
        <h2>Decision history</h2>
        {!history || history.length === 0 ? (
          <p className="muted">No decisions recorded yet.</p>
        ) : (
          <ul className="muted">
            {(history as { action_id: string; action: string; note: string | null; created_at: string; moderator_name: string | null }[]).map(
              (entry) => (
                <li key={entry.action_id}>
                  <strong>{entry.action}</strong> · {entry.moderator_name ?? 'unknown'} ·{' '}
                  {new Date(entry.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                  {entry.note ? ` — ${entry.note}` : ''}
                </li>
              ),
            )}
          </ul>
        )}
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Append-only. Decisions cannot be edited or removed from here.
        </p>
      </section>
    </div>
  );
}
