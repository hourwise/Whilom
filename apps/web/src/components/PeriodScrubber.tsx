'use client';

import { PERIODS, formatPeriodSpan, periodById } from '@/lib/discovery';

/**
 * The time control.
 *
 * A radio group rather than a slider. A slider looks like the "scrub through
 * history" idea and behaves badly for it: the periods are wildly unequal in
 * length — the Palaeolithic is 890,000 years, the First World War is four — so
 * any linear axis either compresses all of recorded history into a sliver or
 * lies about the scale. A radio group is honest about the periods being
 * discrete choices, and it is keyboard-navigable with arrow keys for free.
 *
 * It is laid out as a horizontal track so it still reads as a journey through
 * time, and scrolls rather than wrapping so the order stays legible on a phone.
 */

interface Props {
  value: string | null;
  onChange: (periodId: string | null) => void;
  /** How many places each period would show, when known. */
  counts?: Record<string, number>;
}

export function PeriodScrubber({ value, onChange, counts }: Props) {
  const selected = periodById(value);

  return (
    <div className="scrubber">
      <div className="scrubber-header">
        <h2 className="scrubber-title">When</h2>
        <p className="scrubber-caption">
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <span className="muted"> · {formatPeriodSpan(selected)}</span>
            </>
          ) : (
            <span className="muted">Any time</span>
          )}
        </p>
      </div>

      <div
        className="scrubber-track"
        role="radiogroup"
        aria-label="Historical period"
        // A horizontal control announced as such, so a screen reader user knows
        // arrow keys move through time rather than down a list.
        aria-orientation="horizontal"
      >
        <label className={`scrubber-stop is-any${value === null ? ' is-active' : ''}`}>
          <input
            type="radio"
            name="period"
            value=""
            checked={value === null}
            onChange={() => onChange(null)}
          />
          <span className="scrubber-stop-name">Any time</span>
        </label>

        {PERIODS.map((period) => {
          const count = counts?.[period.id];
          return (
            <label
              key={period.id}
              className={`scrubber-stop${value === period.id ? ' is-active' : ''}`}
              title={`${period.name} · ${formatPeriodSpan(period)}${period.note ? ` · ${period.note}` : ''}`}
            >
              <input
                type="radio"
                name="period"
                value={period.id}
                checked={value === period.id}
                onChange={() => onChange(period.id)}
              />
              <span className="scrubber-stop-name">{period.name}</span>
              <span className="scrubber-stop-span">{formatPeriodSpan(period)}</span>
              {count !== undefined && (
                <span className="scrubber-stop-count">{count.toLocaleString('en-GB')}</span>
              )}
            </label>
          );
        })}
      </div>

      {selected?.note && <p className="scrubber-note muted">{selected.note}</p>}

      <p className="scrubber-caveat muted">
        Period boundaries are a guide for finding things, not a historical ruling. Whilom holds a
        dated record for only a small share of places so far.
      </p>
    </div>
  );
}
