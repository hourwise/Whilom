import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPerson, getPlacesForPerson, getSourcesForEntity } from '@/lib/data';

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const person = await getPerson(slug);
  return { title: person?.name ?? 'Person' };
}

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const person = await getPerson(slug);
  if (!person) notFound();

  const [places, sources] = await Promise.all([
    getPlacesForPerson(person.id),
    getSourcesForEntity('person', person.id),
  ]);

  const lifespan = [person.birth_year, person.death_year].some((y) => y != null)
    ? `${person.birth_year ?? '?'}–${person.death_year ?? '?'}`
    : person.date_note;

  return (
    <div className="stack">
      <div>
        <h1 style={{ marginBottom: '0.25rem' }}>{person.name}</h1>
        {lifespan && <p className="muted" style={{ marginTop: 0 }}>{lifespan}</p>}
        {person.titles.length > 0 && (
          <div>
            {person.titles.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {person.biography && <p>{person.biography}</p>}

      {places.length > 0 && (
        <section className="section">
          <h2>Connected places</h2>
          <ul>
            {places.map((r, i) => (
              <li key={i}>
                <Link href={`/place/${r.place.slug}`}>{r.place.name}</Link>{' '}
                <span className="muted">— {label(r.predicate)}</span>
              </li>
            ))}
          </ul>
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
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
