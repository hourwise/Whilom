'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { searchDiscovery } from '@/lib/discovery';
import type { SearchResult } from '@/lib/discovery';

/**
 * One search box for places and people.
 *
 * A person should not have to know which tab Whilom files them under before
 * they can be found, so there is no "Places | People" toggle to choose first.
 * Results are grouped by kind after the fact, which is where grouping helps and
 * where it costs the user nothing.
 *
 * Every query hits Whilom's own indexed data. No third-party lookup fires on a
 * keystroke — that would be slow, rate-limited, and would leak what people are
 * searching for to somebody else.
 */

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  onSelect: (result: SearchResult) => void;
  initialQuery?: string;
}

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  person: 'People',
  place: 'Places',
};

export function DiscoverySearch({ placeholder, autoFocus, onSelect, initialQuery }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const requestId = useRef(0);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    // Debounced: a search per keystroke would be a query per keystroke.
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void searchDiscovery(supabase, term, 12)
        .then((rows) => {
          if (id !== requestId.current) return;
          setResults(rows);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {
          if (id === requestId.current) setResults([]);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, supabase]);

  // Close when focus leaves the whole control, not merely the input — a click
  // on a result must land before the list disappears.
  useEffect(() => {
    const onDocument = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, []);

  const grouped = useMemo(() => {
    const people = results.filter((r) => r.kind === 'person');
    const places = results.filter((r) => r.kind === 'place');
    return [
      ...(people.length ? ([['person', people]] as const) : []),
      ...(places.length ? ([['place', places]] as const) : []),
    ];
  }, [results]);

  // Flattened in display order so arrow keys move through what is on screen.
  const flat = useMemo(() => grouped.flatMap(([, rows]) => rows), [grouped]);

  const choose = (result: SearchResult) => {
    setOpen(false);
    setQuery(result.display_name);
    onSelect(result);
  };

  return (
    <div className="search" ref={boxRef}>
      <label htmlFor={`${listId}-input`} className="visually-hidden">
        Search a place, town, postcode, historic site or person
      </label>
      <input
        id={`${listId}-input`}
        className="search-input"
        type="search"
        role="combobox"
        aria-expanded={open && flat.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Search a place, town, historic site or person…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || flat.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % flat.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? flat.length - 1 : i - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            choose(flat[active]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {open && flat.length > 0 && (
        <ul className="search-results" id={listId} role="listbox">
          {grouped.map(([kind, rows]) => (
            <li key={kind} role="presentation">
              <p className="search-group" role="presentation">
                {KIND_LABEL[kind]}
              </p>
              <ul role="presentation">
                {rows.map((r) => {
                  const index = flat.indexOf(r);
                  return (
                    <li key={`${r.kind}-${r.id}`} role="presentation">
                      <button
                        type="button"
                        id={`${listId}-opt-${index}`}
                        role="option"
                        aria-selected={index === active}
                        className={`search-result${index === active ? ' is-active' : ''}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(r)}
                      >
                        <span className="search-result-name">{r.display_name}</span>
                        <span className="muted search-result-meta">
                          {/* The kind is announced, not merely coloured, so a
                              screen reader user knows whether Enter will move
                              the map or start following a person. */}
                          <span className="visually-hidden">{r.kind === 'person' ? 'Person. ' : 'Place. '}</span>
                          {[r.detail, r.context].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length >= 2 && flat.length === 0 && (
        <div className="search-results search-empty">
          <p className="muted">
            Nothing in Whilom matches “{query.trim()}”. Whilom's detailed coverage is currently
            Yorkshire and the surrounding area.
          </p>
        </div>
      )}
    </div>
  );
}
