import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { correctionSchema, reviewSchema, visitSchema, wishlistItemSchema, type CorrectionInput, type ReviewInput, type VisitInput } from '@whilom/validation';
import { developmentDataSource } from './fixtures';
import { actionError, idleAction, type ActionState } from './action-state';
import { getMobileRuntimePolicy } from './runtime';
import { useMobileSession } from './session';

export const FIXTURE_PLACE_UUIDS: Readonly<Record<string, string>> = {
  'york-minster': '00000000-0000-4000-8000-000000000101',
  'fountains-abbey': '00000000-0000-4000-8000-000000000102',
  'middleham-castle': '00000000-0000-4000-8000-000000000103',
  'cliffords-tower': '00000000-0000-4000-8000-000000000104',
  saltaire: '00000000-0000-4000-8000-000000000105',
};

export type MobileVisitDraft = Omit<VisitInput, 'placeId'> & { placeId: string };
export type MobileReviewDraft = Omit<ReviewInput, 'placeId'> & { placeId: string };
export type MobileCorrectionDraft = Omit<CorrectionInput, 'entityId'> & { entityId: string };

export interface FixtureVisit extends MobileVisitDraft {
  id: string;
  createdAt: string;
  placeName?: string;
}

export interface FixtureReview extends MobileReviewDraft {
  id: string;
  moderationStatus: 'submitted';
  createdAt: string;
}

export interface FixtureCorrection extends MobileCorrectionDraft {
  id: string;
  status: 'submitted';
  createdAt: string;
}

export interface MobileBehaviourContextValue {
  isSaved(id: string, fallback?: boolean): boolean;
  isVisited(id: string, fallback?: boolean): boolean;
  isSaving(id: string): boolean;
  isVisiting(id: string): boolean;
  toggleSaved(id: string, fallback?: boolean): Promise<ActionState>;
  toggleVisited(id: string, fallback?: boolean): Promise<ActionState>;
  savePlace(id: string, fallback?: boolean): Promise<ActionState>;
  recordVisit(input: MobileVisitDraft): Promise<ActionState<FixtureVisit>>;
  submitReview(input: MobileReviewDraft): Promise<ActionState<FixtureReview>>;
  submitCorrection(input: MobileCorrectionDraft): Promise<ActionState<FixtureCorrection>>;
  visits: readonly FixtureVisit[];
  reviews: readonly FixtureReview[];
  corrections: readonly FixtureCorrection[];
  savedPlaceIds: readonly string[];
  reviewsForPlace(placeId: string): readonly FixtureReview[];
}

const FIXTURE_USER_REQUIRED = 'Sign in to save places, record visits, and contribute notes.';
const LIVE_WRITE_BLOCKED = 'Live writes are intentionally disabled in this remote slice. Fixture mode is the safe development path.';

function mutationPlaceId(id: string): string {
  if (id in FIXTURE_PLACE_UUIDS) return FIXTURE_PLACE_UUIDS[id];
  return id;
}

function ensureSignedIn<T = void>(status: string): ActionState<T> {
  return status === 'signed_in' ? { status: 'submitting' } : { status: 'error', error: FIXTURE_USER_REQUIRED };
}

function now() { return new Date().toISOString(); }

/** DEVELOPMENT_ONLY_FIXTURES: validated in the same shape as future RLS writes. */
function createFixtureSource() {
  return {
    async savePlace(id: string, slug?: string) {
      const result = wishlistItemSchema.safeParse({ placeId: mutationPlaceId(id), slug });
      if (!result.success) throw new Error('This fixture place does not have a valid mutation identity.');
    },
    async removePlace(id: string, slug?: string) {
      const result = wishlistItemSchema.safeParse({ placeId: mutationPlaceId(id), slug });
      if (!result.success) throw new Error('This fixture place does not have a valid mutation identity.');
    },
    async recordVisit(input: MobileVisitDraft): Promise<FixtureVisit> {
      const parsed = visitSchema.safeParse({ ...input, placeId: mutationPlaceId(input.placeId) });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Visit details are invalid.');
      return { ...input, id: `fixture-visit-${Date.now()}`, createdAt: now(), placeName: developmentDataSource.placeById(input.placeId)?.name };
    },
    async submitReview(input: MobileReviewDraft): Promise<FixtureReview> {
      const parsed = reviewSchema.safeParse({ ...input, placeId: mutationPlaceId(input.placeId) });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Review details are invalid.');
      return { ...input, id: `fixture-review-${Date.now()}`, moderationStatus: 'submitted', createdAt: now() };
    },
    async submitCorrection(input: MobileCorrectionDraft): Promise<FixtureCorrection> {
      const parsed = correctionSchema.safeParse({ ...input, entityId: mutationPlaceId(input.entityId) });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Correction details are invalid.');
      return { ...input, id: `fixture-correction-${Date.now()}`, status: 'submitted', createdAt: now() };
    },
  };
}

