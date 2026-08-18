'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_STATE,
  DISCOVERY_MODES,
  PLACE_ZOOM_THRESHOLD,
  TIME_MODES,
  coverageMessage,
  displayCategory,
  emptyStateMessage,
  fetchClusters,
  fetchCoverage,
  fetchPeriodCounts,
  fetchPlaces,
  hasActiveFilters,
  paramsFromState,
  periodById,
} from '@/lib/discovery';
import type {
  Coverage,
  DiscoveryMode,
  DiscoveryState,
  MapBounds,
  MapCluster,
  MapPlace,
  PeriodCount,
  PersonPlace,
  SearchResult,
  TimeMode,
} from '@/lib/discovery';
import { DiscoverySearch } from './DiscoverySearch';
import { MapLegend } from './MapLegend';
import { PersonPanel } from './PersonPanel';
import { PlacePreview } from './PlacePreview';
import { TimeRuler } from './TimeRuler';
import { usingFallbackBasemap } from '@/lib/basemap';

/**
 * The discovery surface: WHERE, WHEN, WHO — and WHAT through the legend.
 *
 * One implementation, used by both the homepage and /explore. The homepage
 * passes `immersive`, which gives the map the screen and tucks the controls
 * around it; /explore opens the same thing with the panels expanded. Two map
 * implementations would drift within a fortnight.
 *
 * MapLibre touches `window` on import, so it loads dynamically. Everything else
 * — search, ruler, filters, results — is ordinary markup that works before, and
 * without, the map arriving.
 */
const DiscoveryMap = dynamic(() => import('./DiscoveryMap').then((m) => m.DiscoveryMap), {
  ssr: false,
  loading: () => <div className="map-canvas map-loading">Loading map…</div>,
});

const TYPE_LABEL = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MODE_LABELS: { id: DiscoveryMode; label: string; hint: string }[] = [
  { id: DISCOVERY_MODES.Everything, label: 'Everything historic', hint: 'All published heritage, however ordinary' },
  { id: DISCOVERY_MODES.Buildings, label: 'Buildings', hint: 'Houses, churches, mills, stations' },
  { id: DISCOVERY_MODES.Archaeology, label: 'Archaeology', hint: 'Sites, earthworks, forts, ruins' },
  { id: DISCOVERY_MODES.Monuments, label: 'Monuments & landscapes', hint: 'Memorials, gardens, designed landscapes' },
];

interface FollowedPerson {
  slug: string;
  id: string;
  name: string;
  detail: string | null;
  context: string | null;
}

