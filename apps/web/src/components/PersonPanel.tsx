'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  displayCategory,
  fetchPersonPlaces,
  fetchRelatedPeople,
  relationshipLabel,
} from '@/lib/discovery';
import type { PersonPlace, RelatedPerson, SearchResult } from '@/lib/discovery';

/**
 * Following a person through the map.
 *
 * The panel exists to answer one question — where does this person appear in
 * Whilom — and then to hand off. It is not a biography: Whilom ingests no
 * article prose, so what is shown is what the structured sources actually said.
 *
 * Places are grouped by how the person is connected, because "designed" and
 * "owned" are different claims and flattening them into "associated with" would
 * throw away the most interesting thing the graph knows.
 */

interface Props {
  person: SearchResult;
  onClose: () => void;
  onFocusPlace: (place: PersonPlace) => void;
  onSelectPerson: (slug: string, id: string, name: string) => void;
}

export function PersonPanel({ person, onClose, onFocusPlace, onSelectPerson }: Props) {
  const [places, setPlaces] = useState<PersonPlace[]>([]);
  const [related, setRelated] = useState<RelatedPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let live = true;
    setLoading(true);
    void (async () => {
      try {
        const [p, r] = await Promise.all([
          fetchPersonPlaces(supabase, person.id),
          fetchRelatedPeople(supabase, person.id),
        ]);
        if (!live) return;
        setPlaces(p);
        setRelated(r);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [person.id]);

  const byPredicate = places.reduce<Record<string, PersonPlace[]>>((acc, place) => {
    (acc[place.predicate] ??= []).push(place);
    return acc;
  }, {});

  const outsideCoverage = places.filter((p) => !p.in_coverage).length;

  return (
    <aside className="person-panel" aria-labelledby="person-panel-title">
      <div className="person-head">
        <div>
          <h2 id="person-panel-title" className="person-name">
            {person.display_name}
          </h2>
          {person.detail && <p className="person-dates">{person.detail}</p>}
          {person.context && <p className="person-titles muted">{person.context}</p>}
        </div>
        <button type="button" className="preview-close" onClick={onClose} aria-label="Stop following this person">
          ×
        </button>
      </div>

      <p className="person-count" role="status">
        {loading
          ? 'Looking…'
          : `${places.length} place${places.length === 1 ? '' : 's'} connected in Whilom`}
      </p>

      {!loading && places.length === 0 && (
        <p className="muted">
          Whilom holds no published places connected to this person yet.
        </p>
      )}

      {outsideCoverage > 0 && (
        // A real canonical relationship is worth showing even where detailed
        // discovery has not been activated. Hiding it would be a different kind
        // of lie from overstating coverage.
        <p className="muted person-note">
          {outsideCoverage} of these sit outside Whilom's currently activated map coverage.
        </p>
      )}

      {Object.entries(byPredicate).map(([predicate, group]) => (
        <section key={predicate} className="person-group">
          <h3 className="person-group-title">{relationshipLabel(predicate)}</h3>
          <ul className="person-places">
            {group.map((place) => {
              const category = displayCategory(place.display_category);
              return (
                <li key={place.place_id}>
                  <button type="button" className="person-place" onClick={() => onFocusPlace(place)}>
                    <span className="person-place-swatch" style={{ background: category.colour }} aria-hidden="true">
                      {category.symbol}
                    </span>
                    <span className="person-place-body">
                      <span className="person-place-name">{place.name}</span>
                      <span className="muted person-place-meta">
                        {place.place_type.replace(/_/g, ' ')}
                        {place.in_coverage ? '' : ' · outside mapped coverage'}
                      </span>
                    </span>
                  </button>
                  <Link className="person-place-link" href={`/place/${place.slug}`}>
                    Open
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {related.length > 0 && (
        <section className="person-group">
          <h3 className="person-group-title">Related people</h3>
          <ul className="person-related">
            {related.map((r) => (
              <li key={r.person_id}>
                <button
                  type="button"
                  className="person-related-item"
                  onClick={() => onSelectPerson(r.slug, r.person_id, r.name)}
                >
                  <span className="person-related-name">{r.name}</span>
                  <span className="muted person-related-meta">
                    {r.life_dates ? `${r.life_dates} · ` : ''}
                    {/* Why they are related, never a bare "you might also like". */}
                    {r.relation_kind === 'direct'
                      ? r.relation_detail
                      : `${r.shared_places} shared place${r.shared_places === 1 ? '' : 's'}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted person-provenance">
        Dates and connections come from structured source records. Open a place to see its full
        provenance.
      </p>
    </aside>
  );
}
