'use client';

import { useCallback, useMemo, useRef } from 'react';
import {
  PERIODS,
  TIME_MODES,
  TIME_MODE_LABELS,
  formatYear,
  periodById,
} from '@/lib/discovery';
import type { PeriodCount, TimeMode } from '@/lib/discovery';

/**
 * The historical ruler.
 *
 * ---------------------------------------------------------------------------
 * Why the axis is not linear
 * ---------------------------------------------------------------------------
 *
 * Real time is unusable as a straight line here. The Palaeolithic is 890,000
 * years and the First World War is four; on a linear axis everything since the
 * Romans occupies a hairline and the periods people actually search for cannot
 * be hit with a mouse.
 *
 * So the axis is piecewise: each period gets screen width in proportion to how
 * much it is likely to be *used*, not to how long it lasted. Deep prehistory is
 * compressed into a labelled stretch, and the last thousand years — where
 * essentially all of Whilom's dated records sit — gets the room it needs. The
 * ruler is a navigation instrument, and a navigation instrument that is
 * technically to scale but impossible to operate is not honest, only literal.
 *
 * Century ticks are drawn where they fit and thinned where they do not, so the
 * marks stay countable rather than becoming a grey band.
 */

/** Screen weight per period. Higher means more width on the ruler. */
const PERIOD_WEIGHT: Record<string, number> = {
  palaeolithic: 1.4,
  mesolithic: 1,
  neolithic: 1,
  bronze_age: 1.2,
  iron_age: 1.2,
  roman: 1.6,
  early_medieval: 1.6,
  norman: 1,
  medieval: 2,
  tudor: 1.4,
  stuart: 1.4,
  georgian: 1.8,
  victorian: 1.8,
  edwardian: 0.8,
  wwi: 0.7,
  interwar: 0.7,
  wwii: 0.9,
  postwar: 1,
  late_20th: 0.8,
  contemporary: 0.8,
};

interface Segment {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  /** Fractional position of the segment's left and right edges, 0..1. */
  from: number;
  to: number;
  note?: string;
}

/** The ruler's segments and the total weight, computed once. */
function buildSegments(): { segments: Segment[]; } {
  const total = PERIODS.reduce((sum, p) => sum + (PERIOD_WEIGHT[p.id] ?? 1), 0);
  let cursor = 0;
  const segments = PERIODS.map((p) => {
    const weight = (PERIOD_WEIGHT[p.id] ?? 1) / total;
    const seg: Segment = {
      id: p.id,
      name: p.name,
      startYear: p.startYear,
      endYear: p.endYear,
      from: cursor,
      to: cursor + weight,
      ...(p.note ? { note: p.note } : {}),
    };
    cursor += weight;
    return seg;
  });
  return { segments };
}

const { segments: SEGMENTS } = buildSegments();

export const EARLIEST_YEAR = PERIODS[0]!.startYear;
export const LATEST_YEAR = PERIODS.at(-1)!.endYear;

/** Fractional ruler position for a year, 0..1. */
export function yearToFraction(year: number): number {
  if (year <= SEGMENTS[0]!.startYear) return 0;
  const last = SEGMENTS.at(-1)!;
  if (year >= last.endYear) return 1;
  for (const seg of SEGMENTS) {
    if (year >= seg.startYear && year <= seg.endYear) {
      const span = seg.endYear - seg.startYear || 1;
      return seg.from + ((year - seg.startYear) / span) * (seg.to - seg.from);
    }
  }
  return 1;
}

/** The year at a fractional ruler position. Never returns year zero. */
export function fractionToYear(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  for (const seg of SEGMENTS) {
    if (f >= seg.from && f <= seg.to) {
      const width = seg.to - seg.from || 1;
      const year = Math.round(seg.startYear + ((f - seg.from) / width) * (seg.endYear - seg.startYear));
      // There is no year zero in the historical convention, so the value
      // adjacent to it on either side is 1 BCE or 1 CE, never 0.
      return year === 0 ? 1 : year;
    }
  }
  return LATEST_YEAR;
}

/**
 * Century marks to draw.
 *
 * Every century where they would be at least a few pixels apart; beyond that
 * the interval widens — millennia, then ten-thousand-year steps — so deep
 * prehistory is marked rather than smeared. Labels are thinned separately from
 * ticks, because a tick can be narrower than its own label.
 */
function centuryTicks(): { year: number; fraction: number; labelled: boolean }[] {
  const ticks: { year: number; fraction: number; labelled: boolean }[] = [];
  const push = (year: number, labelled: boolean) => {
    const fraction = yearToFraction(year);
    const previous = ticks.at(-1);
    // Drop a tick that would land on top of its neighbour.
    if (previous && fraction - previous.fraction < 0.004) return;
    ticks.push({ year, fraction, labelled });
  };

  for (let year = -900_000; year < -10_000; year += 100_000) push(year, year % 300_000 === 0);
  for (let year = -10_000; year < -2_000; year += 1_000) push(year, year % 2_000 === 0);
  for (let year = -2_000; year < 0; year += 100) push(year, year % 500 === 0);
  for (let year = 100; year <= 2_000; year += 100) push(year, year % 500 === 0 || year === 100);
  return ticks;
}

const TICKS = centuryTicks();

interface Props {
  timeMode: TimeMode;
  selectedYear: number | null;
  periodId: string | null;
  counts?: PeriodCount[];
  onChange: (patch: { timeMode?: TimeMode; selectedYear?: number | null; periodId?: string | null }) => void;
}

