import Link from 'next/link';
import { signUp } from '@/lib/actions';

export const metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <h1>Create account</h1>
      {error && <p className="error">{error}</p>}
      <form action={signUp} className="stack">
        <div className="field">
          <label htmlFor="display_name">Display name</label>
          <input id="display_name" name="display_name" autoComplete="nickname" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" />
        </div>
        <button type="submit">Create account</button>
      </form>
      <p className="muted">
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}
