'use client';

import { DISPLAY_CATEGORIES } from '@/lib/discovery';

/**
 * The map key.
 *
 * Every entry carries colour, symbol and text. That is not belt-and-braces: a
 * map whose meaning is carried by hue alone is unreadable to a substantial
 * minority of people, and the symbol is what makes the key work in greyscale,
 * in bright sun, and for anyone with a colour-vision deficiency.
 *
 * Entries double as filters, but they are not the only way to filter — the
 * filter panel carries the same choices as ordinary checkboxes, because a
 * legend is a poor place to hide a control.
 */

interface Props {
  active: string[];
  onToggle: (categoryId: string) => void;
  onClear: () => void;
}

export function MapLegend({ active, onToggle, onClear }: Props) {
  const filtering = active.length > 0;

  return (
    <div className="legend" role="group" aria-label="Map key and category filter">
      <div className="legend-head">
        <h3 className="legend-title">Key</h3>
        {filtering && (
          <button type="button" className="legend-clear" onClick={onClear}>
            Show all
          </button>
        )}
      </div>
      <ul className="legend-list">
        {DISPLAY_CATEGORIES.map((c) => {
          const on = active.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`legend-item${on ? ' is-active' : ''}${filtering && !on ? ' is-dimmed' : ''}`}
                onClick={() => onToggle(c.id)}
                aria-pressed={on}
                title={c.hint}
              >
                <span className="legend-swatch" style={{ background: c.colour }} aria-hidden="true">
                  {c.symbol}
                </span>
                <span className="legend-label">{c.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
