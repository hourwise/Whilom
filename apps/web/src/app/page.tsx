import { PlaceType } from '@whilom/domain';

/**
 * Placeholder home page. Phase 3 replaces this with the discovery experience:
 * interactive heritage map, search, filters (spec §9, §45).
 *
 * It imports from `@whilom/domain` purely to prove the shared-package wiring
 * works end-to-end in the web build.
 */
export default function HomePage() {
  const featuredTypes = [PlaceType.Castle, PlaceType.Abbey, PlaceType.RomanVilla];

  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Whilom</h1>
      <p style={{ marginTop: 0, fontStyle: 'italic', color: '#555' }}>History, where it happened.</p>
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
