import { actionErrorMessage } from '@/lib/action-result';

/**
 * Renders the outcome a server action redirected back with. Without this the
 * hardened actions would still be silent to the user — a failed write would
 * simply look like nothing happened, which is the behaviour the mutation
 * hardening exists to remove.
 */

const DONE_MESSAGES: Record<string, string> = {
  visit_recorded: 'Visit recorded.',
  review_submitted: 'Review submitted — it will appear once moderated.',
  correction_submitted: 'Thank you — your correction has been sent for review.',
};

export function ActionNotice({
  error,
  fields,
  done,
  /**
   * Render an unrecognised `error` value as-is. Only the auth pages set this:
   * Supabase Auth messages are already written for end users, so they are
   * passed through rather than flattened to a code. Everywhere else an
   * unknown code renders nothing, so no backend string can leak into the page.
   */
  allowRawMessage = false,
}: {
  error?: string;
  fields?: string;
  done?: string;
  allowRawMessage?: boolean;
}) {
  const message = actionErrorMessage(error) ?? (allowRawMessage ? error : null);

  if (message) {
    const named = fields
      ?.split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    return (
      <p className="error" role="alert">
        {message}
        {named?.length ? ` (${named.join(', ')})` : ''}
      </p>
    );
  }

  const success = done ? DONE_MESSAGES[done] : undefined;
  if (success) {
    return (
      <p className="muted" role="status">
        {success}
      </p>
    );
  }

  return null;
}
