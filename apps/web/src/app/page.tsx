import { ExploreClient } from '@/components/ExploreClient';
import { WhilomDefinition } from '@/components/WhilomDefinition';
import { stateFromParams } from '@/lib/discovery';

export const metadata = {
  title: 'Whilom — History, where it happened',
  description:
    'Where — and when — do you want to explore? Discover the heritage Whilom knows about, from prehistory to the present day.',
};

/**
 * The homepage is the map.
 *
 * Previously this was a marketing page with the map somewhere below the fold,
 * which put a paragraph about what Whilom does above the thing that does it.
 * The map now takes the screen, with the identity compressed to a masthead and
 * a definition that a first-time visitor needs once and never again.
 *
 * It is the same component /explore uses, in immersive mode. Two map
 * implementations would have drifted apart within a fortnight.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }

  return (
    <div className="home">
      <section className="home-masthead">
        <div className="home-identity">
          <h1 className="home-title">Whilom</h1>
          <p className="home-tagline">History, where it happened.</p>
          <p className="home-question">Where — and when — do you want to explore?</p>
        </div>
        {/* Compact enough to sit beside the identity rather than pushing the
            map down the page. */}
        <WhilomDefinition compact />
      </section>

      <ExploreClient initial={stateFromParams(params)} immersive />
    </div>
  );
}
