import type { EntityType } from './enums';

/**
 * The relationship graph (spec §5).
 *
 * Relationships are stored in a single flexible `entity_relationships` table so
 * new predicates never require a schema migration. Each predicate declares the
 * entity types it connects, which lets the admin UI and validation layer offer
 * only sensible options.
 */
export const RelationshipPredicate = {
  // Person → *
  Owned: 'owned',
  LivedAt: 'lived_at',
  BornAt: 'born_at',
  DiedAt: 'died_at',
  BuriedAt: 'buried_at',
  ParticipatedIn: 'participated_in',
  AssociatedWith: 'associated_with',
  // Place → *
  BuiltBy: 'built_by',
  OwnedBy: 'owned_by',
  SiteOf: 'site_of',
  RelatedTo: 'related_to',
  Contains: 'contains',
  RepresentedBy: 'represented_by',
  PartOf: 'part_of',
  BelongsTo: 'belongs_to',
  // Object → *
  DiscoveredAt: 'discovered_at',
  HeldAt: 'held_at',
} as const;
export type RelationshipPredicate =
  (typeof RelationshipPredicate)[keyof typeof RelationshipPredicate];

/** Declares which entity types a predicate may connect (subject → object). */
export interface PredicateSchema {
  predicate: RelationshipPredicate;
  subjectTypes: EntityType[];
  objectTypes: EntityType[];
  /** Human label for editorial UIs, e.g. "was built by". */
  label: string;
  /** Optional inverse label for rendering the reverse direction. */
  inverseLabel?: string;
}

/**
 * Every relationship carries provenance and editorial state (spec §5).
 * This is the shared shape; the persisted row lives in `entity_relationships`.
 */
export interface EntityRelationship {
  id: string;
  subjectType: EntityType;
  subjectId: string;
  predicate: RelationshipPredicate;
  objectType: EntityType;
  objectId: string;
  /** Explanatory editorial text. */
  note?: string;
  /** Relevant date or date range (ISO 8601). */
  dateStart?: string;
  dateEnd?: string;
  /** FK to `sources`. */
  sourceId?: string;
  /** Editorial confidence, 0–1. */
  confidence?: number;
  verified: boolean;
}

/** The canonical predicate registry (spec §5 graph, made explicit). */
export const PREDICATE_SCHEMAS: readonly PredicateSchema[] = [
  { predicate: RelationshipPredicate.Owned, subjectTypes: ['person'], objectTypes: ['place'], label: 'owned', inverseLabel: 'was owned by' },
  { predicate: RelationshipPredicate.LivedAt, subjectTypes: ['person'], objectTypes: ['place'], label: 'lived at', inverseLabel: 'was home to' },
  { predicate: RelationshipPredicate.BornAt, subjectTypes: ['person'], objectTypes: ['place'], label: 'was born at', inverseLabel: 'birthplace of' },
  { predicate: RelationshipPredicate.DiedAt, subjectTypes: ['person'], objectTypes: ['place'], label: 'died at', inverseLabel: 'place of death of' },
  { predicate: RelationshipPredicate.BuriedAt, subjectTypes: ['person'], objectTypes: ['place'], label: 'is buried at', inverseLabel: 'burial place of' },
  { predicate: RelationshipPredicate.ParticipatedIn, subjectTypes: ['person'], objectTypes: ['event'], label: 'participated in', inverseLabel: 'involved' },
  { predicate: RelationshipPredicate.BuiltBy, subjectTypes: ['place'], objectTypes: ['person'], label: 'was built by', inverseLabel: 'built' },
  { predicate: RelationshipPredicate.SiteOf, subjectTypes: ['place'], objectTypes: ['event'], label: 'is the site of', inverseLabel: 'took place at' },
  { predicate: RelationshipPredicate.RelatedTo, subjectTypes: ['place'], objectTypes: ['place'], label: 'is related to' },
  { predicate: RelationshipPredicate.Contains, subjectTypes: ['place'], objectTypes: ['object'], label: 'contains', inverseLabel: 'is located at' },
  { predicate: RelationshipPredicate.RepresentedBy, subjectTypes: ['place', 'person', 'event'], objectTypes: ['object'], label: 'is represented by', inverseLabel: 'depicts' },
  { predicate: RelationshipPredicate.PartOf, subjectTypes: ['place'], objectTypes: ['route'], label: 'is a stop on', inverseLabel: 'includes' },
  { predicate: RelationshipPredicate.BelongsTo, subjectTypes: ['place', 'person', 'event', 'object', 'route'], objectTypes: ['collection'], label: 'belongs to', inverseLabel: 'features' },
  { predicate: RelationshipPredicate.DiscoveredAt, subjectTypes: ['object'], objectTypes: ['place'], label: 'was discovered at', inverseLabel: 'is the find spot of' },
  { predicate: RelationshipPredicate.AssociatedWith, subjectTypes: ['person', 'object', 'event'], objectTypes: ['person', 'object', 'event', 'place'], label: 'is associated with' },
  { predicate: RelationshipPredicate.HeldAt, subjectTypes: ['object'], objectTypes: ['place'], label: 'is held at', inverseLabel: 'holds' },
];
