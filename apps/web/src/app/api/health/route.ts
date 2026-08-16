import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness probe. Extend to ping Supabase once connectivity is configured. */
export function GET() {
  return NextResponse.json({ status: 'ok', app: 'web', ts: new Date().toISOString() });
}
