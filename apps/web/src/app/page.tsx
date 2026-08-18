import Link from 'next/link';
import { searchPlaces } from '@/lib/data';
import { PlaceCard } from '@/components/PlaceCard';
import { WhilomDefinition } from '@/components/WhilomDefinition';
import { PERIODS } from '@/lib/discovery';

/**
 * The homepage has three jobs, in order: say what Whilom is, say what the word
 * means, and get out of the way so someone can start looking.
 *
 * The definition sits directly under the hero rather than in an about page,
 * because "whilom" is not a word most people know and a product whose name has
 * to be explained is better off explaining it immediately.
 */

// A short spine of periods for the homepage. The full scrubber lives on
// /explore; this is an invitation, not a control.
const HOMEPAGE_PERIODS = ['roman', 'early_medieval', 'medieval', 'tudor', 'georgian', 'victorian', 'wwii'];

export default async function HomePage() {
  let featured = [] as Awaited<ReturnType<typeof searchPlaces>>;
  try {
    featured = (await searchPlaces({})).slice(0, 6);
  } catch {
    // Supabase not configured yet — the page still explains itself.
  }

  const periods = HOMEPAGE_PERIODS.map((id) => PERIODS.find((p) => p.id === id)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );

  return (
    <div className="stack">
      <section className="hero">
        <h1 className="hero-title">Whilom</h1>
        <p className="hero-tagline">History, where it happened.</p>

        <form className="hero-search" method="get" action="/explore" role="search">
          <label htmlFor="q" className="visually-hidden">
            Search a town, place or postcode
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Search a town, place or postcode"
            autoComplete="off"
          />
          <button type="submit">Explore</button>
        </form>

        <p className="hero-question">Where — and when — do you want to explore?</p>
      </section>

      <WhilomDefinition />

      <section className="section">
        <h2>Start with a time</h2>
        <p className="muted">
          Slide through the history of a place, from prehistory to the present day.
        </p>
        <ul className="period-chips" aria-label="Explore by period">
          {periods.map((p) => (
            <li key={p.id}>
              <Link className="chip" href={`/explore?period=${p.id}`}>
                {p.name}
              </Link>
            </li>
          ))}
          <li>
            <Link className="chip chip-quiet" href="/explore">
              Any time
            </Link>
          </li>
        </ul>
      </section>

      {featured.length > 0 && (
        <section className="section">
          <h2>Recently added</h2>
          <div className="grid">
            {featured.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Whilom currently covers Yorkshire and the surrounding area in depth.{' '}
            <Link href="/discover">Browse everything as a list</Link>.
          </p>
        </section>
      )}

      {featured.length === 0 && (
        <p className="muted">
          No places to show yet. Start the Supabase stack and load the regional dataset to populate
          discovery.
        </p>
      )}
    </div>
  );
}
