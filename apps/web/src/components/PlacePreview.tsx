'use client';

import Link from 'next/link';
import type { MapPlace } from '@/lib/discovery';

/**
 * The preview that opens when a place is selected.
 *
 * Deliberately shallow. It shows what the map already knows — the marker
 * payload and nothing more — so selecting a place costs no extra query and
 * cannot become a second, competing place page. Depth lives at /place/[slug];
 * this is the invitation to go there.
 */

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface Props {
  place: MapPlace;
  onClose: () => void;
}

export function PlacePreview({ place, onClose }: Props) {
  // Directions hand off to whatever the person already uses. Whilom does not
  // calculate road routes, and a browser cannot reliably tell which navigation
  // apps are installed, so the honest thing is to offer the coordinates to a
  // provider rather than guess.
  const coords = `${place.lat.toFixed(6)},${place.lng.toFixed(6)}`;

  return (
    <aside className="preview" aria-labelledby="preview-title">
      <div className="preview-head">
        <h2 id="preview-title" className="preview-title">
          {place.name}
        </h2>
        <button type="button" className="preview-close" onClick={onClose} aria-label="Close preview">
          ×
        </button>
      </div>

      {/* Only ever rendered when the database could generate attribution for
          this exact file; map_thumbnail_for returns NULL otherwise. No image is
          better than one Whilom cannot credit. */}
      {place.thumbnail_url && (
        <img
          className="preview-image"
          src={place.thumbnail_url}
          alt=""
          loading="lazy"
          width={480}
          height={280}
        />
      )}

      <dl className="preview-facts">
        <div>
          <dt>Type</dt>
          <dd>{label(place.place_type)}</dd>
        </div>
        {place.primary_designation && (
          <div>
            <dt>Designation</dt>
            <dd>{label(place.primary_designation)}</dd>
          </div>
        )}
        {place.period_summary && (
          <div>
            <dt>Period</dt>
            <dd>{place.period_summary}</dd>
          </div>
        )}
        {place.survival_status && (
          <div>
            <dt>Survival</dt>
            <dd>{label(place.survival_status)}</dd>
          </div>
        )}
        {place.location_accuracy_m !== null && (
          <div>
            <dt>Location accuracy</dt>
            <dd>±{Math.round(Number(place.location_accuracy_m))} m</dd>
          </div>
        )}
      </dl>

      {!place.period_summary && (
        <p className="preview-note muted">
          Whilom has no dated record for this place yet. That does not mean it is undated — only
          that the sources we hold do not say.
        </p>
      )}

      <div className="preview-actions">
        <Link className="btn" href={`/place/${place.slug}`}>
          Explore place
        </Link>
        <a
          className="btn secondary"
          href={`https://www.openstreetmap.org/directions?to=${coords}`}
          target="_blank"
          rel="noreferrer"
        >
          Directions
        </a>
      </div>
    </aside>
  );
}
