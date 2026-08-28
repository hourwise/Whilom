import { PlaceType, RelationshipPredicate } from '@whilom/domain';
import type {
  DiscoveryPerson,
  DiscoveryPersonPlaceLink,
  DiscoveryPlace,
} from '@whilom/discovery';
import { DISPLAY_CATEGORIES } from './taxonomy';

export type CoverageMode = 'nearby' | 'uk' | 'outside';

/** Fixture aliases keep Phase 6A call sites readable without creating a second model. */
export type DemoPlace = DiscoveryPlace;
export type DemoPersonPlaceLink = DiscoveryPersonPlaceLink;
export type DemoPerson = DiscoveryPerson;

export type DiscoveryResult =
  | { kind: 'place'; item: DemoPlace }
  | { kind: 'person'; item: DemoPerson };

export interface MobileDataSource {
  readonly name: string;
  places: readonly DemoPlace[];
  people: readonly DemoPerson[];
  search(query: string): DiscoveryResult[];
  placeById(id: string): DemoPlace | undefined;
  personById(id: string): DemoPerson | undefined;
}

const yorkMinster: DemoPlace = {
  id: 'york-minster',
  slug: 'york-minster',
  name: 'York Minster',
  placeType: PlaceType.Cathedral,
  category: 'religious',
  location: { label: 'York, North Yorkshire', latitude: 53.9625, longitude: -1.0819 },
  periodIds: ['medieval', 'victorian'],
  periodSummary: 'Medieval foundations · major rebuilding 1220–1472',
  designation: 'Grade I listed cathedral',
  description: 'A cathedral whose visible fabric records centuries of worship, rebuilding, craft and civic life in the heart of York.',
  source: 'Historic England · National Heritage List for England',
  sourceUrl: 'https://historicengland.org.uk/listing/the-list/list-entry/1257225',
  imageLabel: 'Rose window and west front',
  distanceMiles: 0.8,
  saved: true,
  visited: false,
  coverage: 'full',
  people: ['william-of-york'],
  relatedPlaces: ['fountains-abbey', 'cliffords-tower'],
};

const fountainsAbbey: DemoPlace = {
  id: 'fountains-abbey',
  slug: 'fountains-abbey',
  name: 'Fountains Abbey',
  placeType: PlaceType.Abbey,
  category: 'ruin',
  location: { label: 'Studley Royal, North Yorkshire', latitude: 54.1104, longitude: -1.5844 },
  periodIds: ['medieval', 'tudor'],
  periodSummary: 'Founded 1132 · dissolved 1539',
  designation: 'World Heritage Site',
  description: 'The remains of a Cistercian abbey within a designed landscape, where monastic, industrial and eighteenth-century histories overlap.',
  source: 'National Heritage List for England · UNESCO',
  imageLabel: 'Abbey nave and tower',
  distanceMiles: 24.5,
  saved: true,
  visited: true,
  coverage: 'full',
  people: ['william-of-york'],
  relatedPlaces: ['york-minster', 'middleham-castle'],
};

const middlehamCastle: DemoPlace = {
  id: 'middleham-castle',
  slug: 'middleham-castle',
  name: 'Middleham Castle',
  placeType: PlaceType.Castle,
  category: 'fortification',
  location: { label: 'Middleham, North Yorkshire', latitude: 54.2836, longitude: -1.8067 },
  periodIds: ['medieval', 'tudor'],
  periodSummary: 'Keep begun c. 1170 · expanded in the fourteenth century',
  designation: 'Scheduled Monument',
  description: 'A substantial medieval castle associated with the Neville family and the childhood of Richard III.',
  source: 'English Heritage · National Heritage List for England',
  imageLabel: 'Castle keep and gatehouse',
  distanceMiles: 41,
  saved: false,
  visited: false,
  coverage: 'full',
  people: ['richard-iii'],
  relatedPlaces: ['fountains-abbey'],
};

const cliffordsTower: DemoPlace = {
  id: 'cliffords-tower',
  slug: 'cliffords-tower',
  name: "Clifford's Tower",
  placeType: PlaceType.Ruin,
  category: 'fortification',
  location: { label: 'York, North Yorkshire', latitude: 53.9555, longitude: -1.0804 },
  periodIds: ['norman', 'medieval'],
  periodSummary: 'Norman motte-and-bailey castle · rebuilt 1190–1215',
  designation: 'Grade I listed · Scheduled Monument',
  description: 'The surviving keep of York Castle, rising above the city as a reminder of Norman power and later royal administration.',
  source: 'English Heritage · National Heritage List for England',
  imageLabel: 'Stone keep above York',
  distanceMiles: 1.1,
  saved: false,
  visited: false,
  coverage: 'full',
  people: ['william-the-conqueror'],
  relatedPlaces: ['york-minster', 'middleham-castle'],
};

