import { redirect } from 'next/navigation';

/**
 * One mutation-error strategy for every server action, so no action invents its
 * own behaviour and none can present a failed write as a success.
 *
 * The forms in the web MVP are plain server-rendered `<form action={fn}>`
 * elements with no client state, so the channel back to the user is the one
 * already established by `signIn`/`signUp`: redirect to the originating page
 * with a stable `?error=` code that the page renders via `<ActionNotice />`.
 *
 * Two rules the codes exist to enforce:
 *   - a validation failure and a database failure are never conflated, because
 *     one is the user's to fix and the other is not;
 *   - the raw Supabase/Postgres message never reaches the browser. It is logged
 *     server-side with the operation name so it stays diagnosable.
 */

export const ACTION_ERRORS = {
  /** Submitted values failed the shared @whilom/validation schema. */
  invalid_input: 'Some details were not valid. Check the form and try again.',
  /** The write reached the database and was refused or failed. */
  save_failed: 'We could not save that just now. Please try again.',
  /** The row the mutation depends on could not be read back. */
  not_found: 'We could not find that record.',
} as const;

export type ActionErrorCode = keyof typeof ACTION_ERRORS;

export function isActionErrorCode(value: unknown): value is ActionErrorCode {
  return typeof value === 'string' && value in ACTION_ERRORS;
}

/** Human-readable message for a code, or null when the code is unrecognised. */
export function actionErrorMessage(code: unknown): string | null {
  return isActionErrorCode(code) ? ACTION_ERRORS[code] : null;
}

/**
 * Abandon the action and send the user back to `basePath` with an error code.
 * Never returns — `redirect()` throws — so callers cannot fall through into a
 * `revalidatePath()` on a failed write.
 *
 * `fields` names the offending inputs (validation only). Field *names* are safe
 * to echo; submitted values and backend detail are not, and are never included.
 */
export function failAction(
  basePath: string,
  code: ActionErrorCode,
  fields?: readonly string[],
): never {
  const params = new URLSearchParams({ error: code });
  if (fields?.length) params.set('fields', fields.join(','));
  redirect(`${basePath}?${params.toString()}`);
}

/** Send the user back to `basePath` with a success flag for the same notice UI. */
export function succeedAction(basePath: string, done: string): never {
  redirect(`${basePath}?${new URLSearchParams({ done }).toString()}`);
}

/**
 * Record a failed write server-side. The Supabase error is preserved here in
 * full (code + message) precisely because it is not sent to the client.
 */
export function logMutationFailure(
  operation: string,
  error: { code?: string; message?: string } | null,
): void {
  console.error(
    `[whilom] mutation failed: ${operation}`,
    error?.code ? `code=${error.code}` : '',
    error?.message ?? '',
  );
}

// --- FormData readers --------------------------------------------------------
// FormData is untrusted input: every value arrives as a string (or a File).
// These readers normalise it into the plain shape a Zod schema expects without
// coercing bad input into a plausible-looking value.

/** Trimmed string, or undefined when absent/blank/not a string. */
export function formText(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Numeric field, or undefined when absent. Unparseable input yields `NaN` on
 * purpose: the schema then rejects it, rather than the field being silently
 * dropped and the write succeeding with a missing value.
 */
export function formNumber(form: FormData, key: string): number | undefined {
  const raw = formText(form, key);
  return raw === undefined ? undefined : Number(raw);
}

/**
 * The failing field paths from a Zod error, for the `fields=` hint. Typed
 * structurally so the web app doesn't need a direct `zod` dependency — the
 * schemas themselves live in `@whilom/validation`.
 */
export function issueFields(error: {
  issues: readonly { path: readonly (string | number)[] }[];
}): string[] {
  return [...new Set(error.issues.map((i) => i.path.join('.') || 'form'))];
}
