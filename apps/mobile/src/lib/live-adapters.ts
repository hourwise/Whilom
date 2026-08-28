import type { Database, HeritageClient } from '@whilom/database';
import {
  correctionSchema,
  credentialsSchema,
  reviewSchema,
  signUpSchema,
  tripDaySchema,
  tripSchema,
  tripStopSchema,
  tripStopUpdateSchema,
  tripUpdateSchema,
  visitSchema,
  wishlistItemSchema,
  type CorrectionInput,
  type CredentialsInput,
  type ReviewInput,
  type SignUpInput,
  type TripDayInput,
  type TripInput,
  type TripStopInput,
  type TripStopUpdateInput,
  type TripUpdateInput,
  type VisitInput,
  type WishlistItemInput,
} from '@whilom/validation';
import type { MobileSessionUser } from './session';

type WishlistItemRow = Database['public']['Tables']['wishlist_items']['Row'];
type VisitRow = Database['public']['Tables']['visits']['Row'];
type ReviewRow = Database['public']['Tables']['reviews']['Row'];
type CorrectionRow = Database['public']['Tables']['corrections']['Row'];
type TripRow = Database['public']['Tables']['trips']['Row'];
type TripDayRow = Database['public']['Tables']['trip_days']['Row'];
type TripStopRow = Database['public']['Tables']['trip_stops']['Row'];

function errorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message ?? fallback;
}

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(errorMessage(error, fallback));
}

function requiredData<T>(data: T | null | undefined, message: string): T {
  if (data == null) throw new Error(message);
  return data;
}

export function mobileUserFromSupabase(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): MobileSessionUser {
  const displayName = typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()
    ? user.user_metadata.display_name.trim()
    : user.email?.split('@')[0] ?? 'Whilom member';
  return { id: user.id, email: user.email ?? '', displayName };
}

export interface LiveAuthAdapter {
  getCurrentUser(): Promise<MobileSessionUser | null>;
  signIn(input: CredentialsInput): Promise<MobileSessionUser>;
  signUp(input: SignUpInput): Promise<MobileSessionUser | null>;
  signOut(): Promise<void>;
}

export function createLiveAuthAdapter(client: HeritageClient): LiveAuthAdapter {
  return {
    async getCurrentUser() {
      const { data, error } = await client.auth.getUser();
      throwIfError(error, 'The current user could not be read.');
      return data.user ? mobileUserFromSupabase(data.user) : null;
    },
    async signIn(input) {
      const parsed = credentialsSchema.parse(input);
      const { data, error } = await client.auth.signInWithPassword({ email: parsed.email, password: parsed.password });
      throwIfError(error, 'Sign-in failed.');
      if (!data.user) throw new Error('Sign-in returned no user.');
      return mobileUserFromSupabase(data.user);
    },
    async signUp(input) {
      const parsed = signUpSchema.parse(input);
      const { data, error } = await client.auth.signUp({ email: parsed.email, password: parsed.password, options: { data: { display_name: parsed.displayName } } });
      throwIfError(error, 'Account creation failed.');
      return data.user ? mobileUserFromSupabase(data.user) : null;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      throwIfError(error, 'Sign-out failed.');
    },
  };
}

async function currentUserId(client: HeritageClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  throwIfError(error, 'Authentication is required.');
  if (!data.user) throw new Error('Authentication is required.');
  return data.user.id;
}

export interface LiveCommunityAdapter {
  listSavedPlaceIds(): Promise<string[]>;
  savePlace(input: WishlistItemInput): Promise<void>;
  removePlace(input: WishlistItemInput): Promise<void>;
  listVisits(): Promise<VisitRow[]>;
  createVisit(input: VisitInput): Promise<VisitRow>;
  getOwnReview(placeId: string): Promise<ReviewRow | null>;
  listOwnReviews(): Promise<ReviewRow[]>;
  submitReview(input: ReviewInput): Promise<ReviewRow>;
  listOwnCorrections(): Promise<CorrectionRow[]>;
  submitCorrection(input: CorrectionInput): Promise<CorrectionRow>;
}

