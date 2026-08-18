import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/actions';

export const metadata: Metadata = {
  title: {
    default: 'Whilom',
    template: '%s · Whilom',
  },
  description:
    'Whilom — History, where it happened. Discover UK heritage: places connected to people, stories, objects and journeys.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en-GB">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              Whilom
              <small>History, where it happened.</small>
            </Link>
            <nav className="nav">
              <Link href="/explore">Explore</Link>
              <Link href="/discover">Browse</Link>
              {user ? (
                <>
                  <Link href="/account">Account</Link>
                  <form action={signOut} style={{ display: 'inline' }}>
                    <button className="secondary" style={{ padding: '0.2rem 0.6rem' }}>
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
