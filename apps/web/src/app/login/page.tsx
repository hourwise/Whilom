import Link from 'next/link';
import { signIn } from '@/lib/actions';
import { ActionNotice } from '@/components/ActionNotice';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fields?: string }>;
}) {
  const { error, fields } = await searchParams;

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <h1>Sign in</h1>
      <ActionNotice error={error} fields={fields} allowRawMessage />
      <form action={signIn} className="stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button type="submit">Sign in</button>
      </form>
      <p className="muted">
        No account? <Link href="/signup">Create one</Link>.
      </p>
    </div>
  );
}