async function defaultWishlistId(client: HeritageClient, userId: string, create: boolean): Promise<string | null> {
  const existing = await client.from('wishlists').select('id').eq('user_id', userId).eq('kind', 'wishlist').order('created_at', { ascending: true }).limit(1).maybeSingle();
  throwIfError(existing.error, 'The default wishlist could not be read.');
  if (existing.data?.id) return existing.data.id;
  if (!create) return null;
  const created = await client.from('wishlists').insert({ user_id: userId, kind: 'wishlist', name: 'Wishlist', is_public: false }).select('id').single();
  throwIfError(created.error, 'The default wishlist could not be created.');
  if (!created.data?.id) throw new Error('The default wishlist returned no id.');
  return created.data.id;
}

export function createLiveCommunityAdapter(client: HeritageClient): LiveCommunityAdapter {
  return {
    async listSavedPlaceIds() {
      const userId = await currentUserId(client);
      const lists = await client.from('wishlists').select('id').eq('user_id', userId).limit(20);
      throwIfError(lists.error, 'Saved lists could not be read.');
      const wishlistIds = (lists.data ?? []).map((list) => list.id);
      if (!wishlistIds.length) return [];
      const items = await client.from('wishlist_items').select('place_id').in('wishlist_id', wishlistIds).limit(500);
      throwIfError(items.error, 'Saved places could not be read.');
      return [...new Set((items.data ?? []).map((item) => item.place_id))];
    },
    async savePlace(input) {
      const parsed = wishlistItemSchema.parse(input);
      const userId = await currentUserId(client);
      const wishlistId = await defaultWishlistId(client, userId, true);
      if (!wishlistId) throw new Error('A default wishlist is required.');
      const result = await client.from('wishlist_items').upsert({ wishlist_id: wishlistId, place_id: parsed.placeId }, { onConflict: 'wishlist_id,place_id' });
      throwIfError(result.error, 'The place could not be saved.');
    },
    async removePlace(input) {
      const parsed = wishlistItemSchema.parse(input);
      const userId = await currentUserId(client);
      const lists = await client.from('wishlists').select('id').eq('user_id', userId).limit(20);
      throwIfError(lists.error, 'Saved lists could not be read.');
      const wishlistIds = (lists.data ?? []).map((list) => list.id);
      if (!wishlistIds.length) return;
      const result = await client.from('wishlist_items').delete().in('wishlist_id', wishlistIds).eq('place_id', parsed.placeId);
      throwIfError(result.error, 'The saved place could not be removed.');
    },
    async listVisits() {
      const userId = await currentUserId(client);
      const result = await client.from('visits').select('*').eq('user_id', userId).order('visited_on', { ascending: false }).limit(200);
      throwIfError(result.error, 'Visits could not be read.');
      return result.data ?? [];
    },
    async createVisit(input) {
      const parsed = visitSchema.parse(input);
      const userId = await currentUserId(client);
      const result = await client.from('visits').insert({ user_id: userId, place_id: parsed.placeId, visited_on: parsed.visitedOn ?? null, rating: parsed.rating ?? null, minutes_spent: parsed.minutesSpent ?? null, public_note: parsed.publicNote ?? null, private_note: parsed.privateNote ?? null, is_public: false }).select('*').single();
      throwIfError(result.error, 'The visit could not be recorded.');
      return requiredData(result.data, 'The visit could not be recorded.');
    },
    async getOwnReview(placeId) {
      const userId = await currentUserId(client);
      const result = await client.from('reviews').select('*').eq('user_id', userId).eq('place_id', placeId).maybeSingle();
      throwIfError(result.error, 'The review could not be read.');
      return result.data;
    },
    async listOwnReviews() {
      const userId = await currentUserId(client);
      const result = await client.from('reviews').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200);
      throwIfError(result.error, 'Reviews could not be read.');
      return result.data ?? [];
    },
    async submitReview(input) {
      const parsed = reviewSchema.parse(input);
      const userId = await currentUserId(client);
      const existing = await client.from('reviews').select('*').eq('user_id', userId).eq('place_id', parsed.placeId).maybeSingle();
      throwIfError(existing.error, 'The existing review could not be read.');
      if (existing.data?.moderation_status === 'approved') throw new Error('This review is approved and cannot be edited by the ordinary account path.');
      const result = await client.from('reviews').upsert({ place_id: parsed.placeId, user_id: userId, rating: parsed.rating, body: parsed.body ?? null, moderation_status: existing.data?.moderation_status ?? 'submitted' }, { onConflict: 'place_id,user_id' }).select('*').single();
      throwIfError(result.error, 'The review could not be submitted.');
      return requiredData(result.data, 'The review could not be submitted.');
    },
    async listOwnCorrections() {
      const userId = await currentUserId(client);
      const result = await client.from('corrections').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
      throwIfError(result.error, 'Corrections could not be read.');
      return result.data ?? [];
    },
    async submitCorrection(input) {
      const parsed = correctionSchema.parse(input);
      const userId = await currentUserId(client);
      const result = await client.from('corrections').insert({ user_id: userId, entity_type: parsed.entityType, entity_id: parsed.entityId, field: parsed.field ?? null, suggested_value: parsed.suggestedValue ?? null, note: parsed.note ?? null, status: 'submitted' }).select('*').single();
      throwIfError(result.error, 'The correction could not be submitted.');
      return requiredData(result.data, 'The correction could not be submitted.');
    },
  };
}

