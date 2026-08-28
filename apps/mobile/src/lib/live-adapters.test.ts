import { beforeEach, describe, expect, it } from 'vitest';
import type { HeritageClient } from '@whilom/database';
import {
  createLiveAuthAdapter,
  createLiveCommunityAdapter,
  createLiveTripAdapter,
} from './live-adapters';

type AnyRecord = Record<string, unknown>;
type FakeResult = { data: unknown; error: null };

interface RecordedCall {
  table: string;
  operation: string;
  payload?: unknown;
  filters: Array<{ field: string; operator: string; value: unknown }>;
}

class FakeQuery {
  private operation = 'select';
  private payload: unknown;
  private readonly filters: Array<{ field: string; operator: string; value: unknown }> = [];

  constructor(private readonly owner: FakeSupabaseClient, private readonly table: string) {}

  select(_columns = '*') { return this; }

  eq(field: string, value: unknown) { this.filters.push({ field, operator: 'eq', value }); return this; }

  in(field: string, value: unknown[]) { this.filters.push({ field, operator: 'in', value }); return this; }

  order(_field: string, _options?: unknown) { return this; }

  limit(_count: number) { return this; }

  insert(payload: unknown) { this.operation = 'insert'; this.payload = payload; return this; }

  upsert(payload: unknown, _options?: unknown) { this.operation = 'upsert'; this.payload = payload; return this; }

  update(payload: unknown) { this.operation = 'update'; this.payload = payload; return this; }

  delete() { this.operation = 'delete'; return this; }

  maybeSingle(): Promise<FakeResult> {
    this.record();
    const queue = this.owner.maybeSingleResponses[this.table] ?? [];
    const data = queue.length ? queue.shift() ?? null : null;
    return Promise.resolve({ data, error: null });
  }

  single(): Promise<FakeResult> {
    this.record();
    return Promise.resolve({ data: this.owner.singleResponse(this.table, this.payload), error: null });
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.record();
    return Promise.resolve({ data: this.owner.manyResponses[this.table] ?? null, error: null }).then(onfulfilled, onrejected);
  }

  private record() {
    this.owner.calls.push({ table: this.table, operation: this.operation, payload: this.payload, filters: [...this.filters] });
  }
}

class FakeSupabaseClient {
  readonly calls: RecordedCall[] = [];
  readonly authCalls: Array<{ method: string; input?: unknown }> = [];
  readonly maybeSingleResponses: Record<string, unknown[]> = {};
  readonly manyResponses: Record<string, unknown> = {};
  user: AnyRecord | null = { id: 'user-1', email: 'member@example.com', user_metadata: { display_name: 'A Member' } };

  readonly auth = {
    getUser: async () => ({ data: { user: this.user }, error: null }),
    signInWithPassword: async (input: unknown) => { this.authCalls.push({ method: 'signInWithPassword', input }); return { data: { user: this.user }, error: null }; },
    signUp: async (input: unknown) => { this.authCalls.push({ method: 'signUp', input }); return { data: { user: this.user }, error: null }; },
    signOut: async (input: unknown) => { this.authCalls.push({ method: 'signOut', input }); return { error: null }; },
  };

  from(table: string) { return new FakeQuery(this, table); }

  singleResponse(table: string, payload: unknown): unknown {
    if (table === 'wishlists') return { id: 'wishlist-1' };
    if (table === 'visits') return { id: 'visit-1', ...(payload as AnyRecord) };
    if (table === 'reviews') return { id: 'review-1', moderation_status: 'submitted', ...(payload as AnyRecord) };
    if (table === 'corrections') return { id: 'correction-1', status: 'submitted', ...(payload as AnyRecord) };
    if (table === 'trips') return { id: 'trip-1', user_id: 'user-1', ...(payload as AnyRecord) };
    if (table === 'trip_days') return { id: 'day-1', ...(payload as AnyRecord) };
    if (table === 'trip_stops') return { id: 'stop-1', ...(payload as AnyRecord) };
    return payload ?? {};
  }
}

function clientFrom(fake: FakeSupabaseClient): HeritageClient {
  return fake as unknown as HeritageClient;
}