export function TimeRuler({ timeMode, selectedYear, periodId, counts, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const period = periodById(periodId);
  const year = selectedYear ?? 1900;
  const handleFraction = yearToFraction(year);

  const countFor = useMemo(() => {
    const map = new Map((counts ?? []).map((c) => [c.period_id, Number(c.place_count)]));
    return (id: string) => map.get(id);
  }, [counts]);

  const pickFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      onChange({
        selectedYear: fractionToYear(fraction),
        // Choosing a year while in "All time" would otherwise do nothing
        // visible; the natural reading of dropping a handle is "at this time".
        ...(timeMode === TIME_MODES.All ? { timeMode: TIME_MODES.At, periodId: null } : {}),
      });
    },
    [onChange, timeMode],
  );

  const restrictive = timeMode !== TIME_MODES.All;

  return (
    <section className="ruler" aria-labelledby="ruler-heading">
      <div className="ruler-head">
        <h2 id="ruler-heading" className="ruler-title">
          When
        </h2>
        <p className="ruler-readout" aria-live="polite">
          {timeMode === TIME_MODES.All && !period ? (
            <span className="muted">All time</span>
          ) : (
            <>
              <strong>{period ? period.name : formatYear(year)}</strong>
              {period ? (
                <span className="muted"> · {formatYear(period.startYear)} – {formatYear(period.endYear)}</span>
              ) : (
                <span className="muted"> · {TIME_MODE_LABELS[timeMode].label.toLowerCase()}</span>
              )}
            </>
          )}
        </p>
      </div>

      {/* --- Mode -------------------------------------------------------- */}
      <div className="ruler-modes" role="radiogroup" aria-label="How the selected time is applied">
        {(Object.values(TIME_MODES) as TimeMode[]).map((m) => (
          <label key={m} className={`ruler-mode${timeMode === m ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="timeMode"
              checked={timeMode === m}
              onChange={() =>
                onChange({
                  timeMode: m,
                  // A restrictive mode needs a year to restrict by.
                  ...(m !== TIME_MODES.All && selectedYear === null ? { selectedYear: 1900 } : {}),
                })
              }
            />
            <span>{TIME_MODE_LABELS[m].label}</span>
          </label>
        ))}
      </div>

      {/* --- The ruler --------------------------------------------------- */}
      <div className="ruler-track-wrap">
        <div
          className="ruler-track"
          ref={trackRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pickFromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) pickFromPointer(e.clientX);
          }}
        >
          {/* Fill: the shape of the filter, not decoration. A point for "at",
              everything before the handle for "until", everything after for
              "from", and nothing at all for "all time". */}
          {restrictive && (
            <div
              className={`ruler-fill is-${timeMode}`}
              style={
                timeMode === TIME_MODES.Until
                  ? { left: 0, width: `${handleFraction * 100}%` }
                  : timeMode === TIME_MODES.From
                    ? { left: `${handleFraction * 100}%`, right: 0 }
                    : { left: `${Math.max(0, handleFraction - 0.008) * 100}%`, width: '1.6%' }
              }
            />
          )}

          {/* Epoch bands, alternating so adjacent periods are separable
              without relying on a distinct colour for each. */}
          {SEGMENTS.map((seg, i) => {
            const n = countFor(seg.id);
            return (
              <button
                key={seg.id}
                type="button"
                className={`ruler-band${periodId === seg.id ? ' is-active' : ''}${i % 2 ? ' is-alt' : ''}`}
                style={{ left: `${seg.from * 100}%`, width: `${(seg.to - seg.from) * 100}%` }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  onChange(
                    periodId === seg.id
                      ? { periodId: null }
                      : { periodId: seg.id, timeMode: TIME_MODES.All, selectedYear: null },
                  )
                }
                aria-pressed={periodId === seg.id}
                title={`${seg.name} · ${formatYear(seg.startYear)} – ${formatYear(seg.endYear)}${
                  n !== undefined ? ` · ${n} records here` : ''
                }`}
              >
                <span className="ruler-band-name">{seg.name}</span>
                {n !== undefined && n > 0 && <span className="ruler-band-count">{n}</span>}
              </button>
            );
          })}

          {/* Century marks */}
          {TICKS.map((t) => (
            <span
              key={t.year}
              className={`ruler-tick${t.labelled ? ' is-labelled' : ''}`}
              style={{ left: `${t.fraction * 100}%` }}
              aria-hidden="true"
            >
              {t.labelled && <span className="ruler-tick-label">{formatYear(t.year)}</span>}
            </span>
          ))}

          {restrictive && (
            <span className="ruler-handle" style={{ left: `${handleFraction * 100}%` }} aria-hidden="true" />
          )}
        </div>
      </div>

      {/* --- Keyboard and exact entry ------------------------------------ */}
      {/* Dragging must never be the only way to choose history. */}
      <div className="ruler-controls">
        <label htmlFor="ruler-year">Year</label>
        <input
          id="ruler-year"
          className="ruler-year-input"
          type="number"
          value={selectedYear ?? ''}
          placeholder="1900"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange({ selectedYear: null });
            const n = Number(raw);
            if (!Number.isInteger(n) || n === 0) return;
            onChange({
              selectedYear: n,
              ...(timeMode === TIME_MODES.All ? { timeMode: TIME_MODES.At } : {}),
            });
          }}
        />
        <span className="muted ruler-year-hint">
          Negative years are BCE — {formatYear(-500)} is written −500.
        </span>
        {(period || restrictive) && (
          <button
            type="button"
            className="secondary"
            onClick={() => onChange({ periodId: null, timeMode: TIME_MODES.All, selectedYear: null })}
          >
            Clear time
          </button>
        )}
      </div>

      <p className="ruler-caveat muted">
        Period boundaries are a guide for finding things, not a historical ruling. Counts show
        Whilom records associated with a period in this view — not everything that existed then.
      </p>
    </section>
  );
}
