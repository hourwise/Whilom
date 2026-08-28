export type DisplayCategoryId =
  | 'building'
  | 'religious'
  | 'fortification'
  | 'monument'
  | 'ruin'
  | 'archaeology'
  | 'industrial'
  | 'military'
  | 'landscape'
  | 'other';

export interface DisplayCategory {
  id: DisplayCategoryId;
  label: string;
  colour: string;
  symbol: string;
  hint: string;
}

export const DISPLAY_CATEGORIES: readonly DisplayCategory[] = [
  { id: 'building', label: 'Buildings', colour: '#b3402f', symbol: '■', hint: 'Houses, halls, mills, stations' },
  { id: 'religious', label: 'Religious', colour: '#6b4c9a', symbol: '✚', hint: 'Churches, chapels, abbeys, priories' },
  { id: 'fortification', label: 'Castles & forts', colour: '#3f5d8c', symbol: '⬟', hint: 'Castles, forts, hillforts' },
  { id: 'monument', label: 'Monuments', colour: '#c08a1e', symbol: '▲', hint: 'Crosses, memorials, statues' },
  { id: 'ruin', label: 'Ruins & lost', colour: '#3f7a4a', symbol: '◗', hint: 'Ruined and lost structures' },
  { id: 'archaeology', label: 'Archaeology', colour: '#8a6a3d', symbol: '◈', hint: 'Sites, barrows, villas, battlefields' },
  { id: 'industrial', label: 'Industrial', colour: '#5c6970', symbol: '⚙', hint: 'Works, canals, railways' },
  { id: 'military', label: 'Military', colour: '#4a5a35', symbol: '⬢', hint: 'Pillboxes, bunkers, airfields' },
  { id: 'landscape', label: 'Landscape', colour: '#2f7d6f', symbol: '❦', hint: 'Parks, gardens, designed landscapes' },
  { id: 'other', label: 'Other & unknown', colour: '#6f6f6f', symbol: '●', hint: 'Structures Whilom cannot yet classify' },
];