export function ExploreClient({
  initial,
  immersive = false,
}: {
  initial: DiscoveryState;
  immersive?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<DiscoveryState>(initial);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [counts, setCounts] = useState<PeriodCount[]>([]);
  const [person, setPerson] = useState<FollowedPerson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [flyToken, setFlyToken] = useState(0);
  const requestId = useRef(0);

  const showingPlaces = state.zoom >= PLACE_ZOOM_THRESHOLD || person !== null;

  const patch = useCallback((partial: Partial<DiscoveryState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  /** Move the map deliberately, as opposed to following a user drag. */
  const flyTo = useCallback((lng: number, lat: number, zoom: number) => {
    setState((s) => ({ ...s, lng, lat, zoom }));
    setFlyToken((t) => t + 1);
  }, []);

  // --- URL ------------------------------------------------------------------
  useEffect(() => {
    const params = paramsFromState(state);
    const path = immersive ? '/' : '/explore';
    window.history.replaceState(null, '', `${path}?${params.toString()}`);
  }, [state, immersive]);

  // --- Results --------------------------------------------------------------
  useEffect(() => {
    if (!bounds) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        // A person's places are a set, not a viewport: following someone should
        // show everywhere they appear rather than only what is on screen.
        if (showingPlaces) {
          const rows = await fetchPlaces(supabase, bounds, state, person?.id ?? null);
          if (id !== requestId.current) return;
          setPlaces(rows);
          setClusters([]);
        } else {
          // Following a person always shows individual places, so this branch
          // is only reached with no person selected.
          const rows = await fetchClusters(supabase, bounds, state, null);
          if (id !== requestId.current) return;
          setClusters(rows);
          setPlaces([]);
        }
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : 'Could not load places.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    })();
  }, [bounds, state, showingPlaces, supabase, person]);

  // Coverage and period counts move with the viewport but not with every filter
  // keystroke, so they are fetched separately and less often.
  useEffect(() => {
    if (!bounds) return;
    void fetchCoverage(supabase, bounds).then(setCoverage);
    void fetchPeriodCounts(supabase, bounds, state).then(setCounts);
    // Intentionally keyed on the viewport, not the whole state.

  }, [bounds, supabase]);

  const onMoved = useCallback((b: MapBounds, centre: { lng: number; lat: number }, zoom: number) => {
    setBounds(b);
    setState((s) => ({ ...s, lng: centre.lng, lat: centre.lat, zoom }));
  }, []);

  const onSearchSelect = useCallback(
    (result: SearchResult) => {
      if (result.kind === 'place') {
        setPerson(null);
        patch({ selected: result.slug, personSlug: null });
        if (result.lng !== null && result.lat !== null) flyTo(result.lng, result.lat, 14);
      } else {
        setPerson({
          slug: result.slug,
          id: result.id,
          name: result.display_name,
          detail: result.detail,
          context: result.context,
        });
        patch({ personSlug: result.slug, selected: null });
      }
    },
    [patch, flyTo],
  );

  const focusPlace = useCallback(
    (place: PersonPlace) => {
      patch({ selected: place.slug });
      flyTo(place.lng, place.lat, 15);
    },
    [patch, flyTo],
  );

  const selectedPlace = places.find((p) => p.slug === state.selected) ?? null;
  const totalInView = showingPlaces
    ? places.length
    : clusters.reduce((sum, c) => sum + Number(c.place_count), 0);
  const empty = !loading && !error && totalInView === 0;
  const period = periodById(state.periodId);
  const coverageNote = coverageMessage(coverage);
  const datedInView = counts.reduce((sum, c) => sum + Number(c.place_count), 0);

  return (
    <div className={`explore${immersive ? ' is-immersive' : ''}`}>
      <div className="explore-bar">
        <DiscoverySearch
          onSelect={onSearchSelect}
          autoFocus={false}
          placeholder="Search a place, town, historic site or person…"
        />
        <button
          type="button"
          className="secondary"
          aria-expanded={showFilters}
          aria-controls="explore-filters"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{hasActiveFilters(state) ? ' ·' : ''}
        </button>
      </div>

      {showFilters && (
        <div className="explore-filters" id="explore-filters">
          <fieldset>
            <legend>What to show</legend>
            {MODE_LABELS.map((m) => (
              <label key={m.id} className="filter-option">
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === m.id}
                  onChange={() => patch({ mode: m.id, types: [] })}
                />
                <span>
                  {m.label}
                  <small className="muted"> — {m.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Between two years</legend>
            <p className="muted filter-hint">
              A span, separate from the ruler above. Negative years are BCE.
            </p>
            <div className="filter-row">
              <label htmlFor="from-year">From</label>
              <input
                id="from-year"
                type="number"
                placeholder="-800"
                defaultValue={state.fromYear ?? ''}
                onBlur={(e) => patch({ fromYear: e.target.value ? Number(e.target.value) : null })}
              />
              <label htmlFor="to-year">To</label>
              <input
                id="to-year"
                type="number"
                placeholder="410"
                defaultValue={state.toYear ?? ''}
                onBlur={(e) => patch({ toYear: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>Other</legend>
            <label className="filter-option">
              <input
                type="checkbox"
                checked={state.requireImage}
                onChange={(e) => patch({ requireImage: e.target.checked })}
              />
              <span>
                Has a picture
                <small className="muted"> — only images Whilom can credit</small>
              </span>
            </label>
          </fieldset>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              setPerson(null);
              setState({ ...DEFAULT_STATE, lng: state.lng, lat: state.lat, zoom: state.zoom });
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="explore-body">
        <section className="explore-results" aria-label="Results">
          <p className="explore-count" role="status">
            {loading
              ? 'Searching…'
              : person
                ? `${places.length} place${places.length === 1 ? '' : 's'} connected to ${person.name}`
                : showingPlaces
                  ? `${places.length} place${places.length === 1 ? '' : 's'} in view`
                  : `${totalInView.toLocaleString('en-GB')} places in view · zoom in to see them individually`}
            {period && !loading ? ` · ${period.name}` : ''}
          </p>

          {coverageNote && (
            <p className={`coverage-note is-${coverageNote.level}`} role="status">
              {coverageNote.text}
            </p>
          )}

          {!loading && datedInView > 0 && (
            <p className="muted explore-dated">
              {datedInView.toLocaleString('en-GB')} record
              {datedInView === 1 ? '' : 's'} in this view carry a date Whilom can rely on.
            </p>
          )}

          {error && <p className="error">{error}</p>}

          {person && (
            <PersonPanel
              person={{
                kind: 'person',
                id: person.id,
                slug: person.slug,
                display_name: person.name,
                detail: person.detail,
                context: person.context,
                lng: null,
                lat: null,
                rank: 0,
              }}
              onClose={() => {
                setPerson(null);
                patch({ personSlug: null });
              }}
              onFocusPlace={focusPlace}
              onSelectPerson={(slug, id, name) =>
                setPerson({ slug, id, name, detail: null, context: null })
              }
            />
          )}

          {empty && !person && (
            <div className="empty-state">
              <h3>{emptyStateMessage(state).title}</h3>
              <p className="muted">{emptyStateMessage(state).detail}</p>
              {state.periodId && (
                <button type="button" onClick={() => patch({ periodId: null })}>
                  Show any time
                </button>
              )}
            </div>
          )}

          {!person && showingPlaces && places.length > 0 && (
            <ul className="result-list">
              {places.map((p) => {
                const category = displayCategory(p.display_category);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`result-item${p.slug === state.selected ? ' is-selected' : ''}`}
                      onClick={() => patch({ selected: p.slug })}
                    >
                      <span className="result-swatch" style={{ background: category.colour }} aria-hidden="true">
                        {category.symbol}
                      </span>
                      <span className="result-body">
                        <span className="result-name">{p.name}</span>
                        <span className="result-meta muted">
                          {TYPE_LABEL(p.place_type)}
                          {p.period_summary ? ` · ${p.period_summary}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!person && !showingPlaces && clusters.length > 0 && (
            <ul className="result-list">
              {clusters.slice(0, 40).map((c) => (
                <li key={c.cell_key}>
                  <button
                    type="button"
                    className="result-item"
                    onClick={() => flyTo(c.lng, c.lat, PLACE_ZOOM_THRESHOLD)}
                  >
                    <span className="result-body">
                      <span className="result-name">
                        {Number(c.place_count).toLocaleString('en-GB')} places
                      </span>
                      <span className="result-meta muted">near {c.sample_name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="muted explore-alt">
            Prefer a plain list? <Link href="/discover">Browse and filter without the map</Link>.
          </p>
        </section>

        <div className="explore-map">
          <DiscoveryMap
            clusters={clusters}
            places={places}
            selectedSlug={state.selected}
            center={{ lng: state.lng, lat: state.lat }}
            zoom={state.zoom}
            flyToken={flyToken}
            onMoved={onMoved}
            onSelectPlace={(slug) => patch({ selected: slug })}
            onZoomToCluster={(lng, lat) => flyTo(lng, lat, PLACE_ZOOM_THRESHOLD)}
          />
          <MapLegend
            active={state.categories}
            onToggle={(id) =>
              patch({
                categories: state.categories.includes(id)
                  ? state.categories.filter((c) => c !== id)
                  : [...state.categories, id],
              })
            }
            onClear={() => patch({ categories: [] })}
          />
          {selectedPlace && (
            <PlacePreview place={selectedPlace} onClose={() => patch({ selected: null })} />
          )}
        </div>
      </div>

      <TimeRuler
        timeMode={state.timeMode}
        selectedYear={state.selectedYear}
        periodId={state.periodId}
        counts={counts}
        onChange={(p) =>
          patch(p as Partial<DiscoveryState> & { timeMode?: TimeMode })
        }
      />

      {usingFallbackBasemap() && (
        <p className="muted explore-basemap-note">
          Development basemap. A production tile provider has not been chosen yet.
          {' '}
          {state.timeMode !== TIME_MODES.All && ''}
        </p>
      )}
    </div>
  );
}
