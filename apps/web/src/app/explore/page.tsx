import { ExploreClient } from '@/components/ExploreClient';
import { stateFromParams } from '@/lib/discovery';

export const metadata = {
  title: 'Explore',
  description:
    'Where — and when — do you want to explore? Discover the heritage Whilom knows about, from prehistory to the present day.',
};

/**
 * The discovery route.
 *
 * A server component whose only job is to read the shared link and hand the
 * resulting state to the client. Everything a person chose — where they are
 * looking, when, and what for — arrives in the URL, so opening someone else's
 * link puts you exactly where they were rather than at a default view of
 * Yorkshire.
 */
export default async function ExplorePage({
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

  return <ExploreClient initial={stateFromParams(params)} />;
}
