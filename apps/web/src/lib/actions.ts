'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// --- Auth -------------------------------------------------------------------

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=' + encodeURIComponent(error.message));
  redirect('/account');
}

export async function signUp(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '');
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
  await supabase.auth.signOut();
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
  const placeId = String(formData.get('place_id') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const { supabase, user } = await requireUser();

  // Ensure the user has a default wishlist, then add the place.
  let { data: wishlist } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('kind', 'wishlist')
    .maybeSingle();

  if (!wishlist) {
    const { data: created } = await supabase
      .from('wishlists')
      .insert({ user_id: user.id, kind: 'wishlist', name: 'Wishlist' })
      .select('id')
      .single();
    wishlist = created;
  }

  await supabase
    .from('wishlist_items')
    .upsert({ wishlist_id: wishlist!.id, place_id: placeId }, { onConflict: 'wishlist_id,place_id' });

  revalidatePath(`/place/${slug}`);
  revalidatePath('/account');
}

export async function removeFromWishlist(formData: FormData) {
  const placeId = String(formData.get('place_id') ?? '');
  const { supabase, user } = await requireUser();
  const { data: wishlists } = await supabase.from('wishlists').select('id').eq('user_id', user.id);
  const ids = ((wishlists ?? []) as { id: string }[]).map((w) => w.id);
  if (ids.length) {
    await supabase.from('wishlist_items').delete().eq('place_id', placeId).in('wishlist_id', ids);
  }
  revalidatePath('/account');
}

// --- Visits -----------------------------------------------------------------

export async function recordVisit(formData: FormData) {
  const placeId = String(formData.get('place_id') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const { supabase, user } = await requireUser();

  const ratingRaw = formData.get('rating');
  const minutesRaw = formData.get('minutes_spent');
  await supabase.from('visits').insert({
    user_id: user.id,
    place_id: placeId,
    visited_on: (formData.get('visited_on') as string) || null,
    rating: ratingRaw ? Number(ratingRaw) : null,
    minutes_spent: minutesRaw ? Number(minutesRaw) : null,
    public_note: (formData.get('public_note') as string) || null,
  });

  revalidatePath(`/place/${slug}`);
  revalidatePath('/account');
}

// --- Reviews ----------------------------------------------------------------

export async function submitReview(formData: FormData) {
  const placeId = String(formData.get('place_id') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const { supabase, user } = await requireUser();

  await supabase.from('reviews').upsert(
    {
      place_id: placeId,
      user_id: user.id,
      rating: Number(formData.get('rating') ?? 3),
      body: (formData.get('body') as string) || null,
      moderation_status: 'submitted',
    },
    { onConflict: 'place_id,user_id' },
  );

  revalidatePath(`/place/${slug}`);
}

// --- Corrections ------------------------------------------------------------

export async function submitCorrection(formData: FormData) {
  const slug = String(formData.get('slug') ?? '');
  const { supabase, user } = await requireUser();

  await supabase.from('corrections').insert({
    user_id: user.id,
    entity_type: String(formData.get('entity_type') ?? 'place'),
    entity_id: String(formData.get('entity_id') ?? ''),
    field: (formData.get('field') as string) || null,
    suggested_value: (formData.get('suggested_value') as string) || null,
    note: (formData.get('note') as string) || null,
    status: 'submitted',
  });

  revalidatePath(`/place/${slug}`);
}
