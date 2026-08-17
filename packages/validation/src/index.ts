import { z } from 'zod';
import {
  AccessCost,
  DesignationGrade,
  DesignationType,
  EntityType,
  LocationMethod,
  HistoricalPeriod,
  PlaceType,
  RouteType,
} from '@whilom/domain';

/**
 * Turn a domain `const` object into a Zod enum of its values.
 *
 * The cast preserves the literal union rather than widening to `string`, so a
 * parsed `entityType` is `'place' | 'person' | …` and assigns directly to the
 * generated database enum. Widening here was silently costing type safety at
 * every call site that fed a parsed value into a Supabase insert.
 */
const enumValues = <T extends Record<string, string>>(obj: T) =>
  z.enum(Object.values(obj) as [T[keyof T], ...T[keyof T][]]);

/** A canonical entity id. */
export const uuidSchema = z.string().uuid();

/** A URL slug as generated for places/people/routes. */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated slug');

export const lngLatSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

/** Discovery / map search parameters (spec §9, §37). */
export const placeSearchSchema = z.object({
  text: z.string().trim().max(200).optional(),
  center: lngLatSchema.optional(),
  radiusMeters: z.number().positive().max(200_000).optional(),
  bbox: z
    .object({ sw: lngLatSchema, ne: lngLatSchema })
    .optional(),
  types: z.array(enumValues(PlaceType)).optional(),
  periods: z.array(enumValues(HistoricalPeriod)).optional(),
  cost: enumValues(AccessCost).optional(),
  visitableOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type PlaceSearchInput = z.infer<typeof placeSearchSchema>;

/** Community "suggest a missing place" submission (spec §16, §17). */
export const suggestPlaceSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: enumValues(PlaceType),
  location: lngLatSchema,
  note: z.string().trim().max(2000).optional(),
});
export type SuggestPlaceInput = z.infer<typeof suggestPlaceSchema>;

