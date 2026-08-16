import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="stack">
      <h1>Not found</h1>
      <p className="muted">That page or place doesn’t exist.</p>
      <p>
        <Link className="btn" href="/discover">
          Back to discovery
        </Link>
      </p>
    </div>
  );
}