export interface LiveTripAdapter {
  listTrips(): Promise<TripRow[]>;
  getTripDetail(tripId: string): Promise<{ trip: TripRow; days: TripDayRow[]; stops: TripStopRow[] } | null>;
  createTrip(input: TripInput): Promise<TripRow>;
  updateTrip(tripId: string, input: TripUpdateInput): Promise<TripRow>;
  createTripDay(input: TripDayInput): Promise<TripDayRow>;
  addTripStop(input: TripStopInput): Promise<TripStopRow>;
  updateTripStop(stopId: string, input: TripStopUpdateInput): Promise<TripStopRow>;
  removeTripStop(stopId: string): Promise<void>;
  reorderTripStops(tripId: string, stopIds: string[]): Promise<void>;
}

async function ownedTrip(client: HeritageClient, userId: string, tripId: string): Promise<TripRow> {
  const result = await client.from('trips').select('*').eq('id', tripId).eq('user_id', userId).maybeSingle();
  throwIfError(result.error, 'The trip could not be read.');
  if (!result.data) throw new Error('The trip is not owned by the current user.');
  return result.data;
}

async function ownedStop(client: HeritageClient, userId: string, stopId: string): Promise<TripStopRow> {
  const result = await client.from('trip_stops').select('*').eq('id', stopId).maybeSingle();
  throwIfError(result.error, 'The trip stop could not be read.');
  if (!result.data) throw new Error('The trip stop could not be found.');
  await ownedTrip(client, userId, result.data.trip_id);
  return result.data;
}