/** Review submission (spec §16). Opinion, kept distinct from historical fact. */
export const reviewSchema = z.object({
  placeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(5000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Record-a-visit (spec §16, §24). */
export const visitSchema = z.object({
  placeId: z.string().uuid(),
  visitedOn: z.string().date().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  minutesSpent: z.number().int().positive().max(24 * 60).optional(),
  /** Shown on the place page if the visit is made public. */
  publicNote: z.string().trim().max(5000).optional(),
  privateNote: z.string().trim().max(5000).optional(),
});
export type VisitInput = z.infer<typeof visitSchema>;

/** Add/remove a place on the signed-in user's wishlist (spec §16). */
export const wishlistItemSchema = z.object({
  placeId: z.string().uuid(),
  /** Slug of the page the mutation was issued from, used to revalidate it. */
  slug: slugSchema.optional(),
});
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;

/**
 * A suggested correction to an existing record (spec §17). Free-text only —
 * corrections are proposals for a moderator, never direct edits.
 */
export const correctionSchema = z
  .object({
    entityType: enumValues(EntityType),
    entityId: z.string().uuid(),
    field: z.string().trim().max(120).optional(),
    suggestedValue: z.string().trim().max(2000).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((c) => Boolean(c.suggestedValue || c.note), {
    message: 'give a suggested value or a note',
    path: ['note'],
  });
export type CorrectionInput = z.infer<typeof correctionSchema>;

/**
 * Account credentials. The length floor mirrors Supabase Auth's own minimum;
 * strength rules beyond that stay in Supabase so there is one authority.
 */
export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
});
export type CredentialsInput = z.infer<typeof credentialsSchema>;

export const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(80),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Relationship suggestion — a *historical claim*, requires strong moderation. */
export const relationshipSuggestionSchema = z.object({
  subjectType: enumValues(EntityType),
  subjectId: z.string().uuid(),
  predicate: z.string().min(1),
  objectType: enumValues(EntityType),
  objectId: z.string().uuid(),
  note: z.string().trim().max(2000).optional(),
  sourceUrl: z.string().url().optional(),
});
export type RelationshipSuggestionInput = z.infer<typeof relationshipSuggestionSchema>;

export const routeTypeSchema = enumValues(RouteType);

// --- Ingestion (spec §34, §35) ----------------------------------------------

/**
 * Provenance every imported record must carry. This schema is the enforcement
 * point for the rule that an imported fact never becomes indistinguishable from
 * an editorial one: a candidate that cannot say where it came from, when it was
 * retrieved, under what licence and by which importer run does not validate,
 * and therefore never reaches matching or publication.
 */
export const candidateProvenanceSchema = z.object({
  sourceId: z.string().trim().min(1).max(100),
  sourceRecordId: z.string().trim().min(1).max(200),
  originalUrl: z.string().url().optional(),
  licence: z.string().trim().min(1).max(100).optional(),
  attribution: z.string().trim().min(1).max(500).optional(),
  retrievedAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime().optional(),
  importerVersion: z.string().trim().min(1).max(50),
  importRunId: z.string().trim().min(1).max(100),
});
export type CandidateProvenanceInput = z.infer<typeof candidateProvenanceSchema>;

export const externalIdSchema = z.object({
  scheme: z.string().trim().min(1).max(50),
  value: z.string().trim().min(1).max(200),
});

export const candidateDesignationSchema = z.object({
  designation: enumValues(DesignationType),
  grade: enumValues(DesignationGrade).optional(),
  reference: z.string().trim().max(100).optional(),
  firstDesignated: z.string().datetime().optional(),
  url: z.string().url().optional(),
});

export const locationMethodSchema = enumValues(LocationMethod);

/**
 * The coordinate as published, plus how it was converted.
 *
 * `sourcePrecisionMeters` is what the source claimed; it is deliberately
 * separate from the candidate's own `locationAccuracyMeters`, because a source
 * asserting one-metre precision does not make it true.
 */
export const sourcePositionSchema = z.object({
  crs: z.string().trim().min(3).max(50),
  coordinates: z.record(z.string(), z.number()),
  conversion: z.string().trim().min(1).max(200),
  sourcePrecisionMeters: z.number().nonnegative().max(50_000).optional(),
  accuracyBasis: z.string().trim().min(1).max(500),
});

/** The normalised shape the VALIDATE stage checks, whatever the source. */
export const placeCandidateSchema = z.object({
  provenance: candidateProvenanceSchema,
  name: z.string().trim().min(2).max(500),
  altNames: z.array(z.string().trim().min(1).max(500)).max(20),
  placeType: enumValues(PlaceType),
  placeTypeConfidence: z.number().min(0).max(1),
  placeTypeRule: z.string().trim().min(1).max(100),
  rawType: z.string().trim().max(200).optional(),
  location: lngLatSchema,
  locationMethod: enumValues(LocationMethod),
  locationAccuracyMeters: z.number().nonnegative().max(50_000),
  sourcePosition: sourcePositionSchema.optional(),
  designations: z.array(candidateDesignationSchema).max(10),
  externalIds: z.array(externalIdSchema).min(1).max(20),
  town: z.string().trim().max(120).optional(),
  county: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(12).optional(),
  areaHectares: z.number().nonnegative().max(1_000_000).optional(),
  sourceNotes: z.string().trim().max(2000).optional(),
  /** Single named predicate; compared only against another inception year. */
  inceptionYear: z.number().int().min(-5000).max(2200).optional(),
  officialWebsite: z.string().url().max(2000).optional(),
  commonsCategory: z.string().trim().max(300).optional(),
  relatedPeople: z
    .array(z.object({ label: z.string().trim().min(1).max(200), role: z.string().trim().min(1).max(60) }))
    .max(50)
    .optional(),
  warnings: z.array(z.string()).max(50),
});
export type PlaceCandidateInput = z.infer<typeof placeCandidateSchema>;