describe('live Supabase adapters', () => {
  let fake: FakeSupabaseClient;

  beforeEach(() => { fake = new FakeSupabaseClient(); });

  it('uses the public auth methods and validates credentials before calling them', async () => {
    const adapter = createLiveAuthAdapter(clientFrom(fake));
    await adapter.signIn({ email: 'member@example.com', password: 'password123' });
    await adapter.signUp({ email: 'new@example.com', password: 'password123', displayName: 'New Member' });
    await adapter.signOut();

    expect(fake.authCalls.map((call) => call.method)).toEqual(['signInWithPassword', 'signUp', 'signOut']);
    expect(fake.authCalls[1]?.input).toEqual({ email: 'new@example.com', password: 'password123', options: { data: { display_name: 'New Member' } } });
    await expect(adapter.signIn({ email: 'not-an-email', password: 'short' })).rejects.toThrow();
    expect(fake.authCalls).toHaveLength(3);
  });

  it('creates the owned default wishlist and uses owner-scoped removal', async () => {
    fake.maybeSingleResponses.wishlists = [null];
    fake.manyResponses.wishlists = [{ id: 'wishlist-1' }];
    const adapter = createLiveCommunityAdapter(clientFrom(fake));
    await adapter.savePlace({ placeId: '00000000-0000-4000-8000-000000000101' });
    const wishlistInsert = fake.calls.find((call) => call.table === 'wishlists' && call.operation === 'insert');
    const itemUpsert = fake.calls.find((call) => call.table === 'wishlist_items' && call.operation === 'upsert');
    expect(wishlistInsert?.payload).toEqual({ user_id: 'user-1', kind: 'wishlist', name: 'Wishlist', is_public: false });
    expect(itemUpsert?.payload).toEqual({ wishlist_id: 'wishlist-1', place_id: '00000000-0000-4000-8000-000000000101' });

    await adapter.removePlace({ placeId: '00000000-0000-4000-8000-000000000101' });
    const remove = fake.calls.find((call) => call.table === 'wishlist_items' && call.operation === 'delete');
    expect(remove?.filters).toEqual(expect.arrayContaining([
      { field: 'wishlist_id', operator: 'in', value: ['wishlist-1'] },
      { field: 'place_id', operator: 'eq', value: '00000000-0000-4000-8000-000000000101' },
    ]));
  });

  it('applies the authenticated user to visits, reviews and insert-only corrections', async () => {
    const adapter = createLiveCommunityAdapter(clientFrom(fake));
    await adapter.createVisit({ placeId: '00000000-0000-4000-8000-000000000101', visitedOn: '2026-08-28', rating: 4, minutesSpent: 60, publicNote: 'A useful field note.' });
    fake.maybeSingleResponses.reviews = [{ id: 'review-old', moderation_status: 'submitted' }];
    await adapter.submitReview({ placeId: '00000000-0000-4000-8000-000000000101', rating: 5, body: 'Worth the walk.' });
    await adapter.submitCorrection({ entityType: 'place', entityId: '00000000-0000-4000-8000-000000000101', field: 'name', suggestedValue: 'Corrected name', note: 'Source-backed suggestion.' });

    const visit = fake.calls.find((call) => call.table === 'visits' && call.operation === 'insert');
    const review = fake.calls.find((call) => call.table === 'reviews' && call.operation === 'upsert');
    const correction = fake.calls.find((call) => call.table === 'corrections' && call.operation === 'insert');
    expect(visit?.payload).toMatchObject({ user_id: 'user-1', place_id: '00000000-0000-4000-8000-000000000101', is_public: false });
    expect(review?.payload).toMatchObject({ user_id: 'user-1', moderation_status: 'submitted' });
    expect(correction?.payload).toMatchObject({ user_id: 'user-1', status: 'submitted' });

    fake.maybeSingleResponses.reviews = [{ id: 'review-approved', moderation_status: 'approved' }];
    await expect(adapter.submitReview({ placeId: '00000000-0000-4000-8000-000000000101', rating: 5 })).rejects.toThrow('approved');
    expect(fake.calls.filter((call) => call.table === 'reviews' && call.operation === 'upsert')).toHaveLength(1);
  });

  it('keeps trip writes bounded and owner-scoped', async () => {
    const adapter = createLiveTripAdapter(clientFrom(fake));
    const tripId = '00000000-0000-4000-8000-000000002301';
    const trip = await adapter.createTrip({ name: 'York field day', transport: 'walking' });
    expect(trip).toMatchObject({ user_id: 'user-1', name: 'York field day', is_public: false });

    fake.maybeSingleResponses.trips = [{ id: tripId, user_id: 'user-1' }];
    await adapter.createTripDay({ tripId, dayIndex: 0, date: '2026-09-12' });
    const dayInsert = fake.calls.find((call) => call.table === 'trip_days' && call.operation === 'insert');
    expect(dayInsert?.payload).toEqual({ trip_id: tripId, day_index: 0, date: '2026-09-12', notes: null });

    fake.maybeSingleResponses.trips = [{ id: tripId, user_id: 'user-1' }];
    await adapter.addTripStop({ tripId, tripDayId: '00000000-0000-4000-8000-000000002401', placeId: '00000000-0000-4000-8000-000000000101', position: 0, plannedMinutes: 45, status: 'planned' });
    const stopInsert = fake.calls.find((call) => call.table === 'trip_stops' && call.operation === 'insert');
    expect(stopInsert?.payload).toMatchObject({ trip_id: tripId, trip_day_id: '00000000-0000-4000-8000-000000002401', place_id: '00000000-0000-4000-8000-000000000101', position: 0, status: 'planned' });
    expect(fake.calls.filter((call) => call.table === 'trips' && call.operation === 'select').length).toBeGreaterThanOrEqual(2);
  });
});
