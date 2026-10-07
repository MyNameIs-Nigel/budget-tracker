export default function Loading({ label }: { label: string }) {
  return (
    <main id="main" className="loading">
      <h1 className="sr-only">Budget Tracker</h1>
      <p role="status">{label}</p>
    </main>
  );
}
