import Link from 'next/link';
import { signUp } from '@/lib/actions';
import { ActionNotice } from '@/components/ActionNotice';

export const metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fields?: string }>;
}) {
  const { error, fields } = await searchParams;

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <h1>Create account</h1>
      <ActionNotice error={error} fields={fields} allowRawMessage />
      <form action={signUp} className="stack">
        <div className="field">
          <label htmlFor="display_name">Display name</label>
          <input id="display_name" name="display_name" required minLength={2} autoComplete="nickname" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <button type="submit">Create account</button>
      </form>
      <p className="muted">
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}
