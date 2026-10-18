import Link from 'next/link';

export default function Forbidden() {
  return (
    <main className="center">
      <div className="card stack narrow">
        <h1>You don&apos;t have access to this page</h1>
        <p className="muted">Your account can&apos;t open this part of the LMS. If you think it should, ask the club admin.</p>
        <p>
          <Link className="btn primary" href="/">
            Go to your dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
