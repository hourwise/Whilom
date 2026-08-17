'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  correctionSchema,
  credentialsSchema,
  reviewSchema,
  signUpSchema,
  visitSchema,
  wishlistItemSchema,
} from '@whilom/validation';
import { createClient } from '@/lib/supabase/server';
import {
  failAction,
  formNumber,
  formText,
  issueFields,
  logMutationFailure,
  succeedAction,
} from '@/lib/action-result';

/**
 * Server actions for the web MVP.
 *
 * Three rules hold across every action here:
 *   1. `requireUser()` first — these are ordinary authenticated-user operations
 *      against the anon key, so RLS still applies and is never bypassed.
 *   2. Raw `FormData` is never trusted: it is parsed with the shared
 *      `@whilom/validation` schemas before any value reaches the database.
 *   3. Every Supabase result is inspected. A failed write redirects with an
 *      error code and does *not* revalidate, so a failure can never render as
 *      a success.
 */

/** Where a place-scoped form should return to. Falls back to the account page. */
function placePath(slug: string | undefined): string {
  return slug ? `/place/${slug}` : '/account';
}

// --- Auth -------------------------------------------------------------------

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formText(formData, 'email'),
    password: formText(formData, 'password'),
  });
  if (!parsed.success) failAction('/login', 'invalid_input', issueFields(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Auth messages are written for end users and carry no backend detail, so
  // they are surfaced as-is rather than flattened to a code.
  if (error) redirect('/login?error=' + encodeURIComponent(error.message));
  redirect('/account');
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: formText(formData, 'email'),
    password: formText(formData, 'password'),
    displayName: formText(formData, 'display_name'),
  });
  if (!parsed.success) failAction('/signup', 'invalid_input', issueFields(parsed.error));

  const { email, password, displayName } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) redirect('/signup?error=' + encodeURIComponent(error.message));
  redirect('/account');
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logMutationFailure('auth.signOut', error);
  // The local session cookie is cleared either way, so sign-out still completes
  // from the user's point of view; the server-side failure is logged above.
  redirect('/');
}

// --- Helpers ----------------------------------------------------------------

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// --- Wishlist ---------------------------------------------------------------

export async function addToWishlist(formData: FormData) {
  const slug = formText(formData, 'slug');
  const parsed = wishlistItemSchema.safeParse({
    placeId: formText(formData, 'place_id'),
    slug,
  });
  if (!parsed.success) failAction(placePath(slug), 'invalid_input', issueFields(parsed.error));

  const { supabase, user } = await requireUser();

  // Ensure the user has a default wishlist, then add the place. Each step is
  // checked so a failure here can't leave `wishlistId` undefined downstream.
  const existing = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('kind', 'wishlist')
    .maybeSingle();

  if (existing.error) {
    logMutationFailure('wishlists.select', existing.error);
    failAction(placePath(slug), 'save_failed');
  }

  let wishlistId = (existing.data as { id: string } | null)?.id;

  if (!wishlistId) {
    const created = await supabase
      .from('wishlists')
      .insert({ user_id: user.id, kind: 'wishlist', name: 'Wishlist' })
      .select('id')
      .single();

    if (created.error) {
      logMutationFailure('wishlists.insert', created.error);
      failAction(placePath(slug), 'save_failed');
    }
    wishlistId = (created.data as { id: string } | null)?.id;
  }

  if (!wishlistId) {
    logMutationFailure('wishlists.resolve', { message: 'no wishlist id after upsert' });
    failAction(placePath(slug), 'not_found');
  }

  const added = await supabase
    .from('wishlist_items')
    .upsert(
      { wishlist_id: wishlistId, place_id: parsed.data.placeId },
      { onConflict: 'wishlist_id,place_id' },
    );

  if (added.error) {
    logMutationFailure('wishlist_items.upsert', added.error);
    failAction(placePath(slug), 'save_failed');
  }

  if (slug) revalidatePath(`/place/${slug}`);
  revalidatePath('/account');
}

