'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_STATE,
  DISCOVERY_MODES,
  PLACE_ZOOM_THRESHOLD,
  emptyStateMessage,
  fetchClusters,
  fetchPlaces,
  paramsFromState,
  periodById,
  stateFromParams,
} from '@/lib/discovery';
import type { DiscoveryMode, DiscoveryState, MapBounds, MapCluster, MapPlace } from '@/lib/discovery';
import { PeriodScrubber } from './PeriodScrubber';
import { PlacePreview } from './PlacePreview';
import { usingFallbackBasemap } from '@/lib/basemap';

/**
 * MapLibre touches `window` on import, so it must never run during SSR. Loading
 * it dynamically keeps the rest of the page server-rendered: the filters, the
 * period control and the results list all exist before any map code arrives,
 * which is also why they remain usable if it never does.
 */
const DiscoveryMap = dynamic(
  () => import('./DiscoveryMap').then((m) => m.DiscoveryMap),
  { ssr: false, loading: () => <div className="map-canvas map-loading">Loading map…</div> },
);

const TYPE_LABEL = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MODE_LABELS: { id: DiscoveryMode; label: string; hint: string }[] = [
  { id: DISCOVERY_MODES.Everything, label: 'Everything historic', hint: 'All published heritage, however ordinary' },
  { id: DISCOVERY_MODES.Buildings, label: 'Buildings', hint: 'Houses, churches, mills, stations' },
  { id: DISCOVERY_MODES.Archaeology, label: 'Archaeology', hint: 'Sites, earthworks, forts, ruins' },
  { id: DISCOVERY_MODES.Monuments, label: 'Monuments & landscapes', hint: 'Memorials, gardens, designed landscapes' },
];

export function ExploreClient({ initial }: { initial: DiscoveryState }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<DiscoveryState>(initial);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const requestId = useRef(0);

  const showingPlaces = state.zoom >= PLACE_ZOOM_THRESHOLD;

  // --- Keep the URL in step -------------------------------------------------
  // Replace rather than push: panning a map should not fill the back button
  // with history, but the address bar should always describe what is on screen.
  useEffect(() => {
    const params = paramsFromState(state);
    window.history.replaceState(null, '', `/explore?${params.toString()}`);
  }, [state]);

  // --- Fetch ----------------------------------------------------------------
  useEffect(() => {
    if (!bounds) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        if (showingPlaces) {
          const rows = await fetchPlaces(supabase, bounds, state);
          if (id !== requestId.current) return;
          setPlaces(rows);
          setClusters([]);
        } else {
          const rows = await fetchClusters(supabase, bounds, state);
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
    };
    void run();
  }, [bounds, state, showingPlaces, supabase]);

  const onMoved = useCallback(
    (b: MapBounds, centre: { lng: number; lat: number }, zoom: number) => {
      setBounds(b);
      setState((s) => ({ ...s, lng: centre.lng, lat: centre.lat, zoom }));
    },
    [],
  );

  const patch = useCallback((partial: Partial<DiscoveryState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const selectedPlace = places.find((p) => p.slug === state.selected) ?? null;
  const totalInView = showingPlaces
    ? places.length
    : clusters.reduce((sum, c) => sum + Number(c.place_count), 0);
  const empty = !loading && !error && totalInView === 0;
  const emptyMessage = emptyStateMessage(state);
  const period = periodById(state.periodId);

  return (
    <div className="explore">
      <div className="explore-bar">
        <form
          className="explore-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get('q');
            patch({ q: typeof value === 'string' ? value : '' });
          }}
        >
          <label htmlFor="explore-q" className="visually-hidden">
            Search places in view
          </label>
          <input
            id="explore-q"
            name="q"
            type="search"
            defaultValue={state.q}
            placeholder="Search places in view"
          />
          <button type="submit">Search</button>
        </form>

        <button
          type="button"
          className="secondary"
          aria-expanded={showFilters}
          aria-controls="explore-filters"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{state.types.length || state.requireImage || state.fromYear || state.toYear ? ' ·' : ''}
        </button>
      </div>

      <PeriodScrubber value={state.periodId} onChange={(periodId) => patch({ periodId })} />

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
            <legend>Date range</legend>
            <p className="muted filter-hint">
              A span of years, separate from the period control above. Use negative years for BC.
            </p>
            <div className="filter-row">
              <label htmlFor="from-year">From</label>
              <input
                id="from-year"
                type="number"
                inputMode="numeric"
                placeholder="e.g. -800"
                defaultValue={state.fromYear ?? ''}
                onBlur={(e) => patch({ fromYear: e.target.value ? Number(e.target.value) : null })}
              />
              <label htmlFor="to-year">To</label>
              <input
                id="to-year"
                type="number"
                inputMode="numeric"
                placeholder="e.g. 410"
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

          <button type="button" className="secondary" onClick={() => setState({ ...DEFAULT_STATE, lng: state.lng, lat: state.lat, zoom: state.zoom })}>
            Clear filters
          </button>
        </div>
      )}

      <div className="explore-body">
        <section className="explore-results" aria-label="Results">
          <p className="explore-count" role="status">
            {loading
              ? 'Searching…'
              : showingPlaces
                ? `${places.length} place${places.length === 1 ? '' : 's'} in view`
                : `${totalInView.toLocaleString('en-GB')} places in view · zoom in to see them individually`}
            {period && !loading ? ` · ${period.name}` : ''}
          </p>

          {error && <p className="error">{error}</p>}

          {empty && (
            <div className="empty-state">
              <h3>{emptyMessage.title}</h3>
              <p className="muted">{emptyMessage.detail}</p>
              {state.periodId && (
                <button type="button" onClick={() => patch({ periodId: null })}>
                  Show any time
                </button>
              )}
            </div>
          )}

          {/* The non-map path. Every place on the map is here as a button, so
              the results are reachable without touching the canvas at all. */}
          {showingPlaces && places.length > 0 && (
            <ul className="result-list">
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`result-item${p.slug === state.selected ? ' is-selected' : ''}`}
                    onClick={() => patch({ selected: p.slug })}
                  >
                    <span className="result-name">{p.name}</span>
                    <span className="result-meta muted">
                      {TYPE_LABEL(p.place_type)}
                      {p.period_summary ? ` · ${p.period_summary}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!showingPlaces && clusters.length > 0 && (
            <ul className="result-list">
              {clusters.slice(0, 40).map((c) => (
                <li key={c.cell_key}>
                  <button
                    type="button"
                    className="result-item"
                    onClick={() => patch({ lng: c.lng, lat: c.lat, zoom: PLACE_ZOOM_THRESHOLD })}
                  >
                    <span className="result-name">
                      {Number(c.place_count).toLocaleString('en-GB')} places
                    </span>
                    <span className="result-meta muted">near {c.sample_name}</span>
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
            onMoved={onMoved}
            onSelectPlace={(slug) => patch({ selected: slug })}
            onZoomToCluster={(lng, lat) => patch({ lng, lat, zoom: PLACE_ZOOM_THRESHOLD })}
          />
          {selectedPlace && (
            <PlacePreview place={selectedPlace} onClose={() => patch({ selected: null })} />
          )}
        </div>
      </div>

      {usingFallbackBasemap() && (
        <p className="muted explore-basemap-note">
          Development basemap. A production tile provider has not been chosen yet.
        </p>
      )}
    </div>
  );
}

export function parseInitialState(search: string): DiscoveryState {
  return stateFromParams(new URLSearchParams(search));
}
