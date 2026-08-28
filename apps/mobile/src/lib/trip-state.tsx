import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import {
  tripDaySchema,
  tripSchema,
  tripStopSchema,
  tripStopUpdateSchema,
  tripUpdateSchema,
  type TripDayInput,
  type TripInput,
  type TripStopInput,
  type TripStopUpdateInput,
  type TripUpdateInput,
} from '@whilom/validation';
import { actionError, type ActionState } from './action-state';
import { mutationPlaceId } from './behaviour';
import { getMobileRuntimePolicy } from './runtime';
import { useMobileSession } from './session';

export type MobileTripStopStatus = 'planned' | 'completed' | 'skipped';

export interface MobileTrip {
  id: string;
  userId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  transport: TripInput['transport'] | null;
  maxRadiusM: number | null;
  notes: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MobileTripDay {
  id: string;
  tripId: string;
  dayIndex: number;
  date: string | null;
  notes: string | null;
}

export interface MobileTripStop {
  id: string;
  tripId: string;
  tripDayId: string | null;
  placeId: string;
  position: number;
  plannedMinutes: number | null;
  status: MobileTripStopStatus;
  notes: string | null;
  createdAt: string;
}

export interface MobileTripDetail {
  trip: MobileTrip;
  days: readonly MobileTripDay[];
  stops: readonly MobileTripStop[];
}

export type MobileTripStopDraft = Omit<TripStopInput, 'tripId' | 'placeId'> & { tripId: string; placeId: string };
export type MobileTripDayDraft = Omit<TripDayInput, 'tripId'> & { tripId: string };

interface MobileTripContextValue {
  trips: readonly MobileTrip[];
  getTrip(id: string): MobileTripDetail | null;
  createTrip(input: TripInput): Promise<ActionState<MobileTrip>>;
  updateTrip(tripId: string, input: TripUpdateInput): Promise<ActionState<MobileTrip>>;
  createDay(input: MobileTripDayDraft): Promise<ActionState<MobileTripDay>>;
  addStop(input: MobileTripStopDraft): Promise<ActionState<MobileTripStop>>;
  updateStop(stopId: string, input: TripStopUpdateInput): Promise<ActionState<MobileTripStop>>;
  removeStop(stopId: string): Promise<ActionState>;
  reorderStops(tripId: string, stopIds: string[]): Promise<ActionState>;
  setStopStatus(stopId: string, status: MobileTripStopStatus): Promise<ActionState<MobileTripStop>>;
}

const fixtureTripId = '00000000-0000-4000-8000-000000002001';
const fixtureDayId = '00000000-0000-4000-8000-000000002101';
const fixtureStopIds = ['00000000-0000-4000-8000-000000002201', '00000000-0000-4000-8000-000000002202'];
let fixtureSequence = 2300;

function nextFixtureId(): string {
  fixtureSequence += 1;
  return `00000000-0000-4000-8000-${String(fixtureSequence).padStart(12, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

const fixtureTrip: MobileTrip = {
  id: fixtureTripId,
  userId: '00000000-0000-4000-8000-000000000001',
  name: 'A first day in York',
  startDate: '2026-09-12',
  endDate: '2026-09-12',
  transport: 'walking',
  maxRadiusM: 5000,
  notes: 'A compact day between sacred and civic power.',
  isPublic: false,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const fixtureTripDay: MobileTripDay = {
  id: fixtureDayId,
  tripId: fixtureTripId,
  dayIndex: 0,
  date: '2026-09-12',
  notes: 'Start near the Minster and finish by the river.',
};

const fixtureStops: MobileTripStop[] = [
  {
    id: fixtureStopIds[0],
    tripId: fixtureTripId,
    tripDayId: fixtureDayId,
    placeId: 'york-minster',
    position: 0,
    plannedMinutes: 90,
    status: 'planned',
    notes: null,
    createdAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: fixtureStopIds[1],
    tripId: fixtureTripId,
    tripDayId: fixtureDayId,
    placeId: 'cliffords-tower',
    position: 1,
    plannedMinutes: 45,
    status: 'planned',
    notes: null,
    createdAt: '2026-08-20T10:00:00.000Z',
  },
];

export function fixtureTrips(): { trips: MobileTrip[]; days: MobileTripDay[]; stops: MobileTripStop[] } {
  return { trips: [fixtureTrip], days: [fixtureTripDay], stops: [...fixtureStops] };
}

export function reorderTripStops(stops: readonly MobileTripStop[], stopIds: readonly string[]): MobileTripStop[] {
  const known = new Map(stops.map((stop) => [stop.id, stop]));
  const requested = stopIds.flatMap((id) => {
    const stop = known.get(id);
    return stop ? [stop] : [];
  });
  const included = new Set(requested.map((stop) => stop.id));
  const remainder = stops.filter((stop) => !included.has(stop.id));
  return [...requested, ...remainder].map((stop, position) => ({ ...stop, position }));
}

function requireSignedIn(status: string): ActionState {
  return status === 'signed_in' ? { status: 'submitting' } : { status: 'error', error: 'Sign in to plan a trip.' };
}

function unavailable(policyReason?: string): ActionState {
  return { status: 'error', error: policyReason ?? 'Trip changes are unavailable in this runtime.' };
}

const TripContext = createContext<MobileTripContextValue | null>(null);

/**
 * Fixture trip state is deliberately ephemeral. The shape mirrors the later
 * RLS-governed trip adapter without introducing native storage or live writes.
 */
export function MobileTripProvider({ children }: { children: ReactNode }) {
  const { state: session } = useMobileSession();
  const policy = getMobileRuntimePolicy();
  const seeded = useMemo(() => policy.fixtureAllowed ? fixtureTrips() : { trips: [], days: [], stops: [] }, [policy.fixtureAllowed]);
  const [trips, setTrips] = useState<MobileTrip[]>(seeded.trips);
  const [days, setDays] = useState<MobileTripDay[]>(seeded.days);
  const [stops, setStops] = useState<MobileTripStop[]>(seeded.stops);

  const getTrip = useCallback((id: string): MobileTripDetail | null => {
    const trip = trips.find((item) => item.id === id);
    if (!trip) return null;
    return {
      trip,
      days: days.filter((day) => day.tripId === id).sort((a, b) => a.dayIndex - b.dayIndex),
      stops: stops.filter((stop) => stop.tripId === id).sort((a, b) => a.position - b.position),
    };
  }, [days, stops, trips]);

  const canMutate = useCallback((): ActionState => {
    const signedIn = requireSignedIn(session.status);
    if (signedIn.status === 'error') return signedIn;
    if (!policy.fixtureAllowed || !policy.liveWritesAllowed) return unavailable(policy.reason ?? 'Live trip writes are disabled for this release-safe phase.');
    return signedIn;
  }, [policy.fixtureAllowed, policy.liveWritesAllowed, policy.reason, session.status]);

  const createTrip = useCallback(async (input: TripInput): Promise<ActionState<MobileTrip>> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted as ActionState<MobileTrip>;
    try {
      const parsed = tripSchema.parse(input);
      const timestamp = now();
      const trip: MobileTrip = { id: nextFixtureId(), userId: session.user?.id ?? fixtureTrip.userId, name: parsed.name, startDate: parsed.startDate ?? null, endDate: parsed.endDate ?? null, transport: parsed.transport ?? null, maxRadiusM: parsed.maxRadiusM ?? null, notes: parsed.notes ?? null, isPublic: parsed.isPublic ?? false, createdAt: timestamp, updatedAt: timestamp };
      setTrips((current) => [trip, ...current]);
      return { status: 'success', data: trip };
    } catch (error) {
      return actionError(error, 'The trip could not be created.') as ActionState<MobileTrip>;
    }
  }, [canMutate, session.user?.id]);

  const updateTrip = useCallback(async (tripId: string, input: TripUpdateInput): Promise<ActionState<MobileTrip>> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted as ActionState<MobileTrip>;
    try {
      const parsed = tripUpdateSchema.parse(input);
      const current = trips.find((trip) => trip.id === tripId);
      if (!current) throw new Error('The trip could not be found.');
      const updated: MobileTrip = { ...current, ...(parsed.name === undefined ? {} : { name: parsed.name }), ...(parsed.startDate === undefined ? {} : { startDate: parsed.startDate ?? null }), ...(parsed.endDate === undefined ? {} : { endDate: parsed.endDate ?? null }), ...(parsed.transport === undefined ? {} : { transport: parsed.transport ?? null }), ...(parsed.maxRadiusM === undefined ? {} : { maxRadiusM: parsed.maxRadiusM ?? null }), ...(parsed.notes === undefined ? {} : { notes: parsed.notes ?? null }), ...(parsed.isPublic === undefined ? {} : { isPublic: parsed.isPublic }), updatedAt: now() };
      setTrips((currentTrips) => currentTrips.map((trip) => trip.id === tripId ? updated : trip));
      return { status: 'success', data: updated };
    } catch (error) {
      return actionError(error, 'The trip could not be updated.') as ActionState<MobileTrip>;
    }
  }, [canMutate, trips]);

  const createDay = useCallback(async (input: MobileTripDayDraft): Promise<ActionState<MobileTripDay>> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted as ActionState<MobileTripDay>;
    try {
      const parsed = tripDaySchema.parse(input);
      if (!trips.some((trip) => trip.id === parsed.tripId)) throw new Error('The trip could not be found.');
      const day: MobileTripDay = { id: nextFixtureId(), tripId: parsed.tripId, dayIndex: parsed.dayIndex, date: parsed.date ?? null, notes: parsed.notes ?? null };
      setDays((current) => [...current, day]);
      return { status: 'success', data: day };
    } catch (error) {
      return actionError(error, 'The trip day could not be created.') as ActionState<MobileTripDay>;
    }
  }, [canMutate, trips]);

  const addStop = useCallback(async (input: MobileTripStopDraft): Promise<ActionState<MobileTripStop>> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted as ActionState<MobileTripStop>;
    try {
      const parsed = tripStopSchema.parse({ ...input, tripId: input.tripId, placeId: mutationPlaceId(input.placeId) });
      if (!trips.some((trip) => trip.id === parsed.tripId)) throw new Error('The trip could not be found.');
      const stop: MobileTripStop = { id: nextFixtureId(), tripId: parsed.tripId, tripDayId: parsed.tripDayId ?? null, placeId: input.placeId, position: parsed.position, plannedMinutes: parsed.plannedMinutes ?? null, status: parsed.status, notes: parsed.notes ?? null, createdAt: now() };
      setStops((current) => [...current, stop]);
      return { status: 'success', data: stop };
    } catch (error) {
      return actionError(error, 'The place could not be added to the trip.') as ActionState<MobileTripStop>;
    }
  }, [canMutate, trips]);

  const updateStop = useCallback(async (stopId: string, input: TripStopUpdateInput): Promise<ActionState<MobileTripStop>> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted as ActionState<MobileTripStop>;
    try {
      const parsed = tripStopUpdateSchema.parse(input);
      const current = stops.find((stop) => stop.id === stopId);
      if (!current) throw new Error('The trip stop could not be found.');
      const updated: MobileTripStop = { ...current, ...(parsed.tripDayId === undefined ? {} : { tripDayId: parsed.tripDayId ?? null }), ...(parsed.position === undefined ? {} : { position: parsed.position }), ...(parsed.plannedMinutes === undefined ? {} : { plannedMinutes: parsed.plannedMinutes ?? null }), ...(parsed.status === undefined ? {} : { status: parsed.status }), ...(parsed.notes === undefined ? {} : { notes: parsed.notes ?? null }) };
      setStops((currentStops) => currentStops.map((stop) => stop.id === stopId ? updated : stop));
      return { status: 'success', data: updated };
    } catch (error) {
      return actionError(error, 'The trip stop could not be updated.') as ActionState<MobileTripStop>;
    }
  }, [canMutate, stops]);

  const removeStop = useCallback(async (stopId: string): Promise<ActionState> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted;
    if (!stops.some((stop) => stop.id === stopId)) return { status: 'error', error: 'The trip stop could not be found.' };
    setStops((current) => current.filter((stop) => stop.id !== stopId));
    return { status: 'success' };
  }, [canMutate, stops]);

  const reorderStops = useCallback(async (tripId: string, stopIds: string[]): Promise<ActionState> => {
    const permitted = canMutate();
    if (permitted.status === 'error') return permitted;
    if (!trips.some((trip) => trip.id === tripId)) return { status: 'error', error: 'The trip could not be found.' };
    const tripStops = stops.filter((stop) => stop.tripId === tripId);
    setStops((current) => [...current.filter((stop) => stop.tripId !== tripId), ...reorderTripStops(tripStops, stopIds)]);
    return { status: 'success' };
  }, [canMutate, stops, trips]);

  const setStopStatus = useCallback((stopId: string, status: MobileTripStopStatus) => updateStop(stopId, { status }), [updateStop]);

  const value = useMemo<MobileTripContextValue>(() => ({ trips, getTrip, createTrip, updateTrip, createDay, addStop, updateStop, removeStop, reorderStops, setStopStatus }), [addStop, createDay, createTrip, getTrip, removeStop, reorderStops, setStopStatus, trips, updateStop, updateTrip]);
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useMobileTrips(): MobileTripContextValue {
  const value = useContext(TripContext);
  if (!value) throw new Error('useMobileTrips must be used inside MobileTripProvider');
  return value;
}