export function createLiveTripAdapter(client: HeritageClient): LiveTripAdapter {
  return {
    async listTrips() {
      const userId = await currentUserId(client);
      const result = await client.from('trips').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(100);
      throwIfError(result.error, 'Trips could not be read.');
      return result.data ?? [];
    },
    async getTripDetail(tripId) {
      const userId = await currentUserId(client);
      const trip = await client.from('trips').select('*').eq('id', tripId).eq('user_id', userId).maybeSingle();
      throwIfError(trip.error, 'The trip could not be read.');
      if (!trip.data) return null;
      const [days, stops] = await Promise.all([
        client.from('trip_days').select('*').eq('trip_id', tripId).order('day_index').limit(366),
        client.from('trip_stops').select('*').eq('trip_id', tripId).order('position').limit(500),
      ]);
      throwIfError(days.error, 'Trip days could not be read.');
      throwIfError(stops.error, 'Trip stops could not be read.');
      return { trip: trip.data, days: days.data ?? [], stops: stops.data ?? [] };
    },
    async createTrip(input) {
      const parsed = tripSchema.parse(input);
      const userId = await currentUserId(client);
      const result = await client.from('trips').insert({ user_id: userId, name: parsed.name, start_date: parsed.startDate ?? null, end_date: parsed.endDate ?? null, transport: parsed.transport ?? null, max_radius_m: parsed.maxRadiusM ?? null, notes: parsed.notes ?? null, is_public: parsed.isPublic ?? false }).select('*').single();
      throwIfError(result.error, 'The trip could not be created.');
      return requiredData(result.data, 'The trip could not be created.');
    },
    async updateTrip(tripId, input) {
      const parsed = tripUpdateSchema.parse(input);
      const userId = await currentUserId(client);
      await ownedTrip(client, userId, tripId);
      const result = await client.from('trips').update({ ...(parsed.name === undefined ? {} : { name: parsed.name }), ...(parsed.startDate === undefined ? {} : { start_date: parsed.startDate ?? null }), ...(parsed.endDate === undefined ? {} : { end_date: parsed.endDate ?? null }), ...(parsed.transport === undefined ? {} : { transport: parsed.transport ?? null }), ...(parsed.maxRadiusM === undefined ? {} : { max_radius_m: parsed.maxRadiusM ?? null }), ...(parsed.notes === undefined ? {} : { notes: parsed.notes ?? null }), ...(parsed.isPublic === undefined ? {} : { is_public: parsed.isPublic }) }).eq('id', tripId).eq('user_id', userId).select('*').single();
      throwIfError(result.error, 'The trip could not be updated.');
      return requiredData(result.data, 'The trip could not be updated.');
    },
    async createTripDay(input) {
      const parsed = tripDaySchema.parse(input);
      const userId = await currentUserId(client);
      await ownedTrip(client, userId, parsed.tripId);
      const result = await client.from('trip_days').insert({ trip_id: parsed.tripId, day_index: parsed.dayIndex, date: parsed.date ?? null, notes: parsed.notes ?? null }).select('*').single();
      throwIfError(result.error, 'The trip day could not be created.');
      return requiredData(result.data, 'The trip day could not be created.');
    },
    async addTripStop(input) {
      const parsed = tripStopSchema.parse(input);
      const userId = await currentUserId(client);
      await ownedTrip(client, userId, parsed.tripId);
      const result = await client.from('trip_stops').insert({ trip_id: parsed.tripId, trip_day_id: parsed.tripDayId ?? null, place_id: parsed.placeId, position: parsed.position, planned_minutes: parsed.plannedMinutes ?? null, status: parsed.status, notes: parsed.notes ?? null }).select('*').single();
      throwIfError(result.error, 'The place could not be added to the trip.');
      return requiredData(result.data, 'The place could not be added to the trip.');
    },
    async updateTripStop(stopId, input) {
      const parsed = tripStopUpdateSchema.parse(input);
      const userId = await currentUserId(client);
      await ownedStop(client, userId, stopId);
      const result = await client.from('trip_stops').update({ ...(parsed.tripDayId === undefined ? {} : { trip_day_id: parsed.tripDayId ?? null }), ...(parsed.position === undefined ? {} : { position: parsed.position }), ...(parsed.plannedMinutes === undefined ? {} : { planned_minutes: parsed.plannedMinutes ?? null }), ...(parsed.status === undefined ? {} : { status: parsed.status }), ...(parsed.notes === undefined ? {} : { notes: parsed.notes ?? null }) }).eq('id', stopId).select('*').single();
      throwIfError(result.error, 'The trip stop could not be updated.');
      return requiredData(result.data, 'The trip stop could not be updated.');
    },
    async removeTripStop(stopId) {
      const userId = await currentUserId(client);
      await ownedStop(client, userId, stopId);
      const result = await client.from('trip_stops').delete().eq('id', stopId);
      throwIfError(result.error, 'The trip stop could not be removed.');
    },
    async reorderTripStops(tripId, stopIds) {
      const userId = await currentUserId(client);
      await ownedTrip(client, userId, tripId);
      for (const [position, stopId] of stopIds.entries()) {
        const result = await client.from('trip_stops').update({ position }).eq('id', stopId).eq('trip_id', tripId);
        throwIfError(result.error, 'The trip stops could not be reordered.');
      }
    },
  };
}