const saltaire: DemoPlace = {
  id: 'saltaire',
  slug: 'saltaire',
  name: 'Saltaire World Heritage Site',
  placeType: PlaceType.HistoricVillage,
  category: 'industrial',
  location: { label: 'Shipley, West Yorkshire', latitude: 53.8391, longitude: -1.787 },
  periodIds: ['victorian'],
  periodSummary: 'Model village founded 1851 · mill opened 1853',
  designation: 'World Heritage Site',
  description: 'A planned nineteenth-century industrial settlement built around Titus Salt’s textile mill and workers’ community.',
  source: 'UNESCO · National Heritage List for England',
  imageLabel: 'Salts Mill and village streets',
  distanceMiles: 32,
  saved: false,
  visited: false,
  coverage: 'partial',
  people: ['titus-salt'],
  relatedPlaces: ['york-minster'],
};

const demoPlaces = [yorkMinster, fountainsAbbey, middlehamCastle, cliffordsTower, saltaire] as const;

const demoPeople: DemoPerson[] = [
  {
    id: 'william-of-york',
    slug: 'william-of-york',
    name: 'William of York',
    lifeDates: 'c. 1080–1154',
    role: 'Archbishop of York',
    description: 'A medieval archbishop connected to York’s ecclesiastical history and the early story of Fountains Abbey.',
    placeLinks: [
      { placeId: 'york-minster', predicate: RelationshipPredicate.BornAt, note: 'Archbishop of York, 1143–1147 and 1153–1154.' },
      { placeId: 'fountains-abbey', predicate: RelationshipPredicate.AssociatedWith, note: 'Contemporary ecclesiastical context.' },
    ],
    relatedPeople: [],
  },
  {
    id: 'richard-iii',
    slug: 'richard-iii',
    name: 'Richard III',
    lifeDates: '1452–1485',
    role: 'King of England',
    description: 'The last Plantagenet king, whose childhood and northern power base are closely associated with Middleham.',
    placeLinks: [
      { placeId: 'middleham-castle', predicate: RelationshipPredicate.LivedAt, note: 'Spent part of his childhood at Middleham.' },
    ],
    relatedPeople: [],
  },
  {
    id: 'william-the-conqueror',
    slug: 'william-the-conqueror',
    name: 'William I',
    lifeDates: 'c. 1028–1087',
    role: 'King of England',
    description: 'The Norman king whose castle-building programme reshaped the defensive and administrative landscape of England.',
    placeLinks: [
      { placeId: 'cliffords-tower', predicate: RelationshipPredicate.OwnedBy, note: 'York Castle was established during the Norman period.' },
    ],
    relatedPeople: [],
  },
  {
    id: 'titus-salt',
    slug: 'titus-salt',
    name: 'Sir Titus Salt',
    lifeDates: '1803–1876',
    role: 'Industrialist and reformer',
    description: 'The Victorian industrialist who founded Saltaire as a mill town with housing and civic institutions for its workers.',
    placeLinks: [
      { placeId: 'saltaire', predicate: RelationshipPredicate.OwnedBy, note: 'Founded the mill and model village in the nineteenth century.' },
    ],
    relatedPeople: [],
  },
];

export const developmentDataSource: MobileDataSource = {
  name: 'DEVELOPMENT_ONLY_FIXTURES',
  places: demoPlaces,
  people: demoPeople,
  search(query) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const places: DiscoveryResult[] = demoPlaces
      .filter((place) => `${place.name} ${place.location.label} ${place.designation ?? ''}`.toLocaleLowerCase().includes(needle))
      .map((item) => ({ kind: 'place', item }));
    const people: DiscoveryResult[] = demoPeople
      .filter((person) => `${person.name} ${person.role} ${person.lifeDates}`.toLocaleLowerCase().includes(needle))
      .map((item) => ({ kind: 'person', item }));
    return [...places, ...people];
  },
  placeById: (id) => demoPlaces.find((place) => place.id === id),
  personById: (id) => demoPeople.find((person) => person.id === id),
};

export function placesForCoverage(mode: CoverageMode): DemoPlace[] {
  if (mode === 'outside') return [];
  if (mode === 'nearby') return demoPlaces.filter((place) => place.coverage === 'full');
  return [...demoPlaces];
}

export function relationshipLabel(predicate: RelationshipPredicate): string {
  const labels: Record<RelationshipPredicate, string> = {
    owned: 'owned',
    lived_at: 'lived at',
    born_at: 'born at',
    died_at: 'died at',
    buried_at: 'buried at',
    participated_in: 'took part at',
    associated_with: 'associated with',
    built_by: 'was built by',
    owned_by: 'was owned by',
    site_of: 'is the site of',
    related_to: 'is related to',
    contains: 'contains',
    represented_by: 'is represented by',
    part_of: 'is a stop on',
    belongs_to: 'belongs to',
    discovered_at: 'was discovered at',
    held_at: 'is held at',
  };
  return labels[predicate];
}

export function categoryForPlace(place: DemoPlace) {
  return DISPLAY_CATEGORIES.find((category) => category.id === place.category) ?? DISPLAY_CATEGORIES[9];
}
