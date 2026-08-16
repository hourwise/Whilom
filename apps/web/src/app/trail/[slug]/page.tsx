import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRoute, getRouteStops } from '@/lib/data';

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const route = await getRoute(slug);
  return { title: route?.name ?? 'Trail' };
}

export default async function TrailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const route = await getRoute(slug);
  if (!route) notFound();

  const stops = await getRouteStops(route.id);

  return (
    <div className="stack">
      <div>
        <h1 style={{ marginBottom: '0.25rem' }}>{route.name}</h1>
        <div>
          <span className="tag">{label(route.route_type)}</span>
          {route.difficulty && <span className="tag">{label(route.difficulty)}</span>}
          {route.period && <span className="tag">{label(route.period)}</span>}
        </div>
        {route.theme && <p className="muted" style={{ margin: '0.35rem 0 0' }}>{route.theme}</p>}
      </div>

      {route.description && <p>{route.description}</p>}

      <p className="muted">
        {route.distance_m != null && <>{(route.distance_m / 1000).toFixed(1)} km · </>}
        {route.duration_minutes != null && <>{route.duration_minutes} min</>}
      </p>

      <section className="section">
        <h2>Stops</h2>
        <ol className="stack">
          {stops.map((s) => (
            <li key={s.id}>
              {s.place ? (
                <Link href={`/place/${s.place.slug}`}>{s.place.name}</Link>
              ) : (
                <strong>{s.name}</strong>
              )}
              {s.description && <div className="muted">{s.description}</div>}
            </li>
          ))}
        </ol>
        {stops.length === 0 && <p className="muted">No stops recorded yet.</p>}
      </section>
    </div>
  );
}
