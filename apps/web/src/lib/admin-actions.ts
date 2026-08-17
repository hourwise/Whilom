'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/admin';
import { failAction, formText, logMutationFailure, succeedAction } from '@/lib/action-result';
import { isConflictResolution, isReviewDecision } from '@/lib/review';
import { isMediaDecision } from '@/lib/media';

/**
 * Review workbench mutations.
 *
 * Every one of these calls a governed database function. None writes a
 * canonical table, an import candidate or a conflict row directly — the UI is
 * not an authority, it is a caller. `requireEditor()` here is a convenience
 * that fails fast with a useful message; the real enforcement is the
 * `is_editor()` check inside each `SECURITY DEFINER` function, which holds
 * whatever the client does.
 */

function candidatePath(candidateId: string): string {
  return `/admin/imports/${candidateId}`;
}

/** Record a reviewer decision (approve / reject / defer). */
export async function reviewCandidate(formData: FormData) {
  await requireEditor();

  const candidateId = formText(formData, 'candidate_id');
  const decision = formText(formData, 'decision');
  const note = formText(formData, 'note');

  if (!candidateId) failAction('/admin/imports', 'invalid_input', ['candidate_id']);
  if (!isReviewDecision(decision)) {
    failAction(candidatePath(candidateId), 'invalid_input', ['decision']);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('review_import_candidate', {
    p_candidate_id: candidateId,
    p_decision: decision,
    p_note: note ?? undefined,
  });

  if (error) {
    logMutationFailure('review_import_candidate', error);
    failAction(candidatePath(candidateId), 'save_failed');
  }

  revalidatePath('/admin/imports');
  revalidatePath(candidatePath(candidateId));
  succeedAction(candidatePath(candidateId), 'review_recorded');
}

/** Resolve one field-level disagreement. */
export async function resolveConflict(formData: FormData) {
  await requireEditor();

  const candidateId = formText(formData, 'candidate_id');
  const conflictId = formText(formData, 'conflict_id');
  const outcome = formText(formData, 'outcome');
  const note = formText(formData, 'note');

  if (!candidateId || !conflictId) failAction('/admin/imports', 'invalid_input', ['conflict_id']);
  if (!isConflictResolution(outcome)) {
    failAction(candidatePath(candidateId), 'invalid_input', ['outcome']);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_import_conflict', {
    p_conflict_id: conflictId,
    p_outcome: outcome,
    p_note: note ?? undefined,
  });

  if (error) {
    logMutationFailure('resolve_import_conflict', error);
    failAction(candidatePath(candidateId), 'save_failed');
  }

  revalidatePath(candidatePath(candidateId));
  succeedAction(candidatePath(candidateId), 'conflict_resolved');
}

/**
 * Record a media review decision, optionally correcting the subject.
 *
 * Note what is NOT a parameter: creator and licence. A reviewer may say what an
 * image shows; they may not invent who made it or under what terms.
 */
export async function reviewMedia(formData: FormData) {
  await requireEditor();

  const candidateId = formText(formData, 'candidate_id');
  const decision = formText(formData, 'decision');
  const entityId = formText(formData, 'entity_id');
  const note = formText(formData, 'note');

  if (!candidateId) failAction('/admin/imports/media', 'invalid_input', ['candidate_id']);
  if (!isMediaDecision(decision)) {
    failAction('/admin/imports/media', 'invalid_input', ['decision']);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('review_media_candidate', {
    p_candidate_id: candidateId,
    p_decision: decision,
    p_entity_id: entityId ?? undefined,
    p_note: note ?? undefined,
  });

  if (error) {
    logMutationFailure('review_media_candidate', error);
    failAction('/admin/imports/media', 'save_failed');
  }

  revalidatePath('/admin/imports/media');
  succeedAction('/admin/imports/media', 'media_reviewed');
}

/**
 * Publish imported media. The rights gate lives in the database: this call
 * fails if the file is not rights-ready, and that failure is reported as a
 * failure. There is no bypass parameter because there is no bypass.
 */
export async function publishMedia(formData: FormData) {
  await requireEditor();

  const candidateId = formText(formData, 'candidate_id');
  const note = formText(formData, 'note');
  if (!candidateId) failAction('/admin/imports/media', 'invalid_input', ['candidate_id']);

  const supabase = await createClient();
  const { error } = await supabase.rpc('publish_media_candidate', {
    p_candidate_id: candidateId,
    p_note: note ?? undefined,
  });

  if (error) {
    logMutationFailure('publish_media_candidate', error);
    failAction('/admin/imports/media', 'save_failed');
  }

  revalidatePath('/admin/imports/media');
  succeedAction('/admin/imports/media', 'media_published');
}

/**
 * Publish. Calls the governed transaction and reports what it actually did —
 * a failed publish is never presented as success.
 */
export async function publishCandidate(formData: FormData) {
  await requireEditor();

  const candidateId = formText(formData, 'candidate_id');
  const note = formText(formData, 'note');
  if (!candidateId) failAction('/admin/imports', 'invalid_input', ['candidate_id']);

  const supabase = await createClient();
  const { error } = await supabase.rpc('publish_import_candidate', {
    p_candidate_id: candidateId,
    p_note: note ?? undefined,
  });

  if (error) {
    // The engine refuses for good reasons — unresolved conflicts, wrong state,
    // insufficient authority. The reviewer is told it did not happen.
    logMutationFailure('publish_import_candidate', error);
    failAction(candidatePath(candidateId), 'save_failed');
  }

  revalidatePath('/admin/imports');
  revalidatePath(candidatePath(candidateId));
  succeedAction(candidatePath(candidateId), 'published');
}
