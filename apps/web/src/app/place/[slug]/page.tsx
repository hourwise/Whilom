import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  addToWishlist,
  recordVisit,
  submitCorrection,
  submitReview,
} from '@/lib/actions';
import {
  getDesignations,
  getNearby,
  getPlace,
  getPlaceAccess,
  getPlaceCoords,
  getPlaceFacilities,
  getRelatedPeople,
  getRoutesForPlace,
  getSourcesForEntity,
} from '@/lib/data';
import { PlaceCard } from '@/components/PlaceCard';

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = await getPlace(slug);
  return { title: place?.name ?? 'Place' };
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = await getPlace(slug);
  if (!place) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [coords, access, facilities, designations, people, routes, sources] = await Promise.all([
    getPlaceCoords(place.id),
    getPlaceAccess(place.id),
    getPlaceFacilities(place.id),
    getDesignations(place.id),
    getRelatedPeople(place.id),
    getRoutesForPlace(place.id),
    getSourcesForEntity('place', place.id),
  ]);

  const nearby = coords ? await getNearby(coords.lng, coords.lat, place.id) : [];

  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating, body, created_at, profiles(display_name)')
    .eq('place_id', place.id)
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: false });

  const wishlisted = user
    ? Boolean(
        (
          await supabase
            .from('wishlist_items')
            .select('place_id, wishlists!inner(user_id)')
            .eq('place_id', place.id)
            .eq('wishlists.user_id', user.id)
            .maybeSingle()
        ).data,
      )
    : false;

  const location = [place.town, place.county].filter(Boolean).join(', ');

  return (
    <div className="stack">
      <div>
        <h1 style={{ marginBottom: '0.25rem' }}>{place.name}</h1>
        <div>
          <span className="tag">{label(place.place_type)}</span>
          {place.primary_period && <span className="tag">{label(place.primary_period)}</span>}
          {place.access_cost && <span className="tag">{label(place.access_cost)}</span>}
          {place.is_visitable && <span className="tag">Visitable</span>}
        </div>
        {location && <p className="muted" style={{ margin: '0.35rem 0 0' }}>{location}</p>}
      </div>

      {place.summary && (
        <section>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '0.35rem' }}>Why it matters</h2>
          <p style={{ marginTop: 0 }}>{place.summary}</p>
        </section>
      )}

      {place.description && <p>{place.description}</p>}

      {/* Saved / visited / review actions */}
      <section className="section">
        <h2>Your visit</h2>
        {!user ? (
          <p className="muted">
            <Link href="/login">Sign in</Link> to save this place, record a visit or leave a review.
          </p>
        ) : (
          <div className="stack">
            {!wishlisted ? (
              <form action={addToWishlist}>
                <input type="hidden" name="place_id" value={place.id} />
                <input type="hidden" name="slug" value={place.slug} />
                <button className="secondary">Save to wishlist</button>
              </form>
            ) : (
              <p className="muted">Saved to your wishlist.</p>
            )}

            <form action={recordVisit} className="row" style={{ alignItems: 'end' }}>
              <input type="hidden" name="place_id" value={place.id} />
              <input type="hidden" name="slug" value={place.slug} />
              <div>
                <label htmlFor="visited_on">Visited on</label>
                <input id="visited_on" type="date" name="visited_on" />
              </div>
              <div>
                <label htmlFor="rating">Rating (1–5)</label>
                <input id="rating" type="number" name="rating" min={1} max={5} />
              </div>
              <div>
                <label htmlFor="minutes_spent">Minutes</label>
                <input id="minutes_spent" type="number" name="minutes_spent" min={1} />
              </div>
              <button>Record visit</button>
            </form>

            <form action={submitReview} className="stack">
              <input type="hidden" name="place_id" value={place.id} />
              <input type="hidden" name="slug" value={place.slug} />
              <div className="field">
                <label htmlFor="rev_rating">Review rating (1–5)</label>
                <input id="rev_rating" type="number" name="rating" min={1} max={5} defaultValue={5} />
              </div>
              <div className="field">
                <label htmlFor="body">Review</label>
                <textarea id="body" name="body" rows={3} placeholder="Share your experience" />
              </div>
              <button className="secondary">Submit review (awaits moderation)</button>
            </form>
          </div>
        )}
      </section>

      {access && (
        <section className="section">
          <h2>Visiting</h2>
          <ul className="muted">
            {access.access_cost && <li>Cost: {label(access.access_cost)}</li>}
            {access.expected_visit_minutes && <li>Typical visit: {access.expected_visit_minutes} min</li>}
            {access.booking_required && <li>Booking required</li>}
            {access.guided_tours && <li>Guided tours available</li>}
            {access.seasonal && <li>Seasonal opening</li>}
            {access.opening_notes && <li>{access.opening_notes}</li>}
            {access.admission_notes && <li>{access.admission_notes}</li>}
          </ul>
          {access.official_url && (
            <p>
              <a href={access.official_url} target="_blank" rel="noopener noreferrer">
                Official visitor information ↗
              </a>
            </p>
          )}
        </section>
      )}

      {facilities.length > 0 && (
        <section className="section">
          <h2>Facilities</h2>
          <div>
            {facilities.map((f) => (
              <span key={f} className="tag">
                {label(f)}
              </span>
            ))}
          </div>
        </section>
      )}

      {designations.length > 0 && (
        <section className="section">
          <h2>Designations</h2>
          <ul>
            {designations.map((d, i) => (
              <li key={i}>
                {label(d.designation)}
                {d.grade ? ` (Grade ${d.grade})` : ''}
                {d.url && (
                  <>
                    {' '}
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      record ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {people.length > 0 && (
        <section className="section">
          <h2>Associated people</h2>
          <ul>
            {people.map((r, i) => (
              <li key={i}>
                <Link href={`/person/${r.person.slug}`}>{r.person.name}</Link>{' '}
                <span className="muted">— {label(r.predicate)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {routes.length > 0 && (
        <section className="section">
          <h2>Trails</h2>
          <ul>
            {routes.map((r) => (
              <li key={r.id}>
                <Link href={`/trail/${r.slug}`}>{r.name}</Link>{' '}
                {r.theme && <span className="muted">— {r.theme}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {reviews && reviews.length > 0 && (
        <section className="section">
          <h2>Reviews</h2>
          <div className="stack">
            {(reviews as unknown as { rating: number; body: string | null; profiles: { display_name: string | null } | null }[]).map(
              (rev, i) => (
                <div key={i} className="card">
                  <strong>{'★'.repeat(rev.rating)}</strong>{' '}
                  <span className="muted">{rev.profiles?.display_name ?? 'Explorer'}</span>
                  {rev.body && <p style={{ marginBottom: 0 }}>{rev.body}</p>}
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {nearby.length > 0 && (
        <section className="section">
          <h2>Nearby heritage</h2>
          <div className="grid">
            {nearby.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        </section>
      )}

      {sources.length > 0 && (
        <section className="section">
          <h2>Sources</h2>
          <ul className="muted">
            {sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.name} ↗
                  </a>
                ) : (
                  s.name
                )}
                {s.attribution ? ` — ${s.attribution}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Suggest a correction */}
      {user && (
        <section className="section">
          <h2>Suggest a correction</h2>
          <form action={submitCorrection} className="stack">
            <input type="hidden" name="slug" value={place.slug} />
            <input type="hidden" name="entity_type" value="place" />
            <input type="hidden" name="entity_id" value={place.id} />
            <div className="field">
              <label htmlFor="field">Field (optional)</label>
              <input id="field" name="field" placeholder="e.g. opening times" />
            </div>
            <div className="field">
              <label htmlFor="suggested_value">Suggested value</label>
              <input id="suggested_value" name="suggested_value" />
            </div>
            <div className="field">
              <label htmlFor="note">Note</label>
              <textarea id="note" name="note" rows={2} />
            </div>
            <button className="secondary">Submit correction</button>
          </form>
        </section>
      )}
    </div>
  );
}
