import { TIME_MODE_LABELS, TIME_MODES, type TimeMode } from '@whilom/discovery';

export const TIME_MODE_OPTIONS: ReadonlyArray<{ id: TimeMode; label: string; hint: string }> = [
  TIME_MODES.All,
  TIME_MODES.At,
  TIME_MODES.Until,
  TIME_MODES.From,
].map((id) => ({ id, ...TIME_MODE_LABELS[id] }));
