import { z } from 'zod';
import {
  AccessCost,
  EntityType,
  HistoricalPeriod,
  PlaceType,
  RouteType,
} from '@whilom/domain';

/** Turn a domain `const` object into a Zod enum of its values. */
const enumValues = <T extends Record<string, string>>(obj: T) =>
  z.enum(Object.values(obj) as [string, ...string[]]);

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