export async function removeFromWishlist(formData: FormData) {
  const parsed = wishlistItemSchema.safeParse({
    placeId: formText(formData, 'place_id'),
    slug: formText(formData, 'slug'),
  });
  if (!parsed.success) failAction('/account', 'invalid_input', issueFields(parsed.error));

  const { supabase, user } = await requireUser();

  const lists = await supabase.from('wishlists').select('id').eq('user_id', user.id);
  if (lists.error) {
    logMutationFailure('wishlists.select', lists.error);
    failAction('/account', 'save_failed');
  }

  const ids = ((lists.data ?? []) as { id: string }[]).map((w) => w.id);
  if (ids.length) {
    const removed = await supabase
      .from('wishlist_items')
      .delete()
      .eq('place_id', parsed.data.placeId)
      .in('wishlist_id', ids);

    if (removed.error) {
      logMutationFailure('wishlist_items.delete', removed.error);
      failAction('/account', 'save_failed');
    }
  }

  if (parsed.data.slug) revalidatePath(`/place/${parsed.data.slug}`);
  revalidatePath('/account');
}

// --- Visits -----------------------------------------------------------------

export async function recordVisit(formData: FormData) {
  const slug = formText(formData, 'slug');
  const parsed = visitSchema.safeParse({
    placeId: formText(formData, 'place_id'),
    visitedOn: formText(formData, 'visited_on'),
    rating: formNumber(formData, 'rating'),
    minutesSpent: formNumber(formData, 'minutes_spent'),
    publicNote: formText(formData, 'public_note'),
  });
  if (!parsed.success) failAction(placePath(slug), 'invalid_input', issueFields(parsed.error));

  const { supabase, user } = await requireUser();
  const { placeId, visitedOn, rating, minutesSpent, publicNote } = parsed.data;

  const { error } = await supabase.from('visits').insert({
    user_id: user.id,
    place_id: placeId,
    visited_on: visitedOn ?? null,
    rating: rating ?? null,
    minutes_spent: minutesSpent ?? null,
    public_note: publicNote ?? null,
  });

  if (error) {
    logMutationFailure('visits.insert', error);
    failAction(placePath(slug), 'save_failed');
  }

  if (slug) revalidatePath(`/place/${slug}`);
  revalidatePath('/account');
  succeedAction(placePath(slug), 'visit_recorded');
}

// --- Reviews ----------------------------------------------------------------

export async function submitReview(formData: FormData) {
  const slug = formText(formData, 'slug');
  const parsed = reviewSchema.safeParse({
    placeId: formText(formData, 'place_id'),
    rating: formNumber(formData, 'rating'),
    body: formText(formData, 'body'),
  });
  if (!parsed.success) failAction(placePath(slug), 'invalid_input', issueFields(parsed.error));

  const { supabase, user } = await requireUser();

  const { error } = await supabase.from('reviews').upsert(
    {
      place_id: parsed.data.placeId,
      user_id: user.id,
      rating: parsed.data.rating,
      body: parsed.data.body ?? null,
      moderation_status: 'submitted',
    },
    { onConflict: 'place_id,user_id' },
  );

  if (error) {
    logMutationFailure('reviews.upsert', error);
    failAction(placePath(slug), 'save_failed');
  }

  if (slug) revalidatePath(`/place/${slug}`);
  succeedAction(placePath(slug), 'review_submitted');
}

// --- Corrections ------------------------------------------------------------

export async function submitCorrection(formData: FormData) {
  const slug = formText(formData, 'slug');
  const parsed = correctionSchema.safeParse({
    entityType: formText(formData, 'entity_type'),
    entityId: formText(formData, 'entity_id'),
    field: formText(formData, 'field'),
    suggestedValue: formText(formData, 'suggested_value'),
    note: formText(formData, 'note'),
  });
  if (!parsed.success) failAction(placePath(slug), 'invalid_input', issueFields(parsed.error));

  const { supabase, user } = await requireUser();
  const { entityType, entityId, field, suggestedValue, note } = parsed.data;

  const { error } = await supabase.from('corrections').insert({
    user_id: user.id,
    entity_type: entityType,
    entity_id: entityId,
    field: field ?? null,
    suggested_value: suggestedValue ?? null,
    note: note ?? null,
    status: 'submitted',
  });

  if (error) {
    logMutationFailure('corrections.insert', error);
    failAction(placePath(slug), 'save_failed');
  }

  if (slug) revalidatePath(`/place/${slug}`);
  succeedAction(placePath(slug), 'correction_submitted');
}
