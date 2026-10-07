"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="pending-page">
      <h1>Couldn’t open your budget.</h1>
      <p className="muted">
        Your saved data is still in place. Check your connection and try again.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
