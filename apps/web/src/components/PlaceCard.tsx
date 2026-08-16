import Link from 'next/link';
import type { SearchResult } from '@/lib/types';

const label = (s: string) => s.replace(/_/g, ' ');

const km = (m: number | null) => (m == null ? null : `${(m / 1000).toFixed(1)} km`);

export function PlaceCard({ place }: { place: SearchResult }) {
  return (
    <div className="card">
      <h3>
        <Link href={`/place/${place.slug}`}>{place.name}</Link>
      </h3>
      <div>
        <span className="tag">{label(place.place_type)}</span>
        {place.period && <span className="tag">{label(place.period)}</span>}
        {place.cost && <span className="tag">{label(place.cost)}</span>}
      </div>
      {place.summary && <p className="muted" style={{ marginBottom: 0 }}>{place.summary}</p>}
      {km(place.distance_m) && <p className="muted" style={{ margin: '0.25rem 0 0' }}>{km(place.distance_m)} away</p>}
    </div>
  );
}
