'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AttributionControl, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { resolveMapStyle } from '@/lib/basemap';
import { displayCategory } from '@/lib/discovery';
import type { MapBounds, MapCluster, MapPlace } from '@/lib/discovery';

/**
 * The map surface.
 *
 * Deliberately thin: it draws what it is given and reports where the user is
 * looking. It does not decide what to fetch, does not hold filter state and
 * does not know what a period is. Everything it renders arrives as props, which
 * is what lets the same results drive the accessible list beside it.
 *
 * Markers are plain DOM rather than a GL symbol layer. At the densities Whilom
 * actually shows — clusters below zoom 12, then at most 250 places — the cost
 * is unimportant, and DOM markers can be focused, tabbed to and read by a screen
 * reader, which a canvas cannot.
 */

interface Props {
  clusters: MapCluster[];
  places: MapPlace[];
  selectedSlug: string | null;
  center: { lng: number; lat: number };
  zoom: number;
  /** Bumped when the caller wants the map to jump, e.g. after a search. */
  flyToken?: number;
  onMoved: (bounds: MapBounds, center: { lng: number; lat: number }, zoom: number) => void;
  onSelectPlace: (slug: string) => void;
  onZoomToCluster: (lng: number, lat: number) => void;
}

/**
 * Marker size by how much it stands for. Area, not radius, tracks the count, so
 * a cluster of 400 does not become a disc that swallows the county.
 */
function clusterSize(count: number): number {
  return Math.min(64, 26 + Math.sqrt(count) * 2.2);
}



export function DiscoveryMap({
  clusters,
  places,
  selectedSlug,
  center,
  zoom,
  flyToken,
  onMoved,
  onSelectPlace,
  onZoomToCluster,
}: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  // Held in refs so the map's own listeners always call the current version
  // without the map having to be torn down and rebuilt on every render.
  const handlers = useRef({ onMoved, onSelectPlace, onZoomToCluster });
  handlers.current = { onMoved, onSelectPlace, onZoomToCluster };

  const report = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    const c = m.getCenter();
    handlers.current.onMoved(
      { swLng: b.getWest(), swLat: b.getSouth(), neLng: b.getEast(), neLat: b.getNorth() },
      { lng: c.lng, lat: c.lat },
      m.getZoom(),
    );
  }, []);

  // --- Create once ----------------------------------------------------------
  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new MapLibreMap({
      container: container.current,
      style: resolveMapStyle(),
      center: [center.lng, center.lat],
      zoom,
      // The regional dataset is Yorkshire; letting someone pan to the Pacific
      // and find nothing is a worse first impression than a gentle boundary.
      maxBounds: [
        [-9.5, 49.0],
        [3.0, 61.5],
      ],
      attributionControl: false,
    });

    m.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.on('moveend', report);
    m.on('load', report);
    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
    // Intentionally created once: subsequent centre/zoom changes are applied by
    // the effect below rather than by rebuilding the map.

  }, []);

  // --- Follow deliberate jumps only ----------------------------------------
  // Driven by a token rather than by centre/zoom, because those change on every
  // pan: reacting to them would make the map argue with the person dragging it.
  useEffect(() => {
    const m = map.current;
    if (!m || flyToken === undefined) return;
    m.easeTo({ center: [center.lng, center.lat], zoom, duration: 700 });
    // Only the token is a dependency; centre and zoom are read at fire time.

  }, [flyToken]);

  // --- Draw ----------------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    for (const marker of markers.current) marker.remove();
    markers.current = [];

    for (const cluster of clusters) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-cluster';
      const size = clusterSize(cluster.place_count);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.textContent = cluster.place_count.toLocaleString('en-GB');
      // The count is text, not just a size: density conveyed only by area would
      // be invisible to a screen reader and ambiguous to everyone else.
      el.setAttribute(
        'aria-label',
        `${cluster.place_count.toLocaleString('en-GB')} places near ${cluster.sample_name}. Zoom in to see them.`,
      );
      el.addEventListener('click', () => handlers.current.onZoomToCluster(cluster.lng, cluster.lat));
      markers.current.push(
        new Marker({ element: el }).setLngLat([cluster.lng, cluster.lat]).addTo(m),
      );
    }

    for (const place of places) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `map-pin${place.slug === selectedSlug ? ' is-selected' : ''}`;
      // Colour and symbol together, matching the legend. Either alone would
      // leave somebody unable to read the map.
      const category = displayCategory(place.display_category);
      el.style.background = category.colour;
      el.textContent = category.symbol;
      el.setAttribute(
        'aria-label',
        `${place.name}, ${place.place_type.replace(/_/g, ' ')}, ${category.label}`,
      );
      el.addEventListener('click', () => handlers.current.onSelectPlace(place.slug));
      markers.current.push(
        new Marker({ element: el }).setLngLat([place.lng, place.lat]).addTo(m),
      );
    }
  }, [clusters, places, selectedSlug]);

  return <div className="map-canvas" ref={container} data-testid="discovery-map" />;
}
