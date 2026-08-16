import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { removeFromWishlist } from '@/lib/actions';

export const metadata = { title: 'Account' };

interface PlaceRef {
  slug: string;
  name: string;
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const { data: wishlists } = await supabase.from('wishlists').select('id').eq('user_id', user.id);
  const wishlistIds = ((wishlists ?? []) as { id: string }[]).map((w) => w.id);

  const { data: items } = wishlistIds.length
    ? await supabase
        .from('wishlist_items')
        .select('place_id, places(slug, name)')
        .in('wishlist_id', wishlistIds)
    : { data: [] };

  const { data: visits } = await supabase
    .from('visits')
    .select('id, visited_on, rating, minutes_spent, places(slug, name)')
    .eq('user_id', user.id)
    .order('visited_on', { ascending: false });

  // PostgREST returns to-one embeds as objects at runtime; the query builder
  // infers them as arrays, so we cast through unknown.
  const wishlistRows = (items ?? []) as unknown as { place_id: string; places: PlaceRef | null }[];
  const visitRows = (visits ?? []) as unknown as {
    id: string;
    visited_on: string | null;
    rating: number | null;
    minutes_spent: number | null;
    places: PlaceRef | null;
  }[];

  return (
    <div className="stack">
      <h1>{(profile as { display_name: string | null } | null)?.display_name ?? 'Your account'}</h1>
      <p className="muted">{user.email}</p>

      <section className="section">
        <h2>Wishlist</h2>
        {wishlistRows.length === 0 ? (
          <p className="muted">
            Nothing saved yet. <Link href="/discover">Find places to visit</Link>.
          </p>
        ) : (
          <ul className="stack">
            {wishlistRows.map((row) =>
              row.places ? (
                <li key={row.place_id} className="row" style={{ alignItems: 'center' }}>
                  <Link href={`/place/${row.places.slug}`}>{row.places.name}</Link>
                  <form action={removeFromWishlist} style={{ display: 'inline' }}>
                    <input type="hidden" name="place_id" value={row.place_id} />
                    <button className="secondary" style={{ padding: '0.15rem 0.5rem' }}>
                      Remove
                    </button>
                  </form>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Visits</h2>
        {visitRows.length === 0 ? (
          <p className="muted">No visits recorded yet.</p>
        ) : (
          <ul className="stack">
            {visitRows.map((v) => (
              <li key={v.id}>
                {v.places ? <Link href={`/place/${v.places.slug}`}>{v.places.name}</Link> : 'Unknown place'}
                <span className="muted">
                  {v.visited_on ? ` · ${v.visited_on}` : ''}
                  {v.rating ? ` · ${'★'.repeat(v.rating)}` : ''}
                  {v.minutes_spent ? ` · ${v.minutes_spent} min` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