function createBlockedLiveSource() {
  const blocked = async () => { throw new Error(LIVE_WRITE_BLOCKED); };
  return { savePlace: blocked, removePlace: blocked, recordVisit: blocked, submitReview: blocked, submitCorrection: blocked };
}

const fixtureSource = createFixtureSource();
const blockedLiveSource = createBlockedLiveSource();

const seedVisits: FixtureVisit[] = [{ id: 'fixture-visit-seed-1', placeId: 'fountains-abbey', visitedOn: '2026-08-15', rating: 5, minutesSpent: 120, publicNote: 'A long walk through the abbey and designed landscape.', createdAt: '2026-08-15T14:00:00.000Z' }];
const seedReviews: FixtureReview[] = [{ id: 'fixture-review-seed-1', placeId: 'fountains-abbey', rating: 5, body: 'The nave opens up beautifully as the path turns toward the water.', moderationStatus: 'submitted', createdAt: '2026-08-15T15:00:00.000Z' }];
const seedCorrections: FixtureCorrection[] = [];

const BehaviourContext = createContext<MobileBehaviourContextValue | null>(null);

export function MobileBehaviourProvider({ children }: { children: ReactNode }) {
  const { state: session } = useMobileSession();
  const policy = getMobileRuntimePolicy();
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({});
  const [visitedOverrides, setVisitedOverrides] = useState<Record<string, boolean>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [visitingIds, setVisitingIds] = useState<Set<string>>(new Set());
  const [visits, setVisits] = useState<FixtureVisit[]>(seedVisits);
  const [reviews, setReviews] = useState<FixtureReview[]>(seedReviews);
  const [corrections, setCorrections] = useState<FixtureCorrection[]>(seedCorrections);
  const source = policy.fixtureAllowed ? fixtureSource : blockedLiveSource;

  const isSaved = useCallback((id: string, fallback = false) => savedOverrides[id] ?? fallback, [savedOverrides]);
  const isVisited = useCallback((id: string, fallback = false) => visitedOverrides[id] ?? fallback, [visitedOverrides]);
  const runSave = useCallback(async (id: string, fallback: boolean, next: boolean): Promise<ActionState> => {
    const signedIn = ensureSignedIn(session.status);
    if (signedIn.status === 'error') return signedIn;
    if (savingIds.has(id)) return { status: 'submitting' };
    setSavingIds((current) => new Set(current).add(id));
    try {
      if (next) await source.savePlace(id, id);
      else await source.removePlace(id, id);
      setSavedOverrides((current) => ({ ...current, [id]: next }));
      return { status: 'success' };
    } catch (error) {
      return actionError(error, 'Saved-place action failed.');
    } finally {
      setSavingIds((current) => { const nextSet = new Set(current); nextSet.delete(id); return nextSet; });
    }
  }, [savingIds, session.status, source]);

  const savePlace = useCallback((id: string, fallback = false) => runSave(id, fallback, true), [runSave]);
  const toggleSaved = useCallback((id: string, fallback = false) => runSave(id, fallback, !isSaved(id, fallback)), [isSaved, runSave]);
  const toggleVisited = useCallback(async (id: string, fallback = false): Promise<ActionState> => {
    const signedIn = ensureSignedIn(session.status);
    if (signedIn.status === 'error') return signedIn;
    if (visitingIds.has(id)) return { status: 'submitting' };
    setVisitingIds((current) => new Set(current).add(id));
    try {
      const next = !isVisited(id, fallback);
      if (next) {
        const visit = await source.recordVisit({ placeId: id, visitedOn: now().slice(0, 10) });
        setVisits((current) => [visit, ...current.filter((item) => item.placeId !== id)]);
      }
      setVisitedOverrides((current) => ({ ...current, [id]: next }));
      return { status: 'success' };
    } catch (error) {
      return actionError(error, 'Visit action failed.');
    } finally {
      setVisitingIds((current) => { const nextSet = new Set(current); nextSet.delete(id); return nextSet; });
    }
  }, [isVisited, session.status, source, visitingIds]);

  const recordVisit = useCallback(async (input: MobileVisitDraft): Promise<ActionState<FixtureVisit>> => {
    const signedIn = ensureSignedIn<FixtureVisit>(session.status);
    if (signedIn.status === 'error') return signedIn;
    try {
      const result = await source.recordVisit(input);
      setVisits((current) => [result, ...current.filter((visit) => visit.placeId !== input.placeId)]);
      setVisitedOverrides((current) => ({ ...current, [input.placeId]: true }));
      return { status: 'success', data: result };
    } catch (error) {
      return actionError(error, 'Visit details could not be saved.') as ActionState<FixtureVisit>;
    }
  }, [session.status, source]);

  const submitReview = useCallback(async (input: MobileReviewDraft): Promise<ActionState<FixtureReview>> => {
    const signedIn = ensureSignedIn<FixtureReview>(session.status);
    if (signedIn.status === 'error') return signedIn;
    try {
      const result = await source.submitReview(input);
      setReviews((current) => [result, ...current.filter((review) => review.placeId !== input.placeId)]);
      return { status: 'success', data: result };
    } catch (error) {
      return actionError(error, 'Review could not be submitted.') as ActionState<FixtureReview>;
    }
  }, [session.status, source]);

  const submitCorrection = useCallback(async (input: MobileCorrectionDraft): Promise<ActionState<FixtureCorrection>> => {
    const signedIn = ensureSignedIn<FixtureCorrection>(session.status);
    if (signedIn.status === 'error') return signedIn;
    try {
      const result = await source.submitCorrection(input);
      setCorrections((current) => [result, ...current]);
      return { status: 'success', data: result };
    } catch (error) {
      return actionError(error, 'Correction could not be submitted.') as ActionState<FixtureCorrection>;
    }
  }, [session.status, source]);

  const visibleVisits = policy.fixtureAllowed ? visits : [];
  const visibleReviews = policy.fixtureAllowed ? reviews : [];
  const visibleCorrections = policy.fixtureAllowed ? corrections : [];
  const savedPlaceIds = useMemo(() => policy.fixtureAllowed ? developmentDataSource.places.filter((place) => isSaved(place.id, place.saved)).map((place) => place.id) : [], [isSaved, policy.fixtureAllowed]);
  const value = useMemo<MobileBehaviourContextValue>(() => ({
    isSaved,
    isVisited,
    isSaving: (id) => savingIds.has(id),
    isVisiting: (id) => visitingIds.has(id),
    toggleSaved,
    toggleVisited,
    savePlace,
    recordVisit,
    submitReview,
    submitCorrection,
    visits: visibleVisits,
    reviews: visibleReviews,
    corrections: visibleCorrections,
    savedPlaceIds,
    reviewsForPlace: (placeId) => visibleReviews.filter((review) => review.placeId === placeId),
  }), [isSaved, isVisited, recordVisit, savePlace, savedPlaceIds, savingIds, submitCorrection, submitReview, toggleSaved, toggleVisited, visibleCorrections, visibleReviews, visibleVisits, visitingIds]);
  return <BehaviourContext.Provider value={value}>{children}</BehaviourContext.Provider>;
}

export function useMobileBehaviour(): MobileBehaviourContextValue {
  const value = useContext(BehaviourContext);
  if (!value) throw new Error('useMobileBehaviour must be used inside MobileBehaviourProvider');
  return value;
}

export { idleAction, mutationPlaceId };
