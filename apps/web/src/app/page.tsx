import { PlaceType } from '@heritage/domain';

/**
 * Placeholder home page. Phase 3 replaces this with the discovery experience:
 * interactive heritage map, search, filters (spec §9, §45).
 *
 * It imports from `@heritage/domain` purely to prove the shared-package wiring
 * works end-to-end in the web build.
 */
export default function HomePage() {
  const featuredTypes = [PlaceType.Castle, PlaceType.Abbey, PlaceType.RomanVilla];

  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Heritage Platform</h1>
      <p>
        Places connected to people, stories, objects and journeys. This is the
        Phase 1 foundation scaffold — the discovery map and place pages arrive in
        Phase 3.
      </p>
      <p style={{ color: '#666' }}>
        Shared domain wired in ({featuredTypes.join(', ')}).
      </p>
    </main>
  );
}
