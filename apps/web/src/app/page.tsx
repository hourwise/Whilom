import Link from 'next/link';
import { searchPlaces } from '@/lib/data';
import { PlaceCard } from '@/components/PlaceCard';

export default async function HomePage() {
  let featured = [] as Awaited<ReturnType<typeof searchPlaces>>;
  try {
    featured = (await searchPlaces({})).slice(0, 6);
  } catch {
    // Supabase not configured yet — show the page without featured places.
  }

  return (
    <div className="stack">
      <section>
        <h1 style={{ marginBottom: '0.25rem' }}>Discover UK heritage</h1>
        <p className="muted" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          History, where it happened. Places connected to people, stories, objects and journeys.
        </p>
        <p>
          <Link className="btn" href="/discover">
            Explore places
          </Link>
        </p>
      </section>

      {featured.length > 0 && (
        <section className="section">
          <h2>Featured places</h2>
          <div className="grid">
            {featured.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        </section>
      )}

      {featured.length === 0 && (
        <p className="muted">
          No places to show yet. Start the Supabase stack and load the seed to populate discovery.
        </p>
      )}
    </div>
  );
}
